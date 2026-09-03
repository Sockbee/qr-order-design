package com.caucse.qrorder.domain;

import com.caucse.qrorder.api.ApiEnvelope;
import com.caucse.qrorder.api.ApiException;
import com.caucse.qrorder.auth.StaffPrincipal;
import com.caucse.qrorder.auth.StaffTokenService;
import com.caucse.qrorder.config.QrOrderProperties;
import com.caucse.qrorder.sse.DomainEventService;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class AdminService {
    private final JdbcTemplate jdbc;
    private final TableCatalogService catalog;
    private final QrOrderProperties properties;
    private final DomainEventService events;
    private final SecureRandom random = new SecureRandom();

    public AdminService(JdbcTemplate jdbc, TableCatalogService catalog, QrOrderProperties properties, DomainEventService events) {
        this.jdbc = jdbc; this.catalog = catalog; this.properties = properties; this.events = events;
    }

    public Map<String, Object> snapshot() {
        List<Map<String, Object>> tables = jdbc.query("SELECT table_id,display_name,token_version,active,sort_order,updated_at FROM tables ORDER BY sort_order,table_id",
                (rs, index) -> ApiEnvelope.map("tableId", rs.getString(1), "displayName", rs.getString(2),
                        "tokenVersion", rs.getInt(3), "active", rs.getBoolean(4), "sortOrder", rs.getInt(5),
                        "updatedAt", rs.getObject(6, OffsetDateTime.class).toInstant().toString()));
        List<Map<String, Object>> categories = jdbc.query("SELECT category_id,label,heading,sort_order,active FROM categories ORDER BY sort_order,category_id",
                (rs, index) -> ApiEnvelope.map("categoryId", rs.getString(1), "label", rs.getString(2), "heading", rs.getString(3), "sortOrder", rs.getInt(4), "active", rs.getBoolean(5)));
        List<Map<String, Object>> menus = jdbc.query("SELECT menu_id,category_id,name,description,base_price,image_url,available,min_quantity,max_quantity,origin,sort_order FROM menus ORDER BY sort_order,menu_id",
                (rs, index) -> ApiEnvelope.map("menuId", rs.getString(1), "categoryId", rs.getString(2), "name", rs.getString(3),
                        "description", rs.getString(4), "basePrice", rs.getInt(5), "imageUrl", rs.getString(6), "available", rs.getBoolean(7),
                        "minQuantity", rs.getInt(8), "maxQuantity", rs.getInt(9), "origin", rs.getString(10), "sortOrder", rs.getInt(11)));
        List<Map<String, Object>> settings = jdbc.query("SELECT key,value,type,description FROM settings ORDER BY key",
                (rs, index) -> ApiEnvelope.map("key", rs.getString(1), "value", rs.getString(2), "type", rs.getString(3), "description", rs.getString(4)));
        return ApiEnvelope.map("tables", tables, "categories", categories, "menus", menus, "settings", settings,
                "catalog", catalog.menuUnchecked());
    }

    @Transactional
    public Void saveCategory(String id, Map<String, Object> body, StaffPrincipal staff) {
        validateId(id);
        jdbc.update("""
                INSERT INTO categories(category_id,label,heading,sort_order,active,updated_at) VALUES(?,?,?,?,?,now())
                ON CONFLICT(category_id) DO UPDATE SET label=excluded.label,heading=excluded.heading,
                  sort_order=excluded.sort_order,active=excluded.active,updated_at=now()
                """, id, required(body, "label"), required(body, "heading"), number(body, "sortOrder", 0), bool(body, "active", true));
        changed(staff, "CATEGORY_SAVED", "CATEGORY", id, "catalog.updated"); return null;
    }

    @Transactional
    public Void saveMenu(String id, Map<String, Object> body, StaffPrincipal staff) {
        validateId(id);
        int min = number(body, "minQuantity", 1), max = number(body, "maxQuantity", 10), price = number(body, "basePrice", -1);
        if (price < 0 || min < 1 || max < min) throw ApiException.invalid("가격과 수량 범위를 확인해 주세요.");
        String imageUrl = nullable(body.get("imageUrl"));
        if (imageUrl != null) {
            try {
                java.net.URI uri = java.net.URI.create(imageUrl);
                if (imageUrl.length() > 2048 || !Set.of("http", "https").contains(uri.getScheme()) || uri.getHost() == null) {
                    throw ApiException.invalid("이미지 URL을 확인해 주세요.");
                }
            } catch (IllegalArgumentException error) {
                throw ApiException.invalid("이미지 URL을 확인해 주세요.");
            }
        }
        jdbc.update("""
                INSERT INTO menus(menu_id,category_id,name,description,base_price,image_url,available,min_quantity,max_quantity,origin,sort_order,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,now())
                ON CONFLICT(menu_id) DO UPDATE SET category_id=excluded.category_id,name=excluded.name,
                  description=excluded.description,base_price=excluded.base_price,image_url=excluded.image_url,
                  available=excluded.available,min_quantity=excluded.min_quantity,max_quantity=excluded.max_quantity,
                  origin=excluded.origin,sort_order=excluded.sort_order,updated_at=now()
                """, id, required(body, "categoryId"), required(body, "name"), String.valueOf(body.getOrDefault("description", "")),
                price, imageUrl, bool(body, "available", true), min, max,
                nullable(body.get("origin")), number(body, "sortOrder", 0));
        changed(staff, "MENU_SAVED", "MENU", id, "menu.updated"); return null;
    }

    @Transactional
    public Void saveOptionGroup(String id, Map<String, Object> body, StaffPrincipal staff) {
        validateId(id); String type = required(body, "selectionType").toUpperCase();
        if (!Set.of("SINGLE", "MULTIPLE").contains(type)) throw ApiException.invalid("옵션 선택 방식을 확인해 주세요.");
        int min = number(body, "minSelections", 0);
        int max = number(body, "maxSelections", 1);
        boolean required = bool(body, "required", false);
        if (min < 0 || max < min || ("SINGLE".equals(type) && max > 1) || (required && min < 1)) {
            throw ApiException.invalid("옵션 선택 개수를 확인해 주세요.");
        }
        jdbc.update("""
                INSERT INTO option_groups(option_group_id,menu_id,label,selection_type,required,min_select,max_select,sort_order,active,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,now()) ON CONFLICT(option_group_id) DO UPDATE SET menu_id=excluded.menu_id,label=excluded.label,
                 selection_type=excluded.selection_type,required=excluded.required,min_select=excluded.min_select,max_select=excluded.max_select,
                 sort_order=excluded.sort_order,active=excluded.active,updated_at=now()
                """, id, required(body, "menuId"), required(body, "label"), type, required,
                min, max, number(body, "sortOrder", 0), bool(body, "active", true));
        changed(staff, "OPTION_GROUP_SAVED", "OPTION_GROUP", id, "catalog.updated"); return null;
    }

    @Transactional
    public Void saveOption(String id, Map<String, Object> body, StaffPrincipal staff) {
        validateId(id);
        jdbc.update("""
                INSERT INTO options(option_id,option_group_id,menu_id,name,price_delta,available,default_selected,sort_order,updated_at)
                VALUES(?,?,?,?,?,?,?,?,now()) ON CONFLICT(option_id) DO UPDATE SET option_group_id=excluded.option_group_id,
                 menu_id=excluded.menu_id,name=excluded.name,price_delta=excluded.price_delta,available=excluded.available,
                 default_selected=excluded.default_selected,sort_order=excluded.sort_order,updated_at=now()
                """, id, required(body, "optionGroupId"), required(body, "menuId"), required(body, "name"),
                number(body, "priceDelta", 0), bool(body, "available", true), bool(body, "defaultSelected", false), number(body, "sortOrder", 0));
        changed(staff, "OPTION_SAVED", "OPTION", id, "catalog.updated"); return null;
    }

    @Transactional
    public Void saveSetting(String key, String value, StaffPrincipal staff) {
        if (!Set.of("STORE_NAME", "EVENT_OPEN", "NOTICE", "ORDER_PREFIX", "STATUS_POLL_SECONDS",
                "CALL_MIN_INTERVAL_SECONDS", "STAFF_TOKEN_EPOCH", "STAFF_SESSION_HOURS", "TABLE_DISCOUNT_RATE").contains(key)) {
            throw ApiException.invalid("변경할 수 없는 설정입니다.");
        }
        if ("EVENT_OPEN".equals(key) && !Set.of("true", "false").contains(value.toLowerCase())) {
            throw ApiException.invalid("영업 상태는 true 또는 false여야 합니다.");
        }
        if (Set.of("STATUS_POLL_SECONDS", "CALL_MIN_INTERVAL_SECONDS", "STAFF_TOKEN_EPOCH",
                "STAFF_SESSION_HOURS", "TABLE_DISCOUNT_RATE").contains(key)) {
            int numeric;
            try { numeric = Integer.parseInt(value); }
            catch (NumberFormatException error) { throw ApiException.invalid("설정 값은 정수여야 합니다."); }
            if (numeric < 0 || ("TABLE_DISCOUNT_RATE".equals(key) && numeric > 100)
                    || (Set.of("STATUS_POLL_SECONDS", "STAFF_TOKEN_EPOCH", "STAFF_SESSION_HOURS").contains(key) && numeric < 1)) {
                throw ApiException.invalid("설정 값의 범위를 확인해 주세요.");
            }
        }
        int updated = jdbc.update("UPDATE settings SET value=?,updated_at=now() WHERE key=?", value, key);
        if (updated == 0) throw ApiException.notFound("SETTING_NOT_FOUND", "설정을 찾을 수 없습니다.");
        changed(staff, "SETTING_CHANGED", "SETTING", key, "settings.updated"); return null;
    }

    @Transactional
    public Void saveTable(String tableId, Map<String, Object> body, StaffPrincipal staff) {
        if (!tableId.matches("^T[0-9]{2,}$")) throw ApiException.invalid("테이블 ID를 확인해 주세요.");
        int updated = jdbc.update("UPDATE tables SET display_name=?,active=?,sort_order=?,updated_at=now() WHERE table_id=?",
                required(body, "displayName"), bool(body, "active", true), number(body, "sortOrder", 0), tableId);
        if (updated == 0) throw ApiException.notFound("TABLE_NOT_FOUND", "테이블을 찾을 수 없습니다.");
        changed(staff, "TABLE_SAVED", "TABLE", tableId, "table.updated"); return null;
    }

    @Transactional
    public Map<String, Object> createTable(String tableId, Map<String, Object> body, StaffPrincipal staff) {
        if (!tableId.matches("^T[0-9]{2,}$")) throw ApiException.invalid("테이블 ID를 확인해 주세요.");
        String token = newToken();
        jdbc.update("INSERT INTO tables(table_id,display_name,token_hash,token_version,active,sort_order) VALUES(?,?,?,1,true,?)",
                tableId, required(body, "displayName"), hashToken(token), number(body, "sortOrder", 0));
        changed(staff, "TABLE_CREATED", "TABLE", tableId, "table.updated");
        return tokenResponse(tableId, token);
    }

    @Transactional
    public Map<String, Object> rotateTable(String tableId, StaffPrincipal staff) {
        String token = newToken();
        int updated = jdbc.update("UPDATE tables SET token_hash=?,token_version=token_version+1,updated_at=now() WHERE table_id=?",
                hashToken(token), tableId);
        if (updated == 0) throw ApiException.notFound("TABLE_NOT_FOUND", "테이블을 찾을 수 없습니다.");
        changed(staff, "TABLE_TOKEN_ROTATED", "TABLE", tableId, "table.updated");
        return tokenResponse(tableId, token);
    }

    @Transactional
    public Map<String, Object> importTables(String csv, StaffPrincipal staff) {
        Integer activity = jdbc.queryForObject("SELECT (SELECT count(*) FROM orders)+(SELECT count(*) FROM calls)+(SELECT count(*) FROM table_sessions)", Integer.class);
        if (activity != null && activity > 0) throw ApiException.conflict("IMPORT_NOT_EMPTY", "운영 데이터가 있어 테이블을 가져올 수 없습니다.");
        int count = 0;
        Set<String> seenIds = new java.util.HashSet<>();
        Set<String> seenHashes = new java.util.HashSet<>();
        for (String rawLine : csv.split("\\R")) {
            String line = rawLine.trim();
            if (line.isEmpty() || line.toLowerCase().startsWith("table_id,")) continue;
            String[] fields = line.split(",", -1);
            if (fields.length < 6) throw ApiException.invalid("Tables CSV 열을 확인해 주세요.");
            String id = fields[0].trim(), name = fields[1].trim(), hash = fields[2].trim().toLowerCase();
            if (!id.matches("^T[0-9]{2,}$") || name.isBlank() || !hash.matches("^[0-9a-f]{64}$")
                    || !seenIds.add(id) || !seenHashes.add(hash)) {
                throw ApiException.invalid("Tables CSV의 ID 또는 token hash를 확인해 주세요.");
            }
            Boolean hashUsed = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM tables WHERE token_hash=? AND table_id<>?)", Boolean.class, hash, id);
            if (Boolean.TRUE.equals(hashUsed)) throw ApiException.invalid("중복된 table token hash가 있습니다.");
            int tokenVersion;
            int sortOrder;
            try {
                tokenVersion = Integer.parseInt(fields[3].trim());
                sortOrder = Integer.parseInt(fields[5].trim());
            } catch (NumberFormatException error) {
                throw ApiException.invalid("Tables CSV의 숫자 열을 확인해 주세요.");
            }
            String activeText = fields[4].trim().toLowerCase();
            if (tokenVersion < 1 || sortOrder < 0 || !Set.of("true", "false").contains(activeText)) {
                throw ApiException.invalid("Tables CSV의 version, active, sort order를 확인해 주세요.");
            }
            jdbc.update("""
                    INSERT INTO tables(table_id,display_name,token_hash,token_version,active,sort_order)
                    VALUES(?,?,?,?,?,?) ON CONFLICT(table_id) DO UPDATE SET display_name=excluded.display_name,
                      token_hash=excluded.token_hash,token_version=excluded.token_version,active=excluded.active,sort_order=excluded.sort_order,updated_at=now()
                    """, id, name, hash, tokenVersion, Boolean.parseBoolean(activeText), sortOrder);
            count++;
        }
        changed(staff, "TABLES_IMPORTED", "TABLE", "bulk", "table.updated");
        return Map.of("importedCount", count);
    }

    @Transactional
    public Map<String, Object> importStaffMembers(String csv, StaffPrincipal staff) {
        int count = 0;
        Set<String> seenIds = new java.util.HashSet<>();
        for (String rawLine : csv.split("\\R")) {
            String line = rawLine.strip().replaceFirst("^\\uFEFF", "");
            if (line.isEmpty() || line.toLowerCase().startsWith("staff_id,")) continue;
            String[] fields = line.split(",", -1);
            if (fields.length != 5) throw ApiException.invalid("스태프 CSV 열을 확인해 주세요.");

            String id = fields[0].trim();
            String name = fields[1].trim();
            String affiliation = fields[2].trim();
            String activeText = fields[3].trim().toLowerCase();
            int sortOrder;
            try {
                sortOrder = Integer.parseInt(fields[4].trim());
            } catch (NumberFormatException error) {
                throw ApiException.invalid("스태프 CSV의 sort_order를 확인해 주세요.");
            }
            if (!id.matches("^S-[0-9]{3,}$") || !seenIds.add(id) || name.isBlank()
                    || name.length() > 100 || affiliation.length() > 100
                    || !Set.of("true", "false").contains(activeText) || sortOrder < 0) {
                throw ApiException.invalid("스태프 CSV의 ID, 이름, 소속 또는 정렬 값을 확인해 주세요.");
            }
            jdbc.update("""
                    INSERT INTO staff_members(staff_id,name,affiliation,active,sort_order)
                    VALUES(?,?,?,?,?)
                    ON CONFLICT(staff_id) DO UPDATE SET name=excluded.name,
                      affiliation=excluded.affiliation,active=excluded.active,
                      sort_order=excluded.sort_order,updated_at=now()
                    """, id, name, affiliation.isEmpty() ? null : affiliation,
                    Boolean.parseBoolean(activeText), sortOrder);
            count++;
        }
        if (count == 0) throw ApiException.invalid("가져올 스태프 명단이 없습니다.");
        changed(staff, "STAFF_MEMBERS_IMPORTED", "STAFF_MEMBER", "bulk", "staff.members.updated");
        return Map.of("importedCount", count);
    }

    private Map<String, Object> tokenResponse(String tableId, String token) {
        String url = properties.frontendBaseUrl().replaceAll("/$", "") + "/t/" + tableId + "?token=" + token;
        return ApiEnvelope.map("tableId", tableId, "tableToken", token, "url", url, "qrSvg", qrSvg(url));
    }
    private String qrSvg(String value) {
        try {
            var matrix = new MultiFormatWriter().encode(value, BarcodeFormat.QR_CODE, 256, 256);
            StringBuilder paths = new StringBuilder();
            for (int y = 0; y < matrix.getHeight(); y++) for (int x = 0; x < matrix.getWidth(); x++)
                if (matrix.get(x, y)) paths.append("M").append(x).append(' ').append(y).append("h1v1h-1z");
            return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><rect width=\"256\" height=\"256\" fill=\"white\"/><path d=\"" + paths + "\"/></svg>";
        } catch (Exception error) { throw new IllegalStateException("QR generation failed", error); }
    }
    private void changed(StaffPrincipal staff, String action, String type, String id, String event) {
        jdbc.update("INSERT INTO audit_logs(log_id,actor_type,actor_id,action,entity_type,entity_id) VALUES(?,'STAFF',?,?,?,?)",
                UUID.randomUUID(), staff.deviceLabel(), action, type, id);
        events.publish(event, id, "TABLE".equals(type) ? id : null, Map.of("action", action));
    }
    private String newToken() { byte[] bytes = new byte[32]; random.nextBytes(bytes); return HexFormat.of().formatHex(bytes); }
    private String hashToken(String token) { return StaffTokenService.sha256Hex(properties.tokenPepper() + ":" + token); }
    private static void validateId(String id) { if (!id.matches("^[a-z0-9][a-z0-9-]{0,99}$")) throw ApiException.invalid("ID 형식을 확인해 주세요."); }
    private static String required(Map<String, Object> body, String field) { Object value=body.get(field); if(value==null||String.valueOf(value).isBlank()) throw ApiException.invalid(field+" 값을 확인해 주세요."); return String.valueOf(value); }
    private static String nullable(Object value) { return value == null || String.valueOf(value).isBlank() ? null : String.valueOf(value); }
    private static int number(Map<String, Object> body, String field, int fallback) { Object value=body.get(field); return value==null?fallback:value instanceof Number n?n.intValue():Integer.parseInt(String.valueOf(value)); }
    private static boolean bool(Map<String, Object> body, String field, boolean fallback) { Object value=body.get(field); return value==null?fallback:value instanceof Boolean b?b:Boolean.parseBoolean(String.valueOf(value)); }
}

package com.caucse.qrorder.domain;

import com.caucse.qrorder.api.ApiEnvelope;
import com.caucse.qrorder.api.ApiException;
import com.caucse.qrorder.auth.StaffTokenService;
import com.caucse.qrorder.config.QrOrderProperties;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class TableCatalogService {
    private final JdbcTemplate jdbc;
    private final QrOrderProperties properties;

    public TableCatalogService(JdbcTemplate jdbc, QrOrderProperties properties) {
        this.jdbc = jdbc;
        this.properties = properties;
    }

    public TableRow requireTable(String tableId, String token, boolean requireActive) {
        if (tableId == null || !tableId.matches("^T[0-9]{2,}$") || token == null || !token.matches("(?i)^[0-9a-f]{64}$")) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_TABLE_TOKEN", "테이블 QR 정보를 다시 확인해 주세요.", false);
        }
        List<TableRow> rows = jdbc.query("SELECT table_id, display_name, token_hash, active, sort_order FROM tables WHERE table_id = ?",
                (rs, index) -> new TableRow(rs.getString("table_id"), rs.getString("display_name"),
                        rs.getString("token_hash"), rs.getBoolean("active"), rs.getInt("sort_order")), tableId);
        String actual = StaffTokenService.sha256Hex(properties.tokenPepper() + ":" + token);
        String expected = rows.isEmpty() ? "0".repeat(64) : rows.getFirst().tokenHash();
        if (!MessageDigest.isEqual(actual.getBytes(StandardCharsets.US_ASCII), expected.getBytes(StandardCharsets.US_ASCII))) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_TABLE_TOKEN", "테이블 QR 정보를 다시 확인해 주세요.", false);
        }
        TableRow table = rows.getFirst();
        if (requireActive && !table.active()) {
            throw new ApiException(HttpStatus.GONE, "INACTIVE_TABLE", "현재 사용할 수 없는 테이블입니다.", false);
        }
        return table;
    }

    public Map<String, Object> resolve(String tableId, String token) {
        TableRow table = requireTable(tableId, token, true);
        Map<String, String> settings = settings();
        return ApiEnvelope.map(
                "table", ApiEnvelope.map("tableId", table.tableId(), "displayName", table.displayName()),
                "store", ApiEnvelope.map(
                        "name", settings.get("STORE_NAME"),
                        "open", Boolean.parseBoolean(settings.get("EVENT_OPEN")),
                        "notice", settings.get("NOTICE")),
                "statusPollSeconds", Integer.parseInt(settings.get("STATUS_POLL_SECONDS")));
    }

    public Map<String, Object> menu(String tableId, String token) {
        requireTable(tableId, token, true);
        return menuUnchecked();
    }

    public Map<String, Object> bootstrap(String tableId, String token) {
        Map<String, Object> resolved = resolve(tableId, token);
        Map<String, Object> menu = menuUnchecked();
        var result = new LinkedHashMap<String, Object>();
        result.putAll(resolved);
        result.putAll(menu);
        return result;
    }

    public Map<String, Object> menuUnchecked() {
        List<Map<String, Object>> categories = jdbc.query("""
                SELECT category_id, label, heading FROM categories
                WHERE active = true ORDER BY sort_order, category_id
                """, (rs, index) -> ApiEnvelope.map(
                "categoryId", rs.getString("category_id"),
                "label", rs.getString("label"),
                "heading", rs.getString("heading")));

        List<Map<String, Object>> groups = jdbc.query("""
                SELECT option_group_id, menu_id, label, selection_type, required,
                       min_select, max_select, sort_order
                FROM option_groups WHERE active = true ORDER BY sort_order, option_group_id
                """, (rs, index) -> {
            List<Map<String, Object>> options = jdbc.query("""
                    SELECT option_id, name, price_delta, available, default_selected, sort_order
                    FROM options WHERE option_group_id = ? ORDER BY sort_order, option_id
                    """, (ors, oi) -> ApiEnvelope.map(
                    "optionId", ors.getString("option_id"),
                    "name", ors.getString("name"),
                    "priceDelta", ors.getInt("price_delta"),
                    "available", ors.getBoolean("available"),
                    "defaultSelected", ors.getBoolean("default_selected"),
                    "sortOrder", ors.getInt("sort_order")), rs.getString("option_group_id"));
            List<String> defaults = jdbc.queryForList("""
                    SELECT option_id FROM options WHERE option_group_id = ? AND default_selected = true
                    ORDER BY sort_order, option_id
                    """, String.class, rs.getString("option_group_id"));
            return ApiEnvelope.map(
                    "optionGroupId", rs.getString("option_group_id"),
                    "menuId", rs.getString("menu_id"),
                    "label", rs.getString("label"),
                    "required", rs.getBoolean("required"),
                    "selectionType", "SINGLE".equals(rs.getString("selection_type")) ? "single" : "multiple",
                    "minSelections", rs.getInt("min_select"),
                    "maxSelections", rs.getInt("max_select"),
                    "sortOrder", rs.getInt("sort_order"),
                    "defaultSelectedOptionIds", defaults,
                    "options", options);
        });

        List<Map<String, Object>> items = jdbc.query("""
                SELECT m.* FROM menus m JOIN categories c ON c.category_id = m.category_id
                WHERE c.active = true ORDER BY c.sort_order, m.sort_order, m.menu_id
                """, (rs, index) -> {
            String menuId = rs.getString("menu_id");
            return ApiEnvelope.map(
                    "menuId", menuId,
                    "categoryId", rs.getString("category_id"),
                    "name", rs.getString("name"),
                    "description", rs.getString("description"),
                    "basePrice", rs.getInt("base_price"),
                    "imageUrl", rs.getString("image_url"),
                    "available", rs.getBoolean("available"),
                    "minQuantity", rs.getInt("min_quantity"),
                    "maxQuantity", rs.getInt("max_quantity"),
                    "allergens", sqlArray(rs, "allergens"),
                    "origin", rs.getString("origin"),
                    "badgeTags", sqlArray(rs, "badge_tags"),
                    "optionGroups", groups.stream().filter(group -> menuId.equals(group.get("menuId")))
                            .map(group -> {
                                var copy = new LinkedHashMap<>(group);
                                copy.remove("menuId");
                                return (Map<String, Object>) copy;
                            }).toList());
        });
        return ApiEnvelope.map("categories", categories, "items", items, "generatedAt", Instant.now().toString());
    }

    public Map<String, String> settings() {
        Map<String, String> result = new LinkedHashMap<>();
        jdbc.query("SELECT key, value FROM settings", (rs, index) -> {
            result.put(rs.getString(1), rs.getString(2));
            return null;
        });
        return result;
    }

    private static List<String> sqlArray(ResultSet rs, String column) throws SQLException {
        Array value = rs.getArray(column);
        if (value == null) return List.of();
        Object raw = value.getArray();
        if (raw instanceof String[] strings) return List.of(strings);
        Object[] values = (Object[]) raw;
        List<String> result = new ArrayList<>();
        for (Object item : values) result.add(String.valueOf(item));
        return result;
    }

    public record TableRow(String tableId, String displayName, String tokenHash, boolean active, int sortOrder) {}
}

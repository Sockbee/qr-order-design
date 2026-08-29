package com.caucse.qrorder.domain;

import com.caucse.qrorder.api.ApiEnvelope;
import com.caucse.qrorder.api.ApiException;
import com.caucse.qrorder.auth.StaffTokenService;
import com.caucse.qrorder.sse.DomainEventService;
import tools.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class CustomerOrderService {
    private static final Set<String> CALL_REASONS = Set.of(
            "WATER_UTENSIL", "SIDE_PLATE", "ORDER_INQUIRY", "PAYMENT_REQUEST", "OTHER");
    private final JdbcTemplate jdbc;
    private final TableCatalogService catalog;
    private final DomainEventService events;
    private final ObjectMapper mapper;

    public CustomerOrderService(JdbcTemplate jdbc, TableCatalogService catalog,
                                DomainEventService events, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.events = events;
        this.mapper = mapper;
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> request, boolean staff) {
        rejectUnexpected(request, staff
                ? Set.of("apiVersion", "tableId", "clientRequestId", "note", "items")
                : Set.of("apiVersion", "tableId", "tableToken", "clientRequestId", "note", "items"), "request");
        String tableId = string(request, "tableId");
        TableCatalogService.TableRow table;
        if (staff) {
            table = jdbc.query("SELECT table_id,display_name,token_hash,active,sort_order FROM tables WHERE table_id=? AND active=true",
                    rs -> rs.next() ? new TableCatalogService.TableRow(rs.getString(1), rs.getString(2), rs.getString(3), rs.getBoolean(4), rs.getInt(5)) : null,
                    tableId);
            if (table == null) throw ApiException.notFound("TABLE_NOT_FOUND", "테이블을 찾을 수 없습니다.");
        } else {
            table = catalog.requireTable(tableId, string(request, "tableToken"), true);
            if (!Boolean.parseBoolean(setting("EVENT_OPEN"))) {
                throw new ApiException(HttpStatus.CONFLICT, "EVENT_CLOSED", "현재 주문을 받고 있지 않습니다.", false);
            }
        }

        List<Map<String, Object>> inputItems = mapList(request.get("items"));
        inputItems.forEach(item -> rejectUnexpected(
                item, Set.of("menuId", "quantity", "selectedOptionIds"), "items"));
        int maxLines = Integer.parseInt(setting("MAX_ORDER_LINES"));
        if (inputItems.isEmpty() || inputItems.size() > maxLines) {
            throw ApiException.invalid("주문 항목 수를 확인해 주세요.");
        }
        String note = nullableString(request.get("note"));
        if (note != null && note.length() > 200) throw ApiException.invalid("요청사항은 200자 이하여야 합니다.");

        String clientRequest = nullableString(request.get("clientRequestId"));
        UUID clientRequestId = clientRequest == null ? UUID.randomUUID() : parseUuid(clientRequest, "clientRequestId");
        String key = (staff ? "staff:" : "customer:") + tableId + ":" + clientRequestId;
        String fingerprint = fingerprint(tableId, inputItems, note);
        // The same table row also guards first-session creation and concurrent
        // replays of an idempotency key.
        jdbc.queryForObject("SELECT table_id FROM tables WHERE table_id=? FOR UPDATE", String.class, tableId);
        Map<String, Object> replay = existingOrder(key, fingerprint);
        if (replay != null) return replay;

        UUID sessionId = openOrCreateSession(tableId);
        List<ValidatedLine> lines = new ArrayList<>();
        int total = 0;
        for (int index = 0; index < inputItems.size(); index++) {
            ValidatedLine line = validateLine(inputItems.get(index), index + 1);
            lines.add(line);
            total = Math.addExact(total, line.lineTotal());
        }

        long displayNumber = nextDisplayNumber();
        String displayCode = setting("ORDER_PREFIX") + displayNumber;
        UUID orderId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO orders(order_id, display_number, display_code, client_request_id,
                  idempotency_key, request_fingerprint, table_id, session_id, status, public_status,
                  payment_status, total_amount, note, note_audience)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', 'accepted', 'UNPAID', ?, ?, 'GENERAL')
                """, orderId, displayNumber, displayCode, clientRequestId, key, fingerprint,
                tableId, sessionId, total, note);

        for (ValidatedLine line : lines) {
            UUID itemId = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO order_items(order_item_id, order_id, line_no, menu_id, menu_name_snapshot,
                      base_price_snapshot, unit_price_snapshot, quantity, line_total)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, itemId, orderId, line.lineNo(), line.menuId(), line.name(), line.basePrice(),
                    line.unitPrice(), line.quantity(), line.lineTotal());
            for (SelectedOption option : line.options()) {
                jdbc.update("""
                        INSERT INTO order_item_options(order_item_option_id, order_item_id, order_id,
                          option_group_id, option_group_name_snapshot, option_id, option_name_snapshot,
                          price_delta_snapshot, sort_order)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, UUID.randomUUID(), itemId, orderId, option.groupId(), option.groupName(),
                        option.optionId(), option.optionName(), option.priceDelta(), option.sortOrder());
            }
        }
        audit(staff ? "STAFF" : "CLIENT", staff ? "STAFF" : tableId, "ORDER_CREATED", "ORDER", orderId.toString(), null, displayCode);
        events.publish("order.created", orderId.toString(), tableId, Map.of("displayCode", displayCode));
        return hydrateCreated(orderId, false);
    }

    public Map<String, Object> get(Map<String, Object> request) {
        String tableId = string(request, "tableId");
        catalog.requireTable(tableId, string(request, "tableToken"), false);
        String orderId = nullableString(request.get("orderId"));
        String displayCode = nullableString(request.get("displayCode"));
        if ((orderId == null) == (displayCode == null)) throw ApiException.invalid("orderId 또는 displayCode 중 하나가 필요합니다.");
        UUID id = jdbc.query(orderId != null
                        ? "SELECT order_id FROM orders WHERE order_id::text=? AND table_id=?"
                        : "SELECT order_id FROM orders WHERE display_code=? AND table_id=?",
                rs -> rs.next() ? UUID.fromString(rs.getString(1)) : null,
                orderId != null ? orderId : displayCode, tableId);
        if (id == null) throw ApiException.notFound("ORDER_NOT_FOUND", "주문 정보를 찾을 수 없습니다.");
        return hydrateCreated(id, true);
    }

    public Map<String, Object> list(Map<String, Object> request) {
        String tableId = string(request, "tableId");
        TableCatalogService.TableRow table = catalog.requireTable(tableId, string(request, "tableToken"), false);
        List<Map<String, Object>> orders = jdbc.query("""
                SELECT order_id, display_code, status, public_status, total_amount, created_at
                FROM orders WHERE table_id=? ORDER BY created_at DESC
                """, (rs, index) -> {
            UUID orderId = rs.getObject("order_id", UUID.class);
            return ApiEnvelope.map(
                    "orderId", orderId.toString(), "displayCode", rs.getString("display_code"),
                    "status", rs.getString("status"), "publicStatus", rs.getString("public_status"),
                    "totalAmount", rs.getInt("total_amount"),
                    "createdAt", rs.getObject("created_at", OffsetDateTime.class).toInstant().toString(),
                    "items", listItems(orderId));
        }, tableId);
        String latest = orders.stream().filter(row -> !"cancelled".equals(row.get("publicStatus")))
                .map(row -> String.valueOf(row.get("publicStatus"))).findFirst().orElse(null);
        Integer total = jdbc.queryForObject("""
                SELECT COALESCE(sum(total_amount),0)::integer FROM orders
                WHERE table_id=? AND status <> 'CANCELLED'
                """, Integer.class, tableId);
        return ApiEnvelope.map(
                "table", ApiEnvelope.map("tableId", table.tableId(), "displayName", table.displayName()),
                "orders", orders, "latestPublicStatus", latest, "sessionTotalAmount", total == null ? 0 : total);
    }

    @Transactional
    public Map<String, Object> createCall(Map<String, Object> request) {
        String tableId = string(request, "tableId");
        catalog.requireTable(tableId, string(request, "tableToken"), true);
        if (!Boolean.parseBoolean(setting("EVENT_OPEN"))) {
            throw new ApiException(HttpStatus.CONFLICT, "EVENT_CLOSED", "현재 호출을 받고 있지 않습니다.", false);
        }
        String reason = string(request, "reason");
        if (!CALL_REASONS.contains(reason)) throw ApiException.invalid("호출 사유를 확인해 주세요.");
        UUID requestId = parseUuid(string(request, "clientRequestId"), "clientRequestId");
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class, requestId.toString());
        jdbc.queryForObject("SELECT table_id FROM tables WHERE table_id=? FOR UPDATE", String.class, tableId);
        Map<String, Object> replay = jdbc.query("SELECT call_id,table_id,reason,created_at,status FROM calls WHERE client_request_id=?",
                rs -> {
                    if (!rs.next()) return null;
                    if (!tableId.equals(rs.getString("table_id")) || !reason.equals(rs.getString("reason"))) {
                        throw ApiException.conflict("DUPLICATE_REQUEST", "이전 호출 요청과 정보가 달라 처리할 수 없습니다.");
                    }
                    return ApiEnvelope.map("callId", rs.getString("call_id"),
                            "createdAt", rs.getObject("created_at", OffsetDateTime.class).toInstant().toString(),
                            "status", rs.getString("status"), "idempotentReplay", true);
                }, requestId);
        if (replay != null) return replay;
        int minSeconds = Integer.parseInt(setting("CALL_MIN_INTERVAL_SECONDS"));
        Boolean tooSoon = jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM calls WHERE table_id=? AND created_at > now() - (? * interval '1 second'))
                """, Boolean.class, tableId, minSeconds);
        if (Boolean.TRUE.equals(tooSoon)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "CALL_TOO_FREQUENT",
                    "방금 호출했어요. 잠시 후 다시 시도해 주세요.", true);
        }
        UUID callId = UUID.randomUUID();
        jdbc.update("INSERT INTO calls(call_id,table_id,reason,status,client_request_id) VALUES(?,?,?,'PENDING',?)",
                callId, tableId, reason, requestId);
        audit("CLIENT", tableId, "CALL_CREATED", "CALL", callId.toString(), null, reason);
        events.publish("call.created", callId.toString(), tableId, Map.of("reason", reason));
        return ApiEnvelope.map("callId", callId.toString(), "createdAt", Instant.now().toString(),
                "status", "PENDING", "idempotentReplay", false);
    }

    @Transactional
    public Void cancelCall(Map<String, Object> request) {
        String tableId = string(request, "tableId");
        catalog.requireTable(tableId, string(request, "tableToken"), false);
        UUID callId = parseUuid(string(request, "callId"), "callId");
        String status = jdbc.query("SELECT status FROM calls WHERE call_id=? AND table_id=? FOR UPDATE",
                rs -> rs.next() ? rs.getString(1) : null, callId, tableId);
        if (status == null) throw ApiException.notFound("CALL_NOT_FOUND", "호출 정보를 찾을 수 없습니다.");
        if (!"PENDING".equals(status)) throw ApiException.conflict("CALL_ALREADY_RESOLVED", "이미 직원이 확인한 호출입니다.");
        jdbc.update("UPDATE calls SET status='CANCELLED',cancelled_at=now(),updated_at=now() WHERE call_id=?", callId);
        audit("CLIENT", tableId, "CALL_CANCELLED", "CALL", callId.toString(), null, tableId);
        events.publish("call.cancelled", callId.toString(), tableId, Map.of());
        return null;
    }

    private Map<String, Object> existingOrder(String key, String fingerprint) {
        return jdbc.query("SELECT order_id,request_fingerprint FROM orders WHERE idempotency_key=?",
                rs -> {
                    if (!rs.next()) return null;
                    if (!fingerprint.equals(rs.getString("request_fingerprint"))) {
                        throw ApiException.conflict("IDEMPOTENCY_CONFLICT", "동일 요청 ID에 다른 주문 정보가 사용되었습니다.");
                    }
                    return hydrateCreated(rs.getObject("order_id", UUID.class), true);
                }, key);
    }

    private UUID openOrCreateSession(String tableId) {
        UUID existing = jdbc.query("""
                SELECT session_id FROM table_sessions
                WHERE status='OPEN' AND (table_id=? OR origin_table_id=?)
                ORDER BY CASE WHEN table_id=? THEN 0 ELSE 1 END
                FOR UPDATE
                """, rs -> rs.next() ? rs.getObject(1, UUID.class) : null, tableId, tableId, tableId);
        if (existing != null) return existing;
        UUID sessionId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO table_sessions(session_id,table_id,origin_table_id,status,discount_rate,payment_status)
                VALUES(?,?,?,'OPEN',0,'UNPAID')
                """, sessionId, tableId, tableId);
        return sessionId;
    }

    private long nextDisplayNumber() {
        String value = jdbc.queryForObject("SELECT value FROM settings WHERE key='NEXT_DISPLAY_NUMBER' FOR UPDATE", String.class);
        long next = Long.parseLong(value);
        jdbc.update("UPDATE settings SET value=?,updated_at=now() WHERE key='NEXT_DISPLAY_NUMBER'", String.valueOf(next + 1));
        return next;
    }

    private ValidatedLine validateLine(Map<String, Object> input, int lineNo) {
        String menuId = string(input, "menuId");
        int quantity = integer(input, "quantity");
        Menu menu = jdbc.query("""
                SELECT menu_id,name,base_price,available,min_quantity,max_quantity FROM menus WHERE menu_id=?
                """, rs -> rs.next() ? new Menu(rs.getString(1), rs.getString(2), rs.getInt(3),
                rs.getBoolean(4), rs.getInt(5), rs.getInt(6)) : null, menuId);
        if (menu == null) throw new ApiException(HttpStatus.BAD_REQUEST, "MENU_NOT_FOUND", "메뉴 정보를 다시 확인해 주세요.", false,
                Map.of("menuIds", List.of(menuId)));
        if (!menu.available()) throw new ApiException(HttpStatus.CONFLICT, "MENU_UNAVAILABLE", "품절된 메뉴가 포함되어 있습니다.", false,
                Map.of("menuIds", List.of(menuId)));
        if (quantity < menu.min() || quantity > menu.max()) throw ApiException.invalid("메뉴 수량을 확인해 주세요.");
        List<String> selectedIds = stringList(input.get("selectedOptionIds"));
        if (selectedIds.size() != Set.copyOf(selectedIds).size()) throw ApiException.invalid("중복 옵션이 포함되어 있습니다.");

        List<Group> groups = jdbc.query("""
                SELECT option_group_id,label,required,min_select,max_select FROM option_groups
                WHERE menu_id=? AND active=true ORDER BY sort_order
                """, (rs, index) -> new Group(rs.getString(1), rs.getString(2), rs.getBoolean(3), rs.getInt(4), rs.getInt(5)), menuId);
        List<SelectedOption> options = new ArrayList<>();
        int optionDelta = 0;
        for (Group group : groups) {
            List<SelectedOption> selected = jdbc.query("""
                    SELECT option_id,name,price_delta,sort_order,available FROM options
                    WHERE option_group_id=? AND option_id = ANY(?::text[])
                    ORDER BY sort_order,option_id
                    """, (rs, index) -> {
                if (!rs.getBoolean("available")) throw new ApiException(HttpStatus.CONFLICT, "OPTION_UNAVAILABLE", "품절된 옵션이 포함되어 있습니다.", false);
                return new SelectedOption(group.id(), group.label(), rs.getString("option_id"),
                        rs.getString("name"), rs.getInt("price_delta"), rs.getInt("sort_order"));
            }, group.id(), "{" + String.join(",", selectedIds) + "}");
            if (selected.size() < group.min() || selected.size() > group.max() || (group.required() && selected.isEmpty())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_OPTION_SELECTION", "필수 옵션을 확인해 주세요.", false,
                        Map.of("optionGroupId", group.id()));
            }
            options.addAll(selected);
            optionDelta += selected.stream().mapToInt(SelectedOption::priceDelta).sum();
        }
        if (options.size() != selectedIds.size()) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_OPTION_SELECTION", "메뉴에 속하지 않은 옵션입니다.", false);
        int unitPrice = Math.addExact(menu.basePrice(), optionDelta);
        int lineTotal = Math.multiplyExact(unitPrice, quantity);
        return new ValidatedLine(lineNo, menu.id(), menu.name(), menu.basePrice(), unitPrice, quantity, lineTotal, options);
    }

    private Map<String, Object> hydrateCreated(UUID orderId, boolean replay) {
        return jdbc.query("""
                SELECT o.*,t.display_name FROM orders o JOIN tables t ON t.table_id=o.table_id WHERE o.order_id=?
                """, rs -> {
            if (!rs.next()) throw ApiException.notFound("ORDER_NOT_FOUND", "주문 정보를 찾을 수 없습니다.");
            return ApiEnvelope.map(
                    "orderId", orderId.toString(), "displayNumber", rs.getLong("display_number"),
                    "displayCode", rs.getString("display_code"),
                    "table", ApiEnvelope.map("tableId", rs.getString("table_id"), "displayName", rs.getString("display_name")),
                    "status", rs.getString("status"), "publicStatus", rs.getString("public_status"),
                    "paymentStatus", rs.getString("payment_status"), "totalAmount", rs.getInt("total_amount"),
                    "createdAt", rs.getObject("created_at", OffsetDateTime.class).toInstant().toString(),
                    "idempotentReplay", replay, "items", createdItems(orderId));
        }, orderId);
    }

    private List<Map<String, Object>> createdItems(UUID orderId) {
        return jdbc.query("""
                SELECT * FROM order_items WHERE order_id=? ORDER BY line_no
                """, (rs, index) -> {
            UUID itemId = rs.getObject("order_item_id", UUID.class);
            List<Map<String, Object>> options = jdbc.query("""
                    SELECT option_id,option_group_name_snapshot,option_name_snapshot,price_delta_snapshot
                    FROM order_item_options WHERE order_item_id=? ORDER BY sort_order,option_id
                    """, (ors, oi) -> ApiEnvelope.map("optionId", ors.getString(1), "groupName", ors.getString(2),
                    "name", ors.getString(3), "priceDelta", ors.getInt(4)), itemId);
            return ApiEnvelope.map("lineNo", rs.getInt("line_no"), "menuId", rs.getString("menu_id"),
                    "name", rs.getString("menu_name_snapshot"), "basePrice", rs.getInt("base_price_snapshot"),
                    "unitPrice", rs.getInt("unit_price_snapshot"), "quantity", rs.getInt("quantity"),
                    "lineTotal", rs.getInt("line_total"), "selectedOptions", options);
        }, orderId);
    }

    private List<Map<String, Object>> listItems(UUID orderId) {
        return jdbc.query("""
                SELECT order_item_id,menu_name_snapshot,quantity,line_total FROM order_items
                WHERE order_id=? AND status='ACTIVE' ORDER BY line_no
                """, (rs, index) -> ApiEnvelope.map(
                "name", rs.getString("menu_name_snapshot"), "quantity", rs.getInt("quantity"),
                "lineTotal", rs.getInt("line_total"),
                "selectedOptions", jdbc.queryForList("""
                        SELECT option_name_snapshot FROM order_item_options WHERE order_item_id=? ORDER BY sort_order
                        """, String.class, rs.getObject("order_item_id", UUID.class))), orderId);
    }

    private String setting(String key) {
        String value = jdbc.queryForObject("SELECT value FROM settings WHERE key=?", String.class, key);
        if (value == null) throw new IllegalStateException("Missing setting " + key);
        return value;
    }

    private String fingerprint(String tableId, List<Map<String, Object>> items, String note) {
        try {
            var canonicalItems = items.stream().map(item -> ApiEnvelope.map(
                    "menuId", string(item, "menuId"),
                    "quantity", integer(item, "quantity"),
                    "selectedOptionIds", stringList(item.get("selectedOptionIds")).stream().sorted().toList()
            )).toList();
            return StaffTokenService.sha256Hex(mapper.writeValueAsString(ApiEnvelope.map(
                    "tableId", tableId, "note", note == null ? "" : note, "items", canonicalItems)));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    private void audit(String actorType, String actorId, String action, String entityType,
                       String entityId, String from, String to) {
        jdbc.update("""
                INSERT INTO audit_logs(log_id,actor_type,actor_id,action,entity_type,entity_id,from_value,to_value)
                VALUES(?,?,?,?,?,?,?,?)
                """, UUID.randomUUID(), actorType, actorId, action, entityType, entityId, from, to);
    }

    private static String string(Map<String, Object> map, String field) {
        String value = nullableString(map.get(field));
        if (value == null) throw ApiException.invalid(field + " 값을 확인해 주세요.");
        return value;
    }

    private static String nullableString(Object value) {
        if (value == null) return null;
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private static int integer(Map<String, Object> map, String field) {
        Object value = map.get(field);
        if (!(value instanceof Number number) || number.doubleValue() != number.intValue()) throw ApiException.invalid(field + " 값을 확인해 주세요.");
        return number.intValue();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> mapList(Object value) {
        if (!(value instanceof List<?> list)) throw ApiException.invalid("items 값을 확인해 주세요.");
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) throw ApiException.invalid("items 값을 확인해 주세요.");
            result.add((Map<String, Object>) map);
        }
        return result;
    }

    private static List<String> stringList(Object value) {
        if (value == null) return List.of();
        if (!(value instanceof List<?> list)) throw ApiException.invalid("selectedOptionIds 값을 확인해 주세요.");
        return list.stream().map(String::valueOf).toList();
    }

    private static UUID parseUuid(String value, String field) {
        try { return UUID.fromString(value); }
        catch (Exception error) { throw ApiException.invalid(field + " 값을 확인해 주세요."); }
    }

    private static void rejectUnexpected(Map<String, Object> value, Set<String> allowed, String location) {
        List<String> unexpected = value.keySet().stream().filter(field -> !allowed.contains(field)).sorted().toList();
        if (!unexpected.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
                    "지원하지 않는 주문 정보가 포함되어 있습니다.", false,
                    Map.of("location", location, "fields", unexpected));
        }
    }

    private record Menu(String id, String name, int basePrice, boolean available, int min, int max) {}
    private record Group(String id, String label, boolean required, int min, int max) {}
    private record SelectedOption(String groupId, String groupName, String optionId, String optionName,
                                  int priceDelta, int sortOrder) {}
    private record ValidatedLine(int lineNo, String menuId, String name, int basePrice, int unitPrice,
                                 int quantity, int lineTotal, List<SelectedOption> options) {}
}

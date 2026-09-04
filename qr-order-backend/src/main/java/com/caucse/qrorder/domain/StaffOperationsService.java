package com.caucse.qrorder.domain;

import com.caucse.qrorder.api.ApiEnvelope;
import com.caucse.qrorder.api.ApiException;
import com.caucse.qrorder.auth.StaffPrincipal;
import com.caucse.qrorder.sse.DomainEventService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class StaffOperationsService {
    private static final Map<String, String> REMOTE_STATUS = Map.of(
            "RECEIVED", "RECEIVED", "COOKING", "PREPARING", "READY", "SERVING", "SERVED", "COMPLETED");
    private static final Map<String, String> PUBLIC_STATUS = Map.of(
            "RECEIVED", "accepted", "CONFIRMED", "accepted", "PREPARING", "preparing",
            "SERVING", "served", "COMPLETED", "closed", "CANCELLED", "cancelled");
    private final JdbcTemplate jdbc;
    private final CustomerOrderService customerOrders;
    private final DomainEventService events;

    public StaffOperationsService(JdbcTemplate jdbc, CustomerOrderService customerOrders, DomainEventService events) {
        this.jdbc = jdbc;
        this.customerOrders = customerOrders;
        this.events = events;
    }

    public Map<String, Object> listCalls() {
        List<Map<String, Object>> groups = jdbc.query("""
                SELECT c.table_id,t.display_name,count(*)::integer AS count,
                       min(c.created_at) first_called_at,max(c.created_at) last_called_at,
                       array_agg(c.call_id ORDER BY c.created_at) call_ids,
                       array_agg(DISTINCT c.reason) reasons
                FROM calls c JOIN tables t ON t.table_id=c.table_id
                WHERE c.status='PENDING' GROUP BY c.table_id,t.display_name ORDER BY first_called_at
                """, (rs, index) -> ApiEnvelope.map(
                "tableId", rs.getString("table_id"), "displayName", rs.getString("display_name"),
                "count", rs.getInt("count"), "reasons", arrayStrings(rs.getArray("reasons")),
                "firstCalledAt", instant(rs, "first_called_at"), "lastCalledAt", instant(rs, "last_called_at"),
                "callIds", arrayStrings(rs.getArray("call_ids"))));
        return ApiEnvelope.map("groups", groups, "tableCount", groups.size());
    }

    @Transactional
    public Map<String, Object> acknowledgeCall(String tableId, StaffPrincipal staff) {
        int count = jdbc.update("""
                UPDATE calls SET status='ACKNOWLEDGED',acknowledged_at=now(),acknowledged_by=?,updated_at=now()
                WHERE table_id=? AND status='PENDING'
                """, staff.deviceLabel(), tableId);
        Instant now = Instant.now();
        if (count > 0) {
            audit(staff, "CALL_ACKNOWLEDGED", "TABLE", tableId, null, String.valueOf(count));
            events.publish("call.acknowledged", tableId, tableId, Map.of("count", count));
        }
        return ApiEnvelope.map("tableId", tableId, "acknowledgedCount", count, "acknowledgedAt", now.toString());
    }

    public Map<String, Object> listTables() {
        List<Map<String, Object>> tables = jdbc.query("SELECT table_id,display_name FROM tables WHERE active=true ORDER BY sort_order,table_id",
                (rs, index) -> tableSummary(rs.getString(1), rs.getString(2)));
        return ApiEnvelope.map("tables", tables, "stationCounts", stationCounts(), "serverTime", Instant.now().toString());
    }

    public Map<String, Object> tableDetail(String tableId) {
        String displayName = jdbc.query("SELECT display_name FROM tables WHERE table_id=?",
                rs -> rs.next() ? rs.getString(1) : null, tableId);
        if (displayName == null) throw ApiException.notFound("TABLE_NOT_FOUND", "테이블을 찾을 수 없습니다.");
        Bill bill = bill(tableId, false);
        if (bill == null) {
            return ApiEnvelope.map("tableId", tableId, "displayName", displayName, "orderStatus", null,
                    "openedAt", null, "mergedTableIds", List.of(), "originTableId", null,
                    "subtotalAmount", 0, "discountRate", 0, "discountAmount", 0, "finalAmount", 0,
                    "paymentStatus", null, "items", List.of(), "notes", List.of(), "call", pendingCall(tableId));
        }
        List<Map<String, Object>> items = jdbc.query("""
                SELECT i.order_item_id,i.menu_name_snapshot,i.quantity,i.line_total,i.status
                FROM order_items i JOIN orders o ON o.order_id=i.order_id
                WHERE o.session_id = ANY(?::uuid[]) ORDER BY o.created_at,i.line_no
                """, (rs, index) -> ApiEnvelope.map(
                "itemId", rs.getString("order_item_id"), "name", rs.getString("menu_name_snapshot"),
                "selectedOptions", jdbc.queryForList("SELECT option_name_snapshot FROM order_item_options WHERE order_item_id=? ORDER BY sort_order",
                        String.class, rs.getObject("order_item_id", UUID.class)),
                "quantity", rs.getInt("quantity"), "lineTotal", rs.getInt("line_total"),
                "status", rs.getString("status")), (Object) uuidArray(bill.sessionIds()));
        List<Map<String, Object>> notes = jdbc.query("""
                SELECT order_id,note,note_audience FROM orders
                WHERE session_id = ANY(?::uuid[]) AND note IS NOT NULL AND note<>'' ORDER BY created_at
                """, (rs, index) -> ApiEnvelope.map("noteId", rs.getString("order_id"),
                "audience", rs.getString("note_audience").toLowerCase(), "text", rs.getString("note")),
                (Object) uuidArray(bill.sessionIds()));
        List<String> merged = bill.members().stream().filter(id -> !id.equals(bill.primaryTableId())).toList();
        return ApiEnvelope.map(
                "tableId", tableId, "displayName", displayName, "orderStatus", aggregateOrderStatus(bill.sessionIds()),
                "openedAt", bill.openedAt().toString(), "mergedTableIds", merged,
                "originTableId", merged.isEmpty() ? null : bill.primaryTableId(),
                "subtotalAmount", bill.subtotal(), "discountRate", bill.discountRate(),
                "discountAmount", bill.discountAmount(), "finalAmount", bill.finalAmount(),
                "paymentStatus", bill.paymentStatus(), "items", items, "notes", notes,
                "call", pendingCall(tableId));
    }

    public Map<String, Object> billResponse(String tableId) {
        Bill bill = requireBill(tableId);
        return ApiEnvelope.map("tableId", tableId, "subtotalAmount", bill.subtotal(),
                "discountRate", bill.discountRate(), "discountAmount", bill.discountAmount(),
                "finalAmount", bill.finalAmount(), "paymentStatus", bill.paymentStatus());
    }

    @Transactional
    public Void discount(String tableId, int rate, StaffPrincipal staff) {
        int configured = settingInt("TABLE_DISCOUNT_RATE");
        if (rate != 0 && rate != configured) throw ApiException.invalid("할인율을 확인해 주세요.");
        Bill bill = requireBill(tableId);
        assertUnpaid(bill);
        jdbc.update("UPDATE table_sessions SET discount_rate=?,updated_at=now() WHERE session_id=?", rate, bill.primarySessionId());
        audit(staff, "TABLE_DISCOUNT_CHANGED", "TABLE_SESSION", bill.primarySessionId().toString(),
                String.valueOf(bill.discountRate()), String.valueOf(rate));
        events.publish("table.updated", tableId, tableId, Map.of("operation", "discount"));
        return null;
    }

    @Transactional
    public Void move(String from, String to, StaffPrincipal staff) {
        if (from.equals(to)) throw ApiException.invalid("이동할 테이블을 다시 선택해 주세요.");
        lockTables(from, to);
        Bill source = requireBill(from);
        if (source.sessionIds().size() > 1) throw ApiException.conflict("MERGED_SESSION_MOVE_NOT_ALLOWED", "합석을 먼저 분리해 주세요.");
        Boolean destinationOccupied = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM table_sessions WHERE table_id=? AND status='OPEN')",
                Boolean.class, to);
        Boolean destinationActive = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM tables WHERE table_id=? AND active=true)", Boolean.class, to);
        if (!Boolean.TRUE.equals(destinationActive)) throw ApiException.notFound("TABLE_NOT_FOUND", "이동할 테이블을 찾을 수 없습니다.");
        if (Boolean.TRUE.equals(destinationOccupied)) throw ApiException.conflict("DESTINATION_OCCUPIED", "이미 사용 중인 테이블입니다.");
        jdbc.update("UPDATE table_sessions SET table_id=?,updated_at=now() WHERE session_id=?", to, source.primarySessionId());
        audit(staff, "TABLE_MOVED", "TABLE_SESSION", source.primarySessionId().toString(), from, to);
        events.publish("table.updated", source.primarySessionId().toString(), from, Map.of("operation", "move", "to", to));
        events.publish("table.updated", source.primarySessionId().toString(), to, Map.of("operation", "move", "from", from));
        return null;
    }

    @Transactional
    public Void merge(String primaryTable, String secondaryTable, StaffPrincipal staff) {
        if (primaryTable.equals(secondaryTable)) throw ApiException.invalid("서로 다른 테이블을 선택해 주세요.");
        lockTables(primaryTable, secondaryTable);
        Bill primary = requireBill(primaryTable);
        Bill secondary = requireBill(secondaryTable);
        assertUnpaid(primary); assertUnpaid(secondary);
        if (primary.sessionIds().size() > 1 || secondary.sessionIds().size() > 1) {
            throw ApiException.conflict("MERGE_CHAIN_NOT_ALLOWED", "이미 합석된 테이블은 다시 합칠 수 없습니다.");
        }
        jdbc.update("UPDATE table_sessions SET merged_into_session_id=?,updated_at=now() WHERE session_id=?",
                primary.primarySessionId(), secondary.primarySessionId());
        audit(staff, "TABLES_MERGED", "TABLE_SESSION", primary.primarySessionId().toString(), secondaryTable, primaryTable);
        events.publish("table.updated", primaryTable, primaryTable, Map.of("operation", "merge", "secondary", secondaryTable));
        events.publish("table.updated", secondaryTable, secondaryTable, Map.of("operation", "merge", "primary", primaryTable));
        return null;
    }

    @Transactional
    public Void split(String tableId, StaffPrincipal staff) {
        Bill bill = requireBill(tableId);
        if (bill.sessionIds().size() < 2) throw ApiException.conflict("TABLE_NOT_MERGED", "합석 상태가 아닙니다.");
        jdbc.update("UPDATE table_sessions SET merged_into_session_id=NULL,updated_at=now() WHERE merged_into_session_id=?",
                bill.primarySessionId());
        audit(staff, "TABLES_SPLIT", "TABLE_SESSION", bill.primarySessionId().toString(), "MERGED", "SPLIT");
        for (String member : bill.members()) events.publish("table.updated", member, member, Map.of("operation", "split"));
        return null;
    }

    @Transactional
    public Void confirmPayment(String tableId, int expected, StaffPrincipal staff) {
        Bill bill = requireBill(tableId);
        assertUnpaid(bill);
        if (bill.finalAmount() != expected) throw new ApiException(HttpStatus.CONFLICT, "BILL_AMOUNT_CHANGED",
                "결제 금액이 변경되었습니다. 다시 확인해 주세요.", false,
                Map.of("expectedFinalAmount", expected, "actualFinalAmount", bill.finalAmount()));
        jdbc.update("""
                UPDATE table_sessions SET payment_status='PAID',subtotal_amount=?,discount_amount=?,final_amount=?,
                  paid_at=now(),closed_at=now(),status='CLOSED',updated_at=now()
                WHERE session_id = ANY(?::uuid[])
                """, bill.subtotal(), bill.discountAmount(), bill.finalAmount(), (Object) uuidArray(bill.sessionIds()));
        jdbc.update("UPDATE orders SET payment_status='PAID',paid_at=now(),updated_at=now() WHERE session_id = ANY(?::uuid[])",
                (Object) uuidArray(bill.sessionIds()));
        audit(staff, "PAYMENT_CONFIRMED", "TABLE_SESSION", bill.primarySessionId().toString(), "UNPAID", String.valueOf(expected));
        for (String member : bill.members()) events.publish("payment.confirmed", bill.primarySessionId().toString(), member, Map.of("amount", expected));
        return null;
    }

    @Transactional
    public Void updateStatus(Map<String, Object> request, StaffPrincipal staff) {
        String remote = string(request, "status");
        String status = REMOTE_STATUS.get(remote);
        if (status == null) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ORDER_STATUS_TRANSITION", "주문 상태를 변경할 수 없습니다.", false);
        String tableId = optional(request, "tableId");
        String orderId = optional(request, "orderId");
        if ((tableId == null) == (orderId == null)) throw ApiException.invalid("tableId 또는 orderId 중 하나가 필요합니다.");
        int updated;
        List<String> affectedTables;
        if (tableId != null) {
            Bill bill = requireBill(tableId); assertUnpaid(bill);
            updated = jdbc.update("""
                    UPDATE orders SET status=?,public_status=?,status_updated_at=now(),updated_at=now()
                    WHERE session_id = ANY(?::uuid[]) AND status<>'CANCELLED'
                    """, status, PUBLIC_STATUS.get(status), (Object) uuidArray(bill.sessionIds()));
            affectedTables = bill.members();
        } else {
            affectedTables = jdbc.queryForList("SELECT table_id FROM orders WHERE order_id::text=?", String.class, orderId);
            updated = jdbc.update("""
                    UPDATE orders SET status=?,public_status=?,status_updated_at=now(),updated_at=now()
                    WHERE order_id::text=? AND status<>'CANCELLED' AND payment_status<>'PAID'
                    """, status, PUBLIC_STATUS.get(status), orderId);
        }
        if (updated == 0) throw ApiException.notFound("ORDER_NOT_FOUND", "주문 정보를 찾을 수 없습니다.");
        audit(staff, "ORDER_STATUS_CHANGED", orderId == null ? "TABLE" : "ORDER", orderId == null ? tableId : orderId, null, status);
        for (String affected : affectedTables) events.publish("order.updated", orderId == null ? tableId : orderId, affected, Map.of("status", status));
        return null;
    }

    public Map<String, Object> queues() {
        List<Map<String, Object>> kitchen = jdbc.query("""
                SELECT o.order_id,s.table_id,o.status,o.created_at,o.note,o.note_audience
                FROM orders o JOIN table_sessions s ON s.session_id=o.session_id
                WHERE o.status IN ('RECEIVED','CONFIRMED','PREPARING') AND o.payment_status<>'PAID'
                ORDER BY o.created_at
                """, (rs, index) -> ApiEnvelope.map(
                "orderId", rs.getString("order_id"), "tableId", rs.getString("table_id"),
                "status", "PREPARING".equals(rs.getString("status")) ? "COOKING" : "RECEIVED",
                "createdAt", instant(rs, "created_at"), "items", queueItems(rs.getObject("order_id", UUID.class)),
                "kitchenNote", noteFor(rs.getString("note"), rs.getString("note_audience"), "KITCHEN")));
        List<Map<String, Object>> serving = jdbc.query("""
                SELECT o.order_id,s.table_id,o.status_updated_at,o.note,o.note_audience
                FROM orders o JOIN table_sessions s ON s.session_id=o.session_id
                WHERE o.status='SERVING' AND o.payment_status<>'PAID' ORDER BY o.status_updated_at
                """, (rs, index) -> ApiEnvelope.map(
                "orderId", rs.getString("order_id"), "tableId", rs.getString("table_id"),
                "readyAt", instant(rs, "status_updated_at"), "items", queueItems(rs.getObject("order_id", UUID.class)),
                "servingNote", noteFor(rs.getString("note"), rs.getString("note_audience"), "SERVING")));
        List<Map<String, Object>> payment = new ArrayList<>();
        for (String tableId : jdbc.queryForList("""
                SELECT table_id FROM table_sessions WHERE status='OPEN' AND merged_into_session_id IS NULL ORDER BY opened_at
                """, String.class)) {
            Bill bill = bill(tableId, false);
            if (bill == null || bill.subtotal() == 0 || !"UNPAID".equals(bill.paymentStatus())) continue;
            String servedAt = jdbc.query("""
                    SELECT max(status_updated_at) FROM orders WHERE session_id = ANY(?::uuid[]) AND status='COMPLETED'
                    """, rs -> rs.next() && rs.getObject(1) != null ? rs.getObject(1, OffsetDateTime.class).toInstant().toString() : null,
                    (Object) uuidArray(bill.sessionIds()));
            payment.add(ApiEnvelope.map("tableId", tableId, "subtotalAmount", bill.subtotal(),
                    "discountRate", bill.discountRate(), "discountAmount", bill.discountAmount(),
                    "finalAmount", bill.finalAmount(), "paymentStatus", bill.paymentStatus(), "servedAt", servedAt));
        }
        return ApiEnvelope.map("kitchen", kitchen, "serving", serving, "payment", payment, "counts", stationCounts());
    }

    public Map<String, Object> menu() {
        List<Map<String, Object>> categories = jdbc.query("SELECT category_id,label,heading FROM categories WHERE active=true ORDER BY sort_order",
                (rs, index) -> ApiEnvelope.map("id", rs.getString(1), "label", rs.getString(2), "heading", rs.getString(3)));
        List<Map<String, Object>> items = jdbc.query("""
                SELECT menu_id,category_id,name,base_price,available FROM menus ORDER BY sort_order,menu_id
                """, (rs, index) -> ApiEnvelope.map("itemId", rs.getString(1), "categoryId", rs.getString(2),
                "name", rs.getString(3), "price", rs.getInt(4), "soldOut", !rs.getBoolean(5)));
        return ApiEnvelope.map("categories", categories, "items", items);
    }

    @Transactional
    public Void availability(String itemId, boolean soldOut, StaffPrincipal staff) {
        int updated = jdbc.update("UPDATE menus SET available=?,updated_at=now() WHERE menu_id=?", !soldOut, itemId);
        if (updated == 0) throw ApiException.notFound("MENU_NOT_FOUND", "메뉴를 찾을 수 없습니다.");
        audit(staff, "MENU_AVAILABILITY_CHANGED", "MENU", itemId, null, soldOut ? "SOLD_OUT" : "AVAILABLE");
        events.publish("menu.updated", itemId, null, Map.of("soldOut", soldOut));
        return null;
    }

    public Map<String, Object> createOrder(Map<String, Object> body, StaffPrincipal staff) {
        var mutable = new LinkedHashMap<>(body);
        mutable.putIfAbsent("clientRequestId", UUID.randomUUID().toString());
        Object rawItems = body.get("items");
        if (!(rawItems instanceof List<?> items)) throw ApiException.invalid("items 값을 확인해 주세요.");
        mutable.put("items", items.stream().map(raw -> {
            if (!(raw instanceof Map<?, ?> item)) throw ApiException.invalid("items 값을 확인해 주세요.");
            return ApiEnvelope.map(
                    "menuId", item.get("itemId"),
                    "quantity", item.get("quantity"),
                    "selectedOptionIds", item.containsKey("selectedOptionIds") ? item.get("selectedOptionIds") : List.of());
        }).toList());
        Map<String, Object> result = customerOrders.create(mutable, true);
        return ApiEnvelope.map("orderId", result.get("orderId"), "displayCode", result.get("displayCode"));
    }

    @Transactional
    public Void updateOrder(Map<String, Object> body, StaffPrincipal staff) {
        String operation = string(body, "operation");
        String affectedTableId;
        String affectedOrderId;
        if ("quantity".equals(operation)) {
            UUID itemId = uuid(string(body, "itemId"));
            int quantity = number(body, "quantity");
            if (quantity < 1 || quantity > 99) throw ApiException.invalid("수량은 1~99 사이여야 합니다.");
            Map<String, Object> target = orderItemTarget(itemId);
            UUID orderId = (UUID) target.get("orderId");
            affectedOrderId = orderId.toString();
            affectedTableId = (String) target.get("tableId");
            jdbc.update("UPDATE order_items SET quantity=?,line_total=unit_price_snapshot*?,updated_at=now() WHERE order_item_id=?",
                    quantity, quantity, itemId);
            recalculateOrder(orderId);
        } else if ("cancel-item".equals(operation)) {
            UUID itemId = uuid(string(body, "itemId"));
            Map<String, Object> target = orderItemTarget(itemId);
            UUID orderId = (UUID) target.get("orderId");
            affectedOrderId = orderId.toString();
            affectedTableId = (String) target.get("tableId");
            jdbc.update("UPDATE order_items SET status='CANCELLED',updated_at=now() WHERE order_item_id=?", itemId);
            recalculateOrder(orderId);
        } else if ("note".equals(operation)) {
            String tableId = string(body, "tableId");
            String note = String.valueOf(body.getOrDefault("note", ""));
            if (note.length() > 200) throw ApiException.invalid("메모는 200자 이하여야 합니다.");
            String audience = String.valueOf(body.getOrDefault("audience", "general")).toUpperCase();
            if (!Set.of("GENERAL", "KITCHEN", "SERVING").contains(audience)) throw ApiException.invalid("메모 대상을 확인해 주세요.");
            Bill bill = requireBill(tableId);
            UUID latest = jdbc.query("SELECT order_id FROM orders WHERE session_id = ANY(?::uuid[]) ORDER BY created_at DESC LIMIT 1",
                    rs -> rs.next() ? rs.getObject(1, UUID.class) : null, (Object) uuidArray(bill.sessionIds()));
            if (latest == null) throw ApiException.notFound("ORDER_NOT_FOUND", "주문 정보를 찾을 수 없습니다.");
            jdbc.update("UPDATE orders SET note=?,note_audience=?,updated_at=now() WHERE order_id=?", note, audience, latest);
            affectedOrderId = latest.toString();
            affectedTableId = tableId;
        } else {
            throw ApiException.invalid("지원하지 않는 주문 수정입니다.");
        }
        audit(staff, "ORDER_UPDATED", "ORDER", affectedOrderId, null, operation);
        events.publish("order.updated", affectedOrderId, affectedTableId, Map.of("operation", operation));
        return null;
    }

    private Map<String, Object> orderItemTarget(UUID itemId) {
        Map<String, Object> target = jdbc.query("""
                SELECT oi.order_id, ts.table_id
                FROM order_items oi
                JOIN orders o ON o.order_id = oi.order_id
                JOIN table_sessions ts ON ts.session_id = o.session_id
                WHERE oi.order_item_id=? AND oi.status='ACTIVE'
                FOR UPDATE OF oi
                """, rs -> rs.next() ? Map.of(
                "orderId", rs.getObject("order_id", UUID.class),
                "tableId", rs.getString("table_id")) : null, itemId);
        if (target == null) throw ApiException.notFound("ORDER_ITEM_NOT_FOUND", "주문 항목을 찾을 수 없습니다.");
        return target;
    }

    @Transactional
    public Void cancelOrders(String tableId, StaffPrincipal staff) {
        Bill bill = requireBill(tableId); assertUnpaid(bill);
        jdbc.update("""
                UPDATE order_items SET status='CANCELLED',updated_at=now()
                WHERE order_id IN (SELECT order_id FROM orders WHERE session_id = ANY(?::uuid[]) AND status<>'CANCELLED')
                """, (Object) uuidArray(bill.sessionIds()));
        int count = jdbc.update("""
                UPDATE orders SET status='CANCELLED',public_status='cancelled',total_amount=0,
                  status_updated_at=now(),cancelled_at=now(),cancel_reason='운영진 전체 취소',updated_at=now()
                WHERE session_id = ANY(?::uuid[]) AND status<>'CANCELLED'
                """, (Object) uuidArray(bill.sessionIds()));
        if (count == 0) throw ApiException.notFound("ORDER_NOT_FOUND", "취소할 주문이 없습니다.");
        audit(staff, "ORDERS_CANCELLED", "TABLE_SESSION", bill.primarySessionId().toString(), null, String.valueOf(count));
        for (String member : bill.members()) events.publish("order.cancelled", bill.primarySessionId().toString(), member, Map.of("count", count));
        return null;
    }

    private Map<String, Object> tableSummary(String tableId, String displayName) {
        Bill bill = bill(tableId, false);
        if (bill == null) return ApiEnvelope.map("tableId", tableId, "displayName", displayName,
                "sessionStatus", "EMPTY", "orderStatus", null, "paymentStatus", null,
                "totalAmount", 0, "openedAt", null, "pendingItemCount", 0,
                "hasPendingCall", hasPendingCall(tableId), "mergeGroupLabel", null, "discountLabel", null);
        String status = aggregateOrderStatus(bill.sessionIds());
        Integer pending = jdbc.queryForObject("""
                SELECT count(*)::integer FROM order_items i JOIN orders o ON o.order_id=i.order_id
                WHERE o.session_id = ANY(?::uuid[]) AND i.status='ACTIVE' AND o.status NOT IN ('COMPLETED','CANCELLED')
                """, Integer.class, (Object) uuidArray(bill.sessionIds()));
        return ApiEnvelope.map("tableId", tableId, "displayName", displayName,
                "sessionStatus", "OPEN", "orderStatus", status, "paymentStatus", bill.paymentStatus(),
                "totalAmount", bill.finalAmount(), "openedAt", bill.openedAt().toString(),
                "pendingItemCount", pending == null ? 0 : pending, "hasPendingCall", hasPendingCall(tableId),
                "mergeGroupLabel", bill.members().size() > 1 ? String.join("+", bill.members()) : null,
                "discountLabel", bill.discountRate() > 0 ? bill.discountRate() + "% 할인" : null);
    }

    private Bill requireBill(String tableId) {
        Bill bill = bill(tableId, true);
        if (bill == null) throw ApiException.notFound("OPEN_SESSION_NOT_FOUND", "사용 중인 테이블이 아닙니다.");
        return bill;
    }

    private Bill bill(String tableId, boolean lock) {
        String suffix = lock ? " FOR UPDATE" : "";
        Session selected = jdbc.query("""
                SELECT session_id,table_id,merged_into_session_id,discount_rate,payment_status,opened_at
                FROM table_sessions WHERE table_id=? AND status='OPEN'
                """ + suffix, rs -> rs.next() ? new Session(rs.getObject(1, UUID.class), rs.getString(2),
                rs.getObject(3, UUID.class), rs.getInt(4), rs.getString(5),
                rs.getObject(6, OffsetDateTime.class).toInstant()) : null, tableId);
        if (selected == null) return null;
        UUID primaryId = selected.mergedInto() == null ? selected.id() : selected.mergedInto();
        List<Session> sessions = jdbc.query("""
                SELECT session_id,table_id,merged_into_session_id,discount_rate,payment_status,opened_at
                FROM table_sessions WHERE status='OPEN' AND (session_id=? OR merged_into_session_id=?)
                ORDER BY opened_at
                """ + suffix, (rs, index) -> new Session(rs.getObject(1, UUID.class), rs.getString(2),
                rs.getObject(3, UUID.class), rs.getInt(4), rs.getString(5),
                rs.getObject(6, OffsetDateTime.class).toInstant()), primaryId, primaryId);
        Session primary = sessions.stream().filter(row -> row.id().equals(primaryId)).findFirst().orElseThrow();
        List<UUID> ids = sessions.stream().map(Session::id).toList();
        Integer subtotal = jdbc.queryForObject("""
                SELECT COALESCE(sum(i.line_total),0)::integer FROM order_items i JOIN orders o ON o.order_id=i.order_id
                WHERE o.session_id = ANY(?::uuid[]) AND i.status='ACTIVE' AND o.status<>'CANCELLED'
                """, Integer.class, (Object) uuidArray(ids));
        int safeSubtotal = subtotal == null ? 0 : subtotal;
        int discount = safeSubtotal * primary.discountRate() / 100;
        return new Bill(primary.id(), primary.tableId(), ids, sessions.stream().map(Session::tableId).toList(),
                primary.openedAt(), primary.discountRate(), primary.paymentStatus(), safeSubtotal, discount, safeSubtotal - discount);
    }

    private void assertUnpaid(Bill bill) {
        if (!"UNPAID".equals(bill.paymentStatus())) throw ApiException.conflict("SESSION_ALREADY_PAID", "이미 결제 완료된 테이블입니다.");
    }

    private String aggregateOrderStatus(List<UUID> sessionIds) {
        List<String> values = jdbc.queryForList("""
                SELECT status FROM orders WHERE session_id = ANY(?::uuid[]) AND status<>'CANCELLED'
                """, String.class, (Object) uuidArray(sessionIds));
        if (values.isEmpty()) return null;
        Map<String, Integer> rank = Map.of("RECEIVED", 0, "CONFIRMED", 0, "PREPARING", 1, "SERVING", 2, "COMPLETED", 3);
        String internal = values.stream().min(Comparator.comparingInt(value -> rank.getOrDefault(value, 0))).orElse("RECEIVED");
        return Map.of("RECEIVED", "RECEIVED", "CONFIRMED", "RECEIVED", "PREPARING", "COOKING",
                "SERVING", "READY", "COMPLETED", "SERVED").get(internal);
    }

    private Map<String, Integer> stationCounts() {
        Integer kitchen = jdbc.queryForObject("SELECT count(*)::integer FROM orders WHERE status IN ('RECEIVED','CONFIRMED','PREPARING') AND payment_status<>'PAID'", Integer.class);
        Integer serving = jdbc.queryForObject("SELECT count(*)::integer FROM orders WHERE status='SERVING' AND payment_status<>'PAID'", Integer.class);
        Integer payment = jdbc.queryForObject("SELECT count(*)::integer FROM table_sessions WHERE status='OPEN' AND payment_status='UNPAID' AND merged_into_session_id IS NULL", Integer.class);
        Integer tables = jdbc.queryForObject("SELECT count(DISTINCT table_id)::integer FROM calls WHERE status='PENDING'", Integer.class);
        return Map.of("tables", safe(tables), "kitchen", safe(kitchen), "serving", safe(serving), "payment", safe(payment));
    }

    private Map<String, Object> pendingCall(String tableId) {
        return jdbc.query("""
                SELECT count(*)::integer count,min(created_at) first_at,max(created_at) last_at,
                  array_agg(call_id ORDER BY created_at) ids,array_agg(DISTINCT reason) reasons
                FROM calls WHERE table_id=? AND status='PENDING'
                """, rs -> {
            if (!rs.next() || rs.getInt("count") == 0) return null;
            return ApiEnvelope.map("count", rs.getInt("count"), "reasons", arrayStrings(rs.getArray("reasons")),
                    "firstCalledAt", instant(rs, "first_at"), "lastCalledAt", instant(rs, "last_at"),
                    "callIds", arrayStrings(rs.getArray("ids")));
        }, tableId);
    }

    private boolean hasPendingCall(String tableId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM calls WHERE table_id=? AND status='PENDING')", Boolean.class, tableId));
    }

    private List<Map<String, Object>> queueItems(UUID orderId) {
        return jdbc.query("SELECT menu_name_snapshot,quantity FROM order_items WHERE order_id=? AND status='ACTIVE' ORDER BY line_no",
                (rs, index) -> ApiEnvelope.map("name", rs.getString(1), "quantity", rs.getInt(2)), orderId);
    }

    private void recalculateOrder(UUID orderId) {
        jdbc.update("""
                UPDATE orders SET total_amount=(SELECT COALESCE(sum(line_total),0) FROM order_items WHERE order_id=? AND status='ACTIVE'),updated_at=now()
                WHERE order_id=?
                """, orderId, orderId);
    }

    private void audit(StaffPrincipal staff, String action, String entityType, String entityId, String from, String to) {
        jdbc.update("""
                INSERT INTO audit_logs(log_id,actor_type,actor_id,action,entity_type,entity_id,from_value,to_value)
                VALUES(?,'STAFF',?,?,?,?,?,?)
                """, UUID.randomUUID(), staff.deviceLabel(), action, entityType, entityId, from, to);
    }

    private int settingInt(String key) {
        Integer result = jdbc.queryForObject("SELECT value::integer FROM settings WHERE key=?", Integer.class, key);
        return result == null ? 0 : result;
    }

    private void lockTables(String first, String second) {
        java.util.stream.Stream.of(first, second).distinct().sorted().forEach(tableId ->
                jdbc.query("SELECT table_id FROM tables WHERE table_id=? FOR UPDATE", rs -> null, tableId));
    }

    private static int safe(Integer value) { return value == null ? 0 : value; }
    private static String noteFor(String note, String audience, String station) {
        return note != null && ("GENERAL".equals(audience) || station.equals(audience)) ? note : null;
    }
    private static String string(Map<String, Object> body, String field) {
        String value = optional(body, field);
        if (value == null) throw ApiException.invalid(field + " 값을 확인해 주세요.");
        return value;
    }
    private static String optional(Map<String, Object> body, String field) {
        Object value = body.get(field); if (value == null || String.valueOf(value).isBlank()) return null; return String.valueOf(value);
    }
    private static int number(Map<String, Object> body, String field) {
        if (!(body.get(field) instanceof Number number)) throw ApiException.invalid(field + " 값을 확인해 주세요.");
        return number.intValue();
    }
    private static UUID uuid(String value) { try { return UUID.fromString(value); } catch (Exception e) { throw ApiException.invalid("UUID 값을 확인해 주세요."); } }
    private static String instant(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        return rs.getObject(column, OffsetDateTime.class).toInstant().toString();
    }
    private static List<String> arrayStrings(java.sql.Array array) throws java.sql.SQLException {
        if (array == null) return List.of();
        Object[] raw = (Object[]) array.getArray();
        List<String> result = new ArrayList<>(); for (Object item : raw) result.add(String.valueOf(item)); return result;
    }
    private static String uuidArray(List<UUID> ids) { return "{" + ids.stream().map(UUID::toString).collect(java.util.stream.Collectors.joining(",")) + "}"; }

    private record Session(UUID id, String tableId, UUID mergedInto, int discountRate, String paymentStatus, Instant openedAt) {}
    private record Bill(UUID primarySessionId, String primaryTableId, List<UUID> sessionIds, List<String> members,
                        Instant openedAt, int discountRate, String paymentStatus, int subtotal, int discountAmount, int finalAmount) {}
}

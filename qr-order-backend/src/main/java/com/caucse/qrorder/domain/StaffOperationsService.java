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
import java.util.UUID;

@Service
public class StaffOperationsService {
    private static final Map<String, String> REMOTE_STATUS = Map.of(
            "RECEIVED", "RECEIVED", "COOKING", "PREPARING", "READY", "SERVING", "SERVED", "COMPLETED");
    private final JdbcTemplate jdbc;
    private final CustomerOrderService customerOrders;
    private final DomainEventService events;
    private final TableOrderScope orderScope;
    private final TableVisitService visits;
    private final PreparationService preparation;

    public StaffOperationsService(JdbcTemplate jdbc, CustomerOrderService customerOrders, DomainEventService events, TableOrderScope orderScope, TableVisitService visits, PreparationService preparation) {
        this.jdbc = jdbc;
        this.customerOrders = customerOrders;
        this.events = events;
        this.orderScope = orderScope;
        this.visits = visits;
        this.preparation = preparation;
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
        visits.lock();
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

    // Nested row mapping must reuse the transaction's connection instead of borrowing a
    // second pool slot per request; otherwise concurrent staff refreshes can exhaust the pool.
    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Map<String, Object> listTables() {
        List<Map<String, Object>> tables = jdbc.query("SELECT table_id,display_name FROM tables WHERE active=true ORDER BY sort_order,table_id",
                (rs, index) -> tableSummary(rs.getString(1), rs.getString(2)));
        return ApiEnvelope.map("tables", tables, "stationCounts", stationCounts(), "serverTime", Instant.now().toString());
    }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Map<String, Object> tableDetail(String tableId) {
        String displayName = jdbc.query("SELECT display_name FROM tables WHERE table_id=?",
                rs -> rs.next() ? rs.getString(1) : null, tableId);
        if (displayName == null) throw ApiException.notFound("TABLE_NOT_FOUND", "테이블을 찾을 수 없습니다.");
        Bill bill = bill(tableId, false);
        if (bill == null) {
            return ApiEnvelope.map("sessionId", null, "tableId", tableId, "displayName", displayName, "orderStatus", null,
                    "openedAt", null, "mergedTableIds", List.of(), "originTableId", null,
                    "subtotalAmount", 0, "discountRate", 0, "discountAmount", 0, "finalAmount", 0,
                    "paymentStatus", null, "orderCount", 0, "items", List.of(), "notes", List.of(), "call", pendingCall(tableId));
        }
        List<Map<String, Object>> items = jdbc.query("""
                SELECT i.order_item_id,i.menu_name_snapshot,i.quantity,i.line_total,i.status,i.preparation_status,
                       o.note,o.note_audience,o.created_at,o.table_id,o.payment_method,o.coin_received_at,i.coin_unit_price,i.preparation_station
                FROM order_items i JOIN orders o ON o.order_id=i.order_id
                WHERE o.session_id = ANY(?::uuid[]) ORDER BY o.created_at,i.line_no
                """, (rs, index) -> ApiEnvelope.map(
                "tableId", rs.getString("table_id"), "itemId", rs.getString("order_item_id"), "name", rs.getString("menu_name_snapshot"),
                "quantity", rs.getInt("quantity"), "lineTotal", rs.getInt("line_total"),
                "status", rs.getString("status"), "preparationStatus", rs.getString("preparation_status"),
                "note", rs.getString("note"), "paymentMethod",rs.getString("payment_method"),"coinAmount",rs.getInt("coin_unit_price")*rs.getInt("quantity"), "coinReceived",rs.getObject("coin_received_at")!=null,"preparationStation",rs.getString("preparation_station"),"preparationLocked",preparation.locked(rs.getObject("order_item_id",UUID.class))), (Object) uuidArray(bill.sessionIds()));
        String tableNote = jdbc.query("""
                SELECT table_note FROM table_sessions
                WHERE session_id = ANY(?::uuid[]) AND table_note IS NOT NULL AND table_note<>''
                ORDER BY (session_id=?) DESC,opened_at LIMIT 1
                """, rs -> rs.next() ? rs.getString(1) : null,
                (Object) uuidArray(bill.sessionIds()), bill.primarySessionId());
        List<Map<String, Object>> notes = tableNote == null || tableNote.isBlank() ? List.of() :
                List.of(ApiEnvelope.map("noteId", bill.primarySessionId().toString(), "audience", "general", "text", tableNote));
        Integer orderCount = jdbc.queryForObject("""
                SELECT count(*)::integer FROM orders
                WHERE session_id = ANY(?::uuid[]) AND order_kind='GUEST' AND status<>'CANCELLED'
                """, Integer.class, (Object) uuidArray(bill.sessionIds()));
        List<Map<String, Object>> mergeMembers = jdbc.query("""
                SELECT s.table_id,s.discount_rate,
                       COALESCE(sum(o.total_amount) FILTER (WHERE o.order_kind='GUEST' AND o.status<>'CANCELLED'),0)::integer subtotal,
                       count(o.order_id) FILTER (WHERE o.order_kind='GUEST' AND o.status<>'CANCELLED')::integer order_count
                FROM table_sessions s LEFT JOIN orders o ON o.session_id=s.session_id
                WHERE s.session_id = ANY(?::uuid[]) GROUP BY s.session_id ORDER BY s.table_id
                """, (rs, index) -> ApiEnvelope.map("tableId", rs.getString("table_id"),
                "amount", rs.getInt("subtotal") - rs.getInt("subtotal") * rs.getInt("discount_rate") / 100,
                "orderCount", rs.getInt("order_count")), (Object) uuidArray(bill.sessionIds()));
        List<String> merged = bill.members().stream().filter(id -> !id.equals(bill.primaryTableId())).toList();
        return ApiEnvelope.map(
                "sessionId", bill.primarySessionId().toString(), "tableId", tableId, "displayName", displayName,
                "orderStatus", aggregateOrderStatus(bill.sessionIds()),
                "openedAt", (bill.openedAt()==null ? null : bill.openedAt().toString()), "departureAt",departure(bill.primarySessionId()), "mergedTableIds", merged,
                "originTableId", merged.isEmpty() ? null : bill.primaryTableId(),
                "subtotalAmount", bill.subtotal(), "discountRate", bill.discountRate(),
                "discountAmount", bill.discountAmount(), "finalAmount", bill.finalAmount(),
                "paymentStatus", bill.paymentStatus(), "orderCount", safe(orderCount), "mergeMembers", mergeMembers, "items", items, "notes", notes,
                "call", pendingCall(tableId));
    }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Map<String, Object> billResponse(String tableId) {
        Bill bill = bill(tableId, false);
        if (bill == null) throw ApiException.notFound("OPEN_SESSION_NOT_FOUND", "사용 중인 테이블이 아닙니다.");
        List<Map<String, Object>> serviceLines = jdbc.query("""
                SELECT o.display_code,o.service_message,sm.name AS charged_staff_name,
                       COALESCE(sum(i.line_total) FILTER (WHERE i.status='ACTIVE'),0)::integer gross_amount
                FROM orders o
                JOIN staff_members sm ON sm.staff_id=o.charged_staff_id
                LEFT JOIN order_items i ON i.order_id=o.order_id
                WHERE o.session_id = ANY(?::uuid[]) AND o.order_kind='SERVICE' AND o.status<>'CANCELLED'
                GROUP BY o.order_id,o.display_code,o.service_message,sm.name,o.created_at
                ORDER BY o.created_at
                """, (rs, index) -> ApiEnvelope.map(
                "displayCode", rs.getString("display_code"),
                "serviceMessage", rs.getString("service_message"),
                "grossAmount", rs.getInt("gross_amount"),
                "chargedStaffName", rs.getString("charged_staff_name")),
                (Object) uuidArray(bill.sessionIds()));
        Integer orderCount = jdbc.queryForObject("""
                SELECT count(*)::integer FROM orders
                WHERE session_id = ANY(?::uuid[]) AND status<>'CANCELLED'
                """, Integer.class, (Object) uuidArray(bill.sessionIds()));
        int serviceGrossAmount = serviceLines.stream()
                .mapToInt(line -> (Integer) line.get("grossAmount"))
                .sum();
        List<String> merged = bill.members().stream()
                .filter(member -> !member.equals(bill.primaryTableId()))
                .toList();
        String originTableId = jdbc.queryForObject(
                "SELECT origin_table_id FROM table_sessions WHERE session_id=?", String.class, bill.primarySessionId());
        return ApiEnvelope.map("sessionId", bill.primarySessionId().toString(), "tableId", tableId,
                "originTableId", originTableId, "mergedTableIds", merged,
                "subtotalAmount", bill.subtotal(),
                "discountRate", bill.discountRate(), "discountAmount", bill.discountAmount(),
                "finalAmount", bill.finalAmount(), "paymentStatus", bill.paymentStatus(),
                "orderCount", safe(orderCount), "serviceOrderCount", serviceLines.size(),
                "serviceGrossAmount", serviceGrossAmount, "serviceLines", serviceLines);
    }

    @Transactional
    public Void discount(String tableId, int rate, StaffPrincipal staff) {
        visits.lock();
        int configured = settingInt("TABLE_DISCOUNT_RATE");
        if (rate != 0 && rate != configured) throw ApiException.invalid("할인율을 확인해 주세요.");
        Bill bill = requireBill(tableId);
        assertUnpaid(bill);
        jdbc.update("UPDATE table_sessions SET discount_rate=?,updated_at=now() WHERE session_id=?", rate, bill.primarySessionId());
        audit(staff, "TABLE_DISCOUNT_CHANGED", "TABLE_SESSION", bill.primarySessionId().toString(),
                String.valueOf(bill.discountRate()), String.valueOf(rate));
        for (String member : orderScope.audience(bill.primarySessionId())) events.publish("table.updated", tableId, member, Map.of("operation", "discount"));
        return null;
    }

    @Transactional
    public Void move(String from, String to, StaffPrincipal staff) {
        visits.lock();
        if (from.equals(to)) throw ApiException.invalid("이동할 테이블을 다시 선택해 주세요.");
        lockTables(from, to);
        Bill source = requireBill(from);
        if (source.sessionIds().size() > 1) throw ApiException.conflict("MERGED_SESSION_MOVE_NOT_ALLOWED", "합석을 먼저 분리해 주세요.");
        Boolean destinationOccupied = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM table_sessions WHERE table_id=? AND status IN ('OPEN','PREPARED'))",
                Boolean.class, to);
        Boolean destinationActive = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM tables WHERE table_id=? AND active=true)", Boolean.class, to);
        if (!Boolean.TRUE.equals(destinationActive)) throw ApiException.notFound("TABLE_NOT_FOUND", "이동할 테이블을 찾을 수 없습니다.");
        if (Boolean.TRUE.equals(destinationOccupied)) throw ApiException.conflict("DESTINATION_OCCUPIED", "이미 사용 중인 테이블입니다.");
        List<String> audience = orderScope.audience(source.primarySessionId());
        jdbc.update("UPDATE table_sessions SET table_id=?,updated_at=now() WHERE session_id=?", to, source.primarySessionId());
        audit(staff, "TABLE_MOVED", "TABLE_SESSION", source.primarySessionId().toString(), from, to);
        for (String member : audience) events.publish("table.updated", source.primarySessionId().toString(), member, Map.of("operation", "move", "to", to));
        events.publish("table.updated", source.primarySessionId().toString(), to, Map.of("operation", "move", "from", from));
        return null;
    }

    @Transactional
    public Void merge(String primaryTable, String secondaryTable, StaffPrincipal staff) {
        visits.lock();
        if (primaryTable.equals(secondaryTable)) throw ApiException.invalid("서로 다른 테이블을 선택해 주세요.");
        lockTables(primaryTable, secondaryTable);
        visits.prepare(primaryTable); visits.prepare(secondaryTable);
        Bill primary = requireBill(primaryTable);
        Bill secondary = requireBill(secondaryTable);
        assertUnpaid(primary); assertUnpaid(secondary);
        if (primary.primarySessionId().equals(secondary.primarySessionId()) || secondary.sessionIds().size() > 1) {
            throw ApiException.conflict("MERGE_CHAIN_NOT_ALLOWED", "같은 그룹 또는 다른 합석 그룹은 합칠 수 없습니다. 독립 테이블을 선택해 주세요.");
        }
        jdbc.update("UPDATE table_sessions SET merged_into_session_id=?,updated_at=now() WHERE session_id=?",
                primary.primarySessionId(), secondary.primarySessionId());
        if(primary.openedAt()!=null || secondary.openedAt()!=null) visits.activate(primaryTable);
        jdbc.update("UPDATE table_sessions SET departure_at=(SELECT departure_at FROM table_sessions WHERE session_id=?) WHERE session_id=?",primary.primarySessionId(),secondary.primarySessionId());
        audit(staff, "TABLES_MERGED", "TABLE_SESSION", primary.primarySessionId().toString(), secondaryTable, primaryTable);
        for (String member : java.util.stream.Stream.concat(orderScope.audience(primary.primarySessionId()).stream(),java.util.stream.Stream.concat(primary.members().stream(),secondary.members().stream())).distinct().toList()) {
            events.publish("table.updated", primary.primarySessionId().toString(), member, Map.of("operation", "merge"));
        }
        return null;
    }

    @Transactional
    public Void split(String tableId, StaffPrincipal staff) {
        visits.lock();
        Bill bill = requireBill(tableId);
        if (bill.sessionIds().size() < 2) throw ApiException.conflict("TABLE_NOT_MERGED", "합석 상태가 아닙니다.");
        List<String> audience = java.util.stream.Stream.concat(orderScope.audience(bill.primarySessionId()).stream(),bill.members().stream()).distinct().toList();
        jdbc.update("UPDATE table_sessions SET merged_into_session_id=NULL,updated_at=now() WHERE merged_into_session_id=?",
                bill.primarySessionId());
        audit(staff, "TABLES_SPLIT", "TABLE_SESSION", bill.primarySessionId().toString(), "MERGED", "SPLIT");
        for (String member : audience) events.publish("table.updated", member, member, Map.of("operation", "split"));
        return null;
    }

    @Transactional
    public Void saveTableNote(String tableId, String note, StaffPrincipal staff) {
        visits.lock();
        String normalized = note.strip();
        if (normalized.length() > 200) throw ApiException.invalid("메모는 200자 이하여야 합니다.");
        Bill bill = requireBill(tableId);
        String previous = jdbc.queryForObject(
                "SELECT table_note FROM table_sessions WHERE session_id=?", String.class, bill.primarySessionId());
        jdbc.update("UPDATE table_sessions SET table_note=?,updated_at=now() WHERE session_id=?",
                normalized.isEmpty() ? null : normalized, bill.primarySessionId());
        audit(staff, "TABLE_NOTE_CHANGED", "TABLE_SESSION", bill.primarySessionId().toString(), previous, normalized);
        for (String member : bill.members()) {
            events.publish("table.updated", bill.primarySessionId().toString(), member, Map.of("operation", "note"));
        }
        return null;
    }

    @Transactional
    public Void resetTable(String tableId, String expectedSessionId, StaffPrincipal staff) {
        visits.lock();
        UUID expected = uuid(expectedSessionId);
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class, expected.toString());
        Map<String, Object> expectedRow = jdbc.query("""
                SELECT status,close_reason,table_id,origin_table_id
                FROM table_sessions WHERE session_id=?
                """, rs -> rs.next() ? ApiEnvelope.map(
                "status", rs.getString("status"), "closeReason", rs.getString("close_reason"),
                "tableId", rs.getString("table_id"), "originTableId", rs.getString("origin_table_id")) : null,
                expected);
        if (expectedRow == null) {
            throw ApiException.conflict("TABLE_SESSION_CHANGED", "방문 정보가 변경되었습니다. 테이블을 다시 확인해 주세요.");
        }
        boolean belongs = tableId.equals(expectedRow.get("tableId")) || tableId.equals(expectedRow.get("originTableId")) ||
                Boolean.TRUE.equals(jdbc.queryForObject("""
                        SELECT EXISTS(SELECT 1 FROM table_sessions WHERE merged_into_session_id=?
                          AND (table_id=? OR origin_table_id=?))
                        """, Boolean.class, expected, tableId, tableId));
        if (!belongs) {
            throw ApiException.conflict("TABLE_SESSION_CHANGED", "방문 정보가 변경되었습니다. 테이블을 다시 확인해 주세요.");
        }
        if ("CLOSED".equals(expectedRow.get("status"))) {
            if ("STAFF_RESET".equals(expectedRow.get("closeReason"))) return null;
            throw ApiException.conflict("TABLE_SESSION_CHANGED", "이미 종료된 방문입니다. 테이블을 다시 확인해 주세요.");
        }

        Bill bill = requireBill(tableId);
        assertUnpaid(bill);
        if (!bill.primarySessionId().equals(expected)) {
            throw ApiException.conflict("TABLE_SESSION_CHANGED", "방문 정보가 변경되었습니다. 테이블을 다시 확인해 주세요.");
        }

        assertNoReceivedCoins(bill);
        jdbc.update("""
                UPDATE order_items SET status='CANCELLED',updated_at=now()
                WHERE order_id IN (
                  SELECT order_id FROM orders
                  WHERE session_id = ANY(?::uuid[]) AND order_kind='GUEST'
                    AND payment_status<>'PAID' AND status NOT IN ('COMPLETED','CANCELLED'))
                """, (Object) uuidArray(bill.sessionIds()));
        int cancelled = jdbc.update("""
                UPDATE orders SET status='CANCELLED',public_status='cancelled',status_updated_at=now(),
                  cancelled_at=now(),cancel_reason='테이블 초기화',updated_at=now()
                WHERE session_id = ANY(?::uuid[]) AND order_kind='GUEST'
                  AND payment_status<>'PAID' AND status NOT IN ('COMPLETED','CANCELLED')
                """, (Object) uuidArray(bill.sessionIds()));
        int calls = 0;
        for (String member : bill.members()) {
            calls += jdbc.update("""
                    UPDATE calls SET status='CANCELLED',cancelled_at=now(),updated_at=now()
                    WHERE table_id=? AND status='PENDING'
                    """, member);
        }
        List<String> audience = orderScope.audience(bill.primarySessionId());
        jdbc.update("""
                UPDATE table_sessions SET status='CLOSED',close_reason='STAFF_RESET',subtotal_amount=?,
                  discount_amount=?,final_amount=?,closed_at=now(),updated_at=now()
                WHERE session_id = ANY(?::uuid[])
                """, bill.subtotal(), bill.discountAmount(), bill.finalAmount(), (Object) uuidArray(bill.sessionIds()));
        String result = "cancelledOrders=" + cancelled + ",cancelledCalls=" + calls;
        audit(staff, "TABLE_RESET", "TABLE_SESSION", bill.primarySessionId().toString(), "OPEN", result);
        for (String member : audience) {
            events.publish("table.reset", bill.primarySessionId().toString(), member,
                    Map.of("cancelledOrders", cancelled, "cancelledCalls", calls));
        }
        return null;
    }

    @Transactional
    public Void updateItemPreparation(String itemIdValue, boolean ready, StaffPrincipal staff) {
        visits.lock();
        UUID itemId = uuid(itemIdValue);
        Map<String, Object> target = jdbc.query("""
                SELECT oi.order_item_id,oi.order_id,oi.preparation_status,o.table_id,o.status AS order_status,
                       o.payment_status,oi.preparation_station,ts.status AS session_status
                FROM order_items oi
                JOIN orders o ON o.order_id=oi.order_id
                JOIN table_sessions ts ON ts.session_id=o.session_id
                WHERE oi.order_item_id=? AND oi.status='ACTIVE' AND o.status<>'CANCELLED'
                FOR UPDATE OF oi,o,ts
                """, rs -> rs.next() ? ApiEnvelope.map(
                "orderId", rs.getObject("order_id", UUID.class),
                "preparationStatus", rs.getString("preparation_status"),
                "station",rs.getString("preparation_station"), "tableId", rs.getString("table_id"),
                "paymentStatus", rs.getString("payment_status"),
                "sessionStatus", rs.getString("session_status")) : null, itemId);
        if (target == null) throw ApiException.notFound("ORDER_ITEM_NOT_FOUND", "주문 항목을 찾을 수 없습니다.");
        if (!"OPEN".equals(target.get("sessionStatus")) || "PAID".equals(target.get("paymentStatus"))) {
            throw ApiException.conflict("ORDER_ITEM_NOT_EDITABLE", "종료된 방문의 조리 상태는 변경할 수 없습니다.");
        }
        if ("SERVING".equals(target.get("station"))) throw ApiException.invalid("음료는 서빙 화면에서 처리해 주세요.");
        String current = (String) target.get("preparationStatus");
        String next = ready ? "READY" : "PENDING";
        if ("SERVED".equals(current) || Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM order_preparation_units WHERE order_item_id=? AND status='SERVED')",Boolean.class,itemId))) {
            throw ApiException.conflict("ORDER_ITEM_ALREADY_SERVED", "서빙 완료된 품목은 되돌릴 수 없습니다.");
        }
        if (!current.equals(next)) {
            jdbc.update("""
                    UPDATE order_items SET preparation_status=?,prepared_at=CASE WHEN ?='READY' THEN now() ELSE NULL END,
                      updated_at=now() WHERE order_item_id=?
                    """, next, next, itemId);
            UUID orderId = (UUID) target.get("orderId");
            preparation.syncLine(itemId, UUID.randomUUID());
            recalculatePreparationOrder(orderId);
            audit(staff, "ORDER_ITEM_PREPARATION_CHANGED", "ORDER_ITEM", itemId.toString(), current, next);
            events.publishOrder("order.item.updated", itemId.toString(), orderId,
                    Map.of("orderId", orderId.toString(), "preparationStatus", next));
        }
        return null;
    }

    @Transactional
    public Void confirmPayment(String tableId, String expectedSessionIdValue,
                               String clientRequestIdValue, int expected, StaffPrincipal staff, String payerName) {
        visits.lock();
        if (payerName == null || payerName.strip().isEmpty() || payerName.strip().length() > 100) {
            throw ApiException.invalid("입금자명을 1~100자로 입력해 주세요.");
        }
        payerName = payerName.strip();
        UUID expectedSessionId = uuid(expectedSessionIdValue);
        UUID clientRequestId = uuid(clientRequestIdValue);
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class,
                clientRequestId.toString());
        Map<String, Object> prior = jdbc.query("""
                SELECT session_id,final_amount,payer_name FROM table_sessions WHERE payment_request_id=?
                """, rs -> rs.next() ? ApiEnvelope.map(
                "sessionId", rs.getObject("session_id", UUID.class),
                "finalAmount", rs.getInt("final_amount"), "payerName", rs.getString("payer_name")) : null, clientRequestId);
        if (prior != null) {
            if (!expectedSessionId.equals(prior.get("sessionId")) || expected != (Integer) prior.get("finalAmount") || !payerName.equals(prior.get("payerName"))) {
                throw ApiException.conflict("IDEMPOTENCY_CONFLICT", "동일 요청 ID에 다른 결제 정보가 사용되었습니다.");
            }
            return null;
        }

        Bill bill = requireBill(tableId);
        if (!bill.primarySessionId().equals(expectedSessionId)) {
            throw ApiException.conflict("TABLE_SESSION_CHANGED", "방문 정보가 변경되었습니다. 결제 금액을 다시 확인해 주세요.");
        }
        assertUnpaid(bill);
        if (bill.finalAmount() != expected) throw new ApiException(HttpStatus.CONFLICT, "BILL_AMOUNT_CHANGED",
                "결제 금액이 변경되었습니다. 다시 확인해 주세요.", false,
                Map.of("expectedFinalAmount", expected, "actualFinalAmount", bill.finalAmount()));
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM orders WHERE session_id=ANY(?::uuid[]) AND payment_method='COIN' AND status<>'CANCELLED' AND coin_received_at IS NULL)",Boolean.class,(Object)uuidArray(bill.sessionIds()))))
            throw ApiException.conflict("COINS_NOT_RECEIVED","미수령 엽전 주문을 먼저 확인해 주세요.");
        List<String> audience = orderScope.audience(bill.primarySessionId());
        jdbc.update("""
                UPDATE table_sessions SET payment_status='PAID',subtotal_amount=?,discount_amount=?,final_amount=?,
                  paid_at=now(),closed_at=now(),status='CLOSED',close_reason='PAYMENT',updated_at=now(),
                  payer_name=?,payment_confirmed_by=?
                WHERE session_id = ANY(?::uuid[])
                """, bill.subtotal(), bill.discountAmount(), bill.finalAmount(), payerName, staff.deviceLabel(), (Object) uuidArray(bill.sessionIds()));
        jdbc.update("""
                UPDATE orders SET payment_status='PAID',paid_at=now(),updated_at=now(),paid_discount_rate=?
                WHERE session_id = ANY(?::uuid[]) AND order_kind='GUEST' AND payment_method='KRW' AND status<>'CANCELLED'
                """,
                bill.discountRate(), (Object) uuidArray(bill.sessionIds()));
        jdbc.update("UPDATE table_sessions SET payment_request_id=? WHERE session_id=?",
                clientRequestId, bill.primarySessionId());
        audit(staff, "PAYMENT_CONFIRMED", "TABLE_SESSION", bill.primarySessionId().toString(), "UNPAID", String.valueOf(expected));
        for (String member : audience) events.publish("payment.confirmed", bill.primarySessionId().toString(), member, Map.of("amount", expected));
        return null;
    }

    /** Internal convenience for trusted callers; HTTP clients must provide both guards. */
    @Transactional
    public Void confirmPayment(String tableId, int expected, StaffPrincipal staff, String payerName) {
        visits.lock();
        Bill bill = requireBill(tableId);
        return confirmPayment(
                tableId,
                bill.primarySessionId().toString(),
                UUID.randomUUID().toString(),
                expected,
                staff, payerName);
    }

    @Transactional
    public Void updateStatus(Map<String, Object> request, StaffPrincipal staff) {
        visits.lock();
        String remote = string(request, "status");
        String status = REMOTE_STATUS.get(remote);
        if (status == null) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ORDER_STATUS_TRANSITION", "주문 상태를 변경할 수 없습니다.", false);
        String tableId = optional(request, "tableId");
        String orderId = optional(request, "orderId");
        if ("SERVED".equals(remote)) {
            boolean missing=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM orders o JOIN table_sessions s ON s.session_id=o.session_id WHERE o.payment_method='COIN' AND o.coin_received_at IS NULL AND o.status<>'CANCELLED' AND ((?::text IS NOT NULL AND o.order_id::text=?) OR (?::text IS NOT NULL AND s.session_id=ANY(?::uuid[]))))",Boolean.class,orderId,orderId,tableId,tableId==null?"{}":uuidArray(requireBill(tableId).sessionIds())));
            if(missing)throw ApiException.conflict("COINS_NOT_RECEIVED","엽전을 먼저 수령해 주세요.");
        }

        if ((tableId == null) == (orderId == null)) throw ApiException.invalid("tableId 또는 orderId 중 하나가 필요합니다.");
        int updated;
        List<String> affectedTables;
        if (tableId != null) {
            Bill bill = requireBill(tableId); assertUnpaid(bill);
            if ("READY".equals(remote)) {
                jdbc.update("""
                        UPDATE order_items SET preparation_status='READY',prepared_at=COALESCE(prepared_at,now()),updated_at=now()
                        WHERE order_id IN (SELECT order_id FROM orders WHERE session_id = ANY(?::uuid[]) AND status<>'CANCELLED')
                          AND status='ACTIVE' AND preparation_status<>'SERVED'
                        """, (Object) uuidArray(bill.sessionIds()));
            } else if ("SERVED".equals(remote)) {
                jdbc.update("""
                        UPDATE order_items SET preparation_status='SERVED',prepared_at=COALESCE(prepared_at,now()),
                          served_at=now(),updated_at=now()
                        WHERE order_id IN (SELECT order_id FROM orders WHERE session_id = ANY(?::uuid[]) AND status<>'CANCELLED')
                          AND status='ACTIVE'
                        """, (Object) uuidArray(bill.sessionIds()));
            }
            updated = jdbc.update("""
                    UPDATE orders SET status=?,public_status=?,status_updated_at=now(),updated_at=now()
                    WHERE session_id = ANY(?::uuid[]) AND status<>'CANCELLED'
                    """, status, CustomerOrderStatus.fromInternal(status), (Object) uuidArray(bill.sessionIds()));
            for (UUID affectedOrder : jdbc.queryForList("SELECT order_id FROM orders WHERE session_id=ANY(?::uuid[]) AND status<>'CANCELLED'",UUID.class,(Object)uuidArray(bill.sessionIds()))) preparation.syncOrder(affectedOrder,"SERVED".equals(remote)?"FORCE_SERVED":remote);
            affectedTables = orderScope.audience(bill.primarySessionId());
        } else {
            affectedTables = jdbc.queryForList("SELECT table_id FROM orders WHERE order_id::text=?", String.class, orderId);
            UUID parsedOrderId = uuid(orderId);
            Boolean active = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM orders o JOIN table_sessions s ON s.session_id=o.session_id WHERE o.order_id=? AND s.status='OPEN' AND o.status<>'CANCELLED' AND o.payment_status<>'PAID')",Boolean.class,parsedOrderId);
            if (!Boolean.TRUE.equals(active)) throw ApiException.conflict("ORDER_NOT_ACTIVE", "진행 중인 주문이 아닙니다.");
            if ("READY".equals(remote)) {
                jdbc.update("""
                        UPDATE order_items SET preparation_status='READY',prepared_at=COALESCE(prepared_at,now()),updated_at=now()
                        WHERE order_id=? AND status='ACTIVE' AND preparation_status<>'SERVED'
                        """, parsedOrderId);
            } else if ("SERVED".equals(remote)) {
                jdbc.update("""
                        UPDATE order_items SET preparation_status='SERVED',prepared_at=COALESCE(prepared_at,now()),
                          served_at=now(),updated_at=now()
                        WHERE order_id=? AND status='ACTIVE' AND preparation_status='READY'
                        """, parsedOrderId);
            }
            updated = jdbc.update("""
                    UPDATE orders SET status=?,public_status=?,status_updated_at=now(),updated_at=now()
                    WHERE order_id::text=? AND status<>'CANCELLED' AND payment_status<>'PAID'
                    """, status, CustomerOrderStatus.fromInternal(status), orderId);
            if (updated > 0) preparation.syncOrder(parsedOrderId,remote);
            if (updated > 0 && "SERVED".equals(remote)) recalculatePreparationOrder(parsedOrderId);
        }
        if (updated == 0) throw ApiException.notFound("ORDER_NOT_FOUND", "주문 정보를 찾을 수 없습니다.");
        audit(staff, "ORDER_STATUS_CHANGED", orderId == null ? "TABLE" : "ORDER", orderId == null ? tableId : orderId, null, status);
        if (orderId != null) events.publishOrder("order.updated", orderId, uuid(orderId), Map.of("status", status));
        else for (String affected : affectedTables) events.publish("order.updated", tableId, affected, Map.of("status", status));
        return null;
    }

    // Nested row mapping must reuse the transaction's connection instead of borrowing a
    // second pool slot per request; otherwise concurrent staff refreshes can exhaust the pool.
    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Map<String, Object> queues() {
        List<Map<String, Object>> kitchen = preparation.kitchen();
        List<Map<String, Object>> serving = preparation.serving();
        List<Map<String, Object>> payment = new ArrayList<>();
        for (String tableId : jdbc.queryForList("""
                SELECT table_id FROM table_sessions WHERE status='OPEN' AND merged_into_session_id IS NULL ORDER BY opened_at
                """, String.class)) {
            Bill bill = bill(tableId, false);
            if (bill == null || !"UNPAID".equals(bill.paymentStatus())) continue;
            String servedAt = jdbc.query("""
                    SELECT max(status_updated_at) FROM orders WHERE session_id = ANY(?::uuid[]) AND status='COMPLETED'
                    """, rs -> rs.next() && rs.getObject(1) != null ? rs.getObject(1, OffsetDateTime.class).toInstant().toString() : null,
                    (Object) uuidArray(bill.sessionIds()));
            payment.add(ApiEnvelope.map("sessionId", bill.primarySessionId().toString(),
                    "tableId", tableId, "subtotalAmount", bill.subtotal(),
                    "discountRate", bill.discountRate(), "discountAmount", bill.discountAmount(),
                    "finalAmount", bill.finalAmount(), "paymentStatus", bill.paymentStatus(), "servedAt", servedAt));
        }
        String timeZone = setting("TIME_ZONE");
        payment.addAll(jdbc.query("""
                SELECT s.session_id,s.table_id,s.subtotal_amount,s.discount_rate,s.discount_amount,s.final_amount,
                       s.payer_name,s.payment_confirmed_by,s.paid_at,
                       COALESCE((
                         SELECT max(o.status_updated_at)
                         FROM orders o JOIN table_sessions member ON member.session_id=o.session_id
                         WHERE (member.session_id=s.session_id OR member.merged_into_session_id=s.session_id)
                           AND o.status='COMPLETED'
                       ),s.paid_at) AS served_at
                FROM table_sessions s
                WHERE s.status='CLOSED' AND s.close_reason='PAYMENT' AND s.merged_into_session_id IS NULL
                  AND (s.paid_at AT TIME ZONE ?)::date=(now() AT TIME ZONE ?)::date
                ORDER BY s.paid_at DESC
                """, (rs, index) -> ApiEnvelope.map(
                "sessionId", rs.getString("session_id"),
                "tableId", rs.getString("table_id"),
                "subtotalAmount", rs.getInt("subtotal_amount"),
                "discountRate", rs.getInt("discount_rate"),
                "discountAmount", rs.getInt("discount_amount"),
                "finalAmount", rs.getInt("final_amount"),
                "paymentStatus", "PAID", "payerName", rs.getString("payer_name"),
                "paymentConfirmedBy", rs.getString("payment_confirmed_by"), "paidAt", instant(rs, "paid_at"),
                "servedAt", instant(rs, "served_at")), timeZone, timeZone));
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
        visits.lock();
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
                    "quantity", item.get("quantity"));
        }).toList());
        Map<String, Object> result = customerOrders.create(mutable, true);
        return ApiEnvelope.map("orderId", result.get("orderId"), "displayCode", result.get("displayCode"));
    }

    @Transactional
    public Void updateOrder(Map<String, Object> body, StaffPrincipal staff) {
        visits.lock();
        String operation = string(body, "operation");
        String affectedOrderId;
        if ("quantity".equals(operation)) {
            UUID itemId = uuid(string(body, "itemId"));
            int quantity = number(body, "quantity");
            if (quantity < 1 || quantity > 99) throw ApiException.invalid("수량은 1~99 사이여야 합니다.");
            lockOrderItemSession(itemId);
            Map<String, Object> target = orderItemTarget(itemId);
            UUID orderId = (UUID) target.get("orderId");
            assertGuestOrder(target);
            if (preparation.locked(itemId)) throw ApiException.conflict("ORDER_ITEM_NOT_EDITABLE", "이미 조리 또는 서빙을 시작한 품목은 변경할 수 없습니다.");
            affectedOrderId = orderId.toString();
            jdbc.update("UPDATE order_items SET quantity=?,line_total=unit_price_snapshot*?,updated_at=now() WHERE order_item_id=?",
                    quantity, quantity, itemId);
            preparation.resize(itemId);
            recalculateOrder(orderId);
        } else if ("cancel-item".equals(operation)) {
            UUID itemId = uuid(string(body, "itemId"));
            lockOrderItemSession(itemId);
            Map<String, Object> target = orderItemTarget(itemId);
            UUID orderId = (UUID) target.get("orderId");
            assertGuestOrder(target);
            if (preparation.locked(itemId)) throw ApiException.conflict("ORDER_ITEM_NOT_EDITABLE", "이미 조리 또는 서빙을 시작한 품목은 변경할 수 없습니다.");
            affectedOrderId = orderId.toString();
            jdbc.update("UPDATE order_items SET status='CANCELLED',updated_at=now() WHERE order_item_id=?", itemId);
            recalculateOrder(orderId);
        } else {
            throw ApiException.invalid("지원하지 않는 주문 수정입니다.");
        }
        audit(staff, "ORDER_UPDATED", "ORDER", affectedOrderId, null, operation);
        events.publishOrder("order.updated", affectedOrderId, uuid(affectedOrderId), Map.of("operation", operation));
        return null;
    }

    private void lockOrderItemSession(UUID itemId) {
        String tableId = jdbc.query("""
                SELECT ts.table_id
                FROM order_items oi
                JOIN orders o ON o.order_id=oi.order_id
                JOIN table_sessions ts ON ts.session_id=o.session_id
                WHERE oi.order_item_id=? AND oi.status='ACTIVE'
                """, rs -> rs.next() ? rs.getString(1) : null, itemId);
        if (tableId == null) throw ApiException.notFound("ORDER_ITEM_NOT_FOUND", "주문 항목을 찾을 수 없습니다.");
        Bill bill = requireBill(tableId);
        assertUnpaid(bill);
    }

    private Map<String, Object> orderItemTarget(UUID itemId) {
        Map<String, Object> target = jdbc.query("""
                SELECT oi.order_id, ts.table_id, o.order_kind,o.payment_method,o.coin_received_at,oi.preparation_status,oi.preparation_station,ts.status AS session_status
                FROM order_items oi
                JOIN orders o ON o.order_id = oi.order_id
                JOIN table_sessions ts ON ts.session_id = o.session_id
                WHERE oi.order_item_id=? AND oi.status='ACTIVE'
                FOR UPDATE OF oi
                """, rs -> rs.next() ? Map.of(
                "orderId", rs.getObject("order_id", UUID.class),
                "tableId", rs.getString("table_id"),
                "orderKind", rs.getString("order_kind"), "paymentMethod",rs.getString("payment_method"),"coinReceived",rs.getObject("coin_received_at")!=null,"station",rs.getString("preparation_station"),
                "preparationStatus", rs.getString("preparation_status"),
                "sessionStatus", rs.getString("session_status")) : null, itemId);
        if (target == null) throw ApiException.notFound("ORDER_ITEM_NOT_FOUND", "주문 항목을 찾을 수 없습니다.");
        return target;
    }

    private void assertGuestOrder(Map<String, Object> target) {
        if ("SERVICE".equals(target.get("orderKind"))) {
            throw new ApiException(HttpStatus.CONFLICT, "SERVICE_ORDER_NOT_EDITABLE",
                    "서비스 주문은 수정할 수 없습니다. 취소 후 다시 지급해 주세요.", false);
        }
        if (Boolean.TRUE.equals(target.get("coinReceived"))) throw ApiException.conflict("COINS_ALREADY_RECEIVED","엽전 수령 후에는 주문을 변경할 수 없습니다.");
        if (!"OPEN".equals(target.get("sessionStatus")) || "SERVED".equals(target.get("preparationStatus")) || (!"SERVING".equals(target.get("station")) && !"PENDING".equals(target.get("preparationStatus")))) {
            throw ApiException.conflict("ORDER_ITEM_NOT_EDITABLE", "조리를 시작한 품목은 수량 변경이나 취소를 할 수 없습니다.");
        }
    }

    @Transactional
    public Void cancelOrders(String tableId, StaffPrincipal staff) {
        visits.lock();
        Bill bill = requireBill(tableId); assertUnpaid(bill); assertNoReceivedCoins(bill);
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
                WHERE o.session_id = ANY(?::uuid[]) AND i.status='ACTIVE' AND i.preparation_status<>'SERVED'
                  AND o.status NOT IN ('COMPLETED','CANCELLED')
                """, Integer.class, (Object) uuidArray(bill.sessionIds()));
        return ApiEnvelope.map("tableId", tableId, "displayName", displayName,
                "sessionStatus", bill.openedAt()==null ? "PREPARED" : "OPEN", "orderStatus", status, "paymentStatus", bill.paymentStatus(),
                "totalAmount", bill.finalAmount(), "openedAt", (bill.openedAt()==null ? null : bill.openedAt().toString()), "departureAt",departure(bill.primarySessionId()),
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
        if(lock) visits.lock();
        String suffix = lock ? " FOR UPDATE" : "";
        Session selected = jdbc.query("""
                SELECT session_id,table_id,merged_into_session_id,discount_rate,payment_status,opened_at
                FROM table_sessions WHERE table_id=? AND status IN ('OPEN','PREPARED')
                """ + suffix, rs -> rs.next() ? new Session(rs.getObject(1, UUID.class), rs.getString(2),
                rs.getObject(3, UUID.class), rs.getInt(4), rs.getString(5),
                (rs.getObject(6)==null ? null : rs.getObject(6, OffsetDateTime.class).toInstant())) : null, tableId);
        if (selected == null) return null;
        UUID primaryId = selected.mergedInto() == null ? selected.id() : selected.mergedInto();
        List<Session> sessions = jdbc.query("""
                SELECT session_id,table_id,merged_into_session_id,discount_rate,payment_status,opened_at
                FROM table_sessions WHERE status IN ('OPEN','PREPARED') AND (session_id=? OR merged_into_session_id=?)
                ORDER BY opened_at
                """ + suffix, (rs, index) -> new Session(rs.getObject(1, UUID.class), rs.getString(2),
                rs.getObject(3, UUID.class), rs.getInt(4), rs.getString(5),
                (rs.getObject(6)==null ? null : rs.getObject(6, OffsetDateTime.class).toInstant())), primaryId, primaryId);
        Session primary = sessions.stream().filter(row -> row.id().equals(primaryId)).findFirst().orElseThrow();
        List<UUID> ids = sessions.stream().map(Session::id).toList();
        Integer subtotal = jdbc.queryForObject("""
                SELECT COALESCE(sum(o.total_amount),0)::integer FROM orders o
                WHERE o.session_id = ANY(?::uuid[]) AND o.status<>'CANCELLED'
                """, Integer.class, (Object) uuidArray(ids));
        int safeSubtotal = subtotal == null ? 0 : subtotal;
        int discount = safeSubtotal * primary.discountRate() / 100;
        return new Bill(primary.id(), primary.tableId(), ids, sessions.stream().map(Session::tableId).toList(),
                primary.openedAt(), primary.discountRate(), primary.paymentStatus(), safeSubtotal, discount, safeSubtotal - discount);
    }

    private void assertNoReceivedCoins(Bill bill) {
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM orders WHERE session_id=ANY(?::uuid[]) AND status<>'CANCELLED' AND coin_received_at IS NOT NULL)", Boolean.class, (Object)uuidArray(bill.sessionIds()))))
            throw ApiException.conflict("COINS_ALREADY_RECEIVED", "이미 수령한 엽전 주문이 있습니다. 서빙과 결제 완료로 방문을 종료해 주세요.");
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
        Integer kitchen = jdbc.queryForObject("""
            SELECT count(DISTINCT (o.order_id,u.status)) FROM orders o JOIN table_sessions s ON s.session_id=o.session_id
            JOIN order_items i ON i.order_id=o.order_id JOIN order_preparation_units u USING(order_item_id)
            WHERE s.status='OPEN' AND o.status<>'CANCELLED' AND o.payment_status<>'PAID' AND i.status='ACTIVE'
              AND i.preparation_station='KITCHEN' AND u.status IN ('PENDING','COOKING')
            """,Integer.class);
        Integer serving = jdbc.queryForObject("""
            SELECT count(DISTINCT u.batch_id) FROM orders o JOIN table_sessions s ON s.session_id=o.session_id
            JOIN order_items i ON i.order_id=o.order_id JOIN order_preparation_units u USING(order_item_id)
            WHERE s.status='OPEN' AND o.status<>'CANCELLED' AND o.payment_status<>'PAID' AND i.status='ACTIVE' AND u.status='READY'
            """,Integer.class);
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

    private void recalculateOrder(UUID orderId) {
        jdbc.update("""
                UPDATE orders SET coin_total=CASE WHEN payment_method='COIN' THEN (SELECT COALESCE(sum(coin_unit_price*quantity),0) FROM order_items WHERE order_id=orders.order_id AND status='ACTIVE') ELSE 0 END,total_amount=(SELECT COALESCE(sum(line_total),0) FROM order_items WHERE order_id=? AND status='ACTIVE'),updated_at=now()
                WHERE order_id=?
                """, orderId, orderId);
        jdbc.update("UPDATE orders SET status='CANCELLED',public_status='cancelled',cancelled_at=now(),cancel_reason='모든 항목 취소',status_updated_at=now() WHERE order_id=? AND NOT EXISTS(SELECT 1 FROM order_items WHERE order_id=? AND status='ACTIVE')",orderId,orderId);
    }

    private void recalculatePreparationOrder(UUID orderId) {
        int[] counts = jdbc.query("""
                SELECT count(*) FILTER (WHERE preparation_status='PENDING')::integer,
                       count(*) FILTER (WHERE preparation_status='READY')::integer,
                       count(*) FILTER (WHERE preparation_status='SERVED')::integer
                FROM order_items WHERE order_id=? AND status='ACTIVE'
                """, rs -> rs.next() ? new int[]{rs.getInt(1), rs.getInt(2), rs.getInt(3)} : new int[3], orderId);
        int pending = counts[0];
        int ready = counts[1];
        int served = counts[2];
        String status;
        if (pending == 0 && ready == 0 && served > 0) status = "COMPLETED";
        else if (pending == 0 && ready > 0) status = "SERVING";
        else if (pending > 0) status = "PREPARING";
        else return;
        jdbc.update("UPDATE orders SET status=?,public_status=?,status_updated_at=now(),updated_at=now() WHERE order_id=?",
                status, CustomerOrderStatus.fromInternal(status), orderId);
    }

    private String departure(UUID id) { return jdbc.query("SELECT departure_at FROM table_sessions WHERE session_id=?",rs->rs.next() && rs.getObject(1)!=null?rs.getObject(1,OffsetDateTime.class).toInstant().toString():null,id); }
    @Transactional
    public Void checkIn(String tableId,String sessionId,String departure,StaffPrincipal staff) {
        visits.lock();
        visits.checkIn(tableId,sessionId,departure,staff.deviceLabel()); return null; }
    @Transactional
    public Void receiveCoins(String orderId,int expected,StaffPrincipal staff) {
        visits.lock();
        Map<String,Object> order=jdbc.query("SELECT o.coin_total,o.coin_received_at,o.payment_method,o.status,s.status session_status FROM orders o JOIN table_sessions s ON s.session_id=o.session_id WHERE o.order_id=? FOR UPDATE OF o,s",rs->rs.next()?ApiEnvelope.map("total",rs.getInt(1),"received",rs.getObject(2)!=null,"method",rs.getString(3),"status",rs.getString(4),"session",rs.getString(5)):null,uuid(orderId));
        if(order==null)throw ApiException.notFound("ORDER_NOT_FOUND","주문이 없습니다.");
        if(!"COIN".equals(order.get("method")) || !"OPEN".equals(order.get("session")) || "CANCELLED".equals(order.get("status")))throw ApiException.conflict("COIN_ORDER_NOT_ACTIVE","수령 가능한 엽전 주문이 아닙니다.");
        if(expected!=(Integer)order.get("total"))throw ApiException.conflict("COIN_AMOUNT_CHANGED","엽전 수량이 변경되었습니다. 다시 확인해 주세요.");
        if(Boolean.TRUE.equals(order.get("received")))return null;
        jdbc.update("UPDATE orders SET coin_received_at=now(),coin_received_by=?,updated_at=now() WHERE order_id=?",staff.deviceLabel(),uuid(orderId));
        audit(staff,"COINS_RECEIVED","ORDER",orderId,null,String.valueOf(expected));
        events.publishOrder("order.updated",orderId,uuid(orderId),Map.of("operation","coins-received"));
        return null;
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

    private String setting(String key) {
        String result = jdbc.queryForObject("SELECT value FROM settings WHERE key=?", String.class, key);
        if (result == null) throw new IllegalStateException("Missing setting " + key);
        return result;
    }

    private void lockTables(String first, String second) {
        visits.lock();
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

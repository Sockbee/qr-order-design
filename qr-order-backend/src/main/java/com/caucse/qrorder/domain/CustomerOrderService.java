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
import org.springframework.transaction.annotation.Isolation;

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
            "WATER_UTENSIL", "UTENSIL", "SIDE_PLATE", "ORDER_INQUIRY", "PAYMENT_REQUEST", "OTHER");
    private final JdbcTemplate jdbc;
    private final TableCatalogService catalog;
    private final DomainEventService events;
    private final ObjectMapper mapper;
    private final TableOrderScope orderScope;
    private final TableVisitService visits;
    private final OrderNumberAllocator numbers;
    private final PreparationService preparation;

    public CustomerOrderService(JdbcTemplate jdbc, TableCatalogService catalog,
                                DomainEventService events, ObjectMapper mapper, TableOrderScope orderScope, TableVisitService visits, OrderNumberAllocator numbers, PreparationService preparation) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.events = events;
        this.mapper = mapper;
        this.orderScope = orderScope;
        this.visits = visits;
        this.numbers = numbers;
        this.preparation = preparation;
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> request, boolean staff) {
        rejectUnexpected(request, staff
                ? Set.of("apiVersion", "tableId", "clientRequestId", "note", "items")
                : Set.of("apiVersion", "tableId", "tableToken", "clientRequestId", "expectedTotalAmount", "note", "items", "paymentMethod"), "request");
        String tableId = string(request, "tableId");
        TableCatalogService.TableRow table;
        if (staff) {
            table = jdbc.query("SELECT table_id,display_name,token_hash,active,sort_order FROM tables WHERE table_id=? AND active=true",
                    rs -> rs.next() ? new TableCatalogService.TableRow(rs.getString(1), rs.getString(2), rs.getString(3), rs.getBoolean(4), rs.getInt(5)) : null,
                    tableId);
            if (table == null) throw ApiException.notFound("TABLE_NOT_FOUND", "테이블을 찾을 수 없습니다.");
        } else {
            table = catalog.requireTable(tableId, string(request, "tableToken"), true);
        }

        List<Map<String, Object>> inputItems = mapList(request.get("items"));
        inputItems.forEach(item -> rejectUnexpected(
                item, Set.of("menuId", "quantity"), "items"));
        int maxLines = Integer.parseInt(setting("MAX_ORDER_LINES"));
        if (inputItems.isEmpty() || inputItems.size() > maxLines) {
            throw ApiException.invalid("주문 항목 수를 확인해 주세요.");
        }
        String note = nullableString(request.get("note"));
        if (note != null && note.length() > 200) throw ApiException.invalid("요청사항은 200자 이하여야 합니다.");

        String clientRequest = nullableString(request.get("clientRequestId"));
        UUID clientRequestId = clientRequest == null ? UUID.randomUUID() : parseUuid(clientRequest, "clientRequestId");
        String key = (staff ? "staff:" : "customer:") + tableId + ":" + clientRequestId;
        Integer expectedTotal = staff ? null : integer(request, "expectedTotalAmount");
        if (expectedTotal != null && expectedTotal < 0) {
            throw ApiException.invalid("expectedTotalAmount 값을 확인해 주세요.");
        }
        String method = request.getOrDefault("paymentMethod", "KRW").toString();
        if (!Set.of("KRW", "COIN").contains(method)) throw ApiException.invalid("결제 수단을 확인해 주세요.");
        boolean coin = "COIN".equals(method);
        String fingerprint = fingerprint(tableId, inputItems, note, expectedTotal) + method;
        fingerprint = StaffTokenService.sha256Hex(fingerprint);
        // The same table row also guards first-session creation and concurrent
        // replays of an idempotency key.
        visits.lockForTable(tableId);
        // Admin updates/QR rotation may have completed while waiting for the topology barrier.
        if (!staff) catalog.requireTable(tableId, string(request, "tableToken"), true);
        else if (!Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM tables WHERE table_id=? AND active)", Boolean.class, tableId)))
            throw ApiException.notFound("TABLE_NOT_FOUND", "테이블을 찾을 수 없습니다.");
        jdbc.queryForObject("SELECT table_id FROM tables WHERE table_id=? FOR UPDATE", String.class, tableId);
        Map<String, Object> replay = existingOrder(key, fingerprint);
        if (replay != null) return replay;

        if (!staff && !Boolean.parseBoolean(setting("EVENT_OPEN"))) {
            throw new ApiException(HttpStatus.CONFLICT, "EVENT_CLOSED", "현재 주문을 받고 있지 않습니다.", false);
        }

        UUID sessionId = openOrCreateSession(tableId);
        List<ValidatedLine> lines = new ArrayList<>();
        int total = 0;
        for (int index = 0; index < inputItems.size(); index++) {
            ValidatedLine line = validateLine(inputItems.get(index), index + 1, coin);
            lines.add(line);
            total = Math.addExact(total, line.lineTotal());
        }
        if (!staff) {
            if (expectedTotal != total) {
                throw new ApiException(HttpStatus.CONFLICT, "ORDER_PRICE_CHANGED",
                        "메뉴 가격이 변경되었습니다. 변경된 금액을 다시 확인해 주세요.", false,
                        ApiEnvelope.map(
                                "expectedTotalAmount", expectedTotal,
                                "actualTotalAmount", total,
                                "items", lines.stream().map(line -> ApiEnvelope.map(
                                        "lineNo", line.lineNo(),
                                        "unitPrice", line.unitPrice(),
                                        "lineTotal", line.lineTotal())).toList()));
            }
        }

        long displayNumber = nextDisplayNumber();
        String displayCode = setting("ORDER_PREFIX") + displayNumber;
        UUID orderId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO live_orders(order_id, display_number, display_code, client_request_id,
                  idempotency_key, request_fingerprint, table_id, session_id, status, public_status,
                  payment_status, total_amount, note, note_audience)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', 'accepted', 'UNPAID', ?, ?, 'GENERAL')
                """, orderId, displayNumber, displayCode, clientRequestId, key, fingerprint,
                tableId, sessionId, coin ? 0 : total, note);
        if (coin) jdbc.update("UPDATE live_orders SET payment_method='COIN',coin_total=?,payment_status='WAIVED' WHERE order_id=?", total, orderId);

        insertLines(orderId, lines);
        audit(staff ? "STAFF" : "CLIENT", staff ? "STAFF" : tableId, "ORDER_CREATED", "ORDER", orderId.toString(), null, displayCode);
        var response = hydrateCreated(orderId, false);
        events.publishOrder("order.created", orderId.toString(), orderId, Map.of("displayCode", displayCode));
        return response;
    }

    @Transactional
    public Map<String, Object> createService(Map<String, Object> request, String chargedStaffId,
                                             int discountRate, String actorId) {
        rejectUnexpected(request,
                Set.of("apiVersion", "tableId", "clientRequestId", "chargedStaffId", "serviceMessage", "items"), "request");
        String tableId = string(request, "tableId");
        TableCatalogService.TableRow table = jdbc.query("""
                SELECT table_id,display_name,token_hash,active,sort_order
                FROM tables WHERE table_id=? AND active=true
                """, rs -> rs.next() ? new TableCatalogService.TableRow(rs.getString(1), rs.getString(2),
                rs.getString(3), rs.getBoolean(4), rs.getInt(5)) : null, tableId);
        if (table == null) throw ApiException.notFound("TABLE_NOT_FOUND", "테이블을 찾을 수 없습니다.");

        List<Map<String, Object>> inputItems = mapList(request.get("items"));
        inputItems.forEach(item -> rejectUnexpected(
                item, Set.of("menuId", "quantity"), "items"));
        int maxLines = Integer.parseInt(setting("MAX_ORDER_LINES"));
        if (inputItems.isEmpty() || inputItems.size() > maxLines) {
            throw ApiException.invalid("주문 항목 수를 확인해 주세요.");
        }
        String serviceMessage = nullableString(request.get("serviceMessage"));
        if (serviceMessage != null && serviceMessage.length() > 100) {
            throw ApiException.invalid("손님에게 보낼 메시지는 100자 이하여야 합니다.");
        }
        if (discountRate < 0 || discountRate > 100) {
            throw new IllegalStateException("STAFF_DISCOUNT_RATE must be between 0 and 100");
        }

        UUID clientRequestId = parseUuid(string(request, "clientRequestId"), "clientRequestId");
        String key = "service:" + tableId + ":" + clientRequestId;
        String fingerprint = serviceFingerprint(tableId, chargedStaffId, inputItems, serviceMessage);

        visits.lockForTable(tableId);
        jdbc.queryForObject("SELECT table_id FROM tables WHERE table_id=? FOR UPDATE", String.class, tableId);
        Map<String, Object> replay = existingServiceOrder(key, fingerprint);
        if (replay != null) return replay;
        UUID sessionId = openOrCreateSession(tableId);
        String sessionPaymentStatus = jdbc.queryForObject(
                "SELECT payment_status FROM live_table_sessions WHERE session_id=?", String.class, sessionId);
        if (!"UNPAID".equals(sessionPaymentStatus)) {
            throw ApiException.conflict("SESSION_ALREADY_PAID", "이미 결제 완료된 테이블입니다.");
        }

        List<ValidatedLine> lines = new ArrayList<>();
        int grossAmount = 0;
        for (int index = 0; index < inputItems.size(); index++) {
            ValidatedLine line = validateLine(inputItems.get(index), index + 1);
            lines.add(line);
            grossAmount = Math.addExact(grossAmount, line.lineTotal());
        }
        int discountAmount = (int) (grossAmount * (long) discountRate / 100);
        int chargeAmount = grossAmount - discountAmount;

        long displayNumber = nextDisplayNumber();
        String displayCode = setting("ORDER_PREFIX") + displayNumber;
        UUID orderId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO live_orders(order_id, display_number, display_code, client_request_id,
                  idempotency_key, request_fingerprint, table_id, session_id, status, public_status,
                  payment_status, total_amount, note, note_audience, order_kind, service_message,
                  charged_staff_id, staff_charge_amount, staff_discount_rate)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', 'accepted', 'WAIVED', 0, NULL, 'GENERAL',
                  'SERVICE', ?, ?, ?, ?)
                """, orderId, displayNumber, displayCode, clientRequestId, key, fingerprint,
                tableId, sessionId, serviceMessage, chargedStaffId, chargeAmount, discountRate);

        insertLines(orderId, lines);
        String detailJson;
        try {
            detailJson = mapper.writeValueAsString(ApiEnvelope.map(
                    "chargedStaffId", chargedStaffId, "gross", grossAmount, "charge", chargeAmount));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
        jdbc.update("""
                INSERT INTO audit_logs(log_id,actor_type,actor_id,action,entity_type,entity_id,detail_json)
                VALUES(?,'STAFF',?,'SERVICE_ORDER_CREATED','ORDER',?,CAST(? AS jsonb))
                """, UUID.randomUUID(), actorId, orderId.toString(), detailJson);
        events.publishOrder("order.created", orderId.toString(), orderId,
                Map.of("displayCode", displayCode, "orderKind", "SERVICE"));

        return hydrateServiceCreated(orderId, false);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> get(Map<String, Object> request) {
        String tableId = string(request, "tableId");
        catalog.requireTable(tableId, string(request, "tableToken"), false);
        String orderId = nullableString(request.get("orderId"));
        String displayCode = nullableString(request.get("displayCode"));
        if ((orderId == null) == (displayCode == null)) throw ApiException.invalid("orderId 또는 displayCode 중 하나가 필요합니다.");
        String sessions = orderScope.sessionIds(orderScope.forTable(tableId));
        UUID id = jdbc.query(orderId != null
                        ? "SELECT order_id FROM live_orders WHERE order_id::text=? AND session_id = ANY(?::uuid[])"
                        : "SELECT order_id FROM live_orders WHERE display_code=? AND session_id = ANY(?::uuid[])",
                rs -> rs.next() ? UUID.fromString(rs.getString(1)) : null,
                orderId != null ? orderId : displayCode, sessions);
        if (id == null) throw ApiException.notFound("ORDER_NOT_FOUND", "주문 정보를 찾을 수 없습니다.");
        return hydrateCreated(id, true);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> list(Map<String, Object> request) {
        String tableId = string(request, "tableId");
        TableCatalogService.TableRow table = catalog.requireTable(tableId, string(request, "tableToken"), false);
        List<TableOrderScope.Session> sessions = orderScope.forTable(tableId);
        String sessionIds = orderScope.sessionIds(sessions);
        if (sessions.isEmpty()) {
            return ApiEnvelope.map(
                    "table", ApiEnvelope.map("tableId", table.tableId(), "displayName", table.displayName()),
                    "orders", List.of(), "groupTableIds", List.of(), "latestPublicStatus", null, "sessionTotalAmount", 0,
                    "activeCall", pendingCall(tableId));
        }
        List<Map<String, Object>> orders = jdbc.query("""
                SELECT o.order_id, o.display_code, o.status, o.public_status, o.total_amount,
                       o.order_kind, o.payment_method,o.coin_total,o.coin_received_at,o.service_message, sm.name AS charged_staff_name, o.created_at, o.table_id
                FROM live_orders o
                LEFT JOIN staff_members sm ON sm.staff_id=o.charged_staff_id
                WHERE o.session_id = ANY(?::uuid[]) ORDER BY o.created_at DESC,o.display_number DESC
                """, (rs, index) -> {
            UUID orderId = rs.getObject("order_id", UUID.class);
            Map<String, Object> row = ApiEnvelope.map(
                    "orderId", orderId.toString(), "displayCode", rs.getString("display_code"),
                    "tableId", rs.getString("table_id"),
                    "status", rs.getString("status"), "publicStatus", CustomerOrderStatus.fromInternal(rs.getString("status")),
                    "totalAmount", rs.getInt("total_amount"), "orderKind", rs.getString("order_kind"), "paymentMethod", rs.getString("payment_method"),
                    "coinTotal", rs.getInt("coin_total"), "coinReceived", rs.getObject("coin_received_at") != null,
                    "createdAt", rs.getObject("created_at", OffsetDateTime.class).toInstant().toString(),
                    "items", listItems(orderId));
            if ("SERVICE".equals(rs.getString("order_kind"))) {
                row.put("serviceMessage", rs.getString("service_message"));
                row.put("chargedStaffName", rs.getString("charged_staff_name"));
            }
            return row;
        }, sessionIds);
        String latest = orders.stream().filter(row -> !"cancelled".equals(row.get("publicStatus")))
                .map(row -> String.valueOf(row.get("publicStatus"))).findFirst().orElse(null);
        Integer total = jdbc.queryForObject("""
                SELECT COALESCE(sum(total_amount),0)::integer FROM live_orders
                WHERE session_id = ANY(?::uuid[]) AND status <> 'CANCELLED'
                """, Integer.class, sessionIds);
        return ApiEnvelope.map(
                "table", ApiEnvelope.map("tableId", table.tableId(), "displayName", table.displayName()),
                "orders", orders, "groupTableIds", sessions.stream().map(TableOrderScope.Session::tableId).toList(),
                "latestPublicStatus", latest, "sessionTotalAmount", total == null ? 0 : total,
                "activeCall", pendingCall(tableId));
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
        visits.lockForTable(tableId);
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class, requestId.toString());
        jdbc.queryForObject("SELECT table_id FROM tables WHERE table_id=? FOR UPDATE", String.class, tableId);
        Map<String, Object> replay = jdbc.query("SELECT call_id,table_id,reason,created_at,status,deleted_at FROM calls WHERE client_request_id=?",
                rs -> {
                    if (!rs.next()) return null;
                    if (rs.getObject("deleted_at") != null) throw ApiException.conflict("TEST_DATA_ARCHIVED", "운영 시작 전 테스트 호출입니다. 새 호출로 다시 요청해 주세요.");
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
                SELECT EXISTS(SELECT 1 FROM live_calls WHERE table_id=? AND created_at > now() - (? * interval '1 second'))
                """, Boolean.class, tableId, minSeconds);
        if (Boolean.TRUE.equals(tooSoon)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "CALL_TOO_FREQUENT",
                    "방금 호출했어요. 잠시 후 다시 시도해 주세요.", true);
        }
        UUID callId = UUID.randomUUID();
        jdbc.update("INSERT INTO live_calls(call_id,table_id,reason,status,client_request_id) VALUES(?,?,?,'PENDING',?)",
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
        visits.lockForTable(tableId);
        String status = jdbc.query("SELECT status FROM live_calls WHERE call_id=? AND table_id=? FOR UPDATE",
                rs -> rs.next() ? rs.getString(1) : null, callId, tableId);
        if (status == null) throw ApiException.notFound("CALL_NOT_FOUND", "호출 정보를 찾을 수 없습니다.");
        if (!"PENDING".equals(status)) throw ApiException.conflict("CALL_ALREADY_RESOLVED", "이미 직원이 확인한 호출입니다.");
        jdbc.update("UPDATE live_calls SET status='CANCELLED',cancelled_at=now(),updated_at=now() WHERE call_id=?", callId);
        audit("CLIENT", tableId, "CALL_CANCELLED", "CALL", callId.toString(), null, tableId);
        events.publish("call.cancelled", callId.toString(), tableId, Map.of());
        return null;
    }

    private Map<String, Object> existingOrder(String key, String fingerprint) {
        return jdbc.query("SELECT order_id,request_fingerprint,deleted_at FROM orders WHERE idempotency_key=?",
                rs -> {
                    if (!rs.next()) return null;
                    if (rs.getObject("deleted_at") != null) throw ApiException.conflict("TEST_DATA_ARCHIVED", "운영 시작 전 테스트 주문입니다. 새 주문으로 다시 요청해 주세요.");
                    if (!fingerprint.equals(rs.getString("request_fingerprint"))) {
                        throw ApiException.conflict("IDEMPOTENCY_CONFLICT", "동일 요청 ID에 다른 주문 정보가 사용되었습니다.");
                    }
                    return hydrateCreated(rs.getObject("order_id", UUID.class), true);
                }, key);
    }

    private Map<String, Object> existingServiceOrder(String key, String fingerprint) {
        return jdbc.query("SELECT order_id,request_fingerprint,deleted_at FROM orders WHERE idempotency_key=?",
                rs -> {
                    if (!rs.next()) return null;
                    if (rs.getObject("deleted_at") != null) throw ApiException.conflict("TEST_DATA_ARCHIVED", "운영 시작 전 테스트 주문입니다. 새 주문으로 다시 요청해 주세요.");
                    if (!fingerprint.equals(rs.getString("request_fingerprint"))) {
                        throw ApiException.conflict("IDEMPOTENCY_CONFLICT", "동일 요청 ID에 다른 서비스 정보가 사용되었습니다.");
                    }
                    return hydrateServiceCreated(rs.getObject("order_id", UUID.class), true);
                }, key);
    }

    private Map<String, Object> hydrateServiceCreated(UUID orderId, boolean replay) {
        Map<String, Object> response = new java.util.LinkedHashMap<>(hydrateCreated(orderId, replay));
        Map<String, Object> service = jdbc.query("""
                SELECT o.service_message,o.staff_charge_amount,o.staff_discount_rate,
                       sm.staff_id,sm.name,
                       COALESCE(sum(i.line_total) FILTER (WHERE i.status='ACTIVE'),0)::integer AS gross_amount
                FROM live_orders o
                JOIN staff_members sm ON sm.staff_id=o.charged_staff_id
                LEFT JOIN order_items i ON i.order_id=o.order_id
                WHERE o.order_id=? AND o.order_kind='SERVICE'
                GROUP BY o.order_id,o.service_message,o.staff_charge_amount,o.staff_discount_rate,sm.staff_id,sm.name
                """, rs -> rs.next() ? ApiEnvelope.map(
                "serviceMessage", rs.getString("service_message"),
                "staffChargeAmount", rs.getInt("staff_charge_amount"),
                "staffDiscountRate", rs.getInt("staff_discount_rate"),
                "serviceGrossAmount", rs.getInt("gross_amount"),
                "chargedStaff", ApiEnvelope.map("staffId", rs.getString("staff_id"), "name", rs.getString("name"))) : null,
                orderId);
        if (service == null) throw ApiException.notFound("ORDER_NOT_FOUND", "서비스 주문 정보를 찾을 수 없습니다.");
        response.putAll(service);
        return response;
    }

    private Map<String, Object> pendingCall(String tableId) {
        return jdbc.query("""
                SELECT call_id,reason,created_at FROM live_calls
                WHERE table_id=? AND status='PENDING'
                ORDER BY created_at DESC LIMIT 1
                """, rs -> rs.next() ? ApiEnvelope.map(
                "callId", rs.getString("call_id"),
                "reason", rs.getString("reason"),
                "createdAt", rs.getObject("created_at", OffsetDateTime.class).toInstant().toString()) : null,
                tableId);
    }

    private UUID openOrCreateSession(String tableId) {
        return visits.activate(tableId);
    }

    private long nextDisplayNumber() {
        return numbers.next();
    }

    private void insertLines(UUID orderId, List<ValidatedLine> lines) {
        for (ValidatedLine line : lines) {
            UUID itemId = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO order_items(order_item_id, order_id, line_no, menu_id, menu_name_snapshot,
                      base_price_snapshot, unit_price_snapshot, quantity, line_total)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, itemId, orderId, line.lineNo(), line.menuId(), line.name(), line.basePrice(),
                    line.coins()>0 ? 0 : line.unitPrice(), line.quantity(), line.coins()>0 ? 0 : line.lineTotal());
            jdbc.update("""
                    UPDATE order_items i SET category_id_snapshot=m.category_id,category_label_snapshot=c.label
                    FROM menus m JOIN categories c ON c.category_id=m.category_id
                    WHERE i.order_item_id=? AND m.menu_id=i.menu_id
                    """, itemId);
            jdbc.update("UPDATE order_items SET preparation_station=?,coin_unit_price=?,preparation_status=?,prepared_at=CASE WHEN ?='SERVING' THEN now() END WHERE order_item_id=?",
                    line.station(), line.coins(), "SERVING".equals(line.station()) ? "READY" : "PENDING", line.station(), itemId);
        }
        preparation.initialize(orderId);
    }

    private ValidatedLine validateLine(Map<String, Object> input, int lineNo) { return validateLine(input, lineNo, false); }
    private ValidatedLine validateLine(Map<String, Object> input, int lineNo, boolean coin) {
        String menuId = string(input, "menuId");
        int quantity = integer(input, "quantity");
        Menu menu = jdbc.query("""
                SELECT menu_id,name,base_price,available,min_quantity,max_quantity,coin_price,preparation_station FROM menus WHERE menu_id=?
                """, rs -> rs.next() ? new Menu(rs.getString(1), rs.getString(2), rs.getInt(3),
                rs.getBoolean(4), rs.getInt(5), rs.getInt(6), rs.getObject(7, Integer.class), rs.getString(8)) : null, menuId);
        if (menu == null) throw new ApiException(HttpStatus.BAD_REQUEST, "MENU_NOT_FOUND", "메뉴 정보를 다시 확인해 주세요.", false,
                Map.of("menuIds", List.of(menuId)));
        if (!menu.available()) throw new ApiException(HttpStatus.CONFLICT, "MENU_UNAVAILABLE", "품절된 메뉴가 포함되어 있습니다.", false,
                Map.of("menuIds", List.of(menuId)));
        if (quantity < menu.min() || quantity > menu.max()) throw ApiException.invalid("메뉴 수량을 확인해 주세요.");
        if (coin && menu.coins() == null) throw ApiException.invalid("엽전으로 주문할 수 없는 메뉴입니다.");
        int unitPrice = coin ? menu.coins() : menu.basePrice();
        return new ValidatedLine(lineNo, menu.id(), menu.name(), menu.basePrice(), unitPrice, quantity,
                Math.multiplyExact(unitPrice, quantity), coin ? unitPrice : 0, menu.station());
    }

    private Map<String, Object> hydrateCreated(UUID orderId, boolean replay) {
        return jdbc.query("""
                SELECT o.*,t.display_name FROM live_orders o JOIN tables t ON t.table_id=o.table_id WHERE o.order_id=?
                """, rs -> {
            if (!rs.next()) throw ApiException.notFound("ORDER_NOT_FOUND", "주문 정보를 찾을 수 없습니다.");
            return ApiEnvelope.map(
                    "orderId", orderId.toString(), "displayNumber", rs.getLong("display_number"),
                    "displayCode", rs.getString("display_code"),
                    "table", ApiEnvelope.map("tableId", rs.getString("table_id"), "displayName", rs.getString("display_name")),
                    "status", rs.getString("status"), "publicStatus", CustomerOrderStatus.fromInternal(rs.getString("status")),
                    "paymentStatus", rs.getString("payment_status"), "totalAmount", rs.getInt("total_amount"),
                    "orderKind", rs.getString("order_kind"), "paymentMethod", rs.getString("payment_method"),
                    "coinTotal", rs.getInt("coin_total"), "coinReceived", rs.getObject("coin_received_at") != null,
                    "createdAt", rs.getObject("created_at", OffsetDateTime.class).toInstant().toString(),
                    "idempotentReplay", replay, "items", createdItems(orderId));
        }, orderId);
    }

    private List<Map<String, Object>> createdItems(UUID orderId) {
        return jdbc.query("""
                SELECT * FROM order_items WHERE order_id=? ORDER BY line_no
                """, (rs, index) -> {
            UUID itemId = rs.getObject("order_item_id", UUID.class);
            return ApiEnvelope.map("lineNo", rs.getInt("line_no"), "menuId", rs.getString("menu_id"),
                    "name", rs.getString("menu_name_snapshot"), "basePrice", rs.getInt("base_price_snapshot"),
                    "unitPrice", rs.getInt("unit_price_snapshot"), "quantity", rs.getInt("quantity"),
                    "lineTotal", rs.getInt("line_total"), "coinUnitPrice", rs.getInt("coin_unit_price"), "preparationStation", rs.getString("preparation_station"),
                    "preparationStatus", rs.getString("preparation_status"), "status", rs.getString("status"));
        }, orderId);
    }

    private List<Map<String, Object>> listItems(UUID orderId) {
        return jdbc.query("""
                SELECT order_item_id,menu_name_snapshot,quantity,line_total,preparation_status,coin_unit_price,preparation_station FROM order_items
                WHERE order_id=? AND status='ACTIVE' ORDER BY line_no
                """, (rs, index) -> ApiEnvelope.map(
                "name", rs.getString("menu_name_snapshot"), "quantity", rs.getInt("quantity"),
                "lineTotal", rs.getInt("line_total"), "preparationStatus", rs.getString("preparation_status"),
                "coinUnitPrice", rs.getInt("coin_unit_price"), "preparationStation", rs.getString("preparation_station")), orderId);
    }

    private String setting(String key) {
        String value = jdbc.queryForObject("SELECT value FROM settings WHERE key=?", String.class, key);
        if (value == null) throw new IllegalStateException("Missing setting " + key);
        return value;
    }

    private String fingerprint(String tableId, List<Map<String, Object>> items, String note,
                               Integer expectedTotalAmount) {
        try {
            var canonicalItems = items.stream().map(item -> ApiEnvelope.map(
                    "menuId", string(item, "menuId"),
                    "quantity", integer(item, "quantity")
            )).toList();
            return StaffTokenService.sha256Hex(mapper.writeValueAsString(ApiEnvelope.map(
                    "tableId", tableId,
                    "expectedTotalAmount", expectedTotalAmount,
                    "note", note == null ? "" : note,
                    "items", canonicalItems)));
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    private String serviceFingerprint(String tableId, String chargedStaffId,
                                      List<Map<String, Object>> items, String serviceMessage) {
        try {
            var canonicalItems = items.stream().map(item -> ApiEnvelope.map(
                    "menuId", string(item, "menuId"),
                    "quantity", integer(item, "quantity")
            )).toList();
            return StaffTokenService.sha256Hex(mapper.writeValueAsString(ApiEnvelope.map(
                    "tableId", tableId,
                    "chargedStaffId", chargedStaffId,
                    "serviceMessage", serviceMessage == null ? "" : serviceMessage,
                    "items", canonicalItems)));
        } catch (ApiException error) {
            throw error;
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

    private record Menu(String id, String name, int basePrice, boolean available, int min, int max, Integer coins, String station) {}
    private record ValidatedLine(int lineNo, String menuId, String name, int basePrice, int unitPrice,
                                 int quantity, int lineTotal, int coins, String station) {}
}

package com.caucse.qrorder;

import com.caucse.qrorder.auth.StaffTokenService;
import com.caucse.qrorder.auth.StaffPrincipal;
import com.caucse.qrorder.api.ApiException;
import com.caucse.qrorder.domain.CustomerOrderService;
import com.caucse.qrorder.domain.StaffOperationsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.time.Instant;

import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
class QrOrderApiIntegrationTest {
    private static final String PEPPER = "test-token-pepper-that-is-at-least-32-characters";
    private static final String TABLE_TOKEN = "b".repeat(64);
    private static final String PASSCODE = "correct horse battery staple";

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine")
            .withDatabaseName("qr_order").withUsername("qr_order").withPassword("qr_order");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("qr-order.token-pepper", () -> PEPPER);
        registry.add("qr-order.staff-passcode-hash", () -> StaffTokenService.sha256Hex(PEPPER + ":" + PASSCODE));
        registry.add("qr-order.staff-token-secret", () -> "test-staff-secret-that-is-at-least-32-characters");
        registry.add("springdoc.api-docs.enabled", () -> true);
        registry.add("springdoc.swagger-ui.enabled", () -> true);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    @Autowired CustomerOrderService orders;
    @Autowired StaffOperationsService staffOperations;
    @Autowired com.caucse.qrorder.domain.MenuSalesService sales;
    @Autowired com.caucse.qrorder.domain.StaffServiceService services;
    @Autowired com.caucse.qrorder.sse.DomainEventService events;

    @BeforeEach
    void table() {
        jdbc.update("DELETE FROM auth_attempts");
        jdbc.update("DELETE FROM domain_events");
        jdbc.update("DELETE FROM audit_logs");
        jdbc.update("DELETE FROM calls");
        jdbc.update("DELETE FROM order_items");
        jdbc.update("DELETE FROM orders");
        jdbc.update("DELETE FROM table_sessions");
        jdbc.update("DELETE FROM staff_members");
        jdbc.update("DELETE FROM tables");
        jdbc.update("INSERT INTO tables(table_id,display_name,token_hash,sort_order) VALUES('T01','테이블 1',?,1)",
                StaffTokenService.sha256Hex(PEPPER + ":" + TABLE_TOKEN));
        jdbc.update("""
                INSERT INTO staff_members(staff_id,name,affiliation,active,sort_order)
                VALUES ('S-001','김하늘','기획국',true,10),('S-002','이도윤','홍보국',false,20)
                """);
        jdbc.update("UPDATE settings SET value='1042' WHERE key='NEXT_DISPLAY_NUMBER'");
        jdbc.update("UPDATE settings SET value='20' WHERE key='STAFF_DISCOUNT_RATE'");
        jdbc.update("UPDATE settings SET value='TRUE' WHERE key='EVENT_OPEN'");
    }

    @Test
    void exposesGroupedOpenApiWithBearerAndSseDocumentation() throws Exception {
        mvc.perform(get("/v3/api-docs/swagger-config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$['urls.primaryName']", is("all")));

        String allDocs = mvc.perform(get("/v3/api-docs/all"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/customer/bootstrap']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/staff/login']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/admin/snapshot']").exists())
                .andExpect(jsonPath("$.tags.length()", is(4)))
                .andReturn().getResponse().getContentAsString();
        var openApi = mapper.readTree(allDocs);
        int documentedRequestBodies = 0;
        for (var path : openApi.get("paths").properties()) {
            for (var operation : path.getValue().properties()) {
                var requestBody = operation.getValue().get("requestBody");
                if (requestBody == null) continue;
                documentedRequestBodies++;
                var schema = requestBody.get("content").get("application/json").get("schema");
                assertTrue(schema.has("$ref"), path.getKey() + " request body must reference a concrete schema");
                String schemaName = schema.get("$ref").asString().replace("#/components/schemas/", "");
                var component = openApi.get("components").get("schemas").get(schemaName);
                assertTrue(component != null && component.has("properties"),
                        path.getKey() + " request schema must declare named properties");
            }
        }
        assertEquals(39, documentedRequestBodies);

        mvc.perform(get("/v3/api-docs/customer"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.info.title", is("QR Order API")))
                .andExpect(jsonPath("$.tags.length()", is(1)))
                .andExpect(jsonPath("$.tags[0].name", is("Customer")))
                .andExpect(jsonPath("$.paths['/api/v1/customer/bootstrap'].post.summary", is("고객 화면 초기화")))
                .andExpect(jsonPath("$.paths['/api/v1/customer/events'].post.responses['200'].content['text/event-stream']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/customer/bootstrap'].post.responses.default['$ref']",
                        is("#/components/responses/ApiError")));

        mvc.perform(get("/v3/api-docs/staff"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tags.length()", is(2)))
                .andExpect(jsonPath("$.components.securitySchemes.staffBearer.type", is("http")))
                .andExpect(jsonPath("$.paths['/api/v1/staff/tables/list'].post.security[0].staffBearer").isArray())
                .andExpect(jsonPath("$.paths['/api/v1/staff/login'].post.security").doesNotExist());

        mvc.perform(get("/v3/api-docs/admin"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tags.length()", is(1)))
                .andExpect(jsonPath("$.tags[0].name", is("Admin")))
                .andExpect(jsonPath("$.paths['/api/v1/admin/tables/{id}/rotate-token'].post.summary",
                        is("테이블 토큰 회전")));
    }

    @Test
    void bootstrapOrderReplayCallAndStaffLogin() throws Exception {
        String credentials = "{\"tableId\":\"T01\",\"tableToken\":\"" + TABLE_TOKEN + "\"}";
        mvc.perform(post("/api/v1/customer/bootstrap").contentType("application/json").content(credentials))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.table.displayName", is("테이블 1")))
                .andExpect(jsonPath("$.data.items[0].menuId", is("chicken-feet")))
                .andExpect(jsonPath("$.data.items[1].name", is("국물 떡볶이 + 계란 + 튀김 SET")))
                .andExpect(jsonPath("$.data.items[1].basePrice", is(10000)));

        String requestId = UUID.randomUUID().toString();
        String order = """
                {"tableId":"T01","tableToken":"%s","clientRequestId":"%s","expectedTotalAmount":20000,"note":"",
                 "items":[{"menuId":"chicken-feet","quantity":2}]}
                """.formatted(TABLE_TOKEN, requestId);
        String orderResponse = mvc.perform(post("/api/v1/customer/orders/create").contentType("application/json").content(order))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.displayCode", is("A-1042")))
                .andExpect(jsonPath("$.data.totalAmount", is(20000)))
                .andExpect(jsonPath("$.data.idempotentReplay", is(false)))
                .andReturn().getResponse().getContentAsString();
        String orderId = mapper.readTree(orderResponse).get("data").get("orderId").asString();
        mvc.perform(post("/api/v1/customer/orders/create").contentType("application/json").content(order))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.idempotentReplay", is(true)));

        String callRequestId = UUID.randomUUID().toString();
        String call = """
                {"tableId":"T01","tableToken":"%s","clientRequestId":"%s","reason":"WATER_UTENSIL"}
                """.formatted(TABLE_TOKEN, callRequestId);
        mvc.perform(post("/api/v1/customer/calls/create").contentType("application/json").content(call))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status", is("PENDING")));
        mvc.perform(post("/api/v1/customer/orders/list").contentType("application/json")
                        .content(credentials))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.activeCall.reason", is("WATER_UTENSIL")));
        mvc.perform(post("/api/v1/customer/calls/create").contentType("application/json").content(call))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.idempotentReplay", is(true)));
        mvc.perform(post("/api/v1/customer/calls/create").contentType("application/json").content("""
                        {"tableId":"T01","tableToken":"%s","clientRequestId":"%s","reason":"OTHER"}
                        """.formatted(TABLE_TOKEN, callRequestId)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code", is("DUPLICATE_REQUEST")));
        mvc.perform(post("/api/v1/customer/calls/create").contentType("application/json").content("""
                        {"tableId":"T01","tableToken":"%s","clientRequestId":"%s","reason":"OTHER"}
                        """.formatted(TABLE_TOKEN, UUID.randomUUID())))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.error.code", is("CALL_TOO_FREQUENT")));

        String loginResponse = mvc.perform(post("/api/v1/staff/login").contentType("application/json")
                        .content("{\"passcode\":\"" + PASSCODE + "\",\"deviceLabel\":\"주방\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.deviceLabel", is("주방")))
                .andReturn().getResponse().getContentAsString();
        String staffToken = mapper.readTree(loginResponse).get("data").get("staffToken").asString();

        mvc.perform(post("/api/v1/staff/tables/list").header("Authorization", "Bearer " + staffToken)
                        .contentType("application/json").content("{}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.tables[0].totalAmount", is(20000)));
        mvc.perform(post("/api/v1/staff/tables/detail").header("Authorization", "Bearer " + staffToken)
                        .contentType("application/json").content("{\"tableId\":\"T01\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].quantity", is(2)));
        mvc.perform(post("/api/v1/staff/orders/status").header("Authorization", "Bearer " + staffToken)
                        .contentType("application/json")
                        .content("{\"orderId\":\"" + orderId + "\",\"status\":\"COOKING\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success", is(true)));
        mvc.perform(post("/api/v1/staff/calls/acknowledge").header("Authorization", "Bearer " + staffToken)
                        .contentType("application/json").content("{\"tableId\":\"T01\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.acknowledgedCount", is(1)));
        mvc.perform(post("/api/v1/customer/orders/list").contentType("application/json")
                        .content(credentials))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.activeCall").doesNotExist());
        mvc.perform(post("/api/v1/staff/orders/create").header("Authorization", "Bearer " + staffToken)
                        .contentType("application/json").content("""
                                {"tableId":"T01","note":"현장 추가",
                                 "items":[{"itemId":"cola","quantity":1}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.displayCode", is("A-1043")));
    }

    @Test
    void rejectsWrongTableTokenWithContractError() throws Exception {
        mvc.perform(post("/api/v1/customer/bootstrap").contentType("application/json")
                        .content("{\"tableId\":\"T01\",\"tableToken\":\"" + "0".repeat(64) + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code", is("INVALID_TABLE_TOKEN")));
    }

    @Test
    void throttlesStaffLoginInPostgresAfterFiveFailures() throws Exception {
        for (int attempt = 1; attempt < 5; attempt++) {
            mvc.perform(post("/api/v1/staff/login").contentType("application/json")
                            .content("{\"passcode\":\"wrong\",\"deviceLabel\":\"카운터\"}"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error.code", is("STAFF_PASSCODE_MISMATCH")));
        }
        mvc.perform(post("/api/v1/staff/login").contentType("application/json")
                        .content("{\"passcode\":\"wrong\",\"deviceLabel\":\"카운터\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error.code", is("STAFF_LOGIN_THROTTLED")))
                .andExpect(jsonPath("$.error.details.retryAfter").isString());
    }

    @Test
    void serializesConcurrentDisplayNumbersAndFirstSessionCreation() throws Exception {
        var executor = Executors.newFixedThreadPool(8);
        try {
            List<Future<Map<String, Object>>> futures = new ArrayList<>();
            for (int index = 0; index < 8; index++) {
                futures.add(executor.submit(() -> {
                    Map<String, Object> request = new HashMap<>();
                    request.put("tableId", "T01");
                    request.put("tableToken", TABLE_TOKEN);
                    request.put("clientRequestId", UUID.randomUUID().toString());
                    request.put("expectedTotalAmount", 1500);
                    request.put("note", "");
                    request.put("items", List.of(Map.of(
                            "menuId", "cola", "quantity", 1)));
                    return orders.create(request, false);
                }));
            }
            var displayNumbers = new HashSet<Long>();
            for (Future<Map<String, Object>> future : futures) {
                displayNumbers.add(((Number) future.get().get("displayNumber")).longValue());
            }
            assertEquals(8, displayNumbers.size());
            assertEquals(1, jdbc.queryForObject(
                    "SELECT count(*) FROM table_sessions WHERE table_id='T01' AND status='OPEN'", Integer.class));
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void mergeSplitMoveAndPaymentStayAtomicAndKeepOriginQrSession() {
        jdbc.update("INSERT INTO tables(table_id,display_name,token_hash,sort_order) VALUES('T02','테이블 2',?,2)",
                StaffTokenService.sha256Hex(PEPPER + ":" + "c".repeat(64)));
        jdbc.update("INSERT INTO tables(table_id,display_name,token_hash,sort_order) VALUES('T03','테이블 3',?,3)",
                StaffTokenService.sha256Hex(PEPPER + ":" + "d".repeat(64)));
        StaffPrincipal staff = new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1);

        orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        staffOperations.createOrder(Map.of(
                "tableId", "T02",
                "items", List.of(Map.of("itemId", "cider", "quantity", 1)),
                "note", ""), staff);
        staffOperations.merge("T01", "T02", staff);
        staffOperations.discount("T01", 20, staff);
        assertThrows(ApiException.class, () -> staffOperations.confirmPayment("T01", 2_399, staff, "테스트 입금자"));
        staffOperations.split("T01", staff);
        staffOperations.move("T01", "T03", staff);

        orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        assertEquals(1, jdbc.queryForObject(
                "SELECT count(*) FROM table_sessions WHERE origin_table_id='T01' AND status='OPEN'", Integer.class));
        assertEquals("T03", jdbc.queryForObject(
                "SELECT table_id FROM table_sessions WHERE origin_table_id='T01' AND status='OPEN'", String.class));
        staffOperations.confirmPayment("T03", 2_400, staff, "테스트 입금자");
        assertEquals("CLOSED", jdbc.queryForObject(
                "SELECT status FROM table_sessions WHERE origin_table_id='T01' ORDER BY opened_at DESC LIMIT 1", String.class));
    }

    @Test
    void mergedCustomersShareCurrentOrdersAndEventsThenSplitByOriginSession() {
        for (int i = 2; i <= 4; i++) {
            jdbc.update("INSERT INTO tables(table_id,display_name,token_hash,sort_order) VALUES(?,?,?,?)",
                    "T0" + i, "테이블 " + i, StaffTokenService.sha256Hex(PEPPER + ":" + String.valueOf(i).repeat(64)), i);
        }
        StaffPrincipal staff = new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1);
        Map<String, Object> old = orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        staffOperations.confirmPayment("T01", 1500, staff, "테스트 입금자");
        Map<String, Object> a = orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        Map<String, Object> b = orders.create(customerOrder("T02", "2".repeat(64), "cider"), false);
        orders.create(customerOrder("T03", "3".repeat(64), "cola"), false);
        Map<String, Object> outside = orders.create(customerOrder("T04", "4".repeat(64), "cola"), false);
        staffOperations.merge("T01", "T02", staff);
        // A third four-seat table joins the same flat group through any member.
        staffOperations.merge("T02", "T03", staff);
        assertThrows(ApiException.class, () -> staffOperations.merge("T01", "T02", staff));
        Map<String, Object> c = orders.create(customerOrder("T02", "2".repeat(64), "cola"), false);
        var request = Map.<String, Object>of("tableId", "T01", "tableToken", TABLE_TOKEN);
        var shared = orders.list(request);
        assertEquals(List.of("T01", "T02", "T03"), shared.get("groupTableIds"));
        assertEquals(6000, shared.get("sessionTotalAmount"));
        assertEquals(shared.get("orders"), orders.list(Map.of("tableId", "T02", "tableToken", "2".repeat(64))).get("orders"));
        assertEquals(shared.get("orders"), orders.list(Map.of("tableId", "T03", "tableToken", "3".repeat(64))).get("orders"));
        assertEquals(staffOperations.tableDetail("T01").get("items"), staffOperations.tableDetail("T03").get("items"));
        assertEquals(4, staffOperations.tableDetail("T02").get("orderCount"));
        assertEquals(b.get("orderId"), orders.get(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN, "orderId", b.get("orderId"))).get("orderId"));
        assertThrows(ApiException.class, () -> orders.get(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN, "orderId", old.get("orderId"))));
        assertThrows(ApiException.class, () -> orders.get(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN, "displayCode", outside.get("displayCode"))));
        assertEquals(List.of("T01", "T02", "T03"), jdbc.queryForList(
                "SELECT table_id FROM domain_events WHERE event_type='order.created' AND entity_id=? ORDER BY table_id",
                String.class, c.get("orderId").toString()));
        var memberTotals = (List<?>) staffOperations.tableDetail("T02").get("mergeMembers");
        assertEquals(List.of(1500, 3000, 1500), memberTotals.stream().map(Map.class::cast).map(m -> m.get("amount")).toList());
        staffOperations.split("T03", staff);
        assertEquals(1500, orders.list(request).get("sessionTotalAmount"));
        assertEquals(3000, orders.list(Map.of("tableId", "T02", "tableToken", "2".repeat(64))).get("sessionTotalAmount"));
        assertThrows(ApiException.class, () -> orders.get(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN, "orderId", c.get("orderId"))));
        assertEquals(a.get("orderId"), orders.get(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN, "displayCode", a.get("displayCode"))).get("orderId"));
        Map<String, Object> after = orders.create(customerOrder("T02", "2".repeat(64), "cola"), false);
        assertEquals(List.of("T02"), jdbc.queryForList(
                "SELECT table_id FROM domain_events WHERE event_type='order.created' AND entity_id=? ORDER BY table_id",
                String.class, after.get("orderId").toString()));
        staffOperations.confirmPayment("T02", 4500, staff, "테스트 입금자");
        assertEquals(List.of(), orders.list(Map.of("tableId", "T02", "tableToken", "2".repeat(64))).get("orders"));
        assertEquals(7, jdbc.queryForObject("SELECT count(*) FROM orders", Integer.class));
    }

    @Test
    void mergedOrderChangesAndServiceOrdersNotifyEveryGroupMemberForReplay() {
        jdbc.update("INSERT INTO tables(table_id,display_name,token_hash,sort_order) VALUES('T02','테이블 2',?,2)",
                StaffTokenService.sha256Hex(PEPPER + ":" + "c".repeat(64)));
        StaffPrincipal staff = new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1);
        orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        var other = orders.create(customerOrder("T02", "c".repeat(64), "chicken-feet"), false);
        staffOperations.merge("T01", "T02", staff);
        String itemId = jdbc.queryForObject("SELECT order_item_id::text FROM order_items WHERE order_id=?::uuid", String.class, other.get("orderId"));
        long before = events.latestId();
        staffOperations.updateOrder(Map.of("operation", "quantity", "itemId", itemId, "quantity", 2), staff);
        staffOperations.updateItemPreparation(itemId, true, staff);
        assertEquals(21500, orders.list(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN)).get("sessionTotalAmount"));
        assertEquals(List.of("order.updated", "order.item.updated"), events.after(before, "T01", 100).stream().map(e -> e.type()).toList());
        assertEquals(List.of("order.updated", "order.item.updated"), events.after(before, "T02", 100).stream().map(e -> e.type()).toList());
        var service = orders.createService(Map.of("tableId", "T02", "clientRequestId", UUID.randomUUID().toString(),
                "chargedStaffId", "S-001", "serviceMessage", "함께 드세요",
                "items", List.of(Map.of("menuId", "cider", "quantity", 1))), "S-001", 20, "카운터");
        assertEquals(service.get("orderId"), orders.get(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN, "orderId", service.get("orderId"))).get("orderId"));
        staffOperations.updateItemPreparation(itemId, false, staff);
        staffOperations.updateOrder(Map.of("operation", "cancel-item", "itemId", itemId), staff);
        assertEquals(1500, orders.list(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN)).get("sessionTotalAmount"));
        assertEquals(orders.list(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN)).get("orders"),
                orders.list(Map.of("tableId", "T02", "tableToken", "c".repeat(64))).get("orders"));
    }

    @Test
    void movedQrSharesGroupAndReceivesSplitAndPaymentEvents() {
        for (int i = 2; i <= 3; i++) jdbc.update(
                "INSERT INTO tables(table_id,display_name,token_hash,sort_order) VALUES(?,?,?,?)",
                "T0" + i, "테이블 " + i, StaffTokenService.sha256Hex(PEPPER + ":" + String.valueOf(i).repeat(64)), i);
        StaffPrincipal staff = new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1);
        orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        staffOperations.move("T01", "T03", staff);
        orders.create(customerOrder("T02", "2".repeat(64), "cola"), false);
        staffOperations.merge("T03", "T02", staff);
        assertEquals(List.of("T02", "T03"), orders.list(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN)).get("groupTableIds"));
        var added = orders.create(customerOrder("T02", "2".repeat(64), "cola"), false);
        assertEquals(List.of("T01", "T02", "T03"), jdbc.queryForList(
                "SELECT table_id FROM domain_events WHERE event_type='order.created' AND entity_id=? ORDER BY table_id",
                String.class, added.get("orderId").toString()));
        staffOperations.split("T02", staff);
        assertEquals(List.of("T03"), orders.list(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN)).get("groupTableIds"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM domain_events WHERE table_id='T01' AND payload->>'operation'='split'", Integer.class));
        assertThrows(ApiException.class, () -> orders.get(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN, "orderId", added.get("orderId"))));
        staffOperations.confirmPayment("T03", 1500, staff, "테스트 입금자");
        assertEquals(List.of(), orders.list(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN)).get("orders"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM domain_events WHERE table_id='T01' AND event_type='payment.confirmed'", Integer.class));
    }

    @Test
    void customerOrderListShowsOnlyTheCurrentOpenVisit() {
        StaffPrincipal staff = new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1);
        Map<String, Object> first = orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        staffOperations.confirmPayment("T01", 1500, staff, "테스트 입금자");

        Map<String, Object> afterPayment = orders.list(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN));
        assertEquals(List.of(), afterPayment.get("orders"));
        assertEquals(0, afterPayment.get("sessionTotalAmount"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM orders WHERE order_id=?::uuid",
                Integer.class, first.get("orderId")));

        Map<String, Object> second = orders.create(customerOrder("T01", TABLE_TOKEN, "cider"), false);
        Map<String, Object> current = orders.list(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> visible = (List<Map<String, Object>>) current.get("orders");
        assertEquals(1, visible.size());
        assertEquals(second.get("orderId").toString(), visible.getFirst().get("orderId"));
        assertEquals(1500, current.get("sessionTotalAmount"));
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM orders", Integer.class));
    }

    @Test
    void tableNoteAndResetAreVisitScopedIdempotentAndPreserveHistory() {
        StaffPrincipal staff = new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1);
        Map<String, Object> guest = orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        Map<String, Object> service = orders.createService(Map.of(
                "tableId", "T01", "clientRequestId", UUID.randomUUID().toString(),
                "chargedStaffId", "S-001", "serviceMessage", "서비스",
                "items", List.of(Map.of("menuId", "cider", "quantity", 1))),
                "S-001", 20, "카운터");
        UUID sessionId = UUID.fromString(String.valueOf(staffOperations.tableDetail("T01").get("sessionId")));
        staffOperations.saveTableNote("T01", "유아 의자 사용 중", staff);
        assertEquals("유아 의자 사용 중", ((List<?>) staffOperations.tableDetail("T01").get("notes")).stream()
                .map(Map.class::cast).findFirst().orElseThrow().get("text"));
        orders.create(customerOrder("T01", TABLE_TOKEN, "cider"), false);
        assertEquals("유아 의자 사용 중", ((List<?>) staffOperations.tableDetail("T01").get("notes")).stream()
                .map(Map.class::cast).findFirst().orElseThrow().get("text"));
        staffOperations.saveTableNote("T01", "", staff);
        assertEquals(List.of(), staffOperations.tableDetail("T01").get("notes"));
        staffOperations.saveTableNote("T01", "유아 의자 사용 중", staff);
        jdbc.update("INSERT INTO calls(call_id,table_id,reason,status,client_request_id) VALUES(?,?,'OTHER','PENDING',?)",
                UUID.randomUUID(), "T01", UUID.randomUUID());

        staffOperations.resetTable("T01", sessionId.toString(), staff);
        staffOperations.resetTable("T01", sessionId.toString(), staff);
        assertEquals("CLOSED", jdbc.queryForObject(
                "SELECT status FROM table_sessions WHERE session_id=?", String.class, sessionId));
        assertEquals("STAFF_RESET", jdbc.queryForObject(
                "SELECT close_reason FROM table_sessions WHERE session_id=?", String.class, sessionId));
        assertEquals("CANCELLED", jdbc.queryForObject(
                "SELECT status FROM orders WHERE order_id=?::uuid", String.class, guest.get("orderId")));
        assertEquals("RECEIVED", jdbc.queryForObject(
                "SELECT status FROM orders WHERE order_id=?::uuid", String.class, service.get("orderId")));
        assertEquals("CANCELLED", jdbc.queryForObject(
                "SELECT status FROM calls WHERE table_id='T01'", String.class));
        assertEquals(1, jdbc.queryForObject(
                "SELECT count(*) FROM audit_logs WHERE action='TABLE_RESET'", Integer.class));

        orders.create(customerOrder("T01", TABLE_TOKEN, "cider"), false);
        staffOperations.resetTable("T01", sessionId.toString(), staff);
        assertEquals(1, jdbc.queryForObject(
                "SELECT count(*) FROM table_sessions WHERE table_id='T01' AND status='OPEN'", Integer.class));
        assertEquals(List.of(), staffOperations.tableDetail("T01").get("notes"));
    }

    @Test
    void preparedItemsFlowIndependentlyFromKitchenToServing() {
        StaffPrincipal staff = new StaffPrincipal("주방", Instant.now(), Instant.now().plusSeconds(3600), 1);
        Map<String, Object> order = orders.create(new HashMap<>(Map.of(
                "tableId", "T01", "tableToken", TABLE_TOKEN,
                "clientRequestId", UUID.randomUUID().toString(), "expectedTotalAmount", 29000, "note", "",
                "items", List.of(
                        Map.of("menuId", "chicken-feet", "quantity", 2),
                        Map.of("menuId", "spicy-pork", "quantity", 1)))), false);
        UUID orderId = UUID.fromString(order.get("orderId").toString());
        List<UUID> itemIds = jdbc.queryForList(
                "SELECT order_item_id FROM order_items WHERE order_id=? ORDER BY line_no", UUID.class, orderId);

        staffOperations.updateItemPreparation(itemIds.getFirst().toString(), true, staff);
        Map<String, Object> partial = staffOperations.queues();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> kitchen = (List<Map<String, Object>>) partial.get("kitchen");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> serving = (List<Map<String, Object>>) partial.get("serving");
        assertEquals(1, kitchen.size());
        assertEquals(1, serving.size());
        assertEquals(1, ((List<?>) serving.getFirst().get("items")).size());
        assertEquals(1, serving.getFirst().get("remainingKitchenItemCount"));

        staffOperations.updateItemPreparation(itemIds.get(1).toString(), true, staff);
        Map<String, Object> ready = staffOperations.queues();
        assertEquals(List.of(), ready.get("kitchen"));
        assertEquals("SERVING", jdbc.queryForObject(
                "SELECT status FROM orders WHERE order_id=?", String.class, orderId));

        staffOperations.updateStatus(Map.of("orderId", orderId.toString(), "status", "SERVED"), staff);
        assertEquals("COMPLETED", jdbc.queryForObject(
                "SELECT status FROM orders WHERE order_id=?", String.class, orderId));
        ApiException undo = assertThrows(ApiException.class,
                () -> staffOperations.updateItemPreparation(itemIds.getFirst().toString(), false, staff));
        assertEquals("ORDER_ITEM_ALREADY_SERVED", undo.code());
    }

    @Test
    void customerProgressWaitsForActualServingAndExposesEachMenu() {
        StaffPrincipal staff = new StaffPrincipal("주방", Instant.now(), Instant.now().plusSeconds(3600), 1);
        var result = orders.create(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN,
                "clientRequestId", UUID.randomUUID().toString(), "expectedTotalAmount", 19000,
                "items", List.of(Map.of("menuId", "chicken-feet", "quantity", 1),
                                 Map.of("menuId", "spicy-pork", "quantity", 1))), false);
        UUID orderId = UUID.fromString(result.get("orderId").toString());
        List<String> itemIds = jdbc.queryForList("SELECT order_item_id::text FROM order_items WHERE order_id=? ORDER BY line_no", String.class, orderId);
        assertCustomerProgress(orderId, "accepted", List.of("PENDING", "PENDING"));
        // Serving an order without any ready menu must not announce completion.
        staffOperations.updateStatus(Map.of("orderId", orderId.toString(), "status", "SERVED"), staff);
        assertCustomerProgress(orderId, "preparing", List.of("PENDING", "PENDING"));
        staffOperations.updateItemPreparation(itemIds.getFirst(), true, staff);
        assertCustomerProgress(orderId, "preparing", List.of("READY", "PENDING"));
        staffOperations.updateStatus(Map.of("orderId", orderId.toString(), "status", "SERVED"), staff);
        assertCustomerProgress(orderId, "preparing", List.of("SERVED", "PENDING"));
        staffOperations.updateItemPreparation(itemIds.get(1), true, staff);
        assertCustomerProgress(orderId, "preparing", List.of("SERVED", "READY"));
        // Existing rows from before this policy can contain the former public mapping.
        jdbc.update("UPDATE orders SET public_status='served' WHERE order_id=?", orderId);
        assertCustomerProgress(orderId, "preparing", List.of("SERVED", "READY"));
        staffOperations.updateStatus(Map.of("orderId", orderId.toString(), "status", "SERVED"), staff);
        assertCustomerProgress(orderId, "served", List.of("SERVED", "SERVED"));
        assertEquals("served", jdbc.queryForObject("SELECT public_status FROM orders WHERE order_id=?", String.class, orderId));
    }

    @Test
    void bulkKitchenCompletionIsPreparingAndBulkServingCompletionIsServed() {
        StaffPrincipal staff = new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1);
        var result = orders.create(customerOrder("T01", TABLE_TOKEN, "chicken-feet"), false);
        UUID orderId = UUID.fromString(result.get("orderId").toString());
        staffOperations.updateStatus(Map.of("tableId", "T01", "status", "READY"), staff);
        assertCustomerProgress(orderId, "preparing", List.of("READY"));
        staffOperations.updateItemPreparation(jdbc.queryForObject("SELECT order_item_id::text FROM order_items WHERE order_id=?", String.class, orderId), false, staff);
        assertCustomerProgress(orderId, "preparing", List.of("PENDING"));
        staffOperations.updateStatus(Map.of("tableId", "T01", "status", "READY"), staff);
        staffOperations.updateStatus(Map.of("tableId", "T01", "status", "SERVED"), staff);
        assertCustomerProgress(orderId, "served", List.of("SERVED"));
    }

    private void assertCustomerProgress(UUID orderId, String status, List<String> itemStatuses) {
        var detail = orders.get(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN, "orderId", orderId.toString()));
        assertEquals(status, detail.get("publicStatus"));
        assertEquals(itemStatuses, ((List<?>) detail.get("items")).stream().map(Map.class::cast).map(item -> item.get("preparationStatus")).toList());
        var list = orders.list(Map.of("tableId", "T01", "tableToken", TABLE_TOKEN));
        var row = ((List<?>) list.get("orders")).stream().map(Map.class::cast).filter(order -> orderId.toString().equals(order.get("orderId"))).findFirst().orElseThrow();
        assertEquals(status, row.get("publicStatus"));
        assertEquals(itemStatuses, ((List<?>) row.get("items")).stream().map(Map.class::cast).map(item -> item.get("preparationStatus")).toList());
    }

    @Test
    void serviceOrdersStayFreeForGuestsAndCanBeSettledExactlyOnce() throws Exception {
        String token = staffToken();

        mvc.perform(post("/api/v1/staff/members/list").header("Authorization", "Bearer " + token)
                        .contentType("application/json").content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.members.length()", is(2)))
                .andExpect(jsonPath("$.data.members[0].name", is("김하늘")))
                .andExpect(jsonPath("$.data.members[1].active", is(false)));

        String inactiveRequest = """
                {"tableId":"T01","clientRequestId":"%s","chargedStaffId":"S-002","serviceMessage":null,
                 "items":[{"menuId":"cola","quantity":1}]}
                """.formatted(UUID.randomUUID());
        mvc.perform(post("/api/v1/staff/orders/service").header("Authorization", "Bearer " + token)
                        .contentType("application/json").content(inactiveRequest))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code", is("STAFF_MEMBER_INACTIVE")));

        String serviceRequest = """
                {"tableId":"T01","clientRequestId":"%s","chargedStaffId":"S-001",
                 "serviceMessage":"기다려 주셔서 감사합니다!",
                 "items":[{"menuId":"cola","quantity":1}]}
                """.formatted(UUID.randomUUID());
        String response = mvc.perform(post("/api/v1/staff/orders/service")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json").content(serviceRequest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderKind", is("SERVICE")))
                .andExpect(jsonPath("$.data.paymentStatus", is("WAIVED")))
                .andExpect(jsonPath("$.data.totalAmount", is(0)))
                .andExpect(jsonPath("$.data.serviceGrossAmount", is(1500)))
                .andExpect(jsonPath("$.data.staffDiscountRate", is(20)))
                .andExpect(jsonPath("$.data.staffChargeAmount", is(1200)))
                .andExpect(jsonPath("$.data.chargedStaff.name", is("김하늘")))
                .andReturn().getResponse().getContentAsString();
        String serviceOrderId = mapper.readTree(response).get("data").get("orderId").asString();
        mvc.perform(post("/api/v1/staff/orders/service")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json").content(serviceRequest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderId", is(serviceOrderId)))
                .andExpect(jsonPath("$.data.idempotentReplay", is(true)));
        assertEquals(1, jdbc.queryForObject(
                "SELECT count(*) FROM orders WHERE order_kind='SERVICE'", Integer.class));

        mvc.perform(post("/api/v1/customer/orders/list").contentType("application/json").content("""
                        {"tableId":"T01","tableToken":"%s"}
                        """.formatted(TABLE_TOKEN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionTotalAmount", is(0)))
                .andExpect(jsonPath("$.data.orders[0].orderKind", is("SERVICE")))
                .andExpect(jsonPath("$.data.orders[0].serviceMessage", is("기다려 주셔서 감사합니다!")))
                .andExpect(jsonPath("$.data.orders[0].chargedStaffName", is("김하늘")))
                .andExpect(jsonPath("$.data.orders[0].chargedStaffId").doesNotExist());

        mvc.perform(post("/api/v1/staff/tables/bill").header("Authorization", "Bearer " + token)
                        .contentType("application/json").content("{\"tableId\":\"T01\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.subtotalAmount", is(0)))
                .andExpect(jsonPath("$.data.serviceOrderCount", is(1)))
                .andExpect(jsonPath("$.data.serviceGrossAmount", is(1500)))
                .andExpect(jsonPath("$.data.serviceLines[0].chargedStaffName", is("김하늘")));

        mvc.perform(post("/api/v1/staff/orders/queue").header("Authorization", "Bearer " + token)
                        .contentType("application/json").content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.serving[0].orderKind", is("SERVICE")))
                .andExpect(jsonPath("$.data.serving[0].serviceMessage").doesNotExist())
                .andExpect(jsonPath("$.data.serving[0].chargedStaffName").doesNotExist())
                .andExpect(jsonPath("$.data.serving[0].staffChargeAmount").doesNotExist());

        UUID itemId = jdbc.queryForObject(
                "SELECT order_item_id FROM order_items WHERE order_id=?::uuid", UUID.class, serviceOrderId);
        ApiException editError = assertThrows(ApiException.class, () -> staffOperations.updateOrder(
                Map.of("operation", "quantity", "itemId", itemId.toString(), "quantity", 2),
                new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1)));
        assertEquals("SERVICE_ORDER_NOT_EDITABLE", editError.code());

        mvc.perform(post("/api/v1/staff/settlements/list").header("Authorization", "Bearer " + token)
                        .contentType("application/json").content("{\"includeSettled\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalChargeAmount", is(1200)))
                .andExpect(jsonPath("$.data.members[0].chargeAmount", is(1200)))
                .andExpect(jsonPath("$.data.members[0].orders[0].grossAmount", is(1500)));

        mvc.perform(post("/api/v1/staff/settlements/confirm").header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"staffId\":\"S-001\",\"expectedChargeAmount\":1199}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code", is("SETTLEMENT_AMOUNT_CHANGED")))
                .andExpect(jsonPath("$.error.retryable", is(true)));
        mvc.perform(post("/api/v1/staff/settlements/confirm").header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"staffId\":\"S-001\",\"expectedChargeAmount\":1200}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.settlementStatus", is("SETTLED")))
                .andExpect(jsonPath("$.data.settledAmount", is(1200)));
        mvc.perform(post("/api/v1/staff/settlements/confirm").header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"staffId\":\"S-001\",\"expectedChargeAmount\":1200}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code", is("SETTLEMENT_ALREADY_SETTLED")));

        mvc.perform(post("/api/v1/staff/orders/cancel").header("Authorization", "Bearer " + token)
                        .contentType("application/json").content("{\"tableId\":\"T01\"}"))
                .andExpect(status().isOk());
        assertEquals(1200, jdbc.queryForObject(
                "SELECT staff_charge_amount FROM orders WHERE order_id=?::uuid", Integer.class, serviceOrderId));
        mvc.perform(post("/api/v1/staff/settlements/list").header("Authorization", "Bearer " + token)
                        .contentType("application/json").content("{\"includeSettled\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.members[0].chargeAmount", is(0)))
                .andExpect(jsonPath("$.data.members[0].settledAmount", is(1200)))
                .andExpect(jsonPath("$.data.members[0].orders.length()", is(0)));

        orders.create(customerOrder("T01", TABLE_TOKEN, "cider"), false);
        mvc.perform(post("/api/v1/staff/tables/bill").header("Authorization", "Bearer " + token)
                        .contentType("application/json").content("{\"tableId\":\"T01\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.subtotalAmount", is(1500)))
                .andExpect(jsonPath("$.data.serviceGrossAmount", is(0)));
        staffOperations.confirmPayment("T01", 1500,
                new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1), "테스트 입금자");
        assertEquals("WAIVED", jdbc.queryForObject(
                "SELECT payment_status FROM orders WHERE order_id=?::uuid", String.class, serviceOrderId));
        assertEquals(1, jdbc.queryForObject(
                "SELECT count(*) FROM audit_logs WHERE action='SERVICE_ORDER_CREATED'", Integer.class));
        assertEquals(1, jdbc.queryForObject(
                "SELECT count(*) FROM audit_logs WHERE action='STAFF_SETTLEMENT_CONFIRMED'", Integer.class));
    }

    @Test
    void importsPrivateStaffRosterWithoutResettingSettlementState() throws Exception {
        jdbc.update("""
                UPDATE staff_members
                SET settlement_status='SETTLED',settled_amount=1200,settled_at=now()
                WHERE staff_id='S-001'
                """);
        String csv = """
                staff_id,name,affiliation,active,sort_order
                S-001,변경된 이름,회장단,false,20
                S-003,예시 부원,기획부,true,30
                """;

        mvc.perform(post("/api/v1/admin/staff-members/import")
                        .header("Authorization", "Bearer " + staffToken())
                        .contentType("application/json")
                        .content(mapper.writeValueAsString(Map.of("csv", csv))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.importedCount", is(2)));

        Map<String, Object> retained = jdbc.queryForMap("""
                SELECT name,affiliation,active,sort_order,settlement_status,settled_amount
                FROM staff_members WHERE staff_id='S-001'
                """);
        assertEquals("변경된 이름", retained.get("name"));
        assertEquals("회장단", retained.get("affiliation"));
        assertEquals(false, retained.get("active"));
        assertEquals(20, retained.get("sort_order"));
        assertEquals("SETTLED", retained.get("settlement_status"));
        assertEquals(1200, retained.get("settled_amount"));
        assertEquals(1, jdbc.queryForObject(
                "SELECT count(*) FROM audit_logs WHERE action='STAFF_MEMBERS_IMPORTED'", Integer.class));
    }

    @Test
    void rejectsInvalidPayloadAs400AndReplaysCommittedOrderAfterClosing() throws Exception {
        String requestId = UUID.randomUUID().toString();
        String valid = """
                {"tableId":"T01","tableToken":"%s","clientRequestId":"%s",
                 "expectedTotalAmount":1500,"note":"",
                 "items":[{"menuId":"cola","quantity":1}]}
                """.formatted(TABLE_TOKEN, requestId);
        mvc.perform(post("/api/v1/customer/orders/create").contentType("application/json").content(valid))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.idempotentReplay", is(false)));

        jdbc.update("UPDATE settings SET value='FALSE' WHERE key='EVENT_OPEN'");
        mvc.perform(post("/api/v1/customer/orders/create").contentType("application/json").content(valid))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.idempotentReplay", is(true)));

        mvc.perform(post("/api/v1/customer/orders/create").contentType("application/json").content("""
                {"tableId":"T01","tableToken":"%s","clientRequestId":"%s",
                 "expectedTotalAmount":1500,"note":"",
                 "items":[{"menuId":"cola","quantity":1.5}]}
                """.formatted(TABLE_TOKEN, UUID.randomUUID())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code", is("INVALID_REQUEST")))
                .andExpect(jsonPath("$.error.retryable", is(false)));
    }

    @Test
    void rejectsChangedCustomerPriceAndReturnsCurrentQuote() throws Exception {
        mvc.perform(post("/api/v1/customer/orders/create").contentType("application/json").content("""
                {"tableId":"T01","tableToken":"%s","clientRequestId":"%s",
                 "expectedTotalAmount":1500,"note":"",
                 "items":[{"menuId":"cola","quantity":2}]}
                """.formatted(TABLE_TOKEN, UUID.randomUUID())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code", is("ORDER_PRICE_CHANGED")))
                .andExpect(jsonPath("$.error.details.actualTotalAmount", is(3000)))
                .andExpect(jsonPath("$.error.details.items[0].unitPrice", is(1500)));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM orders", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM table_sessions", Integer.class));
    }

    @Test
    void paymentRequestIsBoundToOneVisitAndPaidVisitsAppearInTodaysQueue() {
        StaffPrincipal staff = new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1);
        orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        String firstSessionId = String.valueOf(staffOperations.tableDetail("T01").get("sessionId"));
        String paymentRequestId = UUID.randomUUID().toString();
        staffOperations.confirmPayment("T01", firstSessionId, paymentRequestId, 1500, staff, "테스트 입금자");

        orders.create(customerOrder("T01", TABLE_TOKEN, "cider"), false);
        String secondSessionId = String.valueOf(staffOperations.tableDetail("T01").get("sessionId"));
        staffOperations.confirmPayment("T01", firstSessionId, paymentRequestId, 1500, staff, "테스트 입금자");
        assertEquals("OPEN", jdbc.queryForObject(
                "SELECT status FROM table_sessions WHERE session_id=?::uuid", String.class, secondSessionId));

        ApiException stale = assertThrows(ApiException.class, () -> staffOperations.confirmPayment(
                "T01", firstSessionId, UUID.randomUUID().toString(), 1500, staff, "테스트 입금자"));
        assertEquals("TABLE_SESSION_CHANGED", stale.code());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> payment = (List<Map<String, Object>>) staffOperations.queues().get("payment");
        assertEquals(2, payment.size());
        assertTrue(payment.stream().anyMatch(row -> "PAID".equals(row.get("paymentStatus"))));
        assertTrue(payment.stream().anyMatch(row -> secondSessionId.equals(row.get("sessionId"))));
    }

    @Test
    void orderEditAndPaymentSerializeOnTheVisitLock() throws Exception {
        StaffPrincipal staff = new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1);
        orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        UUID itemId = jdbc.queryForObject("SELECT order_item_id FROM order_items LIMIT 1", UUID.class);
        String sessionId = String.valueOf(staffOperations.tableDetail("T01").get("sessionId"));
        jdbc.execute("""
                CREATE FUNCTION qa_delay_item_update() RETURNS trigger AS $$
                BEGIN
                  IF NEW.quantity <> OLD.quantity THEN PERFORM pg_sleep(1); END IF;
                  RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
                """);
        jdbc.execute("""
                CREATE TRIGGER qa_delay_item_update_trigger
                BEFORE UPDATE ON order_items
                FOR EACH ROW EXECUTE FUNCTION qa_delay_item_update()
                """);

        var executor = Executors.newSingleThreadExecutor();
        try {
            Future<Void> edit = executor.submit(() -> staffOperations.updateOrder(
                    Map.of("operation", "quantity", "itemId", itemId.toString(), "quantity", 3), staff));
            Thread.sleep(150);
            ApiException changed = assertThrows(ApiException.class, () -> staffOperations.confirmPayment(
                    "T01", sessionId, UUID.randomUUID().toString(), 1500, staff, "테스트 입금자"));
            assertEquals("BILL_AMOUNT_CHANGED", changed.code());
            edit.get();
            assertEquals(4500, jdbc.queryForObject("SELECT total_amount FROM orders", Integer.class));
            assertEquals("OPEN", jdbc.queryForObject(
                    "SELECT status FROM table_sessions WHERE session_id=?::uuid", String.class, sessionId));
        } finally {
            executor.shutdownNow();
            jdbc.execute("DROP TRIGGER IF EXISTS qa_delay_item_update_trigger ON order_items");
            jdbc.execute("DROP FUNCTION IF EXISTS qa_delay_item_update()");
        }
    }

    @Test
    void salesReclassifyOnlyAfterPaymentAndPersistPayerAtomically() throws Exception {
        StaffPrincipal staff = new StaffPrincipal("결제", Instant.now(), Instant.now().plusSeconds(3600), 1);
        orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        services.createServiceOrder(Map.of("tableId", "T01", "clientRequestId", UUID.randomUUID().toString(),
                "chargedStaffId", "S-001", "items", List.of(Map.of("menuId", "cola", "quantity", 1))), staff);
        staffOperations.discount("T01", 20, staff);
        assertEquals(3000L, salesAmount("GENERAL"));
        assertEquals(1200L, salesAmount("SERVICE"));
        assertEquals(0L, salesAmount("MEMBER"));
        String session = staffOperations.tableDetail("T01").get("sessionId").toString();
        String request = UUID.randomUUID().toString();
        assertThrows(ApiException.class, () -> staffOperations.confirmPayment("T01", session, request, 2400, staff, "  "));
        assertEquals("UNPAID", jdbc.queryForObject("SELECT payment_status FROM table_sessions WHERE session_id=?::uuid", String.class, session));
        staffOperations.confirmPayment("T01", session, request, 2400, staff, " 김민수 ");
        staffOperations.confirmPayment("T01", session, request, 2400, staff, "김민수");
        assertEquals(0L, salesAmount("GENERAL"));
        assertEquals(2400L, salesAmount("MEMBER"));
        assertEquals(1200L, salesAmount("SERVICE"));
        assertEquals(3L, salesRows().stream().mapToLong(r -> ((Number) r.get("quantity")).longValue()).sum());
        assertEquals("김민수", jdbc.queryForObject("SELECT payer_name FROM table_sessions WHERE session_id=?::uuid", String.class, session));
        assertEquals("결제", jdbc.queryForObject("SELECT payment_confirmed_by FROM table_sessions WHERE session_id=?::uuid", String.class, session));
        assertEquals("IDEMPOTENCY_CONFLICT", assertThrows(ApiException.class,
                () -> staffOperations.confirmPayment("T01", session, request, 2400, staff, "다른 이름")).code());
        var queue = (List<?>) staffOperations.queues().get("payment");
        assertTrue(queue.stream().map(Map.class::cast).anyMatch(row -> "김민수".equals(row.get("payerName")) && row.get("paidAt") != null));
        String token = staffToken();
        String today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).toString();
        mvc.perform(post("/api/v1/staff/sales/menu").header("Authorization", "Bearer " + token)
                .contentType("application/json").content(mapper.writeValueAsString(Map.of("startDate", today, "endDate", today))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.rows.length()", is(2)));
        mvc.perform(post("/api/v1/staff/sales/menu").contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/staff/tables/confirm-payment").header("Authorization", "Bearer " + token)
                .contentType("application/json").content(mapper.writeValueAsString(Map.of("tableId", "T01", "expectedSessionId", session,
                        "clientRequestId", request, "expectedFinalAmount", 2400))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void serviceSalesKeepEachOrdersDiscountRateAndExcludeCancellation() {
        StaffPrincipal staff = new StaffPrincipal("결제", Instant.now(), Instant.now().plusSeconds(3600), 1);
        for (int rate : List.of(20, 50)) {
            jdbc.update("UPDATE settings SET value=? WHERE key='STAFF_DISCOUNT_RATE'", String.valueOf(rate));
            services.createServiceOrder(Map.of("tableId", "T01", "clientRequestId", UUID.randomUUID().toString(),
                    "chargedStaffId", "S-001", "items", List.of(Map.of("menuId", "cola", "quantity", 1))), staff);
        }
        assertEquals(1950L, salesAmount("SERVICE"));
        assertEquals(2, salesRows().size());
        jdbc.update("UPDATE orders SET status='CANCELLED' WHERE staff_discount_rate=20");
        assertEquals(750L, salesAmount("SERVICE"));
        assertThrows(ApiException.class, () -> sales.report("invalid", "2026-09-14"));
        assertThrows(ApiException.class, () -> sales.report("2026-09-14", "2026-09-13"));
        assertThrows(ApiException.class, () -> sales.report("2020-01-01", "2026-09-14"));
        assertEquals(0, ((List<?>) sales.report("2000-01-01", "2000-01-01").get("rows")).size());
    }

    @Test
    void mergedBillSalesApplyPrimaryDiscountOnceWithConsistentWonRoundingAcrossDates() {
        StaffPrincipal staff = new StaffPrincipal("결제", Instant.now(), Instant.now().plusSeconds(3600), 1);
        String token2 = "c".repeat(64);
        jdbc.update("INSERT INTO tables(table_id,display_name,token_hash) VALUES('T02','테이블 2',?)",
                StaffTokenService.sha256Hex(PEPPER + ":" + token2));
        orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        orders.create(customerOrder("T02", token2, "cider"), false);
        jdbc.update("UPDATE order_items SET line_total=5003,unit_price_snapshot=5003,base_price_snapshot=5003");
        jdbc.update("UPDATE orders SET total_amount=5003");
        jdbc.update("UPDATE orders SET created_at='2026-09-13 14:59:00+00' WHERE table_id='T01'");
        jdbc.update("UPDATE orders SET created_at='2026-09-13 15:01:00+00' WHERE table_id='T02'");
        staffOperations.merge("T01", "T02", staff);
        staffOperations.discount("T01", 20, staff);
        assertEquals(10006L, sumSales(sales.report("2026-09-13", "2026-09-14")));
        staffOperations.confirmPayment("T02", 8005, staff, "합석 손님");
        assertEquals(8005L, sumSales(sales.report("2026-09-13", "2026-09-14")));
        assertEquals(4003L, sumSales(sales.report("2026-09-13", "2026-09-13")));
        assertEquals(4002L, sumSales(sales.report("2026-09-14", "2026-09-14")));
        // The payment snapshot remains stable if the table discount setting changes later.
        jdbc.update("UPDATE table_sessions SET discount_rate=0");
        assertEquals(8005L, sumSales(sales.report("2026-09-13", "2026-09-14")));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> salesRows() {
        String today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).toString();
        return (List<Map<String, Object>>) sales.report(today, today).get("rows");
    }
    private long salesAmount(String type) {
        return salesRows().stream().filter(row -> type.equals(row.get("type")))
                .mapToLong(row -> ((Number) row.get("amount")).longValue()).sum();
    }
    private long sumSales(Map<String, Object> report) {
        return ((List<?>) report.get("rows")).stream().map(Map.class::cast)
                .mapToLong(row -> ((Number) row.get("amount")).longValue()).sum();
    }

    private String staffToken() throws Exception {
        String loginResponse = mvc.perform(post("/api/v1/staff/login").contentType("application/json")
                        .content("{\"passcode\":\"" + PASSCODE + "\",\"deviceLabel\":\"카운터\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(loginResponse).get("data").get("staffToken").asString();
    }


    @Test
    void emptyMergeActivatesWholeGroupOnceAndPaymentEndsVisit() {
        StaffPrincipal staff = new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1);
        String token2 = "c".repeat(64);
        jdbc.update("INSERT INTO tables(table_id,display_name,token_hash,sort_order) VALUES('T02','테이블 2',?,2)", StaffTokenService.sha256Hex(PEPPER+":"+token2));
        staffOperations.merge("T01", "T02", staff);
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM table_sessions WHERE status='PREPARED' AND opened_at IS NULL", Integer.class));
        assertEquals("PREPARED", ((List<Map<String,Object>>)staffOperations.listTables().get("tables")).getFirst().get("sessionStatus"));
        var order = orders.create(customerOrder("T02", token2, "cola"), false);
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM table_sessions WHERE status='OPEN'", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(DISTINCT opened_at) FROM table_sessions", Integer.class));
        String opened = jdbc.queryForObject("SELECT opened_at::text FROM table_sessions LIMIT 1", String.class);
        String session = staffOperations.tableDetail("T01").get("sessionId").toString();
        staffOperations.checkIn("T01", session, "2026-09-17T01:50:00+09:00", staff);
        assertEquals(opened, jdbc.queryForObject("SELECT opened_at::text FROM table_sessions LIMIT 1", String.class));
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM table_sessions WHERE departure_at='2026-09-17T01:50:00+09:00'", Integer.class));
        assertEquals(1, ((List<?>)orders.list(Map.of("tableId","T01","tableToken",TABLE_TOKEN)).get("orders")).size());
        staffOperations.confirmPayment("T01",session,UUID.randomUUID().toString(),1500,staff,"입금자");
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM table_sessions WHERE status='CLOSED'", Integer.class));
        assertEquals(null, staffOperations.tableDetail("T01").get("openedAt"));
        var fresh = orders.create(customerOrder("T02", token2, "cola"),false);
        assertTrue(!fresh.get("orderId").equals(order.get("orderId")));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM table_sessions WHERE status='OPEN'", Integer.class));
    }

    @Test
    void explicitCheckInAndConcurrentFirstOrdersPreserveEarliestTime() throws Exception {
        StaffPrincipal staff = new StaffPrincipal("카운터", Instant.now(), Instant.now().plusSeconds(3600), 1);
        staffOperations.checkIn("T01",null,null,staff);
        String session=staffOperations.tableDetail("T01").get("sessionId").toString();
        jdbc.update("UPDATE table_sessions SET opened_at=now()-interval '35 minutes',departure_at=now()-interval '5 minutes'");
        String opened=jdbc.queryForObject("SELECT opened_at::text FROM table_sessions",String.class);
        try(var executor=Executors.newFixedThreadPool(3)) {
            var one=executor.submit(()->orders.create(customerOrder("T01",TABLE_TOKEN,"cola"),false));
            var two=executor.submit(()->staffOperations.checkIn("T01",session,null,staff));
            one.get();two.get();
        }
        assertEquals(opened,jdbc.queryForObject("SELECT opened_at::text FROM table_sessions",String.class));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM table_sessions",Integer.class));
        assertThrows(ApiException.class,()->staffOperations.checkIn("T01",session,"2026-09-16T20:00:00+09:00",staff));
        staffOperations.checkIn("T01",session,"2026-09-15T19:50:00+09:00",staff);
        orders.create(customerOrder("T01",TABLE_TOKEN,"cola"),false); // overdue never blocks
    }

    @Test
    void mixedFoodAndDrinkAreRoutedIndependentlyImmediately() {
        var body=customerOrder("T01",TABLE_TOKEN,"chicken-feet");
        body.put("expectedTotalAmount",11500);
        body.put("items",List.of(Map.of("menuId","chicken-feet","quantity",1),Map.of("menuId","cola","quantity",1)));
        var order=orders.create(body,false);
        var queue=staffOperations.queues();
        var kitchen=(List<Map<String,Object>>)queue.get("kitchen");
        var serving=(List<Map<String,Object>>)queue.get("serving");
        assertEquals(1,kitchen.size());assertEquals(1,serving.size());
        assertEquals("닭발",((List<Map<String,Object>>)kitchen.getFirst().get("items")).getFirst().get("name"));
        assertEquals("콜라",((List<Map<String,Object>>)serving.getFirst().get("items")).getFirst().get("name"));
        StaffPrincipal staff = new StaffPrincipal("서빙", Instant.now(), Instant.now().plusSeconds(3600), 1);
        staffOperations.updateStatus(Map.of("orderId",order.get("orderId"),"status","SERVED"),staff);
        assertEquals(1,((List<?>)staffOperations.queues().get("kitchen")).size());
        assertEquals(0,((List<?>)staffOperations.queues().get("serving")).size());
    }

    @Test
    void coinReceiptIsIdempotentAndSeparateFromWonDiscountsAndServing() throws Exception {
        StaffPrincipal staff = new StaffPrincipal("서빙", Instant.now(), Instant.now().plusSeconds(3600), 1);
        var body=customerOrder("T01",TABLE_TOKEN,"soju");body.put("paymentMethod","COIN");body.put("expectedTotalAmount",18);
        body.put("items",List.of(Map.of("menuId","soju","quantity",2)));
        var coin=orders.create(body,false);String id=coin.get("orderId").toString();
        assertEquals(0,coin.get("totalAmount"));assertEquals(18,coin.get("coinTotal"));
        assertEquals(id,orders.create(body,false).get("orderId"));
        orders.create(customerOrder("T01",TABLE_TOKEN,"soju"),false);
        staffOperations.discount("T01",20,staff);
        String day=java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).toString();
        var pending=(List<Map<String,Object>>)sales.report(day,day).get("rows");
        var pendingCoin=pending.stream().filter(r->r.get("type").equals("COIN")).findFirst().orElseThrow();
        assertEquals(18L,pendingCoin.get("pendingCoins"));assertEquals(0L,pendingCoin.get("receivedCoins"));
        assertEquals("COINS_NOT_RECEIVED",assertThrows(ApiException.class,()->staffOperations.updateStatus(Map.of("orderId",id,"status","SERVED"),staff)).code());
        assertEquals("COIN_AMOUNT_CHANGED",assertThrows(ApiException.class,()->staffOperations.receiveCoins(id,9,staff)).code());
        try(var executor=Executors.newFixedThreadPool(2)) {
            var a=executor.submit(()->staffOperations.receiveCoins(id,18,staff));var b=executor.submit(()->staffOperations.receiveCoins(id,18,staff));a.get();b.get();
        }
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE action='COINS_RECEIVED'",Integer.class));
        assertEquals("READY",jdbc.queryForObject("SELECT preparation_status FROM order_items WHERE order_id=?",String.class,UUID.fromString(id)));
        String item=jdbc.queryForObject("SELECT order_item_id::text FROM order_items WHERE order_id=?",String.class,UUID.fromString(id));
        assertEquals("COINS_ALREADY_RECEIVED",assertThrows(ApiException.class,()->staffOperations.updateOrder(Map.of("operation","quantity","itemId",item,"quantity",3),staff)).code());
        staffOperations.updateStatus(Map.of("orderId",id,"status","SERVED"),staff);
        String session=staffOperations.tableDetail("T01").get("sessionId").toString();
        staffOperations.confirmPayment("T01",session,UUID.randomUUID().toString(),3600,staff,"홍길동");
        var rows=(List<Map<String,Object>>)sales.report(day,day).get("rows");
        var received=rows.stream().filter(r->r.get("type").equals("COIN")).findFirst().orElseThrow();
        assertEquals(18L,received.get("receivedCoins"));assertEquals(0L,received.get("amount"));assertEquals(0L,received.get("pendingCoins"));
        assertEquals(3600L,rows.stream().filter(r->r.get("type").equals("MEMBER")).findFirst().orElseThrow().get("amount"));
        assertEquals("WAIVED",jdbc.queryForObject("SELECT payment_status FROM orders WHERE order_id=?",String.class,UUID.fromString(id)));
    }

    @Test
    void onlyEligibleMenusAcceptCoinsAndOptionsAreRemoved() throws Exception {
        var body=customerOrder("T01",TABLE_TOKEN,"cola");body.put("paymentMethod","COIN");body.put("expectedTotalAmount",9);
        assertThrows(ApiException.class,()->orders.create(body,false));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM table_sessions",Integer.class));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('options','option_groups','order_item_options')",Integer.class));
        for(var entry:Map.of("soju",9,"beer",9,"banana-milk-highball",10,"mix-coffee-highball",10,"frozen-sikhye",8,"eolbaksa",8).entrySet()) {
            var request=customerOrder("T01",TABLE_TOKEN,entry.getKey());request.put("paymentMethod","COIN");request.put("expectedTotalAmount",entry.getValue());
            assertEquals(entry.getValue(),orders.create(request,false).get("coinTotal"));
        }
        body.put("paymentMethod","KRW");body.put("items",List.of(Map.of("menuId","cola","quantity",1,"selectedOptionIds",List.of())));
        assertEquals("INVALID_REQUEST",assertThrows(ApiException.class,()->orders.create(body,false)).code());
    }


    @Test
    void cancelledCoinLinesDoNotBlockZeroWonCheckout() {
        StaffPrincipal staff=new StaffPrincipal("서빙",Instant.now(),Instant.now().plusSeconds(3600),1);
        var request=customerOrder("T01",TABLE_TOKEN,"soju");request.put("paymentMethod","COIN");request.put("expectedTotalAmount",9);
        var order=orders.create(request,false);
        String item=jdbc.queryForObject("SELECT order_item_id::text FROM order_items WHERE order_id=?::uuid",String.class,order.get("orderId"));
        staffOperations.updateOrder(Map.of("operation","cancel-item","itemId",item),staff);
        assertEquals("CANCELLED",jdbc.queryForObject("SELECT status FROM orders WHERE order_id=?::uuid",String.class,order.get("orderId")));
        staffOperations.confirmPayment("T01",0,staff,"원화 결제 없음");
        assertEquals(null,staffOperations.tableDetail("T01").get("sessionId"));
    }

    @Test
    void receivedCoinOnlyVisitCanCloseWithoutWonAndCannotLoseReceiptByReset() {
        StaffPrincipal staff=new StaffPrincipal("서빙",Instant.now(),Instant.now().plusSeconds(3600),1);
        var request=customerOrder("T01",TABLE_TOKEN,"soju");request.put("paymentMethod","COIN");request.put("expectedTotalAmount",9);
        var order=orders.create(request,false);String id=order.get("orderId").toString();
        String session=staffOperations.tableDetail("T01").get("sessionId").toString();
        assertEquals("COINS_NOT_RECEIVED",assertThrows(ApiException.class,()->staffOperations.confirmPayment("T01",0,staff,"원화 결제 없음")).code());
        staffOperations.receiveCoins(id,9,staff);
        assertEquals("COINS_ALREADY_RECEIVED",assertThrows(ApiException.class,()->staffOperations.cancelOrders("T01",staff)).code());
        assertEquals("COINS_ALREADY_RECEIVED",assertThrows(ApiException.class,()->staffOperations.resetTable("T01",session,staff)).code());
        staffOperations.updateStatus(Map.of("orderId",id,"status","SERVED"),staff);
        staffOperations.confirmPayment("T01",0,staff,"원화 결제 없음");
        assertEquals(null,staffOperations.tableDetail("T01").get("sessionId"));
        assertEquals("ORDER_NOT_ACTIVE",assertThrows(ApiException.class,()->staffOperations.updateStatus(Map.of("orderId",id,"status","READY"),staff)).code());
    }

    @Test
    void migrationDeletesAllOptionRecordsWhilePreservingHistoricAmounts() {
        String schema="option_migration_test";
        var config=org.flywaydb.core.Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword()).schemas(schema).defaultSchema(schema);
        config.target("6").load().migrate();
        var source=new org.springframework.jdbc.datasource.DriverManagerDataSource(postgres.getJdbcUrl()+(postgres.getJdbcUrl().contains("?") ? "&" : "?")+"currentSchema="+schema,postgres.getUsername(),postgres.getPassword());
        var old=new JdbcTemplate(source);
        UUID session=UUID.randomUUID(),order=UUID.randomUUID(),item=UUID.randomUUID();
        old.update("INSERT INTO tables(table_id,display_name,token_hash) VALUES('T01','테스트',?)","a".repeat(64));
        old.update("INSERT INTO table_sessions(session_id,table_id,origin_table_id,status,opened_at) VALUES(?,'T01','T01','OPEN',now())",session);
        old.update("INSERT INTO orders(order_id,display_number,display_code,client_request_id,idempotency_key,request_fingerprint,table_id,session_id,status,public_status,total_amount,payment_status) VALUES(?,1,'A1',?,'old-order',?,'T01',?,'COMPLETED','served',23000,'PAID')",order,UUID.randomUUID(),"0".repeat(64),session);
        old.update("INSERT INTO order_items(order_item_id,order_id,line_no,menu_id,menu_name_snapshot,base_price_snapshot,unit_price_snapshot,quantity,line_total) VALUES(?,?,1,'chicken-feet','닭발',10000,11500,2,23000)",item,order);
        old.update("INSERT INTO option_groups(option_group_id,menu_id,label,selection_type) VALUES('old-group','chicken-feet','과거 옵션','SINGLE')");
        old.update("INSERT INTO options(option_id,option_group_id,menu_id,name,price_delta) VALUES('old-option','old-group','chicken-feet','추가',1500)");
        old.update("INSERT INTO order_item_options(order_item_option_id,order_item_id,order_id,option_group_id,option_group_name_snapshot,option_id,option_name_snapshot,price_delta_snapshot) VALUES(?,?,?,'old-group','과거 옵션','old-option','추가',1500)",UUID.randomUUID(),item,order);
        org.flywaydb.core.Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword()).schemas(schema).defaultSchema(schema).load().migrate();
        assertEquals(23000,old.queryForObject("SELECT total_amount FROM orders WHERE order_id=?",Integer.class,order));
        assertEquals(2,old.queryForObject("SELECT quantity FROM order_items WHERE order_item_id=?",Integer.class,item));
        assertEquals(23000,old.queryForObject("SELECT line_total FROM order_items WHERE order_item_id=?",Integer.class,item));
        assertEquals(11500,old.queryForObject("SELECT unit_price_snapshot FROM order_items WHERE order_item_id=?",Integer.class,item));
        assertEquals(0,old.queryForObject("SELECT count(*) FROM information_schema.tables WHERE table_schema=? AND table_name IN ('options','option_groups','order_item_options')",Integer.class,schema));
    }
    private static Map<String, Object> customerOrder(String tableId, String token, String menuId) {
        Map<String, Object> request = new HashMap<>();
        request.put("tableId", tableId);
        request.put("tableToken", token);
        request.put("clientRequestId", UUID.randomUUID().toString());
        request.put("expectedTotalAmount", switch (menuId) {
            case "chicken-feet", "tteokbokki-egg-fried-set" -> 10_000;
            case "jjapagetti-egg-cheese" -> 5_000;
            case "spicy-pork" -> 9_000;
            case "perilla-egg-fry-sikhye-set" -> 8_000;
            case "seaweed-soup-rice", "dried-snack-platter" -> 7_000;
            case "tuna-mayo-rice-ball" -> 6_000;
            case "cheese-egg-custard" -> 9_000;
            case "red-bean-bingsu", "soju", "beer" -> 4_500;
            case "banana-milk-highball", "mix-coffee-highball", "classic-highball" -> 5_000;
            case "frozen-sikhye", "eolbaksa" -> 3_000;
            case "cola", "cider" -> 1_500;
            default -> throw new IllegalArgumentException(menuId);
        });
        request.put("note", "");
        request.put("items", List.of(Map.of(
                "menuId", menuId, "quantity", 1)));
        return request;
    }
}

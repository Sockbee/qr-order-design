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

    @BeforeEach
    void table() {
        jdbc.update("DELETE FROM auth_attempts");
        jdbc.update("DELETE FROM domain_events");
        jdbc.update("DELETE FROM audit_logs");
        jdbc.update("DELETE FROM calls");
        jdbc.update("DELETE FROM order_item_options");
        jdbc.update("DELETE FROM order_items");
        jdbc.update("DELETE FROM orders");
        jdbc.update("DELETE FROM table_sessions");
        jdbc.update("DELETE FROM tables");
        jdbc.update("INSERT INTO tables(table_id,display_name,token_hash,sort_order) VALUES('T01','테이블 1',?,1)",
                StaffTokenService.sha256Hex(PEPPER + ":" + TABLE_TOKEN));
        jdbc.update("UPDATE settings SET value='1042' WHERE key='NEXT_DISPLAY_NUMBER'");
    }

    @Test
    void exposesGroupedOpenApiWithBearerAndSseDocumentation() throws Exception {
        mvc.perform(get("/v3/api-docs/customer"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.info.title", is("QR Order API")))
                .andExpect(jsonPath("$.paths['/api/v1/customer/bootstrap'].post.summary", is("고객 화면 초기화")))
                .andExpect(jsonPath("$.paths['/api/v1/customer/events'].post.responses['200'].content['text/event-stream']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/customer/bootstrap'].post.responses.default['$ref']",
                        is("#/components/responses/ApiError")));

        mvc.perform(get("/v3/api-docs/staff"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.components.securitySchemes.staffBearer.type", is("http")))
                .andExpect(jsonPath("$.paths['/api/v1/staff/tables/list'].post.security[0].staffBearer").isArray())
                .andExpect(jsonPath("$.paths['/api/v1/staff/login'].post.security").doesNotExist());

        mvc.perform(get("/v3/api-docs/admin"))
                .andExpect(status().isOk())
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
                {"tableId":"T01","tableToken":"%s","clientRequestId":"%s","note":"",
                 "items":[{"menuId":"chicken-feet","quantity":2,"selectedOptionIds":[]}]}
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
                    request.put("note", "");
                    request.put("items", List.of(Map.of(
                            "menuId", "cola", "quantity", 1, "selectedOptionIds", List.of())));
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
        assertThrows(ApiException.class, () -> staffOperations.confirmPayment("T01", 2_399, staff));
        staffOperations.split("T01", staff);
        staffOperations.move("T01", "T03", staff);

        orders.create(customerOrder("T01", TABLE_TOKEN, "cola"), false);
        assertEquals(1, jdbc.queryForObject(
                "SELECT count(*) FROM table_sessions WHERE origin_table_id='T01' AND status='OPEN'", Integer.class));
        assertEquals("T03", jdbc.queryForObject(
                "SELECT table_id FROM table_sessions WHERE origin_table_id='T01' AND status='OPEN'", String.class));
        staffOperations.confirmPayment("T03", 2_400, staff);
        assertEquals("CLOSED", jdbc.queryForObject(
                "SELECT status FROM table_sessions WHERE origin_table_id='T01' ORDER BY opened_at DESC LIMIT 1", String.class));
    }

    private static Map<String, Object> customerOrder(String tableId, String token, String menuId) {
        Map<String, Object> request = new HashMap<>();
        request.put("tableId", tableId);
        request.put("tableToken", token);
        request.put("clientRequestId", UUID.randomUUID().toString());
        request.put("note", "");
        request.put("items", List.of(Map.of(
                "menuId", menuId, "quantity", 1, "selectedOptionIds", List.of())));
        return request;
    }
}

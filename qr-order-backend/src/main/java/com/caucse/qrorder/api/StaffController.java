package com.caucse.qrorder.api;

import com.caucse.qrorder.auth.StaffAuthFilter;
import com.caucse.qrorder.auth.StaffPrincipal;
import com.caucse.qrorder.config.OpenApiConfig;
import com.caucse.qrorder.domain.StaffOperationsService;
import com.caucse.qrorder.sse.SseHub;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/staff")
@Tag(name = "Staff", description = "운영 대시보드, 주문·테이블·호출 처리")
@SecurityRequirement(name = OpenApiConfig.STAFF_BEARER)
public class StaffController {
    private final StaffOperationsService service;
    private final SseHub sse;

    public StaffController(StaffOperationsService service, SseHub sse) {
        this.service = service;
        this.sse = sse;
    }

    @PostMapping("/calls/list")
    @Operation(summary = "대기 중인 직원 호출 조회")
    ApiEnvelope<Map<String, Object>> calls() { return ApiEnvelope.ok(service.listCalls()); }

    @PostMapping("/calls/acknowledge")
    @Operation(summary = "직원 호출 확인 처리")
    ApiEnvelope<Map<String, Object>> acknowledge(@RequestBody Map<String, Object> body, @RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff) {
        return ApiEnvelope.ok(service.acknowledgeCall(required(body, "tableId"), staff));
    }

    @PostMapping("/tables/list")
    @Operation(summary = "운영 테이블 목록 조회")
    ApiEnvelope<Map<String, Object>> tables() { return ApiEnvelope.ok(service.listTables()); }

    @PostMapping("/tables/detail")
    @Operation(summary = "테이블 주문 상세 조회")
    ApiEnvelope<Map<String, Object>> detail(@RequestBody Map<String, Object> body) { return ApiEnvelope.ok(service.tableDetail(required(body, "tableId"))); }

    @PostMapping("/tables/bill")
    @Operation(summary = "테이블 계산서 조회")
    ApiEnvelope<Map<String, Object>> bill(@RequestBody Map<String, Object> body) { return ApiEnvelope.ok(service.billResponse(required(body, "tableId"))); }

    @Operation(summary = "테이블 할인율 변경")
    @PostMapping("/tables/discount") ApiEnvelope<Void> discount(@RequestBody Map<String, Object> body, @RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff) {
        return ApiEnvelope.ok(service.discount(required(body, "tableId"), number(body, "discountRate"), staff));
    }
    @Operation(summary = "테이블 주문 이동")
    @PostMapping("/tables/move") ApiEnvelope<Void> move(@RequestBody Map<String, Object> body, @RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff) {
        return ApiEnvelope.ok(service.move(required(body, "fromTableId"), required(body, "toTableId"), staff));
    }
    @Operation(summary = "테이블 합석")
    @PostMapping("/tables/merge") ApiEnvelope<Void> merge(@RequestBody Map<String, Object> body, @RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff) {
        return ApiEnvelope.ok(service.merge(required(body, "primaryTableId"), required(body, "secondaryTableId"), staff));
    }
    @Operation(summary = "합석 테이블 분리")
    @PostMapping("/tables/split") ApiEnvelope<Void> split(@RequestBody Map<String, Object> body, @RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff) {
        return ApiEnvelope.ok(service.split(required(body, "tableId"), staff));
    }
    @Operation(summary = "결제 확정", description = "expectedFinalAmount가 서버 계산 금액과 일치할 때만 확정합니다.")
    @PostMapping("/tables/confirm-payment") ApiEnvelope<Void> payment(@RequestBody Map<String, Object> body, @RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff) {
        return ApiEnvelope.ok(service.confirmPayment(required(body, "tableId"), number(body, "expectedFinalAmount"), staff));
    }
    @Operation(summary = "주문 상태 변경")
    @PostMapping("/orders/status") ApiEnvelope<Void> status(@RequestBody Map<String, Object> body, @RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff) {
        return ApiEnvelope.ok(service.updateStatus(body, staff));
    }
    @PostMapping("/orders/queue")
    @Operation(summary = "조리 주문 큐 조회")
    ApiEnvelope<Map<String, Object>> queues() { return ApiEnvelope.ok(service.queues()); }

    @Operation(summary = "운영진 주문 추가")
    @PostMapping("/orders/create") ApiEnvelope<Map<String, Object>> create(@RequestBody Map<String, Object> body, @RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff) {
        return ApiEnvelope.ok(service.createOrder(body, staff));
    }
    @Operation(summary = "주문 항목 수정")
    @PostMapping("/orders/update") ApiEnvelope<Void> update(@RequestBody Map<String, Object> body, @RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff) {
        return ApiEnvelope.ok(service.updateOrder(body, staff));
    }
    @Operation(summary = "테이블 미결제 주문 취소")
    @PostMapping("/orders/cancel") ApiEnvelope<Void> cancel(@RequestBody Map<String, Object> body, @RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff) {
        return ApiEnvelope.ok(service.cancelOrders(required(body, "tableId"), staff));
    }
    @PostMapping("/menu/list")
    @Operation(summary = "운영 메뉴 목록 조회")
    ApiEnvelope<Map<String, Object>> menu() { return ApiEnvelope.ok(service.menu()); }

    @Operation(summary = "메뉴 품절 상태 변경")
    @PostMapping("/menu/availability") ApiEnvelope<Void> availability(@RequestBody Map<String, Object> body, @RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff) {
        return ApiEnvelope.ok(service.availability(required(body, "itemId"), bool(body, "soldOut"), staff));
    }
    @PostMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "운영 실시간 이벤트 연결", description = "Bearer 인증이 필요한 fetch 기반 POST SSE입니다. 20초 heartbeat와 Last-Event-ID 재개를 지원합니다.")
    @ApiResponse(responseCode = "200", description = "운영 domain event SSE stream",
            content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE,
                    schema = @Schema(type = "string", example = "id: 42\nevent: order.updated\ndata: {\"id\":42,\"type\":\"order.updated\"}\n\n")))
    SseEmitter events(@Parameter(description = "마지막으로 처리한 domain event ID", example = "42")
                      @RequestHeader(name = "Last-Event-ID", required = false, defaultValue = "0") long lastEventId) {
        return sse.staff(lastEventId);
    }

    private static String required(Map<String, Object> body, String field) {
        Object value = body.get(field); if (value == null || String.valueOf(value).isBlank()) throw ApiException.invalid(field + " 값을 확인해 주세요."); return String.valueOf(value);
    }
    private static int number(Map<String, Object> body, String field) { if (!(body.get(field) instanceof Number value)) throw ApiException.invalid(field + " 값을 확인해 주세요."); return value.intValue(); }
    private static boolean bool(Map<String, Object> body, String field) { if (!(body.get(field) instanceof Boolean value)) throw ApiException.invalid(field + " 값을 확인해 주세요."); return value; }
}

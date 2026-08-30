package com.caucse.qrorder.api;

import com.caucse.qrorder.domain.CustomerOrderService;
import com.caucse.qrorder.domain.TableCatalogService;
import com.caucse.qrorder.sse.SseHub;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/customer")
@Tag(name = "Customer", description = "QR 테이블 인증, 메뉴, 주문, 직원 호출 및 실시간 이벤트")
public class CustomerController {
    private final TableCatalogService catalog;
    private final CustomerOrderService orders;
    private final SseHub sse;

    public CustomerController(TableCatalogService catalog, CustomerOrderService orders, SseHub sse) {
        this.catalog = catalog;
        this.orders = orders;
        this.sse = sse;
    }

    @PostMapping("/resolve-table")
    @Operation(summary = "QR 테이블 확인", description = "tableId와 원본 tableToken을 검증하고 테이블 정보를 반환합니다.")
    ApiEnvelope<Map<String, Object>> resolve(@RequestBody Map<String, Object> body) {
        return ApiEnvelope.ok(catalog.resolve(required(body, "tableId"), required(body, "tableToken")));
    }

    @PostMapping("/menu")
    @Operation(summary = "메뉴 카탈로그 조회", description = "QR 인증 후 현재 메뉴·옵션·매장 설정을 반환합니다.")
    ApiEnvelope<Map<String, Object>> menu(@RequestBody Map<String, Object> body) {
        return ApiEnvelope.ok(catalog.menu(required(body, "tableId"), required(body, "tableToken")));
    }

    @PostMapping("/bootstrap")
    @Operation(
            summary = "고객 화면 초기화",
            description = "테이블 확인과 전체 카탈로그를 한 요청으로 반환하는 권장 초기 진입 API입니다.",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(examples = @ExampleObject(
                            value = "{\"tableId\":\"T01\",\"tableToken\":\"printed-qr-token\"}"))))
    ApiEnvelope<Map<String, Object>> bootstrap(@RequestBody Map<String, Object> body) {
        return ApiEnvelope.ok(catalog.bootstrap(required(body, "tableId"), required(body, "tableToken")));
    }

    @PostMapping("/orders/create")
    @Operation(summary = "주문 생성", description = "clientRequestId를 idempotency key로 사용하며 주문 시점 가격을 저장합니다.")
    ApiEnvelope<Map<String, Object>> createOrder(@RequestBody Map<String, Object> body) {
        return ApiEnvelope.ok(orders.create(body, false));
    }

    @PostMapping("/orders/get")
    @Operation(summary = "주문 단건 조회")
    ApiEnvelope<Map<String, Object>> getOrder(@RequestBody Map<String, Object> body) {
        return ApiEnvelope.ok(orders.get(body));
    }

    @PostMapping("/orders/list")
    @Operation(summary = "테이블 주문 목록 조회")
    ApiEnvelope<Map<String, Object>> listOrders(@RequestBody Map<String, Object> body) {
        return ApiEnvelope.ok(orders.list(body));
    }

    @PostMapping("/calls/create")
    @Operation(summary = "직원 호출", description = "clientRequestId 중복과 테이블별 호출 간격을 검사합니다.")
    ApiEnvelope<Map<String, Object>> createCall(@RequestBody Map<String, Object> body) {
        return ApiEnvelope.ok(orders.createCall(body));
    }

    @PostMapping("/calls/cancel")
    @Operation(summary = "고객 직원 호출 취소")
    ApiEnvelope<Void> cancelCall(@RequestBody Map<String, Object> body) {
        return ApiEnvelope.ok(orders.cancelCall(body));
    }

    @PostMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(
            summary = "고객 실시간 이벤트 연결",
            description = "fetch 기반 POST SSE입니다. 20초 heartbeat와 Last-Event-ID 재개를 지원합니다. 이벤트 수신 후 관련 snapshot API를 다시 조회합니다.")
    @ApiResponse(
            responseCode = "200",
            description = "id, event, data 필드로 구성된 SSE stream",
            content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE,
                    schema = @Schema(type = "string", example = "id: 42\nevent: order.updated\ndata: {\"id\":42,\"type\":\"order.updated\",\"entityId\":\"...\",\"revision\":3,\"occurredAt\":\"2026-08-30T00:00:00Z\"}\n\n")))
    SseEmitter events(@RequestBody Map<String, Object> body,
                      @Parameter(description = "마지막으로 처리한 domain event ID", example = "42")
                      @RequestHeader(name = "Last-Event-ID", required = false, defaultValue = "0") long lastEventId) {
        String tableId = required(body, "tableId");
        catalog.requireTable(tableId, required(body, "tableToken"), false);
        return sse.customer(tableId, lastEventId);
    }

    private static String required(Map<String, Object> body, String field) {
        Object value = body.get(field);
        if (value == null || String.valueOf(value).isBlank()) throw ApiException.invalid(field + " 값을 확인해 주세요.");
        return String.valueOf(value);
    }
}

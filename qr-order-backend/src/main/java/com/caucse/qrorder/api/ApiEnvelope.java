package com.caucse.qrorder.api;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Schema(description = "모든 JSON API에서 사용하는 표준 응답 envelope")
public record ApiEnvelope<T>(
        @Schema(description = "요청 성공 여부") boolean success,
        @Schema(description = "성공 데이터. 실패 시 null") T data,
        @Schema(description = "오류 정보. 성공 시 null") ErrorBody error,
        @Schema(description = "API 버전, 요청 ID 및 서버 시각") Meta meta) {
    public static <T> ApiEnvelope<T> ok(T data) {
        return new ApiEnvelope<>(true, data, null, Meta.create());
    }

    public static ApiEnvelope<Void> failure(String code, String message, boolean retryable, Object details) {
        return new ApiEnvelope<>(false, null, new ErrorBody(code, message, retryable, details), Meta.create());
    }

    @Schema(description = "클라이언트가 분기 가능한 표준 오류")
    public record ErrorBody(
            @Schema(example = "INVALID_REQUEST") String code,
            @Schema(example = "요청 정보를 확인해 주세요.") String message,
            boolean retryable,
            Object details) {}

    public record Meta(
            @Schema(example = "v1") String apiVersion,
            @Schema(format = "uuid") String requestId,
            Instant serverTime) {
        static Meta create() {
            return new Meta("v1", UUID.randomUUID().toString(), Instant.now());
        }
    }

    public static Map<String, Object> map(Object... values) {
        var result = new java.util.LinkedHashMap<String, Object>();
        for (int index = 0; index < values.length; index += 2) {
            result.put(String.valueOf(values[index]), values[index + 1]);
        }
        return result;
    }
}

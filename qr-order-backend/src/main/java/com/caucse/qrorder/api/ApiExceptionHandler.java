package com.caucse.qrorder.api;

import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiEnvelope<Void>> api(ApiException error) {
        return ResponseEntity.status(error.status()).body(ApiEnvelope.failure(
                error.code(), error.getMessage(), error.retryable(), error.details()));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, ConstraintViolationException.class,
            HttpMessageNotReadableException.class})
    ResponseEntity<ApiEnvelope<Void>> validation(Exception error) {
        return ResponseEntity.badRequest().body(ApiEnvelope.failure(
                "INVALID_REQUEST", "요청 정보를 확인해 주세요.", false, null));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiEnvelope<Void>> integrity(DataIntegrityViolationException error) {
        log.warn("Database constraint rejected request", error);
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiEnvelope.failure(
                "CONFLICT", "이미 처리되었거나 현재 상태와 충돌합니다.", false, null));
    }

    @ExceptionHandler({org.springframework.transaction.CannotCreateTransactionException.class,
            org.springframework.dao.DataAccessResourceFailureException.class,
            org.springframework.dao.CannotAcquireLockException.class})
    ResponseEntity<ApiEnvelope<Void>> busy(Exception error) {
        log.warn("Database capacity temporarily unavailable", error);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).header("Retry-After", "1")
                .body(ApiEnvelope.failure("SERVER_BUSY", "주문이 몰리고 있어요. 잠시 후 같은 요청으로 다시 확인해 주세요.", true, null));
    }

    @ExceptionHandler({org.springframework.web.context.request.async.AsyncRequestNotUsableException.class,
            org.springframework.web.context.request.async.AsyncRequestTimeoutException.class})
    void disconnected(Exception error) {
        // A completed/aborted SSE response cannot carry a JSON error envelope.
        log.debug("Async client disconnected: {}", error.getMessage());
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiEnvelope<Void>> unexpected(Exception error) {
        log.error("Unhandled API error", error);
        return ResponseEntity.internalServerError().body(ApiEnvelope.failure(
                "INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", true, null));
    }
}

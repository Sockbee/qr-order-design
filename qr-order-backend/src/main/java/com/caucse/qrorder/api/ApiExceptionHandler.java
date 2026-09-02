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

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiEnvelope<Void>> unexpected(Exception error) {
        log.error("Unhandled API error", error);
        return ResponseEntity.internalServerError().body(ApiEnvelope.failure(
                "INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", true, null));
    }
}

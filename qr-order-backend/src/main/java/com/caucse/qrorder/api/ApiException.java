package com.caucse.qrorder.api;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final boolean retryable;
    private final Object details;

    public ApiException(HttpStatus status, String code, String message, boolean retryable) {
        this(status, code, message, retryable, null);
    }

    public ApiException(HttpStatus status, String code, String message, boolean retryable, Object details) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryable = retryable;
        this.details = details;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }
    public boolean retryable() { return retryable; }
    public Object details() { return details; }

    public static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message, false);
    }

    public static ApiException notFound(String code, String message) {
        return new ApiException(HttpStatus.NOT_FOUND, code, message, false);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message, false);
    }
}

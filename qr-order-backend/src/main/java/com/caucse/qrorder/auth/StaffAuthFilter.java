package com.caucse.qrorder.auth;

import com.caucse.qrorder.api.ApiEnvelope;
import com.caucse.qrorder.api.ApiException;
import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

public class StaffAuthFilter extends OncePerRequestFilter {
    public static final String PRINCIPAL_ATTRIBUTE = "staffPrincipal";
    private final StaffTokenService tokenService;
    private final ObjectMapper objectMapper;

    public StaffAuthFilter(StaffTokenService tokenService, ObjectMapper objectMapper) {
        this.tokenService = tokenService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return "OPTIONS".equalsIgnoreCase(request.getMethod())
                || (!path.startsWith("/api/v1/staff/") && !path.startsWith("/api/v1/admin/"))
                || path.equals("/api/v1/staff/login");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            writeError(response, new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED,
                    "STAFF_AUTH_REQUIRED", "운영 인증이 필요합니다.", false));
            return;
        }
        try {
            request.setAttribute(PRINCIPAL_ATTRIBUTE, tokenService.verify(header.substring(7)));
            chain.doFilter(request, response);
        } catch (ApiException error) {
            writeError(response, error);
        }
    }

    private void writeError(HttpServletResponse response, ApiException error) throws IOException {
        response.setStatus(error.status().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), ApiEnvelope.failure(
                error.code(), error.getMessage(), error.retryable(), error.details()));
    }
}

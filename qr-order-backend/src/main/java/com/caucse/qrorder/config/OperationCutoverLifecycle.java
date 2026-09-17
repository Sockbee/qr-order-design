package com.caucse.qrorder.config;

import com.caucse.qrorder.domain.OperationCutoverService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Scheduler wakes live screens; the request guard also covers idle instances and restarts. */
@Component
public class OperationCutoverLifecycle implements WebMvcConfigurer, HandlerInterceptor {
    private static final Logger log = LoggerFactory.getLogger(OperationCutoverLifecycle.class);
    private final OperationCutoverService cutover;
    public OperationCutoverLifecycle(OperationCutoverService cutover) { this.cutover = cutover; }
    @Scheduled(fixedDelayString = "${qr-order.cutover-poll-ms:1000}", initialDelayString = "${qr-order.cutover-initial-delay-ms:1000}")
    public void tick() {
        try { cutover.startIfDue(); }
        catch (RuntimeException error) { log.error("Operating-day cutover failed; will retry", error); }
    }
    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(this).addPathPatterns("/api/v1/**");
    }
    @Override public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        cutover.startIfDue();
        return true;
    }
}

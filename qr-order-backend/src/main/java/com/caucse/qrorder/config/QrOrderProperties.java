package com.caucse.qrorder.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Arrays;
import java.util.List;

@ConfigurationProperties(prefix = "qr-order")
public record QrOrderProperties(
        String tokenPepper,
        String staffPasscodeHash,
        String staffTokenSecret,
        String allowedOrigins,
        String frontendBaseUrl,
        Sse sse
) {
    public List<String> allowedOriginList() {
        return Arrays.stream(allowedOrigins.split(","))
                .map(String::trim).filter(value -> !value.isEmpty()).toList();
    }

    public record Sse(long timeoutMs, long heartbeatMs) {}
}

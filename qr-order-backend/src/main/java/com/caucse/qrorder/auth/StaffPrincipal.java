package com.caucse.qrorder.auth;

import java.time.Instant;

public record StaffPrincipal(String deviceLabel, Instant issuedAt, Instant expiresAt, int epoch) {}

package com.caucse.qrorder.auth;

import com.caucse.qrorder.api.ApiException;
import com.caucse.qrorder.config.QrOrderProperties;
import tools.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Set;

@Service
public class StaffTokenService {
    private static final Set<String> LABELS = Set.of("카운터", "주방", "서빙", "결제");
    private final QrOrderProperties properties;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbc;

    public StaffTokenService(QrOrderProperties properties, ObjectMapper objectMapper, JdbcTemplate jdbc) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.jdbc = jdbc;
    }

    public Map<String, Object> login(String passcode, String deviceLabel) {
        if (!LABELS.contains(deviceLabel)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DEVICE_LABEL", "스테이션을 다시 선택해 주세요.", false);
        }
        if (passcode == null || passcode.isBlank() || passcode.length() > 512) {
            throw ApiException.invalid("passcode를 확인해 주세요.");
        }
        checkThrottle(deviceLabel);
        String configured = properties.staffPasscodeHash();
        if (configured == null || !configured.matches("(?i)^[0-9a-f]{64}$")) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "STAFF_AUTH_NOT_CONFIGURED",
                    "운영 인증이 설정되지 않았습니다.", false);
        }
        String actual = sha256Hex(properties.tokenPepper() + ":" + passcode);
        if (!MessageDigest.isEqual(actual.getBytes(StandardCharsets.US_ASCII),
                configured.toLowerCase().getBytes(StandardCharsets.US_ASCII))) {
            Instant retryAfter = recordFailure(deviceLabel);
            auditAuth("STAFF_LOGIN_FAILED", deviceLabel, "PASSCODE_MISMATCH");
            if (retryAfter != null) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "STAFF_LOGIN_THROTTLED",
                        "시도가 많습니다. 잠시 후 다시 시도해 주세요.", true,
                        Map.of("retryAfter", retryAfter.toString()));
            }
            throw new ApiException(HttpStatus.UNAUTHORIZED, "STAFF_PASSCODE_MISMATCH",
                    "passcode가 올바르지 않습니다.", false);
        }
        clearFailures(deviceLabel);
        int epoch = settingInt("STAFF_TOKEN_EPOCH");
        int hours = settingInt("STAFF_SESSION_HOURS");
        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plusSeconds(hours * 3600L);
        String token = sign(Map.of(
                "deviceLabel", deviceLabel,
                "issuedAt", issuedAt.getEpochSecond(),
                "expiresAt", expiresAt.getEpochSecond(),
                "epoch", epoch));
        auditAuth("STAFF_LOGIN", deviceLabel, "epoch=" + epoch);
        return Map.of("staffToken", token, "deviceLabel", deviceLabel, "expiresAt", expiresAt.toString());
    }

    public StaffPrincipal verify(String token) {
        try {
            String[] parts = token == null ? new String[0] : token.split("\\.");
            if (parts.length != 2 || !MessageDigest.isEqual(
                    signature(parts[0]).getBytes(StandardCharsets.US_ASCII),
                    parts[1].getBytes(StandardCharsets.US_ASCII))) {
                throw invalidToken();
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = objectMapper.readValue(Base64.getUrlDecoder().decode(parts[0]), Map.class);
            String label = String.valueOf(payload.get("deviceLabel"));
            long issued = ((Number) payload.get("issuedAt")).longValue();
            long expires = ((Number) payload.get("expiresAt")).longValue();
            int epoch = ((Number) payload.get("epoch")).intValue();
            if (!LABELS.contains(label) || issued > Instant.now().getEpochSecond() + 60 || expires <= issued) throw invalidToken();
            if (expires <= Instant.now().getEpochSecond()) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "STAFF_TOKEN_EXPIRED",
                        "인증이 만료되었습니다. 다시 로그인해 주세요.", false);
            }
            if (epoch != settingInt("STAFF_TOKEN_EPOCH")) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "STAFF_TOKEN_REVOKED",
                        "인증이 해제되었습니다. 다시 로그인해 주세요.", false);
            }
            return new StaffPrincipal(label, Instant.ofEpochSecond(issued), Instant.ofEpochSecond(expires), epoch);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw invalidToken();
        }
    }

    private String sign(Map<String, Object> payload) {
        try {
            String encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(objectMapper.writeValueAsBytes(payload));
            return encoded + "." + signature(encoded);
        } catch (Exception error) {
            throw new IllegalStateException("Could not issue staff token", error);
        }
    }

    private String signature(String payload) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(properties.staffTokenSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
    }

    private int settingInt(String key) {
        Integer value = jdbc.queryForObject("SELECT value::integer FROM settings WHERE key = ?", Integer.class, key);
        if (value == null) throw new IllegalStateException("Missing setting " + key);
        return value;
    }

    private void checkThrottle(String label) {
        Instant blocked = jdbc.query("SELECT max(blocked_until) FROM auth_attempts WHERE attempt_key IN (?, ?)",
                rs -> {
                    if (!rs.next()) return null;
                    java.time.OffsetDateTime value = rs.getObject(1, java.time.OffsetDateTime.class);
                    return value == null ? null : value.toInstant();
                }, "device:" + label, "global");
        if (blocked != null && blocked.isAfter(Instant.now())) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "STAFF_LOGIN_THROTTLED",
                    "시도가 많습니다. 잠시 후 다시 시도해 주세요.", true,
                    Map.of("retryAfter", blocked.toString()));
        }
    }

    private Instant recordFailure(String label) {
        recordFailureKey("device:" + label);
        recordFailureKey("global");
        return jdbc.query("SELECT max(blocked_until) FROM auth_attempts WHERE attempt_key IN (?, ?)",
                rs -> {
                    if (!rs.next()) return null;
                    java.time.OffsetDateTime value = rs.getObject(1, java.time.OffsetDateTime.class);
                    return value == null ? null : value.toInstant();
                }, "device:" + label, "global");
    }

    private void recordFailureKey(String key) {
        jdbc.update("""
                INSERT INTO auth_attempts(attempt_key, failure_count, window_started_at, updated_at)
                VALUES (?, 1, now(), now())
                ON CONFLICT (attempt_key) DO UPDATE SET
                  failure_count = CASE WHEN auth_attempts.window_started_at < now() - interval '10 minutes' THEN 1 ELSE auth_attempts.failure_count + 1 END,
                  window_started_at = CASE WHEN auth_attempts.window_started_at < now() - interval '10 minutes' THEN now() ELSE auth_attempts.window_started_at END,
                  blocked_until = CASE WHEN (CASE WHEN auth_attempts.window_started_at < now() - interval '10 minutes' THEN 1 ELSE auth_attempts.failure_count + 1 END) >= 5 THEN now() + interval '10 minutes' ELSE auth_attempts.blocked_until END,
                  updated_at = now()
                """, key);
    }

    private void clearFailures(String label) {
        jdbc.update("DELETE FROM auth_attempts WHERE attempt_key IN (?, ?)", "device:" + label, "global");
    }

    private void auditAuth(String action, String label, String detail) {
        jdbc.update("""
                INSERT INTO audit_logs(log_id,actor_type,actor_id,action,entity_type,entity_id,detail_json)
                VALUES (?,'STAFF',?,?,'STAFF_AUTH',?,jsonb_build_object('result', ?))
                """, java.util.UUID.randomUUID(), label, action, label, detail);
    }

    private ApiException invalidToken() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "STAFF_TOKEN_INVALID", "인증 정보가 올바르지 않습니다.", false);
    }

    public static String sha256Hex(String value) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }
}

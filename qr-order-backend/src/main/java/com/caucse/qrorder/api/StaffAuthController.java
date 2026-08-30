package com.caucse.qrorder.api;

import com.caucse.qrorder.auth.StaffTokenService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/staff")
@Tag(name = "Staff Auth", description = "공용 운영 passcode 로그인")
public class StaffAuthController {
    private final StaffTokenService tokens;

    public StaffAuthController(StaffTokenService tokens) {
        this.tokens = tokens;
    }

    @PostMapping("/login")
    @Operation(
            summary = "운영진 로그인",
            description = "공용 passcode와 station/device 라벨로 14시간 유효한 staffToken을 발급합니다.",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(examples = @ExampleObject(
                            value = "{\"passcode\":\"shared-passcode\",\"deviceLabel\":\"주방\"}"))))
    ApiEnvelope<Map<String, Object>> login(@RequestBody Map<String, Object> body) {
        return ApiEnvelope.ok(tokens.login(String.valueOf(body.getOrDefault("passcode", "")),
                String.valueOf(body.getOrDefault("deviceLabel", ""))));
    }
}

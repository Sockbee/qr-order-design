package com.caucse.qrorder.api;

import com.caucse.qrorder.auth.StaffAuthFilter;
import com.caucse.qrorder.auth.StaffPrincipal;
import com.caucse.qrorder.config.OpenApiConfig;
import com.caucse.qrorder.domain.AdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin")
@Tag(name = "Admin", description = "메뉴, 설정, 옵션 및 테이블 관리")
@SecurityRequirement(name = OpenApiConfig.STAFF_BEARER)
public class AdminController {
    private final AdminService admin;
    public AdminController(AdminService admin) { this.admin = admin; }

    @PostMapping("/snapshot")
    @Operation(summary = "관리 화면 전체 snapshot 조회")
    ApiEnvelope<Map<String,Object>> snapshot() { return ApiEnvelope.ok(admin.snapshot()); }

    @Operation(summary = "카테고리 추가 또는 수정")
    @PutMapping("/categories/{id}") ApiEnvelope<Void> category(@PathVariable String id,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.saveCategory(id,body,staff));}
    @Operation(summary = "메뉴 추가 또는 수정")
    @PutMapping("/menus/{id}") ApiEnvelope<Void> menu(@PathVariable String id,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.saveMenu(id,body,staff));}
    @Operation(summary = "옵션 그룹 추가 또는 수정")
    @PutMapping("/option-groups/{id}") ApiEnvelope<Void> group(@PathVariable String id,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.saveOptionGroup(id,body,staff));}
    @Operation(summary = "옵션 추가 또는 수정")
    @PutMapping("/options/{id}") ApiEnvelope<Void> option(@PathVariable String id,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.saveOption(id,body,staff));}
    @Operation(summary = "매장 설정 변경")
    @PutMapping("/settings/{key}") ApiEnvelope<Void> setting(@PathVariable String key,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.saveSetting(key,String.valueOf(body.getOrDefault("value","")),staff));}
    @Operation(summary = "테이블 표시명 또는 활성 상태 변경")
    @PutMapping("/tables/{id}") ApiEnvelope<Void> table(@PathVariable String id,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.saveTable(id,body,staff));}
    @Operation(summary = "새 테이블 생성", description = "원본 토큰과 QR URL은 이 응답에서 한 번만 노출됩니다.")
    @PostMapping("/tables/{id}") ApiEnvelope<Map<String,Object>> createTable(@PathVariable String id,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.createTable(id,body,staff));}
    @Operation(summary = "테이블 토큰 회전", description = "새 원본 토큰과 QR URL은 이 응답에서 한 번만 노출됩니다.")
    @PostMapping("/tables/{id}/rotate-token") ApiEnvelope<Map<String,Object>> rotate(@PathVariable String id,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.rotateTable(id,staff));}
    @Operation(summary = "기존 Tables CSV import", description = "거래 데이터가 없는 DB에서만 실행되며 token hash 형식과 중복을 검증합니다.")
    @PostMapping("/tables/import") ApiEnvelope<Map<String,Object>> importTables(@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.importTables(String.valueOf(body.getOrDefault("csv","")),staff));}
}

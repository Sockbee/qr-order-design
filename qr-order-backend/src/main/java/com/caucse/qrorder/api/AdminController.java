package com.caucse.qrorder.api;

import com.caucse.qrorder.auth.StaffAuthFilter;
import com.caucse.qrorder.auth.StaffPrincipal;
import com.caucse.qrorder.config.OpenApiConfig;
import com.caucse.qrorder.domain.AdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
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

    @Operation(summary = "카테고리 추가 또는 수정", requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true, content = @Content(schema = @Schema(implementation = OpenApiRequests.AdminCategory.class))))
    @PutMapping("/categories/{id}") ApiEnvelope<Void> category(@PathVariable String id,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.saveCategory(id,body,staff));}
    @Operation(summary = "메뉴 추가 또는 수정", requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true, content = @Content(schema = @Schema(implementation = OpenApiRequests.AdminMenu.class))))
    @PutMapping("/menus/{id}") ApiEnvelope<Void> menu(@PathVariable String id,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.saveMenu(id,body,staff));}
    @Operation(summary = "옵션 그룹 추가 또는 수정", requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true, content = @Content(schema = @Schema(implementation = OpenApiRequests.AdminOptionGroup.class))))
    @PutMapping("/option-groups/{id}") ApiEnvelope<Void> group(@PathVariable String id,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.saveOptionGroup(id,body,staff));}
    @Operation(summary = "옵션 추가 또는 수정", requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true, content = @Content(schema = @Schema(implementation = OpenApiRequests.AdminOption.class))))
    @PutMapping("/options/{id}") ApiEnvelope<Void> option(@PathVariable String id,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.saveOption(id,body,staff));}
    @Operation(summary = "매장 설정 변경", requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true, content = @Content(schema = @Schema(implementation = OpenApiRequests.AdminSetting.class))))
    @PutMapping("/settings/{key}") ApiEnvelope<Void> setting(@PathVariable String key,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.saveSetting(key,String.valueOf(body.getOrDefault("value","")),staff));}
    @Operation(summary = "테이블 표시명 또는 활성 상태 변경", requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true, content = @Content(schema = @Schema(implementation = OpenApiRequests.AdminTable.class))))
    @PutMapping("/tables/{id}") ApiEnvelope<Void> table(@PathVariable String id,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.saveTable(id,body,staff));}
    @Operation(summary = "새 테이블 생성", description = "원본 토큰과 QR URL은 이 응답에서 한 번만 노출됩니다.",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
                    content = @Content(schema = @Schema(implementation = OpenApiRequests.AdminTableCreate.class))))
    @PostMapping("/tables/{id}") ApiEnvelope<Map<String,Object>> createTable(@PathVariable String id,@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.createTable(id,body,staff));}
    @Operation(summary = "테이블 토큰 회전", description = "새 원본 토큰과 QR URL은 이 응답에서 한 번만 노출됩니다.")
    @PostMapping("/tables/{id}/rotate-token") ApiEnvelope<Map<String,Object>> rotate(@PathVariable String id,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.rotateTable(id,staff));}
    @Operation(summary = "기존 Tables CSV import", description = "거래 데이터가 없는 DB에서만 실행되며 token hash 형식과 중복을 검증합니다.",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
                    content = @Content(schema = @Schema(implementation = OpenApiRequests.TablesCsvImport.class))))
    @PostMapping("/tables/import") ApiEnvelope<Map<String,Object>> importTables(@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.importTables(String.valueOf(body.getOrDefault("csv","")),staff));}

    @Operation(summary = "스태프 명단 CSV import", description = "실명 CSV를 Git에 저장하지 않고 운영 DB에 가져옵니다. 기존 정산 상태는 유지됩니다.",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
                    content = @Content(schema = @Schema(implementation = OpenApiRequests.StaffMembersCsvImport.class))))
    @PostMapping("/staff-members/import") ApiEnvelope<Map<String,Object>> importStaffMembers(@RequestBody Map<String,Object> body,@RequestAttribute(StaffAuthFilter.PRINCIPAL_ATTRIBUTE) StaffPrincipal staff){return ApiEnvelope.ok(admin.importStaffMembers(String.valueOf(body.getOrDefault("csv","")),staff));}
}

package com.caucse.qrorder.api;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

/** Documentation-only request models. Runtime controllers keep the legacy Map contract. */
public final class OpenApiRequests {
    private OpenApiRequests() {}

    @Schema(name = "TableCredentialsRequest", description = "인쇄 QR에 포함된 테이블 인증 정보")
    public record TableCredentials(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(example = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    requiredMode = Schema.RequiredMode.REQUIRED) String tableToken) {}

    @Schema(name = "CustomerOrderItemRequest")
    public record CustomerOrderItem(
            @Schema(example = "chicken-feet", requiredMode = Schema.RequiredMode.REQUIRED) String menuId,
            @Schema(example = "2", minimum = "1", requiredMode = Schema.RequiredMode.REQUIRED) int quantity,
            @Schema(example = "[\"chicken-feet-spicy\"]", requiredMode = Schema.RequiredMode.REQUIRED)
            List<String> selectedOptionIds) {}

    @Schema(name = "CustomerOrderCreateRequest")
    public record CustomerOrderCreate(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(example = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    requiredMode = Schema.RequiredMode.REQUIRED) String tableToken,
            @Schema(format = "uuid", example = "d15dbcd6-c262-4d6f-a962-832f2a8d49e0",
                    requiredMode = Schema.RequiredMode.REQUIRED) String clientRequestId,
            @Schema(example = "덜 맵게 부탁드립니다", maxLength = 200) String note,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<CustomerOrderItem> items) {}

    @Schema(name = "CustomerOrderGetRequest",
            description = "orderId와 displayCode 중 정확히 하나만 전달합니다.")
    public record CustomerOrderGet(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(example = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    requiredMode = Schema.RequiredMode.REQUIRED) String tableToken,
            @Schema(format = "uuid", example = "2bc315f8-01f6-47d7-a7e8-e1882df6544c") String orderId,
            @Schema(example = "A-1042") String displayCode) {}

    @Schema(name = "CustomerCallCreateRequest")
    public record CustomerCallCreate(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(example = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    requiredMode = Schema.RequiredMode.REQUIRED) String tableToken,
            @Schema(allowableValues = {"WATER_UTENSIL", "SIDE_PLATE", "ORDER_INQUIRY", "PAYMENT_REQUEST", "OTHER"},
                    example = "WATER_UTENSIL", requiredMode = Schema.RequiredMode.REQUIRED) String reason,
            @Schema(format = "uuid", example = "f6741f72-b95e-40ca-b71a-7074c0872980",
                    requiredMode = Schema.RequiredMode.REQUIRED) String clientRequestId) {}

    @Schema(name = "CustomerCallCancelRequest")
    public record CustomerCallCancel(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(example = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    requiredMode = Schema.RequiredMode.REQUIRED) String tableToken,
            @Schema(format = "uuid", example = "418d58ce-a530-4e85-b5bb-0fc50ad59d10",
                    requiredMode = Schema.RequiredMode.REQUIRED) String callId) {}

    @Schema(name = "StaffLoginRequest")
    public record StaffLogin(
            @Schema(example = "shared-passcode", requiredMode = Schema.RequiredMode.REQUIRED) String passcode,
            @Schema(example = "주방", requiredMode = Schema.RequiredMode.REQUIRED) String deviceLabel) {}

    @Schema(name = "TableRequest")
    public record Table(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId) {}

    @Schema(name = "TableDiscountRequest")
    public record TableDiscount(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(example = "10", minimum = "0", maximum = "100",
                    requiredMode = Schema.RequiredMode.REQUIRED) int discountRate) {}

    @Schema(name = "TableMoveRequest")
    public record TableMove(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String fromTableId,
            @Schema(example = "T02", requiredMode = Schema.RequiredMode.REQUIRED) String toTableId) {}

    @Schema(name = "TableMergeRequest")
    public record TableMerge(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String primaryTableId,
            @Schema(example = "T02", requiredMode = Schema.RequiredMode.REQUIRED) String secondaryTableId) {}

    @Schema(name = "PaymentConfirmRequest")
    public record PaymentConfirm(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(example = "27000", minimum = "0", requiredMode = Schema.RequiredMode.REQUIRED)
            int expectedFinalAmount) {}

    @Schema(name = "OrderStatusRequest",
            description = "tableId와 orderId 중 정확히 하나와 변경할 status를 전달합니다.")
    public record OrderStatus(
            @Schema(example = "T01") String tableId,
            @Schema(format = "uuid", example = "2bc315f8-01f6-47d7-a7e8-e1882df6544c") String orderId,
            @Schema(allowableValues = {"RECEIVED", "COOKING", "READY", "SERVED"}, example = "COOKING",
                    requiredMode = Schema.RequiredMode.REQUIRED) String status) {}

    @Schema(name = "StaffOrderItemRequest")
    public record StaffOrderItem(
            @Schema(example = "cola", requiredMode = Schema.RequiredMode.REQUIRED) String itemId,
            @Schema(example = "1", minimum = "1", requiredMode = Schema.RequiredMode.REQUIRED) int quantity,
            @Schema(example = "[]") List<String> selectedOptionIds) {}

    @Schema(name = "StaffOrderCreateRequest")
    public record StaffOrderCreate(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(format = "uuid", example = "d15dbcd6-c262-4d6f-a962-832f2a8d49e0") String clientRequestId,
            @Schema(example = "현장 추가") String note,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<StaffOrderItem> items) {}

    @Schema(name = "StaffOrderUpdateRequest",
            description = "operation별 필드: quantity는 itemId/quantity, cancel-item은 itemId, note는 tableId/note/audience가 필요합니다.")
    public record StaffOrderUpdate(
            @Schema(allowableValues = {"quantity", "cancel-item", "note"}, example = "quantity",
                    requiredMode = Schema.RequiredMode.REQUIRED) String operation,
            @Schema(format = "uuid", example = "560d10a2-44d3-43e0-bdcb-053692beef65") String itemId,
            @Schema(example = "2", minimum = "1", maximum = "99") Integer quantity,
            @Schema(example = "T01") String tableId,
            @Schema(example = "주방에 전달할 메모", maxLength = 200) String note,
            @Schema(allowableValues = {"general", "kitchen", "serving"}, example = "kitchen") String audience) {}

    @Schema(name = "MenuAvailabilityRequest")
    public record MenuAvailability(
            @Schema(example = "chicken-feet", requiredMode = Schema.RequiredMode.REQUIRED) String itemId,
            @Schema(example = "true", requiredMode = Schema.RequiredMode.REQUIRED) boolean soldOut) {}

    @Schema(name = "AdminCategoryRequest")
    public record AdminCategory(
            @Schema(example = "메인", requiredMode = Schema.RequiredMode.REQUIRED) String label,
            @Schema(example = "대표 메뉴", requiredMode = Schema.RequiredMode.REQUIRED) String heading,
            @Schema(example = "1") int sortOrder,
            @Schema(example = "true") boolean active) {}

    @Schema(name = "AdminMenuRequest")
    public record AdminMenu(
            @Schema(example = "main", requiredMode = Schema.RequiredMode.REQUIRED) String categoryId,
            @Schema(example = "무뼈 닭발", requiredMode = Schema.RequiredMode.REQUIRED) String name,
            @Schema(example = "매콤한 무뼈 닭발") String description,
            @Schema(example = "10000", minimum = "0", requiredMode = Schema.RequiredMode.REQUIRED) int basePrice,
            @Schema(example = "https://example.com/images/chicken-feet.jpg") String imageUrl,
            @Schema(example = "true") boolean available,
            @Schema(example = "1", minimum = "1") int minQuantity,
            @Schema(example = "10", minimum = "1") int maxQuantity,
            @Schema(example = "국내산") String origin,
            @Schema(example = "1") int sortOrder) {}

    @Schema(name = "AdminOptionGroupRequest")
    public record AdminOptionGroup(
            @Schema(example = "chicken-feet", requiredMode = Schema.RequiredMode.REQUIRED) String menuId,
            @Schema(example = "맵기", requiredMode = Schema.RequiredMode.REQUIRED) String label,
            @Schema(allowableValues = {"SINGLE", "MULTIPLE"}, example = "SINGLE",
                    requiredMode = Schema.RequiredMode.REQUIRED) String selectionType,
            @Schema(example = "true") boolean required,
            @Schema(example = "1", minimum = "0") int minSelections,
            @Schema(example = "1", minimum = "0") int maxSelections,
            @Schema(example = "1") int sortOrder,
            @Schema(example = "true") boolean active) {}

    @Schema(name = "AdminOptionRequest")
    public record AdminOption(
            @Schema(example = "chicken-feet-spicy-group", requiredMode = Schema.RequiredMode.REQUIRED) String optionGroupId,
            @Schema(example = "chicken-feet", requiredMode = Schema.RequiredMode.REQUIRED) String menuId,
            @Schema(example = "보통맛", requiredMode = Schema.RequiredMode.REQUIRED) String name,
            @Schema(example = "0") int priceDelta,
            @Schema(example = "true") boolean available,
            @Schema(example = "true") boolean defaultSelected,
            @Schema(example = "1") int sortOrder) {}

    @Schema(name = "AdminSettingRequest")
    public record AdminSetting(
            @Schema(example = "true", requiredMode = Schema.RequiredMode.REQUIRED) String value) {}

    @Schema(name = "AdminTableRequest")
    public record AdminTable(
            @Schema(example = "테이블 1", requiredMode = Schema.RequiredMode.REQUIRED) String displayName,
            @Schema(example = "true") boolean active,
            @Schema(example = "1") int sortOrder) {}

    @Schema(name = "AdminTableCreateRequest")
    public record AdminTableCreate(
            @Schema(example = "테이블 1", requiredMode = Schema.RequiredMode.REQUIRED) String displayName,
            @Schema(example = "1") int sortOrder) {}

    @Schema(name = "TablesCsvImportRequest")
    public record TablesCsvImport(
            @Schema(example = "table_id,display_name,token_hash,token_version,active,sort_order\\nT01,테이블 1,aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,1,true,1",
                    requiredMode = Schema.RequiredMode.REQUIRED) String csv) {}
}

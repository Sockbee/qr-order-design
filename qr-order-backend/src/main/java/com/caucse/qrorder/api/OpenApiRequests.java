package com.caucse.qrorder.api;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

/** Documentation-only request models. Runtime controllers keep the legacy Map contract. */
public final class OpenApiRequests {
    public record CheckIn(@Schema(requiredMode=Schema.RequiredMode.REQUIRED) String tableId, String expectedSessionId, String departureAt) {}
    public record CoinReceipt(@Schema(requiredMode=Schema.RequiredMode.REQUIRED) String orderId, @Schema(requiredMode=Schema.RequiredMode.REQUIRED) int expectedCoinTotal) {}
    private OpenApiRequests() {}

    @Schema(name = "TableCredentialsRequest", description = "인쇄 QR에 포함된 테이블 인증 정보")
    public record TableCredentials(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(example = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    requiredMode = Schema.RequiredMode.REQUIRED) String tableToken) {}

    @Schema(name = "CustomerOrderItemRequest")
    public record CustomerOrderItem(
            @Schema(example = "chicken-feet", requiredMode = Schema.RequiredMode.REQUIRED) String menuId,
            @Schema(example = "2", minimum = "1", requiredMode = Schema.RequiredMode.REQUIRED) int quantity) {}

    @Schema(name = "CustomerOrderCreateRequest")
    public record CustomerOrderCreate(
            @Schema(allowableValues={"KRW","COIN"},defaultValue="KRW") String paymentMethod,
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(example = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    requiredMode = Schema.RequiredMode.REQUIRED) String tableToken,
            @Schema(format = "uuid", example = "d15dbcd6-c262-4d6f-a962-832f2a8d49e0",
                    requiredMode = Schema.RequiredMode.REQUIRED) String clientRequestId,
            @Schema(example = "20000", minimum = "0", requiredMode = Schema.RequiredMode.REQUIRED)
            int expectedTotalAmount,
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
            @Schema(allowableValues = {"WATER_UTENSIL", "UTENSIL", "SIDE_PLATE", "ORDER_INQUIRY", "PAYMENT_REQUEST", "OTHER"},
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

    @Schema(name = "TableNoteRequest", description = "현재 방문 세션에만 적용되는 일반 메모")
    public record TableNote(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(example = "유아 의자 사용 중", maxLength = 200) String note) {}

    @Schema(name = "TableResetRequest", description = "화면을 연 방문 세션과 현재 세션이 같을 때만 초기화합니다.")
    public record TableReset(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(format = "uuid", example = "2bc315f8-01f6-47d7-a7e8-e1882df6544c",
                    requiredMode = Schema.RequiredMode.REQUIRED) String expectedSessionId) {}

    @Schema(name = "MenuSalesRequest")
    public record MenuSales(
            @Schema(example = "2026-09-14", requiredMode = Schema.RequiredMode.REQUIRED) String startDate,
            @Schema(example = "2026-09-14", requiredMode = Schema.RequiredMode.REQUIRED) String endDate) {}

    @Schema(name = "PaymentConfirmRequest")
    public record PaymentConfirm(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(format = "uuid", example = "2bc315f8-01f6-47d7-a7e8-e1882df6544c",
                    requiredMode = Schema.RequiredMode.REQUIRED) String expectedSessionId,
            @Schema(format = "uuid", example = "d15dbcd6-c262-4d6f-a962-832f2a8d49e0",
                    requiredMode = Schema.RequiredMode.REQUIRED) String clientRequestId,
            @Schema(example = "27000", minimum = "0", requiredMode = Schema.RequiredMode.REQUIRED)
            int expectedFinalAmount,
            @Schema(example = "김민수", requiredMode = Schema.RequiredMode.REQUIRED) String payerName) {}

    @Schema(name = "OrderStatusRequest",
            description = "tableId와 orderId 중 정확히 하나와 변경할 status를 전달합니다.")
    public record OrderStatus(
            @Schema(example = "T01") String tableId,
            @Schema(format = "uuid", example = "2bc315f8-01f6-47d7-a7e8-e1882df6544c") String orderId,
            @Schema(allowableValues = {"RECEIVED", "COOKING", "READY", "SERVED"}, example = "COOKING",
                    requiredMode = Schema.RequiredMode.REQUIRED) String status) {}

    @Schema(name = "OrderItemPreparationRequest")
    public record OrderItemPreparation(
            @Schema(format = "uuid", example = "560d10a2-44d3-43e0-bdcb-053692beef65",
                    requiredMode = Schema.RequiredMode.REQUIRED) String itemId,
            @Schema(example = "true", requiredMode = Schema.RequiredMode.REQUIRED) boolean ready) {}

    @Schema(name = "StaffOrderItemRequest")
    public record StaffOrderItem(
            @Schema(example = "cola", requiredMode = Schema.RequiredMode.REQUIRED) String itemId,
            @Schema(example = "1", minimum = "1", requiredMode = Schema.RequiredMode.REQUIRED) int quantity) {}

    @Schema(name = "StaffOrderCreateRequest")
    public record StaffOrderCreate(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(format = "uuid", example = "d15dbcd6-c262-4d6f-a962-832f2a8d49e0") String clientRequestId,
            @Schema(example = "현장 추가") String note,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<StaffOrderItem> items) {}

    @Schema(name = "StaffServiceOrderItemRequest")
    public record StaffServiceOrderItem(
            @Schema(example = "cola", requiredMode = Schema.RequiredMode.REQUIRED) String menuId,
            @Schema(example = "1", minimum = "1", requiredMode = Schema.RequiredMode.REQUIRED) int quantity) {}

    @Schema(name = "StaffServiceOrderCreateRequest")
    public record StaffServiceOrderCreate(
            @Schema(example = "T01", requiredMode = Schema.RequiredMode.REQUIRED) String tableId,
            @Schema(format = "uuid", example = "d15dbcd6-c262-4d6f-a962-832f2a8d49e0",
                    requiredMode = Schema.RequiredMode.REQUIRED) String clientRequestId,
            @Schema(example = "S-014", requiredMode = Schema.RequiredMode.REQUIRED) String chargedStaffId,
            @Schema(example = "오래 기다리셨습니다. 맛있게 드세요!", maxLength = 100) String serviceMessage,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<StaffServiceOrderItem> items) {}

    @Schema(name = "StaffSettlementListRequest")
    public record StaffSettlementList(
            @Schema(example = "false", defaultValue = "false") boolean includeSettled) {}

    @Schema(name = "StaffSettlementConfirmRequest")
    public record StaffSettlementConfirm(
            @Schema(example = "S-014", requiredMode = Schema.RequiredMode.REQUIRED) String staffId,
            @Schema(example = "18400", minimum = "0", requiredMode = Schema.RequiredMode.REQUIRED)
            int expectedChargeAmount) {}

    @Schema(name = "StaffOrderUpdateRequest",
            description = "operation별 필드: quantity는 itemId/quantity, cancel-item은 itemId가 필요합니다.")
    public record StaffOrderUpdate(
            @Schema(allowableValues = {"quantity", "cancel-item"}, example = "quantity",
                    requiredMode = Schema.RequiredMode.REQUIRED) String operation,
            @Schema(format = "uuid", example = "560d10a2-44d3-43e0-bdcb-053692beef65") String itemId,
            @Schema(example = "2", minimum = "1", maximum = "99") Integer quantity) {}

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
            @Schema(description = "엽전 가격. null이면 이벤트 주문 불가, 생략하면 기존 값 유지", example = "9", minimum = "1") Integer coinPrice,
            @Schema(example = "true") boolean available,
            @Schema(example = "1", minimum = "1") int minQuantity,
            @Schema(example = "10", minimum = "1") int maxQuantity,
            @Schema(example = "국내산") String origin,
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

    @Schema(name = "StaffMembersCsvImportRequest")
    public record StaffMembersCsvImport(
            @Schema(example = "staff_id,name,affiliation,active,sort_order\\nS-001,예시 회장,회장단,true,10",
                    requiredMode = Schema.RequiredMode.REQUIRED) String csv) {}
}

package com.caucse.qrorder.domain;

import com.caucse.qrorder.api.ApiEnvelope;
import com.caucse.qrorder.api.ApiException;
import com.caucse.qrorder.auth.StaffPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class StaffServiceService {
    private final JdbcTemplate jdbc;
    private final CustomerOrderService customerOrders;

    public StaffServiceService(JdbcTemplate jdbc, CustomerOrderService customerOrders) {
        this.jdbc = jdbc;
        this.customerOrders = customerOrders;
    }

    public Map<String, Object> listMembers() {
        List<Map<String, Object>> members = jdbc.query("""
                SELECT staff_id,name,affiliation,active
                FROM staff_members ORDER BY sort_order,staff_id
                """, (rs, index) -> ApiEnvelope.map(
                "staffId", rs.getString("staff_id"),
                "name", rs.getString("name"),
                "affiliation", rs.getString("affiliation"),
                "active", rs.getBoolean("active")));
        return ApiEnvelope.map("members", members);
    }

    @Transactional
    public Map<String, Object> createServiceOrder(Map<String, Object> body, StaffPrincipal staff) {
        String chargedStaffId = required(body, "chargedStaffId");
        Member member = jdbc.query("""
                SELECT staff_id,name,active FROM staff_members WHERE staff_id=? FOR UPDATE
                """, rs -> rs.next() ? new Member(rs.getString(1), rs.getString(2), rs.getBoolean(3)) : null,
                chargedStaffId);
        if (member == null) {
            throw ApiException.notFound("STAFF_MEMBER_NOT_FOUND", "학생회 명단에서 찾을 수 없습니다.");
        }
        if (!member.active()) {
            throw new ApiException(HttpStatus.CONFLICT, "STAFF_MEMBER_INACTIVE",
                    "현재 선택할 수 없는 인원입니다.", false);
        }
        int discountRate = settingInt("STAFF_DISCOUNT_RATE");
        if (discountRate < 0 || discountRate > 100) {
            throw new IllegalStateException("STAFF_DISCOUNT_RATE must be between 0 and 100");
        }
        return customerOrders.createService(body, member.id(), member.name(), discountRate, staff.deviceLabel());
    }

    public Map<String, Object> listSettlements(boolean includeSettled) {
        String settledFilter = includeSettled ? "" : " WHERE settlement_status='UNSETTLED'";
        List<MemberSettlement> rows = jdbc.query("""
                SELECT staff_id,name,affiliation,settlement_status,settled_amount,settled_at
                FROM staff_members
                """ + settledFilter + " ORDER BY sort_order,staff_id", (rs, index) -> new MemberSettlement(
                rs.getString("staff_id"), rs.getString("name"), rs.getString("affiliation"),
                rs.getString("settlement_status"), (Integer) rs.getObject("settled_amount"),
                rs.getObject("settled_at", OffsetDateTime.class)));

        List<Map<String, Object>> members = rows.stream().map(this::settlementResponse).toList();
        int totalChargeAmount = members.stream()
                .filter(member -> "UNSETTLED".equals(member.get("settlementStatus")))
                .mapToInt(member -> (Integer) member.get("chargeAmount"))
                .sum();
        long unsettledStaffCount = members.stream()
                .filter(member -> "UNSETTLED".equals(member.get("settlementStatus")))
                .count();
        return ApiEnvelope.map(
                "staffDiscountRate", settingInt("STAFF_DISCOUNT_RATE"),
                "members", members,
                "totalChargeAmount", totalChargeAmount,
                "unsettledStaffCount", unsettledStaffCount);
    }

    @Transactional
    public Map<String, Object> confirmSettlement(String staffId, int expectedChargeAmount,
                                                  StaffPrincipal staff) {
        MemberSettlement member = jdbc.query("""
                SELECT staff_id,name,affiliation,settlement_status,settled_amount,settled_at
                FROM staff_members WHERE staff_id=? FOR UPDATE
                """, rs -> rs.next() ? new MemberSettlement(
                rs.getString("staff_id"), rs.getString("name"), rs.getString("affiliation"),
                rs.getString("settlement_status"), (Integer) rs.getObject("settled_amount"),
                rs.getObject("settled_at", OffsetDateTime.class)) : null, staffId);
        if (member == null) {
            throw ApiException.notFound("STAFF_MEMBER_NOT_FOUND", "학생회 명단에서 찾을 수 없습니다.");
        }
        if ("SETTLED".equals(member.status())) {
            throw ApiException.conflict("SETTLEMENT_ALREADY_SETTLED", "이미 정산 완료된 인원입니다.");
        }
        int actualChargeAmount = chargeAmount(staffId);
        if (expectedChargeAmount != actualChargeAmount) {
            throw new ApiException(HttpStatus.CONFLICT, "SETTLEMENT_AMOUNT_CHANGED",
                    "정산 금액이 변경되었습니다. 다시 확인해 주세요.", true,
                    ApiEnvelope.map("expectedChargeAmount", expectedChargeAmount,
                            "actualChargeAmount", actualChargeAmount));
        }

        OffsetDateTime settledAt = OffsetDateTime.now();
        jdbc.update("""
                UPDATE staff_members
                SET settlement_status='SETTLED',settled_amount=?,settled_at=?,updated_at=now()
                WHERE staff_id=?
                """, actualChargeAmount, settledAt, staffId);
        jdbc.update("""
                INSERT INTO audit_logs(log_id,actor_type,actor_id,action,entity_type,entity_id,
                  from_value,to_value,detail_json)
                VALUES(?,'STAFF',?,'STAFF_SETTLEMENT_CONFIRMED','STAFF_MEMBER',?,
                  'UNSETTLED','SETTLED',CAST(? AS jsonb))
                """, UUID.randomUUID(), staff.deviceLabel(), staffId,
                "{\"settledAmount\":" + actualChargeAmount + "}");
        return ApiEnvelope.map(
                "staffId", staffId,
                "name", member.name(),
                "settlementStatus", "SETTLED",
                "settledAmount", actualChargeAmount,
                "settledAt", settledAt.toInstant().toString());
    }

    private Map<String, Object> settlementResponse(MemberSettlement member) {
        List<Map<String, Object>> orders = jdbc.query("""
                SELECT o.order_id,o.display_code,o.table_id,o.service_message,o.staff_charge_amount,
                       o.created_at,COALESCE(sum(oi.line_total) FILTER (WHERE oi.status='ACTIVE'),0)::integer gross_amount
                FROM orders o
                LEFT JOIN order_items oi ON oi.order_id=o.order_id
                WHERE o.order_kind='SERVICE' AND o.status<>'CANCELLED' AND o.charged_staff_id=?
                GROUP BY o.order_id,o.display_code,o.table_id,o.service_message,o.staff_charge_amount,o.created_at
                ORDER BY o.created_at
                """, (rs, index) -> ApiEnvelope.map(
                "orderId", rs.getString("order_id"),
                "displayCode", rs.getString("display_code"),
                "tableId", rs.getString("table_id"),
                "serviceMessage", rs.getString("service_message"),
                "grossAmount", rs.getInt("gross_amount"),
                "chargeAmount", rs.getInt("staff_charge_amount"),
                "createdAt", rs.getObject("created_at", OffsetDateTime.class).toInstant().toString()),
                member.id());
        int grossAmount = orders.stream().mapToInt(order -> (Integer) order.get("grossAmount")).sum();
        int chargeAmount = orders.stream().mapToInt(order -> (Integer) order.get("chargeAmount")).sum();
        return ApiEnvelope.map(
                "staffId", member.id(),
                "name", member.name(),
                "affiliation", member.affiliation(),
                "serviceOrderCount", orders.size(),
                "grossAmount", grossAmount,
                "chargeAmount", chargeAmount,
                "settlementStatus", member.status(),
                "settledAmount", member.settledAmount(),
                "settledAt", member.settledAt() == null ? null : member.settledAt().toInstant().toString(),
                "orders", orders);
    }

    private int chargeAmount(String staffId) {
        Integer amount = jdbc.queryForObject("""
                SELECT COALESCE(sum(staff_charge_amount),0)::integer
                FROM orders
                WHERE order_kind='SERVICE' AND status<>'CANCELLED' AND charged_staff_id=?
                """, Integer.class, staffId);
        return amount == null ? 0 : amount;
    }

    private int settingInt(String key) {
        Integer result = jdbc.queryForObject("SELECT value::integer FROM settings WHERE key=?", Integer.class, key);
        return result == null ? 0 : result;
    }

    private static String required(Map<String, Object> body, String field) {
        Object value = body.get(field);
        if (value == null || String.valueOf(value).isBlank()) {
            throw ApiException.invalid(field + " 값을 확인해 주세요.");
        }
        return String.valueOf(value);
    }

    private record Member(String id, String name, boolean active) {}
    private record MemberSettlement(String id, String name, String affiliation, String status,
                                    Integer settledAmount, OffsetDateTime settledAt) {}
}

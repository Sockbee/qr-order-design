package com.caucse.qrorder.domain;

import com.caucse.qrorder.api.ApiEnvelope;
import com.caucse.qrorder.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Map;

@Service
public class MenuSalesService {
    private final JdbcTemplate jdbc;
    public MenuSalesService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public Map<String, Object> report(String startDate, String endDate) {
        LocalDate start;
        LocalDate end;
        try {
            start = LocalDate.parse(startDate);
            end = LocalDate.parse(endDate);
        } catch (RuntimeException error) {
            throw ApiException.invalid("조회 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.");
        }
        if (end.isBefore(start) || ChronoUnit.DAYS.between(start, end) > 365) {
            throw ApiException.invalid("조회 기간은 시작일 이후 최대 366일로 선택해 주세요.");
        }
        String timeZone = jdbc.queryForObject("SELECT value FROM settings WHERE key='TIME_ZONE'", String.class);
        ZoneId zone = ZoneId.of(timeZone);
        // Allocate won rounding across the whole bill before filtering dates. This
        // keeps item totals equal to payment, including merged multi-day visits.
        var rows = jdbc.query("""
                WITH lines AS (
                  SELECT i.order_item_id,i.line_no,i.menu_id,m.name,m.category_id,c.label AS category_label,
                    o.order_id,o.created_at,i.quantity,i.line_total::bigint AS gross,
                    CASE WHEN o.order_kind='SERVICE' THEN 'SERVICE'
                         WHEN o.payment_status='PAID' AND o.paid_discount_rate>0 THEN 'MEMBER'
                         ELSE 'GENERAL' END AS sale_type,
                    CASE WHEN o.order_kind='SERVICE' THEN o.staff_discount_rate
                         WHEN o.payment_status='PAID' THEN COALESCE(o.paid_discount_rate,0)
                         ELSE 0 END AS rate,
                    CASE WHEN o.order_kind='SERVICE' THEN o.order_id
                         ELSE COALESCE(s.merged_into_session_id,s.session_id) END AS charge_group,
                    o.order_kind,o.payment_status
                  FROM order_items i JOIN orders o ON o.order_id=i.order_id
                  JOIN table_sessions s ON s.session_id=o.session_id
                  JOIN menus m ON m.menu_id=i.menu_id JOIN categories c ON c.category_id=m.category_id
                  WHERE i.status='ACTIVE' AND o.status<>'CANCELLED' AND o.payment_status<>'REFUNDED'
                ), allocated AS (
                  SELECT *, SUM(gross) OVER (
                    PARTITION BY charge_group,order_kind ORDER BY created_at,order_id,line_no,order_item_id
                    ROWS UNBOUNDED PRECEDING) AS running_gross
                  FROM lines
                )
                SELECT menu_id,name,category_id,category_label,sale_type,rate,
                  SUM(quantity)::bigint AS quantity,
                  SUM(gross-(floor(running_gross*rate/100)-floor((running_gross-gross)*rate/100)))::bigint AS amount,
                  SUM(CASE WHEN sale_type='GENERAL' AND payment_status='UNPAID' THEN quantity ELSE 0 END)::bigint AS unpaid_quantity
                FROM allocated WHERE created_at>=? AND created_at<?
                GROUP BY menu_id,name,category_id,category_label,sale_type,rate
                ORDER BY menu_id,sale_type,rate
                """, (rs, index) -> ApiEnvelope.map(
                "menuId", rs.getString("menu_id"), "name", rs.getString("name"),
                "categoryId", rs.getString("category_id"), "categoryLabel", rs.getString("category_label"),
                "type", rs.getString("sale_type"), "discountRate", rs.getInt("rate"),
                "quantity", rs.getLong("quantity"), "amount", rs.getLong("amount"),
                "unpaidQuantity", rs.getLong("unpaid_quantity")),
                start.atStartOfDay(zone).toOffsetDateTime(), end.plusDays(1).atStartOfDay(zone).toOffsetDateTime());
        return ApiEnvelope.map("startDate", startDate, "endDate", endDate, "timeZone", timeZone, "rows", rows);
    }
}

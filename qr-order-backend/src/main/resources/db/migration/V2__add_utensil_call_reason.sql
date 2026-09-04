-- 물/수저를 별도 호출 사유로 분리 (기존 WATER_UTENSIL은 "물"만 의미하도록 유지).
ALTER TABLE calls DROP CONSTRAINT calls_reason_check;
ALTER TABLE calls ADD CONSTRAINT calls_reason_check
    CHECK (reason IN ('WATER_UTENSIL', 'UTENSIL', 'SIDE_PLATE', 'ORDER_INQUIRY', 'PAYMENT_REQUEST', 'OTHER'));

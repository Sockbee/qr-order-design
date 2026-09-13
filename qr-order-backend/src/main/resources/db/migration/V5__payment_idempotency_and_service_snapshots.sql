ALTER TABLE table_sessions
    ADD COLUMN payment_request_id uuid;

CREATE UNIQUE INDEX table_sessions_payment_request_idx
    ON table_sessions(payment_request_id)
    WHERE payment_request_id IS NOT NULL;

ALTER TABLE orders
    ADD COLUMN staff_discount_rate integer
        CHECK (staff_discount_rate BETWEEN 0 AND 100);

UPDATE orders
SET staff_discount_rate = (
    SELECT value::integer FROM settings WHERE key = 'STAFF_DISCOUNT_RATE'
)
WHERE order_kind = 'SERVICE';

ALTER TABLE orders
    DROP CONSTRAINT orders_service_shape_check,
    ADD CONSTRAINT orders_service_shape_check CHECK (
        (order_kind = 'GUEST'
            AND service_message IS NULL
            AND charged_staff_id IS NULL
            AND staff_charge_amount IS NULL
            AND staff_discount_rate IS NULL)
        OR
        (order_kind = 'SERVICE'
            AND charged_staff_id IS NOT NULL
            AND staff_charge_amount IS NOT NULL
            AND staff_discount_rate IS NOT NULL
            AND total_amount = 0
            AND payment_status = 'WAIVED')
    );

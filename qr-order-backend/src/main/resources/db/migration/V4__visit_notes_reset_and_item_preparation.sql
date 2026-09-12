ALTER TABLE table_sessions
    ADD COLUMN table_note varchar(200),
    ADD COLUMN close_reason varchar(32),
    ADD CONSTRAINT table_sessions_close_reason_check
        CHECK (close_reason IS NULL OR close_reason IN ('PAYMENT', 'STAFF_RESET'));

ALTER TABLE order_items
    ADD COLUMN preparation_status varchar(16) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN prepared_at timestamptz,
    ADD COLUMN served_at timestamptz,
    ADD CONSTRAINT order_items_preparation_status_check
        CHECK (preparation_status IN ('PENDING', 'READY', 'SERVED'));

UPDATE order_items i
SET preparation_status = CASE
        WHEN o.status = 'COMPLETED' THEN 'SERVED'
        WHEN o.status = 'SERVING' THEN 'READY'
        ELSE 'PENDING'
    END,
    prepared_at = CASE WHEN o.status IN ('SERVING', 'COMPLETED') THEN o.status_updated_at END,
    served_at = CASE WHEN o.status = 'COMPLETED' THEN o.status_updated_at END
FROM orders o
WHERE o.order_id = i.order_id;

CREATE INDEX idx_order_items_preparation_queue
    ON order_items(preparation_status, order_id)
    WHERE status = 'ACTIVE';


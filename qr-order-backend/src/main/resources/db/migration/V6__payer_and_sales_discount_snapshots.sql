ALTER TABLE table_sessions
    ADD COLUMN payer_name varchar(100) CHECK (payer_name IS NULL OR btrim(payer_name) <> ''),
    ADD COLUMN payment_confirmed_by varchar(200);
ALTER TABLE orders ADD COLUMN paid_discount_rate integer CHECK (paid_discount_rate BETWEEN 0 AND 100);
UPDATE orders o SET paid_discount_rate = COALESCE(primary_session.discount_rate, s.discount_rate)
FROM table_sessions s LEFT JOIN table_sessions primary_session ON primary_session.session_id=s.merged_into_session_id
WHERE o.session_id=s.session_id AND o.order_kind='GUEST' AND o.payment_status='PAID';
CREATE INDEX orders_sales_created_idx ON orders(created_at) WHERE status<>'CANCELLED';

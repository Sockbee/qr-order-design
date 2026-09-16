-- Options are retired, including historical option snapshots. Order amounts remain unchanged.
DROP TABLE order_item_options;
DROP TABLE options;
DROP TABLE option_groups;
ALTER TABLE menus ADD COLUMN preparation_station varchar(16) NOT NULL DEFAULT 'KITCHEN' CHECK(preparation_station IN ('KITCHEN','SERVING')),
 ADD COLUMN coin_price integer CHECK(coin_price > 0);
UPDATE menus SET preparation_station='SERVING' WHERE category_id IN ('alcohol','beverage');
UPDATE menus SET coin_price=CASE menu_id WHEN 'soju' THEN 9 WHEN 'beer' THEN 9 WHEN 'banana-milk-highball' THEN 10 WHEN 'mix-coffee-highball' THEN 10 WHEN 'frozen-sikhye' THEN 8 WHEN 'eolbaksa' THEN 8 END;
ALTER TABLE orders ADD COLUMN payment_method varchar(8) NOT NULL DEFAULT 'KRW' CHECK(payment_method IN ('KRW','COIN')),
 ADD COLUMN coin_total integer NOT NULL DEFAULT 0 CHECK(coin_total>=0),
 ADD COLUMN coin_received_at timestamptz, ADD COLUMN coin_received_by varchar(200),
 ADD CONSTRAINT coin_order_shape CHECK ((payment_method='KRW' AND coin_total=0 AND coin_received_at IS NULL AND coin_received_by IS NULL) OR (payment_method='COIN' AND order_kind='GUEST' AND total_amount=0 AND payment_status='WAIVED'));
ALTER TABLE order_items ADD COLUMN preparation_station varchar(16) NOT NULL DEFAULT 'KITCHEN' CHECK(preparation_station IN ('KITCHEN','SERVING')),
 ADD COLUMN coin_unit_price integer NOT NULL DEFAULT 0 CHECK(coin_unit_price>=0);
UPDATE order_items i SET preparation_station=m.preparation_station FROM menus m WHERE m.menu_id=i.menu_id;
UPDATE order_items SET preparation_status='READY',prepared_at=COALESCE(prepared_at,created_at) WHERE preparation_station='SERVING' AND preparation_status='PENDING';
ALTER TABLE table_sessions DROP CONSTRAINT table_sessions_status_check,
 ADD CONSTRAINT table_sessions_status_check CHECK(status IN ('PREPARED','OPEN','CLOSED')),
 ALTER COLUMN opened_at DROP NOT NULL, ADD COLUMN departure_at timestamptz;
DROP INDEX one_open_session_per_table;
DROP INDEX one_open_session_per_origin;
CREATE UNIQUE INDEX one_open_session_per_table ON table_sessions(table_id) WHERE status IN ('PREPARED','OPEN');
CREATE UNIQUE INDEX one_open_session_per_origin ON table_sessions(origin_table_id) WHERE status IN ('PREPARED','OPEN');

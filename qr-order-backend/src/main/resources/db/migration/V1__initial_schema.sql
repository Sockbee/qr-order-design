CREATE TABLE settings (
    key varchar(100) PRIMARY KEY,
    value text NOT NULL,
    type varchar(16) NOT NULL CHECK (type IN ('STRING', 'INTEGER', 'BOOLEAN')),
    description text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tables (
    table_id varchar(20) PRIMARY KEY CHECK (table_id ~ '^T[0-9]{2,}$'),
    display_name varchar(100) NOT NULL,
    token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    token_version integer NOT NULL DEFAULT 1 CHECK (token_version > 0),
    active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
    category_id varchar(100) PRIMARY KEY,
    label varchar(100) NOT NULL,
    heading varchar(200) NOT NULL,
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    active boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE menus (
    menu_id varchar(100) PRIMARY KEY,
    category_id varchar(100) NOT NULL REFERENCES categories(category_id),
    name varchar(200) NOT NULL,
    description text NOT NULL DEFAULT '',
    base_price integer NOT NULL CHECK (base_price >= 0),
    image_url text,
    available boolean NOT NULL DEFAULT true,
    min_quantity integer NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
    max_quantity integer NOT NULL DEFAULT 10 CHECK (max_quantity >= min_quantity),
    allergens text[] NOT NULL DEFAULT '{}',
    origin text,
    badge_tags text[] NOT NULL DEFAULT '{}',
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX menus_category_sort_idx ON menus(category_id, sort_order);

CREATE TABLE option_groups (
    option_group_id varchar(100) PRIMARY KEY,
    menu_id varchar(100) NOT NULL REFERENCES menus(menu_id) ON DELETE CASCADE,
    label varchar(200) NOT NULL,
    selection_type varchar(16) NOT NULL CHECK (selection_type IN ('SINGLE', 'MULTIPLE')),
    required boolean NOT NULL DEFAULT false,
    min_select integer NOT NULL DEFAULT 0 CHECK (min_select >= 0),
    max_select integer NOT NULL DEFAULT 1 CHECK (max_select >= min_select),
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    active boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX option_groups_menu_sort_idx ON option_groups(menu_id, sort_order);

CREATE TABLE options (
    option_id varchar(100) PRIMARY KEY,
    option_group_id varchar(100) NOT NULL REFERENCES option_groups(option_group_id) ON DELETE CASCADE,
    menu_id varchar(100) NOT NULL REFERENCES menus(menu_id) ON DELETE CASCADE,
    name varchar(200) NOT NULL,
    price_delta integer NOT NULL DEFAULT 0,
    available boolean NOT NULL DEFAULT true,
    default_selected boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX options_group_sort_idx ON options(option_group_id, sort_order);

CREATE TABLE table_sessions (
    session_id uuid PRIMARY KEY,
    table_id varchar(20) NOT NULL REFERENCES tables(table_id),
    origin_table_id varchar(20) NOT NULL REFERENCES tables(table_id),
    status varchar(16) NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
    discount_rate integer NOT NULL DEFAULT 0 CHECK (discount_rate BETWEEN 0 AND 100),
    merged_into_session_id uuid REFERENCES table_sessions(session_id),
    payment_status varchar(16) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PAID', 'WAIVED')),
    subtotal_amount integer CHECK (subtotal_amount >= 0),
    discount_amount integer CHECK (discount_amount >= 0),
    final_amount integer CHECK (final_amount >= 0),
    opened_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz,
    paid_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_open_session_per_table ON table_sessions(table_id) WHERE status = 'OPEN';
CREATE UNIQUE INDEX one_open_session_per_origin ON table_sessions(origin_table_id) WHERE status = 'OPEN';
CREATE INDEX table_sessions_merge_idx ON table_sessions(merged_into_session_id);

CREATE TABLE orders (
    order_id uuid PRIMARY KEY,
    display_number bigint NOT NULL UNIQUE CHECK (display_number > 0),
    display_code varchar(40) NOT NULL UNIQUE,
    client_request_id uuid NOT NULL,
    idempotency_key varchar(160) NOT NULL UNIQUE,
    request_fingerprint char(64) NOT NULL,
    table_id varchar(20) NOT NULL REFERENCES tables(table_id),
    session_id uuid NOT NULL REFERENCES table_sessions(session_id),
    status varchar(16) NOT NULL CHECK (status IN ('RECEIVED', 'CONFIRMED', 'PREPARING', 'SERVING', 'COMPLETED', 'CANCELLED')),
    public_status varchar(16) NOT NULL CHECK (public_status IN ('accepted', 'preparing', 'served', 'closed', 'cancelled')),
    payment_status varchar(16) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PAID', 'WAIVED', 'REFUNDED')),
    total_amount integer NOT NULL CHECK (total_amount >= 0),
    note varchar(200),
    note_audience varchar(16) NOT NULL DEFAULT 'GENERAL' CHECK (note_audience IN ('GENERAL', 'KITCHEN', 'SERVING')),
    status_updated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz,
    cancelled_at timestamptz,
    cancel_reason text
);
CREATE UNIQUE INDEX orders_client_request_idx ON orders(table_id, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX orders_session_created_idx ON orders(session_id, created_at DESC);
CREATE INDEX orders_table_created_idx ON orders(table_id, created_at DESC);

CREATE TABLE order_items (
    order_item_id uuid PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    line_no integer NOT NULL CHECK (line_no > 0),
    menu_id varchar(100) NOT NULL REFERENCES menus(menu_id),
    menu_name_snapshot varchar(200) NOT NULL,
    base_price_snapshot integer NOT NULL,
    unit_price_snapshot integer NOT NULL,
    quantity integer NOT NULL CHECK (quantity > 0),
    line_total integer NOT NULL CHECK (line_total >= 0),
    status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(order_id, line_no)
);
CREATE INDEX order_items_order_idx ON order_items(order_id, line_no);

CREATE TABLE order_item_options (
    order_item_option_id uuid PRIMARY KEY,
    order_item_id uuid NOT NULL REFERENCES order_items(order_item_id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    option_group_id varchar(100) NOT NULL,
    option_group_name_snapshot varchar(200) NOT NULL,
    option_id varchar(100) NOT NULL,
    option_name_snapshot varchar(200) NOT NULL,
    price_delta_snapshot integer NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(order_item_id, option_id)
);

CREATE TABLE calls (
    call_id uuid PRIMARY KEY,
    table_id varchar(20) NOT NULL REFERENCES tables(table_id),
    reason varchar(32) NOT NULL CHECK (reason IN ('WATER_UTENSIL', 'SIDE_PLATE', 'ORDER_INQUIRY', 'PAYMENT_REQUEST', 'OTHER')),
    status varchar(16) NOT NULL CHECK (status IN ('PENDING', 'ACKNOWLEDGED', 'CANCELLED')),
    client_request_id uuid NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    acknowledged_at timestamptz,
    acknowledged_by varchar(100),
    cancelled_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calls_pending_table_idx ON calls(table_id, created_at) WHERE status = 'PENDING';

CREATE TABLE audit_logs (
    log_id uuid PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor_type varchar(16) NOT NULL CHECK (actor_type IN ('SYSTEM', 'STAFF', 'CLIENT')),
    actor_id varchar(200),
    action varchar(100) NOT NULL,
    entity_type varchar(100) NOT NULL,
    entity_id varchar(200) NOT NULL,
    from_value text,
    to_value text,
    request_id uuid,
    detail_json jsonb
);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id, occurred_at DESC);

CREATE TABLE domain_events (
    event_id bigserial PRIMARY KEY,
    event_type varchar(100) NOT NULL,
    entity_id varchar(200) NOT NULL,
    table_id varchar(20),
    revision bigint NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}',
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX domain_events_table_idx ON domain_events(table_id, event_id);
CREATE INDEX domain_events_occurred_idx ON domain_events(occurred_at);

CREATE TABLE auth_attempts (
    attempt_key varchar(200) PRIMARY KEY,
    failure_count integer NOT NULL DEFAULT 0,
    window_started_at timestamptz NOT NULL,
    blocked_until timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings(key, value, type, description) VALUES
 ('EVENT_ID', '2026-fall-pub', 'STRING', '행사 namespace'),
 ('STORE_NAME', '행복식당 본점', 'STRING', '매장명'),
 ('FRONTEND_BASE_URL', 'https://caucse.shop', 'STRING', 'QR frontend origin'),
 ('EVENT_OPEN', 'TRUE', 'BOOLEAN', '영업 상태'),
 ('NOTICE', '주문은 이 테이블로 전달됩니다. 결제는 식사 후 카운터에서 진행해 주세요.', 'STRING', '테이블 안내'),
 ('ORDER_PREFIX', 'A-', 'STRING', '주문번호 접두사'),
 ('NEXT_DISPLAY_NUMBER', '1042', 'INTEGER', '다음 주문번호'),
 ('MAX_ORDER_LINES', '20', 'INTEGER', '주문당 최대 행'),
 ('DEFAULT_MAX_QUANTITY', '10', 'INTEGER', '기본 최대 수량'),
 ('TIME_ZONE', 'Asia/Seoul', 'STRING', '표시 시간대'),
 ('STATUS_POLL_SECONDS', '15', 'INTEGER', 'fallback polling 주기'),
 ('CALL_MIN_INTERVAL_SECONDS', '60', 'INTEGER', '호출 최소 간격'),
 ('STAFF_TOKEN_EPOCH', '1', 'INTEGER', '운영 토큰 epoch'),
 ('STAFF_SESSION_HOURS', '14', 'INTEGER', '운영 토큰 시간'),
 ('TABLE_DISCOUNT_RATE', '20', 'INTEGER', '테이블 할인율');

INSERT INTO categories(category_id, label, heading, sort_order) VALUES
 ('main', '메인', '메인 메뉴', 10),
 ('side', '사이드', '사이드 메뉴', 20),
 ('alcohol', '주류', '주류', 30),
 ('beverage', '음료', '음료', 40);

INSERT INTO menus(menu_id, category_id, name, description, base_price, sort_order) VALUES
 ('chicken-feet', 'main', '닭발', '닭발', 10000, 10),
 ('tteokbokki-egg-fried-set', 'main', '국물 떡볶이 + 계란 + 튀김 SET', '국물 떡볶이 + 계란 + 튀김 SET', 10000, 20),
 ('jjapagetti-egg-cheese', 'main', '짜계치 (짜파게티 + 계란 + 치즈)', '짜계치 (짜파게티 + 계란 + 치즈)', 5000, 30),
 ('spicy-pork', 'main', '제육볶음', '제육볶음', 9000, 40),
 ('perilla-egg-fry-sikhye-set', 'main', '꼬소들기름계란후라이 + 식혜 SET', '꼬소들기름계란후라이 + 식혜 SET', 8000, 50),
 ('seaweed-soup-rice', 'side', '해장미역국밥', '해장미역국밥', 7000, 10),
 ('tuna-mayo-rice-ball', 'side', '참치마요주먹밥', '참치마요주먹밥', 6000, 20),
 ('cheese-egg-custard', 'side', '폭탄치즈대왕 계란찜', '폭탄치즈대왕 계란찜', 9000, 30),
 ('dried-snack-platter', 'side', '마른 안주 (뻥튀기 / 쥐포 / 오징어)', '마른 안주 (뻥튀기 / 쥐포 / 오징어)', 7000, 40),
 ('red-bean-bingsu', 'side', '옛날팥빙수', '옛날팥빙수', 4500, 50),
 ('soju', 'alcohol', '소주', '소주', 4500, 10),
 ('beer', 'alcohol', '맥주', '맥주', 4500, 20),
 ('banana-milk-highball', 'alcohol', '바나나 우유 하이볼', '바나나 우유 하이볼', 5000, 30),
 ('mix-coffee-highball', 'alcohol', '믹스 커피 하이볼', '믹스 커피 하이볼', 5000, 40),
 ('classic-highball', 'alcohol', '기본 하이볼', '기본 하이볼', 5000, 50),
 ('frozen-sikhye', 'beverage', '살얼음 식혜', '살얼음 식혜', 3000, 10),
 ('eolbaksa', 'beverage', '얼박사', '얼박사', 3000, 20),
 ('cola', 'beverage', '콜라', '콜라', 1500, 30),
 ('cider', 'beverage', '사이다', '사이다', 1500, 40);

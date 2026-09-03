CREATE TABLE staff_members (
    staff_id varchar(40) PRIMARY KEY,
    name varchar(100) NOT NULL CHECK (btrim(name) <> ''),
    affiliation varchar(100),
    active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    settlement_status varchar(16) NOT NULL DEFAULT 'UNSETTLED'
        CHECK (settlement_status IN ('UNSETTLED', 'SETTLED')),
    settled_amount integer CHECK (settled_amount >= 0),
    settled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (settlement_status = 'UNSETTLED' AND settled_amount IS NULL AND settled_at IS NULL)
        OR
        (settlement_status = 'SETTLED' AND settled_amount IS NOT NULL AND settled_at IS NOT NULL)
    )
);
CREATE INDEX staff_members_active_sort_idx ON staff_members(active, sort_order, staff_id);
CREATE INDEX staff_members_settlement_idx ON staff_members(settlement_status, sort_order, staff_id);

ALTER TABLE orders
    ADD COLUMN order_kind varchar(16) NOT NULL DEFAULT 'GUEST'
        CHECK (order_kind IN ('GUEST', 'SERVICE')),
    ADD COLUMN service_message varchar(100),
    ADD COLUMN charged_staff_id varchar(40) REFERENCES staff_members(staff_id),
    ADD COLUMN staff_charge_amount integer CHECK (staff_charge_amount >= 0),
    ADD CONSTRAINT orders_service_shape_check CHECK (
        (order_kind = 'GUEST'
            AND service_message IS NULL
            AND charged_staff_id IS NULL
            AND staff_charge_amount IS NULL)
        OR
        (order_kind = 'SERVICE'
            AND charged_staff_id IS NOT NULL
            AND staff_charge_amount IS NOT NULL
            AND total_amount = 0
            AND payment_status = 'WAIVED')
    );

CREATE INDEX orders_service_staff_created_idx
    ON orders(charged_staff_id, created_at)
    WHERE order_kind = 'SERVICE';

INSERT INTO settings(key, value, type, description)
VALUES ('STAFF_DISCOUNT_RATE', '20', 'INTEGER', '서비스 지급 스태프 할인율');

-- Fulfilment units never change the original financial order lines.
CREATE TABLE order_preparation_units (
    unit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id uuid NOT NULL REFERENCES order_items(order_item_id) ON DELETE CASCADE,
    unit_no integer NOT NULL CHECK (unit_no > 0),
    status varchar(16) NOT NULL CHECK (status IN ('PENDING','COOKING','READY','SERVED')),
    batch_id uuid,
    started_at timestamptz,
    ready_at timestamptz,
    served_at timestamptz,
    UNIQUE(order_item_id, unit_no),
    CHECK ((status IN ('PENDING','COOKING') AND batch_id IS NULL) OR
           (status IN ('READY','SERVED') AND batch_id IS NOT NULL))
);
INSERT INTO order_preparation_units(order_item_id,unit_no,status,batch_id,started_at,ready_at,served_at)
SELECT i.order_item_id,n,
       CASE WHEN i.preparation_status='PENDING' AND o.status='PREPARING' THEN 'COOKING' ELSE i.preparation_status END,
       CASE WHEN i.preparation_status IN ('READY','SERVED')
            THEN md5(o.order_id::text || ':' || COALESCE(i.prepared_at,i.created_at)::text)::uuid END,
       CASE WHEN o.status='PREPARING' THEN o.status_updated_at END,
       CASE WHEN i.preparation_status IN ('READY','SERVED') THEN COALESCE(i.prepared_at,i.created_at) END,i.served_at
FROM order_items i JOIN orders o ON o.order_id=i.order_id
CROSS JOIN LATERAL generate_series(1,i.quantity) n;
CREATE INDEX preparation_units_queue_idx ON order_preparation_units(status,batch_id,order_item_id);

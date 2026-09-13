-- Install ONLY in the disposable qr_order_qa database. Drop after one test.
CREATE OR REPLACE FUNCTION qa_delay_item_update() RETURNS trigger AS $$
BEGIN
  IF NEW.quantity <> OLD.quantity AND EXISTS(
    SELECT 1 FROM orders o JOIN table_sessions s ON s.session_id=o.session_id
    WHERE o.order_id=OLD.order_id AND s.table_id='T16' AND s.status='OPEN'
  ) THEN
    PERFORM pg_sleep(1.5);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER qa_delay_item_update BEFORE UPDATE ON order_items
FOR EACH ROW EXECUTE FUNCTION qa_delay_item_update();

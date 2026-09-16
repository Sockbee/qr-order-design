-- Catalog deletion must not delete orders or remove their sales history.
ALTER TABLE order_items
    ADD COLUMN category_id_snapshot varchar(100),
    ADD COLUMN category_label_snapshot varchar(200);
UPDATE order_items i
SET category_id_snapshot=m.category_id, category_label_snapshot=c.label
FROM menus m JOIN categories c ON c.category_id=m.category_id
WHERE m.menu_id=i.menu_id;
-- menu_id remains the historical identifier, even when the catalog row is gone.
ALTER TABLE order_items DROP CONSTRAINT order_items_menu_id_fkey;

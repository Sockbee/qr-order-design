-- Base rows remain available for audit/recovery; application queries use live views.
ALTER TABLE orders ADD COLUMN deleted_at timestamptz;
ALTER TABLE table_sessions ADD COLUMN deleted_at timestamptz;
ALTER TABLE calls ADD COLUMN deleted_at timestamptz;
CREATE VIEW live_orders AS SELECT * FROM orders WHERE deleted_at IS NULL;
CREATE VIEW live_table_sessions AS SELECT * FROM table_sessions WHERE deleted_at IS NULL;
CREATE VIEW live_calls AS SELECT * FROM calls WHERE deleted_at IS NULL;
DROP INDEX one_open_session_per_table;
DROP INDEX one_open_session_per_origin;
CREATE UNIQUE INDEX one_open_session_per_table ON table_sessions(table_id)
    WHERE status IN ('PREPARED','OPEN') AND deleted_at IS NULL;
CREATE UNIQUE INDEX one_open_session_per_origin ON table_sessions(origin_table_id)
    WHERE status IN ('PREPARED','OPEN') AND deleted_at IS NULL;

-- Unconfigured by default: deployment alone never clears any records.
CREATE TABLE operation_cutover (
    id integer PRIMARY KEY CHECK (id=1),
    starts_at timestamptz NOT NULL,
    completed_at timestamptz,
    archived_counts jsonb
);
CREATE TABLE archived_staff_settlements (
    cutover_at timestamptz NOT NULL,
    staff_id varchar(40) NOT NULL,
    snapshot jsonb NOT NULL,
    deleted_at timestamptz NOT NULL,
    PRIMARY KEY(cutover_at,staff_id)
);

package com.caucse.qrorder.domain;

import com.caucse.qrorder.api.ApiException;
import com.caucse.qrorder.sse.DomainEventService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/** One atomic, restart-safe cutover, serialized with all visit/order mutations. */
@Service
public class OperationCutoverService {
    private final JdbcTemplate jdbc;
    private final DomainEventService events;
    public OperationCutoverService(JdbcTemplate jdbc, DomainEventService events) {
        this.jdbc = jdbc;
        this.events = events;
    }

    @Transactional
    public boolean startIfDue() {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM operation_cutover
                  WHERE completed_at IS NULL AND starts_at<=clock_timestamp())
                """, Boolean.class))) return false;
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(7319021)", Object.class);
        OffsetDateTime start = jdbc.query("""
                SELECT starts_at FROM operation_cutover WHERE id=1 AND completed_at IS NULL
                  AND starts_at<=clock_timestamp() FOR UPDATE
                """, rs -> rs.next() ? rs.getObject(1, OffsetDateTime.class) : null);
        if (start == null) return false;

        // No post-cutover mutation passes the barrier until this transaction commits.
        int orders = jdbc.update("UPDATE orders SET deleted_at=? WHERE deleted_at IS NULL AND created_at<?", start, start);
        int calls = jdbc.update("UPDATE calls SET deleted_at=? WHERE deleted_at IS NULL AND created_at<?", start, start);
        int sessions = jdbc.update("""
                UPDATE table_sessions s SET deleted_at=? WHERE deleted_at IS NULL
                  AND (opened_at IS NULL OR opened_at<?)
                  AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.session_id=s.session_id AND o.deleted_at IS NULL)
                """, start, start);
        int settlements = jdbc.update("""
                INSERT INTO archived_staff_settlements(cutover_at,staff_id,snapshot,deleted_at)
                SELECT ?,staff_id,to_jsonb(s),? FROM staff_members s
                ON CONFLICT(cutover_at,staff_id) DO NOTHING
                """, start, start);
        jdbc.update("""
                UPDATE staff_members SET settlement_status='UNSETTLED',settled_amount=NULL,
                  settled_at=NULL,updated_at=now()
                """);
        String counts = "{\"orders\":"+orders+",\"calls\":"+calls+",\"sessions\":"+sessions+",\"staffSnapshots\":"+settlements+"}";
        jdbc.update("UPDATE operation_cutover SET completed_at=clock_timestamp(),archived_counts=?::jsonb WHERE id=1", counts);
        jdbc.update("""
                INSERT INTO audit_logs(log_id,actor_type,actor_id,action,entity_type,entity_id,detail_json)
                VALUES(?,'SYSTEM','operation-cutover','OPERATION_STARTED','OPERATING_PERIOD',?,?::jsonb)
                """, UUID.randomUUID(), start.toInstant().toString(), counts);
        events.publish("operation.started", "operation-cutover", null, Map.of("startsAt", start.toInstant().toString()));
        return true;
    }

    /** Called after acquiring the visit barrier, before reading or changing business rows. */
    public void assertMutationReady() {
        boolean crossesBoundary = Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM operation_cutover WHERE starts_at<=clock_timestamp()
                  AND (completed_at IS NULL OR transaction_timestamp()<starts_at))
                """, Boolean.class));
        if (crossesBoundary) throw new ApiException(HttpStatus.CONFLICT, "OPERATION_STARTING",
                "운영 시작으로 화면이 초기화됩니다. 새로고침 후 다시 시도해 주세요.", true);
    }
}

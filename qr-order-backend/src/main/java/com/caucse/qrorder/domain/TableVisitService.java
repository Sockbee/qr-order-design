package com.caucse.qrorder.domain;

import com.caucse.qrorder.api.ApiException;
import com.caucse.qrorder.sse.DomainEventService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.*;
import java.util.*;

/** Orders share a topology barrier and serialize only within their table/billing group. */
@Service
public class TableVisitService {
    private final JdbcTemplate jdbc;
    private final DomainEventService events;
    private final MeterRegistry metrics;
    private final OperationCutoverService cutover;
    public TableVisitService(JdbcTemplate jdbc, DomainEventService events, MeterRegistry metrics, OperationCutoverService cutover) { this.jdbc=jdbc; this.events=events; this.metrics=metrics; this.cutover=cutover; }
    public void lock() {
        metrics.timer("qr.visit.lock.wait", "scope", "exclusive").record(() ->
                jdbc.queryForObject("SELECT pg_advisory_xact_lock(7319021)", Object.class));
        cutover.assertMutationReady();
        recordHold();
    }
    private void recordHold() {
        if (!TransactionSynchronizationManager.isSynchronizationActive())
            throw new IllegalStateException("Visit locks require a transaction");
        String key = "qr.visit.lock.hold";
        if (TransactionSynchronizationManager.hasResource(key)) return;
        var sample = Timer.start(metrics);
        TransactionSynchronizationManager.bindResource(key, sample);
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override public void afterCompletion(int status) {
                        sample.stop(metrics.timer(key));
                        TransactionSynchronizationManager.unbindResourceIfPossible(key);
                    }
                });
    }
    public void lockForTable(String tableId) {
        metrics.timer("qr.visit.lock.wait", "scope", "table-group").record(() -> lockTableGroup(tableId));
        cutover.assertMutationReady();
        recordHold();
    }
    private void lockTableGroup(String tableId) {
        // Structural/staff changes take the exclusive barrier first. Therefore group membership
        // cannot change between resolving the root and acquiring its lock, including moved QR aliases.
        jdbc.queryForObject("SELECT pg_advisory_xact_lock_shared(7319021)", Object.class);
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(7319022, hashtext(?))", Object.class, tableId);
        UUID root = jdbc.query("""
                SELECT COALESCE(merged_into_session_id,session_id) FROM live_table_sessions
                WHERE (table_id=? OR origin_table_id=?) AND status IN ('OPEN','PREPARED')
                ORDER BY (table_id=?) DESC LIMIT 1
                """, rs -> rs.next() ? rs.getObject(1, UUID.class) : null, tableId, tableId, tableId);
        if (root != null) jdbc.queryForObject("SELECT pg_advisory_xact_lock(7319023, hashtext(?))",
                Object.class, root.toString());
    }
    @Transactional
    public UUID prepare(String tableId) {
        lockForTable(tableId);
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM tables WHERE table_id=? AND active)",Boolean.class,tableId)))
            throw ApiException.notFound("TABLE_NOT_FOUND","테이블을 찾을 수 없습니다.");
        UUID id=jdbc.query("SELECT session_id FROM live_table_sessions WHERE table_id=? AND status IN ('OPEN','PREPARED')",rs->rs.next()?rs.getObject(1,UUID.class):null,tableId);
        if(id!=null)return id;
        id=UUID.randomUUID();
        jdbc.update("INSERT INTO live_table_sessions(session_id,table_id,origin_table_id,status,opened_at) VALUES(?,?,?,'PREPARED',NULL)",id,tableId,tableId);
        return id;
    }
    @Transactional
    public UUID activate(String tableId) {
        lockForTable(tableId);
        // Preserve the original QR of a moved visit, unless that table has a new visit.
        UUID id=jdbc.query("SELECT session_id FROM live_table_sessions WHERE (table_id=? OR origin_table_id=?) AND status IN ('OPEN','PREPARED') ORDER BY (table_id=?) DESC LIMIT 1",rs->rs.next()?rs.getObject(1,UUID.class):null,tableId,tableId,tableId);
        if(id==null)id=prepare(tableId);
        UUID primary=jdbc.queryForObject("SELECT COALESCE(merged_into_session_id,session_id) FROM live_table_sessions WHERE session_id=?",UUID.class,id);
        jdbc.update("""
            UPDATE live_table_sessions SET status='OPEN',opened_at=COALESCE((SELECT min(opened_at) FROM live_table_sessions WHERE session_id=? OR merged_into_session_id=?),now()),updated_at=now()
            WHERE (session_id=? OR merged_into_session_id=?) AND status IN ('OPEN','PREPARED')
            """,primary,primary,primary,primary);
        return id;
    }
    @Transactional
    public void checkIn(String tableId, String expectedSessionId, String departure, String actor) {
        lock();
        UUID existing=jdbc.query("SELECT session_id FROM live_table_sessions WHERE table_id=? AND status IN ('OPEN','PREPARED')",rs->rs.next()?rs.getObject(1,UUID.class):null,tableId);
        if(expectedSessionId!=null && !expectedSessionId.isBlank() && (existing==null || !existing.toString().equals(expectedSessionId))) {
            UUID root=existing==null?null:jdbc.queryForObject("SELECT COALESCE(merged_into_session_id,session_id) FROM live_table_sessions WHERE session_id=?",UUID.class,existing);
            if(root==null || !root.toString().equals(expectedSessionId))throw ApiException.conflict("TABLE_SESSION_CHANGED","방문이 변경되었습니다. 테이블을 다시 확인해 주세요.");
        }
        OffsetDateTime due=null;
        if(departure!=null && !departure.isBlank()) {
            try { due=OffsetDateTime.parse(departure); } catch(Exception e){throw ApiException.invalid("퇴장 시각을 확인해 주세요.");}
            ZonedDateTime local=due.atZoneSameInstant(ZoneId.of("Asia/Seoul"));
            if(local.getMinute()!=50 || local.getSecond()!=0 || local.getNano()!=0 || !Set.of(1,19,21,23).contains(local.getHour()))throw ApiException.invalid("예약 퇴장 회차를 선택해 주세요.");
        }
        UUID id=activate(tableId);
        UUID primary=jdbc.queryForObject("SELECT COALESCE(merged_into_session_id,session_id) FROM live_table_sessions WHERE session_id=?",UUID.class,id);
        jdbc.update("UPDATE live_table_sessions SET departure_at=?,updated_at=now() WHERE session_id=? OR merged_into_session_id=?",due,primary,primary);
        jdbc.update("INSERT INTO audit_logs(log_id,actor_type,actor_id,action,entity_type,entity_id,to_value) VALUES(?,'STAFF',?,'TABLE_CHECKED_IN','TABLE_SESSION',?,?)",UUID.randomUUID(),actor,primary.toString(),due==null?"WALK_IN":due.toString());
        for(String member:jdbc.queryForList("SELECT table_id FROM live_table_sessions WHERE session_id=? OR merged_into_session_id=?",String.class,primary,primary))events.publish("table.updated",primary.toString(),member,Map.of("operation","check-in"));
    }
}

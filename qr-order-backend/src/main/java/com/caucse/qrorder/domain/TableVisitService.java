package com.caucse.qrorder.domain;

import com.caucse.qrorder.api.ApiException;
import com.caucse.qrorder.sse.DomainEventService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

/** Visit/group mutations share one short transaction lock to serialize QR orders and staff actions. */
@Service
public class TableVisitService {
    private final JdbcTemplate jdbc;
    private final DomainEventService events;
    public TableVisitService(JdbcTemplate jdbc, DomainEventService events) { this.jdbc=jdbc; this.events=events; }
    public void lock() { jdbc.queryForObject("SELECT pg_advisory_xact_lock(7319021)", Object.class); }
    public UUID prepare(String tableId) {
        lock();
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM tables WHERE table_id=? AND active)",Boolean.class,tableId)))
            throw ApiException.notFound("TABLE_NOT_FOUND","테이블을 찾을 수 없습니다.");
        UUID id=jdbc.query("SELECT session_id FROM table_sessions WHERE table_id=? AND status IN ('OPEN','PREPARED')",rs->rs.next()?rs.getObject(1,UUID.class):null,tableId);
        if(id!=null)return id;
        id=UUID.randomUUID();
        jdbc.update("INSERT INTO table_sessions(session_id,table_id,origin_table_id,status,opened_at) VALUES(?,?,?,'PREPARED',NULL)",id,tableId,tableId);
        return id;
    }
    public UUID activate(String tableId) {
        lock();
        // Preserve the original QR of a moved visit, unless that table has a new visit.
        UUID id=jdbc.query("SELECT session_id FROM table_sessions WHERE (table_id=? OR origin_table_id=?) AND status IN ('OPEN','PREPARED') ORDER BY (table_id=?) DESC LIMIT 1",rs->rs.next()?rs.getObject(1,UUID.class):null,tableId,tableId,tableId);
        if(id==null)id=prepare(tableId);
        UUID primary=jdbc.queryForObject("SELECT COALESCE(merged_into_session_id,session_id) FROM table_sessions WHERE session_id=?",UUID.class,id);
        jdbc.update("""
            UPDATE table_sessions SET status='OPEN',opened_at=COALESCE((SELECT min(opened_at) FROM table_sessions WHERE session_id=? OR merged_into_session_id=?),now()),updated_at=now()
            WHERE (session_id=? OR merged_into_session_id=?) AND status IN ('OPEN','PREPARED')
            """,primary,primary,primary,primary);
        return id;
    }
    @Transactional
    public void checkIn(String tableId, String expectedSessionId, String departure, String actor) {
        lock();
        UUID existing=jdbc.query("SELECT session_id FROM table_sessions WHERE table_id=? AND status IN ('OPEN','PREPARED')",rs->rs.next()?rs.getObject(1,UUID.class):null,tableId);
        if(expectedSessionId!=null && !expectedSessionId.isBlank() && (existing==null || !existing.toString().equals(expectedSessionId))) {
            UUID root=existing==null?null:jdbc.queryForObject("SELECT COALESCE(merged_into_session_id,session_id) FROM table_sessions WHERE session_id=?",UUID.class,existing);
            if(root==null || !root.toString().equals(expectedSessionId))throw ApiException.conflict("TABLE_SESSION_CHANGED","방문이 변경되었습니다. 테이블을 다시 확인해 주세요.");
        }
        OffsetDateTime due=null;
        if(departure!=null && !departure.isBlank()) {
            try { due=OffsetDateTime.parse(departure); } catch(Exception e){throw ApiException.invalid("퇴장 시각을 확인해 주세요.");}
            ZonedDateTime local=due.atZoneSameInstant(ZoneId.of("Asia/Seoul"));
            if(local.getMinute()!=50 || local.getSecond()!=0 || local.getNano()!=0 || !Set.of(1,19,21,23).contains(local.getHour()))throw ApiException.invalid("예약 퇴장 회차를 선택해 주세요.");
        }
        UUID id=activate(tableId);
        UUID primary=jdbc.queryForObject("SELECT COALESCE(merged_into_session_id,session_id) FROM table_sessions WHERE session_id=?",UUID.class,id);
        jdbc.update("UPDATE table_sessions SET departure_at=?,updated_at=now() WHERE session_id=? OR merged_into_session_id=?",due,primary,primary);
        jdbc.update("INSERT INTO audit_logs(log_id,actor_type,actor_id,action,entity_type,entity_id,to_value) VALUES(?,'STAFF',?,'TABLE_CHECKED_IN','TABLE_SESSION',?,?)",UUID.randomUUID(),actor,primary.toString(),due==null?"WALK_IN":due.toString());
        for(String member:jdbc.queryForList("SELECT table_id FROM table_sessions WHERE session_id=? OR merged_into_session_id=?",String.class,primary,primary))events.publish("table.updated",primary.toString(),member,Map.of("operation","check-in"));
    }
}

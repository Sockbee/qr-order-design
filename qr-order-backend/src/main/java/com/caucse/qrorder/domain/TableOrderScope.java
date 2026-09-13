package com.caucse.qrorder.domain;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/** Current visit/group membership, shared by customer authorization and order notifications. */
@Service
public class TableOrderScope {
    private final JdbcTemplate jdbc;

    public TableOrderScope(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Session> forTable(String tableId) {
        UUID sessionId = jdbc.query("""
                SELECT session_id FROM table_sessions
                WHERE status='OPEN' AND (table_id=? OR origin_table_id=?)
                ORDER BY CASE WHEN table_id=? THEN 0 ELSE 1 END, opened_at DESC, session_id
                LIMIT 1
                """, rs -> rs.next() ? rs.getObject(1, UUID.class) : null, tableId, tableId, tableId);
        return sessionId == null ? List.of() : forSession(sessionId);
    }

    public List<Session> forSession(UUID sessionId) {
        return jdbc.query("""
                SELECT member.session_id,member.table_id,member.origin_table_id
                FROM table_sessions selected
                JOIN table_sessions member ON
                  member.session_id=COALESCE(selected.merged_into_session_id,selected.session_id)
                  OR member.merged_into_session_id=COALESCE(selected.merged_into_session_id,selected.session_id)
                WHERE selected.session_id=? AND selected.status='OPEN' AND member.status='OPEN'
                ORDER BY member.table_id
                """, (rs, index) -> new Session(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3)), sessionId);
    }

    public List<String> audience(UUID sessionId) {
        // Include the original QR of moved visits, only while it resolves to this group.
        return forSession(sessionId).stream()
                .flatMap(session -> java.util.stream.Stream.of(session.tableId(), session.originTableId()))
                .distinct()
                .filter(tableId -> forTable(tableId).stream().anyMatch(session -> session.id().equals(sessionId)))
                .toList();
    }

    public String sessionIds(List<Session> sessions) {
        return "{" + String.join(",", sessions.stream().map(session -> session.id().toString()).toList()) + "}";
    }

    public record Session(UUID id, String tableId, String originTableId) {}
}

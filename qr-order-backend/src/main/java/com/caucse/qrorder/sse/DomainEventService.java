package com.caucse.qrorder.sse;

import tools.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
public class DomainEventService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public DomainEventService(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public long publish(String type, String entityId, String tableId, Map<String, Object> payload) {
        try {
            Long id = jdbc.queryForObject("""
                    INSERT INTO domain_events(event_id, event_type, entity_id, table_id, revision, payload)
                    VALUES (nextval('domain_events_event_id_seq'), ?, ?, ?, currval('domain_events_event_id_seq'), ?::jsonb)
                    RETURNING event_id
                    """, Long.class, type, entityId, tableId, mapper.writeValueAsString(payload == null ? Map.of() : payload));
            jdbc.queryForObject("SELECT pg_notify('qr_order_events', ?)", String.class, String.valueOf(id));
            return id == null ? 0 : id;
        } catch (Exception error) {
            throw new IllegalStateException("Could not serialize domain event", error);
        }
    }

    public Event find(long id) {
        return jdbc.query("""
                SELECT event_id, event_type, entity_id, table_id, revision, occurred_at
                FROM domain_events WHERE event_id = ?
                """, rs -> rs.next() ? new Event(rs.getLong("event_id"), rs.getString("event_type"),
                rs.getString("entity_id"), rs.getString("table_id"), rs.getLong("revision"),
                rs.getObject("occurred_at", java.time.OffsetDateTime.class).toInstant()) : null, id);
    }

    public long latestId() {
        Long value = jdbc.queryForObject("SELECT COALESCE(max(event_id), 0) FROM domain_events", Long.class);
        return value == null ? 0 : value;
    }

    public List<Event> after(long lastId, String tableId, int limit) {
        String sql = tableId == null
                ? "SELECT event_id,event_type,entity_id,table_id,revision,occurred_at FROM domain_events WHERE event_id > ? ORDER BY event_id LIMIT ?"
                : "SELECT event_id,event_type,entity_id,table_id,revision,occurred_at FROM domain_events WHERE event_id > ? AND (table_id = ? OR table_id IS NULL) ORDER BY event_id LIMIT ?";
        Object[] args = tableId == null ? new Object[]{lastId, limit} : new Object[]{lastId, tableId, limit};
        return jdbc.query(sql, (rs, index) -> new Event(rs.getLong("event_id"), rs.getString("event_type"),
                rs.getString("entity_id"), rs.getString("table_id"), rs.getLong("revision"),
                rs.getObject("occurred_at", java.time.OffsetDateTime.class).toInstant()), args);
    }

    public record Event(long id, String type, String entityId, String tableId, long revision, Instant occurredAt) {}
}

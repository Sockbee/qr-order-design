package com.caucse.qrorder.domain;

import com.caucse.qrorder.config.InfrastructureConnections;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.stereotype.Component;

import java.sql.SQLException;

@Component
public class OrderNumberAllocator {
    private final InfrastructureConnections connections;
    private final Timer timer;

    public OrderNumberAllocator(InfrastructureConnections connections, MeterRegistry metrics) {
        this.connections = connections;
        timer = metrics.timer("qr.order.number.allocation");
    }

    public long next() {
        return timer.record(() -> {
            // Autocommit releases the counter row before order insertion. Retains compatibility
            // with older revisions using the same settings row. Rollbacks may leave number gaps.
            try (var connection = connections.connection(); var statement = connection.prepareStatement("""
                    UPDATE settings SET value=(value::bigint + 1)::text,updated_at=now()
                    WHERE key='NEXT_DISPLAY_NUMBER' RETURNING value::bigint - 1
                    """)) {
                statement.setQueryTimeout(3);
                try (var result = statement.executeQuery()) {
                    if (!result.next()) throw new IllegalStateException("Missing NEXT_DISPLAY_NUMBER");
                    return result.getLong(1);
                }
            } catch (SQLException error) {
                throw new DataAccessResourceFailureException("Order number allocation unavailable", error);
            }
        });
    }
}

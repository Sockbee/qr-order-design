package com.caucse.qrorder.sse;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.caucse.qrorder.config.InfrastructureConnections;
import java.sql.Connection;
import java.sql.Statement;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Component
public class PostgresEventListener {
    private static final Logger log = LoggerFactory.getLogger(PostgresEventListener.class);
    private final InfrastructureConnections dataSource;
    private final DomainEventService events;
    private final SseHub hub;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(Thread.ofVirtual().name("pg-events-").factory());
    private volatile boolean running = true;
    private volatile Connection connection;
    private long lastEventId;
    private boolean initialized;

    public PostgresEventListener(InfrastructureConnections dataSource, DomainEventService events, SseHub hub) {
        this.dataSource = dataSource;
        this.events = events;
        this.hub = hub;
    }

    @PostConstruct
    void start() {
        executor.submit(this::listenLoop);
    }

    private void listenLoop() {
        while (running) {
            try (Connection next = dataSource.connection(); Statement statement = next.createStatement()) {
                connection = next;
                next.setAutoCommit(true);
                statement.execute("LISTEN qr_order_events");
                if (!initialized) {
                    lastEventId = events.latestId();
                    initialized = true;
                } else catchUp();
                PGConnection pg = next.unwrap(PGConnection.class);
                while (running && !next.isClosed()) {
                    PGNotification[] notifications = pg.getNotifications(10_000);
                    if (notifications == null || notifications.length == 0) continue;
                    // Notifications are wakeups; drain committed rows in cursor order in batches.
                    // Borrowing a request-pool connection for every single event delays delivery
                    // when staff queue refreshes compete for the same pool during an order burst.
                    catchUp();
                }
            } catch (Exception error) {
                if (running) {
                    log.warn("PostgreSQL event listener reconnecting: {}", error.getMessage());
                    try { Thread.sleep(1000); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
                }
            }
        }
    }

    private void catchUp() {
        while (running) {
            var page = events.after(lastEventId, null, 250);
            for (DomainEventService.Event event : page) {
                hub.broadcast(event);
                lastEventId = event.id();
            }
            if (page.size() < 250) return;
        }
    }

    @PreDestroy
    void stop() {
        running = false;
        try { if (connection != null) connection.close(); } catch (Exception ignored) {}
        executor.shutdownNow();
    }
}

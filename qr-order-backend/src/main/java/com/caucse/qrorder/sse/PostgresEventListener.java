package com.caucse.qrorder.sse;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Component
public class PostgresEventListener {
    private static final Logger log = LoggerFactory.getLogger(PostgresEventListener.class);
    private final DataSource dataSource;
    private final DomainEventService events;
    private final SseHub hub;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(Thread.ofVirtual().name("pg-events-").factory());
    private volatile boolean running = true;
    private volatile Connection connection;
    private long lastEventId;
    private boolean initialized;

    public PostgresEventListener(DataSource dataSource, DomainEventService events, SseHub hub) {
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
            try (Connection next = dataSource.getConnection(); Statement statement = next.createStatement()) {
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
                    if (notifications == null) continue;
                    for (PGNotification notification : notifications) {
                        long eventId = Long.parseLong(notification.getParameter());
                        if (eventId <= lastEventId) continue;
                        if (eventId > lastEventId + 1) catchUp();
                        else {
                            hub.broadcast(events.find(eventId));
                            lastEventId = eventId;
                        }
                    }
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

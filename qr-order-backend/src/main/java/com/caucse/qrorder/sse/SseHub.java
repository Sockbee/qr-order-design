package com.caucse.qrorder.sse;

import com.caucse.qrorder.config.QrOrderProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SseHub {
    private static final Logger log = LoggerFactory.getLogger(SseHub.class);
    private final Map<UUID, Client> clients = new ConcurrentHashMap<>();
    private final DomainEventService events;
    private final QrOrderProperties properties;

    public SseHub(DomainEventService events, QrOrderProperties properties) {
        this.events = events;
        this.properties = properties;
    }

    public SseEmitter customer(String tableId, long lastEventId) {
        return register(tableId, false, lastEventId);
    }

    public SseEmitter staff(long lastEventId) {
        return register(null, true, lastEventId);
    }

    private SseEmitter register(String tableId, boolean staff, long lastEventId) {
        SseEmitter emitter = new SseEmitter(properties.sse().timeoutMs());
        UUID id = UUID.randomUUID();
        Client client = new Client(tableId, staff, emitter);
        clients.put(id, client);
        Runnable remove = () -> clients.remove(id);
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(error -> remove.run());
        try {
            emitter.send(SseEmitter.event().name("connected").data(Map.of(
                    "serverTime", Instant.now().toString(), "reconnectBeforeMs", properties.sse().timeoutMs())));
            if (lastEventId > 0) {
                long cursor = lastEventId;
                int replayed = 0;
                while (replayed < 5_000) {
                    var page = events.after(cursor, tableId, 250);
                    for (DomainEventService.Event event : page) {
                        send(client, event);
                        cursor = event.id();
                        replayed++;
                    }
                    if (page.size() < 250) break;
                }
            }
        } catch (IOException error) {
            remove.run();
            emitter.completeWithError(error);
        }
        return emitter;
    }

    public void broadcast(DomainEventService.Event event) {
        if (event == null) return;
        clients.forEach((id, client) -> {
            if (!client.staff() && event.tableId() != null && !event.tableId().equals(client.tableId())) return;
            try {
                send(client, event);
            } catch (IOException error) {
                clients.remove(id);
                client.emitter().completeWithError(error);
            }
        });
    }

    private void send(Client client, DomainEventService.Event event) throws IOException {
        client.emitter().send(SseEmitter.event().id(String.valueOf(event.id())).name(event.type()).data(Map.of(
                "id", event.id(), "type", event.type(), "entityId", event.entityId(),
                "revision", event.revision(), "occurredAt", event.occurredAt().toString())));
    }

    @Scheduled(fixedDelayString = "${qr-order.sse.heartbeat-ms:20000}")
    void heartbeat() {
        clients.forEach((id, client) -> {
            try {
                client.emitter().send(SseEmitter.event().comment("heartbeat " + Instant.now()));
            } catch (IOException error) {
                log.debug("Removing closed SSE connection {}", id);
                clients.remove(id);
                client.emitter().complete();
            }
        });
    }

    private record Client(String tableId, boolean staff, SseEmitter emitter) {}
}

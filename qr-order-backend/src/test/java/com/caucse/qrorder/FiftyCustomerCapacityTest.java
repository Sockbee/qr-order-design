package com.caucse.qrorder;

import com.caucse.qrorder.auth.StaffTokenService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.IntFunction;

import static org.junit.jupiter.api.Assertions.*;

/** Real HTTP burst against an isolated database; not a Cloud Run capacity guarantee. */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"server.shutdown=immediate", "qr-order.sse.heartbeat-ms=100"})
class FiftyCustomerCapacityTest {
    static final String PEPPER = "capacity-test-pepper-at-least-32-characters";
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine")
            .withDatabaseName("capacity_test").withUsername("test").withPassword("test");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> 10);
        registry.add("spring.datasource.hikari.connection-timeout", () -> 3000);
        registry.add("qr-order.token-pepper", () -> PEPPER);
        registry.add("qr-order.staff-passcode-hash", () -> StaffTokenService.sha256Hex(PEPPER + ":capacity-passcode"));
        registry.add("qr-order.staff-token-secret", () -> "capacity-test-staff-secret-at-least-32-characters");
    }

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    @Autowired StaffTokenService staffTokens;
    @Autowired io.micrometer.core.instrument.MeterRegistry metrics;

    record Result(int status, long millis, String body) {}

    @Test
    void fiftyLiveCustomersSubmitOrdersAndRetryWithoutDuplicates() throws Exception {
        for (int i = 0; i < 100; i++) {
            jdbc.update("INSERT INTO tables(table_id,display_name,token_hash,sort_order) VALUES(?,?,?,?)",
                    table(i), "Capacity " + i, StaffTokenService.sha256Hex(PEPPER + ":" + token(i)), i);
        }
        jdbc.update("UPDATE settings SET value='TRUE' WHERE key='EVENT_OPEN'");
        var streams = new ArrayList<InputStream>();
        var staffStreams = new ArrayList<InputStream>();
        var staffErrors = new java.util.concurrent.ConcurrentLinkedQueue<String>();
        var refreshes = new java.util.concurrent.atomic.AtomicInteger();
        var received = new java.util.concurrent.atomic.AtomicIntegerArray(4);
        var reading = new java.util.concurrent.atomic.AtomicBoolean(true);
        var readers = Executors.newVirtualThreadPerTaskExecutor();
        var refreshClock = Executors.newSingleThreadScheduledExecutor();
        var pendingRefreshes = new java.util.concurrent.CopyOnWriteArrayList<java.util.concurrent.CompletableFuture<Void>>();
        var client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10)).build();
        try {
            for (int i = 0; i < 100; i++) {
                var response = client.send(request("events", credentials(i)), HttpResponse.BodyHandlers.ofInputStream());
                assertEquals(200, response.statusCode());
                streams.add(response.body());
                // Consume SSE continuously like a real customer screen, including heartbeats.
                readers.submit(() -> {
                    try {
                        response.body().transferTo(java.io.OutputStream.nullOutputStream());
                    } catch (java.io.IOException closed) {
                        // Closing selected streams below models hidden/idle customer screens.
                    }
                });
            }
            for (String label : List.of("카운터", "주방", "서빙", "결제")) {
                String token = staffTokens.login("capacity-passcode", label).get("staffToken").toString();
                var response = client.send(staffRequest("events", token), HttpResponse.BodyHandlers.ofInputStream());
                assertEquals(200, response.statusCode());
                staffStreams.add(response.body());
                int readerIndex = staffStreams.size() - 1;
                String refreshPath = "카운터".equals(label) ? "tables/list" : "orders/queue";
                var dirty = new java.util.concurrent.atomic.AtomicBoolean();
                refreshClock.scheduleAtFixedRate(() -> {
                    if (!reading.get() || !dirty.getAndSet(false)) return;
                    pendingRefreshes.add(client.sendAsync(staffRequest(refreshPath, token), HttpResponse.BodyHandlers.discarding())
                            .handle((snapshot, error) -> {
                                if (error != null) staffErrors.add(error.toString());
                                else if (snapshot.statusCode() != 200) staffErrors.add("queue HTTP " + snapshot.statusCode());
                                refreshes.incrementAndGet();
                                return null;
                            }));
                }, 100, 100, TimeUnit.MILLISECONDS);
                readers.submit(() -> {
                    try (var reader = new java.io.BufferedReader(new java.io.InputStreamReader(response.body()))) {
                        String line;
                        long lastId = 0;
                        while (reading.get() && (line = reader.readLine()) != null) {
                            if (line.startsWith("id:")) {
                                long id = Long.parseLong(line.substring(3).strip());
                                if (id <= lastId) staffErrors.add("non-monotonic SSE cursor " + id + " after " + lastId);
                                lastId = id;
                            }
                            // Coalesce the burst as a staff screen does; refresh is driven by real committed SSE events.
                            if (line.startsWith("event:order.") || line.startsWith("event: order.")) {
                                received.incrementAndGet(readerIndex);
                                dirty.set(true);
                            }
                        }
                    } catch (Exception error) {
                        if (reading.get()) staffErrors.add(error.toString());
                    }
                });
            }
            assertEquals(100, sseCount("customer"));
            assertEquals(4, sseCount("staff"));
            // Warm up the read path without creating an order.
            assertEquals(200, client.send(request("orders/list", credentials(0)),
                    HttpResponse.BodyHandlers.discarding()).statusCode());

            for (int round = 0; round < 3; round++) {
                var bodies = new ArrayList<String>();
                for (int i = 0; i < 50; i++) bodies.add(orderBody(i));
                var results = burst(client, 50, i -> request("orders/create", bodies.get(i)));
                verify("50 tables round " + (round + 1), results, false);
                assertEquals((round + 1) * 50, jdbc.queryForObject("SELECT count(*) FROM orders", Integer.class));
                var retries = burst(client, 50, i -> request("orders/create", bodies.get(i)));
                verify("idempotent replay round " + (round + 1), retries, true);
                assertEquals((round + 1) * 50, jdbc.queryForObject("SELECT count(*) FROM orders", Integer.class));
            }
            // One table is the worst case for table-row contention.
            var sharedBodies = new ArrayList<String>();
            for (int i = 0; i < 50; i++) sharedBodies.add(orderBody(0));
            verify("50 orders on one table", burst(client, 50,
                    i -> request("orders/create", sharedBodies.get(i))), false);

            // Each client can have a snapshot read outstanding alongside its order.
            var mixedBodies = new ArrayList<String>();
            for (int i = 0; i < 50; i++) mixedBodies.add(orderBody(i));
            var mixed = burst(client, 100, i -> i < 50
                    ? request("orders/create", mixedBodies.get(i))
                    : request("orders/list", credentials(i - 50)));
            verify("50 orders plus 50 reads", mixed.subList(0, 50), false);
            summarize("concurrent reads", mixed.subList(50, 100));
            assertTrue(mixed.stream().allMatch(r -> r.status() == 200));
            assertEquals(250, jdbc.queryForObject("SELECT count(*) FROM orders", Integer.class));
            assertEquals(250, jdbc.queryForObject("SELECT count(DISTINCT display_number) FROM orders", Integer.class));
            assertEquals(50, jdbc.queryForObject("SELECT count(*) FROM table_sessions WHERE status='OPEN'", Integer.class));
            assertEquals(750, jdbc.queryForObject("SELECT count(*) FROM order_items", Integer.class));

            for (int round = 0; round < 3; round++) {
                var arrivals = new ArrayList<String>();
                for (int i = 0; i < 40; i++) arrivals.add(orderBody(i + 50));
                var results = burst(client, 80, i -> i < 40
                        ? request("orders/create", arrivals.get(i)) : request("orders/list", credentials(i + 10)));
                summarize("40 reservation orders round " + (round + 1), results.subList(0, 40));
                assertTrue(results.stream().allMatch(r -> r.status() == 200), results.toString());
            }
            assertEquals(370, jdbc.queryForObject("SELECT count(*) FROM orders", Integer.class));
            assertEquals(90, jdbc.queryForObject("SELECT count(*) FROM table_sessions WHERE status='OPEN'", Integer.class));

            // Sensitivity experiment, not a measurement of production DB latency.
            // Add 100ms per insert. Different tables must progress without waiting
            // for every other order to commit or exhausting the request pool.
            jdbc.execute("CREATE FUNCTION capacity_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.1); RETURN NEW; END $$");
            jdbc.execute("CREATE TRIGGER capacity_delay BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION capacity_delay()");
            try {
                var delayedBodies = new ArrayList<String>();
                for (int i = 0; i < 50; i++) delayedBodies.add(orderBody(i));
                var delayed = burst(client, 50, i -> request("orders/create", delayedBodies.get(i)));
                summarize("synthetic +100ms transaction delay", delayed);
                assertTrue(delayed.stream().allMatch(r -> r.status() == 200), delayed.toString());
                long successes = delayed.stream().filter(r -> r.status() == 200).count();
                assertEquals(370 + successes, jdbc.queryForObject("SELECT count(*) FROM orders", Long.class));
                assertEquals(370 + successes, jdbc.queryForObject("SELECT count(DISTINCT display_number) FROM orders", Long.class));
                var failures = delayed.stream().filter(r -> r.status() != 200)
                        .map(r -> r.status() + ":" + r.body()).distinct().toList();
                System.out.println("CAPACITY synthetic failure responses=" + failures);
            } finally {
                jdbc.execute("DROP TRIGGER capacity_delay ON orders");
                jdbc.execute("DROP FUNCTION capacity_delay()");
            }
            long eventDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
            while (java.util.stream.IntStream.range(0, 4).anyMatch(i -> received.get(i) < 420)
                    && System.nanoTime() < eventDeadline) Thread.sleep(50);
            for (int i = 0; i < 4; i++) assertEquals(420, received.get(i), "Missing/duplicate committed SSE events for staff " + i);
            System.out.println("CAPACITY committed order events 420/420 delivered to each of 4 staff streams in cursor order");
            Thread.sleep(150); // Flush the final 100ms invalidation window.
            refreshClock.shutdown();
            assertTrue(refreshClock.awaitTermination(2, TimeUnit.SECONDS));
            for (var pending : pendingRefreshes) pending.get(30, TimeUnit.SECONDS);
            assertTrue(refreshes.get() >= 4, "Staff event-driven refreshes: " + refreshes.get());
            assertTrue(staffErrors.isEmpty(), staffErrors.toString());
            for (int i = 0; i < 40; i++) streams.get(i).close();
            awaitConnections("customer", 60);
            System.out.println("CAPACITY SSE customer connections 100 -> 60 after closing 40 streams; staff=" + sseCount("staff")
                    + " event-triggered refreshes=" + refreshes.get());
        } finally {
            reading.set(false);
            for (var stream : staffStreams) stream.close();
            readers.shutdownNow();
            refreshClock.shutdownNow();
            for (var stream : streams) stream.close();
            client.shutdownNow();
            awaitConnections("customer", 0);
            awaitConnections("staff", 0);
        }
    }

    double sseCount(String audience) {
        return metrics.get("qr.sse.connections").tag("audience", audience).gauge().value();
    }
    void awaitConnections(String audience, int expected) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (sseCount(audience) != expected && System.nanoTime() < until) Thread.sleep(50);
        assertEquals(expected, sseCount(audience), audience + " leaked connections");
    }
    HttpRequest staffRequest(String path, String token) {
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/staff/" + path))
                .timeout(Duration.ofSeconds(30)).header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + token).POST(HttpRequest.BodyPublishers.ofString("{}" )).build();
    }
    String table(int i) { return "T" + (100 + i); }
    String token(int i) { return String.format("%064x", i + 1); }
    String credentials(int i) {
        return "{\"tableId\":\"" + table(i) + "\",\"tableToken\":\"" + token(i) + "\"}";
    }
    String orderBody(int i) throws Exception {
        return mapper.writeValueAsString(Map.of("tableId", table(i), "tableToken", token(i),
                "clientRequestId", UUID.randomUUID().toString(), "expectedTotalAmount", 13000,
                "items", List.of(Map.of("menuId", "chicken-feet", "quantity", 1),
                        Map.of("menuId", "cola", "quantity", 1), Map.of("menuId", "cider", "quantity", 1))));
    }
    HttpRequest request(String path, String body) {
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/customer/" + path))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
    }
    List<Result> burst(HttpClient client, int count, IntFunction<HttpRequest> requests) throws Exception {
        var ready = new CountDownLatch(count);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(count)) {
            List<Future<Result>> futures = new ArrayList<>();
            for (int i = 0; i < count; i++) {
                var request = requests.apply(i);
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    if (!start.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("start barrier timed out");
                    long before = System.nanoTime();
                    var response = client.send(request, HttpResponse.BodyHandlers.ofString());
                    return new Result(response.statusCode(), (System.nanoTime() - before) / 1_000_000, response.body());
                }));
            }
            assertTrue(ready.await(15, TimeUnit.SECONDS));
            start.countDown();
            var results = new ArrayList<Result>();
            for (var f : futures) results.add(f.get(60, TimeUnit.SECONDS));
            return results;
        }
    }
    void verify(String label, List<Result> results, boolean replay) throws Exception {
        summarize(label, results);
        var ids = new HashSet<String>();
        for (var r : results) {
            assertEquals(200, r.status(), r.body());
            var body = mapper.readTree(r.body());
            assertTrue(body.get("success").asBoolean(), r.body());
            assertEquals(replay, body.get("data").get("idempotentReplay").asBoolean());
            ids.add(body.get("data").get("orderId").asString());
        }
        assertEquals(50, ids.size());
    }
    void summarize(String label, List<Result> results) {
        var times = results.stream().mapToLong(Result::millis).sorted().toArray();
        System.out.printf("CAPACITY %s n=%d success=%d p50=%dms p95=%dms max=%dms%n", label,
                results.size(), results.stream().filter(r -> r.status() == 200).count(),
                times[times.length / 2], times[(int) Math.ceil(times.length * .95) - 1], times[times.length - 1]);
    }
}

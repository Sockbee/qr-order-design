#!/usr/bin/env python3
"""Bounded production API test. Defaults to read-only preflight; --execute writes test orders.

Requires aiohttp, psycopg, gcloud auth, and a local Cloud SQL proxy on port 15439.
Only this run's labelled tables/orders are cleaned up. Display/event counters are not reset.
"""
import argparse
import asyncio
import collections
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import subprocess
import time
import uuid

import aiohttp
import psycopg

PROJECT = 'qr-order-507407'
BASE = 'https://qr-order-staging-etxejs37pq-du.a.run.app'
ROOT = Path(__file__).resolve().parents[1]


def secret(name):
    return subprocess.check_output(['gcloud', 'secrets', 'versions', 'access', 'latest',
                                    '--project=' + PROJECT, '--secret=' + name], text=True).rstrip('\n')


def connect(password):
    return psycopg.connect(host='127.0.0.1', port=15439, dbname='qr_order', user='qr_order',
                           password=password, connect_timeout=10, autocommit=True,
                           application_name='bounded-capacity-check',
                           options='-c statement_timeout=15000 -c lock_timeout=5000')


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)


def emit(data):
    print(json.dumps(data, ensure_ascii=False, default=str), flush=True)


def cleanup(conn, manifest):
    ids, marker = manifest['tableIds'], manifest['marker']
    with conn.transaction():
        conn.execute('SELECT pg_advisory_xact_lock(7319021)')
        tables = conn.execute('SELECT table_id,display_name FROM tables WHERE table_id=ANY(%s) FOR UPDATE', (ids,)).fetchall()
        if any(name != marker for _, name in tables):
            raise RuntimeError('Cleanup stopped: test table ownership mismatch')
        if conn.execute('SELECT count(*) FROM orders WHERE table_id=ANY(%s) AND note IS DISTINCT FROM %s', (ids, marker)).fetchone()[0]:
            raise RuntimeError('Cleanup stopped: unexpected order on a test table')
        sessions = [x[0] for x in conn.execute('SELECT session_id FROM table_sessions WHERE table_id=ANY(%s) OR origin_table_id=ANY(%s)', (ids, ids))]
        if sessions:
            outside = conn.execute('SELECT count(*) FROM orders WHERE session_id=ANY(%s) AND NOT(table_id=ANY(%s))', (sessions, ids)).fetchone()[0]
            merged = conn.execute('SELECT count(*) FROM table_sessions WHERE (session_id=ANY(%s) AND merged_into_session_id IS NOT NULL) OR merged_into_session_id=ANY(%s)', (sessions, sessions)).fetchone()[0]
            if outside or merged:
                raise RuntimeError('Cleanup stopped: test session linked to other operations')
        order_ids = [x[0] for x in conn.execute('SELECT order_id FROM orders WHERE table_id=ANY(%s)', (ids,))]
        items = [x[0] for x in conn.execute('SELECT order_item_id FROM order_items WHERE order_id=ANY(%s::uuid[])', (order_ids,))]
        entities = ids + [str(x) for x in sessions + order_ids + items]
        deleted = {}
        deleted['events'] = conn.execute('DELETE FROM domain_events WHERE table_id=ANY(%s)', (ids,)).rowcount
        deleted['audit'] = conn.execute('DELETE FROM audit_logs WHERE entity_id=ANY(%s)', (entities,)).rowcount
        deleted['calls'] = conn.execute('DELETE FROM calls WHERE table_id=ANY(%s)', (ids,)).rowcount
        deleted['orders'] = conn.execute('DELETE FROM orders WHERE table_id=ANY(%s) AND note=%s', (ids, marker)).rowcount
        deleted['sessions'] = conn.execute('DELETE FROM table_sessions WHERE session_id=ANY(%s::uuid[])', (sessions,)).rowcount
        deleted['tables'] = conn.execute('DELETE FROM tables WHERE table_id=ANY(%s) AND display_name=%s', (ids, marker)).rowcount
        if conn.execute('SELECT count(*) FROM orders WHERE table_id=ANY(%s)', (ids,)).fetchone()[0]:
            raise RuntimeError('Cleanup verification failed')
    return deleted


def summary(rows):
    times = sorted(r['ms'] for r in rows)
    return {'count': len(rows), 'statuses': dict(collections.Counter(str(r['status']) for r in rows)),
            'success': sum(r['ok'] for r in rows),
            'p50Ms': times[len(times)//2] if times else None,
            'p95Ms': times[math.ceil(len(times)*.95)-1] if times else None,
            'maxMs': times[-1] if times else None}


async def load(manifest, tokens, menu, total, path):
    report = manifest
    report['startedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    report['stages'] = []
    report['health'] = []
    report['sseEvents'] = collections.Counter()
    stop = asyncio.Event()
    responses, consumers = [], []
    connector = aiohttp.TCPConnector(limit=200)
    timeout = aiohttp.ClientTimeout(total=45, connect=10)
    async with aiohttp.ClientSession(connector=connector, timeout=timeout,
            headers={'User-Agent': 'qr-order-capacity-check/' + path.stem}) as client:
        def credentials(i):
            return {'tableId': manifest['tableIds'][i], 'tableToken': tokens[i]}

        async def post(route, body):
            before = time.monotonic()
            try:
                async with client.post(BASE + '/api/v1/customer/' + route, json=body) as response:
                    data = await response.json(content_type=None) if response.content_type == 'application/json' else {}
                    ok = response.status == 200 and data.get('success') is True
                    if not ok:
                        stop.set()
                    return {'status': response.status, 'ok': ok, 'ms': round((time.monotonic()-before)*1000, 1),
                            'errorCode': data.get('error', {}).get('code') if data.get('error') else None,
                            'orderId': data.get('data', {}).get('orderId') if isinstance(data.get('data'), dict) else None}
            except Exception as exc:
                stop.set()
                return {'status': 'transport-error', 'ok': False, 'ms': round((time.monotonic()-before)*1000, 1), 'errorCode': type(exc).__name__}

        async def health():
            try:
                before = time.monotonic()
                async with client.get(BASE + '/actuator/health/readiness', timeout=aiohttp.ClientTimeout(total=5)) as r:
                    data = await r.json(content_type=None)
                    result = {'status': r.status, 'up': data.get('status') == 'UP', 'ms': round((time.monotonic()-before)*1000, 1)}
            except Exception as exc:
                result = {'status': 'error', 'up': False, 'error': type(exc).__name__}
            report['health'].append(result)
            if not result['up']:
                stop.set()
            return result

        async def watchdog():
            while not stop.is_set():
                await health()
                await asyncio.sleep(2)

        async def consume(response):
            try:
                async for line in response.content:
                    if line.startswith(b'event:'):
                        report['sseEvents'][line.decode().strip()[6:].strip()] += 1
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                report.setdefault('sseErrors', []).append(type(exc).__name__)
                stop.set()

        try:
            emit({'initialHealth': await health()})
            monitor = asyncio.create_task(watchdog())
            try:
                for count in [5, 10, 30, 50]:
                    if stop.is_set():
                        break
                    for i in range(len(responses), count):
                        response = await client.post(BASE + '/api/v1/customer/events', json=credentials(i),
                            timeout=aiohttp.ClientTimeout(total=None, connect=10, sock_read=35))
                        if response.status != 200:
                            response.close()
                            raise RuntimeError('SSE handshake failed: ' + str(response.status))
                        responses.append(response)
                        consumers.append(asyncio.create_task(consume(response)))
                    if stop.is_set():
                        break
                    stage = {'clients': count, 'startedAt': dt.datetime.now(dt.timezone.utc).isoformat()}
                    emit({'startingStage': count, 'openSseConnections': len(responses)})
                    bodies = []
                    for i in range(count):
                        bodies.append({**credentials(i), 'clientRequestId': str(uuid.uuid4()),
                                       'expectedTotalAmount': total, 'note': manifest['marker'], 'items': menu})
                    stage['clientRequestIds'] = [b['clientRequestId'] for b in bodies]
                    report['stages'].append(stage)
                    save(path, report)
                    results = await asyncio.gather(
                        *(post('orders/create', body) for body in bodies),
                        *(post('orders/list', credentials(i)) for i in range(count)))
                    stage['orders'] = results[:count]
                    stage['reads'] = results[count:]
                    stage['orderSummary'] = summary(stage['orders'])
                    stage['readSummary'] = summary(stage['reads'])
                    stage['endedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
                    emit({'completedStage': count, 'orders': stage['orderSummary'], 'reads': stage['readSummary']})
                    save(path, report)
                    if stop.is_set() or stage['orderSummary']['p95Ms'] > 5000 or stage['readSummary']['p95Ms'] > 5000:
                        report['stoppedEarly'] = 'Error or p95 over 5 seconds; no further stages dispatched'
                        break
                    if count < 50:
                        await asyncio.sleep(10)
            finally:
                monitor.cancel()
                await asyncio.gather(monitor, return_exceptions=True)
        finally:
            for r in responses:
                r.close()
            for t in consumers:
                t.cancel()
            await asyncio.gather(*consumers, return_exceptions=True)
            report['finalHealth'] = await health()
            report['endedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
            save(path, report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--cleanup', type=Path)
    args = parser.parse_args()
    password = secret('qr-order-staging-db-password')
    with connect(password) as conn:
        if args.cleanup:
            report = json.loads(args.cleanup.read_text())
            assert report['project'] == PROJECT and report['baseUrl'] == BASE
            report['cleanup'] = cleanup(conn, report)
            save(args.cleanup, report)
            emit({'cleanup': report['cleanup']})
            return
        preflight = {
            'eventOpen': conn.execute("SELECT value FROM settings WHERE key='EVENT_OPEN'").fetchone()[0],
            'ordersLast5Minutes': conn.execute("SELECT count(*) FROM orders WHERE created_at > now()-interval '5 minutes'").fetchone()[0],
            'menus': conn.execute("SELECT menu_id,base_price,available FROM menus WHERE menu_id IN ('chicken-feet','cola','cider') ORDER BY menu_id").fetchall(),
        }
        emit({'preflight': preflight, 'plan': '5/10/30/50 clients; SSE plus one order and one read per client; max 95 test orders'})
        if not args.execute:
            return
        if preflight['eventOpen'].upper() != 'TRUE' or preflight['ordersLast5Minutes']:
            raise RuntimeError('Preflight changed: store closed or real orders in last five minutes')
        if len(preflight['menus']) != 3 or not all(m[2] for m in preflight['menus']):
            raise RuntimeError('Selected test menus are unavailable; no menu settings changed')
        stamp = dt.datetime.now(dt.timezone.utc).strftime('%y%m%d%H%M%S')
        prefix = 'T99' + stamp
        ids = [prefix + f'{i:02d}' for i in range(50)]
        marker = '[부하테스트·조리 금지] ' + stamp
        tokens = [secrets.token_hex(32) for _ in ids]
        pepper = secret('qr-order-staging-token-pepper')
        path = ROOT / '.local-data' / ('production-capacity-' + stamp + '.json')
        report = {'project': PROJECT, 'baseUrl': BASE, 'tableIds': ids, 'marker': marker, 'preflight': preflight}
        save(path, report)
        emit({'recoveryManifest': str(path)})
        try:
            with conn.transaction():
                for i, (table, token) in enumerate(zip(ids, tokens)):
                    conn.execute('INSERT INTO tables(table_id,display_name,token_hash,sort_order) VALUES(%s,%s,%s,%s)',
                                 (table, marker, hashlib.sha256((pepper + ':' + token).encode()).hexdigest(), 90000 + i))
            menu = [{'menuId': m[0], 'quantity': 1} for m in preflight['menus']]
            asyncio.run(load(report, tokens, menu, sum(m[1] for m in preflight['menus']), path))
        finally:
            # Let in-flight HTTP completion/DB transactions settle before guarded cleanup.
            time.sleep(4)
            with connect(password) as cleanup_connection:
                report['dbVerification'] = dict(zip(['orders', 'uniqueRequests', 'uniqueDisplayNumbers'],
                    cleanup_connection.execute('SELECT count(*),count(DISTINCT client_request_id),count(DISTINCT display_number) FROM orders WHERE table_id=ANY(%s)', (ids,)).fetchone()))
                expected = sum(r.get('ok', False) for s in report.get('stages', []) for r in s.get('orders', []))
                report['dbVerification']['acknowledgedOrders'] = expected
                report['dbVerification']['matchesAcknowledged'] = report['dbVerification']['orders'] == expected
                report['cleanup'] = cleanup(cleanup_connection, report)
                report['remainingTestTables'] = cleanup_connection.execute('SELECT count(*) FROM tables WHERE table_id=ANY(%s)', (ids,)).fetchone()[0]
            save(path, report)
            emit({'dbVerification': report['dbVerification'], 'cleanup': report['cleanup'], 'remainingTestTables': report['remainingTestTables'], 'report': str(path)})


if __name__ == '__main__':
    main()

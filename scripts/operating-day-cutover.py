#!/usr/bin/env python3
"""Read-only cutover status by default. --schedule arms a future, one-time server cutover.
Requires psycopg, gcloud authentication, and Cloud SQL proxy on localhost:15439.
Never deletes data itself; the application performs the atomic soft-delete at the boundary.
"""
import argparse
import datetime as dt
import json
import subprocess
import uuid
import psycopg

PROJECT = 'qr-order-507407'


def status(conn):
    row = conn.execute('SELECT starts_at,completed_at,archived_counts FROM operation_cutover WHERE id=1').fetchone()
    report = {'configured': bool(row), 'databaseTime': conn.execute('SELECT clock_timestamp()').fetchone()[0]}
    if row:
        report.update(startsAt=row[0], completedAt=row[1], archivedCounts=row[2])
        report['remainingPreOpeningOrders'] = conn.execute(
            'SELECT count(*) FROM live_orders WHERE created_at<%s', (row[0],)).fetchone()[0]
        report['remainingPreOpeningCalls'] = conn.execute(
            'SELECT count(*) FROM live_calls WHERE created_at<%s', (row[0],)).fetchone()[0]
    report['visible'] = {table: conn.execute('SELECT count(*) FROM ' + table).fetchone()[0]
                         for table in ['live_orders', 'live_table_sessions', 'live_calls']}
    report['configuration'] = {table: conn.execute('SELECT count(*) FROM ' + table).fetchone()[0]
                               for table in ['menus', 'tables', 'staff_members']}
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--schedule', action='store_true')
    parser.add_argument('--starts-at', help='Explicit ISO timestamp with timezone, e.g. 2026-09-17T18:00:00+09:00')
    parser.add_argument('--verify-after-start', action='store_true')
    args = parser.parse_args()
    password = subprocess.check_output(['gcloud', 'secrets', 'versions', 'access', 'latest',
                                        '--project=' + PROJECT, '--secret=qr-order-staging-db-password'], text=True).rstrip('\n')
    with psycopg.connect(host='127.0.0.1', port=15439, dbname='qr_order', user='qr_order',
                         password=password, connect_timeout=10, application_name='operating-day-cutover',
                         options='-c statement_timeout=15000 -c lock_timeout=5000') as conn:
        if args.schedule:
            if not args.starts_at:
                parser.error('--schedule requires --starts-at')
            start = dt.datetime.fromisoformat(args.starts_at)
            if start.tzinfo is None:
                parser.error('--starts-at requires an explicit timezone')
            conn.execute('SELECT pg_advisory_xact_lock(7319021)')
            current = conn.execute('SELECT starts_at,completed_at FROM operation_cutover WHERE id=1 FOR UPDATE').fetchone()
            if current and current[0] != start:
                raise RuntimeError('A different cutover already exists; refusing to change it')
            if not current:
                if start <= conn.execute('SELECT clock_timestamp()').fetchone()[0]:
                    raise RuntimeError('Only a future cutover can be armed by this script')
                conn.execute('INSERT INTO operation_cutover(id,starts_at) VALUES(1,%s)', (start,))
                conn.execute("""INSERT INTO audit_logs(log_id,actor_type,actor_id,action,entity_type,entity_id,detail_json)
                    VALUES(%s,'SYSTEM','operating-day-cutover-script','OPERATION_CUTOVER_SCHEDULED',
                    'OPERATING_PERIOD','1',%s::jsonb)""", (uuid.uuid4(), json.dumps({'startsAt': start.isoformat()})))
        else:
            conn.execute('SET TRANSACTION READ ONLY')
        report = status(conn)
    print(json.dumps(report, default=str, ensure_ascii=False, indent=2))
    if args.verify_after_start and (not report.get('completedAt') or report.get('remainingPreOpeningOrders')
                                   or report.get('remainingPreOpeningCalls')):
        raise SystemExit('Cutover has not completed or pre-opening activity is still visible')


if __name__ == '__main__':
    main()

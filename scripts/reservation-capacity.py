#!/usr/bin/env python3
"""Manual Cloud Run prewarm with optimistic concurrency and explicit restoration.

Uses the caller's gcloud identity. No schedule, deployment, or database mutation.
State is intentionally kept until restore succeeds. Metrics readiness is reported
separately from application health and DB capacity checks in the runbook.
"""
import argparse
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def now():
    return datetime.now(timezone.utc)


def iso(value):
    return value.isoformat().replace('+00:00', 'Z')


def fingerprint(service):
    fields = {key: service.get(key) for key in ('template', 'traffic', 'latestReadyRevision', 'uid')}
    return hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()


class Cloud:
    def __init__(self, project, region, service):
        self.project = project
        self.name = f'projects/{project}/locations/{region}/services/{service}'
        self.url = f'https://run.googleapis.com/v2/{self.name}'
        self.token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()

    def request(self, url, method='GET', body=None):
        data = None if body is None else json.dumps(body).encode()
        request = Request(url, data=data, method=method, headers={
            'Authorization': f'Bearer {self.token}', 'Content-Type': 'application/json'})
        with urlopen(request, timeout=30) as response:
            return json.load(response)

    def describe(self):
        return self.request(self.url)

    def set_min(self, service, minimum):
        # The etag rejects a concurrent deployment/configuration change at the API boundary.
        operation = self.request(self.url + '?updateMask=scaling.minInstanceCount', 'PATCH', {
            'name': self.name, 'etag': service['etag'], 'scaling': {'minInstanceCount': minimum}})
        deadline = time.monotonic() + 180
        while not operation.get('done'):
            if time.monotonic() >= deadline:
                raise RuntimeError('Update timed out; inspect status before restore; saved state is retained.')
            time.sleep(5)
            operation = self.request('https://run.googleapis.com/v2/' + operation['name'])
        if operation.get('error'):
            raise RuntimeError('Cloud Run update failed: ' + str(operation['error'].get('message')))
        return self.describe()

    def instances(self, service):
        revision = service['latestReadyRevision'].rsplit('/', 1)[-1]
        query = urlencode({
            'filter': 'metric.type="run.googleapis.com/container/instance_count" AND '
                      f'resource.labels.revision_name="{revision}" AND '
                      f'resource.labels.service_name="{self.name.rsplit("/", 1)[-1]}" AND '
                      f'resource.labels.location="{self.name.split("/")[3]}"',
            'interval.startTime': iso(now() - timedelta(minutes=8)),
            'interval.endTime': iso(now()),
            'aggregation.alignmentPeriod': '60s',
            'aggregation.perSeriesAligner': 'ALIGN_MAX',
            'aggregation.crossSeriesReducer': 'REDUCE_SUM',
        })
        result = self.request(f'https://monitoring.googleapis.com/v3/projects/{self.project}/timeSeries?{query}')
        totals = defaultdict(int)
        for series in result.get('timeSeries', []):
            for point in series.get('points', []):
                totals[point['interval']['endTime']] += int(point['value']['int64Value'])
        return sorted(totals.items(), reverse=True)[:2]


def minimum(service):
    return service.get('scaling', {}).get('minInstanceCount', 0)


def ready(service):
    traffic = service.get('trafficStatuses', [])
    return (not service.get('reconciling', False)
            and service.get('terminalCondition', {}).get('state') == 'CONDITION_SUCCEEDED'
            and len(traffic) == 1 and traffic[0].get('percent') == 100
            and (traffic[0].get('type') == 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST'
                 or service.get('latestReadyRevision', '').endswith('/' + traffic[0].get('revision', '').rsplit('/', 1)[-1])))


def save(path, state):
    temporary = path.with_suffix('.tmp')
    with open(temporary, 'w', encoding='utf-8') as output:
        os.chmod(temporary, 0o600)
        json.dump(state, output, indent=2)
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'status', 'restore'])
    parser.add_argument('--project', required=True)
    parser.add_argument('--region', default='asia-northeast3')
    parser.add_argument('--service', required=True)
    parser.add_argument('--instances', type=int, choices=[2, 3])
    parser.add_argument('--state', type=Path, required=True)
    args = parser.parse_args()
    args.state.parent.mkdir(parents=True, exist_ok=True)
    # This lock coordinates local invocations; Cloud Run etags also protect remote changes.
    with open(str(args.state) + '.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        cloud = Cloud(args.project, args.region, args.service)
        service = cloud.describe()
        if args.action == 'status':
            print(json.dumps({'service': cloud.name, 'ready': ready(service), 'min': minimum(service),
                              'revision': service.get('latestReadyRevision'),
                              'instanceSamples': cloud.instances(service)}, indent=2))
            return
        if not ready(service):
            raise RuntimeError('Require a ready service with one revision receiving 100% traffic; finish deployment first.')
        if args.action == 'prepare':
            if args.state.exists():
                raise RuntimeError('A saved preparation already exists. Inspect or restore it first.')
            if args.instances is None:
                parser.error('prepare requires --instances 2 or 3')
            ceiling = min(service.get('scaling', {}).get('maxInstanceCount', 0),
                          service.get('template', {}).get('scaling', {}).get('maxInstanceCount', 0))
            if not minimum(service) < args.instances <= ceiling:
                raise RuntimeError('Target must exceed current minimum and fit both explicit ceilings.')
            if service.get('scaling', {}).get('scalingMode', 'AUTOMATIC') == 'MANUAL':
                raise RuntimeError('Manual scaling is not supported by this runbook.')
            state = {'service': cloud.name, 'previous': minimum(service), 'target': args.instances,
                     'fingerprint': fingerprint(service), 'createdAt': iso(now()), 'phase': 'applying'}
            save(args.state, state)  # Save BEFORE mutation, including uncertain/time-out outcomes.
            updated = cloud.set_min(service, args.instances)
            if fingerprint(updated) != state['fingerprint']:
                raise RuntimeError('Deployment changed during preparation; retain state and inspect before restoring.')
            state['phase'] = 'applied'
            state['appliedAt'] = iso(now())
            save(args.state, state)
            print('Minimum applied. Run status until two fresh post-change samples meet the target. '
                  'Then perform the DB and load checks in the runbook. Saved state must be restored after the peak.')
        else:
            state = json.loads(args.state.read_text())
            if state['service'] != cloud.name or fingerprint(service) != state['fingerprint']:
                raise RuntimeError('Service/revision changed: refuse to overwrite newer settings. Reconcile manually.')
            if minimum(service) == state['previous']:
                args.state.unlink()
                print('Previous minimum already restored; saved state cleared.')
                return
            if minimum(service) != state['target']:
                raise RuntimeError('Minimum was changed by another operator; reconcile manually.')
            restored = cloud.set_min(service, state['previous'])
            if minimum(restored) != state['previous'] or not ready(restored):
                raise RuntimeError('Restoration not confirmed; saved state retained.')
            args.state.unlink()
            print('Previous minimum restored and confirmed.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, HTTPError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from None

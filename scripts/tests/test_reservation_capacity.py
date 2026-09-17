import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('capacity', Path(__file__).parents[1] / 'reservation-capacity.py')
capacity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capacity)


def service(**overrides):
    return dict({'uid': 'u1', 'etag': 'etag-before', 'name': 'projects/p/locations/r/services/s',
                 'terminalCondition': {'state': 'CONDITION_SUCCEEDED'},
                 'latestReadyRevision': 'projects/p/locations/r/services/s/revisions/s-00010',
                 'trafficStatuses': [{'type': 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', 'percent': 100}],
                 'template': {'scaling': {'maxInstanceCount': 5}},
                 'scaling': {'minInstanceCount': 1, 'maxInstanceCount': 5}}, **overrides)


class SafetyTests(unittest.TestCase):
    def test_latest_and_pinned_revision_readiness(self):
        self.assertTrue(capacity.ready(service()))
        self.assertTrue(capacity.ready(service(trafficStatuses=[{'revision': 's-00010', 'percent': 100}])))
        self.assertFalse(capacity.ready(service(trafficStatuses=[{'revision': 's-00009', 'percent': 100}])))

    def test_rejects_deployment_in_progress_and_split_traffic(self):
        self.assertFalse(capacity.ready(service(reconciling=True)))
        self.assertFalse(capacity.ready(service(trafficStatuses=[{'revision': 's-00010', 'percent': 50},
                                                                {'revision': 's-00009', 'percent': 50}])))
        self.assertFalse(capacity.ready(service(terminalCondition={'state': 'CONDITION_FAILED'})))

    def test_restore_fingerprint_detects_deployment_but_allows_own_minimum_change(self):
        before = service()
        self.assertEqual(capacity.fingerprint(before), capacity.fingerprint(service(scaling={'minInstanceCount': 3})))
        self.assertNotEqual(capacity.fingerprint(before), capacity.fingerprint(service(template={'revision': 'new'})))
        self.assertNotEqual(capacity.fingerprint(before), capacity.fingerprint(service(uid='different-service')))

    def test_mutation_uses_etag_and_only_changes_service_minimum(self):
        cloud = capacity.Cloud.__new__(capacity.Cloud)
        cloud.name, cloud.url = service()['name'], 'https://example.invalid/service'
        cloud.request = Mock(return_value={'done': True})
        cloud.describe = Mock(return_value=service(scaling={'minInstanceCount': 3}))
        cloud.set_min(service(), 3)
        cloud.request.assert_called_once_with(cloud.url + '?updateMask=scaling.minInstanceCount', 'PATCH',
                                             {'name': cloud.name, 'etag': 'etag-before', 'scaling': {'minInstanceCount': 3}})

    def test_failed_update_cannot_report_success(self):
        cloud = capacity.Cloud.__new__(capacity.Cloud)
        cloud.name, cloud.url = service()['name'], 'https://example.invalid/service'
        cloud.request = Mock(return_value={'done': True, 'error': {'message': 'etag conflict'}})
        with self.assertRaisesRegex(RuntimeError, 'etag conflict'):
            cloud.set_min(service(), 3)


if __name__ == '__main__':
    unittest.main()

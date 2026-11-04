"""Exercise Nexus HTTP -> isolated worker -> checkpoints -> saved spectrum/CSV."""
import csv
import io
from pathlib import Path
import sys
import tempfile
import time
import unittest

import h5py
import numpy as np
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from spectroview_integration.router import router


class APITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.x = np.linspace(1500, 1650, 301)
        y = 100 / (1 + 4 * ((self.x - 1580) / 10) ** 2)
        with h5py.File(self.root / 'test.h5', 'w') as source:
            source['spectrum/wavenumbers'] = self.x
            source['spectrum/intensities'] = np.tile(y, (9, 1))
        app = FastAPI(); app.include_router(router)
        self.client = TestClient(app, base_url='http://localhost', headers={'origin': 'http://localhost:3000'})
        self.addCleanup(self.client.close)
        self.source = {'vault_root': str(self.root), 'h5_relative_path': 'test.h5'}
        self.spec = {'model': {'peak_models': {'0': {'Lorentzian': {
            'ampli': {'value': 90., 'min': 0, 'max': 200},
            'fwhm': {'value': 12., 'min': 1, 'max': 30},
            'x0': {'value': 1579., 'min': 1560, 'max': 1600},
        }}}}}

    def post(self, name, body):
        result = self.client.post('/api/spectroview/v1/' + name, json=body)
        self.assertEqual(result.status_code, 200, result.text)
        return result

    def test_local_only(self):
        response = self.client.post('/api/spectroview/v1/inspect', json=self.source, headers={'origin': 'https://example.com'})
        self.assertEqual(response.status_code, 403)

    def test_preview_crop_and_invalid_requests(self):
        spec = {**self.spec, 'crop': [1540, 1620], 'baseline': {'mode': 'arpls', 'coef': 5}}
        result = self.post('preview', {**self.source, 'spec': spec}).json()
        self.assertGreaterEqual(result['x'][0], 1540)
        self.assertLessEqual(result['x'][-1], 1620)
        np.testing.assert_allclose(np.array(result['best']) + result['baseline'] + result['residual'], result['raw'])
        for changes in ({'index': 9}, {'mode': 'unknown'}, {'spec': {**spec, 'crop': [1620, 1540]}}):
            response = self.client.post('/api/spectroview/v1/preview', json={**self.source, 'spec': spec, **changes})
            self.assertEqual(response.status_code, 422, response.text)

    def test_http_worker_roundtrip_and_export(self):
        before = (self.root / 'test.h5').read_bytes()
        initial = self.post('preview', {**self.source, 'spec': self.spec, 'index': 4, 'mode': 'initial'}).json()
        self.assertEqual(initial['parameters']['P1_x0'], 1579)
        self.assertFalse(initial['saved'])
        np.testing.assert_allclose(np.sum(initial['components'], axis=0), initial['best'])
        preview = self.post('preview', {**self.source, 'spec': self.spec, 'index': 4, 'mode': 'fit'}).json()
        self.assertTrue(preview['success'])
        self.assertLess(preview['rmse'], .001)
        selection = self.post('preview-selection', {**self.source, 'spec': self.spec, 'indices': [8, 4, 0]}).json()
        self.assertEqual(selection['indices'], [8, 4, 0])
        self.assertEqual([row['index'] for row in selection['results']], [8, 4, 0])
        np.testing.assert_allclose(selection['results'][1]['best'], preview['best'], atol=1e-6)
        self.assertFalse((self.root / '.spectroview').exists())
        self.assertEqual((self.root / 'test.h5').read_bytes(), before)
        info = self.post('inspect', self.source).json()
        self.assertEqual(info['n_spectra'], 9)
        run = self.post('create', {**self.source, 'spec': self.spec}).json()
        request = {'vault_root': str(self.root), 'run_id': run['run_id']}
        pending = self.post('map', {**request, 'metric': 'r_squared'}).json()
        self.assertEqual(pending['statuses'], ['pending'] * 9)
        self.assertEqual(pending['status_counts'], {'pending': 9})
        self.assertEqual(self.post('runs', self.source).json()[0]['run_id'], run['run_id'])
        self.assertTrue(self.post('start', request).json()['worker_active'])
        # Double-start is idempotent while the worker runs.
        self.post('start', request)
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            status = self.post('status', request).json()
            if not status['worker_active']:
                break
            time.sleep(.1)
        self.assertEqual(status['state'], 'completed', status)
        self.assertEqual(status['completed'], 9)
        spectrum = self.post('spectrum', {**self.source, 'run_id': run['run_id'], 'index': 4}).json()
        self.assertEqual(spectrum['fit']['status'], 'converged')
        self.assertAlmostEqual(spectrum['fit']['parameters']['P1_x0'], 1580, places=3)
        np.testing.assert_allclose(spectrum['fit']['best'], preview['best'], atol=1e-6)
        np.testing.assert_allclose(spectrum['fit']['components'], preview['components'], atol=1e-6)
        self.assertEqual(spectrum['fit']['success'], preview['success'])
        self.assertAlmostEqual(spectrum['fit']['r_squared'], preview['r_squared'], places=8)
        self.assertAlmostEqual(spectrum['fit']['rmse'], preview['rmse'], places=6)
        mapped = self.post('map', {**request, 'metric': 'P1_x0'}).json()
        self.assertEqual(mapped['valid_count'], 9)
        self.assertEqual(mapped['status_counts'], {'converged': 9})
        self.assertIsNone(mapped['coordinates'])
        np.testing.assert_allclose(mapped['values'], 1580, atol=.001)
        invalid_metric = self.client.post('/api/spectroview/v1/map', json={**request, 'metric': 'missing'})
        self.assertEqual(invalid_metric.status_code, 422)
        rows = list(csv.DictReader(io.StringIO(self.post('export', request).text)))
        self.assertEqual(len(rows), 9)
        self.assertEqual([int(row['spectrum_index']) for row in rows], list(range(9)))
        self.assertEqual((self.root / 'test.h5').read_bytes(), before)
        # A fresh client can recover the saved analysis with no browser state.
        fresh = TestClient(self.client.app, base_url='http://localhost', headers={'origin': 'http://localhost:3000'})
        with fresh:
            response = fresh.post('/api/spectroview/v1/status', json=request)
            self.assertEqual(response.json()['completed'], 9)
            restored = fresh.post('/api/spectroview/v1/spectrum', json={**self.source, 'run_id': run['run_id'], 'index': 4})
            self.assertEqual(restored.json()['fit'], spectrum['fit'])

    def test_map_retains_invalid_rows_and_status_totals(self):
        with h5py.File(self.root / 'test.h5', 'r+') as source:
            source['spectrum/intensities'][4, 10] = np.nan
            source['spectrum/intensities'][8] = 100 / (1 + 4 * ((self.x - 1590) / 10) ** 2)
            source['spectrum/intensities'][0] = 100 / (1 + 4 * ((self.x - 1570) / 10) ** 2)
        selection = self.post('preview-selection', {**self.source, 'spec': self.spec, 'indices': [8, 4, 0]}).json()
        self.assertEqual([row['status'] for row in selection['results']], ['converged', 'invalid_data', 'converged'])
        self.assertEqual(selection['results'][1]['index'], 4)
        self.assertAlmostEqual(selection['results'][0]['parameters']['P1_x0'], 1590, places=3)
        self.assertAlmostEqual(selection['results'][2]['parameters']['P1_x0'], 1570, places=3)
        self.assertFalse((self.root / '.spectroview').exists())
        run = self.post('create', {**self.source, 'spec': self.spec}).json()
        request = {'vault_root': str(self.root), 'run_id': run['run_id']}
        self.post('start', request)
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            status = self.post('status', request).json()
            if not status['worker_active']:
                break
            time.sleep(.1)
        self.assertEqual(status['state'], 'completed', status)
        mapped = self.post('map', request).json()
        self.assertEqual(mapped['status_counts'], {'converged': 8, 'invalid_data': 1})
        self.assertEqual(sum(mapped['status_counts'].values()), mapped['total'])
        self.assertEqual(mapped['statuses'][4], 'invalid_data')
        self.assertIsNone(mapped['values'][4])
        self.assertEqual(mapped['valid_count'], 8)
        centers = self.post('map', {**request, 'metric': 'P1_x0'}).json()['values']
        self.assertAlmostEqual(centers[8], selection['results'][0]['parameters']['P1_x0'], places=6)
        self.assertAlmostEqual(centers[0], selection['results'][2]['parameters']['P1_x0'], places=6)
        inspected = self.post('spectrum', {**self.source, 'run_id': run['run_id'], 'index': 4}).json()
        self.assertEqual(inspected['fit']['status'], 'invalid_data')
        self.assertFalse(inspected['fit']['success'])

    def test_selection_rejects_invalid_indices(self):
        for indices in ([], [0, 0], [9], [-1], [0.5], [True], list(range(33))):
            response = self.client.post('/api/spectroview/v1/preview-selection', json={**self.source, 'spec': self.spec, 'indices': indices})
            self.assertEqual(response.status_code, 422, response.text)


if __name__ == '__main__':
    unittest.main(verbosity=2)

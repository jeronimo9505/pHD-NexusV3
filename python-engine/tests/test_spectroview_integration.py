"""Run with the isolated SPECTROview interpreter; never uses experimental data."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import h5py
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from spectroview_integration.dataset import NexusDataset, DatasetError
from spectroview_integration.engine import fit_block, ModelError
from spectroview_integration.runs import create_run, execute_run, run_directory


def model(fixed=False):
    return {'peak_models': {'0': {'Lorentzian': {
        'ampli': {'value': 100., 'min': 0., 'max': 200., 'vary': not fixed},
        'fwhm': {'value': 10., 'min': 1., 'max': 40., 'vary': not fixed},
        'x0': {'value': 1580., 'min': 1550., 'max': 1610., 'vary': not fixed},
    }}}}


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / 'map.h5'
        self.x = np.linspace(1500, 1650, 301)
        self.y = 100 / (1 + 4 * ((self.x-1580)/10)**2)
        self.write(np.tile(self.y, (6, 1)))

    def write(self, y, x=None, coords=None, provenance=None, grid=(3, 2)):
        with h5py.File(self.path, 'w') as source:
            source.create_dataset('/spectrum/wavenumbers', data=self.x if x is None else x).attrs['units'] = 'cm^-1'
            source.create_dataset('/spectrum/intensities', data=y).attrs['units'] = 'counts'
            source.attrs['map_width'], source.attrs['map_height'] = grid
            if coords is not None:
                source.create_dataset('/spectrum/coordinates', data=coords).attrs['units'] = 'um'
            if provenance is not None:
                source.attrs['wip_provenance'] = json.dumps(provenance)

    def dataset(self):
        return NexusDataset(str(self.root), self.path.name)

    def test_chunks_preserve_rows_precision_and_source(self):
        before = hashlib.sha256(self.path.read_bytes()).hexdigest()
        ds = self.dataset()
        blocks = list(ds.blocks(4))
        np.testing.assert_array_equal(np.concatenate([b.indices for b in blocks]), np.arange(6))
        np.testing.assert_array_equal(np.vstack([b.y for b in blocks]), np.tile(self.y, (6, 1)))
        self.assertIsNone(ds.coordinates)
        self.assertEqual(ds.describe(include_hash=True)['source_sha256'], before)
        self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(), before)

    def test_descending_axis_reverses_signal_together(self):
        self.write(self.y[::-1], self.x[::-1], grid=(1, 1))
        ds = self.dataset()
        self.assertTrue(ds.reversed_axis)
        np.testing.assert_array_equal(ds.read(0, 1).y[0], self.y)
        np.testing.assert_array_equal(ds.x, self.x)

    def test_nonmonotonic_axis_rejected(self):
        x = self.x.copy(); x[2] = x[1]
        self.write(self.y, x)
        with self.assertRaises(DatasetError): self.dataset()

    def test_shape_mismatch_rejected(self):
        self.write(self.y[:-1])
        with self.assertRaises(DatasetError): self.dataset()

    def test_wip_affine_anisotropic_coordinates(self):
        geom = {'valid': True, 'width': 3, 'height': 2,
                'matrix_um': [[2, 0, 10], [0, 5, 20], [0, 0, 1]]}
        self.write(np.tile(self.y, (6, 1)), provenance={'spatial_geometry': geom})
        ds = self.dataset()
        np.testing.assert_array_equal(ds.coordinates, [[10,20],[12,20],[14,20],[10,25],[12,25],[14,25]])
        self.assertEqual(ds.coordinate_units, 'um')

    def test_irregular_coordinates_preserved_without_grid(self):
        coords = np.array([[2, 7], [8, 1], [3, 3]])
        self.write(np.tile(self.y, (3, 1)), coords=coords, grid=(0, 0))
        ds = self.dataset()
        self.assertIsNone(ds.grid)
        np.testing.assert_array_equal(ds.coordinates, coords)

    def test_bad_grid_does_not_infer_square(self):
        self.write(np.tile(self.y, (6, 1)), grid=(50, 50))
        self.assertIsNone(self.dataset().grid)
        self.assertIsNone(self.dataset().coordinates)

    def test_traversal_and_absolute_paths_rejected(self):
        for path in ('../map.h5', str(self.path)):
            with self.subTest(path=path), self.assertRaises(DatasetError):
                NexusDataset(str(self.root), path)

    def test_external_hdf5_link_rejected(self):
        other = self.root / 'other.h5'
        with h5py.File(other, 'w') as source: source['x'] = self.x
        with h5py.File(self.path, 'r+') as source:
            del source['/spectrum/wavenumbers']
            source['/spectrum/wavenumbers'] = h5py.ExternalLink(str(other), '/x')
        with self.assertRaises(DatasetError): self.dataset()

    def test_source_modification_detected(self):
        ds = self.dataset()
        with h5py.File(self.path, 'r+') as source: source.attrs['new'] = 'changed'
        with self.assertRaises(DatasetError): ds.read(0, 1)

    def test_no_gui_needed_and_known_parameters_recovered(self):
        seed = model(); seed['peak_models']['0']['Lorentzian']['x0']['value'] = 1577
        result = fit_block(self.x, self.y[None], seed)
        self.assertTrue(result['success'][0])
        np.testing.assert_allclose(result['params'][0], [100, 10, 1580], rtol=1e-4)
        np.testing.assert_allclose(result['best_fits'][0], self.y, atol=.001)
        from PySide6.QtCore import QCoreApplication
        self.assertIsNone(QCoreApplication.instance())

    def test_fixed_model_evaluates_nonzero_curve(self):
        result = fit_block(self.x, self.y[None], model(True))
        self.assertTrue(result['evaluation_only'])
        self.assertEqual(result['status'][0], 'evaluated')
        np.testing.assert_allclose(result['best_fits'][0], self.y, atol=1e-10)
        np.testing.assert_allclose(result['params'][0], [100, 10, 1580])

    def test_invalid_row_retains_its_position(self):
        data = np.tile(self.y, (3, 1)); data[1, 10] = np.nan
        result = fit_block(self.x, data, model())
        self.assertEqual(result['status'][1], 'invalid_data')
        self.assertTrue(np.isnan(result['params'][1]).all())
        self.assertTrue(result['success'][[0, 2]].all())

    def test_excluded_rows_not_successful(self):
        result = fit_block(self.x, -self.y[None], model())
        self.assertEqual(result['status'][0], 'insufficient_points')
        self.assertFalse(result['success'][0])

    def test_baseline_subtracted_once(self):
        background = 3 + .02 * (self.x - self.x[0])
        baseline = {'mode': 'Linear', 'points': [[1500, 1650], [3, 6]], 'attached': False}
        result = fit_block(self.x, (self.y + background)[None], model(), baseline=baseline)
        np.testing.assert_allclose(result['baseline'][0], background)
        np.testing.assert_allclose(result['params'][0], [100, 10, 1580], rtol=1e-4)

    def test_malicious_unknown_and_cyclic_expressions_rejected(self):
        for expr in ("__import__('os')", 'unknown + 2', 'P1_x0+1', 'np.load(1)'):
            seed = model(); seed['peak_models']['0']['Lorentzian']['x0']['expr'] = expr
            with self.subTest(expr=expr), self.assertRaises(ModelError):
                fit_block(self.x, self.y[None], seed)

    def test_cancelled_before_fit(self):
        result = fit_block(self.x, self.y[None], model(), cancel_check=lambda: True)
        self.assertEqual(result['status'][0], 'cancelled')
        self.assertFalse(result['success'][0])

    def test_run_cancel_resume_matches_uninterrupted_and_source_unchanged(self):
        before = self.path.read_bytes()
        spec = {'model': model()}
        run = create_run(str(self.root), 'map.h5', spec, block_size=2)
        cancelled = [False]
        def progress(done, total): cancelled[0] = done >= 2
        partial = execute_run(str(self.root), run['run_id'], cancel_check=lambda: cancelled[0], progress_callback=progress)
        self.assertEqual((partial['state'], partial['completed']), ('cancelled', 2))
        first = partial['blocks'][0].copy()
        resumed = execute_run(str(self.root), run['run_id'])
        self.assertEqual((resumed['state'], resumed['completed']), ('completed', 6))
        self.assertEqual(first, resumed['blocks'][0])
        values = []
        for block in resumed['blocks']:
            with np.load(run_directory(str(self.root), run['run_id']) / block['file'], allow_pickle=False) as data:
                values.append(data['params'])
        expected = fit_block(self.x, np.tile(self.y, (6,1)), model())['params']
        np.testing.assert_allclose(np.vstack(values), expected)
        self.assertEqual(self.path.read_bytes(), before)

    def test_resume_rejects_changed_source(self):
        run = create_run(str(self.root), 'map.h5', {'model': model()})
        with h5py.File(self.path, 'r+') as source: source['/spectrum/intensities'][0, 0] += 1
        with self.assertRaisesRegex(ValueError, 'Source content changed'):
            execute_run(str(self.root), run['run_id'])

    def test_resume_rejects_corrupt_checkpoint(self):
        run = create_run(str(self.root), 'map.h5', {'model': model()})
        result = execute_run(str(self.root), run['run_id'])
        block = run_directory(str(self.root), run['run_id']) / result['blocks'][0]['file']
        block.write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'corrupt'):
            execute_run(str(self.root), run['run_id'])

    def test_resume_rejects_modified_configuration(self):
        run = create_run(str(self.root), 'map.h5', {'model': model()})
        path = run_directory(str(self.root), run['run_id']) / 'manifest.json'
        saved = json.loads(path.read_text(encoding='utf-8'))
        saved['spec']['model']['peak_models']['0']['Lorentzian']['x0']['value'] = 1581
        path.write_text(json.dumps(saved), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'configuration changed'):
            execute_run(str(self.root), run['run_id'])

    def test_resume_rejects_different_runtime(self):
        run = create_run(str(self.root), 'map.h5', {'model': model()})
        path = run_directory(str(self.root), run['run_id']) / 'manifest.json'
        saved = json.loads(path.read_text(encoding='utf-8'))
        saved['runtime']['packages']['numpy'] = 'other'
        path.write_text(json.dumps(saved), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'runtime changed'):
            execute_run(str(self.root), run['run_id'])


if __name__ == '__main__':
    unittest.main(verbosity=2)

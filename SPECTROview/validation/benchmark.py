"""Reproducible synthetic benchmark; does not use or modify experimental files."""
import importlib.metadata
import json
from pathlib import Path
import platform
import sys
import time

import numpy as np
from scipy.optimize import least_squares

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python-engine'))
from spectroview_integration.engine import fit_block
from spectroview_integration import UPSTREAM_COMMIT


def synthetic(x, p):
    return sum(p[:, i:i+1] / (1 + 4*((x[None, :] - p[:, i+2:i+3])/p[:, i+1:i+2])**2) for i in (0, 3, 6))


def benchmark(n):
    rng = np.random.default_rng(20261031)
    x = np.linspace(1200, 2850, 701)
    truth = np.tile([30., 25., 1330., 100., 20., 1585., 140., 35., 2640.], (n, 1))
    truth[:, [2, 5, 8]] += rng.normal(0, 1, (n, 3))
    model = {'peak_models': {}}
    for i, center in enumerate([1330., 1585., 2640.]):
        model['peak_models'][str(i)] = {'Lorentzian': {
            'ampli': {'value': [30., 100., 140.][i], 'min': 0., 'max': 300.},
            'fwhm': {'value': [25., 20., 35.][i], 'min': 5., 'max': 80.},
            'x0': {'value': center, 'min': center-20, 'max': center+20},
        }}
    recovered, success = [], 0
    oracle_errors = []
    started = time.perf_counter()
    for start in range(0, n, 128):
        p = truth[start:start+128]
        y = synthetic(x, p) + rng.normal(0, .15, (len(p), len(x)))
        result = fit_block(x, y, model, fit_params={'fit_negative': True, 'xtol': 1e-8, 'ftol': 1e-8, 'max_ite': 300})
        recovered.append(result['params']); success += int(result['success'].sum())
        if start == 0:
            for index in range(8):
                reference = least_squares(lambda values: synthetic(x, values[None, :])[0] - y[index],
                                          truth[index], bounds=([0,5,1310,0,5,1565,0,5,2620], [300,80,1350,300,80,1605,300,80,2660]),
                                          xtol=1e-11, ftol=1e-11, gtol=1e-11)
                assert reference.success
                oracle_errors.append(np.abs(reference.x-result['params'][index]).tolist())
    elapsed = time.perf_counter()-started
    errors = np.abs(np.vstack(recovered)-truth)
    summary = dict(n=n, channels=len(x), block_size=128, seconds=elapsed, converged=success,
                   max_absolute_parameter_error=errors.max(axis=0).tolist(),
                   mean_absolute_parameter_error=errors.mean(axis=0).tolist(),
                   oracle_max_absolute_difference=np.max(oracle_errors, axis=0).tolist())
    # Synthetic-specific bounds, not claims of experimental metrological accuracy.
    assert success == n, summary
    assert np.max(errors[:, [2,5,8]]) < .5, summary
    assert np.max(errors[:, [1,4,7]]) < 1., summary
    assert np.max(oracle_errors) < .02, summary
    return summary


if __name__ == '__main__':
    result = dict(upstream_commit=UPSTREAM_COMMIT, python=sys.version,
                  platform=platform.platform(), seed=20261031, noise_std=.15,
                  packages={name: importlib.metadata.version(name) for name in ('spectroview','numpy','scipy','pandas','h5py','PySide6')},
                  results=[benchmark(2500), benchmark(25000)])
    output = Path(__file__).with_name('benchmark-results.json')
    output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))

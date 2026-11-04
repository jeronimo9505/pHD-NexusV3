"""Read-only single-spectrum model evaluation and fitting before a map run."""
from copy import deepcopy
import numpy as np

from .dataset import NexusDataset
from .engine import fit_block


def _numbers(values):
    return [float(value) if np.isfinite(value) else None for value in values]


def preview(vault, source, payload):
    return preview_selection(vault, source, {**payload, 'indices': [payload.get('index', 0)]})['results'][0]


def preview_selection(vault, source, payload):
    spec = payload['spec']
    indices = payload.get('indices', [])
    if not isinstance(indices, list) or not 1 <= len(indices) <= 32:
        raise ValueError('Select between 1 and 32 spectra')
    if any(not isinstance(i, int) or isinstance(i, bool) for i in indices):
        raise ValueError('Spectrum indices must be integers')
    if len(set(indices)) != len(indices):
        raise ValueError('Spectrum indices must be unique')
    mode = payload.get('mode', 'initial')
    if mode not in ('initial', 'fit'):
        raise ValueError('Unknown preview mode')
    dataset = NexusDataset(vault, source)
    if any(i < 0 or i >= dataset.n_spectra for i in indices):
        raise ValueError('Invalid spectrum range')
    x = dataset.x.copy()
    y = np.concatenate([dataset.read(i, i+1).y for i in indices], axis=0)
    crop = spec.get('crop')
    if crop is not None:
        if len(crop) != 2 or not all(isinstance(v, (int, float)) and np.isfinite(v) for v in crop) or crop[0] >= crop[1]:
            raise ValueError('Crop must be a finite increasing range')
        mask = (x >= crop[0]) & (x <= crop[1])
        x, y = x[mask], y[:, mask]
    model = deepcopy(spec['model'])
    if mode == 'initial':
        # Evaluate the literal starting model, without optimizer amplitude scaling.
        for definition in model['peak_models'].values():
            for hints in definition.values():
                for hint in hints.values():
                    hint['vary'] = False
    result = fit_block(x, y, model, baseline=spec.get('baseline'), fit_params=spec.get('fit_params'))
    dataset.assert_unchanged()
    return dict(indices=indices, results=[_row(result, row, index, mode, x, y, dataset.warnings)
                                         for row, index in enumerate(indices)], saved=False)


def _row(result, row, index, mode, x, y, warnings):
    residual = result['residuals'][row]
    finite = np.isfinite(residual)
    rmse = float(np.sqrt(np.mean(residual[finite]**2))) if finite.any() else None
    r2 = result['r_squared'][row]
    return dict(index=index, mode=mode, x=x.tolist(), raw=_numbers(y[row]),
                best=_numbers(result['best_fits'][row]), baseline=_numbers(result['baseline'][row]),
                residual=_numbers(residual), components=[_numbers(curve[row]) for curve in result['peaks']],
                parameters=dict(zip(result['param_names'], _numbers(result['params'][row]))),
                success=bool(result['success'][row]), status=str(result['status'][row]),
                r_squared=float(r2) if np.isfinite(r2) else None, rmse=rmse,
                warnings=warnings, saved=False)

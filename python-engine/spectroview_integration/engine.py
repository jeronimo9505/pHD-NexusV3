"""Adapter over the pinned engine. Qt libraries load, but no application is created."""
import ast
from copy import deepcopy
import math

import numpy as np

from . import UPSTREAM_VERSION


class ModelError(ValueError):
    pass


def capabilities():
    import spectroview
    from spectroview.fit_engine.models import BATCHED_MODELS
    if spectroview.VERSION != UPSTREAM_VERSION:
        raise RuntimeError(f'Expected SPECTROview {UPSTREAM_VERSION}, found {spectroview.VERSION}')
    return {'version': spectroview.VERSION,
            'models': {name: entry[2] for name, entry in BATCHED_MODELS.items()},
            'baseline_methods': [None, 'Linear', 'Polynomial', 'arpls', 'airpls', 'asls', 'modpoly'],
            'losses': ['linear', 'soft_l1', 'huber']}


def validate_model(model):
    """Reject malformed constraints before upstream can clamp/ignore them.

    Expressions accept arithmetic and upstream's scalar/vector math functions.
    Their dependency order is made explicit; no arbitrary Python is accepted.
    """
    registry = capabilities()['models']
    model = deepcopy(model)
    peaks = model.get('peak_models')
    if not isinstance(peaks, dict) or not peaks:
        raise ModelError('Define at least one peak')
    if set(peaks) != {str(i) for i in range(len(peaks))}:
        raise ModelError('Peak keys must be consecutive zero-based strings')
    names, expressions = set(), {}
    for key, definition in peaks.items():
        if not isinstance(definition, dict) or len(definition) != 1:
            raise ModelError('Each peak must define exactly one profile')
        shape, hints = next(iter(definition.items()))
        if shape not in registry or not isinstance(hints, dict) or set(hints) != set(registry[shape]):
            raise ModelError(f'Invalid or incomplete parameters for {shape}')
        for param, hint in hints.items():
            name = f'P{int(key)+1}_{param}'
            names.add(name)
            if not isinstance(hint, dict) or 'value' not in hint:
                raise ModelError(f'{name} needs an explicit initial value')
            value = hint['value']
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
                raise ModelError(f'{name} must be finite')
            low, high = hint.get('min'), hint.get('max')
            if any(bound is not None and (isinstance(bound, bool) or not isinstance(bound, (int, float)) or not math.isfinite(bound)) for bound in (low, high)):
                raise ModelError(f'{name} has an invalid bound; use null for unbounded')
            if (low is not None and value < low) or (high is not None and value > high) or (low is not None and high is not None and low > high):
                raise ModelError(f'{name} initial value is outside its bounds')
            if 'vary' in hint and not isinstance(hint['vary'], bool):
                raise ModelError(f'{name}.vary must be boolean')
            expr = hint.get('expr') or ''
            if not isinstance(expr, str):
                raise ModelError(f'{name} expression must be text')
            if expr.strip() and expr.lower() != 'none':
                expressions[name] = expr.strip()
            elif hint.get('vary', True) and low is not None and low == high:
                raise ModelError(f'{name}: use vary=false for a fixed parameter')

    functions = {'sqrt', 'exp', 'log', 'sin', 'cos'}
    allowed = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Add, ast.Sub, ast.Mult,
               ast.Div, ast.Pow, ast.Mod, ast.USub, ast.UAdd, ast.Load,
               ast.Constant, ast.Name, ast.Call, ast.Attribute)
    dependencies = {}
    for name, expr in expressions.items():
        if len(expr) > 2048:
            raise ModelError('Expression is too long')
        try:
            tree = ast.parse(expr, mode='eval')
        except SyntaxError as exc:
            raise ModelError(f'Invalid expression for {name}') from exc
        deps = set()
        for node in ast.walk(tree):
            if not isinstance(node, allowed):
                raise ModelError(f'Unsupported expression for {name}')
            if isinstance(node, ast.Constant) and (not isinstance(node.value, (int, float)) or isinstance(node.value, bool) or not math.isfinite(node.value)):
                raise ModelError('Only finite numeric constants are allowed')
            if isinstance(node, ast.Name):
                if node.id in names:
                    deps.add(node.id)
                elif node.id not in functions | {'np', 'pi'}:
                    raise ModelError(f'Unknown expression name: {node.id}')
            if isinstance(node, ast.Attribute) and not (isinstance(node.value, ast.Name) and node.value.id == 'np' and node.attr in functions | {'pi'}):
                raise ModelError('Only approved NumPy math functions are allowed')
            if isinstance(node, ast.Call):
                function = node.func
                if not ((isinstance(function, ast.Name) and function.id in functions) or (isinstance(function, ast.Attribute) and function.attr in functions)) or len(node.args) != 1 or node.keywords:
                    raise ModelError('Invalid mathematical function call')
        dependencies[name] = deps & expressions.keys()
    ordered = []
    while dependencies:
        ready = [name for name, deps in dependencies.items() if not deps]
        if not ready:
            raise ModelError('Cyclic parameter expressions')
        ordered.extend(ready)
        for name in ready:
            del dependencies[name]
        for deps in dependencies.values():
            deps.difference_update(ready)
    return model, ordered


def fit_block(x, y, model, *, baseline=None, fit_params=None, cancel_check=None, progress_callback=None):
    """Return row-aligned arrays; invalid/excluded rows never become zero fits."""
    from spectroview.fit_engine.baseline import eval_baseline_batch
    from spectroview.fit_engine.evaluator import VBFevaluator
    from spectroview.fit_engine.vbf_engine import VBFengine
    from spectroview.fit_engine.weights import compute_fit_weights

    model, expression_order = validate_model(model)
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    if x.ndim != 1 or len(x) < 2 or y.ndim != 2 or y.shape[1] != len(x) or not len(y):
        raise ModelError('Expected nonempty x(M) and Y(N,M)')
    if not np.isfinite(x).all() or not np.all(np.diff(x) > 0):
        raise ModelError('Expected finite increasing axis')
    baseline = deepcopy(baseline or {})
    if baseline.get('mode') not in capabilities()['baseline_methods']:
        raise ModelError('Unsupported baseline method')
    params = dict(model.get('fit_params', {}) if fit_params is None else fit_params)
    params = {'fit_negative': False, 'coef_noise': 0, 'max_ite': 200,
              'xtol': 1e-6, 'ftol': 1e-6, 'loss': 'linear', 'f_scale': 1.0, **params}
    if params['loss'] not in capabilities()['losses']:
        raise ModelError('Unsupported loss')
    for key in ('xtol', 'ftol', 'f_scale'):
        if not isinstance(params[key], (int, float)) or not math.isfinite(params[key]) or params[key] <= 0:
            raise ModelError(f'{key} must be positive and finite')
    if not isinstance(params['max_ite'], int) or isinstance(params['max_ite'], bool) or params['max_ite'] < 1:
        raise ModelError('max_ite must be a positive integer')
    if not isinstance(params['coef_noise'], (int, float)) or not math.isfinite(params['coef_noise']) or params['coef_noise'] < 0:
        raise ModelError('coef_noise must be nonnegative and finite')

    evaluator = VBFevaluator.from_fit_model(model)
    # Upstream pre-populates all expression slots, so a forward reference can
    # otherwise consume a stale seed. Feed an explicit dependency order.
    order = {name: i for i, name in enumerate(expression_order)}
    evaluator._exprs.sort(key=lambda pair: order[evaluator._param_names[pair[0]]])
    if expression_order:
        # A separate upstream evaluator is created inside VBFengine. Until an
        # upstream API accepts an evaluator, reject forward references instead
        # of silently changing their meaning in the optimizer.
        native = [name for name in evaluator._param_names if name in expression_order]
        if native != expression_order:
            raise ModelError('Forward expression dependencies require reordering peaks/parameters')
    initial = evaluator._to_full(evaluator.initial_params[None, :])
    if not np.isfinite(initial).all():
        raise ModelError('Expression evaluates to a non-finite initial value')
    n, m = y.shape
    result = dict(params=np.full((n, evaluator.n_params_total), np.nan),
                  success=np.zeros(n, dtype=bool), r_squared=np.full(n, np.nan),
                  best_fits=np.full((n, m), np.nan), baseline=np.full((n, m), np.nan),
                  residuals=np.full((n, m), np.nan), weights=np.zeros((n, m)),
                  status=np.full(n, 'invalid_data', dtype='<U32'),
                  param_names=evaluator._param_names, peaks=[], effective_fit_params=params,
                  evaluation_only=evaluator.n_params_free == 0)
    selected = np.flatnonzero(np.isfinite(y).all(axis=1))
    if not len(selected):
        return result
    background = eval_baseline_batch(x, y[selected], baseline)
    if not np.isfinite(background).all():
        raise ModelError('Baseline produced non-finite values')
    processed = y[selected] - background
    weights = compute_fit_weights(processed, params)
    result['baseline'][selected] = background
    result['weights'][selected] = weights
    enough = np.count_nonzero(weights, axis=1) > evaluator.n_params_free
    result['status'][selected[~enough]] = 'insufficient_points'
    selected, processed, weights = selected[enough], processed[enough], weights[enough]
    if not len(selected):
        return result
    if cancel_check and cancel_check():
        result['status'][selected] = 'cancelled'
        return result
    if evaluator.n_params_free == 0:
        values = evaluator.build_results_batch(np.empty((len(selected), 0)), x, processed,
                                              np.ones(len(selected), dtype=bool), weights, True)
        fitted, success, r2, curves, peaks = values
    else:
        fitted, success, r2, curves, peaks, _ = VBFengine().fit_spectra(
            x, processed, model, weights=weights, fit_params=params,
            cancel_check=cancel_check, progress_callback=progress_callback)
    finite = np.isfinite(fitted).all(axis=1) & np.isfinite(curves).all(axis=1) & np.isfinite(r2)
    success &= finite
    result['params'][selected] = fitted
    result['success'][selected] = success
    result['r_squared'][selected] = r2
    result['best_fits'][selected] = curves
    result['residuals'][selected] = processed - curves
    result['status'][selected] = np.where(success, 'evaluated' if evaluator.n_params_free == 0 else 'converged', 'not_converged')
    if cancel_check and cancel_check():
        result['status'][selected] = 'cancelled'
        result['success'][selected] = False
    for curve in peaks:
        expanded = np.full((n, m), np.nan)
        expanded[selected] = curve
        result['peaks'].append(expanded)
    return result

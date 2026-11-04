"""Local-only integration API. Scientific execution stays in the isolated worker."""
import csv
import io
from pathlib import Path
import threading
from typing import Literal

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, StrictInt
from wip_api import local_desktop

from . import bridge
from .dataset import NexusDataset, resolve_source, file_hash
from .runs import load_run, run_directory, _exclusive_run


router = APIRouter(prefix='/api/spectroview/v1', dependencies=[Depends(local_desktop)])
_launch_lock = threading.Lock()
_workers = {}


class Source(BaseModel):
    vault_root: str
    h5_relative_path: str


class Run(BaseModel):
    vault_root: str
    run_id: str


class Create(Source):
    spec: dict


class Preview(Create):
    index: int = Field(default=0, ge=0)
    mode: Literal['initial', 'fit'] = 'initial'


class SelectionPreview(Create):
    indices: list[StrictInt] = Field(min_length=1, max_length=32)


@router.post('/preview-selection')
def preview_selection(request: SelectionPreview):
    return call(lambda: bridge.invoke('preview-selection', vault=request.vault_root,
                                     source=request.h5_relative_path,
                                     spec={'spec': request.spec, 'indices': request.indices, 'mode': 'fit'}))


class Spectrum(Source):
    index: int = Field(default=0, ge=0)
    run_id: str | None = None


class MapRequest(Run):
    metric: str = 'r_squared'


def call(operation):
    try:
        return operation()
    except (ValueError, KeyError, OSError, RuntimeError) as exc:
        raise HTTPException(422, str(exc)) from exc


def _state(vault, run_id):
    manifest = load_run(vault, run_id)
    key = (str(Path(vault).resolve()), run_id)
    process = _workers.get(key)
    active = process is not None and process.poll() is None
    if not active:
        try:
            with _exclusive_run(run_directory(vault, run_id)):
                pass
        except RuntimeError:
            active = True
    if not active and manifest['state'] == 'running':
        manifest['state'] = 'interrupted'
    if process is not None and process.poll() not in (None, 0) and manifest['state'] not in ('completed', 'cancelled'):
        manifest['state'] = 'failed'
        log = run_directory(vault, run_id) / 'worker-output.txt'
        with log.open('rb') as stream:
            stream.seek(max(0, log.stat().st_size - 2048))
            lines = stream.read().decode('utf-8', errors='replace').strip().splitlines()
        manifest['error'] = lines[-1] if lines else 'Isolated worker failed'
    return {**manifest, 'worker_active': active}


@router.post('/capabilities')
def capabilities():
    return call(lambda: bridge.invoke('capabilities'))


@router.post('/inspect')
def inspect(request: Source):
    return call(lambda: NexusDataset(request.vault_root, request.h5_relative_path).describe())


@router.post('/runs')
def runs(request: Source):
    def operation():
        source = resolve_source(request.vault_root, request.h5_relative_path)
        root = Path(request.vault_root).resolve()
        relative = source.relative_to(root).as_posix()
        directory = (root / '.spectroview' / 'runs').resolve()
        if not directory.is_relative_to(root):
            raise ValueError('Run location escapes vault')
        result = []
        if directory.exists():
            for path in directory.iterdir():
                if not path.is_dir():
                    continue
                try:
                    manifest = _state(request.vault_root, path.name)
                    if manifest['source']['relative_path'] == relative:
                        result.append(manifest)
                except (ValueError, KeyError, OSError):
                    continue
        return sorted(result, key=lambda item: item['created_at'], reverse=True)
    return call(operation)


@router.post('/create')
def create(request: Create):
    return call(lambda: bridge.invoke('create', vault=request.vault_root,
                                      source=request.h5_relative_path, spec=request.spec))


@router.post('/preview')
def preview(request: Preview):
    return call(lambda: bridge.invoke('preview', vault=request.vault_root, source=request.h5_relative_path,
                                      spec={'spec': request.spec, 'index': request.index, 'mode': request.mode}))


@router.post('/start')
def start(request: Run):
    def operation():
        with _launch_lock:
            state = _state(request.vault_root, request.run_id)
            if state['worker_active']:
                return state
            path = run_directory(request.vault_root, request.run_id)
            (path / 'cancel.request').unlink(missing_ok=True)
            process = bridge.launch(request.vault_root, request.run_id, path)
            _workers[(str(Path(request.vault_root).resolve()), request.run_id)] = process
            return {**state, 'worker_active': True}
    return call(operation)


@router.post('/status')
def status(request: Run):
    return call(lambda: _state(request.vault_root, request.run_id))


@router.post('/cancel')
def cancel(request: Run):
    def operation():
        load_run(request.vault_root, request.run_id)
        (run_directory(request.vault_root, request.run_id) / 'cancel.request').touch()
        return {'requested': True}
    return call(operation)


def _arrays(vault, manifest, record):
    # Never accept filenames supplied by the client or unchecked manifest paths.
    expected = f"block-{record['start']:09d}.npz"
    if record['file'] != expected:
        raise ValueError('Invalid checkpoint filename')
    path = (run_directory(vault, manifest['run_id']) / expected).resolve()
    if path.parent != run_directory(vault, manifest['run_id']):
        raise ValueError('Checkpoint escapes run directory')
    if file_hash(path) != record['sha256']:
        raise ValueError('Checkpoint content changed or is corrupt')
    return np.load(path, allow_pickle=False)


def _numbers(values):
    return [float(v) if np.isfinite(v) else None for v in values]


@router.post('/map')
def parameter_map(request: MapRequest):
    def operation():
        manifest = load_run(request.vault_root, request.run_id)
        dataset = NexusDataset(request.vault_root, manifest['source']['relative_path'])
        if file_hash(dataset.path) != manifest['source']['source_sha256']:
            raise ValueError('Source changed since this run')
        values = np.full(dataset.n_spectra, np.nan)
        valid = np.zeros(dataset.n_spectra, dtype=bool)
        statuses = np.full(dataset.n_spectra, 'pending', dtype='<U32')
        metrics = ['r_squared']
        for record in manifest['blocks']:
            with _arrays(request.vault_root, manifest, record) as data:
                metrics = ['r_squared', *data['param_names'].tolist()]
                if request.metric not in metrics:
                    raise ValueError('Unknown fit parameter')
                raw = data['r_squared'] if request.metric == 'r_squared' else data['params'][:, metrics.index(request.metric)-1]
                rows = data['indices']
                statuses[rows] = data['status']
                good = data['success'] & np.isfinite(raw)
                values[rows[good]] = raw[good]
                valid[rows] = good
        return dict(metric=request.metric, metrics=metrics, values=_numbers(values),
                    statuses=statuses.tolist(),
                    status_counts={str(name): int(count) for name, count in zip(*np.unique(statuses, return_counts=True))},
                    valid_count=int(valid.sum()), total=dataset.n_spectra, grid=dataset.grid,
                    coordinates=dataset.coordinates.tolist() if dataset.coordinates is not None else None,
                    coordinate_units=dataset.coordinate_units, completed=manifest['completed'])
    return call(operation)


@router.post('/spectrum')
def spectrum(request: Spectrum):
    def operation():
        dataset = NexusDataset(request.vault_root, request.h5_relative_path)
        block = dataset.read(request.index, request.index + 1)
        result = dict(index=request.index, x=block.x.tolist(), raw=_numbers(block.y[0]), fit=None)
        if request.run_id:
            manifest = load_run(request.vault_root, request.run_id)
            if manifest['source']['relative_path'] != dataset.relative_path:
                raise ValueError('Run belongs to another acquisition')
            if file_hash(dataset.path) != manifest['source']['source_sha256']:
                raise ValueError('Source changed since this run; results cannot be overlaid')
            for record in manifest['blocks']:
                if record['start'] <= request.index < record['stop']:
                    with _arrays(request.vault_root, manifest, record) as data:
                        row = request.index - record['start']
                        residual = data['residuals'][row]
                        finite = np.isfinite(residual)
                        peak_keys = sorted((key for key in data.files if key.startswith('peak_')), key=lambda key: int(key[5:]))
                        result['fit'] = dict(x=data['x'].tolist(), best=_numbers(data['best_fits'][row]),
                                             components=[_numbers(data[key][row]) for key in peak_keys],
                                             success=bool(data['success'][row]),
                                             r_squared=_numbers([data['r_squared'][row]])[0],
                                             rmse=float(np.sqrt(np.mean(residual[finite] ** 2))) if finite.any() else None,
                                             baseline=_numbers(data['baseline'][row]), residual=_numbers(data['residuals'][row]),
                                             status=str(data['status'][row]), parameters=dict(zip(data['param_names'].tolist(), _numbers(data['params'][row]))))
                    break
        return result
    return call(operation)


@router.post('/export')
def export(request: Run):
    def operation():
        manifest = load_run(request.vault_root, request.run_id)
        output = io.StringIO(newline='')
        writer = csv.writer(output)
        header = False
        for record in manifest['blocks']:
            with _arrays(request.vault_root, manifest, record) as data:
                if not header:
                    writer.writerow(['run_id', 'source_sha256', 'spectrum_index', 'status', 'r_squared', 'x', 'y', 'coordinate_units', *data['param_names'].tolist()])
                    header = True
                for i, index in enumerate(data['indices']):
                    coordinates = data['coordinates'][i].tolist() if 'coordinates' in data else ['', '']
                    writer.writerow([request.run_id, manifest['source']['source_sha256'], int(index), str(data['status'][i]),
                                     *_numbers([data['r_squared'][i]]), *coordinates, manifest['source']['coordinate_units'] or '',
                                     *_numbers(data['params'][i])])
        return Response(output.getvalue(), media_type='text/csv',
                        headers={'Content-Disposition': f'attachment; filename="spectroview-{request.run_id}.csv"'})
    return call(operation)

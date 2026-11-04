"""Local versioned runs with atomic, resumable block checkpoints.

Only block boundaries are checkpoints. A cancelled block is recomputed on resume.
Original acquisitions are opened read-only and checked by SHA-256 on every resume.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import hashlib
import importlib.metadata
import importlib.util
import os
from pathlib import Path
import uuid

import numpy as np

from . import UPSTREAM_COMMIT, UPSTREAM_VERSION
from .dataset import NexusDataset, file_hash
from .engine import fit_block, validate_model


def _now():
    return datetime.now(timezone.utc).isoformat()


def _spec_hash(spec):
    return hashlib.sha256(json.dumps(spec, sort_keys=True, allow_nan=False).encode()).hexdigest()


def _runtime():
    modules = ('vbf_engine', 'evaluator', 'models', 'scalar_models', 'optimizer', 'baseline', 'noise', 'weights')
    hashes = {}
    for name in modules:
        location = importlib.util.find_spec('spectroview.fit_engine.' + name).origin
        hashes[name] = file_hash(Path(location))
    for name in ('dataset.py', 'engine.py', 'runs.py'):
        hashes['adapter/' + name] = file_hash(Path(__file__).with_name(name))
    return dict(packages={name: importlib.metadata.version(name) for name in
                         ('spectroview', 'numpy', 'scipy', 'h5py', 'pybaselines')}, code_sha256=hashes)


def _atomic_json(path, value):
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('w', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def run_directory(vault_root, run_id):
    if str(uuid.UUID(run_id)) != run_id:
        raise ValueError('Invalid run ID')
    root = Path(vault_root).resolve(strict=True)
    path = (root / '.spectroview' / 'runs' / run_id).resolve()
    if not path.is_relative_to(root):
        raise ValueError('Run location escapes the vault')
    return path


@contextmanager
def _exclusive_run(path):
    # OS lock is automatically released if the worker crashes. The file may stay.
    with (path / 'worker.lock').open('a+b') as stream:
        if stream.tell() == 0:
            stream.write(b'0')
            stream.flush()
        stream.seek(0)
        if os.name == 'nt':
            import msvcrt
            try:
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as exc:
                raise RuntimeError('This run already has an active worker') from exc
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == 'nt':
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def create_run(vault_root, relative_path, spec, block_size=128):
    if not isinstance(block_size, int) or isinstance(block_size, bool) or block_size < 1:
        raise ValueError('Block size must be positive')
    validate_model(spec['model'])
    if set(spec) - {'model', 'baseline', 'fit_params', 'crop'}:
        raise ValueError('Unsupported analysis options')
    dataset = NexusDataset(vault_root, relative_path)
    run_id = str(uuid.uuid4())
    manifest = dict(schema_version=1, run_id=run_id, state='queued', created_at=_now(),
                    upstream_version=UPSTREAM_VERSION, upstream_commit=UPSTREAM_COMMIT,
                    runtime=_runtime(),
                    source=dataset.describe(include_hash=True), spec=spec, spec_sha256=_spec_hash(spec),
                    block_size=block_size, completed=0, blocks=[], error=None)
    # Validate serializability before creating any output.
    json.dumps(manifest, allow_nan=False)
    path = run_directory(vault_root, run_id)
    path.mkdir(parents=True, exist_ok=False)
    _atomic_json(path / 'manifest.json', manifest)
    return manifest


def load_run(vault_root, run_id):
    path = run_directory(vault_root, run_id)
    manifest = json.loads((path / 'manifest.json').read_text(encoding='utf-8'))
    if manifest['schema_version'] != 1 or manifest['run_id'] != run_id:
        raise ValueError('Unsupported run manifest')
    return manifest


def execute_run(vault_root, run_id, *, cancel_check=None, progress_callback=None):
    path = run_directory(vault_root, run_id)
    with _exclusive_run(path):
        manifest = load_run(vault_root, run_id)
        if manifest.get('spec_sha256') != _spec_hash(manifest['spec']):
            raise ValueError('Analysis configuration changed; create a new run')
        if manifest.get('runtime') != _runtime():
            raise ValueError('Scientific runtime changed; create a new run or restore its environment')
        if manifest['upstream_version'] != UPSTREAM_VERSION or manifest['upstream_commit'] != UPSTREAM_COMMIT:
            raise ValueError('Run was created with a different engine revision')
        dataset = NexusDataset(vault_root, manifest['source']['relative_path'])
        if dataset.describe(include_hash=True)['source_sha256'] != manifest['source']['source_sha256']:
            raise ValueError('Source content changed; create a new run')
        # Validate checkpoint sequence and content before skipping any block.
        completed = 0
        for record in manifest['blocks']:
            expected = f'block-{completed:09d}.npz'
            if record['start'] != completed or record['file'] != expected or not completed < record['stop'] <= dataset.n_spectra:
                raise ValueError('Invalid checkpoint sequence')
            if file_hash(path / expected) != record['sha256']:
                raise ValueError('Checkpoint content changed or is corrupt')
            completed = record['stop']
        manifest.update(state='running', completed=completed, error=None, updated_at=_now())
        _atomic_json(path / 'manifest.json', manifest)
        try:
            for start in range(completed, dataset.n_spectra, manifest['block_size']):
                if cancel_check and cancel_check():
                    manifest['state'] = 'cancelled'
                    break
                block = dataset.read(start, min(start + manifest['block_size'], dataset.n_spectra))
                spec = manifest['spec']
                x, y = block.x, block.y
                crop = spec.get('crop')
                if crop is not None:
                    if len(crop) != 2 or not all(isinstance(v, (int, float)) and np.isfinite(v) for v in crop) or crop[0] >= crop[1]:
                        raise ValueError('Crop must be a finite increasing range')
                    mask = (x >= crop[0]) & (x <= crop[1])
                    x, y = x[mask], y[:, mask]
                result = fit_block(x, y, spec['model'], baseline=spec.get('baseline'),
                                   fit_params=spec.get('fit_params'), cancel_check=cancel_check)
                if (cancel_check and cancel_check()) or np.any(result['status'] == 'cancelled'):
                    manifest['state'] = 'cancelled'
                    break
                arrays = {key: value for key, value in result.items() if isinstance(value, np.ndarray)}
                arrays.update(x=x, indices=block.indices, param_names=np.asarray(result['param_names']))
                for index, curve in enumerate(result['peaks']):
                    arrays[f'peak_{index}'] = curve
                if block.coordinates is not None:
                    arrays['coordinates'] = block.coordinates
                filename = f'block-{start:09d}.npz'
                temporary = path / (filename + '.tmp')
                try:
                    with temporary.open('wb') as stream:
                        np.savez_compressed(stream, **arrays)
                        stream.flush()
                        os.fsync(stream.fileno())
                    dataset.assert_unchanged()
                    os.replace(temporary, path / filename)
                finally:
                    temporary.unlink(missing_ok=True)
                manifest['blocks'].append(dict(file=filename, start=start, stop=int(block.indices[-1])+1,
                                               sha256=file_hash(path / filename)))
                manifest.update(completed=int(block.indices[-1])+1, updated_at=_now(),
                                effective_fit_params=result['effective_fit_params'])
                _atomic_json(path / 'manifest.json', manifest)
                if progress_callback:
                    progress_callback(manifest['completed'], dataset.n_spectra)
            else:
                manifest['state'] = 'completed'
            dataset.assert_unchanged()
        except Exception as exc:
            manifest.update(state='failed', error=str(exc))
            raise
        finally:
            manifest['updated_at'] = _now()
            _atomic_json(path / 'manifest.json', manifest)
        return manifest

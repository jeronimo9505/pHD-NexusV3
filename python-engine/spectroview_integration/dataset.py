"""Read-only, chunked access to Nexus acquisitions without invented geometry."""
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path

import h5py
import numpy as np


class DatasetError(ValueError):
    pass


def resolve_source(vault_root: str, relative_path: str) -> Path:
    root = Path(vault_root).resolve(strict=True)
    relative = Path(relative_path)
    if relative.is_absolute() or relative.drive or '..' in relative.parts:
        raise DatasetError('Source must be a relative path inside the vault')
    path = (root / relative).resolve(strict=True)
    if not path.is_relative_to(root) or not path.is_file():
        raise DatasetError('Source must be a file inside the vault')
    if path.suffix.lower() not in {'.h5', '.hdf5'}:
        raise DatasetError('This adapter requires a Nexus HDF5 acquisition')
    return path


def file_hash(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def _value(value):
    if isinstance(value, bytes):
        return value.decode('utf-8', errors='replace')
    if isinstance(value, np.ndarray):
        return [_value(item) for item in value.tolist()]
    if isinstance(value, np.generic):
        return _value(value.item())
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value


@dataclass(frozen=True)
class SpectrumBlock:
    indices: np.ndarray
    x: np.ndarray
    y: np.ndarray
    valid: np.ndarray
    coordinates: np.ndarray | None


class NexusDataset:
    """Preserves original row IDs/precision; reverses descending axes explicitly.

    Header inspection does not read the full intensity matrix. Hashing is opt-in
    at run creation, not repeated for every spectrum preview.
    """

    def __init__(self, vault_root: str, relative_path: str):
        self.path = resolve_source(vault_root, relative_path)
        self.relative_path = self.path.relative_to(Path(vault_root).resolve()).as_posix()
        self.signature = self._signature()
        self.warnings = []
        self.coordinates = None
        self.coordinate_units = None
        self.coordinate_source = None
        self.grid = None
        with h5py.File(self.path, 'r') as source:
            if '/spectrum/wavenumbers' not in source or '/spectrum/intensities' not in source:
                raise DatasetError('Missing spectrum/wavenumbers or spectrum/intensities')
            xd, yd = source['/spectrum/wavenumbers'], source['/spectrum/intensities']
            # External links/VDS must not bypass the vault boundary.
            for dataset in (xd, yd):
                if Path(dataset.file.filename).resolve() != self.path or dataset.is_virtual or dataset.external:
                    raise DatasetError('External or virtual spectrum datasets are not supported')
            if xd.ndim != 1 or len(xd) < 2 or yd.ndim not in (1, 2):
                raise DatasetError('Expected axis (M,) and intensities (N,M) or (M,)')
            if xd.dtype.kind not in 'fiu' or yd.dtype.kind not in 'fiu':
                raise DatasetError('Spectral arrays must contain real numeric values')
            self.x = np.asarray(xd[:], dtype=np.float64)
            self.original_shape = yd.shape
            self.n_spectra = yd.shape[0] if yd.ndim == 2 else 1
            self.n_channels = len(self.x)
            self.dtype = str(yd.dtype)
            if not self.n_spectra or yd.shape[-1] != self.n_channels:
                raise DatasetError('Axis length and intensity shape disagree or acquisition is empty')
            delta = np.diff(self.x)
            if not np.isfinite(self.x).all() or not (np.all(delta > 0) or np.all(delta < 0)):
                raise DatasetError('Axis must be finite and strictly monotonic, with no duplicates')
            self.reversed_axis = bool(delta[0] < 0)
            if self.reversed_axis:
                self.x = self.x[::-1].copy()
                self.warnings.append('Descending spectral axis reversed together with intensities')
            self.metadata = {key: _value(value) for key, value in source.attrs.items()}
            self.axis_units = _value(xd.attrs.get('units', 'unknown'))
            self.intensity_units = _value(yd.attrs.get('units', 'unknown'))
            self._read_geometry(source)
        self.assert_unchanged()

    def _signature(self):
        stat = self.path.stat()
        return stat.st_size, stat.st_mtime_ns, stat.st_ino

    def assert_unchanged(self):
        if self._signature() != self.signature:
            raise DatasetError('Source changed during analysis; create a new run')

    def _read_geometry(self, source):
        try:
            w, h = (int(self.metadata.get(key, 0)) for key in ('map_width', 'map_height'))
        except (TypeError, ValueError, OverflowError):
            w = h = 0
        if w > 0 and h > 0 and w * h == self.n_spectra:
            self.grid = {'width': w, 'height': h}
        elif w or h:
            self.warnings.append('Stored grid does not match spectrum count; no grid inferred')

        if '/spectrum/coordinates' in source:
            ds = source['/spectrum/coordinates']
            if Path(ds.file.filename).resolve() != self.path or ds.is_virtual or ds.external:
                raise DatasetError('External coordinates are not supported')
            coords = np.asarray(ds[:], dtype=np.float64)
            if coords.shape != (self.n_spectra, 2) or not np.isfinite(coords).all():
                raise DatasetError('Coordinates must be finite with shape (N,2)')
            self.coordinates = coords
            self.coordinate_units = _value(ds.attrs.get('units', 'unknown'))
            self.coordinate_source = 'spectrum/coordinates'
            return

        try:
            provenance = self.metadata.get('wip_provenance', '{}')
            provenance = json.loads(provenance) if isinstance(provenance, str) else provenance
            geom = provenance.get('spatial_geometry', {})
            if geom.get('valid') and self.grid:
                matrix = np.asarray(geom['matrix_um'], dtype=np.float64)
                if matrix.shape != (3, 3) or not np.isfinite(matrix).all() or not np.allclose(matrix[2], [0, 0, 1]):
                    raise ValueError('Invalid affine matrix')
                if int(geom['width']) != w or int(geom['height']) != h:
                    raise ValueError('Geometry dimensions disagree')
                # WIP importer writes cube[:, y, :] at y*width, preserving x-fast order.
                rows = np.arange(self.n_spectra)
                grid = np.column_stack((rows % w, rows // w, np.ones(self.n_spectra)))
                self.coordinates = (grid @ matrix.T)[:, :2]
                self.coordinate_units = 'um'
                self.coordinate_source = 'wip_provenance.spatial_geometry.matrix_um'
                return
        except (ValueError, TypeError, KeyError, AttributeError):
            self.warnings.append('Invalid WIP spatial provenance; physical coordinates unavailable')
        self.warnings.append('Physical coordinates unavailable; spectrum indices are not physical positions')

    def describe(self, include_hash=False):
        self.assert_unchanged()
        result = dict(schema_version=1, relative_path=self.relative_path,
                      n_spectra=self.n_spectra, n_channels=self.n_channels,
                      dtype=self.dtype, axis_units=self.axis_units, intensity_units=self.intensity_units,
                      axis_range=[float(self.x[0]), float(self.x[-1])],
                      axis_reversed=self.reversed_axis, grid=self.grid,
                      coordinate_units=self.coordinate_units, coordinate_source=self.coordinate_source,
                      metadata=self.metadata, warnings=self.warnings.copy())
        if include_hash:
            result['source_sha256'] = file_hash(self.path)
            self.assert_unchanged()
        return result

    def read(self, start: int, stop: int) -> SpectrumBlock:
        if not 0 <= start < stop <= self.n_spectra:
            raise DatasetError('Invalid spectrum range')
        self.assert_unchanged()
        with h5py.File(self.path, 'r') as source:
            ds = source['/spectrum/intensities']
            y = np.asarray(ds[start:stop] if ds.ndim == 2 else ds[:][None, :], dtype=np.float64)
        if self.reversed_axis:
            y = y[:, ::-1].copy()
        self.assert_unchanged()
        return SpectrumBlock(np.arange(start, stop), self.x.copy(), y,
                             np.isfinite(y).all(axis=1),
                             None if self.coordinates is None else self.coordinates[start:stop].copy())

    def blocks(self, block_size=128):
        if not isinstance(block_size, int) or block_size < 1:
            raise DatasetError('Block size must be a positive integer')
        for start in range(0, self.n_spectra, block_size):
            yield self.read(start, min(start + block_size, self.n_spectra))

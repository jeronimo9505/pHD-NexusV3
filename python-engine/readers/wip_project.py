"""Bounded, read-only WIT-tag index with witio 0.2.0 scientific decoders.

Large numeric leaves are memory mapped. Never scan binary payloads for names.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
import math
import struct
import threading
import time
import uuid
from collections import OrderedDict
from datetime import datetime
from dataclasses import asdict, is_dataclass
from pathlib import Path

import h5py
import numpy as np
from PIL import Image
from witio.project import WitProject
from witio.tag import WitTag, MAGIC_STRINGS

DTYPES = {2: '<f8', 3: '<f4', 4: '<i8', 5: '<i4', 6: '<u2', 7: 'u1', 8: 'u1'}
MAX_DECODED = 512 * 1024 * 1024


def json_value(value):
    if is_dataclass(value): return json_value(asdict(value))
    if isinstance(value, dict): return {str(k): json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [json_value(v) for v in value]
    if isinstance(value, np.ndarray): return json_value(value.tolist())
    if isinstance(value, np.generic): return json_value(value.item())
    if isinstance(value, datetime): return value.isoformat()
    if isinstance(value, float) and not math.isfinite(value): return None
    if value is None or isinstance(value, (str, int, float, bool)): return value
    return str(value)


def read_bounded(path: Path):
    count = 0
    ranges = {}
    with path.open('rb') as stream:
        size = path.stat().st_size
        magic = stream.read(8)
        if magic not in MAGIC_STRINGS: raise ValueError('Unsupported WITec file signature')

        def read_tag(pos, limit, depth=0, parent_path=''):
            nonlocal count
            count += 1
            if count > 200_000 or depth > 48: raise ValueError('WIP structure exceeds safety limits')
            if pos + 24 > limit: raise ValueError('Truncated WIP tag header')
            stream.seek(pos)
            n = struct.unpack('<I', stream.read(4))[0]
            if not 0 < n <= 4096 or pos + 24 + n > limit: raise ValueError('Invalid WIP tag name length')
            name = stream.read(n).decode('cp1252', errors='replace')
            kind, start, end = struct.unpack('<IQQ', stream.read(20))
            if not pos + 24 + n <= start <= end <= limit: raise ValueError('WIP tag points outside its parent')
            source_path = f'{parent_path}/{name}'
            ranges[source_path] = {'offset': start, 'end': end, 'type': kind}
            children, data = [], None
            if kind == 0:
                cursor = start
                while cursor < end:
                    child, cursor = read_tag(cursor, end, depth + 1, source_path)
                    children.append(child)
            elif kind == 9:
                if end - start > 4 * 1024 * 1024: raise ValueError('WIP text field exceeds safety limit')
                values, cursor = [], start
                while cursor < end:
                    if cursor + 4 > end: raise ValueError('Truncated WIP string')
                    stream.seek(cursor)
                    length = struct.unpack('<I', stream.read(4))[0]
                    if cursor + 4 + length > end: raise ValueError('WIP string exceeds its tag')
                    values.append(stream.read(length).decode('cp1252', errors='replace'))
                    cursor += 4 + length
                data = values[0] if len(values) == 1 else values
            else:
                dtype = np.dtype(DTYPES.get(kind, 'u1'))
                if (end - start) % dtype.itemsize: raise ValueError('Misaligned WIP numeric field')
                if end > start:
                    if end - start > 65536:
                        data = np.memmap(path, dtype='?' if kind == 8 else dtype, mode='r', offset=start, shape=((end-start)//dtype.itemsize,))
                    else:
                        stream.seek(start)
                        data = np.frombuffer(stream.read(end-start), dtype=dtype).copy()
                else: data = np.array([], dtype=dtype)
                if kind == 8 and not isinstance(data, np.memmap): data = data.astype(bool)
            tag = WitTag(name=name, type=kind, data=data, children=children)
            tag.source_path = source_path
            return tag, end

        root, finish = read_tag(8, size)
        if finish != size: raise ValueError('Unexpected data outside the WIP root')
    return WitProject(magic, root, file_path=str(path)), ranges


def scalar(entry, key, default=None):
    tag = entry.payload.find(key) if entry.payload is not None else None
    return tag.scalar() if tag is not None else default


class ProjectSession:
    def __init__(self, path):
        self.path = Path(path).resolve(strict=True)
        if self.path.suffix.lower() != '.wip': raise ValueError('Select a .wip project')
        self.stat = self.path.stat()
        if self.stat.st_size > 8 * 1024**3: raise ValueError('WIP projects above 8 GB are not supported yet')
        self.lock = threading.RLock()
        digest = hashlib.sha256()
        with self.path.open('rb') as f:
            for block in iter(lambda: f.read(1024*1024), b''): digest.update(block)
        self.sha256 = digest.hexdigest()
        self.project, self.ranges = read_bounded(self.path)
        self.entries = {str(e.id): e for e in self.project.data}
        if len(self.entries) != len(self.project.data): raise ValueError('Duplicate or missing WIP object IDs')
        self.check_source()

    def check_source(self):
        stat = self.path.stat()
        if (stat.st_size, stat.st_mtime_ns) != (self.stat.st_size, self.stat.st_mtime_ns):
            raise ValueError('The WIP project changed. Reopen it before importing.')

    def describe(self, entry, order):
        from readers.wip_spatial import geometry
        metadata = json_value(entry.measurement_metadata)
        shape, axis, warnings = None, None, []
        kind, can_import = 'supporting', False
        if entry.class_name in ('TDBitmap', 'TDImage'):
            shape = [int(scalar(entry, 'SizeX', 0)), int(scalar(entry, 'SizeY', 0))]
            if any(n <= 0 or n > 2_000_000 for n in shape): raise ValueError('Invalid image dimensions')
            kind, can_import = 'image', entry.class_name == 'TDBitmap'
        elif entry.class_name == 'TDGraph':
            shape = [int(scalar(entry, key, 0)) for key in ('SizeX', 'SizeY', 'SizeGraph')]
            if any(n <= 0 or n > 2_000_000 for n in shape) or math.prod(shape)*8 > MAX_DECODED:
                raise ValueError('Graph dimensions exceed the current decoding safety limit')
            try:
                values, unit = entry.x_axis('rel. 1/cm')
                values = np.asarray(values)
                axis = {'unit': unit, 'start': float(values[0]), 'end': float(values[-1]), 'points': int(values.size)}
                can_import = unit == 'rel. 1/cm' and values.size == shape[2] and np.isfinite(values).all()
                kind = 'raman' if can_import else 'auxiliary'
                if not can_import: warnings.append('Not a calibrated Raman-shift axis; this object is not imported as Raman.')
            except Exception as error:
                kind = 'auxiliary'; warnings.append(f'Axis could not be calibrated: {error}')
        if shape and math.prod(shape) * 8 > MAX_DECODED:
            can_import = False; warnings.append('Object exceeds the current 512 MB decoding limit.')
        if kind == 'raman':
            for key in ('objective_name', 'integration_time_s', 'laser_wavelength_nm'):
                if key not in metadata: warnings.append(f'{key} was not recovered from acquisition metadata.')
        references = {}
        if entry.payload:
            for tag in entry.payload.children:
                if tag.name.endswith('ID'):
                    try: references[tag.name] = json_value(tag.scalar())
                    except ValueError: pass
        z = self.project.find_by_id(references.get('ZInterpretationID'))
        if z is not None and z.payload is not None and z.payload.find('UnitName') is not None:
            metadata['intensity_unit'] = json_value(z.payload['UnitName'].scalar())
        spatial = geometry(entry,self.sha256)
        if shape:
            spatial.update(width=shape[0], height=shape[1])
        return {'id': str(entry.id), 'order': order, 'name': entry.caption or entry.class_name,
            'class_name': entry.class_name, 'kind': kind, 'importable': bool(can_import),
            'shape': shape, 'axis': json_value(axis), 'metadata': metadata,
            'metadata_source': 'WITec Trace/ParamSets matched by Data GUID',
            'source_path': entry.tag.source_path, 'source_range': self.ranges[entry.tag.source_path],
            'references': references, 'warnings': warnings, 'history': json_value(entry.history),
            'spatial_geometry': spatial, 'validation': 'vendor-export comparison pending'}

    def details(self, object_id):
        with self.lock:
            entry = self.entry(object_id)
            info = self.describe(entry, self.project.data.index(entry))
            trace = entry.trace_record
            from witio.metadata import TRACE_PARAM_GUID_FIELD_MAP
            reverse = {v: k for k,v in TRACE_PARAM_GUID_FIELD_MAP.items()}
            info['field_sources'] = {key: {'param_guid': reverse.get(key),
                'trace_guid': info['metadata'].get('trace_guid'), 'method': 'witio Trace decoder'} for key in info['metadata']}
            if 'intensity_unit' in info['metadata']:
                info['field_sources']['intensity_unit'] = {'method': 'Linked ZInterpretationID / UnitName',
                    'object_id': info['references'].get('ZInterpretationID')}
            info['raw_acquisition_parameters'] = json_value(trace.raw_params) if trace is not None else {}
            def tree(tag):
                result = {'name': tag.name, 'type': tag.type, 'source': self.ranges[tag.source_path]}
                if tag.type == 0: result['children'] = [tree(child) for child in tag.children]
                elif isinstance(tag.data, np.ndarray) and tag.data.size > 128:
                    result['data_reference'] = {'source_hash': self.sha256, 'path': tag.source_path, 'count': int(tag.data.size)}
                else: result['value'] = json_value(tag.data)
                return result
            info['structural_metadata'] = tree(entry.tag)
            info['related_objects'] = {key: {'id': str(related.id), 'class_name': related.class_name,
                'structure': tree(related.tag)} for key, identifier in info['references'].items()
                if (related := self.project.find_by_id(identifier)) is not None}
            return info

    def inventory(self):
        with self.lock:
            objects = []
            for i, entry in enumerate(self.project.data):
                try: objects.append(self.describe(entry, i))
                except Exception as error:
                    objects.append({'id': str(entry.id), 'order': i, 'name': entry.caption or entry.class_name,
                        'class_name': entry.class_name, 'kind': 'unsupported', 'importable': False,
                        'metadata': {}, 'warnings': [str(error)]})
            images = [obj for obj in objects if obj['kind'] == 'image' and obj['importable']]
            position = 0
            for obj in objects:
                if obj['kind'] in ('raman', 'image', 'auxiliary'):
                    position += 1
                    obj['display_order'] = position
                obj['suggested_images'] = []
                meta = obj['metadata']
                x = meta.get('scan_center_x_um', meta.get('sample_position_x_um'))
                y = meta.get('scan_center_y_um', meta.get('sample_position_y_um'))
                if obj['kind'] != 'raman' or x is None or y is None: continue
                for image in images:
                    im = image['metadata']
                    ix, iy, sx, sy = (im.get(k) for k in ('sample_position_x_um','sample_position_y_um','scan_span_x_um','scan_span_y_um'))
                    if None not in (ix, iy, sx, sy) and abs(x-ix) <= abs(sx)/2 and abs(y-iy) <= abs(sy)/2:
                        obj['suggested_images'].append(image['id'])
            self.check_source()
            return {'name': self.path.name, 'sha256': self.sha256, 'size': self.stat.st_size,
                'version': self.project.version, 'reader': 'witio 0.2.0 / bounded PhD Nexus adapter', 'objects': objects}

    def entry(self, object_id):
        self.check_source()
        entry = self.entries.get(str(object_id))
        if entry is None: raise ValueError('WIP object was not found')
        return entry

    def preview(self, object_id):
        with self.lock:
            entry = self.entry(object_id)
            info = self.describe(entry, self.project.data.index(entry))
            if not info['importable']: raise ValueError('This object is not supported for preview')
            array = entry.array()
            if info['kind'] == 'image':
                image = Image.fromarray(np.transpose(array, (1, 0, 2)))
                image.thumbnail((640, 480)); buffer = io.BytesIO(); image.save(buffer, format='PNG')
                return {'image': base64.b64encode(buffer.getvalue()).decode(), 'object': info}
            x, unit = entry.x_axis('rel. 1/cm')
            # A named source pixel, never an undisclosed interpolation or average.
            y = array[0, 0, :]
            return {'points': json_value([{'x': a, 'y': b} for a, b in zip(x, y)]),
                'preview_label': 'Source spectrum at pixel (0, 0)', 'object': info}

    def extract(self, object_id, image_ids, metadata, vault_root):
        from processor import _build_vault_subpath
        with self.lock:
            entry = self.entry(object_id)
            info = self.describe(entry, self.project.data.index(entry))
            if not info['importable']: raise ValueError('This object cannot be imported')
            image_ids = list(dict.fromkeys(map(str, image_ids)))
            if len(image_ids) > 40: raise ValueError('Too many attached images')
            for image_id in image_ids:
                if self.entry(image_id).class_name != 'TDBitmap': raise ValueError('Select camera images for attachment')
            fingerprint = hashlib.sha256(json.dumps({'metadata': metadata, 'images': image_ids}, sort_keys=True).encode()).hexdigest()
            record_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"phdnexus:wip:{metadata['group_id']}:{metadata['sample_id']}:{self.sha256}:{entry.id}:{fingerprint}"))
            root = Path(vault_root).resolve(strict=True)
            directory = (root / _build_vault_subpath(metadata)).resolve()
            directory.relative_to(root)
            directory.mkdir(parents=True, exist_ok=True)
            target = directory / f"WIP_{record_id}{'.h5' if info['kind']=='raman' else '.hdf5'}"
            image_paths = []
            attached = image_ids if info['kind'] == 'raman' else [str(entry.id)]
            for image_id in attached:
                image_path = directory / f'WIP_{record_id}_image_{image_id}.png'
                if not image_path.exists():
                    rgb = self.entry(image_id).array()
                    temporary = image_path.with_suffix(f'.{uuid.uuid4().hex}.tmp')
                    try:
                        Image.fromarray(np.transpose(rgb, (1,0,2))).save(temporary, format='PNG')
                        temporary.replace(image_path)
                    finally: temporary.unlink(missing_ok=True)
                image_paths.append(image_path.relative_to(root).as_posix())
            provenance = {'source_hash': self.sha256, 'source_name': self.path.name, 'object_id': str(entry.id),
                'object_name': entry.caption, 'source_path': info['source_path'], 'source_range': info['source_range'],
                'version': self.project.version, 'reader': 'witio 0.2.0', 'validation': info['validation'],
                'original_metadata': info['metadata'], 'reviewed_metadata': metadata.get('parameters', {}),
                'references': info['references'], 'attached_object_ids': attached,
                'shape': info['shape'], 'axis': info['axis'], 'history': info['history'],
                'spatial_geometry': info['spatial_geometry'],
                'field_sources': self.details(object_id)['field_sources']}
            details = self.details(object_id)
            provenance['structural_metadata'] = details['structural_metadata']
            provenance['related_objects'] = details['related_objects']
            raw_params = entry.trace_record.raw_params if entry.trace_record is not None else []
            provenance['raw_acquisition_parameters'] = json_value(raw_params)
            provenance['attached_image_metadata'] = [dict(id=image_id,
                path=image_paths[index],name=self.entries[image_id].caption,
                spatial_geometry=self.describe(self.entries[image_id],0)['spatial_geometry']) for index,image_id in enumerate(attached)]
            dimensions = info['shape']
            if not target.exists():
                temporary = target.with_suffix(f'.{uuid.uuid4().hex}.tmp')
                try:
                    with h5py.File(temporary, 'w') as h5:
                        h5.attrs['wip_provenance'] = json.dumps(provenance)
                        h5.attrs['wip_import_key'] = record_id
                        for key, value in metadata.items(): h5.attrs[key] = json.dumps(value) if isinstance(value, (dict,list)) else str(value)
                        if info['kind'] == 'raman':
                            cube = entry.array(); x, unit = entry.x_axis('rel. 1/cm')
                            if unit != 'rel. 1/cm' or not (np.all(np.diff(x)>0) or np.all(np.diff(x)<0)):
                                raise ValueError('A monotonic calibrated Raman axis is required')
                            reverse = bool(x[0] > x[-1]); nx, ny, channels = cube.shape
                            spectrum = h5.create_group('spectrum')
                            spectrum.create_dataset('wavenumbers', data=x[::-1] if reverse else x).attrs['units'] = 'cm^-1'
                            intensity = spectrum.create_dataset('intensities', shape=(nx*ny,channels), dtype=cube.dtype, compression='gzip')
                            for y in range(ny): intensity[y*nx:(y+1)*nx,:] = cube[:,y,::-1] if reverse else cube[:,y,:]
                            intensity.attrs['units'] = info['metadata'].get('intensity_unit', 'not recovered')
                            h5.attrs['map_width'], h5.attrs['map_height'] = nx, ny
                            # Keep the exact stored bytes and calibration tree references as well.
                            raw = entry.payload.path('GraphData','Data')
                            h5.create_dataset('wip_original/graph_bytes', data=raw.data, compression='gzip')
                        else:
                            h5.create_dataset('image/rgb_xy', data=entry.array(), compression='gzip')
                    self.check_source(); temporary.replace(target)
                finally: temporary.unlink(missing_ok=True)
            relative = target.relative_to(root).as_posix()
            self.check_source()
            representative = None
            if info['kind'] == 'raman':
                with h5py.File(target, 'r') as h5:
                    x = h5['spectrum/wavenumbers'][:]
                    values = h5['spectrum/intensities'][:]
                    present = np.isfinite(values).any(axis=0)
                    y = np.full(values.shape[1], np.nan)
                    y[present] = np.nanmedian(np.where(np.isfinite(values[:, present]), values[:, present], np.nan), axis=0)
                    representative = [{'x': float(a), 'y': float(b)} for a,b in zip(x,y) if np.isfinite(a) and np.isfinite(b)]
            return {'record_id': record_id, 'h5_relative_path': relative if info['kind']=='raman' else None,
                'archive_relative_path': relative, 'attached_images': image_paths, 'provenance': provenance,
                'shape': dimensions, 'kind': info['kind'], 'representative': representative}


_sessions = OrderedDict()
_lock = threading.RLock()

def inspect_project(path):
    session = ProjectSession(path)
    token = uuid.uuid4().hex
    result = session.inventory()
    with _lock:
        while len(_sessions) >= 3: _sessions.popitem(last=False)
        _sessions[token] = (time.monotonic(), session)
    return {'session': token, **result}

def get_session(token):
    with _lock:
        record = _sessions.get(token)
        if record is None or time.monotonic()-record[0] > 4*3600:
            _sessions.pop(token, None)
            raise ValueError('The WIP session expired. Reopen the project to continue.')
        _sessions.move_to_end(token)
        return record[1]

def close_session(token):
    with _lock: _sessions.pop(token, None)

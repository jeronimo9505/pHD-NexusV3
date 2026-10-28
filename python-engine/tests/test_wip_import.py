import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import unittest

import h5py
import numpy as np
from fastapi import FastAPI
from fastapi.testclient import TestClient
from witio.tag import WitTag, write_bytes

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python-engine'))
from readers.wip_project import ProjectSession, read_bounded, close_session
from wip_api import router

TEMP_ROOT = (ROOT / 'scratch/test_vault').resolve()
TEMP_ROOT.mkdir(parents=True, exist_ok=True)

def temporary():
    directory = tempfile.TemporaryDirectory(prefix='wip-tests-', dir=TEMP_ROOT)
    assert Path(directory.name).resolve().is_relative_to(TEMP_ROOT)
    return directory

def synthetic():
    data = [WitTag('NumberOfData', 5, data=np.array([2], dtype='<i4'))]
    for index in range(2):
        data += [WitTag(f'DataClassName {index}',9,data='UnknownInstrumentObject'),
            WitTag(f'Data {index}',0,children=[WitTag('TData',0,children=[
                WitTag('ID',5,data=np.array([index+1],dtype='<i4')),WitTag('Caption',9,data='Same name')])])]
    root=WitTag('WITec Project',0,children=[WitTag('Version',5,data=np.array([8],dtype='<i4')),WitTag('Data',0,children=data)])
    return write_bytes(b'WIT_PR06',root)

class SafetyTests(unittest.TestCase):
    def test_duplicate_names_preserve_ids_and_order(self):
        with temporary() as folder:
            path=Path(folder)/'source.wip';path.write_bytes(synthetic())
            session=ProjectSession(path);inventory=session.inventory()
            self.assertEqual([o['id'] for o in inventory['objects']],['1','2'])
            self.assertEqual([o['name'] for o in inventory['objects']],['Same name','Same name'])
            self.assertTrue(all(not o['importable'] for o in inventory['objects']))
            path.write_bytes(path.read_bytes()+b'changed')
            with self.assertRaisesRegex(ValueError,'changed'):session.check_source()

    def test_corrupt_header_and_offsets(self):
        with temporary() as folder:
            path=Path(folder)/'bad.wip'
            for content in [b'not wip',synthetic()[:30],synthetic()[:8]+struct.pack('<I',0xffffffff)+synthetic()[12:]]:
                path.write_bytes(content)
                with self.assertRaises(ValueError):read_bounded(path)

    def test_desktop_origin_and_missing_session(self):
        app=FastAPI();app.include_router(router)
        with TestClient(app,base_url='http://127.0.0.1:8888') as client:
            body={'session':'0'*32,'object_id':'1'}
            for origin in [None,'https://example.com','https://phd-nexusv3.vercel.app']:
                headers={'Origin':origin} if origin else {}
                self.assertEqual(client.post('/api/wip/metadata',json=body,headers=headers).status_code,403)
            response=client.post('/api/wip/metadata',json=body,headers={'Origin':'http://localhost:3000'})
            self.assertEqual(response.status_code,422)

class ReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        explicit=os.environ.get('WIP_TEST_FILE')
        cls.path=Path(explicit) if explicit else next((ROOT/'Reference').glob('*.wip'),None)
        if cls.path is None:raise unittest.SkipTest('Private WIP fixture is not present')
        with cls.path.open('rb') as source:cls.before=hashlib.file_digest(source,'sha256').hexdigest()
        cls.session=ProjectSession(cls.path)
        cls.inventory=cls.session.inventory()

    @classmethod
    def tearDownClass(cls):
        with cls.path.open('rb') as source:after=hashlib.file_digest(source,'sha256').hexdigest()
        assert after==cls.before,'The original WIP changed during testing'

    def test_metadata_and_auxiliary_classification(self):
        objects=self.inventory['objects']
        self.assertEqual(len(objects),len(self.session.project.data))
        self.assertTrue(any(o['kind']=='raman' for o in objects))
        for obj in objects:
            if 'Elapsed Time' in obj['name']:self.assertFalse(obj['importable'])
            if obj['kind']=='raman':self.assertEqual(obj['axis']['unit'],'rel. 1/cm')
        ids=[str(e.id) for e in self.session.project.data]
        self.assertEqual([o['id'] for o in objects],ids)
        item=next(o for o in objects if o['kind']=='raman')
        details=self.session.details(item['id'])
        self.assertEqual(details['metadata'],self.session.describe(self.session.entries[item['id']],0)['metadata'])
        self.assertIn('structural_metadata',details)
        self.assertIn('field_sources',details)

    def test_all_raman_values_axes_dtype_and_retry(self):
        with temporary() as vault:
            metadata={'group_id':'11111111-1111-1111-1111-111111111111','sample_id':'22222222-2222-2222-2222-222222222222',
                'sample_code':'TEST','sample_name':'Validation','logbook_name':'WIP Validation','technique':'Raman','parameters':{'integration_time_s':'reviewed'}}
            count=0
            for item in self.inventory['objects']:
                if item['kind']!='raman' or not item['importable']:continue
                entry=self.session.entries[item['id']];cube=entry.array();axis,unit=entry.x_axis('rel. 1/cm')
                result=self.session.extract(item['id'],[],metadata,vault)
                with h5py.File(Path(vault)/result['h5_relative_path'],'r') as archive:
                    stored=archive['spectrum/intensities']
                    self.assertEqual(stored.dtype,cube.dtype)
                    self.assertEqual(stored.shape,(cube.shape[0]*cube.shape[1],cube.shape[2]))
                    reverse=axis[0]>axis[-1]
                    np.testing.assert_array_equal(archive['spectrum/wavenumbers'][:],axis[::-1] if reverse else axis)
                    for y in range(cube.shape[1]):
                        np.testing.assert_array_equal(stored[y*cube.shape[0]:(y+1)*cube.shape[0]],cube[:,y,::-1] if reverse else cube[:,y,:])
                    provenance=json.loads(archive.attrs['wip_provenance'])
                    self.assertEqual(provenance['original_metadata'],item['metadata'])
                    self.assertEqual(provenance['reviewed_metadata'],metadata['parameters'])
                    self.assertEqual(provenance['source_hash'],self.before)
                repeated=self.session.extract(item['id'],[],metadata,vault)
                self.assertEqual(result['record_id'],repeated['record_id'])
                self.assertEqual(result['h5_relative_path'],repeated['h5_relative_path'])
                count+=1
            print(f'Validated {count} Raman objects against source decoder arrays; no vendor TXT comparison claimed')

    def test_image_previews(self):
        import base64,io
        from PIL import Image
        for item in self.inventory['objects']:
            if item['kind']!='image' or not item['importable']:continue
            result=self.session.preview(item['id'])
            image=Image.open(io.BytesIO(base64.b64decode(result['image'])))
            self.assertLessEqual(image.width,640);self.assertLessEqual(image.height,480)

    def test_combined_raman_and_image_provenance(self):
        measurement=next(o for o in self.inventory['objects'] if o['kind']=='raman' and o['importable'])
        image=next(o for o in self.inventory['objects'] if o['kind']=='image' and o['importable'])
        settings={'group_id':'11111111-1111-1111-1111-111111111111','sample_id':'22222222-2222-2222-2222-222222222222',
            'sample_code':'TEST','sample_name':'Combined','logbook_name':'WIP Validation','technique':'Raman','parameters':{},
            'image_parameters':{image['id']:{'objective_magnification':'reviewed'}}}
        with temporary() as vault:
            result=self.session.extract(measurement['id'],[image['id']],settings,vault)
            self.assertEqual(len(result['attached_images']),1)
            attached=result['provenance']['attached_image_metadata'][0]
            self.assertEqual(attached['original_metadata'],image['metadata'])
            self.assertEqual(attached['reviewed_metadata'],settings['image_parameters'][image['id']])
            self.assertIn('structural_metadata',attached)
            self.assertIn('raw_acquisition_parameters',attached)
            self.assertEqual(result['provenance']['axis'],measurement['axis'])
            with h5py.File(Path(vault)/result['h5_relative_path'],'r') as archive:
                stored=json.loads(archive.attrs['wip_provenance'])
                self.assertEqual(stored['attached_image_metadata'],result['provenance']['attached_image_metadata'])

    def test_annotation_settings_source_path_and_original_image(self):
        from readers.wip_spatial import overlay
        from PIL import Image
        objects=self.inventory['objects'];pair=None
        for image in objects:
            if image['kind']!='image' or not image['importable'] or not image['spatial_geometry']['valid']:continue
            for measurement in objects:
                if measurement['kind']!='raman' or not measurement['spatial_geometry']['valid']:continue
                try:polygon=overlay(image['spatial_geometry'],measurement['spatial_geometry'])['polygon']
                except ValueError:continue
                if all(0<=x<=image['shape'][0] and 0<=y<=image['shape'][1] for x,y in polygon):pair=(measurement,image);break
            if pair:break
        self.assertIsNotNone(pair)
        measurement,image=pair
        settings={'group_id':'11111111-1111-1111-1111-111111111111','sample_id':'22222222-2222-2222-2222-222222222222',
            'sample_code':'TEST','sample_name':'Annotations','logbook_name':'WIP Validation','technique':'Raman','parameters':{},
            'image_annotations':{image['id']:{'map_ids':[measurement['id']],'scale_um':40,'show_grid':True}}}
        with temporary() as vault:
            result=self.session.extract(measurement['id'],[image['id']],settings,vault)
            attached=result['provenance']['attached_image_metadata'][0]
            self.assertEqual(result['provenance']['source_file_path'],str(self.path))
            self.assertEqual(attached['annotation']['map_ids'],[measurement['id']])
            self.assertEqual(attached['annotation']['scale_um'],40)
            self.assertTrue(attached['annotation']['show_grid'])
            self.assertEqual(len(attached['annotation']['maps']),1)
            self.assertEqual(result['attached_images'],[attached['annotated_path']])
            original=np.transpose(self.session.entry(image['id']).array(),(1,0,2))
            np.testing.assert_array_equal(np.asarray(Image.open(Path(vault)/attached['path'])),original)
            self.assertFalse(np.array_equal(np.asarray(Image.open(Path(vault)/attached['annotated_path'])),original))
            repeated=self.session.extract(measurement['id'],[image['id']],settings,vault)
            self.assertEqual(result['record_id'],repeated['record_id'])
            settings['image_annotations'][image['id']]={'map_ids':[],'scale_um':0,'show_grid':False}
            hidden=self.session.extract(measurement['id'],[image['id']],settings,vault)
            self.assertNotEqual(result['record_id'],hidden['record_id'])
            hidden_image=hidden['provenance']['attached_image_metadata'][0]
            self.assertEqual(hidden_image['path'],hidden_image['annotated_path'])
            self.assertEqual(hidden_image['annotation']['map_ids'],[])

if __name__=='__main__':unittest.main(verbosity=2)

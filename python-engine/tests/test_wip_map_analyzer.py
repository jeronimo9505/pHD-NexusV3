"""Exercise real WIP extraction through the same local endpoints used by the analyzer."""
from pathlib import Path
import sys
import unittest
import shutil
import hashlib
import numpy as np
import h5py
from fastapi.testclient import TestClient
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_wip_import import temporary,ROOT
from readers.wip_project import ProjectSession
from main import app

class WipAnalyzerTests(unittest.TestCase):
    def test_metadata_geometry_heatmap_and_spectrum_ignore_misleading_filename(self):
        fixture=next((ROOT/'Reference').glob('*.wip'),None)
        if fixture is None:self.skipTest('Private WIP example absent')
        with fixture.open('rb') as stream:before=hashlib.file_digest(stream,'sha256').hexdigest()
        session=ProjectSession(fixture)
        item=next(obj for obj in session.inventory()['objects'] if obj['kind']=='raman' and obj['importable'] and obj['shape'][0]>1)
        group='11111111-1111-1111-1111-111111111111'
        metadata={'group_id':group,'sample_id':'22222222-2222-2222-2222-222222222222','sample_code':'A23-c3','sample_name':'Graphene','logbook_name':'Test','technique':'Raman',
            'parameters':{'laser_wavelength_nm':'632.7999877929688','power':'500','unit:power':'uW','spots':f"{item['shape'][0]}x{item['shape'][1]}",'size':'200x200'}}
        with temporary() as folder:
            root=Path(folder);result=session.extract(item['id'],[],metadata,folder)
            original=root/result['h5_relative_path'];renamed=original.with_name('WRONG_RAMAN_999nm_Spot1.h5');original.rename(renamed)
            relative=renamed.relative_to(root).as_posix()
            hidden=root/'.phdnexus-recovery'/'hidden.h5';hidden.parent.mkdir();shutil.copyfile(renamed,hidden)
            with h5py.File(renamed,'r') as data:
                values=data['spectrum/intensities'][:];axis=data['spectrum/wavenumbers'][:]
            with TestClient(app,base_url='http://127.0.0.1:8888') as client:
                files=client.get('/api/vault-files',params={'vault_root':folder}).json()['files']
                self.assertEqual(len(files),1,'Recovery copies must not appear as active maps')
                info=files[0];self.assertEqual(info['sample_code'],'A23-c3');self.assertIn('632.799987',info['parameters']['Laser'])
                self.assertEqual(info['map_width'],item['shape'][0]);self.assertEqual(info['map_height'],item['shape'][1])
                body={'vault_root':folder,'group_id':group,'paths':[relative]}
                fresh=client.post('/api/vault-assets/workspace-metadata',json=body,headers={'Origin':'http://localhost:3000'})
                self.assertEqual(fresh.status_code,200,fresh.text);self.assertEqual(fresh.json()['files'][0]['parameters']['Size'],'200x200 um')
                self.assertEqual(client.post('/api/vault-assets/workspace-metadata',json=body,headers={'Origin':'https://example.com'}).status_code,403)
                heat=client.post('/api/map/heatmap',json={'vault_root':folder,'h5_relative_path':relative}).json()
                np.testing.assert_allclose(heat['heatmap'],np.sum(values,axis=1));self.assertEqual(heat['n_spectra'],values.shape[0])
                spectrum=client.post('/api/map/spectrum',json={'vault_root':folder,'h5_relative_path':relative,'spectrum_index':1}).json()['data']
                np.testing.assert_array_equal([point['x'] for point in spectrum],axis)
                np.testing.assert_array_equal([point['y'] for point in spectrum],values[1])
        with fixture.open('rb') as stream:self.assertEqual(hashlib.file_digest(stream,'sha256').hexdigest(),before)

if __name__=='__main__':unittest.main(verbosity=2)

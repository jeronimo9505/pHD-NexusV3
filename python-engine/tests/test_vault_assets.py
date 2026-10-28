from pathlib import Path
import sys
import uuid
import json
import numpy as np
import h5py
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_wip_import import temporary
from processor import convert_to_h5,_build_h5_filename
from vault_naming import measurement_filename
from vault_assets import describe,audit,quarantine,restore,rename_prepare,rename_finish,resolve_paths

GROUP='11111111-1111-1111-1111-111111111111'
def metadata():return {'group_id':GROUP,'sample_id':'22222222-2222-2222-2222-222222222222','sample_code':'A24','sample_name':'Grid','logbook_name':'SERS','technique':'Raman',
    'parameters':{'Laser':'632.7999877929688 nm','Power':'500 µW','Objective':'50 x','Acquisition Time':'0.5 s','Accumulations':'1 ac','Spots':'50x50 ixj','Size':'50x50 µm'}}

class VaultTests(unittest.TestCase):
    def create(self,root):return convert_to_h5(np.arange(10,dtype=float),np.arange(20,dtype=float).reshape(2,10),metadata(),str(root))
    def test_manual_and_wip_parameters_use_one_name_and_spots(self):
        with temporary() as directory:
            root=Path(directory);first,relative=self.create(root);second,_=self.create(root)
            self.assertIn('632.8nm_500uW_50x_0.5s_1ac_',first.name)
            self.assertIn('_Spot1.h5',first.name);self.assertIn('_Spot2.h5',second.name)
            wip={**metadata(),'parameters':{'laser_wavelength_nm':'632.7999877929688','power':'500','unit:power':'µW','objective_magnification':'50','integration_time_s':'0.5','accumulations':'1','spots':'50x50','size':'50x50'}}
            self.assertEqual(measurement_filename(wip,first.parent,spot=1,exclude=first),first.name)
            description=describe(str(root),[relative],GROUP)['assets'][0]
            self.assertEqual(description['spectrum']['spectra'],2);self.assertEqual(description['locator']['relative_path'],relative)
    def test_rename_failure_keeps_old_links_and_rollback_preserves_values(self):
        with temporary() as directory:
            root=Path(directory);original,relative=self.create(root)
            changed={**metadata(),'parameters':{**metadata()['parameters'],'Power':'0.8 mW'}}
            staged=rename_prepare(str(root),[relative],changed,[])
            self.assertTrue(original.is_file(),'old references must keep working until DB confirms')
            new=root/staged['renamed_paths'][relative];self.assertTrue(new.is_file())
            rename_finish(str(root),staged['operation_id'],False,[])
            self.assertTrue(original.exists());self.assertFalse(new.exists())
            with h5py.File(original,'r') as file:np.testing.assert_array_equal(file['spectrum/intensities'][:],np.arange(20).reshape(2,10))
    def test_commit_and_delete_are_recoverable_and_shared_paths_are_kept(self):
        with temporary() as directory:
            root=Path(directory);old,relative=self.create(root)
            staged=rename_prepare(str(root),[relative],{**metadata(),'parameters':{'Laser':'633 nm','Power':'1 mW'}},[])
            rename_finish(str(root),staged['operation_id'],True,[relative])
            self.assertTrue(old.exists(),'another record/workspace still references the source')
            new_relative=staged['renamed_paths'][relative];operation=str(uuid.uuid4())
            receipt=quarantine(str(root),operation,[new_relative],[],GROUP)
            self.assertFalse((root/new_relative).exists());self.assertEqual(len(receipt['files']),1)
            restore(str(root),operation,receipt);self.assertTrue((root/new_relative).exists())
    def test_orphan_detection_and_portable_suffix_resolution(self):
        with temporary() as directory:
            root=Path(directory);file,relative=self.create(root)
            self.assertFalse(audit(str(root),[],GROUP)['assets'][0]['linked'])
            legacy='D:/OtherComputer/SyncedVault/'+relative
            self.assertEqual(resolve_paths(str(root),[legacy])['mapping'][legacy],relative)
            self.assertTrue(audit(str(root),[legacy],GROUP)['assets'][0]['linked'])
            with self.assertRaises(ValueError):resolve_paths(str(root),['../outside.h5'])
            receipt=quarantine(str(root),str(uuid.uuid4()),[relative],[legacy],GROUP)
            self.assertTrue(file.exists());self.assertIn(relative,receipt['retained'])
    def test_workspace_child_keeps_parent_and_wip_source_is_never_removed(self):
        with temporary() as directory:
            root=Path(directory);file,relative=self.create(root);child=file.with_name('Derived.h5')
            with h5py.File(child,'w') as data:data.attrs['group_id']=GROUP;data.attrs['parent_file']=relative
            self.assertTrue(next(asset for asset in audit(str(root),[child.relative_to(root).as_posix()],GROUP)['assets'] if asset['locator']['relative_path']==relative)['linked'])
            receipt=quarantine(str(root),str(uuid.uuid4()),[relative],[child.relative_to(root).as_posix()],GROUP)
            self.assertTrue(file.exists());self.assertIn(relative,receipt['retained'])
            source=root/'Project.wip';source.write_bytes(b'unchanged')
            receipt=quarantine(str(root),str(uuid.uuid4()),['Project.wip'],[],GROUP)
            self.assertTrue(source.exists());self.assertTrue(receipt['errors'])

if __name__=='__main__':unittest.main(verbosity=2)

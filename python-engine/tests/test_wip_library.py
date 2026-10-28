from pathlib import Path
import shutil
import sys
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_wip_import import synthetic,temporary,ROOT
from wip_library import initialize,register,list_projects,record_import,locate,inspect_managed,digest
from readers.wip_project import close_session,get_session

class LibraryTests(unittest.TestCase):
    def setup_files(self,folder):
        base=Path(folder).resolve();base.relative_to((ROOT/'scratch/test_vault').resolve())
        source=base/'project.wip';source.write_bytes(synthetic())
        root=initialize(str(base))['library_root']
        return base,source,root

    def test_move_verify_duplicate_and_locate(self):
        with temporary() as folder:
            base,source,root=self.setup_files(folder);original=digest(source)
            stored=register(root,str(source))
            self.assertTrue(stored['moved']);self.assertFalse(source.exists())
            self.assertEqual(digest(Path(stored['managed_path'])),original)
            duplicate=base/'renamed.wip';duplicate.write_bytes(synthetic())
            repeated=register(root,str(duplicate))
            self.assertTrue(repeated['duplicate']);self.assertTrue(duplicate.exists())
            self.assertEqual(stored['managed_path'],repeated['managed_path'])
            self.assertEqual(len(list_projects(root,'group')['projects']),1)
            self.assertEqual(locate(root,original,str(source))['path'],stored['managed_path'])
            opened=inspect_managed(root,original)
            self.assertEqual(opened['library']['original_paths'][0],str(source))
            close_session(opened['session'])

    def test_same_name_different_content_and_group_history(self):
        with temporary() as folder:
            base,source,root=self.setup_files(folder);first=register(root,str(source))
            source.write_bytes(synthetic().replace(b'Same name',b'Else name'));second=register(root,str(source))
            self.assertNotEqual(first['managed_path'],second['managed_path'])
            self.assertEqual(len(list_projects(root,'group')['projects']),2)
            record_import(root,'group','record',first['sha256'],'sample',['1','2','1'])
            counts={p['sha256']:p['imported_objects'] for p in list_projects(root,'group')['projects']}
            self.assertEqual(counts[first['sha256']],2)
            self.assertTrue(all(p['imported_objects']==0 for p in list_projects(root,'other')['projects']))

    def test_corrupt_and_failed_copy_keep_original(self):
        with temporary() as folder:
            base,source,root=self.setup_files(folder)
            with patch('wip_library.shutil.copyfileobj',side_effect=OSError('Disk full')):
                with self.assertRaises(OSError):register(root,str(source))
            self.assertEqual(source.read_bytes(),synthetic())
            self.assertEqual(list_projects(root,'group')['projects'],[])
            source.write_bytes(b'broken WIP')
            with self.assertRaises(ValueError):register(root,str(source))
            self.assertEqual(source.read_bytes(),b'broken WIP')

    def test_concurrent_registration_stores_one_copy(self):
        with temporary() as folder:
            base,source,root=self.setup_files(folder);other=base/'other.wip';other.write_bytes(synthetic())
            with ThreadPoolExecutor(max_workers=2) as pool:
                results=list(pool.map(lambda path:register(root,str(path)),[source,other]))
            self.assertEqual(sum(result['moved'] for result in results),1)
            self.assertEqual(sum(result['duplicate'] for result in results),1)
            self.assertEqual(len(list_projects(root,'group')['projects']),1)

    def test_library_file_change_is_detected(self):
        with temporary() as folder:
            base,source,root=self.setup_files(folder);stored=register(root,str(source))
            Path(stored['managed_path']).write_bytes(synthetic().replace(b'Same name',b'Else name'))
            with self.assertRaisesRegex(ValueError,'missing or changed'):inspect_managed(root,stored['sha256'])

    def test_missing_library_copy_can_be_reconnected(self):
        with temporary() as folder:
            base,source,root=self.setup_files(folder);stored=register(root,str(source))
            recovered=base/'recovered.wip';Path(stored['managed_path']).rename(recovered)
            restored=register(root,str(recovered))
            self.assertTrue(restored['duplicate']);self.assertTrue(recovered.exists())
            self.assertEqual(restored['managed_path'],stored['managed_path'])
            self.assertTrue(list_projects(root,'group')['projects'][0]['available'])

    def test_real_memory_mapped_project_moves_only_test_copy(self):
        fixture=next((ROOT/'Reference').glob('*.wip'),None)
        if fixture is None:self.skipTest('Private WIP fixture is absent')
        before=digest(fixture)
        with temporary() as folder:
            base,source,root=self.setup_files(folder)
            shutil.copyfile(fixture,source)
            stored=register(root,str(source))
            self.assertTrue(stored['moved'],stored['message'])
            self.assertEqual(stored['sha256'],before)
            self.assertFalse(source.exists())
            opened=inspect_managed(root,stored['sha256']);active=get_session(opened['session'])
            measurement=next(obj for obj in opened['objects'] if obj['kind']=='raman' and obj['importable'])
            vault=base/'vault';vault.mkdir()
            extracted=active.extract(measurement['id'],[],{'group_id':'11111111-1111-1111-1111-111111111111','sample_id':'22222222-2222-2222-2222-222222222222',
                'sample_code':'TEST','sample_name':'Library','logbook_name':'WIP Validation','technique':'Raman','parameters':{}},str(vault))
            self.assertEqual(extracted['provenance']['source_file_path'],stored['managed_path'])
            self.assertEqual(extracted['provenance']['original_source_file_path'],str(source))
            self.assertEqual(extracted['provenance']['library']['library_root'],root)
            close_session(opened['session']);del active
            import gc;gc.collect()
        self.assertEqual(digest(fixture),before)

if __name__=='__main__':unittest.main(verbosity=2)

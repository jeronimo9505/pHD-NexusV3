"""Local, content-addressed WITec library. No source removal before verified storage."""
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime, timezone
import gc
import hashlib
import json
import os
import shutil
import sqlite3
import uuid

INDEX='.phdnexus-witec.sqlite3'

def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def checked_root(value):
    root=Path(value).resolve(strict=True)
    if not root.is_dir() or not (root/INDEX).is_file():raise ValueError('Configure the WITec project library in Local Desktop Settings first')
    return root

@contextmanager
def connection(root):
    database=sqlite3.connect(root/INDEX,timeout=120)
    database.row_factory=sqlite3.Row
    try:
        database.execute('PRAGMA foreign_keys=ON')
        yield database
        database.commit()
    except BaseException:
        database.rollback();raise
    finally:database.close()

def initialize(parent):
    parent=Path(parent).resolve(strict=True)
    if not parent.is_dir():raise ValueError('Choose an existing parent folder')
    root=parent if parent.name.lower()=='witec projects' or (parent/INDEX).is_file() else parent/'WITec Projects'
    root=root.resolve();root.relative_to(parent);root.mkdir(exist_ok=True)
    with connection(root) as db:
        db.executescript('''CREATE TABLE IF NOT EXISTS projects(
            sha256 TEXT PRIMARY KEY,name TEXT NOT NULL,relative_path TEXT NOT NULL UNIQUE,
            size INTEGER NOT NULL,objects INTEGER NOT NULL,created_at TEXT NOT NULL,original_paths TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS imports(
            group_id TEXT NOT NULL,record_id TEXT NOT NULL,source_hash TEXT NOT NULL,sample_id TEXT NOT NULL,
            object_ids TEXT NOT NULL,PRIMARY KEY(group_id,record_id),FOREIGN KEY(source_hash) REFERENCES projects(sha256));''')
    return {'library_root':str(root),'capabilities':['managed_wip_library_v1']}

def project_path(root,row):
    path=(root/row['relative_path']).resolve()
    path.relative_to(root)
    if path.suffix.lower()!='.wip':raise ValueError('Invalid project path in library index')
    return path

def list_projects(library_root,group_id):
    root=checked_root(library_root)
    with connection(root) as db:
        rows=db.execute('SELECT * FROM projects ORDER BY created_at DESC').fetchall()
        imports=db.execute('SELECT source_hash,object_ids FROM imports WHERE group_id=?',(group_id,)).fetchall()
        imported={}
        for row in imports:imported.setdefault(row['source_hash'],set()).update(json.loads(row['object_ids']))
        return {'library_root':str(root),'projects':[dict(row,managed_path=str(project_path(root,row)),
            available=project_path(root,row).is_file(),imported_objects=len(imported.get(row['sha256'],set())),
            original_paths=json.loads(row['original_paths'])) for row in rows]}

def register(library_root,file_path):
    from readers.wip_project import ProjectSession
    root=checked_root(library_root);selected=Path(file_path)
    if selected.is_symlink():raise ValueError('Choose the original WIP file rather than a symbolic link')
    source=selected.resolve(strict=True)
    if source.suffix.lower()!='.wip' or not source.is_file():raise ValueError('Choose a regular WIP project')
    # Validate the complete bounded structure before relocating anything.
    session=ProjectSession(source);inventory=session.inventory();source_hash=session.sha256
    stat=source.stat();original=str(source)
    count=sum(1 for obj in inventory['objects'] if obj['importable'])
    del session;gc.collect()  # release WITec memory maps before a Windows move
    with connection(root) as db:
        db.execute('BEGIN IMMEDIATE')
        existing=db.execute('SELECT * FROM projects WHERE sha256=?',(source_hash,)).fetchone()
        if existing:
            target=project_path(root,existing)
            restored=False
            if target.exists() and (not target.is_file() or digest(target)!=source_hash):raise ValueError('The indexed library copy changed. It was not overwritten; register that version separately first.')
            if not target.exists():
                target.parent.mkdir(parents=True,exist_ok=True)
                temporary=target.with_suffix(f'.{uuid.uuid4().hex}.tmp')
                try:
                    with source.open('rb') as incoming,temporary.open('xb') as outgoing:
                        shutil.copyfileobj(incoming,outgoing,1024*1024);outgoing.flush();os.fsync(outgoing.fileno())
                    if digest(temporary)!=source_hash:raise ValueError('Restored copy verification failed; the selected file was kept')
                    current=source.stat()
                    if (current.st_ino,current.st_size,current.st_mtime_ns)!=(stat.st_ino,stat.st_size,stat.st_mtime_ns):raise ValueError('The source changed during restoration; it was kept')
                    temporary.replace(target);restored=True
                finally:temporary.unlink(missing_ok=True)
            locations=list(dict.fromkeys(json.loads(existing['original_paths'])+[original]))
            db.execute('UPDATE projects SET original_paths=? WHERE sha256=?',(json.dumps(locations),source_hash))
            return {'sha256':source_hash,'managed_path':str(target),'duplicate':True,'moved':False,
                'original_path':original,'message':'Library copy restored; the selected copy was kept.' if restored else 'Already in the library. The existing project was opened; the selected copy was kept.'}
        directory=(root/'Projects'/source_hash).resolve();directory.relative_to(root)
        directory.mkdir(parents=True,exist_ok=True)
        target=(directory/source.name).resolve();target.relative_to(directory)
        temporary=directory/f'.{uuid.uuid4().hex}.tmp'
        try:
            if target.exists():
                if digest(target)!=source_hash:raise ValueError('A different file occupies the library destination; nothing was overwritten')
            else:
                with source.open('rb') as incoming,temporary.open('xb') as outgoing:
                    shutil.copyfileobj(incoming,outgoing,1024*1024);outgoing.flush();os.fsync(outgoing.fileno())
                if digest(temporary)!=source_hash:raise ValueError('Library copy verification failed; the original file was kept')
                current=source.stat()
                if (current.st_ino,current.st_size,current.st_mtime_ns)!=(stat.st_ino,stat.st_size,stat.st_mtime_ns):raise ValueError('The source changed while copying; the original file was kept')
                temporary.replace(target)
            db.execute('INSERT INTO projects VALUES(?,?,?,?,?,?,?)',(source_hash,source.name,target.relative_to(root).as_posix(),
                stat.st_size,count,datetime.now(timezone.utc).isoformat(),json.dumps([original])))
        finally:temporary.unlink(missing_ok=True)
    # The verified destination and index are committed before removing the original.
    moved=False;message='Project stored in the WITec library.'
    if source!=target:
        try:
            current=source.stat()
            if (current.st_ino,current.st_size,current.st_mtime_ns)!=(stat.st_ino,stat.st_size,stat.st_mtime_ns):
                raise OSError('Source changed after verification')
            if digest(target)!=source_hash:raise OSError('Stored copy changed before finalizing the move')
            source.unlink();moved=True
        except OSError:message='Verified library copy saved. The original could not be removed and was kept (it may be open in WITec).'
    return {'sha256':source_hash,'managed_path':str(target),'duplicate':False,'moved':moved,'original_path':original,'message':message}

def inspect_managed(library_root,source_hash):
    from readers.wip_project import inspect_project,get_session
    root=checked_root(library_root)
    with connection(root) as db:row=db.execute('SELECT * FROM projects WHERE sha256=?',(source_hash,)).fetchone()
    if row is None:raise ValueError('Project is not registered in this library')
    path=project_path(root,row)
    if not path.is_file() or digest(path)!=source_hash:raise ValueError('The library file is missing or changed. Use Open .wip to register the current version.')
    result=inspect_project(str(path))
    with connection(root) as db:db.execute('UPDATE projects SET objects=? WHERE sha256=?',(sum(1 for obj in result['objects'] if obj['importable']),source_hash))
    trace={'library_root':str(root),'managed_path':str(path),'original_paths':json.loads(row['original_paths'])}
    get_session(result['session']).library_trace=trace
    result['library']=trace
    return result

def record_import(library_root,group_id,record_id,source_hash,sample_id,object_ids):
    root=checked_root(library_root)
    with connection(root) as db:
        db.execute('INSERT OR IGNORE INTO imports VALUES(?,?,?,?,?)',(group_id,record_id,source_hash,sample_id,json.dumps(sorted(set(object_ids)))))
    return {'recorded':True}

def locate(library_root,source_hash,original_path):
    if library_root:
        try:
            root=checked_root(library_root)
            with connection(root) as db:row=db.execute('SELECT * FROM projects WHERE sha256=?',(source_hash,)).fetchone()
            if row:
                path=project_path(root,row)
                if path.is_file() and digest(path)==source_hash:return {'path':str(path),'folder':str(path.parent),'managed':True}
        except (OSError,ValueError,sqlite3.Error):pass
    if original_path:
        try:
            path=Path(original_path).resolve(strict=True)
            if path.suffix.lower()=='.wip' and path.is_file() and digest(path)==source_hash:
                return {'path':str(path),'folder':str(path.parent),'managed':False}
        except OSError:pass
    raise ValueError('The original WIP could not be located. Add the same project to your WITec library to reconnect it by content hash.')

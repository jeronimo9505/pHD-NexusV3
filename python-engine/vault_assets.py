"""Shared local asset operations; paths are portable, cleanup is recoverable."""
from pathlib import Path,PureWindowsPath
import ast
import hashlib
import json
import os
import shutil
import uuid
import re
import math
import h5py
from vault_naming import parameters,measurement_filename

EXTENSIONS={'.h5','.hdf5','.png','.jpg','.jpeg','.bmp'}

def json_safe(value):
    if isinstance(value,float) and not math.isfinite(value):return None
    if isinstance(value,dict):return {str(key):json_safe(item) for key,item in value.items()}
    if isinstance(value,(list,tuple)):return [json_safe(item) for item in value]
    return value

def root_path(value):
    root=Path(value).resolve(strict=True)
    if not root.is_dir():raise ValueError('Choose an existing Data Vault root')
    return root

def bounded(root,relative,recovery=False):
    text=str(relative).replace('\\','/')
    if PureWindowsPath(text).drive or text.startswith('/') or '..' in Path(text).parts:raise ValueError('Use a path relative to the configured vault root')
    path=(root/text).resolve();path.relative_to(root)
    if path.suffix.lower() not in EXTENSIONS:raise ValueError('Only measurement assets can be managed here; WIP source projects are retained')
    if not recovery and any(part.startswith('.') for part in Path(text).parts):raise ValueError('Recovery files are not active measurement files')
    return path

def portable(root,value):
    """Reconnect a historical absolute path by its suffix inside the selected root only."""
    text=str(value).replace('\\','/')
    if not PureWindowsPath(text).drive and not text.startswith('/'):return bounded(root,text)
    parts=[part for part in text.split('/') if part and not part.endswith(':')]
    candidates=[]
    for count in range(min(len(parts),8),1,-1):
        candidate=bounded(root,'/'.join(parts[-count:]))
        if candidate.is_file() and candidate not in candidates:candidates.append(candidate)
    if len(candidates)!=1:raise ValueError('Select the synced vault root that contains the same folder structure; the old path could not be uniquely reconnected')
    return candidates[0]

def resolve_paths(vault_root,paths):
    root=root_path(vault_root)
    return {'mapping':{value:portable(root,value).relative_to(root).as_posix() for value in paths}}

def sha(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def parsed(value,default=None):
    if isinstance(value,bytes):value=value.decode('utf-8')
    if not isinstance(value,str):return value.tolist() if hasattr(value,'tolist') else value
    if len(value)>4000000:raise ValueError('Asset metadata exceeds the supported limit')
    try:return json.loads(value)
    except ValueError:
        try:return ast.literal_eval(value)
        except (ValueError,SyntaxError):return value if default is None else default

def describe_one(root,relative,group_id):
    path=bounded(root,relative)
    if not path.is_file():raise ValueError(f'Asset not found under the selected root: {relative}')
    checksum=sha(path);attrs={};provenance=None;spectrum=None
    if path.suffix.lower() in ('.h5','.hdf5'):
        with h5py.File(path,'r') as file:
            attrs=json_safe({str(key):parsed(value) for key,value in file.attrs.items() if key not in ('asset_manifest','raman_drive_sync')})
            if attrs.get('group_id') and str(attrs['group_id'])!=str(group_id):raise ValueError('This asset belongs to another group')
            provenance=attrs.get('wip_provenance')
            if 'spectrum' in file:
                x=file['spectrum/wavenumbers'];y=file['spectrum/intensities']
                spectrum=json_safe({'points':int(x.size),'spectra':int(y.shape[0]) if y.ndim>1 else 1,
                    'range':[float(x[0]),float(x[-1])],'unit':'cm^-1',
                    'grid':{'x':attrs.get('map_width'),'y':attrs.get('map_height')}})
    parent=attrs.get('parent_file')
    return {'id':str(attrs.get('phdnexus_asset_id') or uuid.uuid5(uuid.NAMESPACE_URL,str(group_id)+':'+checksum)),
        'kind':'derived_hdf5' if parent else 'raman_hdf5' if spectrum else 'image' if path.suffix.lower() not in ('.h5','.hdf5') else 'archive',
        'locator':{'root':'data_vault','relative_path':path.relative_to(root).as_posix()},'sha256':checksum,'size':path.stat().st_size,
        'spectrum':spectrum,'parent_locator':{'root':'data_vault','relative_path':parent} if parent else None,
        'metadata':attrs,'wip_import':provenance}

def describe(vault_root,paths,group_id):
    root=root_path(vault_root)
    return {'version':1,'assets':[describe_one(root,path,group_id) for path in dict.fromkeys(paths)]}

def audit(vault_root,referenced_paths,group_id):
    root=root_path(vault_root);linked=set();assets=[];errors=[]
    for value in referenced_paths:
        try:linked.add(portable(root,value).relative_to(root).as_posix())
        except ValueError:continue
    # A referenced derived result also keeps its acquisition ancestors linked.
    links=parent_links(root,group_id)
    while True:
        additions={parent for child,parent in links.items() if child in linked}-linked
        if not additions:break
        linked.update(additions)
    for directory,folders,files in os.walk(root):
        folders[:]=[folder for folder in folders if not folder.startswith('.')]
        if (Path(directory)/'.phdnexus-witec.sqlite3').exists():folders[:]=[];continue
        for name in files:
            path=Path(directory)/name
            if path.suffix.lower() not in ('.h5','.hdf5'):continue
            if len(assets)>=10000:raise ValueError('Narrow the vault to fewer than 10,000 HDF5 files')
            try:
                item=describe_one(root,path.relative_to(root).as_posix(),group_id)
                if str(item['metadata'].get('group_id',''))!=str(group_id):continue
                item['linked']=item['locator']['relative_path'] in linked
                meta=item['metadata'];item['suggested_name']=measurement_filename(meta,path.parent,spot=1,exclude=path)
                item['recovery_data']=recovery_data(item)
                assets.append(item)
            except (OSError,ValueError,KeyError) as error:errors.append({'path':path.relative_to(root).as_posix(),'error':str(error)})
    return {'assets':assets,'errors':errors}

def recovery_data(asset):
    meta=asset['metadata'];wip=asset['wip_import'];params=parameters(meta)
    if isinstance(wip,dict):params=parameters({'parameters':wip.get('reviewed_parameters') or wip.get('reviewed_metadata',{})}) or params
    relative=asset['locator']['relative_path']
    data={**params,'__order__':list(params),'equipment':meta.get('equipment','WITec' if wip else ''),
        'local_h5_paths':[relative],'file_metadata':{relative:asset['spectrum'] or {}},
        'asset_manifest':{'version':1,'assets':[asset_without_metadata(asset)]}}
    if not asset['spectrum']:data.pop('local_h5_paths',None);data.pop('file_metadata',None)
    if isinstance(wip,dict):
        data['wip_import']=wip;data['wip_archive_path']=relative
        data['attached_images']=[image.get('annotated_path') or image['path'] for image in wip.get('attached_image_metadata',[])]
    return data

def parent_links(root,group_id):
    links={}
    for directory,folders,files in os.walk(root):
        folders[:]=[folder for folder in folders if not folder.startswith('.')]
        if (Path(directory)/'.phdnexus-witec.sqlite3').exists():folders[:]=[];continue
        for name in files:
            path=Path(directory)/name
            if path.suffix.lower() not in ('.h5','.hdf5'):continue
            try:
                with h5py.File(path,'r') as file:
                    if str(file.attrs.get('group_id',''))!=str(group_id):continue
                    parent=file.attrs.get('parent_file')
                    if parent:links[path.relative_to(root).as_posix()]=portable(root,str(parent)).relative_to(root).as_posix()
            except (OSError,ValueError):continue
    return links

def asset_without_metadata(asset):return {key:value for key,value in asset.items() if key not in ('recovery_data','linked','suggested_name')}

def write_receipt(directory,receipt):
    directory.mkdir(parents=True,exist_ok=True)
    temporary=directory/f'.{uuid.uuid4().hex}.tmp'
    temporary.write_text(json.dumps(receipt,ensure_ascii=False),encoding='utf-8');temporary.replace(directory/'receipt.json')

def quarantine(vault_root,operation_id,paths,protected_paths,group_id):
    root=root_path(vault_root);operation=str(uuid.UUID(operation_id));directory=root/'.phdnexus-recovery'/operation
    receipt=json.loads((directory/'receipt.json').read_text(encoding='utf-8')) if (directory/'receipt.json').exists() else {'operation_id':operation,'files':[],'retained':[],'errors':[]}
    receipt['errors']=[];protected=set()
    for value in protected_paths:
        try:protected.add(portable(root,value).relative_to(root).as_posix())
        except ValueError:continue
    links=parent_links(root,group_id)
    while True:
        additions={parent for child,parent in links.items() if child in protected}-protected
        if not additions:break
        protected.update(additions)
    selected=set(paths)
    while True:
        additions={child for child,parent in links.items() if parent in selected and child not in protected}-selected
        if not additions:break
        selected.update(additions)
    known={entry['original_path'] for entry in receipt['files']}
    for relative in sorted(selected):
        if relative in protected:receipt['retained'].append(relative);continue
        try:
            source=bounded(root,relative)
            if not source.exists() and relative in known:continue
            if not source.exists():continue
            if source.suffix.lower() in ('.h5','.hdf5'):
                describe_one(root,relative,group_id)
            target=directory/'files'/relative;target=target.resolve();target.relative_to(directory.resolve())
            checksum=sha(source)
            entry={'original_path':relative,'recovery_path':target.relative_to(root).as_posix(),'sha256':checksum}
            if relative not in known:receipt['files'].append(entry);known.add(relative)
            write_receipt(directory,receipt)
            target.parent.mkdir(parents=True,exist_ok=True)
            if target.exists():
                if sha(target)!=checksum:raise ValueError('Recovery destination differs; nothing was overwritten')
                raise ValueError('Both active and recovery copies exist; review them before moving')
            source.rename(target)
        except (ValueError,OSError) as error:receipt['errors'].append({'path':relative,'error':str(error)})
    write_receipt(directory,receipt)
    return receipt

def restore(vault_root,operation_id,receipt=None):
    root=root_path(vault_root);operation=str(uuid.UUID(operation_id));directory=root/'.phdnexus-recovery'/operation
    receipt=receipt or json.loads((directory/'receipt.json').read_text(encoding='utf-8'))
    for entry in receipt.get('files',[]):
        source=bounded(root,entry['recovery_path'],True);source.relative_to(directory.resolve())
        target=bounded(root,entry['original_path'])
        if target.exists():
            if sha(target)!=entry['sha256']:raise ValueError('An active file occupies the original path; it was not overwritten')
            continue
        if not source.is_file() or sha(source)!=entry['sha256']:raise ValueError('Recovery copy is missing or changed')
        target.parent.mkdir(parents=True,exist_ok=True);source.rename(target)
    return {'restored':True}

def rename_prepare(vault_root,paths,metadata,protected_paths):
    """Stage readable copies; existing references keep working until DB confirmation."""
    from processor import _build_vault_subpath
    root=root_path(vault_root);operation=str(uuid.uuid4());directory=root/'.phdnexus-operations'/operation
    receipt={'operation_id':operation,'group_id':metadata['group_id'],'state':'prepared','mapping':{},'files':[],'protected':protected_paths}
    params=metadata.get('parameters') or {key:metadata[key] for key in metadata.get('__order__',[]) if key in metadata}
    metadata={**metadata,'parameters':params}
    for relative in paths:
        source=bounded(root,relative);info=describe_one(root,relative,metadata['group_id'])
        attrs=info['metadata'];merged={**attrs,**metadata}
        destination=(root/_build_vault_subpath(merged)).resolve();destination.relative_to(root);destination.mkdir(parents=True,exist_ok=True)
        match=re.search(r'_Spot(\d+)',source.stem,re.I)
        filename=measurement_filename(merged,destination,spot=int(match.group(1)) if match else None,exclude=source)
        target=destination/filename
        if source==target:continue
        files=[(source,target)]
        provenance=attrs.get('wip_provenance')
        images=[]
        if isinstance(provenance,dict):
            for image in provenance.get('attached_image_metadata',[]):
                images.extend([image.get('path'),image.get('annotated_path')])
        images.extend(metadata.get('attached_images',[]))
        for index,image_path in enumerate(dict.fromkeys(path for path in images if path)):
            old=bounded(root,image_path)
            if not old.is_file():continue
            new=destination/f'{target.stem}_image_{index+1}{old.suffix.lower()}'
            if new.exists():new=destination/f'{target.stem}_image_{index+1}_{operation[:6]}{old.suffix.lower()}'
            files.append((old,new))
        for old,new in files:
            old_relative=old.relative_to(root).as_posix();new_relative=new.relative_to(root).as_posix()
            entry={'original_path':old_relative,'new_path':new_relative,'sha256_before':sha(old),'recovery_path':f'.phdnexus-recovery/{operation}/files/{old_relative}'}
            if old==source:entry['metadata_before']=attrs
            receipt['files'].append(entry);receipt['mapping'][old_relative]=new_relative
            write_receipt(directory,receipt)
            with old.open('rb') as incoming,new.open('xb') as outgoing:shutil.copyfileobj(incoming,outgoing,1024*1024);outgoing.flush();os.fsync(outgoing.fileno())
            if sha(new)!=entry['sha256_before']:raise ValueError('Staged copy did not match the source; original files were kept')
        with h5py.File(target,'r+') as file:
            file.attrs['phdnexus_asset_id']=info['id']
            for key,value in metadata.items():
                if key in ('group_id','sample_id','sample_code','sample_name','logbook_name','technique','parameters','equipment','performed_at','notes') and value is not None:
                    file.attrs[key]=json.dumps(value) if isinstance(value,(dict,list)) else str(value)
            if isinstance(provenance,dict):
                def replace(value):
                    if isinstance(value,str):return receipt['mapping'].get(value,value)
                    if isinstance(value,list):return [replace(item) for item in value]
                    if isinstance(value,dict):return {key:replace(item) for key,item in value.items()}
                    return value
                provenance=replace(provenance);provenance['reviewed_parameters']=params
                file.attrs['wip_provenance']=json.dumps(provenance)
        for entry in receipt['files']:
            staged=bounded(root,entry['new_path'])
            if staged.exists():entry['sha256_after']=sha(staged)
    if not receipt['files']:return {'operation_id':None,'renamed_paths':{},'receipt':None}
    write_receipt(directory,receipt)
    return {'operation_id':operation,'renamed_paths':receipt['mapping'],'receipt':receipt}

def rename_finish(vault_root,operation_id,commit,protected_paths):
    root=root_path(vault_root);operation=str(uuid.UUID(operation_id));directory=root/'.phdnexus-operations'/operation
    receipt=json.loads((directory/'receipt.json').read_text(encoding='utf-8'))
    paths=[entry['original_path'] if commit else entry['new_path'] for entry in receipt['files']]
    protected=set(protected_paths)
    if commit:
        for entry in receipt['files']:
            old=bounded(root,entry['original_path'])
            if old.exists() and sha(old)!=entry['sha256_before']:protected.add(entry['original_path'])
    result=quarantine(vault_root,operation,paths,list(protected),str(receipt.get('group_id','')))
    # Files are never permanently removed. A journal and recovery copy survive either outcome.
    receipt['state']='committed' if commit else 'rolled_back';receipt['cleanup']=result
    write_receipt(directory,receipt)
    return receipt

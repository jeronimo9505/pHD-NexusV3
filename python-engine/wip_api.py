"""Desktop-only local WIP endpoints, isolated from the existing import routes."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from uuid import UUID

ALLOWED = {'http://localhost:3000','http://127.0.0.1:3000','tauri://localhost','http://tauri.localhost','https://tauri.localhost'}

def local_desktop(request: Request):
    if request.headers.get('origin') not in ALLOWED or request.url.hostname not in ('localhost','127.0.0.1','::1') or not request.client or request.client.host not in ('127.0.0.1','::1','testclient'):
        raise HTTPException(403, 'WIP import is only available from the local desktop application')

router = APIRouter(prefix='/api/wip', dependencies=[Depends(local_desktop)])

class Inspect(BaseModel):
    file_path: str

class ObjectRequest(BaseModel):
    session: str = Field(min_length=32,max_length=32)
    object_id: str

class Extract(ObjectRequest):
    image_ids: list[str] = Field(default_factory=list,max_length=40)
    vault_root: str
    group_id: UUID
    sample_id: UUID
    sample_code: str
    sample_name: str
    logbook_name: str
    parameters: dict = Field(default_factory=dict)

class Annotate(ObjectRequest):
    map_ids: list[str] = Field(default_factory=list,max_length=12)
    scale_um: float = 0
    show_grid: bool = False

def call(operation):
    try: return operation()
    except ImportError: raise HTTPException(503, 'Install the updated Python requirements and restart the science engine')
    except (ValueError, KeyError, OSError) as error: raise HTTPException(422, str(error))

@router.post('/inspect')
def inspect(request: Inspect):
    def run():
        from readers.wip_project import inspect_project
        return inspect_project(request.file_path)
    return call(run)

@router.post('/preview')
def preview(request: ObjectRequest):
    def run():
        from readers.wip_project import get_session
        return get_session(request.session).preview(request.object_id)
    return call(run)

@router.post('/metadata')
def metadata(request: ObjectRequest):
    def run():
        from readers.wip_project import get_session
        return get_session(request.session).details(request.object_id)
    return call(run)

@router.post('/extract')
def extract(request: Extract):
    def run():
        from readers.wip_project import get_session
        metadata = request.model_dump(exclude={'session','object_id','image_ids','vault_root'},mode='json')
        session = get_session(request.session)
        metadata['technique'] = 'Optical Image' if session.entry(request.object_id).class_name == 'TDBitmap' else 'Raman'
        return session.extract(request.object_id, request.image_ids, metadata, request.vault_root)
    return call(run)

@router.post('/close')
def close(request: ObjectRequest):
    from readers.wip_project import close_session
    close_session(request.session)
    return {'closed': True}

@router.post('/annotate')
def annotate(request: Annotate):
    def run():
        from readers.wip_project import get_session
        from readers.wip_spatial import geometry, annotate
        from PIL import Image
        import numpy as np
        session=get_session(request.session)
        with session.lock:
            image=session.entry(request.object_id)
            info=session.describe(image,0)
            if image.class_name!='TDBitmap' or not info['importable']:raise ValueError('Select a supported camera image')
            scene=Image.fromarray(np.transpose(image.array(),(1,0,2)))
            maps=[]
            for identifier in request.map_ids:
                entry=session.entry(identifier)
                if entry.class_name!='TDGraph':raise ValueError('Select Raman maps')
                maps.append(geometry(entry,session.sha256))
            result=annotate(scene,info['spatial_geometry'],maps,request.scale_um,request.show_grid)
            session.check_source()
            return {'image':result}
    return call(run)

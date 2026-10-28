from fastapi import APIRouter,Depends
from pydantic import BaseModel,Field
from uuid import UUID
from wip_api import local_desktop,call
import vault_assets
router=APIRouter(prefix='/api/vault-assets',dependencies=[Depends(local_desktop)])
class Paths(BaseModel):
    vault_root:str
    group_id:UUID
    paths:list[str]=Field(default_factory=list,max_length=10000)
class Audit(Paths):pass
class Cleanup(Paths):
    operation_id:UUID
    protected_paths:list[str]=Field(default_factory=list,max_length=50000)
class Restore(BaseModel):
    vault_root:str
    operation_id:UUID
    receipt:dict|None=None
class Rename(Paths):
    metadata:dict
    protected_paths:list[str]=Field(default_factory=list,max_length=50000)
class Finish(Restore):
    commit:bool
    protected_paths:list[str]=Field(default_factory=list,max_length=50000)
@router.post('/describe')
def describe(request:Paths):return call(lambda:vault_assets.describe(request.vault_root,request.paths,str(request.group_id)))
@router.post('/resolve')
def resolve(request:Paths):return call(lambda:vault_assets.resolve_paths(request.vault_root,request.paths))
@router.post('/workspace-metadata')
def workspace_metadata(request:Paths):return call(lambda:vault_assets.workspace_metadata(request.vault_root,request.paths,str(request.group_id)))
@router.post('/audit')
def audit(request:Audit):return call(lambda:vault_assets.audit(request.vault_root,request.paths,str(request.group_id)))
@router.post('/quarantine')
def quarantine(request:Cleanup):return call(lambda:vault_assets.quarantine(request.vault_root,str(request.operation_id),request.paths,request.protected_paths,str(request.group_id)))
@router.post('/restore')
def restore(request:Restore):return call(lambda:vault_assets.restore(request.vault_root,str(request.operation_id),request.receipt))
@router.post('/rename-prepare')
def rename(request:Rename):return call(lambda:vault_assets.rename_prepare(request.vault_root,request.paths,{**request.metadata,'group_id':str(request.group_id)},request.protected_paths))
@router.post('/rename-finish')
def finish(request:Finish):return call(lambda:vault_assets.rename_finish(request.vault_root,str(request.operation_id),request.commit,request.protected_paths))

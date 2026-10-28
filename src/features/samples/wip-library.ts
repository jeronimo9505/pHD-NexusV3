import type {WipSample} from './wip-types';
import {wipRequest} from './wip-client';
export const WIP_LIBRARY_KEY='phdnexus_wip_library_root';
export interface WipLibraryProject {
    sha256:string;name:string;managed_path:string;size:number;objects:number;created_at:string;
    original_paths:string[];available:boolean;imported_objects:number;
}
export interface WipImportHistory {
    id:string;sample_id:string;source_hash:string;object_id:string;attached_ids:string[];sample_label:string;sample?:WipSample;
}
export async function initializeWipLibrary(parentPath:string):Promise<string>{
    const result=await wipRequest<{library_root:string}>('library-init',{parent_path:parentPath});
    localStorage.setItem(WIP_LIBRARY_KEY,result.library_root);return result.library_root;
}
export async function ensureWipLibrary():Promise<string>{
    const existing=localStorage.getItem(WIP_LIBRARY_KEY);if(existing)return existing;
    const vault=localStorage.getItem('phdnexus_vault_root');
    if(!vault)throw new Error('Choose a WITec Project Library in Local Desktop Settings first.');
    return initializeWipLibrary(vault);
}
export function existingWipImport(history:WipImportHistory[],hash:string,objectId:string,sampleId:string){
    return history.find(record=>record.source_hash===hash&&record.sample_id===sampleId&&(record.object_id===objectId||record.attached_ids.includes(objectId)));
}
export async function openWipSource(source:{source_hash:string;source_file_path?:string},folder=false){
    if(typeof window==='undefined'||!('__TAURI_INTERNALS__' in window))throw new Error('Use the desktop app to open local WITec projects.');
    const location=await wipRequest<{path:string;folder:string}>('source-location',{
        library_root:localStorage.getItem(WIP_LIBRARY_KEY),source_hash:source.source_hash,original_path:source.source_file_path});
    const {invoke}=await import('@tauri-apps/api/core');
    try{await invoke('open_local_folder',{path:folder?location.folder:location.path});}
    catch(error){if(folder)throw error;await invoke('open_local_folder',{path:location.folder});}
}

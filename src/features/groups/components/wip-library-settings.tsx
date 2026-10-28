'use client';
import {useState} from 'react';
import {open} from '@tauri-apps/plugin-dialog';
import {toast} from 'sonner';
import {initializeWipLibrary,WIP_LIBRARY_KEY} from '@/features/samples/wip-library';

export function WipLibrarySettings(){
    const [root,setRoot]=useState(()=>typeof window==='undefined'?'':localStorage.getItem(WIP_LIBRARY_KEY)||'');
    const [busy,setBusy]=useState(false);
    async function configure(useVault=false){
        if(busy)return;setBusy(true);
        try{
            const parent=useVault?localStorage.getItem('phdnexus_vault_root'):await open({directory:true,multiple:false,title:'Choose a parent folder for the WITec project library'});
            if(useVault&&!parent){toast.error('Configure your Data Vault root first, or choose a parent folder.');return;}
            if(!parent||typeof parent!=='string')return;
            setRoot(await initializeWipLibrary(parent));toast.success('WITec project library configured');
        }catch(error){toast.error(error instanceof Error?error.message:String(error));}
        finally{setBusy(false);}
    }
    return <div className="space-y-2 mt-5 border-t pt-4"><label className="text-sm font-medium text-slate-700">WITec Project Library</label><div className="flex gap-2"><input readOnly value={root} aria-label="WITec library folder" placeholder="Choose a shared root for your .wip projects…" className="flex-1 min-w-0 px-3 py-2 border rounded-lg font-mono text-sm bg-slate-50"/><button type="button" disabled={busy} onClick={()=>configure()} className="px-3 py-2 rounded-lg bg-purple-50 text-purple-700 disabled:opacity-50">{busy?'Working…':'Choose folder…'}</button><button type="button" disabled={busy} onClick={()=>configure(true)} className="px-3 py-2 border rounded-lg text-sm disabled:opacity-50">Use Data Vault root</button></div><p className="text-xs text-slate-500">Creates a WITec Projects folder under the chosen location. Original projects are shared across samples; verified files are moved here when added with Open .wip. Identical content is stored once.</p></div>;
}

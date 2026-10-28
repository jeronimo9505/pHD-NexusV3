'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen, Info, X, Loader2 } from 'lucide-react';
import { getWipSampleCatalogAction } from '../wip-actions';
import { wipRequest, saveWipExtraction } from '../wip-client';
import { WipMetadataDialog } from './wip-metadata-dialog';
import type { WipInventory, WipObject, WipSample, WipExtraction } from '../wip-types';
import { WIP_PARAMETERS, initialWipParameters } from '../wip-parameters';
import { WipSpatialViewer } from './wip-spatial-viewer';
import { WipSamplePicker } from './wip-sample-picker';

type Assignment = { selected:boolean; sampleId:string; images:string[]; reviewed:Record<string,string>; result?:string; done?:boolean };

function suggestedSample(object: WipObject, samples: WipSample[]) {
    return samples.find(sample=> {
        const code=sample.sample_code || sample.display_id;
        return code && new RegExp(`(^|[^a-z0-9])${code.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^a-z0-9]|$)`,'i').test(object.name);
    });
}

export function WipImportDialog({groupId,defaultSampleId,folderId,onClose}: {
    groupId:string;defaultSampleId?:string;folderId?:string;onClose:()=>void;
}) {
    const router=useRouter();
    const [catalog,setCatalog]=useState<WipSample[]>([]);
    const [project,setProject]=useState<WipInventory|null>(null);
    const [rows,setRows]=useState<Record<string,Assignment>>({});
    const [active,setActive]=useState<string>('');
    const [metadata,setMetadata]=useState<WipObject|null>(null);
    const [preview,setPreview]=useState<{image?:string;points?:{x:number;y:number|null}[];preview_label?:string}|null>(null);
    const [busy,setBusy]=useState(false);const [previewing,setPreviewing]=useState(false);
    const [error,setError]=useState('');const [message,setMessage]=useState('');
    const [search,setSearch]=useState('');const [showSupporting,setShowSupporting]=useState(false);
    const [bulkSample,setBulkSample]=useState('');
    const lock=useRef(false);const alive=useRef(true);const request=useRef<AbortController|null>(null);
    const session=useRef<string|undefined>(undefined);
    useEffect(()=>{
        alive.current=true;
        getWipSampleCatalogAction(groupId,'',defaultSampleId).then(result=>{if(!alive.current)return;if(result.error)setError(result.error);else setCatalog(result.data||[]);});
        return ()=>{alive.current=false;request.current?.abort();if(session.current)void wipRequest('close',{session:session.current,object_id:''}).catch(()=>{});};
    },[groupId,defaultSampleId]);
    const object=project?.objects.find(item=>item.id===active);
    const row=rows[active];
    useEffect(()=>{
        setPreview(null);
        if(!project||!object?.importable)return;
        const controller=new AbortController();setPreviewing(true);
        wipRequest<NonNullable<typeof preview>>('preview',{session:project.session,object_id:object.id},controller.signal)
            .then(result=>{if(!controller.signal.aborted)setPreview(result);})
            .catch(err=>{if(!controller.signal.aborted)setError(String(err.message||err));})
            .finally(()=>{if(!controller.signal.aborted)setPreviewing(false);});
        return ()=>controller.abort();
    },[project,object]);

    const update=(id:string,change:Partial<Assignment>)=>setRows(current=>({...current,[id]:{...current[id],...change}}));
    async function chooseFile() {
        if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');
        try {
            const {open}=await import('@tauri-apps/plugin-dialog');
            const path=await open({multiple:false,filters:[{name:'WITec project',extensions:['wip']}]});
            if(!path||typeof path!=='string')return;
            request.current?.abort();const controller=new AbortController();request.current=controller;
            setMessage('Reading project structure and acquisition metadata… The original file is read-only.');
            const result=await wipRequest<WipInventory>('inspect',{file_path:path},controller.signal);
            if(!alive.current||controller.signal.aborted){void wipRequest('close',{session:result.session,object_id:''}).catch(()=>{});return;}
            if(session.current)void wipRequest('close',{session:session.current,object_id:''}).catch(()=>{});
            session.current=result.session;setProject(result);
            setRows(Object.fromEntries(result.objects.map(item=>[item.id,{selected:false,sampleId:defaultSampleId||'',images:[],
                reviewed:initialWipParameters(item)}])));
            setActive(result.objects.find(item=>item.importable)?.id||result.objects[0]?.id||'');
            setMessage(`${result.objects.length} project objects indexed. Select items and assign their destination samples.`);
        }catch(err){if(alive.current)setError(err instanceof Error?err.message:String(err));}
        finally{lock.current=false;if(alive.current)setBusy(false);}
    }

    async function showMetadata(item:WipObject) {
        if(!project)return;
        try{const details=await wipRequest<WipObject>('metadata',{session:project.session,object_id:item.id});if(alive.current)setMetadata(details);}
        catch(err){setError(err instanceof Error?err.message:String(err));}
    }

    async function importSelected() {
        if(lock.current||!project)return;
        const selected=project.objects.filter(item=>rows[item.id]?.selected&&!rows[item.id]?.done);
        if(!selected.length){setError('Select at least one supported measurement or image.');return;}
        if(selected.some(item=>!rows[item.id].sampleId)){setError('Assign a destination sample to every selected item.');return;}
        const vault=localStorage.getItem('phdnexus_vault_root');
        if(!vault){setError('Configure your local Data Vault in Settings before importing.');return;}
        lock.current=true;setBusy(true);setError('');let imported=0,existing=0,failed=0;
        try {
            for(const [index,item] of selected.entries()) {
                if(!alive.current)break;
                const assignment=rows[item.id],sample=catalog.find(s=>s.id===assignment.sampleId);
                if(!sample){failed++;update(item.id,{result:'The selected sample is unavailable.'});continue;}
                setMessage(`Importing ${index+1} of ${selected.length}: ${item.name}`);
                try {
                    const extraction=await wipRequest<WipExtraction>('extract',{session:project.session,object_id:item.id,image_ids:assignment.images,
                        vault_root:vault,group_id:groupId,sample_id:sample.id,sample_code:sample.sample_code||sample.display_id,
                        sample_name:sample.name,logbook_name:sample.logbooks?.name||'Samples',parameters:assignment.reviewed});
                    const result=await saveWipExtraction(groupId,sample,extraction,assignment.reviewed,folderId);
                    if(result.created)imported++;else existing++;
                    if(alive.current)update(item.id,{done:true,selected:false,result:result.created?'Imported':'Already imported — no duplicate created'});
                }catch(err){failed++;if(alive.current)update(item.id,{result:err instanceof Error?err.message:String(err)});}
            }
            if(alive.current){setMessage(`${imported} imported · ${existing} already present · ${failed} failed. You can assign and import more items from this project.`);router.refresh();}
        }finally{lock.current=false;if(alive.current)setBusy(false);}
    }

    const visible=project?.objects.filter(item=>(showSupporting||['raman','image','auxiliary'].includes(item.kind))&&`${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()))||[];
    const images=project?.objects.filter(item=>item.kind==='image'&&item.importable)||[];
    const rememberSample=(sample:WipSample|null)=>{if(sample)setCatalog(current=>current.some(item=>item.id===sample.id)?current:[...current,sample]);};
    const points=preview?.points?.filter(point=>point.y!==null&&Number.isFinite(point.y)) as {x:number;y:number}[]|undefined;
    const polyline=points?.length?(()=>{const ys=points.map(p=>p.y),low=Math.min(...ys),high=Math.max(...ys),xmin=points[0].x,xmax=points[points.length-1].x;return points.map(p=>`${10+(p.x-xmin)/(xmax-xmin||1)*480},${170-(p.y-low)/(high-low||1)*150}`).join(' ');})():'';
    return <div className="fixed inset-0 z-[180] bg-slate-950/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Import WITec project">
        <div className="bg-white rounded-2xl w-full max-w-[1500px] h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            <header className="p-5 border-b flex justify-between gap-4"><div><h2 className="font-bold text-lg">Import WITec Project (.wip)</h2><p className="text-xs text-slate-500">Select → Assign samples → Review metadata and images → Import. Source names and project order are preserved.</p></div><button type="button" aria-label="Close WIP import" disabled={busy} onClick={onClose}><X/></button></header>
            <div className="p-3 flex flex-wrap gap-3 items-center border-b">
                <button type="button" disabled={busy} onClick={chooseFile} className="bg-violet-600 text-white px-3 py-2 rounded-lg flex gap-2 items-center disabled:opacity-50">{busy?<Loader2 size={16} className="animate-spin"/>:<FolderOpen size={16}/>}Open .wip</button>
                {project&&<span className="text-sm">{project.name} · {(project.size/1024**2).toFixed(1)} MB · WITec format {project.version}</span>}
                <span className="text-xs text-slate-500">Local desktop import · no WIP upload</span>
            </div>
            {(message||error)&&<div className="px-5 py-2 text-sm" aria-live="polite">{message&&<p>{message}</p>}{error&&<p className="text-red-600" role="alert">{error}</p>}</div>}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
                <section className="border-r flex flex-col min-h-0">
                    <div className="p-3 space-y-2"><input className="border rounded p-2 w-full text-sm" aria-label="Search WIP objects" placeholder="Search objects…" value={search} onChange={e=>setSearch(e.target.value)}/>
                        <label className="text-xs flex gap-2"><input type="checkbox" checked={showSupporting} onChange={e=>setShowSupporting(e.target.checked)}/>Show supporting and unknown objects</label>
                        <div className="flex gap-2"><WipSamplePicker groupId={groupId} value={catalog.find(sample=>sample.id===bulkSample)||null} disabled={busy} label="Assign selected items to sample" onSelect={sample=>{rememberSample(sample);setBulkSample(sample?.id||'');}}/><button type="button" disabled={busy||!bulkSample} className="border rounded px-2 text-xs disabled:opacity-50" onClick={()=>setRows(current=>Object.fromEntries(Object.entries(current).map(([id,value])=>[id,value.selected&&!value.done?{...value,sampleId:bulkSample}:value])))}>Assign selected</button></div>
                    </div>
                    <div className="overflow-auto flex-1 divide-y">{visible.map(item=>{const assignment=rows[item.id];return <div key={item.id} draggable={item.kind==='raman'} onDragStart={event=>event.dataTransfer.setData('application/x-phdnexus-wip-map',item.id)} className={`p-3 flex gap-3 ${active===item.id?'bg-violet-50':''}`}>
                        <input type="checkbox" aria-label={`Select ${item.name}`} disabled={busy||!item.importable||assignment.done} checked={assignment.selected} onChange={e=>update(item.id,{selected:e.target.checked})}/>
                        <button type="button" className="text-left min-w-0 flex-1" onClick={()=>setActive(item.id)}><p className="text-sm font-medium break-all">{item.name}</p><p className="text-xs text-slate-500">#{item.display_order??item.order+1} · ID {item.id} · {item.kind} · {item.shape?.join(' × ')}</p><p className="text-xs">{assignment.done?assignment.result:catalog.find(s=>s.id===assignment.sampleId)?.sample_code||'Not assigned'}{!assignment.done&&assignment.result&&<span className="text-red-600 block">{assignment.result}</span>}</p></button>
                        <button type="button" aria-label={`Metadata for ${item.name}`} className="self-start text-violet-600" onClick={()=>showMetadata(item)}><Info size={18}/></button>
                    </div>;})}{!project&&<p className="p-8 text-sm text-slate-500">Open a local WITec project to inspect its measurements and images.</p>}</div>
                </section>
                <section className="overflow-auto p-5 space-y-5">{object&&row&&<>
                    <div className="flex justify-between gap-3"><h3 className="font-semibold break-all">{object.name}</h3><button type="button" className="text-violet-600 text-sm shrink-0" onClick={()=>showMetadata(object)}>Metadata</button></div>
                    {previewing&&<p className="text-sm">Loading source preview…</p>}
                    {preview?.image&&object.spatial_geometry&&<WipSpatialViewer key={object.id} imageSource={`data:image/png;base64,${preview.image}`} name={object.name} geometry={object.spatial_geometry}
                        maps={(project?.objects||[]).filter(item=>item.kind==='raman'&&item.spatial_geometry&&item.shape&&item.shape[0]>=1&&item.shape[1]>=1).map(item=>({id:item.id,name:item.name,geometry:item.spatial_geometry!}))}
                        onExport={(maps,scale,grid)=>wipRequest('annotate',{session:project!.session,object_id:object.id,map_ids:maps.map(map=>map.id),scale_um:scale,show_grid:grid})}/>}
                    {!!polyline&&<div><svg viewBox="0 0 500 190" className="w-full bg-slate-950 rounded-lg" role="img" aria-label="Source Raman spectrum"><polyline points={polyline} fill="none" stroke="#a78bfa" strokeWidth="1.5"/></svg><p className="text-xs text-slate-500">{preview?.preview_label} · Raman shift (cm⁻¹)</p></div>}
                    {object.warnings.map((warning,index)=><p key={index} className="text-xs text-amber-700">{warning}</p>)}
                    {object.importable&&<><label className="block text-sm font-medium">Destination sample<WipSamplePicker groupId={groupId} value={catalog.find(sample=>sample.id===row.sampleId)||null} disabled={busy||row.done} label="Destination sample" onSelect={sample=>{rememberSample(sample);update(object.id,{sampleId:sample?.id||''});}}/></label>
                        {!row.sampleId&&suggestedSample(object,catalog)&&<button type="button" className="text-xs text-violet-600 underline" onClick={()=>update(object.id,{sampleId:suggestedSample(object,catalog)!.id})}>Use name-based suggestion: {suggestedSample(object,catalog)!.sample_code} (confirm before importing)</button>}
                        <fieldset disabled={busy||row.done}><legend className="font-semibold text-sm mb-2">Review import metadata</legend><p className="text-xs text-slate-500 mb-3">Values come from acquisition records, never the file name. Original values remain available in Metadata.</p><table className="w-full text-sm border rounded-lg"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Parameter</th><th className="p-2 text-left">Value</th><th className="p-2 text-left">Unit</th></tr></thead><tbody>{WIP_PARAMETERS.filter(field=>object.kind==='raman'||field.key==='objective_magnification').map((field,index)=><tr key={field.key} className="border-t"><td className="p-2 text-xs text-slate-400">{index+1}</td><th className="p-2 text-left font-medium">{field.label}</th><td className="p-2"><input aria-label={field.label} className="border rounded p-2 w-full min-w-0" value={row.reviewed[field.key]||''} placeholder={['analyte','power'].includes(field.key)?'Enter manually':'Not recovered — optional'} onChange={e=>update(object.id,{reviewed:{...row.reviewed,[field.key]:e.target.value}})}/></td><td className="p-2 text-xs">{'units' in field?<select aria-label={`${field.label} unit`} className="border rounded p-2" value={row.reviewed[`unit:${field.key}`]??field.unit} onChange={e=>update(object.id,{reviewed:{...row.reviewed,[`unit:${field.key}`]:e.target.value}})}>{field.units.map(unit=><option key={unit} value={unit}>{unit||'—'}</option>)}</select>:field.unit}</td></tr>)}</tbody></table><p className="text-xs text-slate-500 mt-2">Spots = pixel grid (i×j). Size = physical scan width × height. Analyte and Power are always entered manually.</p></fieldset>
                        {object.kind==='raman'&&<fieldset disabled={busy||row.done} className="space-y-2"><legend className="font-semibold text-sm">Attached camera images</legend><p className="text-xs text-slate-500">Select images to include with this measurement. Position overlap is a suggestion, not a confirmed association.</p>
                            {!!object.suggested_images?.length&&<button type="button" className="text-violet-600 text-xs underline" onClick={()=>update(object.id,{images:object.suggested_images||[]})}>Use position-based suggestions ({object.suggested_images.length})</button>}
                            <div className="max-h-44 overflow-auto">{images.map(image=><label key={image.id} className="flex items-center gap-2 text-xs py-1"><input type="checkbox" checked={row.images.includes(image.id)} onChange={e=>update(object.id,{images:e.target.checked?[...row.images,image.id]:row.images.filter(id=>id!==image.id)})}/><span className="flex-1">{image.name}</span><button type="button" className="underline" onClick={()=>setActive(image.id)}>Preview</button></label>)}</div>
                        </fieldset>}
                    </>}
                    <p className="text-xs text-slate-500">Structural checks passed. Point-by-point comparison with a WITec export is still pending.</p>
                </>}</section>
            </div>
            <footer className="border-t p-4 flex justify-between items-center"><p className="text-sm">{Object.values(rows).filter(item=>item.selected&&!item.done).length} selected · import only the items you reviewed</p><div className="flex gap-3"><button type="button" disabled={busy} onClick={onClose} className="px-3 py-2 border rounded-lg">Close</button><button type="button" disabled={busy||!project} onClick={importSelected} className="px-4 py-2 bg-violet-600 text-white rounded-lg disabled:opacity-50">{busy?'Working…':'Import selected'}</button></div></footer>
        </div>
        {metadata&&<WipMetadataDialog title={metadata.name} metadata={metadata.metadata} history={metadata.history} source={metadata as unknown as Record<string,unknown>} onClose={()=>setMetadata(null)}/>}
    </div>;
}

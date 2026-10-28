'use client';
import {useEffect,useState} from 'react';
import {wipRequest} from '../wip-client';
import {ensureWipLibrary,type WipLibraryProject,type WipImportHistory} from '../wip-library';
import {getWipImportHistoryAction} from '../wip-actions';

export function WipLibraryBrowser({groupId,refresh,onOpen,disabled}:{groupId:string;refresh:number;onOpen:(hash:string)=>void;disabled:boolean}){
    const [projects,setProjects]=useState<WipLibraryProject[]>([]),[tab,setTab]=useState('pending'),[query,setQuery]=useState('');
    const [root,setRoot]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
    useEffect(()=>{
        let current=true;
        async function load(){
            try{
                const library=await ensureWipLibrary();
                const result=await wipRequest<{projects:WipLibraryProject[]}>('library-list',{library_root:library,group_id:groupId});
                const history:{data:WipImportHistory[];error?:string}={data:[]};
                for(let offset=0;offset<result.projects.length;offset+=1000){const page=await getWipImportHistoryAction(groupId,result.projects.slice(offset,offset+1000).map(project=>project.sha256));if(page.error){history.error=page.error;break;}history.data.push(...(page.data||[]));}
                const counts=new Map<string,Set<string>>();
                for(const record of history.data||[]){const ids=counts.get(record.source_hash)||new Set<string>();ids.add(record.object_id);record.attached_ids.forEach(id=>ids.add(id));counts.set(record.source_hash,ids);}
                if(current){setRoot(library);setProjects(result.projects.map(project=>({...project,imported_objects:history.error?project.imported_objects:counts.get(project.sha256)?.size||0})));setError(history.error?'Showing local history; cloud verification is unavailable.': '');}
            }catch(err){if(current)setError(err instanceof Error?err.message:String(err));}
            finally{if(current)setLoading(false);}
        }
        void load();return()=>{current=false;};
    },[groupId,refresh]);
    const filtered=projects.filter(project=>(tab==='imported'?project.imported_objects>0:project.imported_objects===0)&&`${project.name} ${project.original_paths.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
    return <section className="min-w-[260px] flex-1 text-xs space-y-2" aria-label="WITec project library">
        <div className="flex gap-2 flex-wrap items-center"><strong>WITec Project Library</strong><button type="button" className={`border rounded px-2 py-1 ${tab==='pending'?'bg-violet-100':''}`} onClick={()=>setTab('pending')}>To import ({projects.filter(p=>!p.imported_objects).length})</button><button type="button" className={`border rounded px-2 py-1 ${tab==='imported'?'bg-violet-100':''}`} onClick={()=>setTab('imported')}>Imported ({projects.filter(p=>p.imported_objects>0).length})</button><input className="border rounded px-2 py-1 flex-1 min-w-32" aria-label="Search WITec projects" placeholder="Find a project…" value={query} onChange={event=>setQuery(event.target.value)}/></div>
        {root&&<p className="truncate text-slate-500" title={root}>{root}</p>}
        {loading?<p role="status">Loading library…</p>:<div className="max-h-28 overflow-auto divide-y border rounded">{filtered.map(project=><button type="button" key={project.sha256} disabled={disabled||!project.available} onClick={()=>onOpen(project.sha256)} className="w-full p-2 flex gap-3 items-center text-left hover:bg-violet-50 disabled:opacity-50" title={project.managed_path}><span className="flex-1 min-w-0"><span className="block truncate">{project.name}</span><span className="block text-slate-500">{new Date(project.created_at).toLocaleString('en-GB')} · {project.sha256.slice(0,10)} · {(project.size/1024**2).toFixed(1)} MB</span></span><span className="text-slate-500 shrink-0">{project.available?`${project.imported_objects}/${project.objects} objects linked`:'File missing'}</span><span className="text-violet-600 shrink-0">Open</span></button>)}{!filtered.length&&<p className="p-2 text-slate-500">{tab==='imported'?'No imported projects in this group yet.':'Use Open .wip to add a project to the library.'}</p>}</div>}
        {error&&<p role="status" className="text-amber-700">{error}</p>}
    </section>;
}

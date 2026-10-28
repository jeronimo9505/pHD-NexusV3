'use client';
import {useEffect,useId,useState} from 'react';
import {getWipSampleCatalogAction} from '../wip-actions';
import type {WipSample} from '../wip-types';

export function WipSamplePicker({groupId,value,onSelect,disabled=false,label}:{
    groupId:string;value:WipSample|null;onSelect:(sample:WipSample|null)=>void;disabled?:boolean;label:string;
}) {
    const id=useId();
    const [query,setQuery]=useState<string|null>(null),[results,setResults]=useState<WipSample[]>([]);
    const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[active,setActive]=useState(0);
    useEffect(()=>{
        if(!query?.trim())return;
        let current=true;
        const timer=setTimeout(()=>{getWipSampleCatalogAction(groupId,query).then(result=>{
            if(!current)return;setResults(result.data||[]);setError(result.error||'');setLoading(false);
        }).catch(()=>{if(current){setError('Could not search samples. Try again.');setLoading(false);}});},250);
        return()=>{current=false;clearTimeout(timer);};
    },[groupId,query]);
    const choose=(sample:WipSample)=>{onSelect(sample);setQuery(null);setResults([]);setLoading(false);setError('');setOpen(false);};
    const text=query??(value?`${value.sample_code||value.display_id} · ${value.name} · ${value.logbooks?.name||''}`:'');
    return <div className="relative min-w-0 flex-1 text-xs" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
        <input role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={id} aria-activedescendant={open&&results[active]?`${id}-${active}`:undefined}
            disabled={disabled} className="border rounded p-2 w-full" placeholder="Type sample ID…" value={text}
            onFocus={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setResults([]);setError('');setActive(0);setLoading(Boolean(event.target.value.trim()));setOpen(true);onSelect(null);}}
            onKeyDown={event=>{if(event.key==='Escape')setOpen(false);if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);setActive(i=>Math.max(0,Math.min(results.length-1,i+1)));}if(event.key==='ArrowUp'){event.preventDefault();setActive(i=>Math.max(0,i-1));}if(event.key==='Enter'&&open&&results[active]){event.preventDefault();choose(results[active]);}}}/>
        {open&&!disabled&&<div className="absolute z-30 top-full inset-x-0 bg-white border rounded shadow-lg max-h-56 overflow-auto mt-1">
            {!query?.trim()&&<p className="p-3 text-slate-500">Start typing a sample ID to search.</p>}
            {query?.trim()&&loading&&<p role="status" className="p-3">Searching…</p>}
            {error&&<p role="alert" className="p-3 text-red-600">{error}</p>}
            <div role="listbox" id={id}>{results.map((sample,index)=><button type="button" role="option" aria-selected={index===active} id={`${id}-${index}`} key={sample.id}
                onMouseDown={event=>event.preventDefault()} onClick={()=>choose(sample)} className={`block text-left w-full p-3 border-b ${index===active?'bg-violet-50':''}`}>
                <strong>{sample.sample_code||sample.display_id}</strong> · {sample.name}<span className="block text-slate-500">{sample.logbooks?.name}</span></button>)}</div>
            {query?.trim()&&!loading&&!error&&!results.length&&<p className="p-3 text-slate-500">No matching samples.</p>}
            {results.length===20&&<p className="p-2 text-slate-500">First 20 matches. Keep typing to narrow the ID.</p>}
        </div>}
    </div>;
}

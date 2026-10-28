'use client';
import { useState } from 'react';
import { measurementDisplay } from '../measurement-display';
import { X, Copy } from 'lucide-react';

export function WipMetadataDialog({ title,metadata,history=[],source,onClose }: {
    title:string;metadata:Record<string,unknown>;history?:{date?:string;text?:string;type?:number}[];
    source:Record<string,unknown>;onClose:()=>void;
}) {
    const [tab,setTab]=useState('measurements');const [search,setSearch]=useState('');const [copied,setCopied]=useState(false);const [copyError,setCopyError]=useState('');
    const groups:Record<string,[string,unknown][]>={};
    for(const [key,value] of Object.entries(metadata)) {
        if(!`${key} ${JSON.stringify(value)}`.toLowerCase().includes(search.toLowerCase()))continue;
        const group=/camera/.test(key)?'Spectroscopy camera':/spectrograph|grating|center_wavelength/.test(key)?'Spectrograph':
            /objective/.test(key)?'Objective':/laser|excitation/.test(key)?'Laser':/scan|position|tilt|rotation/.test(key)?'Measurement geometry':
            /integration|accumulations|duration/.test(key)?'Acquisition':'General';
        (groups[group] ||= []).push([key,value]);
    }
    return <div className="fixed inset-0 z-[250] bg-slate-950/50 flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-label="WITec metadata">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <header className="p-5 border-b flex justify-between gap-3"><div><h2 className="font-bold">WITec Metadata</h2><p className="text-sm text-slate-500 break-all">{title}</p></div><button type="button" aria-label="Close metadata" onClick={onClose}><X size={20}/></button></header>
            <nav className="p-3 flex gap-2 border-b">{[['measurements','Measurements'],['history','Data History'],['source','Source Details']].map(([id,label])=><button type="button" key={id} onClick={()=>setTab(id)} className={`px-3 py-2 rounded ${tab===id?'bg-violet-100 text-violet-700':'bg-slate-50'}`}>{label}</button>)}
                <button type="button" className="ml-auto flex items-center gap-2 text-sm" onClick={async()=>{try{await navigator.clipboard.writeText(JSON.stringify({metadata,history,source},null,2));setCopied(true);setCopyError('');}catch{setCopyError('Could not copy metadata. Select values from the table or Source Details.');}}}><Copy size={14}/>{copied?'Copied':'Copy metadata'}</button></nav>
            <div className="p-5 overflow-auto space-y-4">{copyError&&<p role="alert" className="text-sm text-red-600">{copyError}</p>}
                <p className="text-xs text-slate-500">Original source values. Import corrections are stored separately. File names are not used to fill missing metadata.</p>
                {tab==='measurements'&&<><input className="border rounded p-2 w-full" placeholder="Search metadata…" aria-label="Search metadata" value={search} onChange={event=>setSearch(event.target.value)}/>
                    {Object.entries(groups).map(([group,rows])=><section key={group}><h3 className="font-semibold bg-slate-100 p-2">{group}</h3><table className="w-full text-sm"><tbody>{rows.map(([key,value])=><tr key={key} className="border-b"><th className="p-2 text-left font-medium w-1/2">{key.replaceAll('_',' ')}</th><td className="p-2 break-all">{typeof value==='object'?JSON.stringify(value):measurementDisplay(key,value??'Not available')}</td></tr>)}</tbody></table></section>)}
                    {!Object.keys(groups).length&&<p>No matching acquisition metadata was recovered.</p>}</>}
                {tab==='history'&&<><table className="w-full text-sm"><thead><tr className="text-left"><th>Date as stored</th><th>Recorded action</th></tr></thead><tbody>{history.map((item,index)=><tr key={index} className="border-b"><td className="p-2">{item.date||'Not available'}</td><td className="p-2">{item.text||'No description'}</td></tr>)}</tbody></table>
                    {!history.length&&<p>No Data History entries were recovered. Acquisition trace information is shown below where available.</p>}
                    <dl className="text-sm space-y-2">{Object.entries(metadata).filter(([key])=>key.startsWith('trace_')).map(([key,value])=><div key={key}><dt className="font-medium">{key.replaceAll('_',' ')}</dt><dd className="break-all">{String(value)}</dd></div>)}</dl></>}
                {tab==='source'&&<pre className="text-xs whitespace-pre-wrap break-all bg-slate-50 p-4 rounded">{JSON.stringify(source,null,2)}</pre>}
            </div>
        </div>
    </div>;
}

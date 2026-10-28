'use client';
import {useRef,useState} from 'react';
import {spatialOverlay,spatialRelation,type WipGeometry,type SpatialMap} from '../wip-spatial';
const overlayColor='#ef4444';

export function WipSpatialViewer({imageSource,name,geometry,maps,onExport}: {
    imageSource:string;name:string;geometry:WipGeometry;maps:SpatialMap[];
    onExport?:(selected:SpatialMap[],scale:number,grid:boolean)=>Promise<{image:string}>;
}) {
    const [showAll,setShowAll]=useState(false);
    const [selected,setSelected]=useState<string[]>([]),[grid,setGrid]=useState(false),[zoom,setZoom]=useState(1);
    const [scale,setScale]=useState<number|null>(null),[error,setError]=useState(''),[exporting,setExporting]=useState(false);
    const frame=useRef<HTMLDivElement>(null),pan=useRef<{x:number;y:number;left:number;top:number}|null>(null);
    const width=geometry.width||640,height=geometry.height||480;
    const lengths=geometry.valid&&geometry.um_per_pixel_x?[1,2,5,10,20,40,50,100,200,500,1000].filter(value=>{
        const pixels=value/geometry.um_per_pixel_x!;return pixels>=20&&pixels<=width*.5;}):[];
    const scaleLength=scale??(lengths.includes(40)?40:lengths.filter(value=>value/geometry.um_per_pixel_x!<=width*.3).at(-1)||lengths[0]||0);
    const detected=maps.map(item=>({item,relation:spatialRelation(geometry,item.geometry)}));
    const visible=detected.filter(({relation})=>showAll||relation==='inside'||relation==='overlap');
    const inImage=detected.filter(({relation})=>relation==='inside'||relation==='overlap');
    const shapes=selected.flatMap(id=>{const item=maps.find(map=>map.id===id);if(!item)return[];try{return[{item,...spatialOverlay(geometry,item.geometry,grid)}];}catch{return[];}});
    function add(id:string){if(!selected.includes(id)&&selected.length>=12){setError('Show up to 12 maps at a time. Hide a map before adding another.');return;}const item=maps.find(map=>map.id===id);if(!item)return;try{const relation=spatialRelation(geometry,item.geometry);if(relation==='outside')throw new Error('This measurement is outside the image.');spatialOverlay(geometry,item.geometry);setSelected(current=>current.includes(id)?current:[...current,id]);setError('');}catch(err){setError(err instanceof Error?err.message:String(err));}}
    async function exportImage(){
        setExporting(true);setError('');
        try{
            let blob:Blob;
            if(onExport){const result=await onExport(shapes.map(shape=>shape.item),scaleLength,grid);blob=new Blob([Uint8Array.from(atob(result.image),char=>char.charCodeAt(0))],{type:'image/png'});}
            else{
                // Render the already displayed vault image; no new file-reading endpoint.
                const source=new Image();source.crossOrigin='anonymous';source.src=imageSource;await source.decode();
                const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');
                if(!context)throw new Error('Image export is unavailable.');context.drawImage(source,0,0,width,height);
                shapes.forEach(shape=>{
                    context.strokeStyle=overlayColor;context.fillStyle=overlayColor;context.lineWidth=Math.max(4,width/220);
                    if(shape.kind==='point'){const [x,y]=shape.polygon[0];context.beginPath();context.arc(x,y,Math.max(7,width/160),0,Math.PI*2);context.fill();context.strokeStyle='white';context.lineWidth=Math.max(2,width/700);context.stroke();}
                    else{context.beginPath();shape.polygon.forEach(([x,y],i)=>i?context.lineTo(x,y):context.moveTo(x,y));if(shape.kind==='area')context.closePath();context.stroke();}
                    if(shape.kind!=='point')shape.points.forEach(([x,y])=>{context.beginPath();context.arc(x,y,Math.max(2,width/900),0,Math.PI*2);context.fill();});
                });
                if(scaleLength&&geometry.valid){const x=width*.06,y=height*.9,length=scaleLength/geometry.um_per_pixel_x!;context.fillStyle='rgba(0,0,0,.75)';context.fillRect(width*.04,height*.87,length+width*.04,height*.09);context.strokeStyle='white';context.lineWidth=height*.006;context.beginPath();context.moveTo(x,y);context.lineTo(x+length,y);context.stroke();context.fillStyle='white';context.font=`${height*.028}px sans-serif`;context.fillText(`${scaleLength} µm`,x,height*.94);}
                blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Image export failed.')),'image/png'));
            }
            const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`${name.replace(/[^a-z0-9_-]/gi,'_')}_annotated.png`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }catch(err){setError(err instanceof Error?err.message:String(err));}finally{setExporting(false);}
    }
    return <section className="space-y-3" aria-label="Calibrated microscopy viewer">
        <div className="flex flex-wrap gap-2 items-center text-xs"><button type="button" className="border rounded px-2 py-1" onClick={()=>setZoom(value=>Math.max(1,value-.5))}>Zoom −</button><span>{zoom.toFixed(1)}×</span><button type="button" className="border rounded px-2 py-1" onClick={()=>setZoom(value=>Math.min(6,value+.5))}>Zoom +</button><label className="flex gap-1 items-center"><input type="checkbox" checked={grid} onChange={event=>setGrid(event.target.checked)}/>Source grid</label>
            <label>Scale bar <select aria-label="Scale bar length" className="border rounded p-1" disabled={!geometry.valid} value={scaleLength} onChange={event=>setScale(Number(event.target.value))}><option value={0}>Hidden</option>{lengths.map(value=><option key={value} value={value}>{value} µm</option>)}</select></label>
            <button type="button" className="border rounded px-2 py-1" disabled={exporting} onClick={exportImage}>{exporting?'Exporting…':'Export annotated PNG'}</button></div>
        {!geometry.valid&&<p className="text-xs text-amber-700">No calibrated scale or overlay: {geometry.reason||'Spatial metadata is unavailable.'}</p>}
        <div ref={frame} className="overflow-auto max-h-[420px] border rounded-lg bg-slate-950" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();add(event.dataTransfer.getData('application/x-phdnexus-wip-map'));}}
            onPointerDown={event=>{if(zoom<=1)return;pan.current={x:event.clientX,y:event.clientY,left:frame.current!.scrollLeft,top:frame.current!.scrollTop};event.currentTarget.setPointerCapture(event.pointerId);}}
            onPointerMove={event=>{if(pan.current&&frame.current){frame.current.scrollLeft=pan.current.left-(event.clientX-pan.current.x);frame.current.scrollTop=pan.current.top-(event.clientY-pan.current.y);}}} onPointerUp={()=>{pan.current=null;}} onPointerCancel={()=>{pan.current=null;}}>
            <svg viewBox={`0 0 ${width} ${height}`} style={{width:`${zoom*100}%`,maxWidth:'none',display:'block',cursor:zoom>1?'grab':'default'}} role="img" aria-label={name}>
                <image href={imageSource} x={0} y={0} width={width} height={height}/>
                {shapes.map(shape=><g key={shape.item.id} stroke={overlayColor} fill="none">
                    {shape.kind==='point'?<circle cx={shape.polygon[0][0]} cy={shape.polygon[0][1]} r={Math.max(7,width/160)} fill={overlayColor} stroke="white" strokeWidth={Math.max(2,width/700)}/>:shape.kind==='line'?<polyline points={shape.polygon.map(point=>point.join(',')).join(' ')} strokeWidth={Math.max(4,width/220)}/>:<polygon points={shape.polygon.map(point=>point.join(',')).join(' ')} strokeWidth={Math.max(4,width/220)}/>}
                    {shape.kind!=='point'&&shape.points.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={Math.max(2,width/900)} fill={overlayColor} stroke="none"/>)}
                </g>)}
                {!!scaleLength&&geometry.valid&&<g><rect x={width*.04} y={height*.87} width={scaleLength/geometry.um_per_pixel_x!+width*.04} height={height*.09} fill="black" opacity={.75}/><line x1={width*.06} y1={height*.9} x2={width*.06+scaleLength/geometry.um_per_pixel_x!} y2={height*.9} stroke="white" strokeWidth={height*.006}/><text x={width*.06} y={height*.94} fill="white" fontSize={height*.028}>{scaleLength} µm</text></g>}
            </svg></div>
        <p className="text-xs text-slate-500">{inImage.length} measurements detected in this image from calibrated coordinates. Points mark single acquisitions; outlines mark scan areas. Zoomed images can be panned.</p>
        <div className="flex flex-wrap gap-3 items-center text-xs"><button type="button" className="border rounded px-2 py-1" onClick={()=>{setSelected(inImage.slice(0,12).map(({item})=>item.id));setError(inImage.length>12?'Showing the first 12 detected measurements.':'');}}>Show detected</button><button type="button" className="border rounded px-2 py-1" onClick={()=>setSelected([])}>Hide all</button><label className="flex gap-1 items-center"><input type="checkbox" checked={showAll} onChange={event=>setShowAll(event.target.checked)}/>Include outside / unlocated measurements</label></div>
        <div className="max-h-40 overflow-auto space-y-1">{visible.map(({item,relation})=><div key={item.id} className="flex items-center gap-2 text-xs border rounded p-2" draggable={relation==='inside'||relation==='overlap'} onDragStart={event=>event.dataTransfer.setData('application/x-phdnexus-wip-map',item.id)}><input type="checkbox" aria-label={`Show ${item.name}`} disabled={relation==='outside'||relation==='unavailable'} checked={selected.includes(item.id)} onChange={event=>event.target.checked?add(item.id):setSelected(current=>current.filter(id=>id!==item.id))}/><span className="break-all flex-1">{item.name}<span className="block text-slate-500">{relation==='inside'?'Inside image':relation==='overlap'?'Partially inside image':relation==='outside'?'Outside image':'Position unavailable'}</span></span><button type="button" disabled={relation==='outside'||relation==='unavailable'} className="text-violet-600 disabled:text-slate-400" onClick={()=>add(item.id)}>Show</button></div>)}</div>
        {!visible.length&&<p className="text-xs text-slate-500">No calibrated measurements were detected inside this image. Enable the option above to inspect outside or unlocated measurements.</p>}
        {grid&&shapes.some(shape=>!shape.gridAvailable)&&<p className="text-xs text-amber-700">Full grids are limited to 5,000 points; the acquisition outline remains available.</p>}
        {error&&<p className="text-xs text-red-600" role="alert">{error}</p>}
    </section>;
}

import type {WipObject} from './wip-types';
import {spatialRelation} from './wip-spatial';

export interface WipAssignment {
    selected:boolean;sampleId:string;images:string[];reviewed:Record<string,string>;result?:string;done?:boolean;
}
export function wipImportPlan(objects:WipObject[],rows:Record<string,WipAssignment>,allowStandaloneImages=false) {
    const selected=objects.filter(item=>item.importable&&rows[item.id]?.selected&&!rows[item.id].done);
    const images=selected.filter(item=>item.kind==='image');
    const entries=selected.filter(item=>item.kind==='raman').map(item=>{
        const explicit=rows[item.id].images.filter(id=>objects.some(image=>image.id===id&&image.kind==='image'&&image.importable));
        const detected=images.filter(image=>{
            if(!rows[item.id].sampleId||rows[image.id].sampleId!==rows[item.id].sampleId||!image.spatial_geometry||!item.spatial_geometry)return false;
            const relation=spatialRelation(image.spatial_geometry,item.spatial_geometry);
            return relation==='inside'||relation==='overlap';
        }).map(image=>image.id);
        return {item,imageIds:Array.from(new Set([...explicit,...detected])).sort()};
    });
    const imageLinks=Object.fromEntries(images.map(image=>[image.id,entries.filter(entry=>
        rows[entry.item.id].sampleId===rows[image.id].sampleId&&entry.imageIds.includes(image.id)).map(entry=>entry.item.id)]));
    const unlinked=images.filter(image=>!imageLinks[image.id].length);
    if(allowStandaloneImages)entries.push(...unlinked.map(item=>({item,imageIds:[]})));
    return {entries,imageLinks,unlinked:allowStandaloneImages?[]:unlinked};
}

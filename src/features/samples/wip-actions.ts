'use server';

import { createClient, getUser } from '@/lib/supabase/server';
import {createCharacterizationAction} from './actions';
import type { WipSample } from './wip-types';
import type { SpatialMap } from './wip-spatial';
import type {WipImportHistory} from './wip-library';

async function access(groupId: string) {
    const client = await createClient(); const user = await getUser();
    if (!user) throw new Error('Sign in before importing WITec data');
    const { data, error } = await client.from('group_members').select('id')
        .eq('group_id', groupId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (error || !data) throw new Error('Active group membership is required');
    return client;
}

export async function getWipImportHistoryAction(groupId:string,hashes:string[]):Promise<{data?:WipImportHistory[];error?:string}>{
    const valid=Array.from(new Set(hashes.filter(hash=>/^[a-f0-9]{64}$/.test(hash))));
    if(!valid.length)return {data:[]};
    if(valid.length>1000)return {error:'Narrow the library search to at most 1,000 projects'};
    try{
        const client=await access(groupId),records:WipImportHistory[]=[];
        for(let start=0;start<valid.length;start+=100){
            for(let offset=0;;offset+=500){
                const{data,error}=await(client as any).from('sample_characterizations')
                    .select('id,sample_id,source_hash:data->wip_import->>source_hash,object_id:data->wip_import->>object_id,attached_ids:data->wip_import->attached_object_ids,samples!inner(group_id,sample_code,display_id,name,logbook_id,logbooks(name))')
                    .eq('samples.group_id',groupId).in('data->wip_import->>source_hash',valid.slice(start,start+100))
                    .order('id').range(offset,offset+499);
                if(error)return {error:error.message};
                records.push(...(data||[]).map((row:any)=>({id:row.id,sample_id:row.sample_id,source_hash:row.source_hash,object_id:row.object_id,
                    sample:row.samples?{id:row.sample_id,...row.samples}:undefined,attached_ids:Array.isArray(row.attached_ids)?row.attached_ids.map(String):[],sample_label:`${row.samples?.sample_code||row.samples?.display_id||''} · ${row.samples?.name||''}`})));
                if(!data||data.length<500)break;
            }
        }
        return {data:records};
    }catch{return {error:'Could not verify imported WIP measurements. Check your connection before importing.'};}
}

export async function getWipSpatialMapsAction(groupId:string,sourceHash:string):Promise<{data?:SpatialMap[];error?:string}> {
    if(!/^[a-f0-9]{64}$/.test(sourceHash))return{error:'Invalid WIP source identifier'};
    try{
        const client=await access(groupId),rows:SpatialMap[]=[];
        for(let offset=0;;offset+=500){
            const{data,error}=await(client as any).from('sample_characterizations')
                .select('id, geometry:data->wip_import->spatial_geometry, name:data->wip_import->>object_name, samples!inner(group_id)')
                .eq('samples.group_id',groupId).eq('type','Raman').eq('data->wip_import->>source_hash',sourceHash)
                .order('id').range(offset,offset+499);
            if(error)return{error:error.message};
            rows.push(...(data||[]).filter((row:any)=>row.geometry?.width>=1&&row.geometry?.height>=1).map((row:any)=>({id:String(row.geometry.object_id||row.id),name:row.name||row.id,geometry:row.geometry})));
            if(!data||data.length<500)break;
        }
        return{data:rows};
    }catch{return{error:'Could not load maps from the same WIP coordinate frame'};}
}

export async function getWipSampleCatalogAction(groupId: string, query = '', sampleId?: string): Promise<{ data?: WipSample[]; error?: string }> {
    const prefix=query.trim().replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
    if(!sampleId&&!prefix)return {data:[]};
    try {
        const client=await access(groupId);
        let request=client.from('samples').select('id, sample_code, display_id, name, logbook_id, logbooks(name)').eq('group_id',groupId);
        if(sampleId)request=request.eq('id',sampleId);
        else {const pattern=prefix.replaceAll('_','\\_')+'%';request=request.or(`sample_code.ilike.${pattern},display_id.ilike.${pattern}`);}
        const {data,error}=await request.order('sample_code').order('id').limit(20);
        return error?{error:error.message}:{data:data||[]};
    }catch{return {error:'Could not search samples'};}
}

export async function saveWipCharacterizationAction(input: {
    groupId: string; sampleId: string; recordId: string; data: Record<string, unknown>;
    type: 'Raman' | 'Optical Image'; performedAt?: string;
}): Promise<{ id?: string; created?: boolean; error?: string }> {
    return createCharacterizationAction({group_id:input.groupId,sample_id:input.sampleId,record_id:input.recordId,type:input.type,data:input.data,performed_at:input.performedAt});
}

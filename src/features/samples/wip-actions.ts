'use server';

import { createClient, getUser } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { WipSample } from './wip-types';
import type { SpatialMap } from './wip-spatial';

async function access(groupId: string) {
    const client = await createClient(); const user = await getUser();
    if (!user) throw new Error('Sign in before importing WITec data');
    const { data, error } = await client.from('group_members').select('id')
        .eq('group_id', groupId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (error || !data) throw new Error('Active group membership is required');
    return client;
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
            rows.push(...(data||[]).filter((row:any)=>row.geometry?.width>=1&&row.geometry?.height>=1).map((row:any)=>({id:row.id,name:row.name||row.id,geometry:row.geometry})));
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
    try {
        const client = await access(input.groupId);
        const { data, error } = await (client as any).rpc('import_wip_characterization_safe', {
            p_group_id:input.groupId,p_sample_id:input.sampleId,p_record_id:input.recordId,
            p_data:input.data,p_type:input.type,p_performed_at:input.performedAt || null });
        if (error) return { error:error.message };
        revalidatePath(`/${input.groupId}/samples`);
        return data;
    } catch (error) { return { error:error instanceof Error ? error.message : 'Could not link the extracted data to this sample' }; }
}

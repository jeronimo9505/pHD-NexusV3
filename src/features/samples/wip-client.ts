import { SCIENCE_ENGINE_URL } from '@/lib/desktop';
import { desktopDriveCommand, desktopDriveIdentity } from '@/lib/google/desktop-drive';
import { saveWipCharacterizationAction } from './wip-actions';
import type { WipExtraction, WipSample } from './wip-types';
import { characterizationParameters } from './wip-parameters';

export async function wipRequest<T>(action: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${SCIENCE_ENGINE_URL}/api/wip/${action}`, {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal });
    const result = await response.json().catch(()=>null);
    if (!response.ok) throw new Error(response.status===404
        ? 'Restart the Python science engine to load WIP import, then reopen this project.'
        : typeof result?.detail==='string' ? result.detail : `WIP ${action} failed (HTTP ${response.status})`);
    return result as T;
}

export async function saveWipExtraction(groupId: string, sample: WipSample, extracted: WipExtraction,
    reviewed: Record<string,string>, folderId?: string) {
    const parameters = characterizationParameters(reviewed);
    const data: Record<string,unknown> = { ...parameters, __order__:Object.keys(parameters),
        equipment:'WITec',wip_import:extracted.provenance,attached_images:extracted.attached_images,
        wip_archive_path:extracted.archive_relative_path };
    if (extracted.h5_relative_path) {
        data.local_h5_paths=[extracted.h5_relative_path];
        data.file_metadata={ [extracted.h5_relative_path]: { spectra:extracted.shape[0]*extracted.shape[1],
            points:extracted.shape[2],range:{x:extracted.shape[0],y:extracted.shape[1]} } };
    }
    if (extracted.kind==='raman' && extracted.representative?.length) {
        const { userId } = await desktopDriveIdentity(groupId);
        const job: Record<string,unknown> = {job_id:crypto.randomUUID(),owner_id:userId,status:'pending',
            name:`${sample.sample_code || sample.display_id}_WIP_${extracted.provenance.object_id}.json`,folder_id:folderId || null,
            payload:{sample_id:sample.id,sample_code:sample.sample_code,sample_name:sample.name,parameters,
                source:{file:extracted.provenance.source_name,object_id:extracted.provenance.object_id},data:extracted.representative}};
        job.signature=await desktopDriveCommand('google_drive_sign_job',groupId,{job},userId);
        data.raman_drive_sync=job;
    }
    const result=await saveWipCharacterizationAction({groupId,sampleId:sample.id,recordId:extracted.record_id,
        type:extracted.kind==='raman'?'Raman':'Optical Image',data,
        performedAt:extracted.provenance.original_metadata?.trace_creation_time_utc});
    if(result.error)throw new Error(`${result.error}. The local extraction is preserved; retry to link it.`);
    if (!result.id) throw new Error('Supabase did not confirm the import. Retry this item.');
    if(result.created)window.dispatchEvent(new Event('phdnexus-raman-pending'));
    return result;
}

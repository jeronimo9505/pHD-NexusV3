'use server';
import { createClient, getUser } from '@/lib/supabase/server';
import { collectAssetPaths, collectWorkspacePaths } from './characterization-data';
import { createCharacterizationAction } from './actions';
async function access(groupId: string) {
    const user = await getUser();
    if (!user)
        throw new Error('Sign in to manage measurement files');
    const client = await createClient();
    const { data, error } = await client.from('group_members').select('id').eq('group_id', groupId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (error || !data)
        throw new Error('Active group membership required');
    return client;
}
export async function getVaultReferencesAction(groupId: string, excludeId?: string): Promise<{
    paths?: string[];
    error?: string;
}> {
    try {
        const client = await access(groupId), paths: string[] = [];
        for (let offset = 0;; offset += 500) {
            const { data, error } = await client.from('sample_characterizations').select('id,data,samples!inner(group_id)').eq('samples.group_id', groupId).order('id').range(offset, offset + 499);
            if (error)
                return { error: error.message };
            for (const record of data || [])
                if (record.id !== excludeId)
                    paths.push(...collectAssetPaths(record.data as any));
            if (!data || data.length < 500)
                break;
        }
        for (let offset = 0;; offset += 500) {
            const { data, error } = await (client as any).from('raman_workspaces').select('id,files,settings').eq('group_id', groupId).order('id').range(offset, offset + 499);
            if (error)
                return { error: error.message };
            for (const workspace of data || [])
                paths.push(...collectWorkspacePaths(workspace.files), ...collectWorkspacePaths(workspace.settings));
            if (!data || data.length < 500)
                break;
        }
        return { paths: Array.from(new Set(paths)) };
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
export async function getCharacterizationRecoveryAction(groupId: string) {
    try {
        const client = await access(groupId);
        const { data, error } = await (client as any).from('characterization_recovery').select('id,record_id,deleted_at,cleanup_state,cleanup_receipt,record_type:record_snapshot->>type,sample_id:record_snapshot->>sample_id').eq('group_id', groupId).neq('cleanup_state', 'restored').order('deleted_at', { ascending: false }).limit(200);
        return error ? { error: error.message } : { data: data || [] };
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
export async function getCharacterizationRecoveryDetailsAction(groupId: string, id: string) {
    try {
        const client = await access(groupId);
        const { data, error } = await (client as any).from('characterization_recovery').select('*').eq('id', id).eq('group_id', groupId).single();
        return error ? { error: error.message } : { data };
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
export async function markCharacterizationRecoveryAction(groupId: string, id: string, state: 'pending' | 'quarantined' | 'retained' | 'restored', receipt: unknown) {
    try {
        const client = await access(groupId);
        const { error } = await (client as any).from('characterization_recovery').update({ cleanup_state: state, cleanup_receipt: receipt }).eq('id', id).eq('group_id', groupId);
        return error ? { error: error.message } : { success: true };
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
export async function confirmCharacterizationAssetOperationAction(groupId: string, id: string, operationId: string, receipt: unknown) {
    try {
        const client = await access(groupId);
        const { data, error } = await (client as any).rpc('confirm_characterization_asset_operation', { p_id: id, p_group_id: groupId, p_operation_id: operationId, p_receipt: receipt });
        return error ? { error: error.message } : data ? { success: true } : { error: 'The measurement changed while confirming file cleanup. Its files were retained in the recovery journal.' };
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
export async function restoreCharacterizationRecordAction(groupId: string, eventId: string, restoredData?: Record<string, any>) {
    try {
        const client = await access(groupId);
        const user = await getUser();
        const { data: event, error } = await (client as any).from('characterization_recovery').select('*').eq('id', eventId).eq('group_id', groupId).single();
        if (error || !event)
            return { error: 'Recovery record not found' };
        const record = event.record_snapshot, data = { ...record.data, ...restoredData };
        if (data.raman_drive_sync?.owner_id !== user?.id)
            delete data.raman_drive_sync;
        const saved = await createCharacterizationAction({ group_id: groupId, sample_id: record.sample_id, record_id: record.id, type: record.type, data, performed_at: record.performed_at });
        if (saved.error)
            return saved;
        return markCharacterizationRecoveryAction(groupId, eventId, 'restored', event.cleanup_receipt);
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
export async function archiveUnlinkedMeasurementAction(groupId: string, sampleId: string, type: string, data: Record<string, any>, recordId?: string) {
    try {
        const client = await access(groupId), user = await getUser();
        const references = await getVaultReferencesAction(groupId);
        if (references.error)
            return { error: references.error };
        if (collectAssetPaths(data).some(path => references.paths?.includes(path)))
            return { error: 'This measurement is referenced by an active record or workspace. It was kept.' };
        const id = recordId || crypto.randomUUID();
        const { data: event, error } = await (client as any).from('characterization_recovery').insert({ record_id: id, group_id: groupId, created_by: user!.id,
            record_snapshot: { id, sample_id: sampleId, type, data, created_by: user!.id, performed_at: new Date().toISOString() } }).select('*').single();
        return error ? { error: error.message } : { data: event };
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

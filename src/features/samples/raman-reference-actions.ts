'use server';

import { createClient, getUser } from '@/lib/supabase/server';

async function access(groupId: string) {
    const client = await createClient();
    const user = await getUser();
    if (!user) throw new Error('Sign in before syncing Raman references');
    const { data, error } = await client.from('group_members').select('id')
        .eq('group_id', groupId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (error || !data) throw new Error('Active group membership is required');
    return { client, userId: user.id };
}

export async function getPendingRamanReferencesAction(groupId: string) {
    try {
        const { client, userId } = await access(groupId);
        const { data, error } = await client.from('sample_characterizations')
            .select('id, data, samples!inner(group_id)').eq('samples.group_id', groupId).eq('type', 'Raman')
            .eq('data->raman_drive_sync->>status', 'pending').eq('data->raman_drive_sync->>owner_id', userId).order('id').limit(50);
        if (error) return { error: error.message };
        return { data: data || [] };
    } catch { return { error: 'Could not read pending Raman references' }; }
}

// Lock and merge inside Postgres: never put the spectrum snapshot in a URL.
export async function updateRamanReferenceSyncAction(input: {
    groupId: string; id: string; jobId: string; fileId: string; complete?: boolean;
}): Promise<{ fileId?: string; stale?: boolean; error?: string }> {
    if (!/^[\w-]{1,200}$/.test(input.fileId) || !/^[\w-]{1,100}$/.test(input.jobId)) return { error: 'Invalid reference identifier' };
    try {
        const { client } = await access(input.groupId);
        const { data, error } = await (client as any).rpc('update_raman_reference_sync_safe', {
            p_group_id: input.groupId, p_id: input.id, p_job_id: input.jobId,
            p_file_id: input.fileId, p_complete: Boolean(input.complete)
        });
        if (error) return { error: error.message };
        return data as { fileId?: string; stale?: boolean };
    } catch { return { error: 'Could not confirm the Raman reference in Supabase' }; }
}

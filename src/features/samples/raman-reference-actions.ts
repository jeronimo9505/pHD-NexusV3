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

// Compare the whole snapshot to avoid overwriting edits made during an upload.
export async function updateRamanReferenceSyncAction(input: {
    groupId: string; id: string; jobId: string; fileId: string; complete?: boolean;
}) {
    if (!/^[\w-]{1,200}$/.test(input.fileId) || !/^[\w-]{1,100}$/.test(input.jobId)) return { error: 'Invalid reference identifier' };
    try {
        const { client, userId } = await access(input.groupId);
        const { data: current, error } = await client.from('sample_characterizations')
            .select('id, data, samples!inner(group_id)').eq('id', input.id).eq('samples.group_id', input.groupId).eq('type', 'Raman').single();
        if (error || !current) return { error: 'Raman reference is unavailable' };
        const data = current.data as Record<string, any>;
        const job = data.raman_drive_sync;
        if (job?.job_id !== input.jobId || job.status !== 'pending' || job.owner_id !== userId) return { stale: true };
        if (!input.complete && job.file_id) return { fileId: job.file_id as string };
        if (input.complete && job.file_id !== input.fileId) return { stale: true };
        const updated = input.complete
            ? { ...data, raman_spectrum_file_id: input.fileId, raman_drive_sync: {
                job_id: input.jobId, owner_id: userId, status: 'synced', file_id: input.fileId, synced_at: new Date().toISOString() } }
            : { ...data, raman_drive_sync: { ...job, file_id: input.fileId } };
        const { data: written, error: writeError } = await client.from('sample_characterizations').update({ data: updated })
            .eq('id', input.id).eq('data', JSON.stringify(current.data)).select('id').maybeSingle();
        if (writeError) return { error: writeError.message };
        if (!written) return { stale: true };
        return { fileId: input.fileId };
    } catch { return { error: 'Could not confirm the Raman reference in Supabase' }; }
}

import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateSampleInput, Sample } from '../types';

export async function createSampleRecord(input: CreateSampleInput, logbookId: string, requestId: string) {
    const supabase = await createClient() as SupabaseClient;
    const { data, error } = await supabase.rpc('create_sample_safe', {
        p_group_id: input.group_id, p_logbook_id: logbookId, p_request_id: requestId,
        p_parent_id: input.parent_id, p_type: input.type, p_attributes: input.attributes,
        p_composition: input.composition, p_description: input.description ?? '',
    });
    if (error) return { error: error.message };
    if (!data?.id) return { error: 'The new sample could not be confirmed. Retry this draft.' };
    return { data: data as Sample };
}

export async function deleteSampleRecords(groupId: string, logbookId: string, ids: string[]) {
    const supabase = await createClient() as SupabaseClient;
    const { data, error } = await supabase.rpc('delete_samples_safe', {
        p_group_id: groupId, p_logbook_id: logbookId, p_sample_ids: ids,
    });
    if (error) return { error: error.message };
    const deleted = data?.deleted_ids as string[] | undefined;
    if (!deleted || new Set(deleted).size !== new Set(ids).size || ids.some(id => !deleted.includes(id))) {
        return { error: 'Deletion could not be confirmed. Refresh the list before retrying.' };
    }
    return { deletedIds: deleted };
}

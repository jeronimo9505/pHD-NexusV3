import { createClient } from "@/lib/supabase/server";
import type { UpdateSampleInput } from "../types";
export async function updateSampleRecord(input: UpdateSampleInput, groupId: string, userId: string) {
    const supabase = await createClient();

    const { data: current } = await supabase
        .from('samples')
        .select('*')
        .eq('id', input.id)
        .eq('group_id', groupId)
        .single();

    if (!current) return { error: 'Sample not found' };

    const payload: any = {
        updated_at: new Date().toISOString()
    };
    if (input.attributes) payload.attributes = input.attributes;
    if (input.status) payload.status = input.status;
    if (input.description !== undefined) payload.description = input.description;

    if (input.composition) {
        payload.composition = input.composition;
        const newName = input.composition.length > 0
            ? input.composition.map(c => c.code).join('-')
            : 'Empty Sample';
        payload.name = newName;
    }

    if (input.name) {
        payload.name = input.name;
    }

    if (input.sample_code) payload.sample_code = input.sample_code;

    const { data, error } = await supabase
        .from('samples')
        .update(payload)
        .eq('id', input.id)
        .eq('group_id', groupId)
        .select()
        .single();

    if (error) return { error: error.message };

    const changes: Record<string, any> = {};
    if (input.attributes) changes.attributes = { old: current.attributes, new: input.attributes };
    if (input.status) changes.status = { old: current.status, new: input.status };
    if (input.composition) changes.composition = { old: current.composition, new: input.composition };
    if (input.description !== undefined) changes.description = { old: current.description, new: input.description };

    if (Object.keys(changes).length > 0) {
        await supabase.from('sample_audit_log').insert({
            sample_id: input.id,
            user_id: userId,
            action: 'update',
            changes
        });
    }


    return { success: true, data };
}

'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createGroupNoteAction(groupId: string, content: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { error } = await supabase
        .from('group_notes')
        .insert({
            group_id: groupId,
            created_by: user.id,
            content
        });

    if (error) return { error: error.message };
    revalidatePath(`/${groupId}/dashboard`);
    return { success: true };
}

export async function deleteGroupNoteAction(noteId: string, groupId: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('group_notes').delete().eq('id', noteId);

    if (error) return { error: error.message };
    revalidatePath(`/${groupId}/dashboard`);
    return { success: true };
}

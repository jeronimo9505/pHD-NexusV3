'use server';

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getRamanWorkspacesAction(groupId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('raman_workspaces')
        .select('*')
        .eq('group_id', groupId)
        .order('updated_at', { ascending: false });

    if (error) return { error: error.message };
    return { data };
}

export async function saveRamanWorkspaceAction(input: {
    group_id: string;
    name: string;
    description?: string;
    files: any[];
    settings: any;
    id?: string;
}) {
    const supabase = await createClient();
    
    // Get current user for created_by
    const { data: { user } } = await supabase.auth.getUser();
    
    const payload: any = {
        group_id: input.group_id,
        name: input.name,
        description: input.description,
        files: input.files,
        settings: input.settings,
        updated_at: new Date().toISOString()
    };

    if (!input.id) {
        payload.created_by = user?.id;
    }

    let res;
    if (input.id) {
        res = await supabase
            .from('raman_workspaces')
            .update(payload)
            .eq('id', input.id)
            .select()
            .single();
    } else {
        res = await supabase
            .from('raman_workspaces')
            .insert(payload)
            .select()
            .single();
    }

    if (res.error) {
        console.error("Error saving raman workspace:", res.error);
        return { error: res.error.message };
    }
    
    revalidatePath(`/${input.group_id}/map-analyzer`);
    return { data: res.data };
}

export async function deleteRamanWorkspaceAction(id: string, groupId: string) {
    const supabase = await createClient();
    const { error } = await supabase
        .from('raman_workspaces')
        .delete()
        .eq('id', id);

    if (error) return { error: error.message };
    
    revalidatePath(`/${groupId}/map-analyzer`);
    return { success: true };
}

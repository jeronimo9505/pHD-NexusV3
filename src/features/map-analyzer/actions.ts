'use server';

import { createClient, getUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Vault needs persisted H5 links; the Samples table deliberately omits this data.
export async function getVaultSamplesAction(groupId: string, logbookId?: string) {
    if (!groupId || logbookId === '') return { error: 'Select a valid group and logbook' };
    const supabase = await createClient();
    const rows: any[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
        let query = supabase.from('samples').select(logbookId
            ? 'id, name, sample_code, parent_id, logbook_id, description, composition, attributes, characterizations:sample_characterizations(id, type, data, performed_at, created_at)'
            : 'id, name, sample_code, parent_id, logbook_id');
        query = query.eq('group_id', groupId);
        if (logbookId) query = query.eq('logbook_id', logbookId).eq('characterizations.type', 'Raman');
        const { data, error } = await query.order('id').range(offset, offset + pageSize - 1);
        if (error) return { error: error.message };
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
    }
    return { data: rows };
}

export async function getRamanWorkspacesAction(groupId: string) {
    const supabase = await createClient();
    const { data, error } = await (supabase as any)
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
    const user = await getUser();
    
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
        res = await (supabase as any)
            .from('raman_workspaces')
            .update(payload)
            .eq('id', input.id)
            .select()
            .single();
    } else {
        res = await (supabase as any)
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
    const { error } = await (supabase as any)
        .from('raman_workspaces')
        .delete()
        .eq('id', id);

    if (error) return { error: error.message };
    
    revalidatePath(`/${groupId}/map-analyzer`);
    return { success: true };
}

export async function getPipelineTemplatesAction(groupId: string) {
    const { supabase, user, error: accessError } = await getPipelineAccess(groupId);
    if (accessError) return { error: accessError };
    const { data, error } = await (supabase as any)
        .from('pipeline_templates')
        .select('*')
        .eq('group_id', groupId)
        .order('name', { ascending: true });

    if (error) return { error: error.message };
    return { data };
}

export async function savePipelineTemplateAction(input: {
    group_id: string;
    name: string;
    steps: any[];
    id?: string;
}) {
    if (!input.name?.trim() || input.name.trim().length > 200 || !Array.isArray(input.steps)
        || input.steps.length > 100 || JSON.stringify(input.steps).length > 100000) {
        return { error: 'Invalid template name or steps' };
    }
    const { supabase, user, error: accessError } = await getPipelineAccess(input.group_id);
    if (accessError) return { error: accessError };

    const payload: any = {
        group_id: input.group_id,
        name: input.name.trim(),
        steps: input.steps,
        updated_at: new Date().toISOString()
    };

    if (!input.id) {
        payload.created_by = user?.id;
    }

    let res;
    if (input.id) {
        res = await (supabase as any)
            .from('pipeline_templates')
            .update(payload)
            .eq('id', input.id)
            .eq('group_id', input.group_id)
            .select()
            .single();
    } else {
        res = await (supabase as any)
            .from('pipeline_templates')
            .insert(payload)
            .select()
            .single();
    }

    if (res.error) {
        console.error("Error saving pipeline template:", res.error);
        return { error: res.error.code === '23505'
            ? 'A template with this name already exists. Reload templates before retrying.'
            : res.error.message };
    }

    revalidatePath(`/${input.group_id}/map-analyzer`);
    return { data: res.data };
}

export async function deletePipelineTemplateAction(id: string, groupId: string) {
    const { supabase, error: accessError } = await getPipelineAccess(groupId);
    if (accessError) return { error: accessError };
    const { error } = await (supabase as any)
        .from('pipeline_templates')
        .delete()
        .eq('id', id)
        .eq('group_id', groupId);

    if (error) return { error: error.message };

    revalidatePath(`/${groupId}/map-analyzer`);
    return { success: true };
}


async function getPipelineAccess(groupId: string) {
    const supabase = await createClient();
    const user = await getUser();
    if (!user || !groupId) return { supabase, user, error: 'Sign in to access group templates' };
    const { data, error } = await supabase.from('group_members').select('id')
        .eq('group_id', groupId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    return { supabase, user, error: error || !data ? 'Active group membership is required' : null };
}

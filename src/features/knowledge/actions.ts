'use server';

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type KnowledgeItem = {
    id?: string;
    group_id: string;
    title: string;
    url: string;
    content?: string;
    drive_file_id?: string;
    category?: string;
    folder_id?: string;
    description?: string;
    tags?: string[];
    is_pinned?: boolean;
    is_starred?: boolean;
    resource_type?: 'file' | 'link' | 'note';
    created_by?: string;
    created_at?: string;
    updated_at?: string;
};

// ─── READ ────────────────────────────────────────────────────────────
export async function getKnowledgeItemsAction(groupId: string, search?: string, folder?: string) {
    const supabase = await createClient();

    let query = supabase
        .from('knowledge_items')
        .select('*')
        .eq('group_id', groupId)
        .order('is_starred', { ascending: false })
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

    if (folder && folder !== 'all') {
        query = query.eq('category', folder);
    }

    if (search) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching knowledge:', error);
        return { error: error.message };
    }

    return { data };
}

export async function getKnowledgeFoldersAction(groupId: string) {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('knowledge_items')
        .select('category')
        .eq('group_id', groupId)
        .not('category', 'is', null);

    if (error) return { data: [] };

    const folders = Array.from(new Set(data?.map(d => d.category).filter(Boolean) || []));
    return { data: folders.sort() };
}

// ─── CREATE ──────────────────────────────────────────────────────────
export async function createKnowledgeItemAction(item: {
    group_id: string;
    title: string;
    url?: string;
    category?: string;
    description?: string;
    tags?: string[];
    resource_type?: string;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { error } = await supabase.from('knowledge_items').insert({
        group_id: item.group_id,
        title: item.title,
        url: item.url || '',
        content: item.description || '',
        category: item.category || 'General',
        tags: item.tags || [],
        resource_type: item.resource_type || 'link',
        is_starred: false,
        is_pinned: false,
        created_by: user.id,
    });

    if (error) {
        console.error('Create error:', error);
        return { error: error.message };
    }

    revalidatePath(`/${item.group_id}/knowledge`);
    return { success: true };
}

// ─── UPDATE ──────────────────────────────────────────────────────────
export async function updateKnowledgeItemAction(id: string, groupId: string, updates: Partial<KnowledgeItem>) {
    const supabase = await createClient();

    const { error } = await supabase
        .from('knowledge_items')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

    if (error) return { error: error.message };
    revalidatePath(`/${groupId}/knowledge`);
    return { success: true };
}

// ─── DELETE ──────────────────────────────────────────────────────────
export async function deleteKnowledgeItemAction(id: string, groupId: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('knowledge_items').delete().eq('id', id);
    if (error) return { error: error.message };
    revalidatePath(`/${groupId}/knowledge`);
    return { success: true };
}

// ─── TOGGLE STAR ─────────────────────────────────────────────────────
export async function toggleStarAction(id: string, currentStatus: boolean, groupId: string) {
    const supabase = await createClient();
    const { error } = await supabase
        .from('knowledge_items')
        .update({ is_starred: !currentStatus })
        .eq('id', id);

    if (error) return { error: error.message };
    revalidatePath(`/${groupId}/knowledge`);
    return { success: true };
}

// ─── TOGGLE PIN (kept for backwards compat) ──────────────────────────
export async function togglePinAction(id: string, currentStatus: boolean, groupId: string) {
    const supabase = await createClient();
    const { error } = await supabase
        .from('knowledge_items')
        .update({ is_pinned: !currentStatus })
        .eq('id', id);

    if (error) return { error: error.message };
    revalidatePath(`/${groupId}/knowledge`);
    return { success: true };
}

// ─── SYNC FROM DRIVE ─────────────────────────────────────────────────
export async function syncKnowledgeItemsAction(groupId: string, items: KnowledgeItem[]) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Unauthorized' };

    const { data: existing } = await supabase
        .from('knowledge_items')
        .select('id, drive_file_id')
        .eq('group_id', groupId)
        .not('drive_file_id', 'is', null);

    const map = new Map(existing?.map(e => [e.drive_file_id, e.id]));

    const payload = items.map(item => ({
        ...item,
        id: item.drive_file_id ? map.get(item.drive_file_id) : undefined,
        content: item.description || '',
        resource_type: 'file',
        created_by: user.id,
        updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
        .from('knowledge_items')
        .upsert(payload, { onConflict: 'id' });

    if (error) {
        console.error('Sync error:', error);
        return { error: error.message };
    }

    revalidatePath(`/${groupId}/knowledge`);
    return { success: true, count: items.length };
}

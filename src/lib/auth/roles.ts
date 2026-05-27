import { createClient, getUser } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

export type GroupRole = Database['public']['Tables']['group_members']['Row']['role'];
export type SystemRole = 'admin' | 'user';

interface PermissionCheck {
    action: 'create' | 'read' | 'update' | 'delete';
    resource: 'report' | 'task' | 'group' | 'settings';
}

// Deduplicated per (groupId, userId) pair within a single request.
// Both the layout and the page call getGroupRole — cache() ensures the DB
// query only executes once even if called multiple times with the same args.
const fetchGroupRole = cache(async (groupId: string, userId: string): Promise<GroupRole | null> => {
    const supabase = await createClient();
    const { data: member } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .single();
    return member?.role || null;
});

/**
 * Fetches the current user's role in a specific group.
 * Accepts optional supabase client and userId to avoid redundant auth calls.
 */
export async function getGroupRole(groupId: string, supabase?: SupabaseClient, userId?: string): Promise<GroupRole | null> {
    let uid = userId;
    if (!uid) {
        const user = await getUser();
        if (!user) return null;
        uid = user.id;
    }
    return fetchGroupRole(groupId, uid);
}

/**
 * Fetches the current user's system-level role (admin | user).
 * Accepts optional supabase client and userId to avoid redundant auth calls.
 */
export async function getSystemRole(supabase?: SupabaseClient, userId?: string): Promise<SystemRole | null> {
    const sb = supabase || await createClient();
    let uid = userId;
    if (!uid) {
        const user = await getUser();
        if (!user) return null;
        uid = user.id;
    }

    const { data: profile } = await sb
        .from('profiles')
        .select('system_role')
        .eq('id', uid)
        .single();

    return (profile?.system_role as SystemRole) || null;
}

/**
 * Checks if the current user is the creator (owner) of a group.
 */
export async function isGroupOwner(groupId: string): Promise<boolean> {
    try {
        const user = await getUser();
        if (!user) return false;

        const supabase = await createClient();
        const { data: group, error } = await supabase
            .from('groups')
            .select('created_by')
            .eq('id', groupId)
            .single();

        if (error || !group) {
            console.warn(`[isGroupOwner] Group not found or query error for ID ${groupId}:`, error?.message);
            return false;
        }

        return group.created_by === user.id;
    } catch (e) {
        console.error("[isGroupOwner] Unexpected error:", e);
        return false;
    }
}

/**
 * Returns true if the group role has admin-level permissions in the group.
 */
export function isGroupAdmin(role: GroupRole | null): boolean {
    return role === 'supervisor' || role === 'labmanager';
}

export function can(role: GroupRole, action: PermissionCheck['action'], resource: PermissionCheck['resource']): boolean {
    if (isGroupAdmin(role)) return true;

    switch (resource) {
        case 'report':
            return true; // Everyone can CRUD their own reports (RLS handles ownership)
        case 'task':
            return true;
        case 'group':
            return false; // Only admins can manage group settings
        case 'settings':
            return false;
        default:
            return false;
    }
}

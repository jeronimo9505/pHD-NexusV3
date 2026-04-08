import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { SupabaseClient } from "@supabase/supabase-js";

export type GroupRole = Database['public']['Tables']['group_members']['Row']['role'];
export type SystemRole = 'admin' | 'user';

interface PermissionCheck {
    action: 'create' | 'read' | 'update' | 'delete';
    resource: 'report' | 'task' | 'group' | 'settings';
}

/**
 * Fetches the current user's role in a specific group.
 * Accepts optional supabase client and userId to avoid redundant auth calls.
 */
export async function getGroupRole(groupId: string, supabase?: SupabaseClient, userId?: string): Promise<GroupRole | null> {
    const sb = supabase || await createClient();
    let uid = userId;
    if (!uid) {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return null;
        uid = user.id;
    }

    const { data: member } = await sb
        .from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', uid)
        .single();

    return member?.role || null;
}

/**
 * Fetches the current user's system-level role (admin | user).
 * Accepts optional supabase client and userId to avoid redundant auth calls.
 */
export async function getSystemRole(supabase?: SupabaseClient, userId?: string): Promise<SystemRole | null> {
    const sb = supabase || await createClient();
    let uid = userId;
    if (!uid) {
        const { data: { user } } = await sb.auth.getUser();
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return false;

    const { data: group } = await supabase
        .from('groups')
        .select('created_by')
        .eq('id', groupId)
        .single();

    return group?.created_by === user.id;
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

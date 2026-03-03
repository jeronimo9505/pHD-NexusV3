import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";

export type GroupRole = Database['public']['Tables']['group_members']['Row']['role'];
export type SystemRole = 'admin' | 'user';

interface PermissionCheck {
    action: 'create' | 'read' | 'update' | 'delete';
    resource: 'report' | 'task' | 'group' | 'settings';
}

/**
 * Fetches the current user's role in a specific group.
 */
export async function getGroupRole(groupId: string): Promise<GroupRole | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: member } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();

    return member?.role || null;
}

/**
 * Fetches the current user's system-level role (admin | user).
 */
export async function getSystemRole(): Promise<SystemRole | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: profile } = await supabase
        .from('profiles')
        .select('system_role')
        .eq('id', user.id)
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

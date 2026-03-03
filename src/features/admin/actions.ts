'use server';

import { createClient } from "@/lib/supabase/server";
import { getSystemRole } from "@/lib/auth/roles";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
    const role = await getSystemRole();
    if (role !== 'admin') throw new Error('Unauthorized: admin only');
    return role;
}

// ─── LIST ALL USERS ──────────────────────────────────────────────
export async function listAllUsers() {
    await requireAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return { error: error.message };
    return { data };
}

// ─── UPDATE USER SYSTEM ROLE ─────────────────────────────────────
export async function updateUserSystemRoleAction(userId: string, newRole: 'admin' | 'user') {
    await requireAdmin();
    const supabase = await createClient();

    const { error } = await supabase
        .from('profiles')
        .update({ system_role: newRole })
        .eq('id', userId);

    if (error) return { error: error.message };

    revalidatePath('/admin');
    return { success: true };
}

// ─── UPDATE USER STATUS ──────────────────────────────────────────
export async function updateUserStatusAction(userId: string, newStatus: 'active' | 'pending' | 'inactive') {
    await requireAdmin();
    const supabase = await createClient();

    const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', userId);

    if (error) return { error: error.message };

    revalidatePath('/admin');
    return { success: true };
}

// ─── LIST ALL GROUPS ─────────────────────────────────────────────
export async function listAllGroups() {
    await requireAdmin();
    const supabase = await createClient();

    const { data: groups, error } = await supabase
        .from('groups')
        .select(`
            *,
            group_members(count)
        `)
        .order('created_at', { ascending: false });

    if (error) return { error: error.message };
    return { data: groups };
}

// ─── DELETE GROUP ────────────────────────────────────────────────
export async function deleteGroupAction(groupId: string) {
    await requireAdmin();
    const supabase = await createClient();

    const { error } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupId);

    if (error) return { error: error.message };

    revalidatePath('/admin');
    return { success: true };
}

// ─── PLATFORM STATS ──────────────────────────────────────────────
export async function getPlatformStats() {
    await requireAdmin();
    const supabase = await createClient();

    const [users, groups, reports, tasks] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('groups').select('*', { count: 'exact', head: true }),
        supabase.from('reports').select('*', { count: 'exact', head: true }),
        supabase.from('tasks').select('*', { count: 'exact', head: true }),
    ]);

    return {
        data: {
            totalUsers: users.count || 0,
            totalGroups: groups.count || 0,
            totalReports: reports.count || 0,
            totalTasks: tasks.count || 0,
        }
    };
}

// ─── DELETE USER ─────────────────────────────────────────────────
export async function deleteUserAction(userId: string) {
    await requireAdmin();
    const supabase = await createClient();

    // Delete from profiles (auth user deletion requires service role; profile deletion is sufficient for app)
    const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

    if (error) return { error: error.message };
    revalidatePath('/admin');
    return { success: true };
}

// ─── ALL PENDING JOIN REQUESTS (across all groups) ────────────────
export async function getAllPendingRequestsAction() {
    await requireAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('group_members')
        .select(`
            id,
            group_id,
            user_id,
            role,
            created_at,
            profiles(full_name, email),
            groups(name)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) return { error: error.message, data: [] };
    return { data: data ?? [] };
}


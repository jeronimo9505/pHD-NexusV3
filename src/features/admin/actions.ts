'use server';

import { createClient } from "@/lib/supabase/server";
import { getSystemRole } from "@/lib/auth/roles";
import { revalidatePath } from "next/cache";
type AdminClient = Awaited<ReturnType<typeof createClient>>;

async function requireAdmin() {
    const role = await getSystemRole();
    if (role !== 'admin') throw new Error('Unauthorized: admin only');
    return role;
}

// ─── LIST ALL USERS ──────────────────────────────────────────────
export async function listAllUsers() {
    await requireAdmin();
    return readAllUsers(await createClient());
}

async function readAllUsers(supabase: AdminClient) {

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
    return readAllGroups(await createClient());
}

async function readAllGroups(supabase: AdminClient) {

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
    return readPlatformStats(await createClient());
}

async function readPlatformStats(supabase: AdminClient) {

    const [users, groups, reports, tasks] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('groups').select('*', { count: 'exact', head: true }),
        supabase.from('reports').select('*', { count: 'exact', head: true }),
        supabase.from('tasks').select('*', { count: 'exact', head: true }),
    ]);

    const failed = [users, groups, reports, tasks].find(result => result.error);
    if (failed?.error) return { error: failed.error.message };

    return {
        data: {
            totalUsers: users.count || 0,
            totalGroups: groups.count || 0,
            totalReports: reports.count || 0,
            totalTasks: tasks.count || 0,
        }
    };
}

// Called once from the server page, or once for an explicit refresh. The
// browser's Server Action queue no longer serializes four independent reads.
export async function getAdminSnapshotAction() {
    await requireAdmin();
    const supabase = await createClient();
    const [users, groups, stats, notifications] = await Promise.all([
        readAllUsers(supabase), readAllGroups(supabase), readPlatformStats(supabase), readPendingRequests(supabase),
    ]);
    const error = users.error || groups.error || stats.error || notifications.error;
    if (error || !stats.data) throw new Error(error || 'Unable to load administration');
    return { users: users.data ?? [], groups: groups.data ?? [], stats: stats.data, notifications: notifications.data ?? [] };
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
    return readPendingRequests(await createClient());
}

async function readPendingRequests(supabase: AdminClient) {

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

// ─── UPDATE GROUP VISIBLE MODULES (Platform Admin) ───────────────
export async function updateGroupModulesByAdminAction(groupId: string, visibleModules: string[]) {
    await requireAdmin();
    const supabase = await createClient();

    const { error } = await supabase
        .from('groups')
        .update({ visible_modules: visibleModules } as any)
        .eq('id', groupId);

    if (error) return { error: error.message };

    revalidatePath(`/${groupId}`);
    revalidatePath(`/${groupId}/settings`);
    revalidatePath('/admin');
    return { success: true };
}


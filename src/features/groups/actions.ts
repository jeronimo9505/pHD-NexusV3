'use server';

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "next/navigation";

// Schemas
const createGroupSchema = z.object({
    name: z.string().min(3),
    description: z.string().optional(),
});

const joinGroupSchema = z.object({
    code: z.string().min(4),
});

export async function createGroupAction(formData: FormData) {
    const supabase = await createClient();
    const rawData = {
        name: formData.get('name'),
        description: formData.get('description'),
    };

    const validation = createGroupSchema.safeParse(rawData);

    if (!validation.success) {
        return { error: 'Validation failed' };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    // Generate a random code (simple implementation for now)
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data: group, error } = await supabase.from('groups').insert({
        name: validation.data.name,
        description: validation.data.description,
        created_by: user.id,
        code: code,
    }).select().single();

    if (error) {
        console.error(error);
        return { error: error.message };
    }

    // Auto-add creator as owner/admin
    const { error: memberError } = await supabase.from('group_members').insert({
        group_id: group.id,
        user_id: user.id,
        role: 'supervisor', // Default for creator
        status: 'active'
    });

    if (memberError) {
        // Cleanup if member creation fails (optional but good practice)
        return { error: 'Failed to add owner to group' };
    }

    redirect(`/${group.id}/dashboard`);
}

export async function joinGroupAction(formData: FormData) {
    const supabase = await createClient();
    const code = formData.get('code');

    const validation = joinGroupSchema.safeParse({ code });
    if (!validation.success) return { error: 'Invalid code' };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    // Find group
    const { data: group } = await supabase.from('groups').select('id').eq('code', validation.data.code).single();

    if (!group) return { error: 'Group not found' };

    // Check if already member
    const { data: existing } = await supabase.from('group_members')
        .select('id')
        .eq('group_id', group.id)
        .eq('user_id', user.id)
        .single();

    if (existing) return { error: 'Already a member' };

    const { error } = await supabase.from('group_members').insert({
        group_id: group.id,
        user_id: user.id,
        role: 'student',
        status: 'pending'
    });

    if (error) return { error: error.message };
    revalidatePath('/dashboard');
    return { success: true, groupId: group.id };
}


// Settings Actions

const updateGroupSchema = z.object({
    groupId: z.string(),
    name: z.string().min(3),
    description: z.string().optional(),
});

export async function updateGroupAction(formData: FormData) {
    const supabase = await createClient();
    const rawData = {
        groupId: formData.get('groupId'),
        name: formData.get('name'),
        description: formData.get('description'),
    };

    const validation = updateGroupSchema.safeParse(rawData);
    if (!validation.success) return { error: 'Validation failed' };

    // Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    // RBAC Check (Must be admin)
    const { data: member } = await supabase.from('group_members')
        .select('role')
        .eq('group_id', validation.data.groupId)
        .eq('user_id', user.id)
        .single();

    if (!member || !['supervisor', 'labmanager', 'owner'].includes(member.role)) {
        return { error: 'Insufficient permissions' };
    }

    const { error } = await supabase.from('groups')
        .update({
            name: validation.data.name,
            description: validation.data.description
        })
        .eq('id', validation.data.groupId);

    if (error) return { error: error.message };

    revalidatePath(`/${validation.data.groupId}/settings`);
    return { success: true };
}

const updateRoleSchema = z.object({
    groupId: z.string(),
    userId: z.string(),
    role: z.string(),
});

export async function updateMemberRoleAction(formData: FormData) {
    const supabase = await createClient();
    const rawData = {
        groupId: formData.get('groupId'),
        userId: formData.get('userId'),
        role: formData.get('role'),
    };

    const validation = updateRoleSchema.safeParse(rawData);
    if (!validation.success) return { error: 'Validation failed' };

    // Auth & Permission Check (Ideally refactor this into a reusable checks function)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { data: currentUserMember } = await supabase.from('group_members')
        .select('role')
        .eq('group_id', validation.data.groupId)
        .eq('user_id', user.id)
        .single();

    if (!currentUserMember || !['supervisor', 'labmanager', 'owner'].includes(currentUserMember.role)) {
        return { error: 'Permission denied' };
    }

    const { error } = await supabase.from('group_members')
        .update({ role: validation.data.role })
        .eq('group_id', validation.data.groupId)
        .eq('user_id', validation.data.userId);

    if (error) return { error: error.message };

    revalidatePath(`/${validation.data.groupId}/settings`);
    return { success: true };
}

export async function removeMemberAction(formData: FormData) {
    const supabase = await createClient();
    const groupId = formData.get('groupId') as string;
    const userId = formData.get('userId') as string;

    if (!groupId || !userId) return { error: 'Missing data' };

    // Auth & Permission Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { data: currentUserMember } = await supabase.from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();

    if (!currentUserMember || !['supervisor', 'labmanager', 'owner'].includes(currentUserMember.role)) {
        return { error: 'Permission denied' };
    }

    const { error } = await supabase.from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);

    if (error) return { error: error.message };

    revalidatePath(`/${groupId}/settings`);
    return { success: true };
}

// Drive Settings Actions
const driveSettingsSchema = z.object({
    groupId: z.string(),
    clientId: z.string().min(1, "Client ID is required"),
    apiKey: z.string().min(1, "API Key is required"),
    folderId: z.string().min(1, "Folder ID is required"),
    reportFolderId: z.string().optional(),
    meetingFolderId: z.string().optional(),
    pptFolderId: z.string().optional(),
    sampleFolderId: z.string().optional(),
    calendarId: z.string().optional(),
});

export async function updateDriveSettingsAction(formData: FormData) {
    const supabase = await createClient();
    const rawData = {
        groupId: formData.get('groupId'),
        clientId: formData.get('clientId'),
        apiKey: formData.get('apiKey'),
        folderId: formData.get('folderId'),
        reportFolderId: formData.get('reportFolderId'),
        meetingFolderId: formData.get('meetingFolderId'),
        pptFolderId: formData.get('pptFolderId'),
        sampleFolderId: formData.get('sampleFolderId'),
        calendarId: formData.get('calendarId'),
    };

    const validation = driveSettingsSchema.safeParse(rawData);
    if (!validation.success) return { error: 'Validation failed' };

    // Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    // RBAC Check
    const { data: member } = await supabase.from('group_members')
        .select('role')
        .eq('group_id', validation.data.groupId)
        .eq('user_id', user.id)
        .single();

    if (!member || !['supervisor', 'labmanager', 'owner'].includes(member.role)) {
        return { error: 'Insufficient permissions' };
    }

    const { error } = await supabase.from('groups')
        .update({
            drive_settings: {
                clientId: validation.data.clientId,
                apiKey: validation.data.apiKey,
                folderId: validation.data.folderId,
                reportFolderId: validation.data.reportFolderId,
                meetingFolderId: validation.data.meetingFolderId,
                pptFolderId: validation.data.pptFolderId,
                sampleFolderId: validation.data.sampleFolderId,
                calendarId: validation.data.calendarId,
            }
        })
        .eq('id', validation.data.groupId);

    if (error) return { error: error.message };

    revalidatePath(`/${validation.data.groupId}/settings`);
    return { success: true };
}

// ─── SEARCH PLATFORM USERS (for invite) ──────────────────────────
export async function searchPlatformUsersAction(searchQuery: string, groupId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    // Permission check
    const { data: currentMember } = await supabase.from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();

    if (!currentMember || !['supervisor', 'labmanager', 'owner'].includes(currentMember.role)) {
        return { error: 'Permission denied' };
    }

    // Get existing group member IDs
    const { data: existingMembers } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

    const existingIds = (existingMembers || []).map(m => m.user_id);

    // Search profiles (by name or email) excluding existing members
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .not('id', 'in', `(${existingIds.length > 0 ? existingIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
        .limit(10);

    if (error) return { error: error.message };
    return { data: profiles || [] };
}

// ─── INVITE MEMBER TO GROUP ──────────────────────────────────────
export async function inviteMemberAction(groupId: string, targetUserId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    // Permission check
    const { data: currentMember } = await supabase.from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();

    if (!currentMember || !['supervisor', 'labmanager', 'owner'].includes(currentMember.role)) {
        return { error: 'Permission denied' };
    }

    // Check not already a member
    const { data: existing } = await supabase.from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', targetUserId)
        .single();

    if (existing) return { error: 'User is already a member of this group' };

    const { error } = await supabase.from('group_members').insert({
        group_id: groupId,
        user_id: targetUserId,
        role: 'student',
        status: 'active',
    });

    if (error) return { error: error.message };

    revalidatePath(`/${groupId}/settings`);
    return { success: true };
}

// ─── DEFAULT GROUP PREFERENCE ─────────────────────────────────────
export async function setDefaultGroupAction(groupId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { error } = await supabase
        .from('profiles')
        .update({ default_group_id: groupId } as any)
        .eq('id', user.id);

    if (error) return { error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
}

export async function clearDefaultGroupAction() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { error } = await supabase
        .from('profiles')
        .update({ default_group_id: null } as any)
        .eq('id', user.id);

    if (error) return { error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
}

// ─── GROUP DISCOVERY ──────────────────────────────────────────────
export async function getAllGroupsAction() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized', data: [] };

    // Fetch all groups with owner profile
    const { data: groups, error } = await supabase
        .from('groups')
        .select('id, name, description, code, created_by, profiles!groups_created_by_fkey(full_name, email)')
        .order('created_at', { ascending: false });

    if (error) return { error: error.message, data: [] };

    // Fetch user's current memberships (to know which groups they are in / pending)
    const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id, status')
        .eq('user_id', user.id);

    const membershipMap = new Map(memberships?.map(m => [m.group_id, m.status]) ?? []);

    const enriched = (groups ?? []).map((g: any) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        code: g.code,
        created_by: g.created_by,
        owner_name: g.profiles?.full_name || g.profiles?.email || 'Unknown',
        memberStatus: membershipMap.get(g.id) ?? null, // 'active' | 'pending' | null
    }));

    return { data: enriched };
}

// ─── REQUEST TO JOIN ──────────────────────────────────────────────
export async function requestJoinGroupAction(groupId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    // Check not already member/pending
    const { data: existing } = await supabase
        .from('group_members')
        .select('id, status')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();

    if (existing) {
        return { error: existing.status === 'pending' ? 'Request already sent' : 'Already a member' };
    }

    const { error } = await supabase.from('group_members').insert({
        group_id: groupId,
        user_id: user.id,
        role: 'student',
        status: 'pending',
    });

    if (error) return { error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
}

// ─── APPROVE / REJECT JOIN REQUEST ────────────────────────────────
export async function approveJoinRequestAction(memberId: string, groupId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { error } = await supabase
        .from('group_members')
        .update({ status: 'active' })
        .eq('id', memberId)
        .eq('group_id', groupId);

    if (error) return { error: error.message };
    revalidatePath(`/${groupId}/settings`);
    return { success: true };
}

export async function rejectJoinRequestAction(memberId: string, groupId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('id', memberId)
        .eq('group_id', groupId);

    if (error) return { error: error.message };
    revalidatePath(`/${groupId}/settings`);
    return { success: true };
}



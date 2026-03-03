'use server';

import { createClient } from "@/lib/supabase/server";

export async function getGroupMembersAction(groupId: string) {
    const supabase = await createClient();

    const { data: members, error } = await supabase
        .from('group_members')
        .select(`
            user_id,
            role,
            profile:profiles(full_name, avatar_url)
        `)
        .eq('group_id', groupId);

    if (error) {
        console.error("Error fetching group members:", error);
        return { error: error.message };
    }

    return {
        data: members?.map(m => ({
            user_id: m.user_id,
            role: m.role,
            profile: m.profile
        })) || []
    };
}

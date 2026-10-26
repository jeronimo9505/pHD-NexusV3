import { cache } from 'react';
import { createClient, getUser } from './server';

// Request-scoped only: never share private group/profile data across users.
export const getCurrentProfile = cache(async () => {
    const user = await getUser();
    if (!user) return null;
    const supabase = await createClient();
    const { data, error } = await supabase.from('profiles')
        .select('full_name, system_role, default_group_id').eq('id', user.id).single();
    if (error) throw new Error('Could not load your profile');
    return data;
});

export const getGroupSummary = cache(async (groupId: string) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from('groups')
        .select('id, name, drive_settings, created_by').eq('id', groupId).single();
    if (error) throw new Error('Could not load group settings');
    return data;
});

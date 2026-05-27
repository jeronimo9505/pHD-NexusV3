import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "./DashboardClient";
import { getAllGroupsAction } from "@/features/groups/actions";

export default async function DashboardRoot() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect('/login');

    // Fetch profile (system_role + default_group_id)
    const { data: profile } = await supabase
        .from('profiles')
        .select('system_role, default_group_id')
        .eq('id', user.id)
        .single();

    const isSysAdmin = profile?.system_role === 'admin';
    const defaultGroupId = (profile as any)?.default_group_id ?? null;

    // Fetch all groups with membership status for current user
    const { data: allGroups } = await getAllGroupsAction();

    // User's active groups
    const myGroups = (allGroups ?? []).filter(g => g.memberStatus === 'active');

    // Auto-redirect to default group if set and user is an active member
    if (defaultGroupId && myGroups.some(g => g.id === defaultGroupId)) {
        redirect(`/${defaultGroupId}/dashboard`);
    }

    return (
        <DashboardClient
            allGroups={allGroups ?? []}
            myGroups={myGroups}
            defaultGroupId={defaultGroupId}
            userEmail={user.email ?? ''}
            isSysAdmin={isSysAdmin}
        />
    );
}

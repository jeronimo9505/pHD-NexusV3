import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "./DashboardClient";
import { getAllGroupsAction } from "@/features/groups/actions";
import { getGroupRole } from '@/lib/auth/roles';
import { getCurrentProfile } from '@/lib/supabase/queries';

interface PageProps {
    searchParams: Promise<{ noredirect?: string }>;
}

export default async function DashboardRoot({ searchParams }: PageProps) {
    const params = await searchParams;
    const noRedirect = params?.noredirect === 'true';

    const user = await getUser();

    if (!user) redirect('/login');

    // Fetch profile (system_role + default_group_id)
    const profile = await getCurrentProfile();

    const isSysAdmin = profile?.system_role === 'admin';
    const defaultGroupId = (profile as any)?.default_group_id ?? null;

    // Login dispatch needs only the default membership, not the full group
    // directory and owner profiles. Never redirect an inactive membership.
    if (!noRedirect && defaultGroupId && await getGroupRole(defaultGroupId)) {
        redirect(`/${defaultGroupId}/dashboard`);
    }

    // Fetch all groups with membership status for current user
    const { data: allGroups, error } = await getAllGroupsAction();
    if (error) throw new Error('Unable to load group directory');

    // User's active groups
    const myGroups = (allGroups ?? []).filter(g => g.memberStatus === 'active');

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

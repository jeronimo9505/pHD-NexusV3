import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { Sidebar } from "@/components/layout/sidebar";
import { getGroupRole, getSystemRole } from "@/lib/auth/roles";
import { GoogleTokenSync } from "@/components/layout/GoogleTokenSync";
import { SessionTracker } from "@/components/layout/SessionTracker";

interface GroupLayoutProps {
    children: React.ReactNode;
    params: Promise<{ groupId: string }>;
}

export default async function GroupLayout(props: GroupLayoutProps) {
    const { groupId } = await props.params;
    const supabase = await createClient();

    // Fetch all needed data in parallel
    const userData = await supabase.auth.getUser();
    const user = userData.data.user;
    const userId = user?.id;

    const [role, systemRole, membershipsData] = await Promise.all([
        getGroupRole(groupId),
        getSystemRole(),
        userId
            ? supabase.from('group_members')
                .select('group_id, groups(id, name, code)')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
    ]);

    if (!role) {
        redirect('/dashboard');
    }

    // Deduplicate groups by id
    const groupsMap = new Map<string, { id: string; name: string; code: string }>();
    if (membershipsData.data) {
        for (const m of membershipsData.data as any[]) {
            if (m.groups && !groupsMap.has(m.groups.id)) {
                groupsMap.set(m.groups.id, m.groups);
            }
        }
    }
    const userGroups = Array.from(groupsMap.values());

    // Get user profile
    let userName: string | null = null;
    let userEmail = user?.email || null;
    if (userId) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', userId)
            .single();
        userName = profile?.full_name || null;
    }

    return (
        <Shell sidebar={
            <Sidebar
                groupId={groupId}
                role={role}
                systemRole={systemRole}
                userName={userName}
                userEmail={userEmail}
                groups={userGroups}
            />
        }>
            <GoogleTokenSync />
            <SessionTracker groupId={groupId} />
            {props.children}
        </Shell>
    );
}

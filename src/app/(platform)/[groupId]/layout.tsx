import { createClient, getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { Sidebar } from "@/components/layout/sidebar";
import { getGroupRole } from "@/lib/auth/roles";
import { getCurrentProfile } from '@/lib/supabase/queries';
import { GoogleTokenSync } from "@/components/layout/GoogleTokenSync";
import { SessionTracker } from "@/components/layout/SessionTracker";

interface GroupLayoutProps {
    children: React.ReactNode;
    params: Promise<{ groupId: string }>;
}

export default async function GroupLayout(props: GroupLayoutProps) {
    const { groupId } = await props.params;
    const [supabase, user] = await Promise.all([createClient(), getUser()]);
    const userId = user?.id;

    // Fetch all needed data in parallel, reusing supabase client + userId
    const [role, membershipsData, profile] = await Promise.all([
        getGroupRole(groupId, supabase, userId),
        userId
            ? supabase.from('group_members')
                .select('group_id, groups(id, name, code, visible_modules, created_by)')
                .eq('user_id', userId)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
        getCurrentProfile(),
    ]);

    if (!role) {
        redirect('/dashboard');
    }

    // Deduplicate groups by id
    const groupsMap = new Map<string, { id: string; name: string; code: string; visible_modules?: string[] | null }>();
    if (membershipsData.data) {
        for (const m of membershipsData.data as any[]) {
            if (m.groups && !groupsMap.has(m.groups.id)) {
                groupsMap.set(m.groups.id, m.groups);
            }
        }
    }
    const userGroups = Array.from(groupsMap.values());

    // The membership query already returns the current group's public metadata.
    const isOwner = membershipsData.data?.some(m => m.groups?.id === groupId && m.groups.created_by === userId) ?? false;
    const systemRole = profile?.system_role === 'admin' ? 'admin' : 'user';
    const userName = profile?.full_name || null;
    const userEmail = user?.email || null;

    return (
        <Shell sidebar={
            <Sidebar
                groupId={groupId}
                role={role}
                systemRole={systemRole}
                userName={userName}
                userEmail={userEmail}
                groups={userGroups}
                isOwner={isOwner}
            />
        }>
            <GoogleTokenSync />
            {userId && <SessionTracker groupId={groupId} userId={userId} />}
            {props.children}
        </Shell>
    );
}

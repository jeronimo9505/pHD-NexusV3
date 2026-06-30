import { createClient, getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { Sidebar } from "@/components/layout/sidebar";
import { getGroupRole, getSystemRole } from "@/lib/auth/roles";
import { GoogleTokenSync } from "@/components/layout/GoogleTokenSync";
import { GoogleScriptPreloader } from "@/components/layout/GoogleScriptPreloader";
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
    const [role, systemRole, membershipsData, profileData, groupData] = await Promise.all([
        getGroupRole(groupId, supabase, userId),
        getSystemRole(supabase, userId),
        userId
            ? supabase.from('group_members')
                .select('group_id, groups(id, name, code, visible_modules)')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
        userId
            ? supabase.from('profiles')
                .select('full_name')
                .eq('id', userId)
                .single()
            : Promise.resolve({ data: null }),
        supabase.from('groups')
            .select('drive_settings, created_by')
            .eq('id', groupId)
            .single(),
    ]);

    const isOwner = userId ? groupData.data?.created_by === userId : false;

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

    const userName = profileData.data?.full_name || null;
    const userEmail = user?.email || null;
    const driveSettings = groupData.data?.drive_settings as { clientId?: string; apiKey?: string } | undefined;

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
            <GoogleScriptPreloader apiKey={driveSettings?.apiKey} clientId={driveSettings?.clientId} />
            <SessionTracker groupId={groupId} />
            {props.children}
        </Shell>
    );
}

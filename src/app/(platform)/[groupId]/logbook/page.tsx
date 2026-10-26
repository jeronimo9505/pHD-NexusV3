import { createClient, getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogbookView from "@/features/logbook/components/LogbookView";
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGroupRole } from '@/lib/auth/roles';

interface PageProps {
    params: Promise<{ groupId: string }>;
}

export const metadata = {
    title: "Logbook | PHD Nexus",
    description: "Your personal research logbook connected with Telegram",
};

export default async function LogbookPage({ params }: PageProps) {
    const { groupId } = await params;
    const [user, role] = await Promise.all([getUser(), getGroupRole(groupId)]);
    if (!user) redirect('/login');
    if (!role) redirect('/dashboard');

    const supabase = await createClient();
    const [groupResult, entriesResult, tasksResult] = await Promise.all([supabase
        .from('groups')
        .select('logbook_is_private, created_by')
        .eq('id', groupId)
        .single() as any,
        (supabase as SupabaseClient).from('logbook_entries').select('*')
            .eq('group_id', groupId).order('created_at', { ascending: false }).limit(50),
        supabase.from('tasks').select('id, status').eq('group_id', groupId),
    ]);
    const group = groupResult.data;

    const isPrivate = group?.logbook_is_private || false;
    const isOwner = group?.created_by === user.id;

    return (
        <div className="h-full flex flex-col">
            <LogbookView 
                key={groupId}
                groupId={groupId} 
                userId={user.id} 
                isPrivate={isPrivate}
                isOwner={isOwner}
                initialEntries={entriesResult.error ? undefined : entriesResult.data ?? []}
                initialTasks={tasksResult.error ? undefined : tasksResult.data ?? []}
            />
        </div>
    );
}

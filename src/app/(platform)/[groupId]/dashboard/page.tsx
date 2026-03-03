import { createClient } from "@/lib/supabase/server";
import { getGroupRole } from "@/lib/auth/roles";
import { PendingReviewCard } from "@/features/dashboard/components/pending-review-card";
import { NotesWidget } from "@/features/dashboard/components/notes-widget";
import { MyPendingTasksWidget } from "@/features/dashboard/components/my-tasks-widget";
import { NextMeetingsWidget } from "@/features/dashboard/components/next-meetings-widget";
import { Users } from "lucide-react";

export default async function GroupDashboardPage({
    params,
}: {
    params: Promise<{ groupId: string }>;
}) {
    const { groupId } = await params;
    const supabase = await createClient();

    const role = await getGroupRole(groupId);
    const canReview = role === 'supervisor' || role === 'labmanager' || role === 'owner';

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    const today = new Date().toISOString();

    // Parallel Data Fetching
    const [
        { data: group },
        { count: memberCount },
        { data: pendingReports, count: pendingCount },
        { data: myTasks },
        { data: upcomingEvents },
        { data: notes },
        { data: unseenDriveReports },
    ] = await Promise.all([
        supabase.from('groups').select('name').eq('id', groupId).single(),

        supabase.from('group_members').select('*', { count: 'exact', head: true })
            .eq('group_id', groupId).eq('status', 'active'),

        supabase.from('reports')
            .select('id, group_id, week_start, week_end, status, submitted_at, reviewed_at, author:profiles!author_id(full_name, email)', { count: 'exact' })
            .eq('group_id', groupId)
            .eq('status', 'submitted')
            .order('submitted_at', { ascending: true }),

        // My pending tasks: created by current user, not done
        supabase.from('tasks')
            .select('id, title, status, priority, due_date')
            .eq('group_id', groupId)
            .eq('created_by', user?.id ?? '')
            .neq('status', 'done')
            .order('due_date', { ascending: true })
            .limit(10),

        // Upcoming calendar events
        supabase.from('calendar_events')
            .select('id, title, start_at, end_at, all_day, location, url, color')
            .eq('group_id', groupId)
            .gte('start_at', today)
            .order('start_at', { ascending: true })
            .limit(5),

        // Group notes
        supabase.from('group_notes')
            .select('*, creator:profiles!created_by(full_name)')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
            .limit(20),

        // Drive reports not yet seen by the current user (seen_by is a jsonb array of user ids)
        supabase.from('drive_reports')
            .select('id, group_id, name, title, type, created_at, author_name, author:profiles!author_id(full_name)')
            .eq('group_id', groupId)
            .not('seen_by', 'cs', `["${user?.id}"]`)
            .order('created_at', { ascending: false })
            .limit(20),
    ]);

    return (
        <div className="space-y-6 animate-in fade-in-50 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
                    <p className="text-slate-500">
                        Overview for <span className="font-semibold">{group?.name}</span>
                    </p>
                </div>
                {/* Active Members pill */}
                <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
                    <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                        <Users size={16} className="text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-slate-500">Active Members</p>
                        <p className="text-xl font-bold text-slate-900 leading-tight">{memberCount ?? 0}</p>
                    </div>
                </div>
            </div>

            {/* Top row: Pending Review + Next Meetings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <PendingReviewCard
                        count={pendingCount || 0}
                        pendingReports={(pendingReports as any[]) ?? []}
                        canReview={canReview}
                        unseenDriveReports={(unseenDriveReports as any[]) ?? []}
                        groupId={groupId}
                    />
                </div>
                <NextMeetingsWidget groupId={groupId} events={(upcomingEvents as any[]) ?? []} />
            </div>

            {/* Bottom row: My Tasks + Notes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MyPendingTasksWidget groupId={groupId} tasks={(myTasks as any[]) ?? []} />
                <NotesWidget groupId={groupId} initialNotes={(notes as any[]) ?? []} />
            </div>
        </div>
    );
}

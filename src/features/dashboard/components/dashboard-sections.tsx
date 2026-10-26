import { createClient, getUser } from '@/lib/supabase/server';
import { getGroupSummary } from '@/lib/supabase/queries';
import { getGroupRole } from '@/lib/auth/roles';
import { DashboardActions } from './dashboard-actions';
import { PendingReviewCard } from './pending-review-card';
import { NextMeetingsWidget } from './next-meetings-widget';
import { MyPendingTasksWidget } from './my-tasks-widget';
import { NotesWidget } from './notes-widget';

export async function DashboardHeader({ groupId }: { groupId: string }) {
    const supabase = await createClient();
    const [group, { count }] = await Promise.all([
        getGroupSummary(groupId),
        supabase.from('group_members').select('id', { count: 'exact', head: true })
            .eq('group_id', groupId).eq('status', 'active'),
    ]);
    return <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500">Overview for <span className="font-semibold">{group?.name}</span></p></div>
        <DashboardActions groupId={groupId} memberCount={count ?? 0} />
    </div>;
}

export async function DashboardReviews({ groupId }: { groupId: string }) {
    const [supabase, user, role] = await Promise.all([createClient(), getUser(), getGroupRole(groupId)]);
    if (!user) return null;
    const [reports, drive] = await Promise.all([
        supabase.from('reports')
            .select('id, group_id, week_start, week_end, status, submitted_at, reviewed_at, author:profiles!author_id(full_name, email)', { count: 'exact' })
            .eq('group_id', groupId).eq('status', 'submitted').order('submitted_at', { ascending: true }),
        supabase.from('drive_reports')
            .select('id, group_id, name, title, type, created_at, author_name, author:profiles!author_id(full_name)')
            .eq('group_id', groupId).not('seen_by', 'cs', JSON.stringify([user.id]))
            .order('created_at', { ascending: false }).limit(20),
    ]);
    if (reports.error || drive.error) throw new Error('Could not load pending reports');
    return <PendingReviewCard groupId={groupId} count={reports.count ?? 0}
        pendingReports={reports.data ?? []} unseenDriveReports={drive.data ?? []}
        canReview={role === 'owner' || role === 'supervisor' || role === 'labmanager'} />;
}

export async function DashboardMeetings({ groupId }: { groupId: string }) {
    const supabase = await createClient();
    const { data, error } = await supabase.from('calendar_events')
        .select('id, title, start_at, end_at, all_day, location, url, color')
        .eq('group_id', groupId).gte('start_at', new Date().toISOString())
        .order('start_at', { ascending: true }).limit(5);
    if (error) throw new Error('Could not load meetings');
    return <NextMeetingsWidget groupId={groupId} events={data ?? []} />;
}

export async function DashboardTasks({ groupId }: { groupId: string }) {
    const [supabase, user] = await Promise.all([createClient(), getUser()]);
    if (!user) return null;
    const { data, error } = await supabase.from('tasks')
        .select('id, title, status, priority, due_date').eq('group_id', groupId)
        .eq('created_by', user.id).neq('status', 'done')
        .order('due_date', { ascending: true }).limit(10);
    if (error) throw new Error('Could not load tasks');
    return <MyPendingTasksWidget groupId={groupId} tasks={data ?? []} />;
}

export async function DashboardNotes({ groupId }: { groupId: string }) {
    const supabase = await createClient();
    const { data, error } = await supabase.from('group_notes')
        .select('*, creator:profiles!created_by(full_name)').eq('group_id', groupId)
        .order('created_at', { ascending: false }).limit(20);
    if (error) throw new Error('Could not load notes');
    return <NotesWidget groupId={groupId} initialNotes={data ?? []} />;
}

export function DashboardPlaceholder() {
    return <div role="status" aria-label="Loading dashboard" className="min-h-48 animate-pulse rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-5 h-5 w-32 rounded bg-slate-100" />
        <div className="mb-3 h-4 w-3/4 rounded bg-slate-100" />
        <div className="h-4 w-1/2 rounded bg-slate-100" />
    </div>;
}

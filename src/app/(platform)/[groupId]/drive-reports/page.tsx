import { createClient } from "@/lib/supabase/server";
import { ReportList } from "@/features/drive-reports/components/report-list";
import { CreateReportButton } from "@/features/drive-reports/components/create-report-button";
import { FileText } from "lucide-react";

export default async function DriveReportsPage({
    params,
}: {
    params: Promise<{ groupId: string }>;
}) {
    const { groupId } = await params;
    const supabase = await createClient();

    // Fetch current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // Fetch reports with author profile and comment count
    const { data: reports } = await supabase
        .from('drive_reports')
        .select(`
            *,
            author_profile:profiles!author_id(full_name, avatar_url),
            drive_report_comments(count),
            linked_tasks:drive_report_task_links(
                task:tasks(
                    *,
                    assignees:task_assignees(user_id, profile:profiles(full_name, avatar_url))
                )
            )
        `)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

    // Fetch group settings
    const { data: group } = await supabase
        .from('groups')
        .select('drive_settings')
        .eq('id', groupId)
        .single();

    const driveSettings = group?.drive_settings as { clientId?: string; apiKey?: string; folderId?: string } | undefined;

    // Transform reports to include author_name and comment_count
    const reportsWithAuthor = reports?.map(r => ({
        ...r,
        author_name: r.author_profile?.full_name || 'Unknown',
        comment_count: r.drive_report_comments?.[0]?.count || 0,
        task_count: r.linked_tasks?.length || 0
    })) || [];

    return (
        <div className="h-full flex flex-col p-6">
            {/* Header */}
            <div className="px-6 pt-5 pb-4 bg-white border-b border-slate-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <FileText className="w-6 h-6 text-indigo-600" />
                            My Reports
                        </h1>
                        <p className="text-slate-500 text-sm">Manage your reports, presentations, and notes</p>
                    </div>
                    <CreateReportButton groupId={groupId} driveSettings={driveSettings} />
                </div>
            </div>

            {/* Report List */}
            <div className="flex-1 overflow-hidden">
                <ReportList
                    initialReports={reportsWithAuthor}
                    groupId={groupId}
                    currentUserId={user.id}
                    driveSettings={driveSettings}
                />
            </div>
        </div>
    );
}

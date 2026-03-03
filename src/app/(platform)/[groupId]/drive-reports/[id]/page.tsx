import { createClient } from "@/lib/supabase/server";
import { ReportDetail } from "@/features/drive-reports/components/report-detail";
import { notFound } from "next/navigation";

interface PageProps {
    params: Promise<{
        groupId: string;
        id: string;
    }>;
}

export default async function ReportDetailPage({
    params,
}: PageProps) {
    const { groupId, id } = await params;
    const supabase = await createClient();

    // Fetch report
    const { data: report, error } = await supabase
        .from('drive_reports')
        .select('*')
        .eq('id', id)
        .eq('group_id', groupId)
        .single();

    if (error || !report) {
        notFound();
    }

    const { data: { user } } = await supabase.auth.getUser();

    return (
        <ReportDetail
            report={report}
            groupId={groupId}
            currentUserId={user?.id || ''}
        />
    );
}

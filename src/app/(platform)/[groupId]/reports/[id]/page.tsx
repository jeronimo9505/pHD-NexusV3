import { createClient } from "@/lib/supabase/server";
import { getRegularReportAction } from "@/features/regular-reports/actions";
import { ReportDetail } from "@/features/regular-reports/components/report-detail";
import { notFound } from "next/navigation";

export default async function ReportDetailPage({
    params,
}: {
    params: Promise<{ groupId: string; id: string }>;
}) {
    const { groupId, id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: report, error } = await getRegularReportAction(id);

    if (error || !report) {
        return notFound();
    }

    return (
        <div className="h-full bg-slate-50/50 p-8 overflow-y-auto">
            <ReportDetail report={report} currentUserId={user?.id || ''} />
        </div>
    );
}

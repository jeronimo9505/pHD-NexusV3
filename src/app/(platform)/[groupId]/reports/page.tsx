import { createClient } from "@/lib/supabase/server";
import { getRegularReportsAction } from "@/features/regular-reports/actions";
import { ReportList } from "@/features/regular-reports/components/report-list";
import { Plus } from "lucide-react";
import Link from 'next/link';

export default async function RegularReportsPage({
    params,
}: {
    params: Promise<{ groupId: string }>;
}) {
    const { groupId } = await params;

    // Fetch reports
    const { data: reports } = await getRegularReportsAction(groupId);

    return (
        <div className="h-full flex flex-col space-y-6 p-8 overflow-y-auto">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Weekly Reports</h1>
                    <p className="text-slate-500 text-sm mt-1">Track scientific progress and experimental results.</p>
                </div>
                <Link
                    href={`/${groupId}/reports/new`}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors"
                >
                    <Plus size={18} /> New Report
                </Link>
            </header>

            <ReportList reports={reports || []} groupId={groupId} />
        </div>
    );
}

import { CreateReportForm } from "@/features/regular-reports/components/create-report-form";

export default async function NewReportPage({
    params,
}: {
    params: Promise<{ groupId: string }>;
}) {
    const { groupId } = await params;

    return (
        <div className="h-full p-8 overflow-y-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">Create New Report</h1>
            </div>
            <CreateReportForm groupId={groupId} />
        </div>
    );
}

import { Suspense } from "react";
import { SamplesTableLoading } from "@/features/samples/components/samples-loading";
import { getSamplesAction, getFieldsConfigAction, getNomenclaturesAction, getLogbooksAction } from "@/features/samples/actions";
import { SampleGrid } from "@/features/samples/components/sample-grid";
import { LogbookSwitcher } from "@/features/samples/components/logbook-switcher";
import { getGroupRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { Logbook } from "@/features/samples/types";
import { getGroupSummary } from '@/lib/supabase/queries';

interface SamplesPageProps {
    params: Promise<{ groupId: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SamplesPage(props: SamplesPageProps) {
    const { groupId } = await props.params;
    const searchParams = await props.searchParams;


    // Independent reads start together; sample data waits for book selection.
    const [logbooksRes, role, groupRes] = await Promise.all([
        getLogbooksAction(groupId), getGroupRole(groupId), getGroupSummary(groupId),
    ]);
    if (!role) redirect('/dashboard');
    if (logbooksRes.error) throw new Error('Unable to load sample logbooks');
    const logbooks = (logbooksRes.data || []) as Logbook[];

    // Determine active logbook
    // If param exists and is valid, use it. Otherwise use first logbook.
    let activeLogbookId = typeof searchParams.logbook === 'string' ? searchParams.logbook : undefined;

    // Validate activeLogbookId
    if (activeLogbookId && !logbooks.find(l => l.id === activeLogbookId)) {
        activeLogbookId = undefined;
    }

    if (!activeLogbookId && logbooks.length > 0) {
        activeLogbookId = logbooks[0].id;
    }

    const activeLogbook = logbooks.find(l => l.id === activeLogbookId);

    return (
        <div className="h-full flex flex-col p-6 space-y-6">
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        <span className="bg-emerald-100 text-emerald-700 p-2 rounded-lg text-lg">🧪</span>
                        Sample Logbooks
                    </h1>
                </div>
                <LogbookSwitcher
                    groupId={groupId}
                    logbooks={logbooks}
                    currentLogbookId={activeLogbookId || ''}
                />
                <p className="text-slate-500 max-w-3xl text-sm">
                    Manage sample lineage, properties, and configurations. Use the grid below to track stock and derived samples.
                </p>
            </div>


            <div className="flex-1 min-h-0">
                {activeLogbookId && (
                    <Suspense key={activeLogbookId} fallback={<SamplesTableLoading />}>
                        <SelectedLogbook groupId={groupId} logbook={activeLogbook!} role={role} driveSettings={groupRes?.drive_settings} />
                    </Suspense>
                )}
                {!activeLogbookId && (
                    <div className="text-center p-10 text-slate-500">
                        No logbooks found. Please contact support.
                    </div>
                )}
            </div>
        </div>
    );
}

// Only the selected book reaches the data queries. The selector can stream
// before these reads finish; other books are fetched on explicit navigation.
async function SelectedLogbook({ groupId, logbook, role, driveSettings }: {
    groupId: string; logbook: Logbook; role: string;
    driveSettings: unknown;
}) {
    const [samplesRes, fieldsRes, nomenclaturesRes] = await Promise.all([
        getSamplesAction(groupId, logbook.id),
        getFieldsConfigAction(groupId, logbook.id),
        getNomenclaturesAction(groupId, logbook.id),
    ]);
    if (samplesRes.error || fieldsRes.error || nomenclaturesRes.error) {
        throw new Error('Unable to load the selected sample logbook');
    }
    return <SampleGrid key={logbook.id} groupId={groupId} logbookId={logbook.id}
        logbookName={logbook.name} logbookPrefix={logbook.prefix || 'S'}
        samples={samplesRes.data || []} fields={(fieldsRes.data || []) as any[]}
        nomenclatures={(nomenclaturesRes.data || []) as any[]} userRole={role}
        driveSettings={driveSettings as { clientId?: string; apiKey?: string; folderId?: string; sampleFolderId?: string } | undefined} />;
}

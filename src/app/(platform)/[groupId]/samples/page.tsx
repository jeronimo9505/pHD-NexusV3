import { createClient } from "@/lib/supabase/server";
import { getSamplesAction, getFieldsConfigAction, getNomenclaturesAction, getLogbooksAction } from "@/features/samples/actions";
import { SampleGrid } from "@/features/samples/components/sample-grid";
import { LogbookSwitcher } from "@/features/samples/components/logbook-switcher";
import { getGroupRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { Logbook } from "@/features/samples/types";

interface SamplesPageProps {
    params: Promise<{ groupId: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SamplesPage(props: SamplesPageProps) {
    const { groupId } = await props.params;
    const searchParams = await props.searchParams;
    const supabase = await createClient();

    // 1. Fetch Logbooks first to know which one is active
    const logbooksRes = await getLogbooksAction(groupId);
    const logbooks = (logbooksRes.data || []) as Logbook[];

    // Determine active logbook
    // If param exists and is valid, use it. Otherwise use first logbook.
    // If no logbooks exist (shouldn't happen with migration), efficient fallback needed.
    let activeLogbookId = typeof searchParams.logbook === 'string' ? searchParams.logbook : undefined;

    // Validate activeLogbookId
    if (activeLogbookId && !logbooks.find(l => l.id === activeLogbookId)) {
        activeLogbookId = undefined;
    }

    if (!activeLogbookId && logbooks.length > 0) {
        activeLogbookId = logbooks[0].id;
    }

    // If still no logbook (e.g. migration failed or empty group), we might have issues.
    // But migration ensures at least one.

    const activeLogbook = logbooks.find(l => l.id === activeLogbookId);

    // Parallel fetch for speed
    const [
        role,
        samplesRes,
        fieldsRes,
        nomenclaturesRes,
        groupRes
    ] = await Promise.all([
        getGroupRole(groupId),
        activeLogbookId ? getSamplesAction(groupId, activeLogbookId) : Promise.resolve({ data: [] }),
        activeLogbookId ? getFieldsConfigAction(groupId, activeLogbookId) : Promise.resolve({ data: [] }),
        activeLogbookId ? getNomenclaturesAction(groupId, activeLogbookId) : Promise.resolve({ data: [] }),
        supabase.from('groups').select('drive_settings').eq('id', groupId).single()
    ]);

    if (!role) {
        redirect('/dashboard');
    }

    // Default to empty arrays if error
    const samples = samplesRes.data || [];
    const fields = fieldsRes.data || [];
    const nomenclatures = nomenclaturesRes.data || [];
    const driveSettings = groupRes.data?.drive_settings as { clientId?: string; apiKey?: string; folderId?: string; sampleFolderId?: string } | undefined;

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
                    <SampleGrid
                        groupId={groupId}
                        logbookId={activeLogbookId}
                        logbookPrefix={activeLogbook?.prefix || 'S'}
                        samples={samples}
                        fields={fields}
                        nomenclatures={nomenclatures}
                        userRole={role}
                        driveSettings={driveSettings}
                    />
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

import { createClient } from "@/lib/supabase/server";
import { DriveBrowser } from "@/features/google-drive/components/drive-browser";
import { HardDrive } from "lucide-react";

interface PageProps {
    params: Promise<{ groupId: string }>;
}

export default async function GoogleDrivePage({ params }: PageProps) {
    const { groupId } = await params;
    const supabase = await createClient();

    // Fetch drive settings from group
    const { data: group } = await supabase
        .from('groups')
        .select('drive_settings')
        .eq('id', groupId)
        .single();

    const driveSettings = group?.drive_settings as {
        clientId?: string;
        apiKey?: string;
        folderId?: string;
    } | undefined;

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="px-8 pt-6 pb-4 border-b border-slate-200 bg-white">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <HardDrive className="w-6 h-6 text-indigo-600" />
                    Google Drive
                </h1>
                <p className="text-slate-500 text-sm mt-1">
                    Browse and manage your group&apos;s Google Drive files
                </p>
            </div>

            {/* Browser */}
            <div className="flex-1 overflow-hidden">
                <DriveBrowser
                    groupId={groupId}
                    driveSettings={driveSettings}
                />
            </div>
        </div>
    );
}

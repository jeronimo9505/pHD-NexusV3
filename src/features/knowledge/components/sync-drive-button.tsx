'use client';

import { useState } from 'react';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { syncDriveFilesRecursive } from '@/lib/google/drive';
import { syncKnowledgeItemsAction } from '../actions';
import { useRouter } from 'next/navigation';

interface SyncDriveButtonProps {
    groupId: string;
    driveSettings?: { clientId?: string; apiKey?: string; folderId?: string };
}

export function SyncDriveButton({ groupId, driveSettings }: SyncDriveButtonProps) {
    const [isSyncing, setIsSyncing] = useState(false);
    const router = useRouter();

    const handleSync = async () => {
        const folderId = driveSettings?.folderId;
        const clientId = driveSettings?.clientId?.trim();
        const apiKey = driveSettings?.apiKey?.trim();

        if (!folderId || !clientId || !apiKey) {
            toast.error("Drive not configured. Please check Group Settings.");
            return;
        }

        setIsSyncing(true);
        const toastId = toast.loading("Syncing with Google Drive... (This may take a minute)");

        try {
            // Import centralized auth
            const { initGoogleClient, ensureAuth } = await import('@/lib/google/auth');

            // 1. Initialize & Auth
            await initGoogleClient(apiKey, clientId);
            const token = await ensureAuth();

            if (!token) {
                toast.error("Auth failed", { id: toastId });
                setIsSyncing(false);
                return;
            }

            // 3. Fetch Files Recursive
            toast.loading(`Scanning folder...`, { id: toastId });
            const files = await syncDriveFilesRecursive(folderId, token);

            // 4. Transform to KnowledgeItems
            const items = files.map((f: any) => ({
                group_id: groupId,
                title: f.name,
                url: f.webViewLink,
                drive_file_id: f.id,
                category: f.category || 'General',
                tags: f.tags,
                description: `Imported from Drive: ${f.category}`,
                is_pinned: false
            }));

            // 5. Send to Server
            toast.loading(`Updating database (${items.length} files)...`, { id: toastId });
            const result = await syncKnowledgeItemsAction(groupId, items);

            if (result?.error) throw new Error(result.error);

            toast.success(`Synced ${items.length} files successfully`, { id: toastId });
            router.refresh();

        } catch (err: any) {
            console.error(err);
            toast.error(`Sync failed: ${err.message || 'Unknown error'}`, { id: toastId });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <button
            onClick={handleSync}
            disabled={isSyncing}
            className={`flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all ${isSyncing ? 'opacity-70 cursor-wait' : ''}`}
            title="Recursive Sync from Google Drive"
        >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin text-indigo-600' : 'text-slate-500'} />
            {isSyncing ? 'Syncing...' : 'Sync Drive'}
        </button>
    );
}

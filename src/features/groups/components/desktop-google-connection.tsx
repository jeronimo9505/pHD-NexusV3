'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { hasNativeDrive, desktopDriveCommand, ramanDriveFetch, ramanDriveToken } from '@/lib/google/desktop-drive';
import { syncPendingRamanReferences } from '@/features/samples/raman-reference-sync';
const subscribeNative = () => () => {};
const serverNative = () => false;

export function DesktopGoogleConnection({ groupId }: { groupId: string }) {
    const native = useSyncExternalStore(subscribeNative, hasNativeDrive, serverNative);
    const [status, setStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const guard = useRef(false);
    useEffect(() => {
        if (!hasNativeDrive()) return;
        let current = true;
        desktopDriveCommand<{ configured: boolean; connected: boolean }>('google_drive_status', groupId)
            .then(value => { if (current) setStatus(value); })
            .catch(() => { if (current) setMessage('Restart tauri dev to enable automatic Google renewal.'); });
        return () => { current = false; };
    }, [groupId]);

    if (!native) return null;
    async function run(action: () => Promise<string>) {
        if (guard.current) return;
        guard.current = true; setBusy(true); setMessage('');
        try {
            setMessage(await action());
            setStatus(await desktopDriveCommand('google_drive_status', groupId));
        } catch (error) { setMessage(String(error instanceof Error ? error.message : error)); }
        finally { guard.current = false; setBusy(false); }
    }
    const buttonStyle = 'px-3 py-2 border rounded-lg text-sm disabled:opacity-50';
    return <section className="p-6 border-b border-slate-100 space-y-3">
        <h3 className="font-semibold">Google Drive · automatic desktop renewal</h3>
        <p className="text-sm text-slate-500">Authorize Google in your Windows browser. The connection for this user and group is stored securely on this computer and renewed when needed. Access is limited to files used by the application.</p>
        <p className="text-sm">{status?.connected ? 'Connection saved on this computer' : status?.configured ? 'Client configured. Connect Google for this group.' : 'Import the desktop OAuth client JSON once on this computer.'}</p>
        <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonStyle} disabled={busy} onClick={() => run(async () => {
                const { open } = await import('@tauri-apps/plugin-dialog');
                const path = await open({ multiple: false, filters: [{ name: 'Desktop OAuth client', extensions: ['json'] }] });
                if (!path || typeof path !== 'string') return 'Import cancelled.';
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('google_drive_import_client', { path });
                return 'Client imported into the system credential store.';
            })}>Import desktop JSON</button>
            <button type="button" className={buttonStyle} disabled={busy || !status?.configured} onClick={() => run(async () => {
                await desktopDriveCommand('google_drive_connect', groupId);
                window.dispatchEvent(new Event('phdnexus-google-connected'));
                return 'Google connected. You can continue working; pending references will be retried.';
            })}>Connect in Windows browser</button>
            <button type="button" className={buttonStyle} disabled={busy || !status?.connected} onClick={() => run(async () => {
                await ramanDriveToken(groupId, true);
                const response = await ramanDriveFetch('https://www.googleapis.com/drive/v3/files?pageSize=1&fields=kind', {}, groupId);
                if (!response.ok) throw new Error(`Drive HTTP ${response.status}`);
                return 'Renewal verified without another authorization window.';
            })}>Check renewal</button>
            <button type="button" className={buttonStyle} disabled={busy || !status?.connected} onClick={() => run(async () => {
                const result = await syncPendingRamanReferences(groupId);
                window.dispatchEvent(new Event('phdnexus-raman-synced'));
                return `${result.synced} references synced. ${result.pending} pending.`;
            })}>Retry pending references</button>
            <button type="button" className={buttonStyle} disabled={busy || !status?.connected} onClick={() => run(async () => {
                await desktopDriveCommand('google_drive_disconnect', groupId);
                return 'Connection removed from this computer. Your Drive files are preserved.';
            })}>Disconnect on this computer</button>
        </div>
        <p className="text-sm" role="status" aria-live="polite">{busy ? 'Checking connection… If Google opened, complete authorization in your browser.' : message}</p>
    </section>;
}

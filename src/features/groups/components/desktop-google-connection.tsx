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
            .catch(() => { if (current) setMessage('Reinicia tauri dev para activar la conexión renovable.'); });
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
        <h3 className="font-semibold">Google Drive · conexión desktop renovable</h3>
        <p className="text-sm text-slate-500">Autoriza en tu navegador de Windows. La conexión de este usuario y grupo se guarda protegida en el sistema y se renueva al necesitarla. Solo se solicita acceso a los archivos usados por la aplicación.</p>
        <p className="text-sm">{status?.connected ? 'Conexión guardada en este equipo' : status?.configured ? 'Cliente configurado. Falta conectar Google para este grupo.' : 'Importa el JSON del cliente OAuth de escritorio una sola vez en este equipo.'}</p>
        <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonStyle} disabled={busy} onClick={() => run(async () => {
                const { open } = await import('@tauri-apps/plugin-dialog');
                const path = await open({ multiple: false, filters: [{ name: 'Cliente OAuth desktop', extensions: ['json'] }] });
                if (!path || typeof path !== 'string') return 'Importación cancelada.';
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('google_drive_import_client', { path });
                return 'Cliente importado en el almacén seguro del sistema.';
            })}>Importar JSON desktop</button>
            <button type="button" className={buttonStyle} disabled={busy || !status?.configured} onClick={() => run(async () => {
                await desktopDriveCommand('google_drive_connect', groupId);
                window.dispatchEvent(new Event('phdnexus-google-connected'));
                return 'Google conectado. Puedes volver a trabajar; las referencias pendientes se reintentarán.';
            })}>Conectar en navegador de Windows</button>
            <button type="button" className={buttonStyle} disabled={busy || !status?.connected} onClick={() => run(async () => {
                await ramanDriveToken(groupId, true);
                const response = await ramanDriveFetch('https://www.googleapis.com/drive/v3/files?pageSize=1&fields=kind', {}, groupId);
                if (!response.ok) throw new Error(`Drive HTTP ${response.status}`);
                return 'Renovación comprobada sin otra ventana de autorización.';
            })}>Comprobar renovación</button>
            <button type="button" className={buttonStyle} disabled={busy || !status?.connected} onClick={() => run(async () => {
                const result = await syncPendingRamanReferences(groupId);
                window.dispatchEvent(new Event('phdnexus-raman-synced'));
                return `${result.synced} referencias sincronizadas. ${result.pending} pendientes.`;
            })}>Reintentar referencias pendientes</button>
            <button type="button" className={buttonStyle} disabled={busy || !status?.connected} onClick={() => run(async () => {
                await desktopDriveCommand('google_drive_disconnect', groupId);
                return 'Conexión eliminada de este equipo. Los archivos de Drive se conservan.';
            })}>Desconectar en este equipo</button>
        </div>
        <p className="text-sm" role="status" aria-live="polite">{busy ? 'Comprobando conexión… Si se abrió Google, completa la autorización en el navegador.' : message}</p>
    </section>;
}

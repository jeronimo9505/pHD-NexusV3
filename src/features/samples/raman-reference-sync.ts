import { ramanDriveFetch, desktopDriveCommand } from '@/lib/google/desktop-drive';
import { getPendingRamanReferencesAction, updateRamanReferenceSyncAction } from './raman-reference-actions';

const active = new Set<string>();

export async function syncPendingRamanReferences(groupId: string, isCurrent = () => true) {
    if (active.has(groupId)) return { synced: 0, pending: 0 };
    active.add(groupId);
    let synced = 0;
    let lastError: string | undefined;
    try {
        const result = await getPendingRamanReferencesAction(groupId);
        if (result.error || !result.data) throw new Error(result.error || 'Could not read pending references');
        for (const row of result.data) {
            if (!isCurrent()) break;
            try {
            const job = (row.data as any)?.raman_drive_sync;
            if (!job?.payload || !job.name || !job.job_id) continue;
            const verified = await desktopDriveCommand<boolean>('google_drive_verify_job', groupId, { job }, job.owner_id);
            if (!verified) throw new Error('Reference was modified after saving. Save it again in Tauri before uploading.');
            let fileId: string = job.file_id;
            if (!fileId) {
                const generated = await ramanDriveFetch('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files', {}, groupId, job.owner_id);
                if (!generated.ok) throw new Error(`Drive could not reserve a reference (HTTP ${generated.status})`);
                const ids = await generated.json();
                if (!ids.ids?.[0]) throw new Error('Drive did not return a reference identifier');
                const reserved = await updateRamanReferenceSyncAction({ groupId, id: row.id, jobId: job.job_id, fileId: ids.ids[0] });
                if (reserved.error) throw new Error(reserved.error);
                if (reserved.stale || !reserved.fileId) continue;
                fileId = reserved.fileId;
            }
            // Stable reserved IDs allow retry after an interrupted response without duplicate files.
            const metadata = { id: fileId, name: job.name, mimeType: 'application/json',
                ...(job.folder_id ? { parents: [job.folder_id] } : {}), appProperties: { nexusRamanJob: job.job_id } };
            const boundary = `nexus-${crypto.randomUUID()}`;
            const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
                `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(job.payload)}\r\n--${boundary}--\r\n`]);
            if (!isCurrent()) break;
            const uploaded = await ramanDriveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
                method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }, groupId, job.owner_id);
            if (!uploaded.ok && uploaded.status !== 409) throw new Error(`Reference remains pending: Drive HTTP ${uploaded.status}`);
            const check = await ramanDriveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,appProperties,trashed`, {}, groupId, job.owner_id);
            if (!check.ok) throw new Error('Could not confirm the uploaded reference');
            const confirmed = await check.json();
            if (confirmed.id !== fileId || confirmed.trashed || confirmed.appProperties?.nexusRamanJob !== job.job_id) throw new Error('Drive returned a different reference');
            const complete = await updateRamanReferenceSyncAction({ groupId, id: row.id, jobId: job.job_id, fileId, complete: true });
            if (complete.error) throw new Error(complete.error);
            if (!complete.stale) synced++;
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                if (/GOOGLE_RECONNECT_REQUIRED|401/.test(lastError)) break;
                // A missing/inaccessible folder must not block unrelated references.
            }
        }
        if (lastError && synced === 0) throw new Error(lastError);
        return { synced, pending: result.data.length - synced };
    } finally { active.delete(groupId); }
}

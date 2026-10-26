import { ensureAuth, clearToken } from './auth';

export async function downloadDriveContent(fileId: string, fileName: string, options: { revisionId?: string; mimeType?: string } = {}) {
    const token = await ensureAuth();
    const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
    const url = options.revisionId ? `${base}/revisions/${encodeURIComponent(options.revisionId)}?alt=media`
        : options.mimeType ? `${base}/export?mimeType=${encodeURIComponent(options.mimeType)}` : `${base}?alt=media`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) { clearToken(); throw new Error('Google session expired. Click download again to reconnect.'); }
    if (!response.ok) throw new Error(`Google download failed (${response.status}). Check file permissions and try again.`);
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

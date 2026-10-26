import { ensureAuth, clearToken } from "./auth";

/**
 * Uploads a file to Google Drive.
 * Uses multipart/related to send metadata and content in one request.
 */
export const uploadFileToDrive = async (file: File, folderId?: string) => {
    const accessToken = await ensureAuth();

    const metadata = {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        parents: folderId ? [folderId] : []
    };

    const boundary = `nexus-${crypto.randomUUID()}`;
    const multipartBody = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
        file, `\r\n--${boundary}--\r\n`,
    ]);
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
    });

    if (response.status === 401) {
        // Token is expired or revoked by Google.
        // We MUST NOT call ensureAuth() here because we are deep inside an async fetch chain,
        // so the browser will block the popup window.
        // Instead, clear the token and tell the caller to prompt the user to try again natively.
        clearToken();
        if (typeof window !== 'undefined' && (window as any).gapi?.client) {
            (window as any).gapi.client.setToken(null);
        }
        throw new Error('GOOGLE_AUTH_EXPIRED');
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || 'Upload failed');
    }

    return await response.json();
};

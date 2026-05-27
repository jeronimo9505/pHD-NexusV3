import { ensureAuth, clearToken } from "./auth";

/**
 * Uploads a file to Google Drive.
 * Uses multipart/related to send metadata and content in one request.
 */
export const uploadFileToDrive = async (file: File, folderId?: string) => {
    let accessToken = await ensureAuth();

    const metadata = {
        name: file.name,
        mimeType: file.type,
        parents: folderId ? [folderId] : []
    };

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    // Read file as Base64
    const reader = new FileReader();
    const base64Data: string = await new Promise((resolve, reject) => {
        reader.onload = () => {
            const res = reader.result as string;
            // Remove 'data:mime/type;base64,' prefix
            resolve(res.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const multipartBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: ' + file.type + '\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        '\r\n' +
        base64Data +
        close_delim;

    let response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink', {
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
        const error = await response.json();
        throw new Error(error.error?.message || 'Upload failed');
    }

    return await response.json();
};

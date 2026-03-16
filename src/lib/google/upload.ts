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
        // Token is likely expired or invalid, clear it and retry once
        clearToken();
        if (typeof window !== 'undefined' && (window as any).gapi?.client) {
            (window as any).gapi.client.setToken(null);
        }
        accessToken = await ensureAuth();
        response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartBody
        });
    }

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Upload failed');
    }

    return await response.json();
};

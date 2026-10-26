export { loadGoogleScripts } from './loader';

// A failed or bounded scan must never be submitted as a successful partial sync.
export async function syncDriveFilesRecursive(rootFolderId: string, accessToken: string) {
    if (!accessToken) throw new Error('Access Token required');
    const gapi = (window as any).gapi;
    if (!gapi?.client?.drive) throw new Error('Google Drive API not initialized');
    gapi.client.setToken({ access_token: accessToken });
    const root = await gapi.client.drive.files.get({ fileId: rootFolderId, fields: 'name', supportsAllDrives: true });
    const rootName = root.result.name || 'General';
    const queue = [{ id: rootFolderId, tags: [] as string[], name: 'General' }];
    const visited = new Set([rootFolderId]);
    const files = new Map<string, any>();
    let requests = 0;
    while (queue.length) {
        const results = await Promise.all(queue.splice(0, 5).map(async folder => {
            const contents: any[] = [];
            let pageToken: string | undefined;
            const seenPages = new Set<string>();
            do {
                if (++requests > 1000) throw new Error('Drive scan limit reached. Select a smaller root folder; no partial sync was saved.');
                const response = await gapi.client.drive.files.list({
                    q: `'${folder.id.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' in parents and trashed=false`,
                    fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,webViewLink,iconLink,createdTime,parents)',
                    pageSize: 100, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true,
                });
                if (response.result.incompleteSearch) throw new Error('Google returned an incomplete Drive scan. No partial sync was saved.');
                contents.push(...(response.result.files || []));
                pageToken = response.result.nextPageToken;
                if (pageToken && seenPages.has(pageToken)) throw new Error('Google repeated a Drive page token. Please retry the sync.');
                if (pageToken) seenPages.add(pageToken);
            } while (pageToken);
            return { folder, contents };
        }));
        for (const { folder, contents } of results) for (const file of contents) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                if (!visited.has(file.id)) {
                    visited.add(file.id);
                    queue.push({ id: file.id, name: file.name, tags: [...folder.tags, file.name] });
                }
            } else files.set(file.id, { ...file, category: folder.name, tags: folder.tags.filter(tag => tag !== rootName) });
        }
    }
    return [...files.values()];
}
export async function getFileContent(fileId: string, accessToken: string) {
    if (!accessToken) throw new Error("Access Token required");

    // We use the drive.files.get method with alt=media to get the file content
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch file content: ${response.statusText}`);
    }

    return await response.json();
}

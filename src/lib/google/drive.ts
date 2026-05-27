
// Logic ported from legacy googleDriveService.js
// Handles recursive fetching of files with "Folder Name = Category" logic.

const DISCOVERY_DOCS = [
    "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
];

export async function loadGoogleScripts() {
    if ((window as any).gapi && (window as any).google) return;

    // We assume scripts might already be loaded by layout or other components, 
    // but here is a safety loader if needed.
    // Ideally, use the same loader as drive-picker-button.
}

export async function syncDriveFilesRecursive(rootFolderId: string, accessToken: string) {
    if (!accessToken) throw new Error("Access Token required");

    // Initialize/Use GAPI client with the token
    // We assume gapi is loaded. If not, this will fail.
    // In V3, we pass the token from the React component which gets it via user interaction.

    // Actually, for GAPI client calls, we need to set the token.
    if (!(window as any).gapi.client.getToken()) {
        (window as any).gapi.client.setToken({ access_token: accessToken });
    }

    // 1. Fetch Root Name
    let rootName = 'General';
    try {
        const rootRes = await (window as any).gapi.client.drive.files.get({
            fileId: rootFolderId,
            fields: 'name'
        });
        rootName = rootRes.result.name;
    } catch (e) {
        console.warn("Could not fetch root folder name", e);
    }

    const allFiles: any[] = [];
    const foldersToProcess = [{ id: rootFolderId, name: rootName, parentId: null as string | null }];
    const folderMap: Record<string, { name: string, parentId: string | null }> = {
        [rootFolderId]: { name: rootName, parentId: null }
    };

    let queryCount = 0;
    const MAX_QUERIES = 50; // Safety brake

    while (foldersToProcess.length > 0 && queryCount < MAX_QUERIES) {
        // Process in batches of 5 folders to avoid hitting rate limits too hard but faster than serial
        const currentBatch = foldersToProcess.splice(0, 5);
        queryCount++;

        const batchPromises = currentBatch.map(async (folder) => {
            const q = `'${folder.id}' in parents and trashed = false`;
            try {
                const res = await (window as any).gapi.client.drive.files.list({
                    pageSize: 100,
                    fields: "files(id, name, mimeType, webViewLink, iconLink, createdTime, parents)",
                    q: q
                });
                return { parentId: folder.id, files: res.result.files };
            } catch (e) {
                console.error(`Error listing folder ${folder.name}`, e);
                return { parentId: folder.id, files: [] };
            }
        });

        const results = await Promise.all(batchPromises);

        for (const res of results) {
            const parentId = res.parentId;
            const parentName = (parentId === rootFolderId) ? 'General' : (folderMap[parentId!]?.name || 'Drive');

            if (!res.files) continue;

            for (const f of res.files) {
                if (f.mimeType === 'application/vnd.google-apps.folder') {
                    foldersToProcess.push({ id: f.id, name: f.name, parentId: parentId });
                    folderMap[f.id] = { name: f.name, parentId: parentId };
                } else {
                    // Reconstruct path for tags
                    const tags: string[] = [];
                    let currId = parentId;
                    while (currId && folderMap[currId]) {
                        if (currId !== rootFolderId) {
                            tags.unshift(folderMap[currId].name);
                        }
                        currId = folderMap[currId].parentId!;
                    }

                    // Filter out 'General' if it matches root name
                    const finalTags = tags.filter(t => t !== rootName);

                    allFiles.push({
                        ...f,
                        category: parentName,
                        tags: finalTags
                    });
                }
            }
        }
    }

    return allFiles;
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

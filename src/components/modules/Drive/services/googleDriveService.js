import { getReportGenerationRequests } from '../../DriveReports/services/docGenerator';

// Google Drive Service
// Handles interactions with Google Drive API v3

const DISCOVERY_DOCS = [
    "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
    "https://docs.googleapis.com/$discovery/rest?version=v1"
];

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

// Scopes
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/documents';

let gapiInited = false;
let gisInited = false;
let tokenClient;

// Load GAPI and GIS scripts dynamically
export const loadGoogleScripts = () => {
    return new Promise((resolve, reject) => {
        if (window.gapi && window.google) {
            resolve();
            return;
        }

        const script1 = document.createElement('script');
        script1.src = "https://apis.google.com/js/api.js";
        script1.async = true;
        script1.defer = true;
        script1.onload = () => {
            gapiInited = true;
            if (gisInited) resolve();
        };
        script1.onerror = reject;
        document.body.appendChild(script1);

        const script2 = document.createElement('script');
        script2.src = "https://accounts.google.com/gsi/client";
        script2.async = true;
        script2.defer = true;
        script2.onload = () => {
            gisInited = true;
            if (gapiInited) resolve();
        };
        script2.onerror = reject;
        document.body.appendChild(script2);
    });
};

// Initialize the API Client
export const initializeGapiClient = async (apiKey, clientId) => {
    if (!window.gapi) throw new Error('GAPI not loaded');

    await new Promise((resolve, reject) => {
        window.gapi.load('client', { callback: resolve, onerror: reject });
    });

    await window.gapi.client.init({
        apiKey: apiKey,
        discoveryDocs: DISCOVERY_DOCS,
    });

    // Initialize Identity Services
    tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: '', // defined at request time
    });

    return true;
};

// Request Access Token
// Request Access Token
const TOKEN_KEY = 'gdrive_token_v1';

export const storeToken = (token) => {
    if (!token) return;
    // expires_in is usually 3599 seconds
    const expiry = Date.now() + (token.expires_in * 1000) - 30000; // 30s buffer
    const data = { token, expiry };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
};

export const tryRestoreToken = () => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) return false;
    try {
        const { token, expiry } = JSON.parse(saved);
        if (Date.now() < expiry) {
            window.gapi.client.setToken(token);
            return true;
        }
    } catch (e) {
        console.error("Token parse error", e);
    }
    localStorage.removeItem(TOKEN_KEY);
    return false;
};

export const hasValidToken = () => {
    const tokenObj = window.gapi?.client?.getToken();
    return !!tokenObj && !!tokenObj.access_token;
};

export const requestAccessToken = () => {
    return new Promise((resolve, reject) => {
        if (!tokenClient) return reject('Token Client not initialized');

        tokenClient.callback = (resp) => {
            if (resp.error) {
                reject(resp);
            }
            // IMPORTANT: Manually set the token for GAPI Client to use it
            if (window.gapi && window.gapi.client) {
                window.gapi.client.setToken(resp);
            }
            storeToken(resp);
            resolve(resp);
        };

        // Skip prompt if we have a valid token (handled by browser/library usually, but good to explictly prompt if needed)
        // For simplicity, always request. content-popup will handle session.
        tokenClient.requestAccessToken({ prompt: '' });
    });
};

// Search Files
export const searchFiles = async (query, folderId) => {
    try {
        const tokenObj = window.gapi.client.getToken();
        const isAuthenticated = !!tokenObj;

        let q;
        if (query) {
            // Recursive Search Logic
            if (isAuthenticated) {
                // If authenticated, search GLOBALLY (or broadly) to find files in subfolders
                // We exclude 'trashed' and specific types if needed, but remove 'parents' constraint
                q = `trashed = false and name contains '${query}'`;

                // Optional: To strictly scope to the root folder hierarchy requires complex iteration.
                // Global search is the standard "Drive" behavior.
            } else {
                // Hybrid/Anonymous: Can usually only search in the specific public folder we have access to
                q = `'${folderId}' in parents and trashed = false and name contains '${query}'`;
            }
        } else {
            // No query, just list children
            q = `'${folderId}' in parents and trashed = false`;
        }

        // Use client.drive.files.list which automatically uses API Key if no token is present
        // BUT, GAPI client might fail if we ask for scope-restricted fields without token.
        // For public folders, standard fields are usually fine.
        const response = await window.gapi.client.drive.files.list({
            'pageSize': 20,
            'fields': "nextPageToken, files(id, name, mimeType, webViewLink, iconLink, modifiedTime, owners, parents)",
            'q': q,
            'orderBy': 'folder, modifiedTime desc'
        });
        return response.result.files;
    } catch (err) {
        console.error("Error searching files", err);
        // Propagate error to let UI decide (e.g. 401/403 means we MUST login)
        throw err;
    }
};

// Exact Name Search (Recovery)
export const findFileByName = async (fileName) => {
    try {
        // Escape single quotes in fileName
        const safeName = fileName.replace(/'/g, "\\'");
        const q = `name = '${safeName}' and trashed = false`;

        const response = await window.gapi.client.drive.files.list({
            'pageSize': 10,
            'fields': "files(id, name, mimeType, webViewLink, iconLink, parents)",
            'q': q,
            'orderBy': 'modifiedTime desc'
        });
        return response.result.files;
    } catch (err) {
        console.error("Error finding file by name", err);
        throw err;
    }
};

// Upload File
export const uploadFile = async (file, folderId) => {
    try {
        // Upload requires Authenticated User
        const tokenObj = window.gapi.client.getToken();

        if (!tokenObj) {
            throw new Error('Authentication required for upload (Token missing)');
        }

        const metadata = {
            'name': file.name,
            'parents': [folderId]
        };

        const accessToken = tokenObj.access_token;
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Upload failed: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();

        // 3. Fetch full metadata (webViewLink is not returned by upload endpoint by default)
        try {
            const getResponse = await window.gapi.client.drive.files.get({
                fileId: data.id,
                fields: 'id, name, mimeType, webViewLink, iconLink, alternativeLink' // Request specific fields
            });
            // Merge metadata
            return { ...data, ...getResponse.result };
        } catch (fetchErr) {
            console.warn("Could not fetch full metadata after upload, returning basic info", fetchErr);
            return data;
        }
    } catch (err) {
        console.error("Error uploading file:", err);
        throw err;
    }
};

/**
 * Copies a file (Template) to a new location with a new name.
 */
export const copyFile = async (fileId, newName, destinationFolderId) => {
    try {
        if (!tokenClient && !gapiInited) throw new Error("Google API not initialized");

        const body = {
            name: newName,
        };

        if (destinationFolderId) {
            body.parents = [destinationFolderId];
        }

        const response = await window.gapi.client.drive.files.copy({
            fileId: fileId,
            resource: body,
            fields: 'id, name, webViewLink, iconLink, mimeType, parents'
        });

        return response.result;
    } catch (err) {
        console.error("Error copying file", err);
        if (err.result && (err.result.error.code === 401 || err.result.error.code === 403)) {
            throw new Error("AUTH_REQUIRED");
        }
        throw err;
    }
};


/**
 * Populates a Google Doc with data by replacing placeholders.
 * @param {string} fileId 
 * @param {Object} replacements key-value pairs (e.g., { "{{NOMBRE}}": "Juan" })
 */
export const populateTemplate = async (fileId, replacements) => {
    if (!window.gapi?.client?.docs) {
        throw new Error('Google Docs API not loaded');
    }

    const requests = Object.entries(replacements).map(([key, value]) => ({
        replaceAllText: {
            containsText: {
                text: key,
                matchCase: true,
            },
            replaceText: value || '',
        },
    }));

    if (requests.length === 0) return;

    try {
        await window.gapi.client.docs.documents.batchUpdate({
            documentId: fileId,
            resource: { requests },
        });
    } catch (error) {
        console.error('Error populating template:', error);
        throw error;
    }
};

/**
 * Generates a new Google Doc from report data and sections.
 * @param {string} title 
 * @param {object} reportMeta 
 * @param {object} sections 
 * @param {string} [folderId] Optional folder to place the file in
 */
export const generateReportDoc = async (title, reportMeta, sections, folderId = null) => {
    try {
        // 1. Create Blank File
        const fileMetadata = {
            name: title,
            mimeType: 'application/vnd.google-apps.document'
        };

        // Fix: Create directly in folder (like Meeting Notes) instead of moving later
        if (folderId) {
            fileMetadata.parents = [folderId];
        }

        const { result: file } = await window.gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id, webViewLink',
        });

        if (!file?.id) throw new Error("Failed to create file");

        // Logic for moving is no longer needed since we created it in the folder
        // (Removed "If folderId is provided, move the file" block)

        // 2. Build Requests
        const requests = getReportGenerationRequests(reportMeta, sections);

        // 3. Apply Formatting
        await window.gapi.client.docs.documents.batchUpdate({
            documentId: file.id,
            resource: { requests }
        });

        // 4. Validation & Final Fetch
        // User requested validation logic to ensure link exists before returning
        const finalFile = await window.gapi.client.drive.files.get({
            fileId: file.id,
            fields: 'id, webViewLink, name'
        });

        return finalFile.result; // Returns { id, webViewLink, name }
    } catch (error) {
        console.error("Error generating report doc:", error);
        throw error;
    }
};

// List Files in a specific folder (Refactored to use searchFiles logic if needed, but keeping simple for now)
export const listFiles = async (folderId) => {
    return searchFiles(null, folderId);
};

// MOCK DATA GENERATOR for Demo Mode
export const getMockFiles = () => {
    return [
        {
            id: '1',
            name: 'Project_Proposal_Draft_v2.pdf',
            mimeType: 'application/pdf',
            webViewLink: '#',
            iconLink: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_pdf_x16.png',
            modifiedTime: new Date().toISOString(),
            owners: [{ displayName: 'Rodrigo' }]
        },
        {
            id: '2',
            name: 'Datasets_2024',
            mimeType: 'application/vnd.google-apps.folder',
            webViewLink: '#',
            iconLink: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_folder_x16.png',
            modifiedTime: new Date(Date.now() - 86400000).toISOString(),
            owners: [{ displayName: 'Rodrigo' }]
        },
        {
            id: '3',
            name: 'Experiment_Results.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            webViewLink: '#',
            iconLink: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_excel_x16.png',
            modifiedTime: new Date(Date.now() - 172800000).toISOString(),
            owners: [{ displayName: 'Lab Manager' }]
        }
    ];
};

/**
 * Recursively gets all files inside a folder, returning them with a "category" property based on their parent folder name
 * and a "tags" property based on the full folder path.
 * @param {string} rootFolderId 
 */
export const syncDriveFiles = async (rootFolderId) => {
    const tokenObj = window.gapi.client.getToken();
    if (!tokenObj) throw new Error("Auth required");

    // Fetch Root Folder Name first
    let rootName = 'General';
    try {
        const rootRes = await window.gapi.client.drive.files.get({
            fileId: rootFolderId,
            fields: 'name'
        });
        rootName = rootRes.result.name;
    } catch (e) {
        console.warn("Could not fetch root folder name", e);
    }

    let allFiles = [];
    let foldersToProcess = [{ id: rootFolderId, name: rootName, parentId: null }];
    // Map ID -> { name, parentId } to reconstruct paths
    let folderMap = { [rootFolderId]: { name: rootName, parentId: null } };

    let queryCount = 0;
    const MAX_QUERIES = 50;

    while (foldersToProcess.length > 0 && queryCount < MAX_QUERIES) {
        const currentBatch = foldersToProcess.splice(0, 5);
        queryCount++;

        const batchPromises = currentBatch.map(async (folder) => {
            const q = `'${folder.id}' in parents and trashed = false`;
            const res = await window.gapi.client.drive.files.list({
                pageSize: 100,
                fields: "files(id, name, mimeType, webViewLink, iconLink, createdTime, parents)",
                q: q
            });
            return { parentId: folder.id, files: res.result.files };
        });

        const results = await Promise.all(batchPromises);

        for (const res of results) {
            const parentId = res.parentId;
            // If parent is root, use 'General' implies we don't use root name as category
            const parentName = (parentId === rootFolderId) ? 'General' : (folderMap[parentId]?.name || 'Drive');

            for (const f of res.files) {
                if (f.mimeType === 'application/vnd.google-apps.folder') {
                    foldersToProcess.push({ id: f.id, name: f.name, parentId: parentId });
                    folderMap[f.id] = { name: f.name, parentId: parentId };
                } else {
                    // Reconstruct full path for tags
                    const tags = [];
                    let currId = parentId;
                    while (currId && folderMap[currId]) {
                        // Exclude root folder from tags as per user request
                        if (currId !== rootFolderId) {
                            tags.unshift(folderMap[currId].name);
                        }
                        currId = folderMap[currId].parentId;
                    }

                    // Double-check: Explicitly remove rootName from tags if it snuck in
                    const finalTags = tags.filter(t => t !== rootName);

                    allFiles.push({
                        ...f,
                        category: parentName, // Immediate parent
                        tags: finalTags // Full path as tags without root
                    });
                }
            }
        }
    }

    return allFiles;
};

/**
 * Creates a Meeting Note Doc with Template and Pending Tasks
 */
export const createMeetingNoteDoc = async (title, meta, folderId, pendingTasks = []) => {
    try {
        // 1. Create Blank File
        const fileMetadata = {
            name: title,
            mimeType: 'application/vnd.google-apps.document'
        };
        if (folderId) {
            fileMetadata.parents = [folderId];
        }

        const { result: file } = await window.gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id, webViewLink',
        });

        if (!file?.id) throw new Error("Failed to create file");

        // 2. Content Builder
        // We will construct one large string and calculate ranges for styling
        let currentIndex = 1;
        const requests = [];

        const addText = (text, styleType = 'NORMAL', isBold = false) => {
            if (!text) return;

            const startIndex = currentIndex;
            const endIndex = startIndex + text.length;

            // Insert Request
            requests.push({
                insertText: {
                    location: { index: startIndex },
                    text: text
                }
            });

            // Style Request (Paragraph)
            if (styleType !== 'NORMAL') {
                requests.push({
                    updateParagraphStyle: {
                        range: { startIndex, endIndex },
                        paragraphStyle: { namedStyleType: styleType },
                        fields: 'namedStyleType'
                    }
                });
            }

            // Bold Request (Text Style)
            if (isBold) {
                requests.push({
                    updateTextStyle: {
                        range: { startIndex, endIndex },
                        textStyle: { bold: true },
                        fields: 'bold'
                    }
                });
            }

            currentIndex += text.length;
        };

        // --- HEADER ---
        addText('MINUTA DE REUNIÓN\n', 'HEADING_1');
        addText(`Fecha: ${meta.startDate}\n`, 'NORMAL');
        addText(`Creador: ${meta.authorName}\n\n`, 'NORMAL');

        // --- ASISTENTES ---
        addText('ASISTENTES\n', 'HEADING_2');
        // Placeholder bullets
        const startAssistants = currentIndex;
        addText('- [ ] \n- [ ] \n\n', 'NORMAL');
        // Note: Creating real bullets via API is complex, simple dash checks are robust enough for initial template

        // --- NOTAS ---
        addText('NOTAS / MINUTA\n', 'HEADING_2');
        addText('Discusión principal:\n\n\n', 'NORMAL');

        // --- ACUERDOS ---
        addText('PASOS A SEGUIR / ACUERDOS\n', 'HEADING_2');
        addText('1. \n\n', 'NORMAL');

        // --- TAREAS PENDIENTES ---
        addText('TAREAS PENDIENTES (GLOBALES)\n', 'HEADING_2');

        if (pendingTasks && pendingTasks.length > 0) {
            pendingTasks.forEach(t => {
                const prio = t.priority === 'high' ? ' (ALTA)' : '';
                const line = `[ ] ${t.title}${prio}\n`;
                addText(line, 'NORMAL');
            });
        } else {
            addText('(No hay tareas pendientes)\n', 'NORMAL', false); // Italic?
        }

        // 3. Execute Batch Update
        // We must reverse requests if we were inserting at index 1 always, 
        // but here we tracked 'currentIndex' assuming sequential appends.
        // HOWEVER: With the API, if I insert at index 1, then insert at index 20, 
        // the first insert shifts indices. 
        // Since we calculated indices based on accumulating length, we must execute them in ORDER.
        // Wait, if I insert at 1 (length 10), the next valid index is 11.
        // My logic keeps track of 'currentIndex' correctly relative to the *final* document state? 
        // NO.
        // TRICK: It is safest to calculate the final string, insert it ALL at once at index 1, 
        // and THEN apply styles to the known ranges of that string.

        // RE-STRATEGY: Single Insert, then Style ranges.

        let fullText = '';
        const styleRequests = [];
        let cursor = 1;

        const appendSection = (text, style = 'NORMAL') => {
            const start = cursor;
            fullText += text;
            cursor += text.length;

            if (style !== 'NORMAL') {
                styleRequests.push({
                    updateParagraphStyle: {
                        range: { startIndex: start, endIndex: cursor },
                        paragraphStyle: { namedStyleType: style },
                        fields: 'namedStyleType'
                    }
                });
            }
        };

        appendSection('MINUTA DE REUNIÓN\n', 'HEADING_1');
        appendSection(`Fecha: ${meta.startDate}\n`, 'NORMAL');
        appendSection(`Creador: ${meta.authorName}\n\n`, 'NORMAL');

        appendSection('ASISTENTES\n', 'HEADING_2');
        appendSection('- \n- \n\n', 'NORMAL');

        appendSection('NOTAS / MINUTA\n', 'HEADING_2');
        appendSection('\n\n\n', 'NORMAL'); // Space for typing

        appendSection('PASOS A SEGUIR / ACUERDOS\n', 'HEADING_2');
        appendSection('1. \n2. \n\n', 'NORMAL');

        appendSection('TAREAS PENDIENTES (GLOBALES)\n', 'HEADING_2');
        if (pendingTasks && pendingTasks.length > 0) {
            pendingTasks.forEach(t => {
                const prio = t.priority === 'high' ? ' (ALTA)' : '';
                appendSection(`[ ] ${t.title}${prio}\n`, 'NORMAL');
            });
        } else {
            appendSection('(No hay tareas pendientes)\n', 'NORMAL');
        }

        // Final Batch Request
        // 1. Insert Text
        // 2. Apply Styles
        await window.gapi.client.docs.documents.batchUpdate({
            documentId: file.id,
            resource: {
                requests: [
                    {
                        insertText: {
                            location: { index: 1 },
                            text: fullText
                        }
                    },
                    ...styleRequests
                ]
            }
        });

        // 4. Return Final Info
        const finalFile = await window.gapi.client.drive.files.get({
            fileId: file.id,
            fields: 'id, webViewLink, name'
        });

        return finalFile.result;
    } catch (error) {
        console.error("Error creating meeting note:", error);
        throw error;
    }
};

export const googleDriveService = {
    loadGoogleScripts,
    initializeGapiClient,
    requestAccessToken,
    storeToken,
    tryRestoreToken,
    hasValidToken,
    searchFiles,
    findFileByName,
    uploadFile,
    copyFile,
    populateTemplate,
    generateReportDoc,
    createMeetingNoteDoc,
    listFiles,
    getMockFiles,
    syncDriveFiles
};

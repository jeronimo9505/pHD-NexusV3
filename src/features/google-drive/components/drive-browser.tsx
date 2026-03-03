'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { initGoogleClient, ensureAuth } from '@/lib/google/auth';
import { DriveToolbar } from './drive-toolbar';
import type { GoogleFileType } from './drive-toolbar';
import { DriveBreadcrumbs } from './drive-breadcrumbs';
import { DriveFileRow } from './drive-file-row';
import { DriveFileCard } from './drive-file-card';
import { FileDetailPanel } from './file-detail-panel';
import { ActivityFeedPanel } from './activity-feed-panel';
import { Loader2, CloudOff, LogIn, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
    iconLink?: string;
    modifiedTime?: string;
    size?: string;
    owners?: { displayName: string }[];
    lastModifyingUser?: { displayName: string; photoLink?: string };
}

interface FolderEntry {
    id: string;
    name: string;
}

interface DriveBrowserProps {
    groupId: string;
    driveSettings?: {
        clientId?: string;
        apiKey?: string;
        folderId?: string;
    };
}

export type ViewMode = 'list' | 'grid';
export type SortBy = 'name_asc' | 'name_desc' | 'modified_desc' | 'modified_asc';

export function DriveBrowser({ groupId, driveSettings }: DriveBrowserProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [files, setFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const [isSearchResults, setIsSearchResults] = useState(false);

    // Panels
    const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
    const [showActivityFeed, setShowActivityFeed] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Navigation – initialize from URL params
    const rootFolderId = driveSettings?.folderId || 'root';

    const getInitialPath = (): FolderEntry[] => {
        const pathParam = searchParams.get('path');
        if (pathParam) {
            try {
                const parsed = JSON.parse(decodeURIComponent(pathParam));
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            } catch { }
        }
        return [{ id: rootFolderId, name: 'My Drive' }];
    };

    const [folderPath, setFolderPath] = useState<FolderEntry[]>(getInitialPath);
    const [currentFolderId, setCurrentFolderId] = useState(
        searchParams.get('folder') || rootFolderId
    );

    // Sync URL when folder changes (push to browser history)
    const pushFolderUrl = useCallback((path: FolderEntry[]) => {
        const folderId = path[path.length - 1].id;
        const params = new URLSearchParams();
        if (folderId !== rootFolderId) {
            params.set('folder', folderId);
            params.set('path', encodeURIComponent(JSON.stringify(path)));
        }
        const qs = params.toString();
        router.push(`${pathname}${qs ? `?${qs}` : ''}`);
    }, [pathname, rootFolderId, router]);

    // Listen for popstate (browser back/forward) to update folder state
    useEffect(() => {
        const handlePopState = () => {
            const url = new URL(window.location.href);
            const folder = url.searchParams.get('folder') || rootFolderId;
            const pathParam = url.searchParams.get('path');

            let newPath: FolderEntry[] = [{ id: rootFolderId, name: 'My Drive' }];
            if (pathParam) {
                try {
                    const parsed = JSON.parse(decodeURIComponent(pathParam));
                    if (Array.isArray(parsed) && parsed.length > 0) newPath = parsed;
                } catch { }
            }

            setFolderPath(newPath);
            setCurrentFolderId(folder);
            setSearchQuery('');
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [rootFolderId]);

    // UI state
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortBy>('modified_desc');

    // Debounce ref for search
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Initialize Google client
    useEffect(() => {
        if (!driveSettings?.apiKey || !driveSettings?.clientId) {
            setIsInitializing(false);
            setLoading(false);
            setError('Google Drive is not configured. Please set up your credentials in Group Settings.');
            return;
        }

        const init = async () => {
            try {
                await initGoogleClient(driveSettings.apiKey!, driveSettings.clientId!);

                const gapi = (window as any).gapi;
                if (gapi?.client?.getToken()?.access_token) {
                    setIsAuthenticated(true);
                }
            } catch (err) {
                console.error('Failed to initialize Google API:', err);
                setError('Failed to initialize Google Drive connection');
            } finally {
                setIsInitializing(false);
                setLoading(false);
            }
        };

        init();
    }, [driveSettings?.apiKey, driveSettings?.clientId]);

    // Load files when folder changes or auth state changes
    useEffect(() => {
        if (isAuthenticated && !isInitializing) {
            loadFiles(currentFolderId);
        }
    }, [currentFolderId, isAuthenticated, isInitializing]);

    // Deep search with debounce
    useEffect(() => {
        if (!isAuthenticated || isInitializing) return;

        // Clear previous timer
        if (searchTimerRef.current) {
            clearTimeout(searchTimerRef.current);
        }

        // If search is cleared, go back to folder view
        if (!searchQuery.trim()) {
            setIsSearchResults(false);
            loadFiles(currentFolderId);
            return;
        }

        // Debounce: wait 500ms after user stops typing
        searchTimerRef.current = setTimeout(() => {
            searchDriveFiles(searchQuery.trim());
        }, 500);

        return () => {
            if (searchTimerRef.current) {
                clearTimeout(searchTimerRef.current);
            }
        };
    }, [searchQuery, isAuthenticated, isInitializing]);

    const loadFiles = useCallback(async (folderId: string) => {
        setLoading(true);
        setError(null);

        try {
            const gapi = (window as any).gapi;
            if (!gapi?.client?.drive) {
                throw new Error('Google Drive API not loaded');
            }

            const response = await gapi.client.drive.files.list({
                q: `'${folderId}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType, webViewLink, iconLink, modifiedTime, size, owners, lastModifyingUser)',
                orderBy: 'folder,name',
                pageSize: 200
            });

            setFiles(response.result.files || []);
            setIsSearchResults(false);
        } catch (err: any) {
            console.error('Error loading files:', err);
            const status = err?.status || err?.result?.error?.code;
            if (status === 401 || status === 403) {
                setIsAuthenticated(false);
                setError('Authentication expired. Please sign in again.');
            } else {
                setError('Failed to load files. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const searchDriveFiles = useCallback(async (query: string) => {
        setSearching(true);
        setError(null);

        try {
            const gapi = (window as any).gapi;
            if (!gapi?.client?.drive) {
                throw new Error('Google Drive API not loaded');
            }

            // Step 1: Recursively collect all folder IDs under root
            const allFolderIds: string[] = [rootFolderId];
            const foldersToScan = [rootFolderId];

            while (foldersToScan.length > 0) {
                const batch = foldersToScan.splice(0, 5);
                const results = await Promise.all(
                    batch.map(fId =>
                        gapi.client.drive.files.list({
                            q: `'${fId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                            fields: 'files(id)',
                            pageSize: 100
                        })
                    )
                );
                for (const res of results) {
                    const subFolders = res.result.files || [];
                    for (const sf of subFolders) {
                        allFolderIds.push(sf.id);
                        foldersToScan.push(sf.id);
                    }
                }
            }

            // Step 2: Search files by name within those folders
            const escapedQuery = query.replace(/'/g, "\\'");
            // Build parent filter: ('id1' in parents or 'id2' in parents ...)
            // Drive API has query length limits, so batch if needed
            const BATCH_SIZE = 20;
            const allMatchedFiles: DriveFile[] = [];

            for (let i = 0; i < allFolderIds.length; i += BATCH_SIZE) {
                const chunk = allFolderIds.slice(i, i + BATCH_SIZE);
                const parentFilter = chunk.map(id => `'${id}' in parents`).join(' or ');

                const response = await gapi.client.drive.files.list({
                    q: `name contains '${escapedQuery}' and (${parentFilter}) and trashed=false`,
                    fields: 'files(id, name, mimeType, webViewLink, iconLink, modifiedTime, size, owners, lastModifyingUser)',
                    orderBy: 'modifiedTime desc',
                    pageSize: 100
                });

                allMatchedFiles.push(...(response.result.files || []));
            }

            // Deduplicate by ID
            const unique = Array.from(new Map(allMatchedFiles.map(f => [f.id, f])).values());

            setFiles(unique);
            setIsSearchResults(true);
        } catch (err: any) {
            console.error('Error searching files:', err);
            const status = err?.status || err?.result?.error?.code;
            if (status === 401 || status === 403) {
                setIsAuthenticated(false);
                setError('Authentication expired. Please sign in again.');
            } else {
                setError('Search failed. Please try again.');
            }
        } finally {
            setSearching(false);
        }
    }, [rootFolderId]);

    const handleAuth = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = await ensureAuth();
            if (token) {
                setIsAuthenticated(true);
            } else {
                setError('Authentication failed. Please try again.');
                setLoading(false);
            }
        } catch (err) {
            console.error('Auth error:', err);
            setError('Authentication failed. Please try again.');
            setLoading(false);
        }
    };

    const handleNavigateToFolder = (folderId: string, folderName: string) => {
        const newPath = [...folderPath, { id: folderId, name: folderName }];
        setFolderPath(newPath);
        setCurrentFolderId(folderId);
        setSearchQuery('');
        pushFolderUrl(newPath);
    };

    const handleBreadcrumbClick = (index: number) => {
        const newPath = folderPath.slice(0, index + 1);
        setFolderPath(newPath);
        setCurrentFolderId(newPath[newPath.length - 1].id);
        setSearchQuery('');
        pushFolderUrl(newPath);
    };

    const handleRefresh = () => {
        if (searchQuery.trim()) {
            searchDriveFiles(searchQuery.trim());
        } else {
            loadFiles(currentFolderId);
        }
    };

    const handleFileClick = (file: DriveFile) => {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
            handleNavigateToFolder(file.id, file.name);
        } else if (file.webViewLink) {
            window.open(file.webViewLink, '_blank');
        }
    };

    const handleShowDetails = (file: DriveFile) => {
        setSelectedFile(file);
        setShowActivityFeed(false);
    };

    const handleClearSearch = () => {
        setSearchQuery('');
        setIsSearchResults(false);
        loadFiles(currentFolderId);
    };

    // ─── UPLOAD FILES ────────────────────────────────────────────────
    const handleUploadFiles = async (fileList: FileList) => {
        const gapi = (window as any).gapi;
        const token = gapi?.client?.getToken()?.access_token;
        if (!token) {
            toast.error('Not authenticated. Please sign in again.');
            return;
        }

        setIsUploading(true);
        const totalFiles = fileList.length;
        let uploaded = 0;
        const toastId = toast.loading(`Uploading 0/${totalFiles} files...`);

        try {
            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                await uploadSingleFile(file, currentFolderId, token);
                uploaded++;
                toast.loading(`Uploading ${uploaded}/${totalFiles} files...`, { id: toastId });
            }

            toast.success(`Uploaded ${uploaded} file${uploaded > 1 ? 's' : ''} successfully`, { id: toastId });
            loadFiles(currentFolderId);
        } catch (err: any) {
            console.error('Upload error:', err);
            toast.error(`Upload failed: ${err.message || 'Unknown error'}`, { id: toastId });
        } finally {
            setIsUploading(false);
        }
    };

    const uploadSingleFile = (file: File, folderId: string, accessToken: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            const metadata = {
                name: file.name,
                parents: [folderId],
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink');
            xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            };
            xhr.onerror = () => reject(new Error('Network error during upload'));
            xhr.send(form);
        });
    };

    // ─── CREATE FOLDER ───────────────────────────────────────────────
    const handleCreateFolder = async () => {
        const folderName = prompt('Enter folder name:');
        if (!folderName?.trim()) return;

        try {
            const gapi = (window as any).gapi;
            await gapi.client.drive.files.create({
                resource: {
                    name: folderName.trim(),
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [currentFolderId],
                },
                fields: 'id, name',
            });

            toast.success(`Folder "${folderName.trim()}" created`);
            loadFiles(currentFolderId);
        } catch (err: any) {
            console.error('Create folder error:', err);
            toast.error(`Failed to create folder: ${err.message || 'Unknown error'}`);
        }
    };

    // ─── CREATE GOOGLE FILE (Doc / Sheet / Slides) ─────────────────
    const handleCreateGoogleFile = async (type: GoogleFileType) => {
        const mimeTypes: Record<GoogleFileType, string> = {
            document: 'application/vnd.google-apps.document',
            spreadsheet: 'application/vnd.google-apps.spreadsheet',
            presentation: 'application/vnd.google-apps.presentation',
        };
        const labels: Record<GoogleFileType, string> = {
            document: 'Document',
            spreadsheet: 'Spreadsheet',
            presentation: 'Presentation',
        };

        const fileName = prompt(`Enter ${labels[type]} name:`, `Untitled ${labels[type]}`);
        if (!fileName?.trim()) return;

        try {
            const gapi = (window as any).gapi;
            const response = await gapi.client.drive.files.create({
                resource: {
                    name: fileName.trim(),
                    mimeType: mimeTypes[type],
                    parents: [currentFolderId],
                },
                fields: 'id, name, webViewLink',
            });

            const newFile = response.result;
            toast.success(`${labels[type]} "${fileName.trim()}" created`);

            // Open in new tab
            if (newFile.webViewLink) {
                window.open(newFile.webViewLink, '_blank');
            }

            loadFiles(currentFolderId);
        } catch (err: any) {
            console.error('Create file error:', err);
            toast.error(`Failed to create ${labels[type]}: ${err.message || 'Unknown error'}`);
        }
    };

    // Sort (no client-side search filter needed — Drive API handles it)
    const processedFiles = (() => {
        let result = [...files];

        // Sort: folders always first
        const folders = result.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
        const nonFolders = result.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

        const sortFn = (a: DriveFile, b: DriveFile) => {
            switch (sortBy) {
                case 'name_asc':
                    return a.name.localeCompare(b.name);
                case 'name_desc':
                    return b.name.localeCompare(a.name);
                case 'modified_desc':
                    return new Date(b.modifiedTime || 0).getTime() - new Date(a.modifiedTime || 0).getTime();
                case 'modified_asc':
                    return new Date(a.modifiedTime || 0).getTime() - new Date(b.modifiedTime || 0).getTime();
                default:
                    return 0;
            }
        };

        folders.sort(sortFn);
        nonFolders.sort(sortFn);

        return [...folders, ...nonFolders];
    })();

    // --- Not configured state ---
    if (!driveSettings?.apiKey || !driveSettings?.clientId) {
        return (
            <div className="flex-1 flex items-center justify-center p-12">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CloudOff className="w-8 h-8 text-slate-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-slate-800 mb-2">Google Drive Not Configured</h2>
                    <p className="text-slate-500 text-sm">
                        Set up your Google API credentials in Group Settings to browse your Drive files.
                    </p>
                </div>
            </div>
        );
    }

    // --- Auth required state ---
    if (!isAuthenticated && !isInitializing && !loading) {
        return (
            <div className="flex-1 flex items-center justify-center p-12">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <LogIn className="w-8 h-8 text-blue-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-slate-800 mb-2">Connect to Google Drive</h2>
                    <p className="text-slate-500 text-sm mb-6">
                        Sign in with your Google account to browse and manage your files.
                    </p>
                    <button
                        onClick={handleAuth}
                        className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
                    >
                        <LogIn size={18} />
                        Sign in with Google
                    </button>
                    {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full">
            {/* Main content */}
            <div className="flex flex-col flex-1 min-w-0">
                {/* Toolbar */}
                <DriveToolbar
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    sortBy={sortBy}
                    onSortChange={setSortBy}
                    onRefresh={handleRefresh}
                    isLoading={loading || searching}
                    onActivityToggle={() => { setShowActivityFeed(v => !v); setSelectedFile(null); }}
                    isActivityOpen={showActivityFeed}
                    onUploadFiles={handleUploadFiles}
                    onCreateFolder={handleCreateFolder}
                    onCreateGoogleFile={handleCreateGoogleFile}
                    isUploading={isUploading}
                />

                {/* Breadcrumbs or Search Results indicator */}
                {isSearchResults ? (
                    <div className="px-6 py-2.5 bg-blue-50/70 border-b border-blue-100 flex items-center gap-2 text-sm">
                        <Search size={14} className="text-blue-500" />
                        <span className="text-blue-700 font-medium">
                            Search results for &quot;{searchQuery}&quot;
                        </span>
                        <span className="text-blue-500">
                            ({processedFiles.length} {processedFiles.length === 1 ? 'result' : 'results'})
                        </span>
                        <button
                            onClick={handleClearSearch}
                            className="ml-auto text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
                        >
                            Clear search
                        </button>
                    </div>
                ) : (
                    <DriveBreadcrumbs
                        path={folderPath}
                        onNavigate={handleBreadcrumbClick}
                    />
                )}

                {/* File list/grid */}
                <div className="flex-1 overflow-y-auto px-6 pb-4">
                    {(loading || searching) && files.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                            {searching && (
                                <p className="text-sm text-slate-500">Searching across all folders...</p>
                            )}
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <CloudOff className="w-10 h-10 text-slate-300 mb-3" />
                            <p className="text-slate-500 text-sm">{error}</p>
                            <button
                                onClick={handleRefresh}
                                className="mt-4 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-2"
                            >
                                <RefreshCw size={14} /> Try again
                            </button>
                        </div>
                    ) : processedFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                                {searchQuery ? (
                                    <Search className="w-7 h-7 text-slate-300" />
                                ) : (
                                    <CloudOff className="w-7 h-7 text-slate-300" />
                                )}
                            </div>
                            <p className="text-slate-500 text-sm">
                                {searchQuery ? 'No files match your search' : 'This folder is empty'}
                            </p>
                            {searchQuery && (
                                <button
                                    onClick={handleClearSearch}
                                    className="mt-3 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    Clear search
                                </button>
                            )}
                        </div>
                    ) : viewMode === 'list' ? (
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {/* List header */}
                            <div className="grid grid-cols-[1fr_140px_120px_100px_32px] gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <span>Name</span>
                                <span>Modified By</span>
                                <span>Last Modified</span>
                                <span className="text-right">Size</span>
                                <span />
                            </div>
                            {processedFiles.map(file => (
                                <DriveFileRow
                                    key={file.id}
                                    file={file}
                                    onClick={() => handleFileClick(file)}
                                    onInfoClick={() => handleShowDetails(file)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                            {processedFiles.map(file => (
                                <DriveFileCard
                                    key={file.id}
                                    file={file}
                                    onClick={() => handleFileClick(file)}
                                    onInfoClick={() => handleShowDetails(file)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Side Panels */}
            {selectedFile && (
                <FileDetailPanel
                    file={selectedFile}
                    onClose={() => setSelectedFile(null)}
                />
            )}
            {showActivityFeed && (
                <ActivityFeedPanel
                    isOpen={showActivityFeed}
                    onClose={() => setShowActivityFeed(false)}
                    rootFolderId={rootFolderId}
                />
            )}
        </div>
    );
}

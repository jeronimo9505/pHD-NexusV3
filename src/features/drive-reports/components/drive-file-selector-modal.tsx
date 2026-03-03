'use client';

import { useState, useEffect, useCallback } from 'react';
import { initGoogleClient, ensureAuth, clearToken } from '@/lib/google/auth';
import { X, Folder, FileText, File, Search, Loader2, Home, ChevronRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
    iconLink?: string;
    modifiedTime?: string;
}

interface DriveFileSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (file: DriveFile) => void;
    driveSettings?: {
        clientId?: string;
        apiKey?: string;
        folderId?: string;
    };
    selectionMode?: 'file' | 'folder';
}

export function DriveFileSelectorModal({
    isOpen,
    onClose,
    onSelect,
    driveSettings,
    selectionMode = 'file'
}: DriveFileSelectorModalProps) {
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentFolderId, setCurrentFolderId] = useState(driveSettings?.folderId || 'root');
    const [folderHistory, setFolderHistory] = useState<Array<{ id: string; name: string }>>([
        { id: driveSettings?.folderId || 'root', name: 'Root' }
    ]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);



    // Load Google API
    useEffect(() => {
        if (!isOpen || !driveSettings?.apiKey || !driveSettings?.clientId) return;

        const init = async () => {
            try {
                await initGoogleClient(driveSettings.apiKey!, driveSettings.clientId!);

                // Check if authenticated
                const gapi = (window as any).gapi;
                if (gapi?.client?.getToken()?.access_token) {
                    setIsAuthenticated(true);
                    await loadFiles(currentFolderId);
                } else {
                    setLoading(false);
                }
            } catch (err) {
                console.error('Failed to load Google API:', err);
                setError('Failed to initialize Google Drive');
                setLoading(false);
            }
        };

        if (isOpen) {
            init();
        }
    }, [isOpen, driveSettings?.apiKey, driveSettings?.clientId, currentFolderId]);

    const loadFiles = useCallback(async (folderId: string) => {
        if (!driveSettings?.apiKey) return;

        setLoading(true);
        setError(null);

        try {
            const gapi = (window as any).gapi;
            if (!gapi?.client?.drive) {
                throw new Error("Google Drive API not loaded");
            }

            const response = await gapi.client.drive.files.list({
                q: `'${folderId}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType, webViewLink, iconLink, modifiedTime)',
                orderBy: 'folder desc,name',
                pageSize: 100
            });

            setFiles(response.result.files || []);
        } catch (err: any) {
            console.error('Error loading files:', JSON.stringify(err, null, 2));

            // Check for auth errors
            const status = err?.status || err?.result?.error?.code;

            if (status === 401 || status === 403) {
                // Token expired or invalid
                // Auth.ts handles clearing storage on loadToken if expired, but here we got a 401 from API.
                // We should probably call clearToken() from auth.ts
                const { clearToken } = await import('@/lib/google/auth');
                clearToken();
                setIsAuthenticated(false);
                setError(null);
            } else {
                setError('Failed to load files. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }, [driveSettings?.apiKey, isAuthenticated]);

    const handleAuthenticate = async () => {
        try {
            const { ensureAuth } = await import('@/lib/google/auth');
            await ensureAuth();
            setIsAuthenticated(true);
            loadFiles(currentFolderId);
        } catch (err) {
            console.error('Authentication error:', err);
            setError('Failed to authenticate');
        }
    };

    const handleNavigate = (folderId: string, folderName: string) => {
        setCurrentFolderId(folderId);
        setSearchQuery('');

        const existingIndex = folderHistory.findIndex(f => f.id === folderId);
        if (existingIndex >= 0) {
            setFolderHistory(folderHistory.slice(0, existingIndex + 1));
        } else {
            setFolderHistory([...folderHistory, { id: folderId, name: folderName }]);
        }
    };

    const handleNavigateUp = () => {
        if (folderHistory.length <= 1) return;
        const parent = folderHistory[folderHistory.length - 2];
        handleNavigate(parent.id, parent.name);
    };

    const handleFileClick = (file: DriveFile) => {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
            handleNavigate(file.id, file.name);
        } else {
            onSelect(file);
            onClose();
        }
    };

    const getFileIcon = (mimeType: string) => {
        if (mimeType.includes('folder')) return Folder;
        if (mimeType.includes('document') || mimeType.includes('pdf')) return FileText;
        return File;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-4xl h-[600px] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800">
                            {selectionMode === 'folder' ? 'Select Drive Folder' : 'Select Drive File'}
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {selectionMode === 'folder' ? 'Choose a folder for your reports' : 'Choose a file to link to your report'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation Bar */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white">
                    {folderHistory.length > 1 && (
                        <button
                            onClick={handleNavigateUp}
                            className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        >
                            <ArrowLeft size={16} />
                        </button>
                    )}

                    {/* Breadcrumbs */}
                    <div className="flex-1 flex items-center gap-1 overflow-hidden text-xs font-medium text-slate-600">
                        {folderHistory.map((folder, idx) => (
                            <div key={`${folder.id}-${idx}`} className="flex items-center gap-1">
                                {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                                <button
                                    onClick={() => handleNavigate(folder.id, folder.name)}
                                    className={cn(
                                        "hover:text-indigo-600 hover:underline whitespace-nowrap px-1 py-0.5 rounded",
                                        idx === folderHistory.length - 1 && "font-bold text-indigo-700 bg-indigo-50"
                                    )}
                                >
                                    {idx === 0 ? <Home className="w-3 h-3" /> : folder.name}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 rounded-lg text-sm outline-none"
                            placeholder="Search files..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex items-center justify-center flex-1 overflow-y-auto p-4">
                    {!isAuthenticated && !loading && (
                        <div className="h-full flex flex-col items-center justify-center text-center">
                            <p className="text-slate-600 mb-4">Please authenticate to access your Drive files</p>
                            <button
                                onClick={handleAuthenticate}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                            >
                                Connect Google Drive
                            </button>
                        </div>
                    )}

                    {loading && (
                        <div className="h-full flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        </div>
                    )}

                    {error && (
                        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-100">
                            {error}
                        </div>
                    )}

                    {!loading && !error && isAuthenticated && files.length === 0 && (
                        <div className="h-full flex items-center justify-center text-slate-400">
                            <p>No files found</p>
                        </div>
                    )}

                    {!loading && !error && isAuthenticated && files.length > 0 && (
                        <div className="grid w-full grid-cols-1 gap-1">
                            {files
                                .filter(file =>
                                    !searchQuery ||
                                    file.name.toLowerCase().includes(searchQuery.toLowerCase())
                                )
                                .map(file => {
                                    const Icon = getFileIcon(file.mimeType);
                                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

                                    return (
                                        <button
                                            key={file.id}
                                            onClick={() => handleFileClick(file)}
                                            className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition text-left group"
                                        >
                                            <Icon className={cn(
                                                "w-5 h-5 shrink-0",
                                                isFolder ? "text-indigo-500" : "text-slate-400"
                                            )} />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-slate-700 truncate group-hover:text-indigo-600">
                                                    {file.name}
                                                </div>
                                                {file.modifiedTime && (
                                                    <div className="text-xs text-slate-400 mt-0.5">
                                                        {new Date(file.modifiedTime).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-slate-200 bg-slate-50">
                    <div className="text-xs text-slate-500">
                        {selectionMode === 'folder' ? 'Navigate to the folder you want to select' : ''}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                        >
                            Cancel
                        </button>
                        {selectionMode === 'folder' && (
                            <button
                                onClick={() => {
                                    onSelect({
                                        id: currentFolderId,
                                        name: folderHistory[folderHistory.length - 1].name,
                                        mimeType: 'application/vnd.google-apps.folder'
                                    });
                                    onClose();
                                }}
                                disabled={loading || !isAuthenticated}
                                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Select This Folder
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

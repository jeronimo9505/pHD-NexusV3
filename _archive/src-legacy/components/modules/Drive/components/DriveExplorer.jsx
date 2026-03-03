import React, { useState, useEffect, useCallback } from 'react';
import {
    LayoutGrid, List as ListIcon, FileText, Folder,
    ExternalLink, RefreshCw, AlertCircle, Image as ImageIcon, File,
    Search, Upload, ArrowLeft, Home, ChevronRight, Settings, HardDrive
} from 'lucide-react';
import { formatDateShort } from '@/utils/helpers';
import clsx from 'clsx';
import * as driveService from '../services/googleDriveService';

export default function DriveExplorer({ settings, onSettingsClick }) {
    const [viewMode, setViewMode] = useState('list');
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Navigation State
    const [currentFolderId, setCurrentFolderId] = useState(settings?.folderId);
    const [folderHistory, setFolderHistory] = useState([
        { id: settings?.folderId, name: 'Root' }
    ]);
    const [searchQuery, setSearchQuery] = useState('');

    // Upload State
    const [isUploading, setIsUploading] = useState(false);

    // Initial Load
    useEffect(() => {
        const init = async () => {
            // Reset if settings change
            setCurrentFolderId(settings?.folderId);
            setFolderHistory([{ id: settings?.folderId, name: 'Root' }]);

            setLoading(true);
            try {
                if (settings && settings.clientId) {
                    await driveService.loadGoogleScripts();
                    await driveService.initializeGapiClient(settings.apiKey, settings.clientId);
                    // 1. Try silent restore first
                    const restored = driveService.tryRestoreToken();
                    setIsAuthenticated(restored);

                    // 2. ATTEMPT LOAD IMMEDIATELY (Hybrid Mode)
                    // Public folders will work with just API Key. Private ones will fail silenty (handled in loadFiles)
                    if (!restored) {
                        // If restored, we are authenticated, loadFiles will be called by the other useEffect
                        // If NOT restored, we force a load attempt as Anonymous
                        await loadFiles(settings.folderId);
                    }
                } else {
                    setFiles(driveService.getMockFiles());
                    setLoading(false);
                }
            } catch (err) {
                console.error(err);
                setError("No se pudo inicializar el cliente de Google. Verifica tus claves.");
                setLoading(false);
            }
        };

        if (settings) {
            init();
        } else {
            setFiles(driveService.getMockFiles());
            setLoading(false);
        }
    }, [settings]);

    // Load Files - Modified for Hybrid
    const loadFiles = useCallback(async (folderId, query = '') => {
        if (!settings?.folderId && !settings?.clientId) return;

        setLoading(true);
        setError(null);
        try {
            let list;
            // The service now handles the query without token if possible
            if (query) {
                list = await driveService.searchFiles(query, folderId);
            } else {
                list = await driveService.listFiles(folderId);
            }
            setFiles(list || []);
        } catch (err) {
            console.error("Load Files Error", err);
            // Handle 403 / 401 specifically
            if (err.result?.error?.code === 401 || err.result?.error?.code === 403 || err.status === 403) {
                // Permissions Error
                if (!isAuthenticated) {
                    // We are anonymous and got denied.
                    // This means the folder is NOT public.
                    // We verify this by clearing files so the "Connect" button makes sense.
                    setFiles([]);
                    // Optional: setError("Carpeta privada. Conecta tu cuenta.");
                } else {
                    // We ARE authenticated but still failed? Token might be invalid or user has no access.
                    setError("Tu sesión ha expirado o no tienes permisos para ver esta carpeta.");
                    setIsAuthenticated(false);
                }
            } else {
                setError("Error al cargar archivos: " + (err.result?.error?.message || err.message));
            }
        } finally {
            setLoading(false);
        }
    }, [settings, isAuthenticated]);

    // Effect to load files when currentFolderId changes
    useEffect(() => {
        if (isAuthenticated && currentFolderId) {
            loadFiles(currentFolderId, searchQuery);
        }
    }, [currentFolderId, isAuthenticated, loadFiles, searchQuery]);


    const handleConnect = async () => {
        try {
            await driveService.requestAccessToken();
            setIsAuthenticated(true);
            // Force reload
            loadFiles(currentFolderId, searchQuery);
        } catch (err) {
            setError("Error de autenticación: " + JSON.stringify(err));
        }
    };

    const handleNavigate = (folderId, folderName) => {
        if (!folderId) return;
        setCurrentFolderId(folderId);
        setSearchQuery(''); // Clear search on nav

        // Update History
        // If navigating back (clicking breadcrumb), clamp history
        const existingIndex = folderHistory.findIndex(f => f.id === folderId);
        if (existingIndex >= 0) {
            setFolderHistory(folderHistory.slice(0, existingIndex + 1));
        } else {
            setFolderHistory([...folderHistory, { id: folderId, name: folderName || 'Carpeta' }]);
        }
    };

    const handleNavigateUp = () => {
        if (folderHistory.length <= 1) return;
        const parent = folderHistory[folderHistory.length - 2];
        handleNavigate(parent.id, parent.name);
    };

    // File Upload - Enforce Auth
    const handleFileUpload = async (event) => {
        if (!isAuthenticated) {
            const confirmLogin = window.confirm("Necesitas iniciar sesión para subir archivos. ¿Conectar ahora?");
            if (confirmLogin) {
                await handleConnect();
            }
            event.target.value = '';
            return;
        }

        const file = event.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            await driveService.uploadFile(file, currentFolderId);
            loadFiles(currentFolderId, searchQuery);
            alert("Archivo subido correctamente");
        } catch (err) {
            alert("Error al subir archivo. Verifica que tienes permisos de edición.");
            console.error(err);
        } finally {
            setIsUploading(false);
            event.target.value = '';
        }
    };


    const getFileIcon = (mimeType) => {
        if (mimeType.includes('folder')) return <Folder className="w-6 h-6 text-slate-600 fill-slate-100" />;
        if (mimeType.includes('image')) return <ImageIcon className="w-6 h-6 text-purple-500" />;
        if (mimeType.includes('pdf')) return <FileText className="w-6 h-6 text-red-500" />;
        if (mimeType.includes('sheet') || mimeType.includes('csv')) return <FileText className="w-6 h-6 text-green-600" />;
        return <File className="w-6 h-6 text-slate-400" />;
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 px-6 py-4 bg-white border-b border-gray-200">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-2 rounded-lg shadow-md shrink-0">
                            <HardDrive className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 leading-none">Google Drive</h2>
                            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mt-0.5">Explorador de Archivos</p>
                        </div>
                        {loading && <div className="w-4 h-4 ml-2 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Upload Button */}
                        {isAuthenticated && (
                            <label className={clsx("cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md hover:shadow-lg transform active:scale-95", isUploading ? "bg-indigo-400" : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700")}>
                                {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {isUploading ? 'Subiendo...' : 'Subir Archivo'}
                                <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                            </label>
                        )}

                        <div className="w-px h-8 bg-slate-200 mx-2" />

                        {/* View Toggles */}
                        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                            <button onClick={() => setViewMode('grid')} className={clsx("p-1.5 rounded-md transition-all duration-200", viewMode === 'grid' ? "bg-white shadow text-indigo-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-200")}>
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button onClick={() => setViewMode('list')} className={clsx("p-1.5 rounded-md transition-all duration-200", viewMode === 'list' ? "bg-white shadow text-indigo-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-200")}>
                                <ListIcon className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Text Buttons with Tooltips */}
                        <button onClick={() => isAuthenticated ? loadFiles(currentFolderId, searchQuery) : null} className="p-2 text-slate-500 hover:text-indigo-600 bg-white border border-slate-200 shadow-sm rounded-lg hover:bg-indigo-50 transition-all active:scale-95" title="Recargar">
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        <button onClick={onSettingsClick} className="p-2 text-slate-500 hover:text-indigo-600 bg-white border border-slate-200 shadow-sm rounded-lg hover:bg-indigo-50 transition-all active:scale-95" title="Configuración">
                            <Settings className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Navigation Bar & Search */}
                <div className="flex items-center gap-4">
                    {folderHistory.length > 1 && (
                        <button onClick={handleNavigateUp} className="p-2 bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg shadow-sm transition-colors active:scale-95" title="Subir nivel">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}

                    {/* Breadcrumbs */}
                    <div className="flex-1 flex items-center gap-1 overflow-hidden text-xs font-medium text-slate-600">
                        {folderHistory.map((folder, idx) => (
                            <React.Fragment key={`${folder.id}-${idx}`}>
                                {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
                                <button
                                    onClick={() => handleNavigate(folder.id, folder.name)}
                                    className={clsx("hover:text-indigo-600 hover:underline whitespace-nowrap px-1 py-0.5 rounded transition-colors", idx === folderHistory.length - 1 ? "font-bold text-indigo-700 bg-indigo-50" : "")}
                                >
                                    {idx === 0 ? <Home className="w-3 h-3" /> : folder.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Search Input */}
                    <div className="relative w-80 flex items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                className="w-full pl-10 pr-4 py-2 bg-slate-100 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 rounded-full text-sm outline-none transition-all shadow-sm placeholder:text-slate-400"
                                placeholder="Buscar en Drive..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') loadFiles(currentFolderId, searchQuery); }}
                            />
                        </div>
                        {searchQuery && (
                            <button
                                onClick={() => loadFiles(currentFolderId, searchQuery)}
                                className="ml-2 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 shadow-md transition-transform active:scale-95"
                                title="Buscar"
                            >
                                <Search className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {!isAuthenticated && settings?.clientId && (
                    <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-xs flex justify-between items-center">
                        <span>Conecta tu cuenta para acceder a tus archivos reales.</span>
                        <button onClick={handleConnect} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md font-bold transition-colors">
                            Conectar Google
                        </button>
                    </div>
                )}
            </div>

            {/* Error Banner */}
            {error && (
                <div className="mx-6 mt-4 p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3 border border-red-100 animate-in slide-in-from-top-2">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar relative">

                {/* Loader Overlay */}
                {loading && (
                    <div className="absolute inset-0 bg-white/80 z-10 flex flex-col items-center justify-center backdrop-blur-sm">
                        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
                        <p className="text-slate-500 font-medium text-sm animate-pulse">Cargando...</p>
                    </div>
                )}

                {files.length === 0 && !loading && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <Folder className="w-16 h-16 text-slate-200 mb-4" />
                        <p>No se encontraron archivos.</p>
                        {!isAuthenticated && (
                            <div className="mt-2 text-center max-w-xs">
                                <p className="text-xs mb-2">Si la carpeta es privada, necesitas conectar tu cuenta para ver el contenido.</p>
                                <button onClick={handleConnect} className="text-xs font-bold text-indigo-600 hover:underline">
                                    Conectar ahora
                                </button>
                            </div>
                        )}
                        {searchQuery && <p className="text-xs mt-1">Prueba con otra búsqueda.</p>}
                    </div>
                )}

                {/* GRID VIEW */}
                {viewMode === 'grid' && files.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {files.map(file => {
                            const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                            return (
                                <div
                                    key={file.id}
                                    className="group relative bg-white border border-slate-200 rounded-lg hover:shadow-md hover:border-indigo-300 transition-all duration-200 flex flex-col cursor-pointer overflow-hidden transform hover:-translate-y-0.5"
                                    onClick={() => isFolder ? handleNavigate(file.id, file.name) : window.open(file.webViewLink, '_blank')}
                                >
                                    {/* Card Header (Icon) */}
                                    <div className="flex-1 flex items-center justify-center py-4 bg-slate-50/50 group-hover:bg-indigo-50/10 transition-colors">
                                        {file.iconLink && !isFolder ? (
                                            <img src={file.iconLink} alt="" className="w-8 h-8 object-contain filter drop-shadow-sm group-hover:scale-110 transition-transform duration-300" />
                                        ) : (
                                            <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100">
                                                {getFileIcon(file.mimeType)}
                                            </div>
                                        )}
                                    </div>

                                    {/* Card Footer (Info) */}
                                    <div className="p-2 border-t border-slate-100 bg-white z-10">
                                        <div className="flex items-start justify-between gap-2">
                                            <h3 className="text-sm font-semibold text-slate-700 truncate mb-1 leading-snug flex-1" title={file.name}>
                                                {file.name}
                                            </h3>
                                            {/* External Link Hover Action */}
                                            <a
                                                href={file.webViewLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                title="Abrir en Google Drive"
                                                className="opacity-100 p-1 text-indigo-600 hover:bg-indigo-50 rounded bg-white border border-slate-100 shadow-sm transition-all"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        </div>

                                        <div className="flex items-center gap-2 mt-2">
                                            {isFolder && <Folder className="w-3 h-3 text-slate-400" />}
                                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">
                                                {formatDateShort(file.modifiedTime)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* LIST VIEW */}
                {viewMode === 'list' && (
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-gray-100 text-xs uppercase text-slate-400 font-bold">
                                <tr>
                                    <th className="px-6 py-3">Nombre</th>
                                    <th className="px-6 py-3">Propietario</th>
                                    <th className="px-6 py-3">Última Modificación</th>
                                    <th className="px-6 py-3 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {files.map(file => {
                                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                                    return (
                                        <tr
                                            key={file.id}
                                            className="hover:bg-slate-50 transition-colors group cursor-pointer"
                                            onClick={() => isFolder ? handleNavigate(file.id, file.name) : window.open(file.webViewLink, '_blank')}
                                        >
                                            <td className="px-6 py-3 font-medium text-slate-700 flex items-center gap-3">
                                                {isFolder ? <Folder className="w-4 h-4 text-indigo-400" /> : (file.iconLink ? <img src={file.iconLink} className="w-4 h-4" alt="" /> : <File className="w-4 h-4 text-slate-400" />)}
                                                {file.name}
                                            </td>
                                            <td className="px-6 py-3 text-slate-500 text-xs">
                                                {file.owners?.[0]?.displayName || 'Yo'}
                                            </td>
                                            <td className="px-6 py-3 text-slate-500 text-xs">
                                                {formatDateShort(file.modifiedTime)}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg shadow-sm hover:shadow transition-all" onClick={(e) => e.stopPropagation()}>
                                                    Abrir en Drive <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

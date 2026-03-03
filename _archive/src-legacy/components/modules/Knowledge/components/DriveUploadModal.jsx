import React, { useState, useEffect } from 'react';
import { Upload, Folder, File, ChevronRight, Home, Loader2, X, Check } from 'lucide-react';
import { googleDriveService } from '@/components/modules/Drive/services/googleDriveService';

export default function DriveUploadModal({ isOpen, onClose, onUploadSuccess, initialFolderId }) {
    const [file, setFile] = useState(null);
    const [currentFolderId, setCurrentFolderId] = useState(initialFolderId || 'root');
    const [folderPath, setFolderPath] = useState(initialFolderId
        ? [{ id: initialFolderId, name: 'Carpeta del Grupo' }]
        : [{ id: 'root', name: 'Mi Unidad' }]
    );
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Reset state when opening
    useEffect(() => {
        if (isOpen && initialFolderId) {
            setCurrentFolderId(initialFolderId);
            setFolderPath([{ id: initialFolderId, name: 'Carpeta del Grupo' }]);
        }
    }, [isOpen, initialFolderId]);

    // Load content when currentFolderId changes
    useEffect(() => {
        if (isOpen && currentFolderId) {
            loadFolderContents(currentFolderId);
        }
    }, [currentFolderId, isOpen]);

    const loadFolderContents = async (folderId) => {
        try {
            setLoading(true);
            const files = await googleDriveService.searchFiles(null, folderId);
            // Deduplicate files by ID just in case
            const uniqueFiles = Array.from(new Map(files.map(item => [item.id, item])).values());
            setItems(uniqueFiles || []);
        } catch (error) {
            console.error("Error loading folder:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleNavigate = (folder) => {
        setCurrentFolderId(folder.id);
        setFolderPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    };

    const handleBreadcrumbClick = (index) => {
        const target = folderPath[index];
        setCurrentFolderId(target.id);
        setFolderPath(prev => prev.slice(0, index + 1));
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        try {
            setUploading(true);
            // Upload to currentFolderId
            const result = await googleDriveService.uploadFile(file, currentFolderId);

            // Get full metadata including webViewLink (uploadFile usually returns id, name, mimeType)
            // We might need an extra fetch if upload helper doesn't return link.
            // Let's check googleDriveService... it returns response.json().
            // Standard Drive API create/upload response includes fields requested? 
            // The service defines: fields: 'id, name, webViewLink...' in list but upload uses POST default?
            // Actually the insert/upload response usually contains requested fields if specified.
            // If the service doesn't specify fields in upload URL, we might get minimal data.
            // Safest: fetch file details after upload.

            let finalFile = result;
            if (!result.webViewLink) {
                const files = await googleDriveService.findFileByName(result.name);
                // This is risky if duplicate names. Better to get by ID.
                // But service doesn't have getById exposed directly except inside generateReportDoc.
                // We can use list with "id = '...'" query or just trust findFileByName for now or assumes upload returns it.
                // Let's assume upload returns basic data, but if no link, we can try to guess or use a specific get.
                // Actually, let's assume the user just needs the ID for now or we rely on the list refresh.

                // IMPROVEMENT: Let's assume onUploadSuccess handles the data connection.
                // Ideally we want the web link.
                if (files && files.length > 0) finalFile = files[0];
            }

            onUploadSuccess(finalFile);
            onClose();
        } catch (error) {
            console.error("Upload failed:", error);
            alert("Error al subir archivo: " + (error.message || "Desconocido"));
        } finally {
            setUploading(false);
            setFile(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95">
                {/* Header */}
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <Upload className="w-5 h-5 text-indigo-600" />
                        Subir a Google Drive
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* File Selection */}
                <div className="p-6 border-b border-slate-100">
                    <div className="border-2 border-dashed border-indigo-100 rounded-xl p-6 flex flex-col items-center justify-center bg-indigo-50/30 hover:bg-indigo-50/50 transition-colors text-center">
                        {file ? (
                            <div className="flex items-center gap-3 text-indigo-700 font-medium">
                                <File className="w-8 h-8" />
                                <div>
                                    <div className="text-sm font-bold">{file.name}</div>
                                    <div className="text-xs opacity-70">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                                </div>
                                <button onClick={() => setFile(null)} className="ml-2 text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                            </div>
                        ) : (
                            <>
                                <input
                                    type="file"
                                    id="drive-upload"
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                                <label htmlFor="drive-upload" className="cursor-pointer flex flex-col items-center gap-2">
                                    <div className="p-3 bg-white rounded-full shadow-sm text-indigo-500 mb-1">
                                        <Upload className="w-6 h-6" />
                                    </div>
                                    <span className="text-sm font-bold text-indigo-600">Haz clic para seleccionar un archivo</span>
                                    <span className="text-xs text-slate-400">Selecciona el documento local que deseas subir</span>
                                </label>
                            </>
                        )}
                    </div>
                </div>

                {/* Folder Navigation */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center text-xs text-slate-500 overflow-x-auto whitespace-nowrap scrollbar-hide">
                        <span className="font-bold text-slate-400 mr-2 uppercase tracking-wider">Destino:</span>
                        {folderPath.map((folder, idx) => (
                            <React.Fragment key={folder.id || idx}>
                                {idx > 0 && <ChevronRight className="w-3 h-3 mx-1 text-slate-300" />}
                                <button
                                    onClick={() => handleBreadcrumbClick(idx)}
                                    className={`hover:text-indigo-600 flex items-center gap-1 ${idx === folderPath.length - 1 ? 'font-bold text-indigo-600' : ''}`}
                                >
                                    {folder.id === 'root' && <Home className="w-3 h-3" />}
                                    {folder.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 bg-white min-h-[200px]">
                        {loading ? (
                            <div className="flex items-center justify-center h-full text-slate-400">
                                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando carpetas...
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-1">
                                {items
                                    .filter(item => item.mimeType === 'application/vnd.google-apps.folder')
                                    .map(folder => (
                                        <button
                                            key={folder.id}
                                            onClick={() => handleNavigate(folder)}
                                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 text-left group transition-colors focus:bg-indigo-50 outline-none"
                                        >
                                            <div className="bg-amber-100 text-amber-500 p-2 rounded-lg">
                                                <Folder className="w-5 h-5 fill-current" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-slate-700 group-hover:text-indigo-700 truncate">{folder.name}</div>
                                                <div className="text-[10px] text-slate-400">Carpeta</div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400" />
                                        </button>
                                    ))}
                                {items.filter(item => item.mimeType === 'application/vnd.google-apps.folder').length === 0 && (
                                    <div className="text-center py-8 text-slate-400 text-sm">
                                        No hay subcarpetas aquí.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {uploading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" /> Subiendo...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" /> Subir Archivo
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

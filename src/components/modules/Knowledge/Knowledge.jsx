'use client';

import React, { useState, useEffect } from 'react';
import { Library, Plus, Link as LinkIcon, ChevronRight, X, Trash2, Send, ExternalLink, Tag, Search, ArrowUpDown, Filter, Pin, Upload, RefreshCw, Check, Copy, MoreHorizontal } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

import { useKnowledge } from './hooks/useKnowledge';
import DriveUploadModal from './components/DriveUploadModal';
import { googleDriveService } from '../Drive/services/googleDriveService'; // Import service

export default function Knowledge({ isSelectorMode = false, onSelect = () => { } }) {
    const { userRole, activeGroup } = useApp();
    const { knowledge, createKnowledgeItem: addResource, updateKnowledgeItem: updateResource, deleteKnowledgeItem: deleteResource, addKnowledgeComment, loading } = useKnowledge();

    const [selectedKnowledgeId, setSelectedKnowledgeId] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set()); // For multi-select
    const [currentComment, setCurrentComment] = useState('');
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isGapiReady, setIsGapiReady] = useState(false);

    // Search, Sort, Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [sortCriteria, setSortCriteria] = useState('date-desc');
    const [filterCategory, setFilterCategory] = useState('all');

    // Init Google Drive Service
    const initializeDrive = async () => {
        if (isGapiReady) return true;

        try {
            await googleDriveService.loadGoogleScripts();

            // Try to get credentials from Settings first, then Env
            // Use activeGroup.drive_settings.googleDrive as verified in Drive.jsx
            const driveConfig = activeGroup?.drive_settings?.googleDrive;

            const apiKey = driveConfig?.apiKey || process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
            const clientId = driveConfig?.clientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

            if (apiKey && clientId) {
                await googleDriveService.initializeGapiClient(apiKey, clientId);

                // Try restore token silently after client is ready
                googleDriveService.tryRestoreToken();
                setIsGapiReady(true);
                return true;
            } else {
                console.error("Missing Google Drive Credentials");
                return false;
            }
        } catch (e) {
            console.error("Failed to init Drive service", e);
            return false;
        }
    };

    useEffect(() => {
        initializeDrive();
    }, []);

    // Dynamic Categories: Get all unique categories from knowledge items + defaults
    const defaultCategories = ['Paper', 'Course', 'Video', 'Tool', 'Book', 'Report', 'Resource'];
    const existingCategories = Array.from(new Set(knowledge.map(k => k.category).filter(Boolean)));
    // Strict filter: Only show categories that are actually used in the knowledge base
    const allCategories = existingCategories.sort();

    const selectedKnowledge = knowledge.find(k => k.id === selectedKnowledgeId);

    const handleAddKnowledge = async () => {
        const newEntry = {
            title: 'Nuevo Recurso',
            url: '',
            description: '',
            category: 'Paper',
            isPinned: false,
            comments: []
        };
        const { data } = await addResource(newEntry);
        if (data) setSelectedKnowledgeId(data.id);
    };

    const handleDriveUploadSuccess = async (file) => {
        // Automatically create knowledge entry from uploaded file
        const newEntry = {
            title: file.name,
            url: file.webViewLink || '#',
            description: `Archivo subido a Google Drive. Tipo: ${file.mimeType || 'Archivo'}`,
            category: 'Resource',
            isPinned: false,
            comments: []
        };
        const { data } = await addResource(newEntry);
        if (data) {
            setSelectedKnowledgeId(data.id);
            // Auto-select if in Selector Mode
            if (isSelectorMode) {
                setSelectedIds(prev => {
                    const newSet = new Set(prev);
                    newSet.add(data.id);
                    return newSet;
                });
            }
        }
    };

    const handleSyncDrive = async () => {
        // Ensure Gapi is ready
        if (!isGapiReady) {
            const success = await initializeDrive();
            if (!success) {
                alert("No se pudo conectar a los servicios de Google. Verifica tu conexión o recarga.");
                return;
            }
        }

        const driveConfig = activeGroup?.drive_settings?.googleDrive;
        const rootFolder = driveConfig?.folderId;

        if (!rootFolder) {
            alert("No hay carpeta de Drive configurada en el Módulo Google Drive.");
            return;
        }

        try {
            setIsSyncing(true);

            const runSync = async () => {
                const driveFiles = await googleDriveService.syncDriveFiles(rootFolder);
                let addedCount = 0;
                const existingUrls = new Set(knowledge.map(k => k.url));

                const batchPromises = [];
                for (const file of driveFiles) {
                    if (!file.webViewLink) continue;

                    const existingItem = knowledge.find(k => k.url === file.webViewLink);

                    if (existingItem) {
                        // Update existing item tags and category
                        batchPromises.push(updateResource(existingItem.id, {
                            tags: file.tags || [],
                            category: file.category || 'Drive'
                        }));
                    } else {
                        // Add new item
                        batchPromises.push(addResource({
                            title: file.name,
                            url: file.webViewLink,
                            description: `Sincronizado desde Drive - Carpeta: ${file.category}`,
                            category: file.category || 'Drive',
                            tags: file.tags || [],
                            isPinned: false,
                            comments: []
                        }));
                        addedCount++;
                    }
                }

                // Execute all updates/inserts in parallel
                await Promise.all(batchPromises);

                if (addedCount > 0) {
                    alert(`Sincronización completada. Se añadieron ${addedCount} nuevos archivos.`);
                } else {
                    alert("Todo está actualizado.");
                }
            };

            try {
                await runSync();
            } catch (error) {
                if (error.message === 'Auth required' || error.message.includes('Auth')) {
                    await googleDriveService.requestAccessToken();
                    await runSync();
                } else {
                    throw error;
                }
            }

        } catch (error) {
            console.error("Sync error:", error);
            if (error?.type !== 'popup_closed') {
                alert("Error al sincronizar con Drive: " + (error.message || "Desconocido"));
            }
        } finally {
            setIsSyncing(false);
        }
    };


    const handleUpdateKnowledge = async (entryId, field, value) => {
        await updateResource(entryId, { [field]: value });
    };

    const handleDeleteKnowledge = async (id) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este recurso?')) {
            await deleteResource(id);
            setSelectedKnowledgeId(null);
        }
    };

    const handleTogglePin = async (e, id) => {
        e.stopPropagation();
        const item = knowledge.find(k => k.id === id);
        if (item) {
            await updateResource(id, { is_pinned: !item.is_pinned });
        }
    };

    const handleAddKnowledgeComment = async (id, text) => {
        await addKnowledgeComment(id, text);
    };

    const handleOpenLink = (url) => {
        if (!url) return;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    // Multi-Select Handlers
    const handleToggleSelect = (e, id) => {
        e.stopPropagation();
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedIds(newSelected);
    };

    const handleConfirmSelection = () => {
        const selectedItems = knowledge.filter(k => selectedIds.has(k.id));
        onSelect(selectedItems);
    };

    // Filter & Sort Logic
    const getProcessedKnowledge = () => {
        let processed = [...knowledge];

        // Filter by text
        if (searchQuery) {
            const lowerQ = searchQuery.toLowerCase();
            processed = processed.filter(k =>
                (k.title && k.title.toLowerCase().includes(lowerQ)) ||
                (k.url && k.url.toLowerCase().includes(lowerQ)) ||
                (k.description && k.description.toLowerCase().includes(lowerQ))
            );
        }

        // Filter by category
        if (filterCategory !== 'all') {
            processed = processed.filter(k => k.category === filterCategory);
        }

        // Sort
        processed.sort((a, b) => {
            // Priority to Pinned
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;

            if (sortCriteria === 'date-desc') {
                const dateA = a.created_at || a.date || new Date(0);
                const dateB = b.created_at || b.date || new Date(0);
                return new Date(dateB) - new Date(dateA);
            }
            if (sortCriteria === 'date-asc') {
                const dateA = a.created_at || a.date || new Date(0);
                const dateB = b.created_at || b.date || new Date(0);
                return new Date(dateA) - new Date(dateB);
            }
            if (sortCriteria === 'alpha') return (a.title || '').localeCompare(b.title || '');
            return 0;
        });

        return processed;
    };

    const displayedKnowledge = getProcessedKnowledge();

    return (
        <div className="flex h-full animate-in fade-in duration-300 relative">
            <div className={clsx("flex-1 flex flex-col h-full border-r border-gray-200 bg-white transition-all duration-300", selectedKnowledgeId && !isSelectorMode ? 'w-2/3' : 'w-full')}>
                <header className="p-6 border-b border-gray-200 bg-slate-50 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                                <Library className="w-6 h-6 text-indigo-600" />
                                {isSelectorMode ? "Seleccionar Recurso" : "Libro de Conocimiento"}
                            </h2>
                        </div>
                        <div className="flex gap-2">

                            <button
                                onClick={handleSyncDrive}
                                disabled={isSyncing}
                                className={clsx("p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shadow-sm transition-all", isSyncing ? "animate-spin text-indigo-500" : "")}
                                title="Sincronizar con Drive"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setIsUploadModalOpen(true)}
                                className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
                            >
                                <Upload className="w-4 h-4 text-indigo-500" /> Subir a Drive
                            </button>
                            <button onClick={handleAddKnowledge} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"><Plus className="w-4 h-4" /> Nuevo Link</button>
                        </div>
                    </div>

                    {/* Filters Bar - Updated UI with Chips */}
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row gap-4 justify-between">
                            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm flex-1 max-w-md">
                                <Search className="w-4 h-4 text-slate-400" />
                                <input className="bg-transparent border-none outline-none w-full text-sm text-slate-600" placeholder="Buscar recurso por nombre, descripción o link..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ordenar:</span>
                                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
                                    <ArrowUpDown className="w-4 h-4 text-slate-400" />
                                    <select value={sortCriteria} onChange={(e) => setSortCriteria(e.target.value)} className="bg-transparent outline-none text-sm text-slate-700 font-medium cursor-pointer">
                                        <option value="date-desc">Más Recientes</option>
                                        <option value="date-asc">Más Antiguos</option>
                                        <option value="alpha">Alfabético (A-Z)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Category Chips */}
                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                            <button
                                onClick={() => setFilterCategory('all')}
                                className={clsx(
                                    "px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border",
                                    filterCategory === 'all'
                                        ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200"
                                        : "bg-white text-slate-600 border-gray-200 hover:bg-slate-50 hover:border-slate-300"
                                )}
                            >
                                Todas
                            </button>
                            {allCategories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setFilterCategory(cat)}
                                    className={clsx(
                                        "px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border",
                                        filterCategory === cat
                                            ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200"
                                            : "bg-white text-slate-600 border-gray-200 hover:bg-slate-50 hover:border-slate-300"
                                    )}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 custom-scrollbar">
                    <div className="max-w-5xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-xs text-slate-400 uppercase w-10">Link</th>
                                    <th className="px-4 py-3 text-xs text-slate-400 uppercase">Recurso</th>
                                    <th className="px-4 py-3 text-xs text-slate-400 uppercase w-32">Categoría</th>
                                    <th className="w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {displayedKnowledge.map(entry => (
                                    <tr
                                        key={entry.id}
                                        onClick={() => setSelectedKnowledgeId(entry.id)}
                                        className={clsx("group hover:bg-indigo-50/50 cursor-pointer transition-colors", selectedKnowledgeId === entry.id ? 'bg-indigo-50' : '')}
                                    >
                                        <td className="px-4 py-3 text-center">
                                            {isSelectorMode ? (
                                                <button
                                                    onClick={(e) => handleToggleSelect(e, entry.id)}
                                                    className={clsx(
                                                        "w-6 h-6 rounded border flex items-center justify-center transition-colors mx-auto",
                                                        selectedIds.has(entry.id)
                                                            ? "bg-indigo-600 border-indigo-600 text-white"
                                                            : "border-slate-300 hover:border-indigo-400 bg-white"
                                                    )}
                                                >
                                                    {selectedIds.has(entry.id) && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={14} strokeWidth={3} /></motion.div>}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleOpenLink(entry.url); }}
                                                    title="Abrir Enlace"
                                                    className="p-2 bg-slate-100 text-indigo-500 rounded-lg hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                                                >
                                                    <LinkIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-slate-700 truncate max-w-md">{entry.title || entry.url}</p>
                                                {!isSelectorMode && entry.isPinned && <Pin className="w-3 h-3 text-orange-500 fill-orange-500" />}

                                                {/* Quick Actions on Hover */}
                                                {!isSelectorMode && (
                                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                                                        <button
                                                            onClick={(e) => handleTogglePin(e, entry.id)}
                                                            className={clsx("p-1 rounded-full transition-colors", entry.isPinned ? "text-orange-500" : "text-slate-300 hover:text-orange-500")}
                                                            title={entry.isPinned ? "Desfijar" : "Fijar al inicio"}
                                                        >
                                                            <Pin className={clsx("w-3.5 h-3.5", entry.isPinned ? "fill-orange-500" : "")} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigator.clipboard.writeText(entry.url);
                                                                alert("Enlace copiado al portapapeles");
                                                            }}
                                                            className="p-1 text-slate-300 hover:text-indigo-500 transition-colors"
                                                            title="Copiar enlace"
                                                        >
                                                            <Copy className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-400 truncate max-w-xs">{entry.url}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1 justify-end">
                                                {entry.tags && entry.tags.length > 0 ? (
                                                    entry.tags.map((tag, i) => (
                                                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                                            <Tag className="w-3 h-3" /> {tag}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                                        <Tag className="w-3 h-3" /> {entry.category || 'Resource'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <ChevronRight className={clsx("w-4 h-4 text-slate-300 transition-transform", selectedKnowledgeId === entry.id ? "rotate-90 text-indigo-500" : "")} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {knowledge.length === 0 && (
                            <div className="p-8 text-center text-slate-400 text-sm italic">No hay recursos en la biblioteca.</div>
                        )}
                        {knowledge.length > 0 && displayedKnowledge.length === 0 && (
                            <div className="p-8 text-center text-slate-400 text-sm italic">No se encontraron resultados para tu búsqueda.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Knowledge Details Sidebar */}
            <AnimatePresence>
                {selectedKnowledgeId && selectedKnowledge && (
                    <motion.div
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="w-[450px] border-l border-gray-200 bg-white flex flex-col h-full shadow-xl z-20"
                    >
                        <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-slate-50">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Detalles del Recurso</span>
                                <h3 className="font-bold text-slate-800 text-base mt-1 line-clamp-2 pr-2">{selectedKnowledge.title || "Sin título"}</h3>
                            </div>
                            <button onClick={() => setSelectedKnowledgeId(null)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
                        </div>
                        <div className="p-6 border-b border-gray-100 space-y-5 bg-white overflow-y-auto max-h-[50%] custom-scrollbar">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500">Título</label>
                                <input className="w-full text-sm p-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-300" value={selectedKnowledge.title || ''} onChange={(e) => handleUpdateKnowledge(selectedKnowledge.id, 'title', e.target.value)} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500">Categoría</label>
                                    <select
                                        className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-300"
                                        value={selectedKnowledge.category}
                                        onChange={(e) => handleUpdateKnowledge(selectedKnowledge.id, 'category', e.target.value)}
                                    >
                                        {allCategories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500">Fecha</label>
                                    <div className="text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 select-none">{selectedKnowledge.date}</div>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500">URL / DOI</label>
                                <div className="flex gap-2">
                                    <input className="flex-1 text-xs text-blue-600 p-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-300" value={selectedKnowledge.url} onChange={(e) => handleUpdateKnowledge(selectedKnowledge.id, 'url', e.target.value)} placeholder="https://..." />
                                    <button onClick={() => handleOpenLink(selectedKnowledge.url)} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200" title="Probar link"><ExternalLink className="w-4 h-4" /></button>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500">Notas / Resumen</label>
                                <textarea className="w-full text-sm p-3 border border-slate-200 rounded-lg outline-none min-h-[100px] resize-none focus:border-indigo-300 leading-relaxed" placeholder="Añade un resumen..." value={selectedKnowledge.description} onChange={(e) => handleUpdateKnowledge(selectedKnowledge.id, 'description', e.target.value)} />
                            </div>
                            <button onClick={() => handleDeleteKnowledge(selectedKnowledge.id)} className="text-xs text-red-500 flex items-center gap-1 mt-2 hover:text-red-700 transition-colors"><Trash2 className="w-3 h-3" /> Eliminar Recurso</button>
                        </div>

                        <div className="flex-1 flex flex-col bg-slate-50/30 overflow-hidden border-t border-gray-200">
                            <div className="p-3 bg-indigo-50/50 border-b border-indigo-50 text-xs font-bold text-indigo-800 flex items-center gap-2"><Send className="w-3 h-3" /> Notas Rápidas</div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                {selectedKnowledge.comments?.length === 0 && <p className="text-center text-xs text-slate-400 italic mt-4">Sin notas adicionales.</p>}
                                {selectedKnowledge.comments?.map(c => (
                                    <div key={c.id} className={clsx("p-3 rounded-lg text-xs bg-white shadow-sm border border-gray-200 text-slate-700")}>
                                        <p>{c.text}</p>
                                        <span className="text-[9px] text-slate-400 mt-1 block">{c.author} • {new Date(c.date).toLocaleDateString()}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 bg-white border-t border-gray-200">
                                <div className="relative flex items-center gap-2">
                                    <input className="flex-1 bg-slate-100 border-none rounded-full px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Escribir nota..." value={currentComment} onChange={(e) => setCurrentComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
                                    <button onClick={() => { if (currentComment.trim()) { handleAddKnowledgeComment(selectedKnowledge.id, currentComment); setCurrentComment(''); } }} className="bg-indigo-600 text-white p-2 rounded-full hover:bg-indigo-700 transition-colors">
                                        <Send className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <DriveUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onUploadSuccess={handleDriveUploadSuccess}
                initialFolderId={activeGroup?.drive_settings?.googleDrive?.folderId}
            />

            {/* Multi-Select Floating Action Bar */}
            <AnimatePresence>
                {isSelectorMode && selectedIds.size > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="absolute bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none"
                    >
                        <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 pointer-events-auto">
                            <span className="font-bold text-sm">{selectedIds.size} seleccionados</span>
                            <div className="h-4 w-px bg-slate-700"></div>
                            <button
                                onClick={handleConfirmSelection}
                                className="bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-1.5 rounded-full text-xs font-bold transition-colors"
                            >
                                Agregar a Reporte
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

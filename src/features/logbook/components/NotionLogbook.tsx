"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
    Search,
    Plus,
    Star,
    Pin,
    Trash2,
    Loader2,
    Sparkles,
    BookOpen,
    Eye,
    Columns,
    Check,
    Copy,
    CheckCircle2,
    AlertCircle,
    X,
    FileText,
    FileEdit,
    CornerDownLeft,
    FileSignature,
    HelpCircle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { ScientificText } from '@/components/ScientificText';
import { cn } from '@/lib/utils';
import {
    getDocumentsAction,
    saveDocumentAction,
    deleteDocumentAction,
    toggleStarDocumentAction,
    togglePinDocumentAction,
    askDocumentAIAction
} from '../actions';

interface NotionLogbookProps {
    groupId: string;
}

interface DocumentItem {
    id: string;
    group_id: string;
    user_id: string;
    title: string;
    content: string;
    is_starred: boolean;
    is_pinned: boolean;
    created_at: string;
    updated_at: string;
}

export default function NotionLogbook({ groupId }: NotionLogbookProps) {
    // State lists
    const [documents, setDocuments] = useState<DocumentItem[]>([]);
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    // Editing states
    const [titleVal, setTitleVal] = useState('');
    const [contentVal, setContentVal] = useState('');
    const [editorMode, setEditorMode] = useState<'write' | 'preview' | 'split'>('write');
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

    // AI states
    const [showAiModal, setShowAiModal] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResponse, setAiResponse] = useState('');
    const [selectedText, setSelectedText] = useState('');

    // Refs
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const savingRef = useRef<string | null>(null);

    // Load initial documents
    useEffect(() => {
        loadDocuments();
    }, [groupId]);

    const loadDocuments = async (autoSelectId?: string) => {
        setLoading(true);
        const res = await getDocumentsAction(groupId);
        if (res.error) {
            toast.error('Failed to load notebook documents');
        } else if (res.data) {
            const docs = res.data as unknown as DocumentItem[];
            setDocuments(docs);
            
            // Auto select document if specified, or select the first if none is active
            if (docs.length > 0) {
                if (autoSelectId) {
                    selectDocument(autoSelectId, docs);
                } else if (!selectedDocId) {
                    selectDocument(docs[0].id, docs);
                }
            } else {
                setSelectedDocId(null);
                setTitleVal('');
                setContentVal('');
            }
        }
        setLoading(false);
    };

    const selectDocument = (id: string, currentDocs: DocumentItem[]) => {
        // Clear any unsaved pending debounces before switching
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
            // Instantly save current document before switching
            const activeDoc = currentDocs.find(d => d.id === selectedDocId);
            if (activeDoc && (titleVal !== activeDoc.title || contentVal !== activeDoc.content)) {
                saveDocumentAction(activeDoc.id, groupId, titleVal, contentVal);
            }
        }

        const doc = currentDocs.find(d => d.id === id);
        if (doc) {
            setSelectedDocId(doc.id);
            setTitleVal(doc.title);
            setContentVal(doc.content);
            setSaveStatus('saved');
        }
    };

    // Auto-save logic (Debounce 1000ms)
    const triggerAutoSave = (updatedTitle: string, updatedContent: string) => {
        if (!selectedDocId) return;
        setSaveStatus('saving');

        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        debounceTimeoutRef.current = setTimeout(async () => {
            savingRef.current = selectedDocId;
            const res = await saveDocumentAction(selectedDocId, groupId, updatedTitle, updatedContent);
            if (res.error) {
                setSaveStatus('error');
                toast.error('Could not auto-save changes');
            } else if (res.data) {
                setSaveStatus('saved');
                const savedData = res.data as any;
                // Quietly update documents list title/content without reloading whole list
                setDocuments(prev => prev.map(d => d.id === selectedDocId ? {
                    ...d,
                    title: savedData.title,
                    content: savedData.content,
                    updated_at: savedData.updated_at
                } : d));
            }
        }, 1000);
    };

    // Clean up timeout on unmount
    useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, []);

    // Handlers for inputs
    const handleTitleChange = (val: string) => {
        setTitleVal(val);
        triggerAutoSave(val, contentVal);
    };

    const handleContentChange = (val: string) => {
        setContentVal(val);
        triggerAutoSave(titleVal, val);
    };

    // CRUD operations
    const handleCreatePage = async () => {
        const tempId = crypto.randomUUID();
        setSaveStatus('saving');
        const res = await saveDocumentAction(tempId, groupId, 'Untitled Page', '');
        if (res.error) {
            toast.error('Failed to create new page');
        } else if (res.data) {
            toast.success('New page created');
            await loadDocuments((res.data as any).id);
        }
    };

    const handleDeletePage = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this page permanently? This action cannot be undone.')) return;
        
        const res = await deleteDocumentAction(id, groupId);
        if (res.error) {
            toast.error('Failed to delete page');
        } else {
            toast.success('Page deleted successfully');
            if (selectedDocId === id) {
                setSelectedDocId(null);
                setTitleVal('');
                setContentVal('');
            }
            await loadDocuments();
        }
    };

    const handleTogglePin = async (doc: DocumentItem, e: React.MouseEvent) => {
        e.stopPropagation();
        const nextState = !doc.is_pinned;
        // Optimistic update
        setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, is_pinned: nextState } : d));
        const res = await togglePinDocumentAction(doc.id, nextState);
        if (res.error) {
            toast.error('Failed to update pin state');
            loadDocuments();
        } else {
            toast.success(nextState ? 'Page pinned to top' : 'Page unpinned');
        }
    };

    const handleToggleStar = async (doc: DocumentItem, e: React.MouseEvent) => {
        e.stopPropagation();
        const nextState = !doc.is_starred;
        // Optimistic update
        setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, is_starred: nextState } : d));
        const res = await toggleStarDocumentAction(doc.id, nextState);
        if (res.error) {
            toast.error('Failed to update star state');
            loadDocuments();
        } else {
            toast.success(nextState ? 'Added to Starred favorites' : 'Removed from Starred favorites');
        }
    };

    // AI Assistant logic
    const handleTextareaSelect = () => {
        if (!textareaRef.current) return;
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        if (start !== end) {
            const selection = textareaRef.current.value.substring(start, end);
            setSelectedText(selection);
        } else {
            setSelectedText('');
        }
    };

    const runAICommand = async (
        instruction: 'improve' | 'format_latex' | 'summarize' | 'explain' | 'generate_tags' | 'custom',
        customPromptText?: string
    ) => {
        setAiLoading(true);
        setAiResponse('');
        setShowAiModal(true);

        const res = await askDocumentAIAction({
            groupId,
            content: contentVal,
            selection: selectedText,
            instruction,
            customPrompt: customPromptText
        });

        setAiLoading(false);
        if (res.error) {
            toast.error(res.error);
            setAiResponse(`Error: ${res.error}`);
        } else if (res.text) {
            setAiResponse(res.text);
        }
    };

    const handleApplyAIResponse = (action: 'replace' | 'insert' | 'append') => {
        if (!aiResponse) return;
        
        let newContent = contentVal;
        
        if (action === 'replace' && selectedText && textareaRef.current) {
            // Replace selected block
            const start = textareaRef.current.selectionStart;
            const end = textareaRef.current.selectionEnd;
            newContent = contentVal.substring(0, start) + aiResponse + contentVal.substring(end);
        } else if (action === 'insert' && selectedText && textareaRef.current) {
            // Insert after selected block
            const end = textareaRef.current.selectionEnd;
            newContent = contentVal.substring(0, end) + "\n\n" + aiResponse + contentVal.substring(end);
        } else {
            // Append to bottom
            newContent = contentVal + (contentVal ? "\n\n" : "") + aiResponse;
        }

        setContentVal(newContent);
        triggerAutoSave(titleVal, newContent);
        setShowAiModal(false);
        setAiResponse('');
        setAiPrompt('');
        toast.success('AI changes applied to document');
    };

    // Filter documents
    const filteredDocuments = documents.filter(d => 
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const pinnedDocs = filteredDocuments.filter(d => d.is_pinned);
    const starredDocs = filteredDocuments.filter(d => d.is_starred && !d.is_pinned);
    const otherDocs = filteredDocuments.filter(d => !d.is_pinned && !d.is_starred);

    // Selected document details
    const selectedDoc = documents.find(d => d.id === selectedDocId);

    return (
        <div className="flex h-[calc(100vh-140px)] bg-[#0d0d0e] text-[#e3e3e3] border-t border-white/[0.04] overflow-hidden">
            {/* --- SIDEBAR PANEL (w-72) --- */}
            <div className="w-[280px] border-r border-white/[0.06] bg-black/30 flex flex-col h-full overflow-hidden select-none">
                <div className="p-4 border-b border-white/[0.05] space-y-3">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-blue-500 transition-colors" size={14} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar en páginas..."
                            className="w-full bg-white/[0.03] border border-white/5 rounded-xl py-2 pl-9 pr-3 text-[11px] text-white placeholder-white/20 focus:outline-none focus:border-blue-500/30 focus:bg-white/[0.05] transition-all"
                        />
                    </div>

                    <button
                        onClick={handleCreatePage}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                    >
                        <Plus size={12} />
                        Nueva Página
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scroll p-3 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 size={18} className="animate-spin text-white/20" />
                        </div>
                    ) : (
                        <>
                            {/* --- PINNED PAGES --- */}
                            {pinnedDocs.length > 0 && (
                                <div className="space-y-1">
                                    <div className="px-2 mb-1 flex items-center gap-1.5 text-white/25">
                                        <Pin size={10} className="rotate-45" />
                                        <span className="text-[8px] font-black uppercase tracking-widest">Fijados</span>
                                    </div>
                                    {pinnedDocs.map(doc => (
                                        <DocItemRow
                                            key={doc.id}
                                            doc={doc}
                                            active={doc.id === selectedDocId}
                                            onClick={() => selectDocument(doc.id, documents)}
                                            onTogglePin={(e) => handleTogglePin(doc, e)}
                                            onToggleStar={(e) => handleToggleStar(doc, e)}
                                            onDelete={(e) => handleDeletePage(doc.id, e)}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* --- STARRED PAGES --- */}
                            {starredDocs.length > 0 && (
                                <div className="space-y-1">
                                    <div className="px-2 mb-1 flex items-center gap-1.5 text-white/25">
                                        <Star size={10} />
                                        <span className="text-[8px] font-black uppercase tracking-widest">Favoritos</span>
                                    </div>
                                    {starredDocs.map(doc => (
                                        <DocItemRow
                                            key={doc.id}
                                            doc={doc}
                                            active={doc.id === selectedDocId}
                                            onClick={() => selectDocument(doc.id, documents)}
                                            onTogglePin={(e) => handleTogglePin(doc, e)}
                                            onToggleStar={(e) => handleToggleStar(doc, e)}
                                            onDelete={(e) => handleDeletePage(doc.id, e)}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* --- ALL PAGES --- */}
                            <div className="space-y-1">
                                <div className="px-2 mb-1 text-white/25">
                                    <span className="text-[8px] font-black uppercase tracking-widest">Documentos</span>
                                </div>
                                {otherDocs.map(doc => (
                                    <DocItemRow
                                        key={doc.id}
                                        doc={doc}
                                        active={doc.id === selectedDocId}
                                        onClick={() => selectDocument(doc.id, documents)}
                                        onTogglePin={(e) => handleTogglePin(doc, e)}
                                        onToggleStar={(e) => handleToggleStar(doc, e)}
                                        onDelete={(e) => handleDeletePage(doc.id, e)}
                                    />
                                ))}

                                {filteredDocuments.length === 0 && (
                                    <div className="text-[10px] text-white/10 italic text-center py-8">
                                        No se encontraron páginas
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* --- EDITOR & PREVIEW PANEL (flex-1) --- */}
            <div className="flex-1 flex flex-col h-full bg-[#0a0a0b]/60 overflow-hidden relative">
                {selectedDoc ? (
                    <>
                        {/* EDITOR TOP MENU BAR */}
                        <div className="px-8 py-3 border-b border-white/[0.05] bg-black/10 flex items-center justify-between z-10">
                            {/* Auto-save Status Indicator */}
                            <div className="flex items-center gap-2">
                                {saveStatus === 'saved' && (
                                    <div className="flex items-center gap-1.5 text-emerald-500/80 text-[10px] font-black uppercase tracking-wider">
                                        <CheckCircle2 size={12} />
                                        Guardado en nube
                                    </div>
                                )}
                                {saveStatus === 'saving' && (
                                    <div className="flex items-center gap-1.5 text-blue-400 text-[10px] font-black uppercase tracking-wider animate-pulse">
                                        <Loader2 size={12} className="animate-spin" />
                                        Guardando...
                                    </div>
                                )}
                                {saveStatus === 'error' && (
                                    <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-black uppercase tracking-wider">
                                        <AlertCircle size={12} />
                                        Error al guardar
                                    </div>
                                )}
                            </div>

                            {/* Center View Toggles */}
                            <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/5 rounded-xl">
                                <button
                                    onClick={() => setEditorMode('write')}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer",
                                        editorMode === 'write' ? "bg-white/10 text-white" : "text-white/30 hover:text-white/50"
                                    )}
                                >
                                    <FileEdit size={10} />
                                    Editar
                                </button>
                                <button
                                    onClick={() => setEditorMode('preview')}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer",
                                        editorMode === 'preview' ? "bg-white/10 text-white" : "text-white/30 hover:text-white/50"
                                    )}
                                >
                                    <Eye size={10} />
                                    Vista Previa
                                </button>
                                <button
                                    onClick={() => setEditorMode('split')}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer",
                                        editorMode === 'split' ? "bg-white/10 text-white" : "text-white/30 hover:text-white/50"
                                    )}
                                >
                                    <Columns size={10} />
                                    Dividido
                                </button>
                            </div>

                            {/* Right: AI Quick tools */}
                            <div className="flex items-center gap-2">
                                {selectedText && (
                                    <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-md font-medium tracking-tight animate-in fade-in slide-in-from-right-1 duration-200">
                                        "{selectedText.substring(0, 15)}..." seleccionado
                                    </span>
                                )}
                                <div className="flex items-center gap-1 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 p-0.5 border border-indigo-500/20 rounded-xl shadow-lg">
                                    <button
                                        onClick={() => runAICommand('improve')}
                                        className="p-2 text-white/40 hover:text-white hover:bg-white/[0.04] rounded-lg transition-all text-[10px] font-bold flex items-center gap-1.5 cursor-pointer"
                                        title="Mejorar redacción científica"
                                    >
                                        <FileSignature size={12} className="text-blue-400" />
                                        <span className="hidden xl:inline">Pulir Redacción</span>
                                    </button>
                                    <button
                                        onClick={() => runAICommand('format_latex')}
                                        className="p-2 text-white/40 hover:text-white hover:bg-white/[0.04] rounded-lg transition-all text-[10px] font-bold flex items-center gap-1.5 cursor-pointer"
                                        title="Formatear fórmulas a LaTeX y subíndices"
                                    >
                                        <Sparkles size={12} className="text-indigo-400" />
                                        <span className="hidden xl:inline">Formato Científico</span>
                                    </button>
                                    <button
                                        onClick={() => setShowAiModal(true)}
                                        className="p-2 text-indigo-400 hover:text-white hover:bg-indigo-600 rounded-lg transition-all text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                                    >
                                        <Sparkles size={12} className="fill-indigo-400 hover:fill-white" />
                                        Preguntar IA
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* WORKSPACE CONTENT PANELS */}
                        <div className="flex-1 overflow-hidden p-8 flex flex-col">
                            {/* Interactive Editing Layout */}
                            {editorMode === 'write' && (
                                <div className="flex-1 flex flex-col">
                                    <input
                                        type="text"
                                        value={titleVal}
                                        onChange={(e) => handleTitleChange(e.target.value)}
                                        placeholder="Título de la Página..."
                                        className="w-full bg-transparent border-none outline-none text-[32px] font-black text-white placeholder-white/10 tracking-tight leading-tight mb-4 focus:ring-0 p-0"
                                    />
                                    <textarea
                                        ref={textareaRef}
                                        value={contentVal}
                                        onChange={(e) => handleContentChange(e.target.value)}
                                        onSelect={handleTextareaSelect}
                                        placeholder="Empieza a escribir... Usa **negrita**, *cursiva*, `código`, subíndices como SiO_2, superíndices como 10^6, etiquetas como #SiO2 o fórmulas matemáticas como $E = h \cdot \nu$"
                                        className="flex-1 w-full bg-transparent border-none outline-none resize-none text-[16px] text-white/80 placeholder-white/5 leading-relaxed custom-scroll focus:ring-0 p-0"
                                    />
                                </div>
                            )}

                            {editorMode === 'preview' && (
                                <div className="flex-1 overflow-y-auto custom-scroll pr-4 pb-20">
                                    <h1 className="text-[32px] font-black text-white tracking-tight leading-tight mb-6">
                                        {titleVal || 'Untitled Page'}
                                    </h1>
                                    <div className="text-[17px] text-white/85 leading-relaxed tracking-tight select-text">
                                        {contentVal ? (
                                            <ScientificText text={contentVal} />
                                        ) : (
                                            <span className="italic text-white/10 text-[14px]">Documento vacío. Cambia a "Editar" para empezar.</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {editorMode === 'split' && (
                                <div className="flex-1 grid grid-cols-2 gap-8 h-full overflow-hidden">
                                    {/* Left pane: Write */}
                                    <div className="flex flex-col border-r border-white/5 pr-6 h-full">
                                        <input
                                            type="text"
                                            value={titleVal}
                                            onChange={(e) => handleTitleChange(e.target.value)}
                                            placeholder="Título de la Página..."
                                            className="w-full bg-transparent border-none outline-none text-[24px] font-black text-white placeholder-white/10 tracking-tight mb-4 focus:ring-0 p-0"
                                        />
                                        <textarea
                                            ref={textareaRef}
                                            value={contentVal}
                                            onChange={(e) => handleContentChange(e.target.value)}
                                            onSelect={handleTextareaSelect}
                                            placeholder="Escribe aquí..."
                                            className="flex-1 w-full bg-transparent border-none outline-none resize-none text-[15px] text-white/70 placeholder-white/5 leading-relaxed custom-scroll focus:ring-0 p-0"
                                        />
                                    </div>
                                    {/* Right pane: Preview */}
                                    <div className="overflow-y-auto custom-scroll pl-2 h-full pb-20 select-text">
                                        <h1 className="text-[24px] font-black text-white tracking-tight mb-4">
                                            {titleVal || 'Untitled Page'}
                                        </h1>
                                        <div className="text-[15px] text-white/85 leading-relaxed tracking-tight">
                                            {contentVal ? (
                                                <ScientificText text={contentVal} />
                                            ) : (
                                                <span className="italic text-white/10 text-[13px]">Escribe en la izquierda para ver la previsualización científica...</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Editor footer prompt helper */}
                        <div className="px-8 py-3 bg-black/20 border-t border-white/[0.04] text-[10px] text-white/30 flex items-center justify-between select-none">
                            <div className="flex items-center gap-1.5">
                                <HelpCircle size={10} />
                                <span>Soporta fórmulas físicas y químicas en tiempo real</span>
                            </div>
                            <div>
                                Creado el {format(parseISO(selectedDoc.created_at), 'dd/MM/yyyy HH:mm')}
                            </div>
                        </div>
                    </>
                ) : (
                    // NO PAGE SELECTED PLACEHOLDER
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none">
                        <div className="w-20 h-20 rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-white/10 mb-6 shadow-2xl">
                            <BookOpen size={36} />
                        </div>
                        <h2 className="text-[14px] font-black uppercase tracking-[0.2em] text-white/30 mb-2">
                            Cuaderno de Laboratorio
                        </h2>
                        <p className="text-[11px] text-white/15 max-w-sm leading-relaxed mb-6 uppercase tracking-wider font-semibold">
                            Crea una página o selecciona un documento de la barra lateral para empezar a redactar tus reportes y aplicar IA.
                        </p>
                        <button
                            onClick={handleCreatePage}
                            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 cursor-pointer"
                        >
                            Crear Nueva Página
                        </button>
                    </div>
                )}

                {/* --- FLOATING AI ASSISTANT MODAL (Notion AI feel) --- */}
                {showAiModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-in fade-in duration-200">
                        <div className="bg-[#101011] border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col animate-in scale-in duration-300">
                            {/* Modal Header */}
                            <div className="px-6 py-4 bg-white/[0.01] border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-indigo-400">
                                    <Sparkles size={16} className="fill-indigo-400" />
                                    <span className="text-[11px] font-black uppercase tracking-[0.15em]">NEXUS AI ASSISTANT</span>
                                </div>
                                <button
                                    onClick={() => { setShowAiModal(false); setAiResponse(''); }}
                                    className="p-1 text-white/40 hover:text-white rounded-lg transition-colors cursor-pointer"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Selection Warning/Context Info */}
                            {selectedText && (
                                <div className="px-6 py-2.5 bg-blue-500/10 border-b border-blue-500/20 flex items-center justify-between text-[11px] text-blue-300 select-none">
                                    <span>Actuando sobre el texto seleccionado ({selectedText.length} caracteres)</span>
                                    <button onClick={() => setSelectedText('')} className="hover:text-white underline">Borrar selección</button>
                                </div>
                            )}

                            {/* Quick Action Selection */}
                            {!aiLoading && !aiResponse && (
                                <div className="p-4 grid grid-cols-2 gap-2 border-b border-white/5 bg-black/10 select-none">
                                    <button
                                        onClick={() => runAICommand('improve')}
                                        className="flex items-center gap-2 p-2.5 bg-white/[0.02] hover:bg-blue-600/10 hover:border-blue-500/30 border border-white/5 rounded-xl text-[11px] font-semibold text-white/80 transition-all text-left cursor-pointer"
                                    >
                                        <FileSignature size={14} className="text-blue-400" />
                                        <div>
                                            <div className="font-bold text-white text-[11px]">Pulir Redacción</div>
                                            <div className="text-[9px] text-white/40">Mejorar claridad científica</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => runAICommand('format_latex')}
                                        className="flex items-center gap-2 p-2.5 bg-white/[0.02] hover:bg-indigo-600/10 hover:border-indigo-500/30 border border-white/5 rounded-xl text-[11px] font-semibold text-white/80 transition-all text-left cursor-pointer"
                                    >
                                        <Sparkles size={14} className="text-indigo-400" />
                                        <div>
                                            <div className="font-bold text-white text-[11px]">Fórmulas & LaTeX</div>
                                            <div className="text-[9px] text-white/40">Formatear variables químicas/físicas</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => runAICommand('summarize')}
                                        className="flex items-center gap-2 p-2.5 bg-white/[0.02] hover:bg-emerald-600/10 hover:border-emerald-500/30 border border-white/5 rounded-xl text-[11px] font-semibold text-white/80 transition-all text-left cursor-pointer"
                                    >
                                        <BookOpen size={14} className="text-emerald-400" />
                                        <div>
                                            <div className="font-bold text-white text-[11px]">Resumen de Nota</div>
                                            <div className="text-[9px] text-white/40">Extraer parámetros clave</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => runAICommand('explain')}
                                        className="flex items-center gap-2 p-2.5 bg-white/[0.02] hover:bg-orange-600/10 hover:border-orange-500/30 border border-white/5 rounded-xl text-[11px] font-semibold text-white/80 transition-all text-left cursor-pointer"
                                    >
                                        <FileText size={14} className="text-orange-400" />
                                        <div>
                                            <div className="font-bold text-white text-[11px]">Explicar Conceptos</div>
                                            <div className="text-[9px] text-white/40">Desglosar teorías y ecuaciones</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => runAICommand('generate_tags')}
                                        className="flex items-center gap-2 p-2.5 bg-white/[0.02] hover:bg-yellow-600/10 hover:border-yellow-500/30 border border-white/5 rounded-xl text-[11px] font-semibold text-white/80 transition-all text-left cursor-pointer col-span-2"
                                    >
                                        <Plus size={14} className="text-yellow-400" />
                                        <div>
                                            <div className="font-bold text-white text-[11px]">Generar Hashtags (#tags)</div>
                                            <div className="text-[9px] text-white/40">Analizar texto y proponer tags de biblioteca</div>
                                        </div>
                                    </button>
                                </div>
                            )}

                            {/* Prompt Input area */}
                            <div className="p-5 flex items-center gap-3 border-b border-white/5">
                                <textarea
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            runAICommand('custom', aiPrompt);
                                        }
                                    }}
                                    placeholder="Indícale qué hacer a Nexus AI sobre este documento..."
                                    className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl py-3 px-4 text-[13px] text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/30 focus:bg-white/[0.04] transition-all resize-none outline-none leading-relaxed"
                                    rows={2}
                                />
                                <button
                                    onClick={() => runAICommand('custom', aiPrompt)}
                                    disabled={!aiPrompt.trim() || aiLoading}
                                    className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-500 transition-all disabled:opacity-50 flex items-center justify-center cursor-pointer"
                                >
                                    <CornerDownLeft size={16} />
                                </button>
                            </div>

                            {/* Generation Response Screen */}
                            <div className="flex-1 p-5 overflow-y-auto max-h-[300px] custom-scroll select-text">
                                {aiLoading && (
                                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-indigo-400">
                                        <Loader2 size={24} className="animate-spin" />
                                        <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">Nexus AI procesando...</span>
                                    </div>
                                )}
                                {!aiLoading && aiResponse && (
                                    <div className="space-y-4">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-white/20">RESPUESTA DE IA</div>
                                        <div className="text-[14px] text-white/90 leading-relaxed font-mono bg-black/30 border border-white/5 p-4 rounded-xl whitespace-pre-wrap leading-relaxed">
                                            {aiResponse}
                                        </div>

                                        {/* Response Actions */}
                                        <div className="flex items-center justify-end gap-2 pt-2 select-none">
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(aiResponse);
                                                    toast.success('Response copied to clipboard');
                                                }}
                                                className="px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <Copy size={12} />
                                                Copiar
                                            </button>
                                            {selectedText && (
                                                <button
                                                    onClick={() => handleApplyAIResponse('replace')}
                                                    className="px-4 py-2 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer"
                                                >
                                                    <Check size={12} />
                                                    Reemplazar Selección
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleApplyAIResponse('insert')}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-500/10"
                                            >
                                                <Check size={12} />
                                                Insertar abajo
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── HELPER ROW COMPONENTS ───────────────────────────────────────────

interface DocItemRowProps {
    doc: DocumentItem;
    active: boolean;
    onClick: () => void;
    onTogglePin: (e: React.MouseEvent) => void;
    onToggleStar: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
}

function DocItemRow({
    doc,
    active,
    onClick,
    onTogglePin,
    onToggleStar,
    onDelete
}: DocItemRowProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "group w-full flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer select-none",
                active
                    ? "bg-blue-600/10 border-blue-500/20 text-blue-400"
                    : "bg-white/[0.01] border-transparent text-white/40 hover:bg-white/[0.03] hover:text-white/70"
            )}
        >
            <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText size={13} className={cn("flex-shrink-0", active ? "text-blue-400" : "text-white/20 group-hover:text-white/40")} />
                <span className="text-[11px] font-bold truncate leading-none uppercase tracking-tight">
                    {doc.title || 'Untitled Page'}
                </span>
            </div>

            {/* Actions visible on hover, or always on active */}
            <div className={cn(
                "flex items-center gap-1 opacity-0 transition-opacity",
                (active || doc.is_pinned || doc.is_starred) ? "opacity-100" : "group-hover:opacity-100"
            )}>
                <button
                    onClick={onToggleStar}
                    className={cn(
                        "p-1 rounded-md hover:bg-white/[0.05] transition-all",
                        doc.is_starred ? "text-yellow-400" : "text-white/10 hover:text-white/40"
                    )}
                    title={doc.is_starred ? "Remove Favorite" : "Add Favorite"}
                >
                    <Star size={10} className={doc.is_starred ? "fill-yellow-400" : ""} />
                </button>
                <button
                    onClick={onTogglePin}
                    className={cn(
                        "p-1 rounded-md hover:bg-white/[0.05] transition-all",
                        doc.is_pinned ? "text-blue-400" : "text-white/10 hover:text-white/40"
                    )}
                    title={doc.is_pinned ? "Unpin Page" : "Pin Page"}
                >
                    <Pin size={10} className={cn("rotate-45", doc.is_pinned ? "fill-blue-400" : "")} />
                </button>
                <button
                    onClick={onDelete}
                    className="p-1 rounded-md hover:bg-red-500/10 text-white/10 hover:text-red-400 transition-all"
                    title="Delete Page"
                >
                    <Trash2 size={10} />
                </button>
            </div>
        </div>
    );
}

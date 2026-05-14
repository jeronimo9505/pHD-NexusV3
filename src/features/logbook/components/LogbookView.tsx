'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
    Search, SlidersHorizontal, X, Pin, Image as ImageIcon,
    FileText, Link2, Tag, Send, ChevronDown, ExternalLink,
    Loader2, NotebookPen, Maximize2, Hash, CloudUpload, Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { initGoogleClient, ensureAuth } from '@/lib/google/auth';

// ─── Types ───────────────────────────────────────────────────────────────────
interface MediaFile {
    drive_file_id?: string | null;
    telegram_file_id?: string | null;
    name: string;
    thumbnail_url?: string | null;
    view_url?: string | null;
    mime_type: string;
}

interface EntryLink {
    type: string;
    ref: string;
    label: string;
}

interface LogbookEntry {
    id: string;
    content: string;
    entry_type: 'text' | 'image' | 'mixed';
    media_files: MediaFile[];
    tags: string[];
    links: EntryLink[];
    source: 'telegram' | 'web';
    pinned: boolean;
    created_at: string;
    user_id: string;
}

interface LogbookViewProps {
    groupId: string;
    userId: string;
    isPrivate?: boolean;
    isOwner?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatDayHeader(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Hoy';
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function getDateKey(iso: string) {
    return iso.slice(0, 10);
}

// Render content with hyperlink chips highlighted
function renderContent(content: string, links: EntryLink[], groupId: string) {
    if (!content) return null;

    // Replace [type:ref] patterns with chips
    const parts: React.ReactNode[] = [];
    const re = /\[(muestra|tarea|reporte|sample|task|report):[\w-]+\]/gi;
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(content)) !== null) {
        if (m.index > last) parts.push(<span key={last}>{content.slice(last, m.index)}</span>);
        const matched = m[0];
        const link = links.find(l => matched.toLowerCase().includes(l.ref.toLowerCase()));
        const href = link ? `/${groupId}/${link.type}s` : '#';
        parts.push(
            <a key={m.index} href={href}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium hover:bg-blue-200 transition-colors mx-0.5">
                <Link2 size={10} />
                {link?.label || matched.slice(1, -1)}
            </a>
        );
        last = m.index + matched.length;
    }
    if (last < content.length) parts.push(<span key={last}>{content.slice(last)}</span>);

    // Highlight #tags and ==highlights== in the final text spans
    return parts.map((part, i) => {
        if (typeof part === 'string' || (part as any)?.props?.children === undefined) return part;
        const text = (part as any)?.props?.children;
        if (typeof text !== 'string') return part;
        
        // Split by both tags and highlights
        return <span key={i}>{text.split(/(#[\w\u00C0-\u017F]+|==[^=]+==)/g).map((seg: string, j: number) => {
            if (seg.startsWith('#')) {
                return <span key={j} className="text-indigo-600 font-bold">{seg}</span>;
            }
            if (seg.startsWith('==') && seg.endsWith('==')) {
                return <mark key={j} className="bg-yellow-200 px-1 rounded-sm text-slate-900 font-bold">{seg.slice(2, -2)}</mark>;
            }
            return seg;
        })}</span>;
    });
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={onClose}>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
                <X size={24} />
            </button>
            <img src={url} alt="Imagen bitácora"
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                onClick={e => e.stopPropagation()} />
        </div>
    );
}

// ─── Entry Component (Refactored for Notebook style) ─────────────────────────
function LogEntry({ entry, groupId, onImageClick, onEdit }: {
    entry: LogbookEntry;
    groupId: string;
    onImageClick: (url: string) => void;
    onEdit: (entry: LogbookEntry) => void;
}) {
    const [isHovered, setIsHovered] = useState(false);

    const formatContent = (text: string) => {
        if (!text) return null;
        return renderContent(text, entry.links, groupId);
    };

    return (
        <div 
            className="group relative flex gap-4 py-4 px-2 hover:bg-slate-50/50 transition-colors border-l-2 border-transparent hover:border-indigo-400"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Time column */}
            <div className="w-16 flex-shrink-0 flex flex-col items-end pt-0.5">
                <span className="text-[11px] font-mono text-slate-400">{formatTime(entry.created_at)}</span>
                {entry.pinned && <Pin size={10} className="text-amber-500 mt-1" />}
            </div>

            {/* Content column */}
            <div className="flex-1 flex flex-col gap-3 min-w-0">
                {/* Images - now stacked vertically */}
                {entry.media_files?.length > 0 && (
                    <div className="flex flex-col gap-4 max-w-2xl">
                        {entry.media_files.map((f, i) => {
                            const proxyUrl = f.telegram_file_id ? `/api/logbook/image?file_id=${f.telegram_file_id}` : '';
                            const thumbUrl = proxyUrl || f.thumbnail_url!;
                            const fullUrl = proxyUrl || f.view_url!;

                            return (
                                <div key={f.drive_file_id || f.telegram_file_id || i}
                                    className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer group/img max-h-[600px] flex items-center justify-center"
                                    onClick={() => onImageClick(fullUrl)}>
                                    <img
                                        src={fullUrl}
                                        alt="Logbook Media"
                                        className="max-w-full h-auto object-contain transition-transform group-hover/img:scale-[1.02]"
                                    />
                                    <div className="absolute top-3 right-3 p-1.5 bg-black/40 rounded-lg text-white opacity-0 group-hover/img:opacity-100 transition-opacity">
                                        <Maximize2 size={16} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Text content */}
                {entry.content && (
                    <div className="text-[15px] text-slate-800 leading-relaxed whitespace-pre-wrap break-words max-w-4xl font-medium">
                        {formatContent(entry.content)}
                    </div>
                )}

                {/* Tags */}
                {entry.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {entry.tags.map(tag => (
                            <span key={tag}
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Action Bar (Only visible on hover) */}
            <div className={cn(
                "absolute top-2 right-4 flex items-center gap-1 p-1 bg-white border border-slate-200 shadow-sm rounded-lg transition-all",
                isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"
            )}>
                <button 
                    onClick={() => onEdit(entry)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                    title="Editar entrada"
                >
                    <NotebookPen size={14} />
                </button>
            </div>
        </div>
    );
}

// ─── Composer (web input) ─────────────────────────────────────────────────────
function Composer({ groupId, userId, onSent }: {
    groupId: string;
    userId: string;
    onSent: () => void;
}) {
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = async () => {
        if (!text.trim() || sending) return;
        setSending(true);

        const res = await fetch('/api/logbook/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text.trim(), groupId }),
        });

        if (res.ok) {
            setText('');
            onSent();
        }
        setSending(false);
    };

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend();
    };

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }, [text]);

    return (
        <div className="bg-slate-50 rounded-2xl border border-slate-100 px-4 py-3 focus-within:border-indigo-200 focus-within:ring-4 focus-within:ring-indigo-500/5 transition-all">
            <div className="flex items-end gap-3">
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Escribe una nota... Usa #tags o ==resaltado=="
                    rows={1}
                    className="flex-1 bg-transparent resize-none outline-none text-[15px] text-slate-800 placeholder:text-slate-400 min-h-[24px] max-h-[160px] py-1 font-medium"
                />
                <button
                    onClick={handleSend}
                    disabled={!text.trim() || sending}
                    className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-lg shadow-slate-200"
                >
                    {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
            </div>
        </div>
    );
}

// ─── Main View ────────────────────────────────────────────────────────────────
export function LogbookView({ groupId, userId, isPrivate, isOwner }: LogbookViewProps) {
    const [entries, setEntries] = useState<LogbookEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [googleReady, setGoogleReady] = useState(false);
    const [driveSettings, setDriveSettings] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterTag, setFilterTag] = useState('');
    const [filterType, setFilterType] = useState<'' | 'text' | 'image' | 'mixed'>('');
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [allTags, setAllTags] = useState<string[]>([]);
    
    // Editing state
    const [editingEntry, setEditingEntry] = useState<LogbookEntry | null>(null);
    const [editValue, setEditValue] = useState('');

    const bottomRef = useRef<HTMLDivElement>(null);
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Initialize Google Client on mount
    useEffect(() => {
        let mounted = true;
        supabase.from('groups').select('drive_settings').eq('id', groupId).single().then(async ({ data }) => {
            if (data?.drive_settings?.apiKey && data?.drive_settings?.clientId && mounted) {
                setDriveSettings(data.drive_settings);
                try {
                    await initGoogleClient(data.drive_settings.apiKey, data.drive_settings.clientId);
                    if (mounted) setGoogleReady(true);
                } catch (e) {
                    console.error("Google Auth init failed:", e);
                }
            }
        });
        return () => { mounted = false; };
    }, [groupId, supabase]);

    const handleSyncToDrive = async () => {
        if (!googleReady) {
            toast.error('Cargando servicios de Google...');
            return;
        }
        try {
            const token = await ensureAuth();
            const pendingEntries = entries.filter(e => e.media_files?.some(m => !m.drive_file_id && m.telegram_file_id));
            if (pendingEntries.length === 0) {
                toast.info('No hay imágenes pendientes');
                return;
            }
            if (!driveSettings?.apiKey || !driveSettings?.clientId) {
                toast.error('Google Drive no configurado para este grupo.');
                return;
            }

            setSyncing(true);
            const folderId = driveSettings.logbookFolderId || driveSettings.folderId; 
            let totalSynced = 0;

            for (const entry of pendingEntries) {
                const updatedMedia = [...entry.media_files];
                let changed = false;

                for (let i = 0; i < updatedMedia.length; i++) {
                    const m = updatedMedia[i];
                    if (!m.drive_file_id && m.telegram_file_id) {
                        toast.loading(`Sincronizando imagen...`, { id: 'sync' });
                        const proxyUrl = `/api/logbook/image?file_id=${m.telegram_file_id}`;
                        const res = await fetch(proxyUrl);
                        if (!res.ok) continue;
                        const blob = await res.blob();

                        const boundary = "bitacora_boundary";
                        const meta = JSON.stringify({ name: m.name, parents: folderId ? [folderId] : undefined, mimeType: m.mime_type });
                        const metaBytes = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`);
                        const fileHeader = new TextEncoder().encode(`--${boundary}\r\nContent-Type: ${m.mime_type}\r\n\r\n`);
                        const closing = new TextEncoder().encode(`\r\n--${boundary}--`);
                        const fileBytes = new Uint8Array(await blob.arrayBuffer());

                        const body = new Uint8Array(metaBytes.length + fileHeader.length + fileBytes.length + closing.length);
                        body.set(metaBytes, 0);
                        body.set(fileHeader, metaBytes.length);
                        body.set(fileBytes, metaBytes.length + fileHeader.length);
                        body.set(closing, metaBytes.length + fileHeader.length + fileBytes.length);

                        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,thumbnailLink', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
                            body,
                        });

                        const data = await uploadRes.json();
                        if (data.id) {
                            updatedMedia[i] = { ...m, drive_file_id: data.id, thumbnail_url: data.thumbnailLink || null, view_url: data.webViewLink || null };
                            changed = true;
                            totalSynced++;
                        }
                    }
                }

                if (changed) {
                    await supabase.from('logbook_entries' as any).update({ media_files: updatedMedia }).eq('id', entry.id);
                }
            }
            toast.success(`Sincronización completa (${totalSynced} imágenes)`, { id: 'sync' });
        } catch (e) {
            console.error("Sync error:", e);
            toast.error('Error al sincronizar con Drive', { id: 'sync' });
        } finally {
            setSyncing(false);
        }
    };

    const fetchEntries = useCallback(async () => {
        setLoading(true);
        let query = supabase
            .from('logbook_entries' as any)
            .select('*')
            .eq('group_id', groupId)
            .order('created_at', { ascending: true });

        if (filterType) query = query.eq('entry_type', filterType);
        if (filterTag) query = query.contains('tags', [filterTag]);
        if (searchQuery.trim()) query = query.ilike('content', `%${searchQuery.trim()}%`);

        const { data } = await query;
        if (data) {
            setEntries(data as LogbookEntry[]);
            const tags = new Set<string>();
            data.forEach((e: LogbookEntry) => e.tags?.forEach(t => tags.add(t)));
            setAllTags([...tags].sort());
        }
        setLoading(false);
    }, [groupId, filterType, filterTag, searchQuery]);

    useEffect(() => { fetchEntries(); }, [fetchEntries]);

    useEffect(() => {
        if (!loading) {
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    }, [loading]);

    useEffect(() => {
        const channel = supabase.channel('logbook-realtime')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'logbook_entries',
                filter: `group_id=eq.${groupId}`,
            }, (payload) => {
                const newEntry = payload.new as LogbookEntry;
                setEntries(prev => [...prev, newEntry]);
                newEntry.tags?.forEach(t => setAllTags(prev => prev.includes(t) ? prev : [...prev, t].sort()));
                setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'logbook_entries',
                filter: `group_id=eq.${groupId}`,
            }, (payload) => {
                setEntries(prev => prev.map(e => e.id === payload.new.id ? payload.new as LogbookEntry : e));
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [groupId]);

    const handleUpdateEntry = async () => {
        if (!editingEntry || !editValue.trim()) return;
        
        const res = await fetch('/api/logbook/update', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingEntry.id, text: editValue.trim(), groupId }),
        });

        if (res.ok) {
            toast.success('Entrada actualizada');
            setEditingEntry(null);
            fetchEntries();
        } else {
            toast.error('Error al actualizar');
        }
    };

    // Grouping Logic: Day -> Session (Consecutive from same user within 30 min)
    const groupedByDay = entries.reduce((acc, entry) => {
        const day = getDateKey(entry.created_at);
        if (!acc[day]) acc[day] = [];
        acc[day].push(entry);
        return acc;
    }, {} as Record<string, LogbookEntry[]>);

    const days = Object.keys(groupedByDay).sort();

    const hasActiveFilters = !!(searchQuery || filterTag || filterType);
    const pendingCount = entries.filter(e => e.media_files?.some(m => !m.drive_file_id && m.telegram_file_id)).length;

    useEffect(() => {
        const btn = document.getElementById('sync-drive-btn');
        if (btn) {
            btn.onclick = (e) => { e.preventDefault(); handleSyncToDrive(); };
        }
    }, [googleReady, entries, driveSettings, syncing]);

    if (isPrivate && !isOwner) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4"><Lock size={32} className="text-slate-400" /></div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Bitácora Privada</h2>
                <p className="text-slate-500 max-w-md">Solo el administrador del grupo puede ver las entradas.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-white">
            {/* Header */}
            <div className="bg-white border-b border-slate-100 px-8 py-6 flex items-center gap-6 flex-shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-200">
                        <NotebookPen size={20} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-none">Lab Notebook</h1>
                        <p className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-widest">{entries.length} RECORDS</p>
                    </div>
                </div>

                <div className="flex-1" />

                {pendingCount > 0 && (
                    <button 
                        id="sync-drive-btn"
                        disabled={syncing || !googleReady}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-all border border-indigo-100 disabled:opacity-50">
                        {syncing ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={16} />}
                        Sync ({pendingCount})
                    </button>
                )}

                <div className="flex-1 max-w-sm relative group">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                    <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search logs..."
                        className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-100 rounded-xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-400 transition-all font-medium"
                    />
                </div>

                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border shadow-sm",
                        hasActiveFilters
                            ? "bg-slate-900 text-white border-slate-900"
                            : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                    )}
                >
                    <SlidersHorizontal size={15} />
                    Filters
                </button>
            </div>

            {/* Filter bar */}
            {showFilters && (
                <div className="bg-slate-50/50 border-b border-slate-100 px-8 py-4 flex items-center gap-6 flex-wrap animate-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</span>
                        {(['', 'text', 'image', 'mixed'] as const).map(t => (
                            <button key={t}
                                onClick={() => setFilterType(t)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border uppercase tracking-wide",
                                    filterType === t
                                        ? "bg-white text-indigo-600 border-indigo-200 shadow-sm"
                                        : "text-slate-500 border-transparent hover:bg-slate-100"
                                )}>
                                {t === '' ? 'All' : t}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tags</span>
                        {filterTag && (
                            <button onClick={() => setFilterTag('')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-md shadow-indigo-100 transition-all">
                                #{filterTag}
                                <X size={12} />
                            </button>
                        )}
                        {allTags.filter(t => t !== filterTag).slice(0, 10).map(tag => (
                            <button key={tag}
                                onClick={() => setFilterTag(tag)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                                #{tag}
                            </button>
                        ))}
                    </div>

                    {hasActiveFilters && (
                        <button onClick={() => { setFilterTag(''); setFilterType(''); setSearchQuery(''); }}
                            className="ml-auto text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-red-50 transition-all">
                            <X size={14} /> Clear
                        </button>
                    )}
                </div>
            )}

            {/* Notebook Content area */}
            <div className="flex-1 overflow-y-auto px-12 py-8 bg-[#fcfcfc] relative">
                {/* Rule lines pattern */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
                    style={{ backgroundImage: 'linear-gradient(to bottom, transparent 31px, #000 32px)', backgroundSize: '100% 32px' }} />
                
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <Loader2 size={32} className="animate-spin text-indigo-600" />
                        <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Records...</span>
                    </div>
                ) : entries.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-sm">
                            <div className="w-20 h-20 rounded-3xl bg-slate-50 flex items-center justify-center mx-auto mb-6">
                                <NotebookPen size={32} className="text-slate-200" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">Notebook Empty</h3>
                            <p className="text-sm font-medium text-slate-400 leading-relaxed">
                                No entries match your filters. Start a new record or adjust your search.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="max-w-6xl mx-auto space-y-16 pb-24 relative">
                        {days.map(day => (
                            <section key={day} className="relative">
                                {/* Day Header (Journal style) */}
                                <div className="sticky top-0 pb-12 pt-4 bg-transparent z-10">
                                    <div className="flex items-end gap-4 border-b-2 border-slate-900 pb-2">
                                        <h2 className="text-4xl font-black text-slate-900 tracking-tight capitalize">
                                            {formatDayHeader(groupedByDay[day][0].created_at)}
                                        </h2>
                                        <div className="flex-1" />
                                        <div className="text-right">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{day.replace(/-/g, '.')}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Sessions within the day */}
                                <div className="space-y-12">
                                    {/* 
                                        Logic: Iterate entries and group into "sessions"
                                        For this simplified version, we just render entries directly 
                                        but styled as a contiguous list.
                                    */}
                                    <div className="divide-y divide-slate-100">
                                        {groupedByDay[day].map(entry => (
                                            <LogEntry
                                                key={entry.id}
                                                entry={entry}
                                                groupId={groupId}
                                                onImageClick={setLightboxUrl}
                                                onEdit={(e) => {
                                                    setEditingEntry(e);
                                                    setEditValue(e.content);
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </section>
                        ))}
                        <div ref={bottomRef} className="h-4" />
                    </div>
                )}
            </div>

            {/* Edit Modal (Simple) */}
            {editingEntry && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">Edit Record</h3>
                            <button onClick={() => setEditingEntry(null)}><X size={18} className="text-slate-400" /></button>
                        </div>
                        <div className="p-6">
                            <textarea
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                className="w-full h-40 p-4 border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/5 transition-all text-sm font-medium"
                            />
                            <div className="mt-4 flex justify-end gap-3">
                                <button 
                                    onClick={() => setEditingEntry(null)}
                                    className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleUpdateEntry}
                                    className="px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Composer */}
            <div className="bg-white border-t border-slate-100 px-8 py-6 flex-shrink-0 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.05)]">
                <div className="max-w-6xl mx-auto flex items-end gap-4">
                    <div className="flex-1 flex flex-col gap-2">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-50 rounded">formatting hint</span>
                            <span className="text-[10px] text-slate-400">Use ==text== to highlight · **bold** · #tags</span>
                        </div>
                        <Composer groupId={groupId} userId={userId} onSent={fetchEntries} />
                    </div>
                </div>
            </div>

            {/* Lightbox */}
            {lightboxUrl && (
                <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
            )}
        </div>
    );
}

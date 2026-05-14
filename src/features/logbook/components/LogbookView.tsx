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

    // Highlight #tags in the final text spans
    return parts.map((part, i) => {
        if (typeof part === 'string' || (part as any)?.props?.children === undefined) return part;
        const text = (part as any)?.props?.children;
        if (typeof text !== 'string') return part;
        return <span key={i}>{text.split(/(#[\w\u00C0-\u017F]+)/g).map((seg: string, j: number) =>
            seg.startsWith('#')
                ? <span key={j} className="text-indigo-600 font-medium">{seg}</span>
                : seg
        )}</span>;
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

// ─── Entry Bubble ─────────────────────────────────────────────────────────────
function EntryBubble({ entry, groupId, onImageClick }: {
    entry: LogbookEntry;
    groupId: string;
    onImageClick: (url: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const hasLongContent = entry.content.length > 400;
    const displayContent = hasLongContent && !expanded
        ? entry.content.slice(0, 400) + '…'
        : entry.content;

    const sourceIcon = entry.source === 'telegram'
        ? <span title="Enviado desde Telegram" className="text-blue-400 text-[10px] font-bold">TG</span>
        : <span title="Escrito en la app" className="text-emerald-400 text-[10px] font-bold">WEB</span>;

    return (
        <div className={cn(
            "group relative flex flex-col max-w-[75%] ml-auto",
            "bg-white rounded-2xl rounded-tr-sm shadow-sm border border-slate-100",
            "px-4 py-3 gap-2",
            entry.pinned && "ring-2 ring-amber-400/40 bg-amber-50/30"
        )}>
            {/* Pinned badge */}
            {entry.pinned && (
                <div className="flex items-center gap-1 text-amber-600 text-[10px] font-semibold">
                    <Pin size={10} />
                    Fijado
                </div>
            )}

            {/* Images */}
            {entry.media_files?.length > 0 && (
                <div className={cn(
                    "grid gap-1.5 rounded-xl overflow-hidden",
                    entry.media_files.length === 1 ? "grid-cols-1" : "grid-cols-2"
                )}>
                    {entry.media_files.map((f, i) => {
                        const isDrive = !!f.drive_file_id;
                        const proxyUrl = f.telegram_file_id ? `/api/logbook/image?file_id=${f.telegram_file_id}` : '';
                        
                        // Priority to Telegram proxy for fast rendering. Fallback to Drive.
                        const thumbUrl = proxyUrl || f.thumbnail_url!;
                        const fullUrl = proxyUrl || f.view_url!;

                        return (
                        <div key={f.drive_file_id || f.telegram_file_id || i}
                            className="relative aspect-video bg-slate-100 rounded-lg overflow-hidden cursor-pointer group/img"
                            onClick={() => onImageClick(fullUrl)}>
                            <img
                                src={thumbUrl}
                                alt="Imagen"
                                className="w-full h-full object-cover transition-transform group-hover/img:scale-105"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = '';
                                    (e.target as HTMLImageElement).parentElement!.innerHTML =
                                        `<div class="flex flex-col items-center justify-center h-full gap-2 text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg><a href="${fullUrl}" target="_blank" class="text-xs text-blue-500 hover:underline">Error al cargar</a></div>`;
                                }}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                                <Maximize2 size={20} className="text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                            </div>
                        </div>
                    )})}
                </div>
            )}

            {/* Text content */}
            {entry.content && (
                <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                    {renderContent(displayContent, entry.links, groupId)}
                    {hasLongContent && (
                        <button onClick={() => setExpanded(!expanded)}
                            className="ml-1 text-blue-500 hover:text-blue-700 text-xs font-medium">
                            {expanded ? 'Ver menos' : 'Ver más'}
                        </button>
                    )}
                </div>
            )}

            {/* Tags */}
            {entry.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {entry.tags.map(tag => (
                        <span key={tag}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-medium border border-indigo-100">
                            <Hash size={9} />
                            {tag}
                        </span>
                    ))}
                </div>
            )}

            {/* Footer: source + time */}
            <div className="flex items-center justify-end gap-2">
                {sourceIcon}
                <span className="text-[11px] text-slate-400">{formatTime(entry.created_at)}</span>
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
        <div className="border-t border-slate-200 bg-white px-4 py-3">
            <div className="flex items-end gap-2 bg-slate-50 rounded-2xl border border-slate-200 px-3 py-2 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Write a note... Use #tags or [sample:M23] to link"
                    rows={1}
                    className="flex-1 bg-transparent resize-none outline-none text-sm text-slate-800 placeholder:text-slate-400 min-h-[24px] max-h-[160px] py-1"
                />
                <button
                    onClick={handleSend}
                    disabled={!text.trim() || sending}
                    className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 px-1">Ctrl+Enter to send · Mirrored on Telegram</p>
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
            toast.error('Loading Google services, try again in a second...');
            return;
        }

        try {
            // Must be the ABSOLUTE FIRST await in the click handler
            const token = await ensureAuth();
            
            const pendingEntries = entries.filter(e => e.media_files?.some(m => !m.drive_file_id && m.telegram_file_id));
            if (pendingEntries.length === 0) {
                toast.info('No pending images to sync');
                return;
            }

            if (!driveSettings?.apiKey || !driveSettings?.clientId) {
                toast.error('Google Drive not configured for this group. Go to "Settings".');
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
                        toast.loading(`Syncing image...`, { id: 'sync' });
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
            toast.success(`Sync complete! (${totalSynced} images)`, { id: 'sync' });
        } catch (e) {
            console.error("Sync error:", e);
            toast.error('Error syncing with Drive', { id: 'sync' });
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
            // Collect all unique tags
            const tags = new Set<string>();
            data.forEach((e: LogbookEntry) => e.tags?.forEach(t => tags.add(t)));
            setAllTags([...tags].sort());
        }
        setLoading(false);
    }, [groupId, filterType, filterTag, searchQuery]);

    useEffect(() => { fetchEntries(); }, [fetchEntries]);

    // Scroll to bottom on initial load
    useEffect(() => {
        if (!loading) {
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    }, [loading]);

    // Realtime subscription
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
                // Update tags
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

    // Group entries by day
    const grouped = entries.reduce((acc, entry) => {
        const day = getDateKey(entry.created_at);
        if (!acc[day]) acc[day] = [];
        acc[day].push(entry);
        return acc;
    }, {} as Record<string, LogbookEntry[]>);

    const days = Object.keys(grouped).sort();

    const hasActiveFilters = !!(searchQuery || filterTag || filterType);

    const pendingCount = entries.filter(e => e.media_files?.some(m => !m.drive_file_id && m.telegram_file_id)).length;

    // Workaround for Tauri WebView2 popup blocker: use native DOM event instead of React Synthetic Event
    useEffect(() => {
        const btn = document.getElementById('sync-drive-btn');
        if (btn) {
            btn.onclick = (e) => {
                e.preventDefault();
                handleSyncToDrive();
            };
        }
    }, [googleReady, entries, driveSettings, syncing]);

    // 10. Privacy Check
    if (isPrivate && !isOwner) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <Lock size={32} className="text-slate-400" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Private Logbook</h2>
                <p className="text-slate-500 max-w-md">
                    This logbook has been marked as private by the group administrator. 
                    Only the group creator can view the entries.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
                        <NotebookPen size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 leading-tight">Logbook</h1>
                        <p className="text-xs text-slate-500">{entries.length} entries</p>
                    </div>
                </div>

                <div className="flex-1" />

                {pendingCount > 0 && (
                    <button 
                        id="sync-drive-btn"
                        disabled={syncing || !googleReady}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold transition-colors border border-blue-200 disabled:opacity-50">
                        {syncing ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
                        Sync Drive ({pendingCount})
                    </button>
                )}

                <div className="flex-1 max-w-md relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search logbook..."
                        className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X size={14} />
                        </button>
                    )}
                </div>

                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all border",
                        hasActiveFilters
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                >
                    <SlidersHorizontal size={15} />
                    Filtros
                    {hasActiveFilters && (
                        <span className="w-4 h-4 bg-white/30 rounded-full text-[10px] flex items-center justify-center font-bold">
                            {[filterTag, filterType].filter(Boolean).length}
                        </span>
                    )}
                </button>
            </div>

            {/* Filter bar */}
            {showFilters && (
                <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-4 flex-wrap">
                    {/* Type filter */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-500">Tipo:</span>
                        {(['', 'text', 'image', 'mixed'] as const).map(t => (
                            <button key={t}
                                onClick={() => setFilterType(t)}
                                className={cn(
                                    "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                                    filterType === t
                                        ? "bg-indigo-600 text-white border-indigo-600"
                                        : "text-slate-600 border-slate-200 hover:bg-slate-50"
                                )}>
                                {t === '' && <><FileText size={11} />Todos</>}
                                {t === 'text' && <><FileText size={11} />Texto</>}
                                {t === 'image' && <><ImageIcon size={11} />Imagen</>}
                                {t === 'mixed' && <><ImageIcon size={11} />Mixto</>}
                            </button>
                        ))}
                    </div>

                    {/* Tag filter */}
                    {allTags.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-slate-500">Tag:</span>
                            {filterTag && (
                                <button onClick={() => setFilterTag('')}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white border border-indigo-600">
                                    <Hash size={11} />{filterTag}
                                    <X size={10} />
                                </button>
                            )}
                            {allTags.filter(t => t !== filterTag).slice(0, 8).map(tag => (
                                <button key={tag}
                                    onClick={() => setFilterTag(tag)}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all">
                                    <Hash size={11} />{tag}
                                </button>
                            ))}
                        </div>
                    )}

                    {hasActiveFilters && (
                        <button onClick={() => { setFilterTag(''); setFilterType(''); setSearchQuery(''); }}
                            className="ml-auto text-xs text-slate-500 hover:text-red-500 flex items-center gap-1">
                            <X size={12} /> Limpiar filtros
                        </button>
                    )}
                </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 size={28} className="animate-spin text-indigo-500" />
                            <p className="text-sm text-slate-500">Cargando bitácora...</p>
                        </div>
                    </div>
                ) : entries.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-sm">
                            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                                <NotebookPen size={28} className="text-indigo-400" />
                            </div>
                            <h3 className="text-base font-semibold text-slate-700 mb-1">
                                {hasActiveFilters ? 'Sin resultados' : 'Tu bitácora está vacía'}
                            </h3>
                            <p className="text-sm text-slate-500">
                                {hasActiveFilters
                                    ? 'Prueba a cambiar los filtros'
                                    : 'Envía un mensaje al bot @phd_nexus_bitacora_bot desde Telegram, o escribe aquí abajo.'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {days.map(day => (
                            <div key={day}>
                                {/* Day divider */}
                                <div className="flex items-center gap-3 my-4">
                                    <div className="flex-1 h-px bg-slate-200" />
                                    <span className="flex-shrink-0 text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full capitalize">
                                        {formatDayHeader(grouped[day][0].created_at)}
                                    </span>
                                    <div className="flex-1 h-px bg-slate-200" />
                                </div>

                                {/* Entries for this day */}
                                <div className="space-y-2">
                                    {grouped[day].map(entry => (
                                        <div key={entry.id} className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
                                            <EntryBubble
                                                entry={entry}
                                                groupId={groupId}
                                                onImageClick={setLightboxUrl}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div ref={bottomRef} className="h-2" />
                    </div>
                )}
            </div>

            {/* Composer */}
            <Composer groupId={groupId} userId={userId} onSent={fetchEntries} />

            {/* Lightbox */}
            {lightboxUrl && (
                <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
            )}
        </div>
    );
}

"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Search, 
    Calendar, 
    MoreHorizontal, 
    Trash2, 
    Star, 
    Image as ImageIcon, 
    FileText, 
    CloudUpload, 
    Loader2, 
    Maximize2, 
    X, 
    SlidersHorizontal,
    Plus,
    NotebookPen,
    ArrowRight,
    SendHorizontal,
    ExternalLink,
    MessageSquare,
    ChevronRight,
    MessageCircle,
    Clock,
    ChevronDown,
    Sparkles,
    Mic,
    Paperclip,
    Play,
    Layers,
    Tag,
    FilterX,
    CheckSquare,
    Circle,
    CheckCircle2,
    HelpCircle
} from 'lucide-react';
import { format, isToday, isYesterday, parseISO, differenceInMinutes, getYear, getMonth, getWeek } from 'date-fns';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { ScientificText } from '@/components/ScientificText';
import NotionLogbook from './NotionLogbook';

const scrollbarStyles = `
  .custom-scroll::-webkit-scrollbar { width: 4px; }
  .custom-scroll::-webkit-scrollbar-track { background: transparent; }
  .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
  .custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
`;

const formatTime = (dateStr: string) => format(parseISO(dateStr), 'HH:mm');

// --- Component to render media in a Telegram-style mosaic ---
function MediaGallery({ files, onImageClick, onDeleteMedia }: { files: any[], onImageClick: any, onDeleteMedia: any }) {
    if (!files || files.length === 0) return null;
    const getUrl = (f: any) => f.telegram_file_id ? `/api/logbook/image?file_id=${f.telegram_file_id}` : f.view_url;
    return (
        <div className={cn(
            "grid gap-1.5 mt-3 rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black/40",
            files.length === 1 ? "grid-cols-1 max-w-[450px]" : 
            files.length === 2 ? "grid-cols-2 max-w-[550px]" : 
            "grid-cols-3 max-w-[700px]"
        )}>
            {files.map((f, i) => {
                const url = getUrl(f);
                const isVideo = f.type === 'video' || f.mime_type?.startsWith('video/') || f.view_url?.toLowerCase().endsWith('.mp4');
                return (
                    <div key={i} className={cn("relative bg-white/[0.02] cursor-pointer group/media", files.length === 1 ? "aspect-video" : "aspect-square")}>
                        <div onClick={() => onImageClick(url, isVideo ? 'video' : 'image')} className="w-full h-full">
                            {isVideo ? (
                                <div className="w-full h-full bg-black/40 flex items-center justify-center relative">
                                    <video className="w-full h-full object-cover opacity-50"><source src={url} type="video/mp4" /></video>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 hover:scale-110 transition-transform"><Play size={18} className="text-white fill-white ml-0.5" /></div>
                                    </div>
                                </div>
                            ) : (
                                <img src={url} className="w-full h-full object-cover opacity-90 group-hover/media:opacity-100 transition-all" />
                            )}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onDeleteMedia(f.parent_entry_id); }} className="absolute top-2.5 right-2.5 p-2 bg-black/70 backdrop-blur-md rounded-full text-white/40 hover:text-red-400 opacity-0 group-hover/media:opacity-100 transition-all z-10 border border-white/10"><Trash2 size={12} /></button>
                    </div>
                );
            })}
        </div>
    );
}

// --- LogEntry Component ---
function LogEntry({ entry, groupId, onImageClick, onUpdate, onDelete, comments, onReply, onTagClick, tasks = [], onToggleTask }: any) {
    const [isHovered, setIsHovered] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isReplying, setIsReplying] = useState(false);
    const [editValue, setEditValue] = useState(entry.content || '');
    const [replyValue, setReplyValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
            textareaRef.current.focus();
        }
    }, [isEditing]);

    const handleSave = async () => {
        if (editValue.trim() === entry.content) { setIsEditing(false); return; }
        await onUpdate(entry.id, editValue.trim());
        setIsEditing(false);
    };

    const handleSendReply = async () => {
        if (!replyValue.trim()) return;
        await onReply(replyValue.trim(), entry.id);
        setReplyValue('');
        setIsReplying(false);
    };

    const taskId = entry.metadata?.task_id;
    const associatedTask = (tasks || []).find((t: any) => t.id === taskId);
    const taskStatus = associatedTask?.status || 'todo';
    const isDone = taskStatus === 'done';

    return (
        <div id={`entry-${entry.id}`} 
            className={cn(
                "group relative grid grid-cols-[1fr_380px] gap-12 py-5 border-b border-white/[0.05] last:border-0 transition-all -mx-4 px-4 rounded-xl",
                entry.entry_type === 'task_command' 
                    ? (isDone 
                        ? "bg-emerald-500/[0.03] border-l-2 border-l-emerald-500/50 shadow-[inset_10px_0_30px_-15px_rgba(16,185,129,0.1)]" 
                        : "bg-orange-500/[0.03] border-l-2 border-l-orange-500/50 shadow-[inset_10px_0_30px_-15px_rgba(249,115,22,0.1)]")
                    : "hover:bg-white/[0.01]"
            )} 
            onMouseEnter={() => setIsHovered(true)} 
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {entry.entry_type === 'task_command' ? (
                            <button 
                                onClick={() => onToggleTask(taskId, taskStatus)}
                                className={cn(
                                    "flex items-center gap-1.5 px-2 py-0.5 border rounded-md transition-all cursor-pointer hover:scale-105 active:scale-95",
                                    isDone 
                                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]" 
                                        : "bg-orange-500/10 border-orange-500/20 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.1)]"
                                )}
                            >
                                {isDone ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                                <span className="text-[10px] font-black uppercase tracking-widest">{isDone ? 'Done' : 'Task'}</span>
                            </button>
                        ) : (
                            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                        )}
                        <span className="text-[12px] font-black text-white/40 tracking-widest tabular-nums uppercase">{formatTime(entry.created_at)}</span>
                    </div>
                    <div className={cn("flex items-center gap-2 transition-all", isEditing && "hidden")}>
                        <button onClick={() => setIsReplying(!isReplying)} className="p-2 text-white/40 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all" title="Add side note"><MessageSquare size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }} className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 size={16} /></button>
                    </div>
                </div>
                {entry.content && (
                    isEditing ? (
                        <textarea ref={textareaRef} value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={handleSave} className="w-full bg-transparent border-none outline-none resize-none text-[18px] text-white leading-relaxed p-0 focus:ring-0 font-medium" />
                    ) : (
                        <div onClick={() => setIsEditing(true)} className="text-[18px] text-white leading-relaxed whitespace-pre-wrap cursor-text selection:bg-blue-500/40 font-medium tracking-tight">
                            <ScientificText text={entry.content} onTagClick={onTagClick} />
                        </div>
                    )
                )}
                <MediaGallery files={entry.media_files} onImageClick={onImageClick} onDeleteMedia={onDelete} />
            </div>
            <div className="space-y-3">
                {comments.map((c: any) => (
                    <div key={c.id} className="bg-white/[0.04] border border-white/[0.1] rounded-2xl p-4 shadow-2xl relative group/annot animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="text-[10px] font-black text-white/30 uppercase mb-2 flex justify-between tracking-widest"><span>{formatTime(c.created_at)}</span><button onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} className="opacity-0 group-hover/annot:opacity-100 hover:text-red-400 transition-all"><Trash2 size={12} /></button></div>
                        <div className="text-[16px] text-white/80 leading-relaxed font-normal tracking-tight">
                            <ScientificText text={c.content} onTagClick={onTagClick} />
                        </div>
                        <MediaGallery files={c.media_files} onImageClick={onImageClick} onDeleteMedia={onDelete} />
                    </div>
                ))}
                {isReplying && (
                    <div className="bg-[#1e1f20] border-2 border-blue-500/30 rounded-2xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-right-4 duration-200">
                        <div className="text-[10px] font-black text-blue-400 uppercase mb-3 tracking-widest">New Annotation</div>
                        <textarea value={replyValue} onChange={e => setReplyValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }} placeholder="Record side note (#tag, SiO_2)..." autoFocus className="w-full bg-transparent border-none outline-none resize-none text-[15px] text-white placeholder-white/10 leading-relaxed" rows={3} />
                        <div className="flex justify-end pt-3"><button onClick={handleSendReply} className="px-4 py-1.5 bg-blue-600 rounded-xl text-white text-[11px] font-black uppercase shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-all">Save Note</button></div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function LogbookView({ groupId, userId, isPrivate, isOwner }: { 
    groupId: string;
    userId?: string;
    isPrivate?: boolean;
    isOwner?: boolean;
}) {
    const [entries, setEntries] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [allActiveDates, setAllActiveDates] = useState<string[]>([]);
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'timeline' | 'gallery' | 'notebook'>('timeline');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterTasks, setFilterTasks] = useState(false);
    const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video'>('all');
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [hasMoreDown, setHasMoreDown] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [lightbox, setLightbox] = useState<{ url: string, type: string } | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const ITEMS_PER_PAGE = 50;
    const bottomRef = useRef<HTMLDivElement>(null);
    const pendingJumpDateRef = useRef<string | null>(null);
    const supabase = createClient();

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                toast.error('Only image files are supported');
                return;
            }
            setSelectedImage(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleClearImage = () => {
        setSelectedImage(null);
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData?.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        setSelectedImage(file);
                        setPreviewUrl(URL.createObjectURL(file));
                        e.preventDefault();
                        break;
                    }
                }
            }
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                setSelectedImage(file);
                setPreviewUrl(URL.createObjectURL(file));
            } else {
                toast.error('Only image files are supported');
            }
        }
    };

    useEffect(() => {
        fetchEntries(true);
        fetchTasks();
        fetchAllActiveDates();
        
        const logbookChannel = supabase.channel('logbook_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'logbook_entries', filter: `group_id=eq.${groupId}` }, (payload) => {
            if (payload.eventType === 'INSERT') {
                setEntries(prev => {
                    if (prev.some(e => e.id === payload.new.id)) return prev;
                    return [...prev, payload.new];
                });
                fetchAllActiveDates(); // Update sidebar on new entry
            } else {
                fetchEntries(true);
            }
        }).subscribe();

        const taskChannel = supabase.channel('task_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `group_id=eq.${groupId}` }, () => fetchTasks()).subscribe();
        
        return () => { 
            supabase.removeChannel(logbookChannel); 
            supabase.removeChannel(taskChannel);
        };
    }, [groupId]);

    const fetchAllActiveDates = async () => {
        const { data } = await (supabase as any)
            .from('logbook_entries')
            .select('created_at')
            .eq('group_id', groupId)
            .is('parent_id', null)
            .order('created_at', { ascending: false });
        
        if (data) {
            const logbookData = data as any[];
            const dates = Array.from(new Set(logbookData.map(e => format(parseISO(e.created_at), 'yyyy-MM-dd'))));
            setAllActiveDates(dates);
        }
    };

    const fetchEntries = async (isInitial = true, jumpDate?: string, direction: 'up' | 'down' = 'up') => {
        if (!isInitial) setIsLoadingMore(true);
        if (jumpDate) setIsReady(false); // Hide during jump
        
        let query = (supabase as any)
            .from('logbook_entries')
            .select('*')
            .eq('group_id', groupId)
            .limit(ITEMS_PER_PAGE);

        if (jumpDate) {
            // Fetch entries before the selected jump date
            query = query.lte('created_at', `${jumpDate}T23:59:59`).order('created_at', { ascending: false });
        } else if (!isInitial && direction === 'up' && entries.length > 0) {
            const oldestDate = entries[0].created_at;
            query = query.lt('created_at', oldestDate).order('created_at', { ascending: false });
        } else if (!isInitial && direction === 'down' && entries.length > 0) {
            const newestDate = entries[entries.length - 1].created_at;
            query = query.gt('created_at', newestDate).order('created_at', { ascending: true });
        } else {
            // Default latest entries
            query = query.order('created_at', { ascending: false });
        }

        const { data } = await query;
        
        if (data) {
            const logbookData = data as any[];
            const sortedData = [...logbookData].sort((a, b) => a.created_at.localeCompare(b.created_at));
            
            if (isInitial || jumpDate) {
                setEntries(sortedData);
                setHasMore(logbookData.length === ITEMS_PER_PAGE);
                // Check if we need a 'Load Newer' button
                if (jumpDate) {
                    const { count } = await (supabase as any).from('logbook_entries').select('*', { count: 'exact', head: true }).eq('group_id', groupId).gt('created_at', logbookData[0]?.created_at || '');
                    setHasMoreDown(!!count && count > 0);
                } else {
                    setHasMoreDown(false);
                }
            } else if (direction === 'up') {
                setEntries(prev => {
                    const existingIds = new Set(prev.map(e => e.id));
                    const uniqueNew = sortedData.filter(e => !existingIds.has(e.id));
                    return [...uniqueNew, ...prev];
                });
                setHasMore(logbookData.length === ITEMS_PER_PAGE);
            } else if (direction === 'down') {
                setEntries(prev => {
                    const existingIds = new Set(prev.map(e => e.id));
                    const uniqueNew = sortedData.filter(e => !existingIds.has(e.id));
                    const newList = [...prev, ...uniqueNew];
                    return newList;
                });
                setHasMoreDown(logbookData.length === ITEMS_PER_PAGE);
            }
        }
        
        setIsLoadingMore(false);
    };

    const fetchTasks = async () => {
        const { data } = await supabase.from('tasks').select('id, status').eq('group_id', groupId);
        setTasks(data || []);
    };

    // --- AUTO SCROLL TO BOTTOM ---
    useEffect(() => {
        const pendingJumpDate = pendingJumpDateRef.current;
        if (pendingJumpDate) {
            requestAnimationFrame(() => {
                document.getElementById(`day-${pendingJumpDate}`)?.scrollIntoView({ behavior: 'auto' });
                pendingJumpDateRef.current = null;
                setIsReady(true);
            });
            return;
        }

        const lastEntryId = entries[entries.length - 1]?.id;
        if (lastEntryId) {
            bottomRef.current?.scrollIntoView({ behavior: 'auto' });
            if (!isReady) setIsReady(true);
        }
    }, [entries]);

    // --- EXTRACT TAGS FROM ALL ENTRIES ---
    const allTags = useMemo(() => {
        const tagsSet = new Set<string>();
        entries.forEach(e => {
            if (e.content) {
                const found = e.content.match(/#[a-zA-Z0-9_áéíóúÁÉÍÓÚ]+/g);
                if (found) found.forEach((t: string) => tagsSet.add(t));
            }
        });
        return Array.from(tagsSet).sort();
    }, [entries]);

    const visualGroups = useMemo(() => {
        const filtered = entries.filter(e => !e.parent_id)
            .filter(e => e.content?.toLowerCase().includes(searchQuery.toLowerCase()))
            .filter(e => !activeTag || e.content?.includes(activeTag))
            .filter(e => !filterTasks || e.entry_type === 'task_command')
            .filter(e => {
                if (mediaFilter === 'all') return true;
                const hasMedia = (e.media_files || []).some((m: any) => {
                    const isVideo = m.type === 'video' || m.mime_type?.startsWith('video/') || m.view_url?.toLowerCase().endsWith('.mp4');
                    return mediaFilter === 'image' ? !isVideo : isVideo;
                });
                return hasMedia;
            });
        
        const dayGroups: any[] = [];
        filtered.forEach(entry => {
            const date = format(parseISO(entry.created_at), 'yyyy-MM-dd');
            let dayGroup = dayGroups.find(g => g.date === date);
            
            if (!dayGroup) {
                dayGroup = { date, blocks: [] };
                dayGroups.push(dayGroup);
            }
            
            const lastBlock = dayGroup.blocks[dayGroup.blocks.length - 1];
            const isMediaOnly = !entry.content || entry.content.trim() === '';
            const entryMedia = (entry.media_files || []).map((f: any) => ({ ...f, parent_entry_id: entry.id }));
            
            if (lastBlock && isMediaOnly && lastBlock.isMediaOnly && differenceInMinutes(parseISO(entry.created_at), parseISO(lastBlock.created_at)) === 0) {
                lastBlock.entries.push(entry);
                lastBlock.media_files = [...lastBlock.media_files, ...entryMedia];
            } else {
                dayGroup.blocks.push({
                    id: entry.id,
                    created_at: entry.created_at,
                    entries: [entry],
                    media_files: entryMedia,
                    isMediaOnly,
                    content: entry.content,
                    entry_type: entry.entry_type,
                    metadata: entry.metadata
                });
            }
        });
        
        return dayGroups;
    }, [entries, searchQuery, activeTag, filterTasks, mediaFilter]);

    const galleryMedia = useMemo(() => {
        const allMedia: any[] = [];
        entries.forEach(e => {
            if (e.media_files) {
                e.media_files.forEach((m: any) => {
                    if (e.content?.toLowerCase().includes(searchQuery.toLowerCase()) || !searchQuery) {
                        const isVideo = m.type === 'video' || m.mime_type?.startsWith('video/') || m.view_url?.toLowerCase().endsWith('.mp4');
                        if (mediaFilter === 'all' || (mediaFilter === 'image' && !isVideo) || (mediaFilter === 'video' && isVideo)) {
                            allMedia.push({ ...m, content: e.content, created_at: e.created_at });
                        }
                    }
                });
            }
        });
        return allMedia.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }, [entries, searchQuery, mediaFilter]);


    const comments = entries.filter(e => e.parent_id);

    const timelineHierarchy = useMemo(() => {
        const hierarchy: any = {};
        allActiveDates.forEach(dayKey => {
            const date = parseISO(dayKey);
            const year = getYear(date);
            const month = format(date, 'MMMM');
            const weekNumber = format(date, 'w');
            if (!hierarchy[year]) hierarchy[year] = { months: {} };
            if (!hierarchy[year].months[month]) hierarchy[year].months[month] = { weeks: {} };
            if (!hierarchy[year].months[month].weeks[weekNumber]) hierarchy[year].months[month].weeks[weekNumber] = { days: [] };
            if (!hierarchy[year].months[month].weeks[weekNumber].days.includes(dayKey)) hierarchy[year].months[month].weeks[weekNumber].days.push(dayKey);
        });
        return hierarchy;
    }, [allActiveDates]);

    const handleTimelineJump = async (day: string) => {
        const element = document.getElementById(`day-${day}`);
        if (element) {
            element.scrollIntoView({ behavior: 'auto' });
            setIsReady(true);
        } else {
            pendingJumpDateRef.current = day;
            await fetchEntries(true, day);
        }
    };

    useEffect(() => {
        if (Object.keys(timelineHierarchy).length > 0 && Object.keys(expandedNodes).length === 0) {
            const now = new Date();
            const year = getYear(now);
            const month = format(now, 'MMMM');
            const week = format(now, 'w');
            setExpandedNodes({ [`year-${year}`]: true, [`month-${year}-${month}`]: true, [`week-${year}-${month}-${week}`]: true });
        }
    }, [timelineHierarchy]);

    const toggleNode = (id: string) => { setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] })); };
    const handleUpdate = async (id: string, text: string) => {
        const res = await fetch('/api/logbook/update', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, text, groupId }) });
        if (!res.ok) {
            toast.error('Could not update entry');
            await fetchEntries(true);
            return;
        }
        const { entry } = await res.json();
        if (entry) setEntries(prev => prev.map(e => e.id === id ? { ...e, ...entry } : e));
    };
    const requestDelete = (id: string) => {
        setPendingDeleteId(id);
    };
    const confirmDelete = async () => {
        if (!pendingDeleteId || isDeleting) return;
        const id = pendingDeleteId;
        setIsDeleting(true);
        setPendingDeleteId(null);
        const previousEntries = entries;
        setEntries(prev => prev.filter(e => e.id !== id));
        const res = await fetch('/api/logbook/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, groupId }) });
        if (!res.ok) {
            toast.error('Could not delete entry');
            setEntries(previousEntries);
        }
        setIsDeleting(false);
    };
    const cancelDelete = () => {
        if (isDeleting) return;
        setPendingDeleteId(null);
    };
    const handleSend = async (text: string, parentId?: string) => { 
        if (!text.trim() && !selectedImage) return; 
        
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('text', text);
            formData.append('groupId', groupId);
            if (parentId) {
                formData.append('parentId', parentId);
            }
            if (selectedImage) {
                formData.append('image', selectedImage);
            }

            const res = await fetch('/api/logbook/send', { 
                method: 'POST', 
                body: formData 
            });

            if (!res.ok) {
                const errData = await res.json();
                toast.error(errData.error || 'Failed to send message');
            } else {
                handleClearImage();
                const textarea = document.getElementById('logbook-main-input') as HTMLTextAreaElement;
                if (textarea) textarea.value = '';
            }
        } catch (err) {
            console.error('Error sending logbook entry:', err);
            toast.error('Error sending message');
        } finally {
            setIsUploading(false);
            fetchEntries(true);
        }
    };

    const handleToggleTask = async (taskId: string, currentStatus: string) => {
        if (!taskId) return;
        const newStatus = currentStatus === 'done' ? 'todo' : 'done';
        const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
        if (error) return;
        fetchTasks();
    };

    const formatDateHeader = (dateStr: string) => {
        const d = parseISO(dateStr);
        return isToday(d) ? 'Today' : format(d, 'MMMM dd, yyyy');
    };

    return (
        <div className="flex h-full bg-[#0d0d0e] text-[#e3e3e3] overflow-hidden font-sans selection:bg-blue-500/30">
            <style>{scrollbarStyles}</style>

            <div className="w-[180px] border-r border-white/[0.06] bg-black/40 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-white/[0.05] flex items-center gap-2">
                    <Layers size={14} className="text-blue-500" />
                    <span className="text-[9px] font-black tracking-[0.1em] text-white/30 uppercase">Explorer</span>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scroll p-3 space-y-6">
                    <div className="space-y-1.5">
                        <div className="px-2 mb-2 flex items-center gap-2 text-white/20">
                            <SlidersHorizontal size={12} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Filters</span>
                        </div>
                        <button 
                            onClick={() => setFilterTasks(!filterTasks)}
                            className={cn(
                                "w-full flex items-center gap-3 p-2 rounded-xl transition-all border",
                                filterTasks 
                                    ? "bg-orange-500/10 border-orange-500/20 text-orange-400" 
                                    : "bg-white/[0.02] border-white/5 text-white/30 hover:bg-white/[0.04]"
                            )}
                        >
                            <div className={cn("w-1.5 h-1.5 rounded-full", filterTasks ? "bg-orange-500 animate-pulse" : "bg-white/10")} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Tasks Only</span>
                        </button>
                        <div className="grid grid-cols-3 gap-1">
                            {(['all', 'image', 'video'] as const).map((f) => (
                                <button 
                                    key={f}
                                    onClick={() => setMediaFilter(f)}
                                    className={cn(
                                        "py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all",
                                        mediaFilter === f 
                                            ? "bg-blue-600/20 border-blue-500/30 text-blue-400" 
                                            : "bg-white/[0.01] border-white/5 text-white/20 hover:text-white/40"
                                    )}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="px-2 mb-2 flex items-center gap-2 text-white/20">
                            <Clock size={12} />
                            <span className="text-[9px] font-black uppercase tracking-widest">History</span>
                        </div>
                        {Object.keys(timelineHierarchy).sort().reverse().map(year => (
                            <div key={year} className="space-y-0.5">
                                <button onClick={() => toggleNode(`year-${year}`)} className="w-full flex items-center justify-between p-1.5 hover:bg-white/[0.03] rounded-lg transition-all group">
                                    <span className="text-[12px] font-black text-white/50 group-hover:text-white uppercase tracking-wider">{year}</span>
                                    <ChevronRight size={12} className={cn("text-white/10 transition-transform", expandedNodes[`year-${year}`] && "rotate-90")} />
                                </button>
                                {expandedNodes[`year-${year}`] && (
                                    <div className="ml-2 border-l border-white/[0.05] pl-1.5 space-y-0.5">
                                        {Object.keys(timelineHierarchy[year].months).map(month => (
                                            <div key={month} className="space-y-0.5">
                                                <button onClick={() => toggleNode(`month-${year}-${month}`)} className="w-full flex items-center justify-between p-1.5 hover:bg-white/[0.03] rounded-lg transition-all group">
                                                    <span className="text-[11px] font-bold text-white/30 group-hover:text-white/70">{month}</span>
                                                    <ChevronRight size={10} className={cn("text-white/5 transition-transform", expandedNodes[`month-${year}-${month}`] && "rotate-90")} />
                                                </button>
                                                {expandedNodes[`month-${year}-${month}`] && (
                                                    <div className="ml-2 border-l border-white/[0.05] pl-1.5 space-y-0.5">
                                                        {Object.keys(timelineHierarchy[year].months[month].weeks).map(week => (
                                                            <div key={week} className="space-y-0.5">
                                                                <button onClick={() => toggleNode(`week-${year}-${month}-${week}`)} className="w-full flex items-center justify-between p-1.5 hover:bg-white/[0.03] rounded-lg transition-all group">
                                                                    <span className="text-[10px] font-medium text-white/10 group-hover:text-white/40 uppercase">W{week}</span>
                                                                    <ChevronRight size={8} className={cn("text-white/5 transition-transform", expandedNodes[`week-${year}-${month}-${week}`] && "rotate-90")} />
                                                                </button>
                                                                {expandedNodes[`week-${year}-${month}-${week}`] && (
                                                                    <div className="ml-2 space-y-0.5">
                                                                        {timelineHierarchy[year].months[month].weeks[week].days.sort().map((day: string) => (
                                                                            <button key={day} onClick={() => handleTimelineJump(day)} className="w-full flex items-center gap-2 p-1.5 hover:bg-blue-500/10 rounded-lg transition-all group text-left">
                                                                                <div className={cn("w-1 h-1 rounded-full", isToday(parseISO(day)) ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-white/10")} />
                                                                                <span className="text-[10px] font-bold text-white/20 group-hover:text-white transition-colors uppercase tracking-tight">{format(parseISO(day), 'EEE dd')}</span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="space-y-3">
                        <div className="px-2 flex items-center gap-2 text-white/20">
                            <Tag size={12} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Library Tags</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 px-1">
                            {allTags.map(tag => (
                                <button 
                                    key={tag} 
                                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                                    className={cn(
                                        "px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all border",
                                        activeTag === tag 
                                            ? "bg-blue-600 border-blue-400 text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]" 
                                            : "bg-white/[0.03] border-white/5 text-white/30 hover:text-white/60 hover:bg-white/[0.05]"
                                    )}
                                >
                                    {tag}
                                </button>
                            ))}
                            {allTags.length === 0 && <span className="text-[9px] text-white/10 italic px-2">No tags found...</span>}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0 relative">
                <div className="px-16 py-8 flex items-center justify-between bg-[#0d0d0e]/95 backdrop-blur-2xl z-20 border-b border-white/[0.05]">
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-4">
                            <NotebookPen size={18} className="text-blue-500" />
                            <h1 className="text-[12px] font-black tracking-[0.3em] text-white/40 uppercase">Project Notebook</h1>
                        </div>

                        <div className="h-8 w-px bg-white/10" />

                        <div className="flex items-center gap-2 p-1 bg-white/[0.03] rounded-xl border border-white/5">
                            <button 
                                onClick={() => setViewMode('timeline')}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                    viewMode === 'timeline' ? "bg-white/10 text-white shadow-lg" : "text-white/20 hover:text-white/40"
                                )}
                            >
                                Timeline
                            </button>
                            <button 
                                onClick={() => setViewMode('gallery')}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer",
                                    viewMode === 'gallery' ? "bg-white/10 text-white shadow-lg" : "text-white/20 hover:text-white/40"
                                )}
                            >
                                Gallery
                            </button>
                            <button 
                                onClick={() => setViewMode('notebook')}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer",
                                    viewMode === 'notebook' ? "bg-white/10 text-white shadow-lg" : "text-white/20 hover:text-white/40"
                                )}
                            >
                                Notebook
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 flex-1 max-w-xl mx-8">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-blue-500 transition-colors" size={16} />
                            <input 
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search experiments, tags or results..."
                                className="w-full bg-white/[0.03] border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-[13px] text-white placeholder-white/10 focus:outline-none focus:border-blue-500/30 focus:bg-white/[0.05] transition-all"
                            />
                        </div>
                        <button 
                            onClick={() => setShowHelp(true)} 
                            className="p-3 bg-white/[0.03] border border-white/5 text-white/20 hover:text-white hover:bg-white/[0.05] rounded-2xl transition-all"
                        >
                            <HelpCircle size={18} />
                        </button>
                    </div>
                </div>

                <div className={cn(
                    "flex-1 min-h-0",
                    viewMode !== 'notebook' ? "overflow-y-auto px-16 pt-8 pb-40 custom-scroll" : "overflow-hidden",
                    (!isReady && viewMode !== 'notebook') && "invisible"
                )}>
                    {viewMode === 'timeline' ? (
                        <div className="max-w-6xl mx-auto space-y-12">
                            {hasMoreDown && (
                                <div className="flex justify-center py-4">
                                    <button onClick={() => fetchEntries(false, undefined, 'down')} disabled={isLoadingMore} className="px-6 py-2 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600/20 transition-all disabled:opacity-50">
                                        {isLoadingMore ? <Loader2 className="animate-spin" size={14} /> : "Load Newer Entries"}
                                    </button>
                                </div>
                            )}

                            {visualGroups.map((group) => (
                                <div key={group.date} id={`day-${group.date}`} className="space-y-6">
                                    <div className="sticky top-0 z-10 flex items-center gap-6 py-4 bg-transparent backdrop-blur-sm">
                                        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/[0.05]" />
                                        <h2 className="text-[12px] font-black text-white tracking-[0.4em] uppercase opacity-90 drop-shadow-lg">{formatDateHeader(group.date)}</h2>
                                        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/[0.05]" />
                                    </div>
                                    <div className="space-y-2">
                                        {group.blocks.map((block: any) => (
                                            <LogEntry 
                                                key={block.id} 
                                                entry={block} 
                                                groupId={groupId}
                                                comments={entries.filter(e => e.parent_id === block.id || block.entries.some((be: any) => e.parent_id === be.id))}
                                                tasks={tasks}
                                                onImageClick={(url: string, type: string) => setLightbox({ url, type })}
                                                onUpdate={handleUpdate}
                                                onDelete={requestDelete}
                                                onReply={handleSend}
                                                onTagClick={(tag: string) => setActiveTag(tag)}
                                                onToggleTask={handleToggleTask}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                            
                            {hasMore && (
                                <div className="flex justify-center py-12">
                                    <button onClick={() => fetchEntries(false, undefined, 'up')} disabled={isLoadingMore} className="px-8 py-3 bg-white/[0.03] border border-white/10 text-white/30 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-white/[0.05] hover:text-white transition-all disabled:opacity-50 flex items-center gap-3">
                                        {isLoadingMore ? <Loader2 className="animate-spin" size={16} /> : "Load Previous Scientific Records"}
                                    </button>
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>
                    ) : viewMode === 'gallery' ? (
                        <div className="max-w-7xl mx-auto">
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                                {galleryMedia.map((m, i) => (
                                    <div 
                                        key={i} 
                                        className="group relative aspect-square rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] cursor-pointer hover:border-blue-500/30 transition-all shadow-xl"
                                        onClick={() => setLightbox({ url: m.telegram_file_id ? `/api/logbook/image?file_id=${m.telegram_file_id}` : m.view_url, type: (m.type === 'video' || m.mime_type?.startsWith('video/') || m.view_url?.toLowerCase().endsWith('.mp4')) ? 'video' : 'image' })}
                                    >
                                        {(m.type === 'video' || m.mime_type?.startsWith('video/') || m.view_url?.toLowerCase().endsWith('.mp4')) ? (
                                            <div className="w-full h-full bg-black/40 flex items-center justify-center relative">
                                                <video className="w-full h-full object-cover opacity-50"><source src={m.view_url} type="video/mp4" /></video>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Play size={24} className="text-white fill-white opacity-40 group-hover:opacity-100 transition-all" />
                                                </div>
                                            </div>
                                        ) : (
                                            <img 
                                                src={m.telegram_file_id ? `/api/logbook/image?file_id=${m.telegram_file_id}` : m.view_url} 
                                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" 
                                                loading="lazy"
                                            />
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Clock size={10} className="text-blue-400" />
                                                <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{format(parseISO(m.created_at), 'MMM dd, yyyy')}</span>
                                            </div>
                                            {m.content && <p className="text-[11px] text-white font-medium line-clamp-2 leading-snug">{m.content}</p>}
                                        </div>
                                    </div>
                                ))}
                                {galleryMedia.length === 0 && (
                                    <div className="col-span-full py-40 flex flex-col items-center justify-center text-white/10 gap-6">
                                        <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center">
                                            <ImageIcon size={32} />
                                        </div>
                                        <div className="text-center space-y-2">
                                            <h3 className="text-[14px] font-black uppercase tracking-[0.3em] text-white/20">No media artifacts found</h3>
                                            <p className="text-[11px] font-medium text-white/5 uppercase tracking-widest">Adjust your filters or search query</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {(hasMore || hasMoreDown) && (
                                <div className="flex justify-center py-20 border-t border-white/5 mt-20">
                                    <button onClick={() => fetchEntries(false, undefined, 'up')} disabled={isLoadingMore} className="px-10 py-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/10 text-white/20 hover:text-white transition-all rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-3">
                                        {isLoadingMore ? <Loader2 className="animate-spin" size={16} /> : "Load More Media Records"}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <NotionLogbook groupId={groupId} />
                    )}
                </div>

                {viewMode !== 'notebook' && (
                    <div className="absolute bottom-10 left-0 right-0 px-16 pointer-events-none">
                        <div 
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            className="max-w-2xl mx-auto bg-[#1e1f20] border border-white/10 rounded-[30px] p-4 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.8)] pointer-events-auto flex flex-col gap-3 group focus-within:border-blue-500/30 transition-all"
                        >
                            {/* Preview section */}
                            {previewUrl && (
                                <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-white/10 group/preview animate-in zoom-in duration-200">
                                    <img src={previewUrl} className="w-full h-full object-cover" />
                                    <button 
                                        onClick={handleClearImage}
                                        className="absolute top-1 right-1 p-1 bg-black/75 hover:bg-black text-white/70 hover:text-white rounded-full transition-all border border-white/10"
                                        title="Clear Image"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )}

                            {/* Main input row */}
                            <div className="flex items-center gap-4">
                                <button 
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-1 text-white/20 hover:text-white transition-colors cursor-pointer"
                                    title="Attach Image"
                                >
                                    <Plus size={24} />
                                </button>
                                <input 
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleImageChange}
                                    accept="image/*"
                                    className="hidden"
                                />

                                <textarea 
                                    onKeyDown={(e) => { 
                                        if (e.key === 'Enter' && !e.shiftKey) { 
                                            e.preventDefault(); 
                                            const val = (e.target as any).value;
                                            handleSend(val); 
                                            (e.target as any).value = ''; 
                                        } 
                                    }} 
                                    onPaste={handlePaste}
                                    placeholder={selectedImage ? "Add caption (#tag, SiO_2)..." : "Start typing (#tag, SiO_2)..."} 
                                    className="flex-1 bg-transparent border-none outline-none resize-none py-2 text-[18px] text-white font-medium" 
                                    rows={1} 
                                    id="logbook-main-input"
                                />

                                <button 
                                    onClick={() => {
                                        const el = document.getElementById('logbook-main-input') as HTMLTextAreaElement;
                                        if (el) {
                                            handleSend(el.value);
                                            el.value = '';
                                        }
                                    }}
                                    disabled={isUploading}
                                    className="p-3 bg-blue-600 disabled:bg-blue-600/50 disabled:text-white/50 text-white rounded-full shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-all flex items-center justify-center"
                                >
                                    {isUploading ? (
                                        <Loader2 size={20} className="animate-spin text-white" />
                                    ) : (
                                        <SendHorizontal size={20} />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {lightbox && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/98 backdrop-blur-3xl animate-in fade-in" onClick={() => setLightbox(null)}>
                    <button className="absolute top-10 right-10 text-white/40 hover:text-white"><X size={44} /></button>
                    {lightbox.type === 'video' ? <video src={lightbox.url} controls autoPlay className="max-w-[95%] max-h-[90vh] rounded-3xl" onClick={e => e.stopPropagation()} /> : <img src={lightbox.url} className="max-w-[95%] max-h-[90vh] object-contain rounded-3xl" />}
                </div>
            )}

            {pendingDeleteId && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6" onClick={cancelDelete}>
                    <div className="w-full max-w-sm bg-[#121214] border border-white/10 rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                                <Trash2 size={18} />
                            </div>
                            <div>
                                <h3 className="text-[14px] font-black text-white uppercase tracking-widest">Delete Entry</h3>
                                <p className="text-[12px] text-white/40 mt-1">This action cannot be undone.</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={cancelDelete} disabled={isDeleting} className="px-4 py-2 rounded-xl bg-white/[0.04] text-white/50 hover:text-white hover:bg-white/[0.08] transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50">Cancel</button>
                            <button onClick={confirmDelete} disabled={isDeleting} className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-500 transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2">
                                {isDeleting && <Loader2 size={14} className="animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Help Modal */}
            {showHelp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-md" onClick={() => setShowHelp(false)}>
                    <div className="bg-[#0d0d0e] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="px-10 py-8 border-b border-white/10 flex items-center justify-between">
                            <span className="text-[14px] font-black text-white uppercase tracking-[0.3em]">System Guide</span>
                            <button onClick={() => setShowHelp(false)} className="text-white/40 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-12 grid grid-cols-3 gap-16">
                            {/* Column: Input */}
                            <div className="space-y-10">
                                <div className="text-[11px] font-black uppercase tracking-widest text-blue-400">Notebook</div>
                                <div className="space-y-6">
                                    <div className="flex items-center gap-5">
                                        <code className="text-blue-400 font-mono text-[13px] bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">..</code>
                                        <span className="text-[13px] text-white font-medium">Kanban Task</span>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        <code className="text-blue-400 font-mono text-[13px] bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">#</code>
                                        <span className="text-[13px] text-white font-medium">Library Tag</span>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        <code className="text-blue-400 font-mono text-[13px] bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">$ $</code>
                                        <span className="text-[13px] text-white font-medium">LaTeX Math</span>
                                    </div>
                                </div>
                            </div>

                            {/* Column: Interface */}
                            <div className="space-y-10 border-x border-white/10 px-12">
                                <div className="text-[11px] font-black uppercase tracking-widest text-white/40">Interface</div>
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <Circle size={12} className="text-white" />
                                        <span className="text-[13px] text-white font-medium">Check Task</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <Clock size={12} className="text-white" />
                                        <span className="text-[13px] text-white font-medium">Time Jump</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <MessageSquare size={12} className="text-white" />
                                        <span className="text-[13px] text-white font-medium">Thread</span>
                                    </div>
                                </div>
                            </div>

                            {/* Column: Keyboard */}
                            <div className="space-y-10">
                                <div className="text-[11px] font-black uppercase tracking-widest text-white/40">Keyboard</div>
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <kbd className="text-[11px] font-mono text-white bg-white/10 px-3 py-1.5 rounded border border-white/20">ENTER</kbd>
                                        <span className="text-[13px] text-white font-medium">Send</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex gap-2 items-center">
                                            <kbd className="text-[11px] font-mono text-white bg-white/10 px-2 py-1.5 rounded border border-white/20">SHIFT</kbd>
                                            <kbd className="text-[11px] font-mono text-white bg-white/10 px-2 py-1.5 rounded border border-white/20">ENT</kbd>
                                        </div>
                                        <span className="text-[13px] text-white font-medium">New Line</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-10 py-8 bg-white/[0.02] border-t border-white/10 flex justify-end">
                            <button 
                                onClick={() => setShowHelp(false)}
                                className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white text-[12px] font-black rounded-xl transition-all border border-white/20 uppercase tracking-widest"
                            >
                                Dismiss Guide
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

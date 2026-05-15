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
                        <button onClick={() => onDelete(entry.id)} className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 size={16} /></button>
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
                        <div className="text-[10px] font-black text-white/30 uppercase mb-2 flex justify-between tracking-widest"><span>{formatTime(c.created_at)}</span><button onClick={() => onDelete(c.id)} className="opacity-0 group-hover/annot:opacity-100 hover:text-red-400 transition-all"><Trash2 size={12} /></button></div>
                        <div className="text-[16px] text-white/80 leading-relaxed font-normal tracking-tight">
                            <ScientificText text={c.content} onTagClick={onTagClick} />
                        </div>
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

export default function LogbookView({ groupId }: { groupId: string }) {
    const [entries, setEntries] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [allActiveDates, setAllActiveDates] = useState<string[]>([]);
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [hasMoreDown, setHasMoreDown] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [lightbox, setLightbox] = useState<{ url: string, type: string } | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
    const ITEMS_PER_PAGE = 50;
    const bottomRef = useRef<HTMLDivElement>(null);
    const supabase = createClient();

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
        const { data } = await supabase
            .from('logbook_entries')
            .select('created_at')
            .eq('group_id', groupId)
            .is('parent_id', null)
            .order('created_at', { ascending: false });
        
        if (data) {
            const dates = Array.from(new Set(data.map(e => format(parseISO(e.created_at), 'yyyy-MM-dd'))));
            setAllActiveDates(dates);
        }
    };

    const fetchEntries = async (isInitial = true, jumpDate?: string, direction: 'up' | 'down' = 'up') => {
        if (!isInitial) setIsLoadingMore(true);
        if (jumpDate) setIsReady(false); // Hide during jump
        
        let query = supabase
            .from('logbook_entries')
            .select('*')
            .eq('group_id', groupId)
            .limit(ITEMS_PER_PAGE);

        if (jumpDate) {
            // Fetch entries before the selected jump date
            query = query.lte('created_at', `${jumpDate}T23:59:59`).order('created_at', { ascending: false });
        } else if (direction === 'up' && entries.length > 0) {
            const oldestDate = entries[0].created_at;
            query = query.lt('created_at', oldestDate).order('created_at', { ascending: false });
        } else if (direction === 'down' && entries.length > 0) {
            const newestDate = entries[entries.length - 1].created_at;
            query = query.gt('created_at', newestDate).order('created_at', { ascending: true });
        } else {
            // Default latest entries
            query = query.order('created_at', { ascending: false });
        }

        const { data } = await query;
        
        if (data) {
            const sortedData = [...data].sort((a, b) => a.created_at.localeCompare(b.created_at));
            
            if (isInitial || jumpDate) {
                setEntries(sortedData);
                setHasMore(data.length === ITEMS_PER_PAGE);
                // Check if we need a 'Load Newer' button
                if (jumpDate) {
                    const { count } = await supabase.from('logbook_entries').select('*', { count: 'exact', head: true }).eq('group_id', groupId).gt('created_at', data[0]?.created_at || '');
                    setHasMoreDown(!!count && count > data.length);
                } else {
                    setHasMoreDown(false);
                }
            } else if (direction === 'up') {
                setEntries(prev => {
                    const existingIds = new Set(prev.map(e => e.id));
                    const uniqueNew = sortedData.filter(e => !existingIds.has(e.id));
                    return [...uniqueNew, ...prev];
                });
                setHasMore(data.length === ITEMS_PER_PAGE);
            } else if (direction === 'down') {
                setEntries(prev => {
                    const existingIds = new Set(prev.map(e => e.id));
                    const uniqueNew = sortedData.filter(e => !existingIds.has(e.id));
                    const newList = [...prev, ...uniqueNew];
                    return newList;
                });
                setHasMoreDown(data.length === ITEMS_PER_PAGE);
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
        const lastEntryId = entries[entries.length - 1]?.id;
        if (lastEntryId) {
            bottomRef.current?.scrollIntoView({ behavior: 'auto' });
            if (!isReady) setIsReady(true);
        }
    }, [entries[entries.length - 1]?.id]);

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
            .filter(e => !activeTag || e.content?.includes(activeTag));
            
        const groups: any[] = [];
        filtered.forEach((entry) => {
            const lastGroup = groups[groups.length - 1];
            const entryMedia = (entry.media_files || []).map((f: any) => ({ ...f, parent_entry_id: entry.id }));
            const isMediaOnly = !entry.content || entry.content.trim() === '';
            const shouldGroup = lastGroup && isMediaOnly && differenceInMinutes(parseISO(entry.created_at), parseISO(lastGroup.created_at)) === 0;
            const date = format(parseISO(entry.created_at), 'yyyy-MM-dd');
            if (shouldGroup) { 
                lastGroup.media_files = [...(lastGroup.media_files || []), ...entryMedia]; 
                lastGroup.entries.push(entry);
            } else { 
                groups.push({ date, created_at: entry.created_at, entries: [entry], media_files: entryMedia, isMediaOnly }); 
            }
        });
        return groups;
    }, [entries, activeTag]);


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
        } else {
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
    const handleUpdate = async (id: string, text: string) => { await fetch('/api/logbook/update', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, text, groupId }) }); };
    const handleDelete = async (id: string) => { if (!window.confirm("Delete?")) return; setEntries(prev => prev.filter(e => e.id !== id)); await fetch('/api/logbook/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, groupId }) }); };
    const handleSend = async (text: string, parentId?: string) => { 
        if (!text.trim()) return; 
        await fetch('/api/logbook/send', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ text, groupId, parentId }) 
        });
        fetchEntries();
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
                    <div className="flex items-center gap-4">
                        <NotebookPen size={18} className="text-blue-500" />
                        <div className="flex items-center gap-3">
                            <h1 className="text-[12px] font-black tracking-[0.3em] text-white/40 uppercase">Project Notebook</h1>
                            <button 
                                onClick={() => setShowHelp(true)} 
                                className="p-1 text-white hover:text-blue-500 transition-all hover:scale-110 active:scale-95"
                                title="View Guide"
                            >
                                <HelpCircle size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className={cn("flex-1 overflow-y-auto px-16 py-8 custom-scroll", !isReady && "invisible")}>
                    <div className="max-w-6xl mx-auto space-y-12">
                        {hasMoreDown && (
                            <div className="flex justify-center py-4">
                                <button onClick={() => fetchEntries(false, undefined, 'down')} disabled={isLoadingMore} className="px-6 py-2 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600/20 transition-all disabled:opacity-50">
                                    {isLoadingMore ? <Loader2 className="animate-spin" size={14} /> : "Load Newer Entries"}
                                </button>
                            </div>
                        )}

                        {visualGroups.map((group, idx) => (
                            <div key={`${group.date}-${idx}`} className="space-y-6">
                                <div className="sticky top-0 z-10 flex items-center gap-6 py-4 bg-transparent backdrop-blur-sm">
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/[0.05]" />
                                    <h2 className="text-[12px] font-black text-white tracking-[0.4em] uppercase opacity-90 drop-shadow-lg">{formatDateHeader(group.date)}</h2>
                                    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/[0.05]" />
                                </div>
                                <div className="space-y-2">
                                    {group.entries.map((entry: any) => (
                                        <LogEntry 
                                            key={entry.id} 
                                            entry={entry} 
                                            groupId={groupId}
                                            comments={entries.filter(e => e.parent_id === entry.id)}
                                            tasks={tasks}
                                            onImageClick={(url: string, type: string) => setLightbox({ url, type })}
                                            onUpdate={handleUpdate}
                                            onDelete={handleDelete}
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
                </div>

                <div className="absolute bottom-10 left-0 right-0 px-16 pointer-events-none">
                    <div className="max-w-2xl mx-auto bg-[#1e1f20] border border-white/10 rounded-[40px] p-5 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.8)] pointer-events-auto flex items-center gap-5 group focus-within:border-blue-500/30 transition-all">
                        <Plus size={24} className="text-white/20 ml-2 hover:text-white transition-colors cursor-pointer" />
                        <textarea 
                            onKeyDown={(e) => { 
                                if (e.key === 'Enter' && !e.shiftKey) { 
                                    e.preventDefault(); 
                                    const val = (e.target as any).value;
                                    handleSend(val); 
                                    (e.target as any).value = ''; 
                                } 
                            }} 
                            placeholder="Start typing (#tag, SiO_2)..." 
                            className="flex-1 bg-transparent border-none outline-none resize-none py-3.5 text-[18px] text-white font-medium" 
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
                            className="p-3.5 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-all"
                        >
                            <SendHorizontal size={22} />
                        </button>
                    </div>
                </div>
            </div>

            {lightbox && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/98 backdrop-blur-3xl animate-in fade-in" onClick={() => setLightbox(null)}>
                    <button className="absolute top-10 right-10 text-white/40 hover:text-white"><X size={44} /></button>
                    {lightbox.type === 'video' ? <video src={lightbox.url} controls autoPlay className="max-w-[95%] max-h-[90vh] rounded-3xl" onClick={e => e.stopPropagation()} /> : <img src={lightbox.url} className="max-w-[95%] max-h-[90vh] object-contain rounded-3xl" />}
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

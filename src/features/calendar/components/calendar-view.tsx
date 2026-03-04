'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Plus, X, Loader2, Clock, MapPin, CalendarDays, CheckSquare,
    PanelRightClose, PanelRightOpen, Trash2, ChevronLeft, ChevronRight, ChevronDown,
    Pencil, Link as LinkIcon, FileText
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { createCalendarEventAction, updateCalendarEventAction, deleteCalendarEventAction, getCalendarEventsAction } from '../actions';

// FullCalendar imports
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import multiMonthPlugin from '@fullcalendar/multimonth';
import esLocale from '@fullcalendar/core/locales/es';

/* ─────────────────── Types ─────────────────────────────── */
interface Task {
    id: string; title: string; due_date: string | null;
    status: string; priority: string | null;
}
interface LocalEvent {
    id: string; title: string; description?: string | null;
    location?: string | null; url?: string | null; all_day: boolean;
    start_at: string; end_at: string; color: string;
    creator?: { full_name: string | null } | null;
}
interface CalendarViewProps {
    groupId: string; groupName: string;
    calendarId: string | null; tasks: Task[];
}

const COLOR_MAP: Record<string, string> = {
    indigo: '#6366f1',
    sky: '#0ea5e9',
    emerald: '#10b981',
    violet: '#8b5cf6',
    rose: '#f43f5e',
    amber: '#f59e0b',
    slate: '#64748b',
};

const COLOR_CHIP: Record<string, string> = {
    indigo: 'bg-indigo-500',
    sky: 'bg-sky-500',
    emerald: 'bg-emerald-500',
    violet: 'bg-violet-500',
    rose: 'bg-rose-500',
    amber: 'bg-amber-500',
    slate: 'bg-slate-500',
};
const COLORS = Object.keys(COLOR_CHIP);

function isoToLocal(iso: string) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function toYMD(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

/* ═══════════════════ Component ══════════════════════════ */
export function CalendarView({ groupId, groupName, tasks }: CalendarViewProps) {
    const calendarRef = useRef<FullCalendar>(null);
    const today = new Date();

    const [localEvents, setLocalEvents] = useState<LocalEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);

    // UI State
    const [panelOpen, setPanelOpen] = useState(true);
    const [viewMode, setViewMode] = useState('dayGridMonth');
    const [viewTitle, setViewTitle] = useState('');

    // Load saved view on mount
    useEffect(() => {
        const savedView = localStorage.getItem('phdnexus-calendar-view');
        if (savedView) {
            setViewMode(savedView);
            // Fullcalendar API might need a tick before view update works manually
            setTimeout(() => {
                calendarRef.current?.getApi().changeView(savedView);
                updateTitle();
            }, 50);
        }
    }, []);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editEventId, setEditEventId] = useState<string | null>(null);

    const [formDate, setFormDate] = useState('');
    const [formEndDate, setFormEndDate] = useState(''); // for multiday
    const [formTitle, setFormTitle] = useState('');
    const [formStart, setFormStart] = useState('09:00');
    const [formEnd, setFormEnd] = useState('10:00');
    const [formAllDay, setFormAllDay] = useState(false);
    const [formLocation, setFormLocation] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formColor, setFormColor] = useState('indigo');
    const [creating, setCreating] = useState(false);

    // Detail state
    const [selectedItem, setSelectedItem] = useState<any>(null); // custom event wrapper

    /* ── Fetch local events ── */
    const fetchLocal = useCallback(async () => {
        setLoadingEvents(true);
        // Fetch a wide range (3 months back, 3 months forward)
        const year = today.getFullYear(), month = today.getMonth();
        const from = new Date(year, month - 3, 1).toISOString();
        const to = new Date(year, month + 3, 0, 23, 59, 59).toISOString();
        const res = await getCalendarEventsAction(groupId, from, to);
        if (res.data) setLocalEvents(res.data as LocalEvent[]);
        setLoadingEvents(false);
    }, [groupId]);

    useEffect(() => { fetchLocal(); }, [fetchLocal]);

    /* ── FullCalendar Events array ── */
    const calendarData = useMemo(() => {
        const data: any[] = [];
        // Tasks
        tasks.filter(t => t.due_date && t.status !== 'done').forEach(t => {
            data.push({
                id: `task-${t.id}`,
                title: t.title,
                start: t.due_date,
                allDay: true,
                backgroundColor: COLOR_MAP.amber,
                borderColor: '#d97706',
                textColor: '#ffffff',
                extendedProps: { type: 'task', original: t }
            });
        });
        // Database Events
        localEvents.forEach(e => {
            data.push({
                id: `evt-${e.id}`,
                title: e.title,
                start: e.start_at,
                end: e.end_at,
                allDay: e.all_day,
                backgroundColor: COLOR_MAP[e.color || 'indigo'],
                borderColor: COLOR_MAP[e.color || 'indigo'],
                textColor: '#ffffff',
                extendedProps: { type: 'event', original: e }
            });
        });
        return data;
    }, [tasks, localEvents]);

    /* ── Side panel upcoming list ── */
    const upcomingPanel = useMemo(() => {
        const items: any[] = [];
        const todayStr = toYMD(today);

        tasks.filter(t => t.due_date && t.status !== 'done' && t.due_date >= todayStr).forEach(t => {
            items.push({ id: `task-${t.id}`, type: 'task', title: t.title, dateStr: t.due_date, color: 'amber', original: t });
        });
        localEvents.filter(e => e.start_at >= todayStr).forEach(e => {
            items.push({
                id: `evt-${e.id}`, type: 'event', title: e.title,
                dateStr: new Date(e.start_at).toLocaleDateString('en-CA'), // Get local YYYY-MM-DD
                startTime: e.all_day ? undefined : isoToLocal(e.start_at),
                color: e.color, original: e
            });
        });
        return items.sort((a, b) => a.dateStr.localeCompare(b.dateStr)).slice(0, 30);
    }, [tasks, localEvents]);

    /* ── Actions ── */
    const handleCreate = async () => {
        if (!formTitle || !formDate) { toast.error('Título y fecha son obligatorios'); return; }
        setCreating(true);
        const startAtStr = formAllDay ? `${formDate}T12:00:00Z` : `${formDate}T${formStart}:00`;
        const endAtStr = formAllDay ? `${formEndDate || formDate}T13:00:00Z` : `${formEndDate || formDate}T${formEnd}:00`;

        const payload = {
            groupId, title: formTitle, description: formDesc || undefined,
            location: formLocation || undefined, url: formUrl || undefined,
            allDay: formAllDay,
            startAt: formAllDay ? startAtStr : new Date(startAtStr).toISOString(),
            endAt: formAllDay ? endAtStr : new Date(endAtStr).toISOString(),
            color: formColor,
        };

        let res;
        if (isEditing && editEventId) {
            res = await updateCalendarEventAction(editEventId, payload);
        } else {
            res = await createCalendarEventAction(payload);
        }

        if (res.error) { toast.error(res.error); }
        else {
            toast.success(isEditing ? 'Evento actualizado ✓' : 'Evento creado ✓');
            setShowForm(false);
            setFormTitle(''); setFormLocation(''); setFormDesc(''); setFormUrl(''); setFormAllDay(false);
            setIsEditing(false); setEditEventId(null);
            fetchLocal();
        }
        setCreating(false);
    };

    const handleEditClick = () => {
        if (!selectedItem || selectedItem.type !== 'event') return;
        setFormTitle(selectedItem.title);
        setFormDate(selectedItem.dateStr);
        setFormEndDate(selectedItem.endDateStr || selectedItem.dateStr);
        if (!selectedItem.startTime && !selectedItem.endTime) {
            setFormAllDay(true);
            setFormStart('09:00');
            setFormEnd('10:00');
        } else {
            setFormAllDay(false);
            setFormStart(selectedItem.startTime || '09:00');
            setFormEnd(selectedItem.endTime || '10:00');
        }
        setFormLocation(selectedItem.location || '');
        setFormDesc(selectedItem.description || '');
        setFormUrl(selectedItem.url || '');
        setFormColor(selectedItem.color || 'indigo');
        setIsEditing(true);
        setEditEventId(selectedItem.eventId);
        setSelectedItem(null);
        setShowForm(true);
    };

    const handleDelete = async (eventId: string) => {
        if (!confirm('¿Eliminar este evento?')) return;
        const res = await deleteCalendarEventAction(eventId, groupId);
        if (res.error) toast.error(res.error);
        else { toast.success('Evento eliminado'); setSelectedItem(null); fetchLocal(); }
    };

    /* ── FullCalendar handlers ── */
    const handleDateSelect = (info: any) => {
        setSelectedItem(null);
        setFormDate(info.startStr.slice(0, 10));

        let endD = new Date(info.end);
        if (info.allDay) endD.setDate(endD.getDate() - 1); // FullCalendar end is exclusive for allDay drops
        setFormEndDate(toYMD(endD));

        if (!info.allDay) {
            setFormStart(info.startStr.slice(11, 16));
            setFormEnd(info.endStr.slice(11, 16));
            setFormAllDay(false);
        } else {
            setFormStart('09:00');
            setFormEnd('10:00');
            setFormAllDay(true);
        }

        // Reset form for create
        setIsEditing(false);
        setEditEventId(null);
        setFormTitle(''); setFormLocation(''); setFormDesc(''); setFormUrl('');
        setShowForm(true);

        // Clear selection to avoid persistent visual highlight
        calendarRef.current?.getApi().unselect();
    };

    const handleNewButtonClick = () => {
        setFormDate(toYMD(today));
        setFormEndDate(toYMD(today));
        setIsEditing(false);
        setEditEventId(null);
        setFormTitle(''); setFormLocation(''); setFormDesc(''); setFormUrl(''); setFormAllDay(false);
        setShowForm(true);
        setSelectedItem(null);
    };

    const handleEventClick = (info: any) => {
        const ev = info.event;
        const extended = ev.extendedProps;
        if (extended.type === 'task') {
            setSelectedItem({
                type: 'task', title: ev.title, dateStr: ev.startStr.slice(0, 10),
                color: 'amber', taskId: extended.original.id
            });
        } else {
            setSelectedItem({
                type: 'event', title: ev.title, dateStr: ev.startStr.slice(0, 10),
                endDateStr: ev.endStr ? ev.endStr.slice(0, 10) : ev.startStr.slice(0, 10),
                startTime: ev.allDay ? null : isoToLocal(extended.original.start_at),
                endTime: ev.allDay ? null : isoToLocal(extended.original.end_at),
                location: extended.original.location,
                description: extended.original.description,
                url: extended.original.url,
                color: extended.original.color, eventId: extended.original.id
            });
        }
        setShowForm(false);
    };

    /* ── UI Navigation ── */
    const updateTitle = () => {
        const title = calendarRef.current?.getApi().view.title;
        if (title) setViewTitle(title);
    };
    const changeView = (mode: string) => {
        calendarRef.current?.getApi().changeView(mode);
        setViewMode(mode);
        localStorage.setItem('phdnexus-calendar-view', mode);
        updateTitle();
    };
    const nav = (action: 'prev' | 'next' | 'today') => {
        calendarRef.current?.getApi()[action]();
        updateTitle();
        setSelectedItem(null);
    };

    const sidePanelItemClick = (item: any) => {
        if (item.type === 'task') {
            setSelectedItem({
                type: 'task', title: item.title, dateStr: item.dateStr,
                color: 'amber', taskId: item.original.id
            });
        } else {
            setSelectedItem({
                type: 'event', title: item.title, dateStr: item.dateStr,
                endDateStr: item.original.end_at ? item.original.end_at.slice(0, 10) : item.dateStr,
                startTime: item.original.all_day ? null : isoToLocal(item.original.start_at),
                endTime: item.original.all_day ? null : isoToLocal(item.original.end_at),
                location: item.original.location,
                description: item.original.description,
                url: item.original.url,
                color: item.original.color, eventId: item.original.id
            });
        }
        setShowForm(false);
        calendarRef.current?.getApi().gotoDate(item.dateStr);
    };

    useEffect(() => {
        // Initial title set
        setTimeout(updateTitle, 100);
    }, []);

    // Global classes overrides for FullCalendar in this scope
    const fcStyles = `
        .fc { --fc-border-color: #e2e8f0; --fc-button-bg-color: transparent; --fc-button-border-color: transparent; --fc-page-bg-color: #ffffff; }
        .fc .fc-col-header-cell-cushion { color: #64748b; font-size: 0.75rem; text-transform: uppercase; padding: 8px 4px; font-weight: 600; }
        .fc .fc-daygrid-day-number { color: #334155; font-size: 0.875rem; font-weight: 500; padding: 4px 8px; }
        .fc .fc-daygrid-day.fc-day-today { background-color: #f5f3ff !important; }
        .fc .fc-day-today .fc-daygrid-day-number { color: #4f46e5; font-weight: 700; }
        .fc-timegrid-slot-label-cushion { font-size: 0.7rem; color: #94a3b8; }
        .fc-theme-standard .fc-scrollgrid { border: none !important; }
        .fc-theme-standard th { border-top: none !important; border-left: none !important; border-right: none !important; }
        .fc-theme-standard td, .fc-theme-standard th { border-color: #f1f5f9; }
        .fc-event { border-radius: 4px; padding: 1px 3px; font-size: 0.7rem; font-weight: 500; cursor: pointer; border: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .fc-timegrid-event { padding: 2px 4px; overflow: hidden; }
        .fc-timeline-event { padding: 2px 4px; }
        .fc .fc-list-event:hover td { background-color: #f8fafc; cursor: pointer; }
    `;

    return (
        <div className="h-full p-4 flex flex-col gap-3">
            <style>{fcStyles}</style>

            <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-0">
                {/* ── Top bar ── */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-0.5">
                            <button onClick={() => nav('prev')} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors"><ChevronLeft size={18} /></button>
                            <button onClick={() => nav('next')} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors"><ChevronRight size={18} /></button>
                        </div>
                        <button onClick={() => nav('today')} className="px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Hoy</button>
                        <h2 className="text-base font-bold text-slate-900 min-w-[200px] capitalize">{viewTitle || 'Calendario'}</h2>
                        {loadingEvents && <Loader2 size={14} className="animate-spin text-slate-400" />}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Custom view switcher */}
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            {[
                                { id: 'multiMonthYear', label: 'Año' },
                                { id: 'dayGridMonth', label: 'Mes' },
                                { id: 'timeGridWeek', label: 'Semana' },
                                { id: 'timeGridDay', label: 'Día' },
                                { id: 'listMonth', label: 'Agenda' }
                            ].map(v => (
                                <button key={v.id} onClick={() => changeView(v.id)}
                                    className={cn('px-3 py-1 text-xs font-medium rounded-md transition-colors', viewMode === v.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50')}>
                                    {v.label}
                                </button>
                            ))}
                        </div>

                        <div className="w-px h-6 bg-slate-200 mx-1" />

                        <button onClick={handleNewButtonClick}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm">
                            <Plus size={14} /> Nuevo
                        </button>

                        <button onClick={() => setPanelOpen(p => !p)}
                            className={cn('p-1.5 rounded-lg transition-colors border', panelOpen ? 'text-indigo-600 bg-indigo-50 border-indigo-100' : 'text-slate-500 hover:bg-slate-100 border-transparent')}>
                            {panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                        </button>
                    </div>
                </div>

                {/* ── Calendar Body ── */}
                <div className="flex-1 flex overflow-hidden">
                    {/* FullCalendar wrapper */}
                    <div className="flex-1 overflow-hidden min-w-0 flex flex-col [&>div]:flex-1 bg-white">
                        <FullCalendar
                            ref={calendarRef}
                            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin, multiMonthPlugin]}
                            initialView="dayGridMonth"
                            locales={[esLocale]}
                            locale="es"
                            headerToolbar={false} // Custom toolbar above
                            events={calendarData}
                            selectable={true}
                            selectMirror={true}
                            dayMaxEvents={true}
                            nowIndicator={true}
                            slotMinTime="06:00:00" // start display a bit later
                            select={handleDateSelect}
                            eventClick={handleEventClick}
                            height="100%"
                            // Configuration for multiMonthYear
                            multiMonthMaxColumns={3}
                            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: false }}
                        />
                    </div>

                    {/* Side Panel */}
                    {panelOpen && (
                        <div className="w-80 shrink-0 border-l border-slate-200 flex flex-col bg-slate-50/50 overflow-hidden shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)] z-10">

                            {/* Form (Create / Edit) */}
                            {showForm && (
                                <div className="border-b border-slate-200 p-5 bg-white shrink-0 shadow-sm overflow-y-auto max-h-[75vh]">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-bold text-slate-800">{isEditing ? 'Editar evento' : 'Crear evento'}</h3>
                                        <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700 p-1 hover:bg-slate-100 rounded-md"><X size={14} /></button>
                                    </div>
                                    <div className="space-y-3">
                                        <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Título del evento *" autoFocus
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500" />

                                        <div className="flex items-center gap-2">
                                            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                                                className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-indigo-500" />
                                            {formEndDate !== formDate && (
                                                <>
                                                    <span className="text-slate-400 text-xs">a</span>
                                                    <input type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)}
                                                        className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-indigo-500" />
                                                </>
                                            )}
                                        </div>

                                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer p-1 rounded hover:bg-slate-50 -ml-1">
                                            <input type="checkbox" checked={formAllDay} onChange={e => setFormAllDay(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5" />
                                            Todo el día
                                        </label>

                                        {!formAllDay && (
                                            <div className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                <Clock size={14} className="text-slate-400 shrink-0" />
                                                <input type="time" value={formStart} onChange={e => setFormStart(e.target.value)}
                                                    className="flex-1 border border-slate-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 bg-white" />
                                                <span className="text-slate-400 text-xs font-medium">→</span>
                                                <input type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)}
                                                    className="flex-1 border border-slate-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 bg-white" />
                                            </div>
                                        )}

                                        <div className="relative">
                                            <MapPin size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                                            <input value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="Añadir lugar"
                                                className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-indigo-500" />
                                        </div>

                                        <div className="relative">
                                            <LinkIcon size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                                            <input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="Añadir enlace (URL)" type="url"
                                                className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-indigo-500" />
                                        </div>

                                        <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Descripción o notas..." rows={3}
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-indigo-500" />

                                        {/* Color picker */}
                                        <div className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                                            <span className="text-[11px] font-medium text-slate-500 mr-1">Color:</span>
                                            {COLORS.map(c => (
                                                <button key={c} onClick={() => setFormColor(c)}
                                                    className={cn('w-5 h-5 rounded-full border-2 transition-all', COLOR_CHIP[c], formColor === c ? 'border-slate-800 scale-110 shadow-sm' : 'border-transparent opacity-80 hover:opacity-100')} />
                                            ))}
                                        </div>

                                        <button onClick={handleCreate} disabled={creating || !formTitle || !formDate}
                                            className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
                                            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                            {isEditing ? 'Guardar cambios' : 'Crear evento'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Event detail */}
                            {selectedItem && !showForm && (
                                <div className="border-b border-slate-200 p-5 bg-white shrink-0 shadow-sm animate-in fade-in slide-in-from-right-4 duration-200 max-h-[75vh] overflow-y-auto">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
                                            <span className={cn('w-3 h-3 rounded-full shrink-0 mt-1', COLOR_CHIP[selectedItem.color || 'indigo'])} />
                                            <h3 className="text-sm font-bold text-slate-900 leading-snug break-words">{selectedItem.title}</h3>
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0 -mt-1 -mr-2">
                                            {selectedItem.type === 'event' && selectedItem.eventId && (
                                                <>
                                                    <button onClick={handleEditClick} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Editar"><Pencil size={14} /></button>
                                                    <button onClick={() => handleDelete(selectedItem.eventId!)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Eliminar"><Trash2 size={14} /></button>
                                                </>
                                            )}
                                            <button onClick={() => setSelectedItem(null)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"><X size={14} /></button>
                                        </div>
                                    </div>
                                    <div className="pl-6 space-y-2">
                                        <p className="text-xs text-slate-600 flex items-center gap-2">
                                            <CalendarDays size={12} className="text-slate-400 mt-0.5 shrink-0" />
                                            <span className="leading-tight">
                                                {new Date(selectedItem.dateStr + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                                                {selectedItem.startTime && <span className="font-medium text-slate-800 ml-1">· {selectedItem.startTime}{selectedItem.endTime && ` - ${selectedItem.endTime}`}</span>}
                                            </span>
                                        </p>
                                        {selectedItem.location && <p className="text-xs text-slate-600 flex items-start gap-2"><MapPin size={12} className="text-slate-400 mt-0.5 shrink-0" /><span className="leading-tight break-words">{selectedItem.location}</span></p>}

                                        {selectedItem.url && (
                                            <p className="text-xs flex items-start gap-2">
                                                <LinkIcon size={12} className="text-slate-400 mt-0.5 shrink-0" />
                                                <a href={selectedItem.url.startsWith('http') ? selectedItem.url : `https://${selectedItem.url}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline leading-tight break-words min-w-0 flex-1">
                                                    {selectedItem.url}
                                                </a>
                                            </p>
                                        )}

                                        {selectedItem.description && (
                                            <div className="text-xs text-slate-600 flex items-start gap-2 pt-1">
                                                <FileText size={12} className="text-slate-400 mt-0.5 shrink-0" />
                                                <p className="whitespace-pre-wrap leading-relaxed flex-1 min-w-0">{selectedItem.description}</p>
                                            </div>
                                        )}

                                        {selectedItem.type === 'task' && (
                                            <div className="pt-2">
                                                <Link href={`/${groupId}/tasks`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-md transition-colors">
                                                    <CheckSquare size={12} /> Ir a la tarea
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Upcoming list */}
                            <div className="px-5 pt-4 pb-2 shrink-0 bg-slate-50/50">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Próximos en agenda</p>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {upcomingPanel.length === 0 ? (
                                    <div className="py-10 flex flex-col items-center justify-center text-slate-400 gap-2">
                                        <CalendarDays size={24} className="opacity-20" />
                                        <p className="text-xs">Todo despejado</p>
                                    </div>
                                ) : (
                                    <ul className="divide-y divide-slate-100">
                                        {upcomingPanel.map(item => {
                                            const d = new Date(item.dateStr + 'T12:00');
                                            const diff = Math.round((d.getTime() - new Date(toYMD(today)).getTime()) / 86400_000);
                                            const label = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

                                            // Ensure uniqueness if same ID appears due to multiday overlap conceptually (shouldn't happen here but safe key)
                                            return (
                                                <li key={`${item.type}-${item.id}`}>
                                                    <button onClick={() => sidePanelItemClick(item)}
                                                        className="w-full text-left px-5 py-3 hover:bg-white focus:bg-white transition-colors flex items-start gap-3 group">
                                                        <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0 shadow-sm border border-black/5', COLOR_CHIP[item.color || 'indigo'])} />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-semibold text-slate-700 group-hover:text-indigo-700 truncate transition-colors">{item.title}</p>
                                                            <div className="flex items-center gap-1.5 mt-1">
                                                                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-sm", diff === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500')}>
                                                                    {label}
                                                                </span>
                                                                {item.startTime && <span className="text-[10px] text-slate-500 font-mono">{item.startTime}</span>}
                                                                {item.type === 'task' && <span className="text-[9px] uppercase font-bold text-amber-600 tracking-wider">Task</span>}
                                                            </div>
                                                        </div>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>

                            {/* Legend */}
                            <div className="border-t border-slate-200 px-5 py-3 bg-white shrink-0 flex items-center justify-center gap-6">
                                <span className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500"><span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]" /> Eventos</span>
                                <span className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500"><span className="w-2 h-2 rounded-full bg-amber-500 shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]" /> Tareas</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

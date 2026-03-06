'use client';

import { CalendarDays, Clock, MapPin, ExternalLink } from 'lucide-react';
import { cn, formatMonthShort, formatDayNumeric, formatDayLong, formatTimeShort } from '@/lib/utils';
import Link from 'next/link';

interface CalendarEvent {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    all_day: boolean;
    location: string | null;
    url: string | null;
    color: string | null;
}

const COLOR_CHIP: Record<string, string> = {
    indigo: 'bg-indigo-500',
    sky: 'bg-sky-500',
    emerald: 'bg-emerald-500',
    violet: 'bg-violet-500',
    rose: 'bg-rose-500',
    amber: 'bg-amber-500',
    slate: 'bg-slate-500',
};

function formatEventTime(isoString: string): string {
    return formatTimeShort(isoString);
}

function getRelativeDayLabel(dateString: string): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Parse the date in local time
    const date = new Date(dateString);
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const diffMs = dateOnly.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7 && diffDays > 1) {
        return formatDayLong(date);
    }
    return `${formatMonthShort(date)} ${formatDayNumeric(date)}`;
}

export function NextMeetingsWidget({ groupId, events }: { groupId: string, events: CalendarEvent[] }) {
    // Process events 
    const upcomingEvents = events.filter(e => {
        const today = new Date().toISOString().slice(0, 10);
        return e.start_at.slice(0, 10) >= today;
    }).slice(0, 4); // Only show next 4

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col h-[350px] shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-slate-800 shrink-0">
                <CalendarDays size={18} className="text-violet-600" />
                <h3 className="font-semibold">Upcoming Events</h3>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-thin scrollbar-thumb-slate-200">
                {upcomingEvents.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                        <CalendarDays size={32} className="opacity-20" />
                        <p className="text-sm">No upcoming events</p>
                    </div>
                ) : (
                    upcomingEvents.map(event => {
                        const isToday = getRelativeDayLabel(event.start_at) === 'Today';

                        return (
                            <Link key={event.id} href={`/${groupId}/calendar`} className="block group">
                                <div className="p-3 bg-white border border-slate-100 hover:border-violet-200 rounded-lg shadow-sm transition-all hover:shadow-md flex items-start gap-3">
                                    <div className="shrink-0 flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded-md w-12 h-12">
                                        <span className={cn("text-xs font-bold uppercase", isToday ? "text-violet-600" : "text-slate-500")}>
                                            {formatMonthShort(event.start_at)}
                                        </span>
                                        <span className="text-lg font-bold text-slate-800 leading-none">
                                            {formatDayNumeric(event.start_at)}
                                        </span>
                                    </div>

                                    <div className="flex-1 min-w-0 pt-0.5">
                                        <div className="flex items-start gap-1.5">
                                            <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', COLOR_CHIP[event.color || 'indigo'])} />
                                            <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-violet-700 transition-colors">
                                                {event.title}
                                            </p>
                                        </div>

                                        <div className="pl-3.5 space-y-1 mt-1">
                                            <div className="flex items-center gap-2 text-[11px] font-medium">
                                                <span className={cn("px-1.5 rounded-sm", isToday ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500")}>
                                                    {getRelativeDayLabel(event.start_at)}
                                                </span>
                                                {!event.all_day && (
                                                    <span className="text-slate-500 flex items-center gap-1">
                                                        <Clock size={10} /> {formatEventTime(event.start_at)}
                                                    </span>
                                                )}
                                            </div>

                                            {(event.location || event.url) && (
                                                <div className="flex flex-col gap-0.5 mt-0.5 text-[11px] text-slate-400">
                                                    {event.location && (
                                                        <div className="flex items-center gap-1 truncate">
                                                            <MapPin size={10} className="shrink-0" />
                                                            <span className="truncate">{event.location}</span>
                                                        </div>
                                                    )}
                                                    {event.url && (
                                                        <div className="flex items-center gap-1 truncate">
                                                            <ExternalLink size={10} className="shrink-0" />
                                                            <span className="truncate text-violet-500">{event.url}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })
                )}
            </div>

            <div className="pt-3 shrink-0 border-t border-slate-100 mt-2 text-center">
                <Link href={`/${groupId}/calendar`} className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors">
                    Open full calendar →
                </Link>
            </div>
        </div>
    );
}

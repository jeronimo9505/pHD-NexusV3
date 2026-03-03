'use client';

import { Search, Calendar, Filter, Star, Layers, FileText, Presentation, StickyNote } from 'lucide-react';
import { ReportType, ReportStatus } from '../types';
import { cn } from '@/lib/utils';

interface ReportFiltersProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    typeFilter: ReportType | 'all';
    onTypeFilterChange: (type: ReportType | 'all') => void;
    statusFilter: ReportStatus | 'all';
    onStatusFilterChange: (status: ReportStatus | 'all') => void;
    dateFilter: string;
    onDateFilterChange: (date: string) => void;
    showImportantOnly: boolean;
    onToggleImportant: () => void;
    availablePeriods: string[];
}

export function ReportFilters({
    searchQuery,
    onSearchChange,
    typeFilter,
    onTypeFilterChange,
    statusFilter,
    onStatusFilterChange,
    dateFilter,
    onDateFilterChange,
    showImportantOnly,
    onToggleImportant,
    availablePeriods,
}: ReportFiltersProps) {
    return (
        <div className="space-y-4">
            {/* Type Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200">
                <button
                    onClick={() => onTypeFilterChange('all')}
                    className={cn(
                        "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
                        typeFilter === 'all'
                            ? "border-indigo-600 text-indigo-600"
                            : "border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-t-lg"
                    )}
                >
                    <Layers className="w-4 h-4" />
                    All
                </button>
                <button
                    onClick={() => onTypeFilterChange('report')}
                    className={cn(
                        "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
                        typeFilter === 'report'
                            ? "border-indigo-600 text-indigo-600"
                            : "border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-t-lg"
                    )}
                >
                    <FileText className="w-4 h-4" />
                    Reports
                </button>
                <button
                    onClick={() => onTypeFilterChange('ppt')}
                    className={cn(
                        "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
                        typeFilter === 'ppt'
                            ? "border-indigo-600 text-indigo-600"
                            : "border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-t-lg"
                    )}
                >
                    <Presentation className="w-4 h-4" />
                    PPTs
                </button>
                <button
                    onClick={() => onTypeFilterChange('meeting_note')}
                    className={cn(
                        "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
                        typeFilter === 'meeting_note'
                            ? "border-indigo-600 text-indigo-600"
                            : "border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-t-lg"
                    )}
                >
                    <StickyNote className="w-4 h-4" />
                    Meeting Notes
                </button>
            </div>

            {/* Search and Filters Bar */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by title, content..."
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                </div>

                {/* Date Filter */}
                <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <select
                        value={dateFilter}
                        onChange={(e) => onDateFilterChange(e.target.value)}
                        className="bg-transparent text-sm font-medium text-slate-600 outline-none cursor-pointer hover:text-indigo-600"
                    >
                        <option value="all">All periods</option>
                        {availablePeriods.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                        value={statusFilter}
                        onChange={(e) => onStatusFilterChange(e.target.value as ReportStatus | 'all')}
                        className="bg-transparent text-sm font-medium text-slate-600 outline-none cursor-pointer hover:text-indigo-600"
                    >
                        <option value="all">All statuses</option>
                        <option value="draft">Drafts</option>
                        <option value="pending">Submitted</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>

                {/* Important Toggle */}
                <button
                    onClick={onToggleImportant}
                    className={cn(
                        "p-2 rounded-lg border transition-all ml-auto",
                        showImportantOnly
                            ? "bg-amber-50 border-amber-200 text-amber-500"
                            : "bg-white border-slate-200 text-slate-300 hover:text-amber-400"
                    )}
                    title={showImportantOnly ? "Show all" : "Show important only"}
                >
                    <Star className={cn("w-4 h-4", showImportantOnly && "fill-current")} />
                </button>
            </div>
        </div>
    );
}

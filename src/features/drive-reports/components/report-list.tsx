'use client';

import { useState, useMemo } from 'react';
import { DriveReport, ReportType, ReportStatus } from '../types';
import { ReportCard } from './report-card';
import { ReportFilters } from './report-filters';
import { EmptyState } from './empty-state';
import { Calendar } from 'lucide-react';

interface ReportListProps {
    initialReports: DriveReport[];
    currentUserId: string;
    groupId: string;
    driveSettings?: { clientId?: string; apiKey?: string; folderId?: string };
}

// Helper function to get month label from date
function getMonthLabel(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function ReportList({ initialReports, currentUserId, groupId, driveSettings }: ReportListProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<ReportType | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<ReportStatus | 'all'>('all');
    const [dateFilter, setDateFilter] = useState('all');
    const [showImportantOnly, setShowImportantOnly] = useState(false);

    // Extract available periods for filter
    const availablePeriods = useMemo(() => {
        const periods = new Set<string>();
        initialReports.forEach(r => {
            if (r.start_date) periods.add(getMonthLabel(r.start_date));
            else if (r.created_at) periods.add(getMonthLabel(r.created_at));
        });
        return Array.from(periods);
    }, [initialReports]);

    // Filter reports
    const filteredReports = useMemo(() => {
        return initialReports
            .filter(r => {
                // Search filter
                const matchesSearch = !searchQuery ||
                    r.title.toLowerCase().includes(searchQuery.toLowerCase());

                // Type filter
                const matchesType = typeFilter === 'all' || r.type === typeFilter;

                // Status filter
                const matchesStatus = statusFilter === 'all' || r.status === statusFilter;

                // Date filter
                const reportMonth = r.start_date
                    ? getMonthLabel(r.start_date)
                    : r.created_at
                        ? getMonthLabel(r.created_at)
                        : null;
                const matchesDate = dateFilter === 'all' || reportMonth === dateFilter;

                // Important filter
                const matchesImportant = !showImportantOnly || r.is_important;

                return matchesSearch && matchesType && matchesStatus && matchesDate && matchesImportant;
            })
            .sort((a, b) => {
                const dateA = new Date(a.start_date || a.created_at);
                const dateB = new Date(b.start_date || b.created_at);
                return dateB.getTime() - dateA.getTime();
            });
    }, [initialReports, searchQuery, typeFilter, statusFilter, dateFilter, showImportantOnly]);

    // Group by month
    const groupedReports = useMemo(() => {
        const groups: Record<string, DriveReport[]> = {};
        filteredReports.forEach(r => {
            const monthLabel = r.start_date
                ? getMonthLabel(r.start_date)
                : r.created_at
                    ? getMonthLabel(r.created_at)
                    : 'No date';
            if (!groups[monthLabel]) groups[monthLabel] = [];
            groups[monthLabel].push(r);
        });
        return groups;
    }, [filteredReports]);

    // Determine which empty state to show
    const hasFiltersApplied = searchQuery || typeFilter !== 'all' || statusFilter !== 'all' || dateFilter !== 'all' || showImportantOnly;
    const showEmptyState = Object.keys(groupedReports).length === 0;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
            {/* Header with Filters */}
            <div className="px-6 pt-5 pb-4 bg-white border-b border-slate-200">
                <ReportFilters
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    typeFilter={typeFilter}
                    onTypeFilterChange={setTypeFilter}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    dateFilter={dateFilter}
                    onDateFilterChange={setDateFilter}
                    showImportantOnly={showImportantOnly}
                    onToggleImportant={() => setShowImportantOnly(!showImportantOnly)}
                    availablePeriods={availablePeriods}
                />
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50/50">
                {showEmptyState ? (
                    <EmptyState
                        type={hasFiltersApplied || initialReports.length > 0 ? 'no-results' : 'no-reports'}
                        searchQuery={searchQuery}
                    />
                ) : (
                    <div className="space-y-8 max-w-4xl mx-auto pb-20">
                        {Object.entries(groupedReports).map(([month, reports]) => (
                            <div key={month}>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2 sticky top-0 bg-slate-50/95 py-2 z-[5] backdrop-blur-sm">
                                    <Calendar className="w-3 h-3" /> {month}
                                </h3>
                                <div className="space-y-4">
                                    {reports.map(report => (
                                        <ReportCard
                                            key={report.id}
                                            report={report}
                                            currentUserId={currentUserId}
                                            groupId={groupId}
                                            driveSettings={driveSettings}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

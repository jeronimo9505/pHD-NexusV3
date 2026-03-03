import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar, FileText, ChevronRight, User, MessageSquare, CheckSquare, Star, Trash2 } from 'lucide-react';
import { getWeekLabel, getMonthLabel, formatDateShort } from '@/utils/helpers';
import clsx from 'clsx';

export default function ReportList({ reports, currentUserId, onSelectReport, onToggleImportant, onDelete }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'draft', 'submitted', 'reviewed'
    const [dateFilter, setDateFilter] = useState('all');
    const [showImportantOnly, setShowImportantOnly] = useState(false);

    // Extract available periods
    const availablePeriods = useMemo(() => {
        const periods = new Set();
        reports.forEach(r => {
            if (r.startDate) periods.add(getMonthLabel(r.startDate));
        });
        return Array.from(periods);
    }, [reports]);

    // Filter and Sort Reports
    const filteredReports = useMemo(() => {
        return reports
            .filter(r => {
                const matchesSearch = (r.context || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (r.findings || '').toLowerCase().includes(searchQuery.toLowerCase());
                const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
                const matchesDate = dateFilter === 'all' || (r.startDate && getMonthLabel(r.startDate) === dateFilter);
                const matchesImportant = !showImportantOnly || r.isImportant;
                return matchesSearch && matchesStatus && matchesDate && matchesImportant;
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [reports, searchQuery, statusFilter, dateFilter, showImportantOnly]);

    // Group by Month
    const groupedReports = useMemo(() => {
        const groups = {};
        filteredReports.forEach(r => {
            const monthLabel = r.startDate ? getMonthLabel(r.startDate) : 'Borradores sin fecha';
            if (!groups[monthLabel]) groups[monthLabel] = [];
            groups[monthLabel].push(r);
        });
        return groups;
    }, [filteredReports]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'reviewed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'submitted': return 'bg-amber-100 text-amber-700 border-amber-200';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'reviewed': return 'Aprobado';
            case 'submitted': return 'Enviado';
            default: return 'Borrador';
        }
    };

    const getSeenBadge = (report) => {
        if (!report) return null;
        if (report.status === 'draft') return null;

        const isAuthor = currentUserId && report.authorId ? report.authorId === currentUserId : false;
        if (isAuthor) return null;

        if (report.isSeenByMe) return 'Visto';
        return 'Pendiente por revisar';
    };

    const confirmDelete = (e, report) => {
        e.stopPropagation(); // Prevent opening report

        const isApproved = report.status === 'reviewed';

        if (isApproved) {
            // Double verification for approved reports
            if (window.confirm("¡ATENCIÓN! Este reporte ya ha sido aprobado por todos. ¿Estás seguro de que quieres eliminarlo?")) {
                if (window.confirm("Esta acción es irreversible y se perderá todo el historial. Confirmar eliminación definitiva.")) {
                    onDelete(report.id);
                }
            }
        } else {
            // Simple verification for drafts
            if (window.confirm("¿Estás seguro de eliminar este reporte?")) {
                onDelete(report.id);
            }
        }
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 bg-gray-50/50">
            {/* Header / Search Bar */}
            <div className="px-8 py-6 border-b border-gray-200 bg-white sticky top-0 z-10 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <span className="bg-indigo-600 text-white p-1.5 rounded-lg"><FileText className="w-5 h-5" /></span>
                            Biblioteca de Reportes
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">Explora, filtra y gestiona tu historial científico.</p>
                    </div>
                    {/* Add New Button is handled by parent, but we could put it here too if needed */}
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-lg">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por contexto, hallazgos..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <select
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="bg-transparent text-sm font-medium text-slate-600 outline-none cursor-pointer hover:text-indigo-600"
                        >
                            <option value="all">Todos los periodos</option>
                            {availablePeriods.map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-transparent text-sm font-medium text-slate-600 outline-none cursor-pointer hover:text-indigo-600"
                        >
                            <option value="all">Todos los estados</option>
                            <option value="draft">Borradores</option>
                            <option value="submitted">En Revisión</option>
                            <option value="reviewed">Aprobados</option>
                        </select>
                    </div>
                    <button
                        onClick={() => setShowImportantOnly(!showImportantOnly)}
                        className={clsx(
                            "p-2 rounded-lg border ml-3 transition-all",
                            showImportantOnly ? "bg-amber-50 border-amber-200 text-amber-500" : "bg-white border-gray-200 text-slate-400 hover:text-amber-400"
                        )}
                        title={showImportantOnly ? "Ver todos" : "Ver solo importantes"}
                    >
                        <Star className={clsx("w-4 h-4", showImportantOnly ? "fill-current" : "")} />
                    </button>
                </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="max-w-5xl mx-auto space-y-8 pb-20">
                    {Object.keys(groupedReports).length === 0 ? (
                        <div className="text-center py-20">
                            <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Search className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-slate-600 font-medium">No se encontraron reportes</h3>
                            <p className="text-slate-400 text-sm mt-1">Intenta ajustar tu búsqueda o crea uno nuevo.</p>
                        </div>
                    ) : (
                        Object.entries(groupedReports).map(([groupLabel, groupReports]) => (
                            <div key={groupLabel}>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Calendar className="w-3 h-3" /> {groupLabel}
                                </h3>
                                <div className="grid grid-cols-1 gap-4">
                                    {groupReports.map(report => (
                                        <div
                                            key={report.id}
                                            onClick={() => onSelectReport(report.id)}
                                            className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-300 cursor-pointer transition-all group relative overflow-hidden"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <h4 className="text-base font-bold text-indigo-700 group-hover:text-indigo-600 transition-colors">
                                                            Reporte {formatDateShort(report.startDate)} - {formatDateShort(report.endDate)}
                                                        </h4>
                                                        <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase", getStatusColor(report.status))}>
                                                            {getStatusLabel(report.status)}
                                                        </span>
                                                        {getSeenBadge(report) && report.status === 'submitted' && (
                                                            <span
                                                                className={clsx(
                                                                    'text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase',
                                                                    getSeenBadge(report) === 'Visto'
                                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                                        : 'bg-slate-50 text-slate-500 border-slate-200'
                                                                )}
                                                            >
                                                                {getSeenBadge(report)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-slate-600 line-clamp-2 font-medium">
                                                        {report.context || 'Sin contexto/objetivo definido...'}
                                                    </p>

                                                    <div className="flex items-center gap-4 mt-3">
                                                        {report.reviewedBy && (
                                                            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded-md">
                                                                <User className="w-3 h-3" /> Aprobado por {report.reviewedBy}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-3 text-xs text-slate-400">
                                                            {((report.sectionComments?.context?.length || 0) + (report.sectionComments?.experimental?.length || 0)) > 0 && (
                                                                <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {((report.sectionComments?.context?.length || 0) + (report.sectionComments?.experimental?.length || 0))} </span>
                                                            )}
                                                            {(report.tasks?.length || 0) > 0 && (
                                                                <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3" /> {report.tasks.length} </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="self-center pr-2 flex items-center gap-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onToggleImportant(e, report.id);
                                                        }}
                                                        className={clsx(
                                                            "p-2 rounded-full transition-colors z-10 relative",
                                                            report.isImportant ? "text-amber-400 hover:text-amber-500" : "text-slate-200 hover:text-amber-400"
                                                        )}
                                                        title={report.isImportant ? "Quitar destacado" : "Destacar reporte"}
                                                    >
                                                        <Star className={clsx("w-5 h-5", report.isImportant ? "fill-current" : "")} />
                                                    </button>
                                                    <div className="p-2 rounded-full bg-slate-50 text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                                        <ChevronRight className="w-5 h-5" />
                                                    </div>

                                                    {/* Delete Button - Visible to all roles as requested */}
                                                    <button
                                                        onClick={(e) => confirmDelete(e, report)}
                                                        className="p-2 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors z-10"
                                                        title="Eliminar reporte"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

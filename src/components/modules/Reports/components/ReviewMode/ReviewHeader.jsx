import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare, Printer, Download, ChevronDown, Eye, CheckCircle, AlertCircle, Menu } from 'lucide-react';
import clsx from 'clsx';
import { useApp } from '@/context/AppContext';

const fmtDateTime = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString();
};

export default function ReviewHeader({
    reportMeta,
    onBack,
    viewMode,
    setViewMode,
    showSidenotes,
    setShowSidenotes,
    onPrint,
    onApprove,
    onRequestChanges
}) {
    const { isSidebarOpen, setIsSidebarOpen } = useApp();

    if (!reportMeta) return null;

    const myId = reportMeta.currentUserId;
    const myReviewer = (reportMeta.reviewers || []).find((r) => r?.id === myId);
    const myDecision = myReviewer?.status && ['approved', 'changes_requested'].includes(myReviewer.status)
        ? myReviewer.status
        : null;
    const myDecisionAt = myReviewer?.seenAt || null;
    const hasVoted = Boolean(myDecision);

    const status = (reportMeta.status || 'draft').toString().toLowerCase();
    // Members may still need to cast their decision even if the report is already marked as reviewed
    // (e.g., migrated/legacy states or manual status changes). We therefore allow voting in both
    // submitted and reviewed, but never show the buttons after the current user has voted.
    const canVote = (status === 'submitted' || status === 'reviewed') && !hasVoted;
    const showVoteArea = (status === 'submitted' || status === 'reviewed') && (hasVoted || canVote);

    const [isExportOpen, setIsExportOpen] = useState(false);
    const exportRef = useRef(null);

    useEffect(() => {
        if (!isExportOpen) return;

        const onDocMouseDown = (e) => {
            if (!exportRef.current) return;
            if (!exportRef.current.contains(e.target)) setIsExportOpen(false);
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') setIsExportOpen(false);
        };

        document.addEventListener('mousedown', onDocMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onDocMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isExportOpen]);

    const statusColors = {
        draft: 'bg-slate-100 text-slate-600',
        submitted: 'bg-blue-50 text-blue-700',
        reviewed: 'bg-amber-50 text-amber-700',
        approved: 'bg-emerald-50 text-emerald-700',
        changes_requested: 'bg-red-50 text-red-700'
    };

    return (
        <div className="absolute top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between px-6 z-40 print:hidden">
            {/* Left: Navigation & Meta */}
            <div className="flex items-center gap-4 flex-1">
                {/* Sidebar Toggle */}
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className={clsx(
                        "p-2 rounded-lg transition-colors mr-2",
                        isSidebarOpen ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                    )}
                    title={isSidebarOpen ? "Ocultar menú lateral" : "Mostrar menú lateral"}
                >
                    <Menu className="w-5 h-5" />
                </button>

                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-3 py-2 mr-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 transition-all text-sm font-medium shadow-sm group"
                    aria-label="Volver al Panel"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span>Volver al Panel</span>
                </button>
                <div className="h-6 w-px bg-gray-200"></div>
                <div className="flex flex-col">
                    <div className="flex items-center">
                        <h1 className="font-bold text-slate-800 text-sm md:text-base truncate max-w-md">
                            Report
                        </h1>
                        <span
                            className={clsx(
                                "px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ml-3",
                                statusColors[reportMeta.status] || statusColors.draft
                            )}
                        >
                            {reportMeta.status?.replaceAll('_', ' ')}
                        </span>
                    </div>

                    {/* 1) Report + period */}
                    <span className="text-xs text-slate-500 font-semibold">
                        Period: {new Date(reportMeta.startDate).toLocaleDateString()} — {new Date(reportMeta.endDate).toLocaleDateString()}
                    </span>

                    {/* 2) Persona */}
                    <span className="text-[11px] text-slate-400 font-medium">
                        {reportMeta.authorName}
                    </span>
                </div>
            </div>

            {/* Center: View Controls */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                    onClick={() => setViewMode('review')}
                    className={clsx(
                        "p-1.5 px-3 rounded-md text-xs font-bold transition-all flex items-center gap-2",
                        viewMode === 'review' ? "bg-white shadow text-indigo-600" : "text-slate-500 hover:text-slate-700"
                    )}
                >
                    <Eye className="w-3.5 h-3.5" /> Revisión
                </button>
                <button
                    onClick={() => setViewMode('focus')}
                    className={clsx(
                        "p-1.5 px-3 rounded-md text-xs font-bold transition-all flex items-center gap-2",
                        viewMode === 'focus' ? "bg-white shadow text-indigo-600" : "text-slate-500 hover:text-slate-700"
                    )}
                >
                    <div className="w-3.5 h-3.5 border border-current rounded-sm" /> Foco
                </button>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3 flex-1 justify-end">
                <div className="h-6 w-px bg-gray-200 mx-2"></div>

                <button
                    onClick={() => setShowSidenotes(!showSidenotes)}
                    className={clsx(
                        "p-2 rounded-lg transition-colors relative",
                        showSidenotes ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-50"
                    )}
                    title="Mostrar/ocultar comentarios"
                    aria-label="Mostrar/ocultar comentarios"
                >
                    <MessageSquare className="w-5 h-5" />
                    {/* Badge if needed */}
                </button>

                {/* Export (single button + menu) */}
                <div className="relative" ref={exportRef}>
                    <button
                        type="button"
                        onClick={() => setIsExportOpen((v) => !v)}
                        className={clsx(
                            'p-2 rounded-lg flex items-center gap-1 transition-colors',
                            isExportOpen ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                        )}
                        title="Exportar"
                        aria-label="Exportar"
                        aria-haspopup="menu"
                        aria-expanded={isExportOpen}
                    >
                        <Printer className="w-5 h-5" />
                        <ChevronDown className="w-4 h-4" />
                    </button>

                    {isExportOpen && (
                        <div
                            role="menu"
                            className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
                        >
                            <button
                                role="menuitem"
                                type="button"
                                onClick={() => {
                                    setIsExportOpen(false);
                                    onPrint?.();
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                                <Printer className="w-4 h-4 text-slate-500" />
                                Imprimir
                            </button>

                            <button
                                role="menuitem"
                                type="button"
                                onClick={() => {
                                    setIsExportOpen(false);
                                    window.dispatchEvent(new CustomEvent('reports:download-pdf-text'));
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                                <Download className="w-4 h-4 text-slate-500" />
                                Descargar PDF
                            </button>
                        </div>
                    )}
                </div>

                {/* Vote actions: only meaningful while SUBMITTED */}
                {showVoteArea && (
                    <div className="flex items-center gap-2 ml-2">
                        {hasVoted ? (
                            <div
                                className={clsx(
                                    'px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border',
                                    myDecision === 'approved'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                )}
                                title={myDecisionAt ? `Tu decisión: ${myDecision.replaceAll('_', ' ')} (${fmtDateTime(myDecisionAt)})` : `Tu decisión: ${myDecision.replaceAll('_', ' ')}`}
                            >
                                {myDecision === 'approved' ? (
                                    <CheckCircle className="w-4 h-4" />
                                ) : (
                                    <AlertCircle className="w-4 h-4" />
                                )}
                                <span className="hidden md:inline">
                                    Tu decisión:
                                </span>
                                <span className="uppercase tracking-wide">
                                    {myDecision.replaceAll('_', ' ')}
                                </span>
                            </div>
                        ) : (
                            <>
                                <button
                                    onClick={onRequestChanges}
                                    className="px-3 py-2 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                                >
                                    <AlertCircle className="w-4 h-4" />
                                    <span className="hidden lg:inline">Solicitar Cambios</span>
                                </button>
                                <button
                                    onClick={onApprove}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-md transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                                >
                                    <CheckCircle className="w-4 h-4" />
                                    <span>Aprobar</span>
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

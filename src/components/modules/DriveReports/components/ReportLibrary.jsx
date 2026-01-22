import React, { useState, useMemo, useRef } from 'react';
import {
    Plus, FileText, Calendar, Search, ExternalLink, Clock, CheckCircle,
    AlertCircle, Settings, Trash2, Filter, Star, ChevronRight, User,
    MessageSquare, CheckSquare, Eye, X, Send, EyeOff, Presentation,
    StickyNote, Layout, Layers
} from 'lucide-react';
import { googleDriveService } from '@/components/modules/Drive/services/googleDriveService';
import DriveReportCard from './DriveReportCard';

import { useApp } from '@/context/AppContext';
import { formatDateShort, getMonthLabel } from '@/utils/helpers';
import clsx from 'clsx';
import { useTasks } from '../../Tasks/hooks/useTasks';
import TaskDetailPanel from '../../Tasks/components/TaskDetailPanel';
import { motion, AnimatePresence } from 'framer-motion';

export default function ReportLibrary({ onSelectReport, onCreateNew, onOpenSettings, onDeleteReport, onUploadPPT }) {
    const { driveReports, loading, currentUser, markDriveReportSeen, addDriveReportComment, groupMembers, reports, userProfile } = useApp();
    const { createTask, updateTask, deleteTask, addComment: addTaskComment, tasks: allTasks } = useTasks();

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('all');
    const [showImportantOnly, setShowImportantOnly] = useState(false);
    const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'report', 'ppt', 'meeting_note'

    // Comment Modal State
    const [activeCommentReport, setActiveCommentReport] = useState(null);
    const [newCommentText, setNewCommentText] = useState('');

    // Task Management State
    const [editingTaskId, setEditingTaskId] = useState(null);
    const selectedTask = allTasks.find(t => t.id === editingTaskId);

    const potentialAssignees = useMemo(() => {
        const members = groupMembers || [];
        if (currentUser && !members.find(m => m.id === currentUser.id)) {
            return [...members, { ...currentUser, name: currentUser.full_name || currentUser.name }];
        }
        return members;
    }, [groupMembers, currentUser]);

    // Toggle for History expansion per card (local state not feasible for list in this filtered view easily without subcomponent, 
    // Toggle for History/Tasks/Comments expansion per card
    const [expandedSections, setExpandedSections] = useState({});

    const toggleHistory = (e, reportId, section) => {
        e.stopPropagation();
        setExpandedSections(prev => {
            const current = prev[reportId];
            if (current === section) {
                // Collapse if clicking the same section
                const newState = { ...prev };
                delete newState[reportId];
                return newState;
            }
            // Expand new section
            return { ...prev, [reportId]: section };
        });
    };

    const handleQuickAddTask = async (e, reportId) => {
        e.stopPropagation();
        const { data: newTask, error } = await createTask({
            title: 'Nueva Tarea del Reporte',
            description: '',
            status: 'todo',
            priority: 'medium',
            sourceReportId: reportId
        });

        if (newTask) {
            setEditingTaskId(newTask.id);
        }
    };

    const handleTaskUpdate = async (taskId, field, value) => {
        const updates = { [field]: value };
        if (field === 'status') {
            if (value === 'done') {
                updates.completed_at = new Date().toISOString();
                updates.completed_by = currentUser?.id;
            } else {
                updates.completed_at = null;
                updates.completed_by = null;
            }
        }
        await updateTask(taskId, updates);
    };

    // Extract available periods for filter
    const availablePeriods = useMemo(() => {
        const periods = new Set();
        driveReports.forEach(r => {
            if (r.startDate) periods.add(getMonthLabel(r.startDate));
        });
        return Array.from(periods);
    }, [driveReports]);

    // Filter and Sort
    const filteredReports = useMemo(() => {
        return driveReports
            .filter(r => {
                const contextText = r.sections?.context || '';
                const findingsText = r.sections?.findings || '';
                const matchesSearch = r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    contextText.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    findingsText.toLowerCase().includes(searchQuery.toLowerCase());

                const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
                const matchesDate = dateFilter === 'all' || (r.startDate && getMonthLabel(r.startDate) === dateFilter);
                const matchesImportant = !showImportantOnly || r.isImportant;

                const matchesType = typeFilter === 'all' ||
                    (typeFilter === 'ppt' && r.type === 'ppt') ||
                    (typeFilter === 'meeting_note' && r.type === 'meeting_note') ||
                    (typeFilter === 'report' && (!r.type || r.type === 'report' || r.type === 'period_report'));

                return matchesSearch && matchesStatus && matchesDate && matchesImportant && matchesType;
            })
            .sort((a, b) => new Date(b.created_at || b.startDate) - new Date(a.created_at || a.startDate));
    }, [driveReports, searchQuery, statusFilter, dateFilter, showImportantOnly, typeFilter]);

    // Group by Month
    const groupedReports = useMemo(() => {
        const groups = {};
        filteredReports.forEach(r => {
            const monthLabel = r.startDate ? getMonthLabel(r.startDate) : 'Sin fecha';
            if (!groups[monthLabel]) groups[monthLabel] = [];
            groups[monthLabel].push(r);
        });
        return groups;
    }, [filteredReports]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'approved': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200'; // "Enviado/Pending"
            case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'approved': return 'Aprobado';
            case 'pending': return 'Enviado';
            case 'rejected': return 'Rechazado';
            default: return 'Borrador';
        }
    };

    const handleCommentSubmit = async (e) => {
        e.preventDefault();
        if (!newCommentText.trim() || !activeCommentReport) return;
        await addDriveReportComment(activeCommentReport.id, newCommentText);
        setNewCommentText('');
        // Optimistic update of local comments list for the active report
        const newComment = {
            id: Date.now().toString(),
            user_id: currentUser.id,
            user_name: currentUser.full_name || currentUser.name,
            content: newCommentText,
            created_at: new Date().toISOString()
        };
        setActiveCommentReport(prev => ({
            ...prev,
            comments: [...(prev.comments || []), newComment]
        }));
    };

    // Menu State
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && onUploadPPT) {
            onUploadPPT(file);
        }
        e.target.value = ''; // Reset
        setIsMenuOpen(false);
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full animate-in fade-in duration-300 relative">
            <AnimatePresence>
                {isMenuOpen && (
                    <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)} />
                )}
            </AnimatePresence>

            {/* Hidden Input */}
            <input
                type="file"
                accept=".ppt,.pptx"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
            />

            {/* Header */}
            <div className="px-6 pt-5 pb-0 bg-white z-10 hidden sm:block">
                {/* Header Title & Actions */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <FileText className="w-6 h-6 text-indigo-600" />
                            Mis Reportes
                        </h1>
                        <p className="text-slate-500 text-sm">Gestiona tus reportes, presentaciones y notas</p>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto relative z-20">
                        {onOpenSettings && (
                            <button
                                onClick={onOpenSettings}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Configuración"
                            >
                                <Settings className="w-5 h-5" />
                            </button>
                        )}

                        <div className="relative">
                            <button
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-all active:scale-95 whitespace-nowrap"
                            >
                                <Plus className="w-5 h-5" />
                                <span>Nuevo</span>
                            </button>

                            <AnimatePresence>
                                {isMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden py-1 z-50 origin-top-right"
                                    >
                                        <button
                                            onClick={() => { onCreateNew('report'); setIsMenuOpen(false); }}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 transition-colors border-b border-slate-50"
                                        >
                                            <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                                                <FileText className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <span className="block text-sm font-bold text-slate-700">Reporte Científico</span>
                                                <span className="block text-[10px] text-slate-400">Mensual o por periodo</span>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => { onCreateNew('meeting_note'); setIsMenuOpen(false); }}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 transition-colors border-b border-slate-50"
                                        >
                                            <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
                                                <StickyNote className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <span className="block text-sm font-bold text-slate-700">Nota de Reunión</span>
                                                <span className="block text-[10px] text-slate-400">Minuta o apuntes rápidos</span>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => {
                                                // Handle PPT Click with Auth Check
                                                const handlePPTClick = async () => {
                                                    // 1. Check Auth
                                                    if (!googleDriveService.hasValidToken()) {
                                                        try {
                                                            await googleDriveService.requestAccessToken();
                                                        } catch (e) {
                                                            console.error("Auth failed properly", e);
                                                            return; // Stop if auth fails
                                                        }
                                                    }
                                                    // 2. Click Input
                                                    fileInputRef.current?.click();
                                                    setIsMenuOpen(false);
                                                };
                                                handlePPTClick();
                                            }}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                                        >
                                            <div className="bg-orange-100 p-2 rounded-lg text-orange-600">
                                                <Presentation className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <span className="block text-sm font-bold text-slate-700">Presentación PPT</span>
                                                <span className="block text-[10px] text-slate-400">Subir archivo .pptx</span>
                                            </div>
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* TYPE TABS */}
                <div className="flex items-center gap-1 border-b border-slate-200">
                    <button
                        onClick={() => setTypeFilter('all')}
                        className={clsx(
                            "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
                            typeFilter === 'all' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-t-lg"
                        )}
                    >
                        <Layers className="w-4 h-4" />
                        Todos
                    </button>
                    <button
                        onClick={() => setTypeFilter('report')}
                        className={clsx(
                            "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
                            typeFilter === 'report' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-t-lg"
                        )}
                    >
                        <FileText className="w-4 h-4" />
                        Reportes
                    </button>
                    <button
                        onClick={() => setTypeFilter('ppt')}
                        className={clsx(
                            "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
                            typeFilter === 'ppt' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-t-lg"
                        )}
                    >
                        <Presentation className="w-4 h-4" />
                        PPTs
                    </button>
                    <button
                        onClick={() => setTypeFilter('meeting_note')}
                        className={clsx(
                            "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
                            typeFilter === 'meeting_note' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-t-lg"
                        )}
                    >
                        <StickyNote className="w-4 h-4" />
                        Meeting Notes
                    </button>
                </div>

                {/* Filters Toolbar - Repositioned slightly */}
                <div className="flex flex-wrap items-center gap-3 py-4">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por título, contexto..."
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <select
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="bg-transparent text-sm font-medium text-slate-600 outline-none cursor-pointer hover:text-indigo-600"
                        >
                            <option value="all">Todos los periodos</option>
                            {availablePeriods.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-transparent text-sm font-medium text-slate-600 outline-none cursor-pointer hover:text-indigo-600"
                        >
                            <option value="all">Todos los estados</option>
                            <option value="draft">Borradores</option>
                            <option value="pending">Enviados</option>
                            <option value="approved">Aprobados</option>
                        </select>
                    </div>

                    <button
                        onClick={() => setShowImportantOnly(!showImportantOnly)}
                        className={clsx(
                            "p-2 rounded-lg border transition-all ml-auto",
                            showImportantOnly ? "bg-amber-50 border-amber-200 text-amber-500" : "bg-white border-slate-200 text-slate-300 hover:text-amber-400"
                        )}
                        title={showImportantOnly ? "Ver todos" : "Ver solo importantes"}
                    >
                        <Star className={clsx("w-4 h-4", showImportantOnly ? "fill-current" : "")} />
                    </button>
                </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50/50 custom-scrollbar">
                {Object.keys(groupedReports).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <div className="bg-slate-100 p-4 rounded-full mb-3">
                            <Search className="w-8 h-8 text-slate-300" />
                        </div>
                        <p>No se encontraron reportes con estos filtros.</p>
                        {driveReports.length === 0 && (
                            <button onClick={onCreateNew} className="text-indigo-600 font-bold hover:underline mt-2 text-sm">
                                Crear el primer reporte
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-8 max-w-4xl mx-auto pb-20">
                        {Object.entries(groupedReports).map(([month, reports]) => (
                            <div key={month}>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2 sticky top-0 bg-slate-50/95 py-2 z-[5] backdrop-blur-sm">
                                    <Calendar className="w-3 h-3" /> {month}
                                </h3>
                                <div className="space-y-4">
                                    {reports.map(report => {
                                        const isSeenByMe = report.isSeenByMe;
                                        const isAuthor = report.author_id === currentUser?.id;
                                        const seenCount = report.seenCount || 0;
                                        const expandedSection = expandedSections[report.id];
                                        const hasComments = report.commentCount > 0;

                                        // LIVE TASKS FILTER
                                        // Use global tasks list to ensure instant updates without reload
                                        const liveReportTasks = allTasks.filter(t => t.sourceReportId === report.id);

                                        return (
                                            <DriveReportCard
                                                key={report.id}
                                                report={{ ...report, tasks: liveReportTasks }} // Override tasks with live list
                                                currentUser={currentUser}
                                                onMarkSeen={(r) => markDriveReportSeen && markDriveReportSeen(r.id)}
                                                onDelete={onDeleteReport ? ((r) => onDeleteReport(r)) : undefined}
                                                onComment={setActiveCommentReport}
                                                onCreateTask={(r) => handleQuickAddTask({ stopPropagation: () => { } }, r.id)}
                                                onOpen={onSelectReport}
                                                // Task Actions
                                                onToggleTask={(taskId, status) => handleTaskUpdate(taskId, 'status', status === 'done' ? 'todo' : 'done')}
                                                onDeleteTask={(taskId) => deleteTask && deleteTask(taskId)}

                                                expandedSection={expandedSection}
                                                onToggleSection={(section) => toggleHistory({ stopPropagation: () => { } }, report.id, section)}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                        }
                    </div >
                )}
            </div >

            {/* Comment Modal */}
            {
                activeCommentReport && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80%] overflow-hidden border border-slate-200">
                            {/* Modal Header */}
                            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 bg-slate-50">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4" /> Comentarios
                                </h3>
                                <button
                                    onClick={() => setActiveCommentReport(null)}
                                    className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Comments List */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                                {(!activeCommentReport.comments || activeCommentReport.comments.length === 0) ? (
                                    <p className="text-center text-slate-400 text-sm py-4 italic">No hay comentarios aún.</p>
                                ) : (
                                    activeCommentReport.comments.map(comment => (
                                        <div key={comment.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm text-sm">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-bold text-slate-700 text-xs">{comment.user_name || 'Usuario'}</span>
                                                <span className="text-[10px] text-slate-400">{formatDateShort(comment.created_at, true)}</span>
                                            </div>
                                            <p className="text-slate-600">{comment.content}</p>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Input Area */}
                            <form onSubmit={handleCommentSubmit} className="p-3 border-t border-slate-100 bg-white flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Escribe un comentario..."
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
                                    value={newCommentText}
                                    onChange={(e) => setNewCommentText(e.target.value)}
                                    autoFocus
                                />
                                <button
                                    type="submit"
                                    disabled={!newCommentText.trim()}
                                    className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </form>
                        </div>
                    </div>
                )
            }
            {/* Task Detail Modal */}
            <AnimatePresence>
                {editingTaskId && selectedTask && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-end bg-black/20 backdrop-blur-sm"
                        onClick={() => setEditingTaskId(null)}
                    >
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: "spring", damping: 30, stiffness: 300 }}
                            className="w-[500px] h-full bg-white shadow-2xl overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <TaskDetailPanel
                                selectedTask={selectedTask}
                                currentUser={userProfile || currentUser}
                                potentialAssignees={potentialAssignees}
                                onClose={() => setEditingTaskId(null)}
                                onUpdate={handleTaskUpdate}
                                onAddComment={addTaskComment}
                                reports={reports || driveReports} // Fallback to driveReports if general reports not available
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
}

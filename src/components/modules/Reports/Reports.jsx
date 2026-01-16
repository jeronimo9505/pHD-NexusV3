'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    FileText, Target, FlaskConical, Lightbulb, AlertTriangle, Calendar,
    MessageSquare, Image as ImageIcon, Plus, Library, ExternalLink, Trash2, BookOpen, CheckSquare,
    ArrowLeft, Send, Check, Menu
} from 'lucide-react';
import clsx from 'clsx';
import { useApp } from '@/context/AppContext'; // Still need userRole, currentUser etc.
import { getWeekLabel } from '@/utils/helpers';
import DateRangePicker from '@/components/common/DateRangePicker';
import Section from './components/Section';
import EditableArea from './components/EditableArea';
import ResourceSelector from './components/ResourceSelector';
import TaskModal from './components/TaskModal';
import ReportList from './components/ReportList';
import ReportReadView from './components/ReportReadView';
import { useReports, useReportDetails } from './hooks/useReports';
import { useTasks } from '@/components/modules/Tasks/hooks/useTasks';
import { useKnowledge } from '@/components/modules/Knowledge/hooks/useKnowledge';

export default function Reports() {
    const {
        userRole, userProfile,
        knowledge, setKnowledge,
        tasks, setTasks,
        addActivity, currentUser,
        activeGroupId,
        selectedReportId, setSelectedReportId, // Use GLOBAL state
        isSidebarOpen, setIsSidebarOpen // Added
    } = useApp();

    // 1. Data Fetching (List)
    const { reports, loading: loadingList, createReport, fetchReports, deleteReport, updateReportDates } = useReports(activeGroupId);
    const { createTask } = useTasks(); // Hook for creating tasks
    const { resources: knowledgeResources, addResource: createKnowledgeResource } = useKnowledge(); // Knowledge hook

    // UI State
    // REMOVED local selectedReportId state to fix navigation from Dashboard
    const [isEditingReport, setIsEditingReport] = useState(false);
    const [isResourceSelectorOpen, setIsResourceSelectorOpen] = useState(false);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [taskToEdit, setTaskToEdit] = useState(null);

    // Auto-hide sidebar when entering a report
    useEffect(() => {
        if (selectedReportId) {
            setIsSidebarOpen(false);
        } else {
            setIsSidebarOpen(true);
        }
    }, [selectedReportId, setIsSidebarOpen]);

    // 2. Selected Report Details
    const {
        reportMeta, // Fresh metadata from DB
        sections,
        loading: loadingDetails,
        updateSection,
        persistSection,
        updateReportStatus,
        updateSupervisorFeedback,
        linkedTasks,
        linkedResources, // From hook
        linkTask,
        unlinkTask,
        linkResource,    // From hook
        unlinkResource,  // From hook
        comments, // Get comments
        addComment, // Get add handler
        views, // Get views
        markAsSeen, // Get markAsSeen handler
        refetch: refetchDetails
    } = useReportDetails(selectedReportId);

    // Local state for Date Picker
    const [dateRange, setDateRange] = useState({ start: null, end: null });
    const prevReportIdRef = React.useRef(null);

    useEffect(() => {
        // Sync dates when reportMeta loads or changes (and it's a different report or fresh load)
        if (reportMeta && reportMeta.id) {
            // Only update if we switched reports or if the local state is empty
            // To avoid overwriting user while editing, strictly check ID change OR initial load
            const isNewSelection = reportMeta.id !== prevReportIdRef.current;

            if (isNewSelection) {
                setDateRange({
                    start: reportMeta.startDate,
                    end: reportMeta.endDate
                });
                prevReportIdRef.current = reportMeta.id;
            }
        }
    }, [reportMeta]);

    // Reset editing mode when switching to a submitted/reviewed report
    useEffect(() => {
        if (reportMeta && selectedReportId) {
            const status = (reportMeta.status || 'draft').toString().toLowerCase();
            const normalizedStatus = status === 'approved' ? 'reviewed' : status;

            // If opening a submitted or reviewed report, ensure we're NOT in edit mode
            if (normalizedStatus === 'submitted' || normalizedStatus === 'reviewed') {
                setIsEditingReport(false);
            }
        }
    }, [selectedReportId, reportMeta]);
    // Alias for backward compatibility in this file
    const activeReportMeta = reportMeta;

    // If we have a selected ID but no metadata found (yet), handle loading/error
    // But if we are creating new, we rely on createReport returning new ID and list refreshing.


    const handleCreateReport = async () => {
        // Calculate current week (Monday to Friday)
        const curr = new Date();
        const first = curr.getDate() - curr.getDay() + 1; // Monday
        const last = first + 4; // Friday

        const monday = new Date(curr.setDate(first));
        const friday = new Date(curr.setDate(last));

        const start = monday.toISOString().split('T')[0];
        const end = friday.toISOString().split('T')[0];

        const { data } = await createReport(start, end);
        if (data) {
            setSelectedReportId(data.id);
            setIsEditingReport(true);
            setDateRange({ start, end });
        }
    };

    const handleDateChange = async (start, end) => {
        // Always update local UI state immediately so picker doesn't "freeze"
        setDateRange({ start, end });

        if (!start || !end) return; // Wait for both dates

        // start and end are already YYYY-MM-DD from picker
        const { error } = await updateReportDates(selectedReportId, start, end); // FIX: Pass selectedReportId

        if (error) {
            // Revert UI if failed, or just alert
            alert(`Error al actualizar fechas: ${error.message || 'Conflicto o Permisos'}`);
            // Optionally fetch to reset to server state
            fetchReports();
        } else {
            fetchReports(); // Refresh list to show new date
        }
    };

    const handleUpdateSection = (key, value) => {
        updateSection(key, value);
        // Note: updateSection in hook handles optimistic state + DB
    };

    const handleSendReport = async () => {
        if (window.confirm('¿Enviar reporte para revisión?')) {
            const { error } = await updateReportStatus('submitted');
            if (error) {
                alert("Error al enviar: " + error.message);
                return;
            }
            setIsEditingReport(false);
            fetchReports(); // Refresh list status
            addActivity({
                type: 'report_status',
                content: 'ha enviado un reporte',
                author: currentUser.full_name || currentUser.email,
                link: { module: 'reports', id: selectedReportId, label: 'Ver Reporte' }
            });
        }
    };

    const handleMarkAsSeen = async () => {
        await markAsSeen();
        // Since markAsSeen in hook fetches details, local state updates automatically via hook.
        // We might want to refresh list too if list shows seen status per user (Dashboard does).
        fetchReports();

        addActivity({
            type: 'report_status',
            content: 'ha marcado como visto el reporte',
            author: currentUser.full_name,
            link: { module: 'reports', id: selectedReportId, label: 'Ver Reporte' }
        });
    };

    const isAuthor = activeReportMeta?.authorId && currentUser?.id
        ? activeReportMeta.authorId === currentUser.id
        : false;

    const normalizedStatus = (activeReportMeta?.status || 'draft').toString().toLowerCase() === 'approved'
        ? 'reviewed'
        : (activeReportMeta?.status || 'draft').toString().toLowerCase();

    const canEdit = isAuthor;
    const canSubmit = isAuthor && normalizedStatus === 'draft';

    const handleSaveTask = async (taskData) => {
        const { error } = await createTask({
            ...taskData,
            sourceReportId: selectedReportId
        });

        if (error) {
            alert("Error al crear la tarea: " + error);
        } else {
            refetchDetails(); // Refresh details to show new linked task
            setIsTaskModalOpen(false);
            addActivity({
                type: 'task',
                content: `creó una tarea desde reporte`,
                author: currentUser?.full_name || 'Usuario',
                link: { module: 'tasks', id: null, label: 'Nueva Tarea' }
            });
        }
    };

    const handleDeleteReport = async (reportId) => {
        const { error } = await deleteReport(reportId);
        if (error) {
            alert("Error al eliminar: " + error);
        } else {
            if (selectedReportId === reportId) {
                setSelectedReportId(null);
            }
        }
    };


    // ... (Resource/Task handlers need adaptation to real DB later, keeping scaffold for now)
    const handleSelectResources = (ids) => {
        ids.forEach(id => linkResource(id));
    };
    const handleCreateResource = async (data) => {
        const { data: newRes } = await createKnowledgeResource(data);
        if (newRes) linkResource(newRes.id);
    };
    const handleRemoveResource = (id) => console.log("Remove resource (TODO)", id);


    // VIEW LIFTING:
    if (!selectedReportId) {
        return (
            <div className="relative h-full">
                {loadingList && <div className="p-8 text-center text-slate-400">Cargando reportes...</div>}

                {!loadingList && (
                    <ReportList
                        reports={reports}
                        currentUserId={currentUser?.id}
                        onSelectReport={(id) => setSelectedReportId(id)}
                        onToggleImportant={() => { }} // TODO
                        onDelete={handleDeleteReport}
                    />
                )}

                <div className="absolute bottom-8 right-8 z-20">
                    <button
                        onClick={handleCreateReport}
                        className="shadow-xl bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-6 rounded-full transition-all flex items-center gap-3 hover:scale-105 active:scale-95"
                    >
                        <Plus className="w-5 h-5" /> <span className="font-bold">Nuevo Reporte</span>
                    </button>
                </div>
            </div>
        );
    }

    if (!activeReportMeta) return <div>Cargando detalle...</div>;

    // Read mode for the main Reports page version: whenever not editing.
    // For submitted/reviewed, we always show read mode to avoid confusing 'preview'.
    const isReadMode = !isEditingReport && activeReportMeta && (normalizedStatus === 'submitted' || normalizedStatus === 'reviewed');

    if (isReadMode) {
        return (
            <div className="h-full animate-in fade-in duration-300">
                {/* Pass onBack to handle return to list */}
                <ReportReadView
                    reportId={selectedReportId}
                    onBack={() => { setSelectedReportId(null); fetchReports(); }}
                />

                <div className="fixed bottom-8 right-8 z-50">
                    <button
                        onClick={() => {
                            if (!canEdit) {
                                alert('Solo el autor puede editar este reporte.');
                                return;
                            }
                            setIsEditingReport(true);
                        }}
                        className={clsx(
                            'bg-white p-3 rounded-full shadow-lg border border-gray-200',
                            canEdit ? 'text-slate-400 hover:text-indigo-600' : 'text-slate-200 cursor-not-allowed'
                        )}
                        title={canEdit ? 'Editar' : 'Solo el autor puede editar'}
                    >
                        <FileText className="w-5 h-5" />
                    </button>
                </div>
            </div>
        );
    }

    // We import ReportReadView at the top first! I'll do that via another replace or just assume user fixes imports. 
    // Wait, I should not assume. I will add import in a separate tool call or include it here if I could touch the top of file.
    // I can't touch top and bottom in one replace call easily.
    // I will use multi_replace for Reports.jsx safely.

    // ... (keep existing code)

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300">
            <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-4">
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
                        onClick={() => { setSelectedReportId(null); fetchReports(); }}
                        className="flex items-center gap-2 px-3 py-2 mr-4 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 transition-all text-sm font-medium shadow-sm group"
                        title="Volver al listado de reportes"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        <span>Volver al Panel</span>
                    </button>
                    <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600"><FileText className="w-5 h-5" /></div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Reporte Científico</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <DateRangePicker
                                startDate={dateRange.start}
                                endDate={dateRange.end}
                                onChange={handleDateChange}
                                disabled={!isEditingReport}
                            />
                        </div>
                    </div>
                </div>
                {/* Actions Toolbar */}
                <div className="flex items-center gap-3">
                    {canSubmit && (
                        <button onClick={handleSendReport} className="text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg text-sm font-bold border border-indigo-100">
                            Enviar
                        </button>
                    )}
                    {canEdit && (
                        <button
                            onClick={async () => {
                                // Guardar cambios explícito: persiste todas las secciones.
                                const keys = ['context', 'experimental', 'findings', 'difficulties', 'nextSteps'];
                                for (const k of keys) {
                                    // eslint-disable-next-line no-await-in-loop
                                    await persistSection(k, sections?.[k] || '');
                                }
                                setIsEditingReport(false);
                                fetchReports();
                            }}
                            className="px-4 py-2 rounded-lg text-sm font-bold border bg-white hover:bg-slate-50 text-slate-700"
                        >
                            Guardar cambios
                        </button>
                    )}
                    {!isAuthor && normalizedStatus !== 'draft' && (
                        (() => {
                            const myView = views?.find(v => v.user_id === currentUser?.id);
                            const seenAt = myView?.seen_at || myView?.viewed_at;
                            if (seenAt) {
                                return (
                                    <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-100">
                                        <Check className="w-4 h-4" /> Visto
                                    </div>
                                );
                            }
                            return (
                                <button onClick={handleMarkAsSeen} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                                    <Check className="w-4 h-4" /> Marcar como Visto
                                </button>
                            );
                        })()
                    )}
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="max-w-5xl mx-auto grid grid-cols-12 gap-8 pb-20">
                    <div className="col-span-12 lg:col-span-8 space-y-6">
                        <Section title="Contexto / Objetivo" icon={<Target className="text-blue-500" />} userRole={userRole} sectionKey="context" comments={comments?.filter(c => c.section_key === 'context')} onAddComment={addComment}>
                            <EditableArea isEditing={isEditingReport && canEdit} value={sections.context || ''} onChange={(v) => handleUpdateSection('context', v)} onBlur={() => persistSection('context', sections.context)} placeholder="Objetivo..." />
                        </Section>

                        <Section title="Trabajo Experimental" icon={<FlaskConical className="text-purple-500" />} userRole={userRole} sectionKey="experimental" comments={comments?.filter(c => c.section_key === 'experimental')} onAddComment={addComment}>
                            <EditableArea isEditing={isEditingReport && canEdit} value={sections.experimental || ''} onChange={(v) => handleUpdateSection('experimental', v)} onBlur={() => persistSection('experimental', sections.experimental)} placeholder="Detalles..." minHeight="h-32" />
                        </Section>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Section title="Hallazgos" icon={<Lightbulb className="text-amber-500" />} userRole={userRole} sectionKey="findings" comments={comments?.filter(c => c.section_key === 'findings')} onAddComment={addComment}>
                                <EditableArea isEditing={isEditingReport && canEdit} value={sections.findings || ''} onChange={(v) => handleUpdateSection('findings', v)} onBlur={() => persistSection('findings', sections.findings)} placeholder="Resultados..." />
                            </Section>
                            <Section title="Dificultades" icon={<AlertTriangle className="text-red-500" />} userRole={userRole} sectionKey="difficulties" comments={comments?.filter(c => c.section_key === 'difficulties')} onAddComment={addComment}>
                                <EditableArea isEditing={isEditingReport && canEdit} value={sections.difficulties || ''} onChange={(v) => handleUpdateSection('difficulties', v)} onBlur={() => persistSection('difficulties', sections.difficulties)} placeholder="Problemas..." />
                            </Section>
                        </div>
                        <Section title="Próximos Pasos" icon={<Target className="text-emerald-500" />} userRole={userRole} sectionKey="nextSteps" comments={comments?.filter(c => c.section_key === 'nextSteps')} onAddComment={addComment}>
                            <EditableArea isEditing={isEditingReport && canEdit} value={sections.nextSteps || ''} onChange={(v) => handleUpdateSection('nextSteps', v)} onBlur={() => persistSection('nextSteps', sections.nextSteps)} placeholder="Futuro..." />

                            {/* Linked Tasks List */}
                            <div className="mt-4 space-y-2">
                                {linkedTasks && linkedTasks.map(task => (
                                    <div key={task.id} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                                        <div className={clsx("w-2 h-2 rounded-full", task.status === 'done' ? "bg-emerald-500" : "bg-amber-500")} />
                                        <span className={clsx("flex-1 font-medium", task.status === 'done' && "line-through text-slate-400")}>{task.title}</span>
                                        <span className="text-xs text-slate-400">{new Date(task.due_date).toLocaleDateString()}</span>
                                    </div>
                                ))}

                                {isEditingReport && canEdit && (
                                    <button
                                        onClick={() => setIsTaskModalOpen(true)}
                                        className="mt-2 text-indigo-600 text-sm font-medium flex items-center gap-1 hover:underline"
                                    >
                                        <Plus className="w-4 h-4" /> Agregar Tarea
                                    </button>
                                )}
                            </div>
                        </Section>

                        {/* Resources Section */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                            <h3 className="font-bold text-slate-800 mb-4 flex gap-2 items-center">
                                <Library className="w-5 h-5 text-indigo-500" /> Recursos y Tareas
                            </h3>
                            <div className="space-y-4">
                                {isEditingReport && canEdit && (
                                    <button
                                        onClick={() => setIsResourceSelectorOpen(true)}
                                        className="text-sm text-indigo-600 font-medium hover:underline flex items-center gap-1"
                                    >
                                        <Plus className="w-4 h-4" /> Añadir Vínculo
                                    </button>
                                )}

                                {/* Display Linked Tasks */}
                                {linkedTasks?.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tareas Vinculadas</h4>
                                        {linkedTasks.map(tid => {
                                            const task = tasks.find(t => t.id === tid.id || t.id === tid); // Handle object or ID
                                            if (!task) return null;
                                            return (
                                                <div key={task.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm">
                                                    <span className={clsx("truncate", task.status === 'done' && 'line-through text-slate-400')}>
                                                        {task.title}
                                                    </span>
                                                    <button onClick={() => unlinkTask(task.id)} className="text-slate-400 hover:text-red-500">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {/* Display Linked Resources */}
                                {linkedResources?.length > 0 && (
                                    <div className="space-y-2 mt-4">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recursos Vinculados</h4>
                                        {linkedResources.map(res => (
                                            <div key={res.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm group">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <BookOpen className="w-4 h-4 text-indigo-500 shrink-0" />
                                                    <div className="truncate">
                                                        <a href={res.url || '#'} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 hover:underline block truncate">
                                                            {res.title}
                                                        </a>
                                                        <span className="text-xs text-slate-400 block truncate">{res.category}</span>
                                                    </div>
                                                </div>
                                                <button onClick={() => unlinkResource(res.id)} className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {isResourceSelectorOpen && (
                            <ResourceSelector
                                isOpen={isResourceSelectorOpen}
                                onClose={() => setIsResourceSelectorOpen(false)}
                                onSelect={handleSelectResources}
                                onCreate={handleCreateResource}
                                existingResources={knowledgeResources} // Pass global knowledge
                                linkedResourceIds={linkedResources?.map(r => r.id) || []}
                            />
                        )}

                    </div>

                    {/* Sidebar: Feedback & Metadata */}
                    <div className="col-span-12 lg:col-span-4 space-y-6">
                        <div className={clsx("p-5 rounded-xl border shadow-sm bg-white border-gray-200")}>
                            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-slate-500" /> Feedback General</h3>
                            <textarea
                                className="w-full bg-white p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                rows={6}
                                placeholder="Escribe feedback..."
                                value={activeReportMeta.supervisor_feedback || ''}
                                onChange={(e) => updateSupervisorFeedback(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>
            {/* Modals placeholders */}
            {isTaskModalOpen && (
                <TaskModal
                    isOpen={isTaskModalOpen}
                    onClose={() => setIsTaskModalOpen(false)}
                    onSave={handleSaveTask}
                    userProfile={userProfile}
                    userRole={userRole}
                />
            )}
        </div>
    );
}

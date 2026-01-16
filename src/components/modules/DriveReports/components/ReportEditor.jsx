import React, { useState, useEffect } from 'react';
import { Target, FlaskConical, Lightbulb, AlertTriangle, FileText, ArrowRight, X, Plus, Link as LinkIcon, CheckCircle2, Circle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { googleDriveService } from '@/components/modules/Drive/services/googleDriveService';
import DateRangePicker from '@/components/common/DateRangePicker';
import Knowledge from '../../Knowledge/Knowledge';
import { useTasks } from '../../Tasks/hooks/useTasks';
import TaskDetailPanel from '../../Tasks/components/TaskDetailPanel';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

// Reusable Section Component
const SectionCard = ({ title, icon: Icon, colorClass, children, className = "" }) => (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow ${className}`}>
        <div className={`px-5 py-3 border-b border-slate-100 flex items-center gap-3 ${colorClass} bg-opacity-5`}>
            <div className={`p-1.5 rounded-lg ${colorClass} text-white shadow-sm`}>
                <Icon className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">{title}</h3>
        </div>
        <div className="p-0">
            {children}
        </div>
    </div>
);

export default function ReportEditor({ report, onCancel, onGenerateSuccess }) {
    const { addDriveReport, updateDriveReport, currentUser, activeGroup, groupMembers, userProfile, reports } = useApp();
    const {
        createTask,
        updateTask,
        addComment: addTaskComment,
        tasks: allTasks
    } = useTasks();

    // --- State ---
    const initialStart = report.startDate || new Date().toISOString().slice(0, 10);
    const initialEnd = report.endDate || new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);

    const [startDate, setStartDate] = useState(initialStart);
    const [endDate, setEndDate] = useState(initialEnd);
    const [debugCount, setDebugCount] = useState(0); // Debug

    // Task Management State
    const [editingTaskId, setEditingTaskId] = useState(null);
    const selectedTask = allTasks.find(t => t.id === editingTaskId);

    const potentialAssignees = React.useMemo(() => {
        const members = groupMembers || [];
        if (currentUser && !members.find(m => m.id === currentUser.id)) {
            return [...members, { ...currentUser, name: currentUser.full_name || currentUser.name }];
        }
        return members;
    }, [groupMembers, currentUser]);

    // Debug: Calculate completed tasks count for UI
    useEffect(() => {
        if (!allTasks) return;
        const count = allTasks.filter(t => {
            if (t.status !== 'done' || !t.completedAt) return false;
            const cDate = t.completedAt.slice(0, 10);
            return cDate >= startDate && cDate <= endDate;
        }).length;
        setDebugCount(count);
    }, [allTasks, startDate, endDate]);

    // Legacy support or fallback
    const [sections, setSections] = useState({
        context: report.sections?.context || '',
        experimental: report.sections?.experimental || '',
        findings: report.sections?.findings || '',
        difficulties: report.sections?.difficulties || '',
        nextSteps: report.sections?.nextSteps || '',
        tasks: report.sections?.tasks || [],
        resources: report.sections?.resources || []
    });

    const [generating, setGenerating] = useState(false);
    const [localReportId, setLocalReportId] = useState(report.id);

    // Inputs for adding items
    const [newTaskInput, setNewTaskInput] = useState('');
    const [isAddingTask, setIsAddingTask] = useState(false);
    const [newResource, setNewResource] = useState({ title: '', url: '' });
    const [isAddingResource, setIsAddingResource] = useState(false);

    // --- Helpers ---
    const formatDateShort = (d) => {
        if (!d) return '...';
        return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    };
    const getPeriodLabel = () => `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`;
    const getTitle = () => {
        if (!startDate || !endDate) return `Reporte - ${currentUser?.full_name || 'Usuario'}`;

        try {
            const d1 = new Date(startDate);
            const d2 = new Date(endDate);
            const m1 = d1.toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' });
            const m2 = d2.toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' });
            const y1 = d1.getUTCFullYear();
            const y2 = d2.getUTCFullYear();
            const day1 = d1.getUTCDate();
            const day2 = d2.getUTCDate();

            // Capitalize months
            const M1 = m1.charAt(0).toUpperCase() + m1.slice(1);
            const M2 = m2.charAt(0).toUpperCase() + m2.slice(1);

            let dateStr = '';
            if (y1 === y2 && m1 === m2) {
                dateStr = `${day1}-${day2} ${M1} ${y1}`;
            } else if (y1 === y2) {
                dateStr = `${day1} ${M1} - ${day2} ${M2} ${y1}`;
            } else {
                dateStr = `${day1} ${M1} ${y1} - ${day2} ${M2} ${y2}`;
            }

            // Simplified format: "Report 27-30 Ene 2026 - Rodrigo"
            // Using first name only if available to save space
            const author = currentUser?.full_name ? currentUser.full_name.split(' ')[0] : (currentUser?.name || 'Usuario');
            return `Report ${dateStr} - ${author}`;
        } catch (e) {
            return `Report ${startDate} - ${currentUser?.full_name || 'Usuario'}`;
        }
    };

    // --- Persistence ---
    const saveToDb = async (updatedSections, sDate = startDate, eDate = endDate) => {
        const payload = {
            title: getTitle(),
            startDate: sDate,
            endDate: eDate,
            period: sDate.slice(0, 7),
            sections: updatedSections,
            author_name: currentUser?.full_name,
            author_id: currentUser?.id, // Fix: Add author_id
            type: report.type // PERSIST TYPE
        };

        if (localReportId.toString().startsWith('temp_')) {
            try {
                const created = await addDriveReport({
                    ...payload,
                    status: 'draft',
                    drive_file_id: null
                });
                if (created) setLocalReportId(created.id);
            } catch (e) {
                console.error("Autosave creation failed", e);
            }
        } else {
            await updateDriveReport(localReportId, payload);
        }
    };

    const handleSectionChange = (key, value) => {
        const newSections = { ...sections, [key]: value };
        setSections(newSections);
        saveToDb(newSections);
    };

    const handleDateRangeChange = (start, end) => {
        setStartDate(start);
        setEndDate(end); // Update state immediately

        // Only save if we have both or if logic permits partial (but db might prefer ranges)
        if (start && end) {
            saveToDb(sections, start, end);
        }
    };

    // --- Task Logic (Global Manager) ---
    const handleAddGlobalTask = async () => {
        // Create a task linked to this report (or placeholder ID if not saved yet)
        const sourceId = localReportId;

        const { data: newTask, error } = await createTask({
            title: 'Nueva Tarea del Reporte',
            description: '',
            status: 'todo',
            priority: 'medium',
            sourceReportId: sourceId
        });

        if (newTask) {
            setEditingTaskId(newTask.id);
        }
    };

    const handleTaskUpdate = async (taskId, field, value) => {
        const updates = { [field]: value };
        // Handle explicit status side-effects if needed (e.g. completed_at)
        // For now, simple update is enough as useTasks/MockDB might handle some, 
        // but let's mimic Tasks.jsx logic for consistency if desired.
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

    // Filter tasks for this report
    const reportTasks = allTasks.filter(t => t.sourceReportId === localReportId);

    // Keep legacy Remove/Toggle logic just in case, but unused for global tasks
    // We could map global tasks to sections.tasks for persistence if needed, 
    // but typically they live in their own table. 
    // The previous implementation stored them in the JSON 'sections' blob.
    // Transition strategy: View both? Or migrate?
    // For now we view GLOBAL tasks linked. 
    // If user wants to see old tasks, we might need a migration or just display them as read-only.

    // --- Resource Logic ---
    const addResource = () => {
        if (!newResource.title.trim() || !newResource.url.trim()) return;
        const newRes = { id: Date.now(), ...newResource };
        const newResources = [...sections.resources, newRes];
        handleSectionChange('resources', newResources);
        setNewResource({ title: '', url: '' });
        setIsAddingResource(false);
    };

    const removeResource = (id) => {
        const newResources = sections.resources.filter(r => r.id !== id);
        handleSectionChange('resources', newResources);
    };


    // --- Generation ---
    const handleGenerate = async (retry = true) => {
        if (!window.confirm("¿Generar documento en Google Drive?")) return;

        try {
            setGenerating(true);
            const token = window.gapi?.client?.getToken();
            if (!token) await googleDriveService.requestAccessToken();

            const meta = {
                period: getPeriodLabel(),
                startDate,
                endDate,
                authorName: currentUser?.full_name || 'Usuario',
            };

            const folderId = activeGroup?.drive_settings?.folderId;

            // Combine legacy tasks with global tasks for the doc
            // We use 'reportTasks' which is available in component scope thanks to useTasks

            // 1. Filter Completed Tasks in Period (Global) or specific logic as requested
            console.log("Filtering tasks for period:", { startDate, endDate, totalTasks: allTasks.length });

            const completedPeriodTasks = allTasks.filter(t => {
                // Log for debugging (temporary)
                // console.log("Checking task:", t.title, t.status, t.completedAt);

                if (t.status !== 'done' || !t.completedAt) return false;
                // Simple date comparison strings YYYY-MM-DD
                const cDate = t.completedAt.slice(0, 10);
                const inRange = cDate >= startDate && cDate <= endDate;
                if (inRange) console.log("Found completed task in period:", t.title, cDate);
                return inRange;
            });

            // UI Debug
            // setDebugCount(completedPeriodTasks.length); // Can't set state in render/handle, wait
            // This is handleGenerate, so fine to log, but UI update won't show untill next render? 
            // We want to see it *before* generating.

            console.log("Final Completed Tasks Count:", completedPeriodTasks.length);

            const docSections = {
                ...sections,
                tasks: [...(sections.tasks || []), ...reportTasks],
                completedTasks: completedPeriodTasks
            };

            const finalFile = await googleDriveService.generateReportDoc(
                getTitle(),
                meta,
                docSections,
                folderId
            );

            // Final Update
            let finalId = localReportId;
            const reportData = {
                drive_file_id: finalFile.id,
                webViewLink: finalFile.webViewLink,
                status: 'pending',
                title: getTitle(),
                startDate,
                endDate,
                sections,
                type: report.type, // Ensure type is persisted
                author_id: currentUser?.id // Fix: Add author_id
            };

            if (localReportId.toString().startsWith('temp_')) {
                const created = await addDriveReport({ ...reportData, author_name: currentUser?.full_name });
                finalId = created?.id;
            } else {
                await updateDriveReport(finalId, reportData);
            }

            onGenerateSuccess(finalFile.id);
            if (finalFile.webViewLink) window.open(finalFile.webViewLink, '_blank');

        } catch (error) {
            console.error("Generator Error:", error);

            // Auto-Retry on 401 (Auth Error)
            if (retry && (error.result?.error?.code === 401 || error.status === 401 || error.message?.includes('401'))) {
                console.log("Auth expired, refreshing token and retrying...");
                try {
                    await googleDriveService.requestAccessToken();
                    // Recursive retry with retry=false (prevent infinite loop)
                    return handleGenerate(false);
                } catch (authError) {
                    console.error("Re-auth failed:", authError);
                    alert("Error de autenticación: Por favor recarga la página e intenta de nuevo.");
                }
            } else {
                alert("Error al generar: " + (error.message || "Desconocido"));
            }
        } finally {
            // Only stop spinner if we are NOT retrying
            // If we recursively called handleGenerate, the new call will manage state.
            // But wait, the recursive call is awaited? No, I returned it.
            // If I return the promise, I should await it?

            // Logic fix: The finally block runs for THIS call. 
            // If I return, finally runs. 
            // So I should only setGenerating(false) if I am NOT retrying.
            // How to know? I can't easily know if the catch block triggered a return.

            // Simpler: Move setGenerating(false) to explicit success/failure paths, OR check a flag.
            // Actually, if I return handleGenerate(false), that function will setGenerating(true) again (redundant but fine).
            // But THIS function's 'finally' will run immediately before the return completes? 
            // In async functions, 'finally' runs after the try/catch.

            // If I return a promise in catch, the function is done.
            // Use 'generating' state management carefully.
            setGenerating(false);
        }
    };

    // --- Knowledge Selection ---
    const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);

    const handleSelectKnowledge = (knowledgeItems) => {
        // Ensure array
        const items = Array.isArray(knowledgeItems) ? knowledgeItems : [knowledgeItems];

        const newResourcesToAdd = items.map(item => ({
            id: Date.now() + Math.random(), // Unique ID
            title: item.title,
            url: item.url
        }));

        const newResources = [...sections.resources, ...newResourcesToAdd];
        handleSectionChange('resources', newResources);
        setIsKnowledgeModalOpen(false);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0 sticky top-0 z-10 shadow-sm">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        Reporte Científico
                        {/* Custom Period Picker */}
                        <div className="ml-2">
                            <DateRangePicker
                                startDate={startDate}
                                endDate={endDate}
                                onChange={handleDateRangeChange}
                                disabled={!!report.drive_file_id}
                            />
                        </div>
                    </h2>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={onCancel} className="text-slate-500 hover:text-slate-700 font-medium text-sm px-4">
                        Cancelar
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md flex items-center gap-2 disabled:opacity-50"
                    >
                        {generating ? (
                            <>Generando...</>
                        ) : (
                            <>
                                Generar Doc
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                <div className="max-w-5xl mx-auto space-y-6 pb-20">

                    {/* 1. Context / Objective */}
                    <SectionCard title="Contexto / Objetivo" icon={Target} colorClass="bg-blue-500">
                        <textarea
                            className="w-full p-4 min-h-[100px] outline-none text-sm text-slate-600 resize-y focus:bg-slate-50 transition-colors"
                            placeholder="Describe el objetivo principal de este periodo..."
                            value={sections.context}
                            onChange={(e) => handleSectionChange('context', e.target.value)}
                        />
                    </SectionCard>

                    {/* 2. Experimental Work */}
                    <SectionCard title="Trabajo Experimental" icon={FlaskConical} colorClass="bg-purple-500">
                        <textarea
                            className="w-full p-4 min-h-[120px] outline-none text-sm text-slate-600 resize-y focus:bg-slate-50 transition-colors"
                            placeholder="Detalles sobre experimentos, metodologías y procesos..."
                            value={sections.experimental}
                            onChange={(e) => handleSectionChange('experimental', e.target.value)}
                        />
                    </SectionCard>

                    {/* 3. Grid: Findings & Difficulties */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <SectionCard title="Hallazgos" icon={Lightbulb} colorClass="bg-amber-500">
                            <textarea
                                className="w-full p-4 min-h-[150px] outline-none text-sm text-slate-600 resize-none focus:bg-slate-50 transition-colors"
                                placeholder="Resultados clave y descubrimientos..."
                                value={sections.findings}
                                onChange={(e) => handleSectionChange('findings', e.target.value)}
                            />
                        </SectionCard>
                        <SectionCard title="Dificultades" icon={AlertTriangle} colorClass="bg-red-500">
                            <textarea
                                className="w-full p-4 min-h-[150px] outline-none text-sm text-slate-600 resize-none focus:bg-slate-50 transition-colors"
                                placeholder="Problemas encontrados o bloqueos..."
                                value={sections.difficulties}
                                onChange={(e) => handleSectionChange('difficulties', e.target.value)}
                            />
                        </SectionCard>
                    </div>

                    {/* 4. Next Steps & Tasks */}
                    <SectionCard title="Próximos Pasos" icon={Target} colorClass="bg-emerald-500">
                        <div className="flex flex-col">
                            <textarea
                                className="w-full p-4 min-h-[80px] outline-none text-sm text-slate-600 resize-y focus:bg-slate-50 border-b border-slate-100 placeholder:text-slate-400"
                                placeholder="Describe el plan general para la próxima semana..."
                                value={sections.nextSteps}
                                onChange={(e) => handleSectionChange('nextSteps', e.target.value)}
                            />

                            {/* Task List (Global) */}
                            <div className="p-4 bg-slate-50/50">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 px-1">Tareas Específicas</h4>
                                <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between">
                                    <div className="text-xs text-slate-400">
                                        {localReportId.toString().startsWith('temp_') ? 'Borrador no guardado' : 'Guardado automáticamente'}
                                        <span className="ml-2 text-indigo-400" title="Debug: Tareas completadas en rango">
                                            (Tareas Completadas: {debugCount})
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {/* This div seems to be misplaced from the original instruction.
                            The instruction provided a malformed snippet that included parts of the task mapping.
                            I'm inserting the debug count div as requested, and then closing the div that contains it.
                            The original `space-y-2 mb-3` div that wraps the tasks will follow.
                        */}
                                    </div>
                                </div>
                                <div className="space-y-2 mb-3">
                                    {reportTasks.map(task => (
                                        <div
                                            key={task.id}
                                            className="flex items-center gap-3 group bg-white p-2 rounded border border-slate-200 hover:border-indigo-300 cursor-pointer transition-all"
                                            onClick={() => setEditingTaskId(task.id)}
                                        >
                                            <div className={clsx("w-5 h-5 rounded border flex items-center justify-center transition-colors", task.status === 'done' ? "bg-emerald-500 border-emerald-500" : "border-slate-300")}>
                                                {task.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={clsx("text-sm font-medium truncate", task.status === 'done' ? "text-slate-400 line-through" : "text-slate-700")}>
                                                    {task.title}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className={clsx("text-[9px] px-1.5 py-0 rounded font-bold uppercase",
                                                        task.priority === 'high' ? "bg-red-100 text-red-600" :
                                                            task.priority === 'medium' ? "bg-amber-100 text-amber-600" :
                                                                "bg-blue-100 text-blue-600")}>
                                                        {task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Media' : 'Baja'}
                                                    </span>
                                                    {task.assignedTo && <span className="text-[9px] text-slate-400">Asignado a: {task.assignedTo}</span>}
                                                </div>
                                            </div>
                                            <div className="text-xs text-slate-400 opacity-0 group-hover:opacity-100">
                                                Editar
                                            </div>
                                        </div>
                                    ))}
                                    {reportTasks.length === 0 && (
                                        <div className="text-center text-slate-400 italic text-xs py-2">No hay tareas creadas</div>
                                    )}
                                </div>

                                <button
                                    onClick={handleAddGlobalTask}
                                    className="text-indigo-600 hover:text-indigo-700 text-sm font-semibold flex items-center gap-1.5 py-1 px-1 rounded-md hover:bg-indigo-50 transition-colors"
                                >
                                    <Plus className="w-4 h-4" /> Agregar Tarea
                                </button>
                            </div>
                        </div>
                    </SectionCard>

                    {/* 5. Resources */}
                    <SectionCard title="Recursos y Tareas" icon={LinkIcon} colorClass="bg-indigo-500">
                        <div className="p-4">
                            {sections.resources.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                    {sections.resources.map(res => (
                                        <div key={res.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors group">
                                            <div className="p-2 bg-indigo-50 text-indigo-500 rounded-full">
                                                <LinkIcon className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm text-slate-700 truncate">{res.title}</div>
                                                <div className="text-xs text-slate-400 truncate">{res.url}</div>
                                            </div>
                                            <button
                                                onClick={() => removeResource(res.id)}
                                                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-slate-400 text-sm py-4 italic">
                                    No hay recursos vinculados.
                                </div>
                            )}

                            <div className="flex flex-col gap-3">
                                {isAddingResource ? (
                                    <div className="bg-slate-50 p-3 rounded-lg border border-indigo-100 flex flex-col md:flex-row gap-3">
                                        <input
                                            type="text"
                                            placeholder="Título (ej: Paper Referencia)"
                                            className="flex-1 text-sm border-slate-200 rounded-md px-3 py-2"
                                            value={newResource.title}
                                            onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
                                        />
                                        <input
                                            type="text"
                                            placeholder="URL (https://...)"
                                            className="flex-1 text-sm border-slate-200 rounded-md px-3 py-2"
                                            value={newResource.url}
                                            onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                                        />
                                        <div className="flex items-center gap-2">
                                            <button onClick={addResource} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-bold">Añadir</button>
                                            <button onClick={() => setIsAddingResource(false)} className="text-slate-500 px-2">Cancelar</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => setIsAddingResource(true)}
                                            className="text-slate-600 hover:text-indigo-700 text-sm font-medium flex items-center gap-1.5"
                                        >
                                            <Plus className="w-4 h-4" /> Añadir Manualmente
                                        </button>
                                        <button
                                            onClick={() => setIsKnowledgeModalOpen(true)}
                                            className="text-indigo-600 hover:text-indigo-800 text-sm font-bold flex items-center gap-1.5"
                                        >
                                            <Target className="w-4 h-4" /> Seleccionar de Libro de Conocimiento
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </SectionCard>

                </div>
            </div>

            {/* Knowledge Selection Modal */}
            {isKnowledgeModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex-1 bg-slate-50 overflow-hidden relative">
                            {/* Close Button Overlay */}
                            <button
                                onClick={() => setIsKnowledgeModalOpen(false)}
                                className="absolute top-4 right-4 z-50 p-2 bg-white rounded-full shadow-md text-slate-400 hover:text-red-500 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <Knowledge isSelectorMode={true} onSelect={handleSelectKnowledge} />
                        </div>
                    </div>
                </div>
            )}
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
                                reports={reports}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}

'use client';

import React, { useState, useEffect } from 'react';
import {
    CheckSquare, Plus, Clock, Trash2, CheckCircle2, X,
    ArrowUpDown, Filter, Search, Calendar, UserCircle, FileText
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useTasks } from './hooks/useTasks';
import { formatDateShort, formatDateLong, getDaysSince, getWeekLabel } from '@/utils/helpers';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import TaskDetailPanel from './components/TaskDetailPanel';
import TaskItem from './components/TaskItem';

export default function Tasks() {
    const {
        reports, driveReports, setActiveModule, setSelectedReportId,
        userRole, userProfile, addActivity, currentUser,
        selectedTaskId, setSelectedTaskId
    } = useApp();
    const { activeGroupId, activeGroup, groupMembers } = useApp();

    const {
        tasks,
        loading,
        createTask,
        updateTask,
        deleteTask,
        addComment,
        fetchTasks
    } = useTasks();

    useEffect(() => {
        // Initial fetch handled by hook, but we can force it if needed
        // fetchTasks();
    }, [activeGroupId]);


    const [currentComment, setCurrentComment] = useState('');
    const [sortCriteria, setSortCriteria] = useState('newest');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterPriority, setFilterPriority] = useState('all');
    const [filterViewMode, setFilterViewMode] = useState('my'); // 'my' or 'all'
    const [filterAssignee, setFilterAssignee] = useState('all'); // 'all' or user ID
    const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);

    const selectedTask = tasks.find(t => t.id === selectedTaskId);

    const potentialAssignees = React.useMemo(() => {
        const members = groupMembers || [];
        if (currentUser && !members.find(m => m.id === currentUser.id)) {
            return [...members, { ...currentUser, name: currentUser.full_name || currentUser.name }];
        }
        return members;
    }, [groupMembers, currentUser]);

    const handleAddTask = async () => {
        const { data: createdTask, error } = await createTask({
            title: 'Nueva Tarea (Borrador)',
            description: '',
            status: 'todo',
            priority: 'medium'
        });

        if (error) {
            alert(`Error al crear la tarea: ${error}`);
            console.error(error);
            return;
        }

        if (createdTask) {
            setSelectedTaskId(createdTask.id);
            addActivity({
                type: 'task',
                content: 'ha creado una nueva tarea',
                author: currentUser.name,
                link: { module: 'tasks', id: createdTask.id, label: 'Nueva Tarea' }
            });
        }
    };

    const getSourceReportLabel = (reportId) => {
        if (!reportId) return null;
        // Search in reports context first
        const report = reports.find(r => r.id === reportId);
        if (report) {
            return `Reporte ${getWeekLabel(report.startDate, report.endDate)}`;
        }
        // Search in Drive Reports
        const driveReport = driveReports.find(r => r.id === reportId);
        if (driveReport) {
            return driveReport.title || `Reporte Drive`;
        }
        // If not in context (maybe legacy or deleted), format the ID partially
        return `Reporte (ref: ${reportId.substr(0, 8)}...)`;
    };

    const handleNavigateToReport = (e, reportId) => {
        e.stopPropagation();

        // Determine target module
        const isStandard = reports.some(r => r.id === reportId);
        const isDrive = driveReports.some(r => r.id === reportId);

        if (isStandard) {
            setSelectedReportId(reportId);
            setActiveModule('reports');
            // Use window.location with query param to persist highlight across reload
            window.location.href = `/reports?highlight=${reportId}`;
        } else if (isDrive) {
            setSelectedReportId(reportId);
            setActiveModule('drive_reports');
            window.location.href = `/drive-reports?highlight=${reportId}`;
        } else {
            alert("No se encontró el reporte original (puede haber sido eliminado).");
        }
    };

    const handleTaskUpdate = async (taskId, field, value) => {
        // Database Update
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

        console.log(`handleTaskUpdate: ${taskId}, ${field}, ${value}`);
        const result = await updateTask(taskId, updates);
        if (result && result.error) {
            console.error("Update task failed:", result.error);
            alert("Error updating task: " + (result.error.message || result.error));
        }

        if (field === 'status' && value === 'done') {
            const task = tasks.find(t => t.id === taskId);
            addActivity({
                type: 'task',
                content: `ha completado la tarea "${task?.title}"`,
                author: currentUser?.name || 'Usuario',
                link: { module: 'tasks', id: taskId, label: `Tarea: ${task?.title}` }
            });
        }
    };

    const handleTaskDelete = async (taskId) => {
        if (selectedTaskId === taskId) setSelectedTaskId(null);

        const { error } = await deleteTask(taskId);
        if (error) {
            alert("Error eliminando tarea: " + error.message || error);
            console.error("Error deleting task:", error);
        }
    };

    const handleAddTaskComment = async (taskId, text) => {
        await addTaskComment(taskId, text);
    };

    const getSortedTasks = (taskList) => {
        let sorted = [...taskList];

        // Filter by View Mode (My Tasks / All Tasks)
        if (filterViewMode === 'my') {
            sorted = sorted.filter(t =>
                t.assignees?.some(a => a.user_id === userProfile?.id) ||
                t.assignedTo === userProfile?.name ||
                t.created_by === userProfile?.id
            );
        }

        // Filter by Assignee
        if (filterAssignee !== 'all') {
            sorted = sorted.filter(t =>
                t.assignees?.some(a => a.user_id === filterAssignee) ||
                (t.created_by === filterAssignee && (!t.assignees || t.assignees.length === 0))
            );
        }

        // Filter by Search
        if (searchQuery) {
            const lowerQ = searchQuery.toLowerCase();
            sorted = sorted.filter(t => t.title.toLowerCase().includes(lowerQ) || (t.description && t.description.toLowerCase().includes(lowerQ)));
        }

        // Filter by Priority
        if (filterPriority !== 'all') {
            sorted = sorted.filter(t => t.priority === filterPriority);
        }

        // Sort
        return sorted.sort((a, b) => {
            if (sortCriteria === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
            if (sortCriteria === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
            if (sortCriteria === 'priority') {
                const map = { high: 3, medium: 2, low: 1 };
                return map[b.priority] - map[a.priority];
            }
            if (sortCriteria === 'dueDate') {
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return new Date(a.dueDate) - new Date(b.dueDate);
            }
            return 0;
        });
    };

    const sortedAllTasks = getSortedTasks(tasks.filter(t => t.groupId === activeGroupId));
    const activeTasks = sortedAllTasks.filter(t => t.status !== 'done');
    const completedTasks = sortedAllTasks.filter(t => t.status === 'done');

    return (
        <div className="flex h-full animate-in fade-in duration-300">
            <div className={clsx("flex-1 flex flex-col h-full border-r border-gray-200 bg-white transition-all duration-300", selectedTaskId ? 'w-2/3' : 'w-full')}>
                <header className="p-6 border-b border-gray-200 bg-slate-50 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <div><h2 className="text-xl font-bold text-slate-800 flex items-center gap-3"><CheckSquare className="w-6 h-6 text-indigo-600" /> Gestor de Tareas Global</h2></div>
                        <button
                            onClick={handleAddTask}
                            disabled={!activeGroupId}
                            title={!activeGroupId ? "Selecciona un grupo para crear tareas" : ""}
                            className={clsx(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors",
                                !activeGroupId ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 text-white"
                            )}
                        >
                            <Plus className="w-4 h-4" /> Nueva Tarea
                        </button>
                    </div>

                    {/* Filters Bar */}
                    <div className="flex items-center gap-4 text-xs flex-wrap">
                        {/* View Mode Toggle */}
                        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
                            <button
                                onClick={() => setFilterViewMode('my')}
                                className={clsx("px-3 py-1.5 rounded-md font-medium transition-all",
                                    filterViewMode === 'my' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                                )}
                            >
                                Mis Tareas
                            </button>
                            <button
                                onClick={() => setFilterViewMode('all')}
                                className={clsx("px-3 py-1.5 rounded-md font-medium transition-all",
                                    filterViewMode === 'all' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                                )}
                            >
                                Todas
                            </button>
                        </div>

                        {/* Search */}
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm flex-1 max-w-sm">
                            <Search className="w-3.5 h-3.5 text-slate-400" />
                            <input className="bg-transparent border-none outline-none w-full text-slate-600" placeholder="Buscar tarea..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>

                        {/* Assignee Filter */}
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
                            <UserCircle className="w-3.5 h-3.5 text-slate-400" />
                            <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="bg-transparent outline-none text-slate-600 font-medium cursor-pointer">
                                <option value="all">Todos</option>
                                {potentialAssignees.map(member => (
                                    <option key={member.id} value={member.id}>{member.full_name || member.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Sort */}
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
                            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                            <select value={sortCriteria} onChange={(e) => setSortCriteria(e.target.value)} className="bg-transparent outline-none text-slate-600 font-medium cursor-pointer">
                                <option value="newest">Recientes</option>
                                <option value="oldest">Antiguas</option>
                                <option value="priority">Prioridad</option>
                                <option value="dueDate">Fecha Límite</option>
                            </select>
                        </div>

                        {/* Priority Filter */}
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
                            <Filter className="w-3.5 h-3.5 text-slate-400" />
                            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="bg-transparent outline-none text-slate-600 font-medium cursor-pointer">
                                <option value="all">Todas Prioridades</option>
                                <option value="high">Alta</option>
                                <option value="medium">Media</option>
                                <option value="low">Baja</option>
                            </select>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
                    <div className="space-y-3 max-w-4xl mx-auto">
                        {activeTasks.length === 0 && (
                            <div className="text-center py-10 text-slate-400">
                                <p>No se encontraron tareas pendientes.</p>
                            </div>
                        )}
                        {activeTasks.map(task => (
                            <TaskItem
                                key={task.id}
                                task={task}
                                isSelected={selectedTaskId === task.id}
                                onClick={() => setSelectedTaskId(task.id)}
                                onUpdate={handleTaskUpdate}
                                onDelete={handleTaskDelete}
                                onNavigateReport={handleNavigateToReport}
                                potentialAssignees={potentialAssignees}
                                getSourceReportLabel={getSourceReportLabel}
                            />
                        ))}

                        {completedTasks.length > 0 && (
                            <div className="mt-8 border-t border-gray-200 pt-6">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Completadas ({completedTasks.length})</h4>
                                <div className="space-y-2 opacity-70">
                                    {completedTasks.map(task => (
                                        <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className={clsx("flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white cursor-pointer hover:border-indigo-300 transition-colors", selectedTaskId === task.id ? 'ring-1 ring-indigo-300' : '')}>
                                            <button onClick={(e) => { e.stopPropagation(); handleTaskUpdate(task.id, 'status', 'todo'); }} className="w-5 h-5 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                                            <div className="flex-1 overflow-hidden">
                                                <span className="text-sm text-slate-500 line-through truncate block">{task.title}</span>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-slate-400">Finalizada el {task.completedAt ? formatDateLong(task.completedAt) : 'Fecha desconocida'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Task Details Sidebar */}
            <AnimatePresence>
                {selectedTaskId && selectedTask && (
                    <motion.div
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="w-[400px] border-l border-gray-200 bg-white flex flex-col h-full shadow-xl z-20"
                    >


                        <TaskDetailPanel
                            selectedTask={selectedTask}
                            currentUser={currentUser}
                            potentialAssignees={potentialAssignees}
                            onClose={() => setSelectedTaskId(null)}
                            onUpdate={handleTaskUpdate}
                            onAddComment={addTaskComment}
                            reports={reports}
                            driveReports={driveReports}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

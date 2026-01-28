'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, CheckCircle2, AlertCircle, Clock, Calendar, ChevronRight, User, ArrowUpRight, Plus, CheckSquare, FileText } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useTasks } from '../Tasks/hooks/useTasks';
import { useDriveReports } from '../DriveReports/hooks/useDriveReports';
import { formatDateShort, getDaysSince, formatTime, getWeekLabel } from '@/utils/helpers';
import clsx from 'clsx';
import ActivityFeed from './components/ActivityFeed';
import DriveReportCard from '../DriveReports/components/DriveReportCard';
import { AnimatePresence, motion } from 'framer-motion';
import TaskDetailPanel from '../Tasks/components/TaskDetailPanel';
import { X } from 'lucide-react';
import Announcements from './components/Announcements';
// CommentModal import removed as it does not exist yet.
// Using redirection for now.
// I should extract Modals too but for now I'll implement standard Modals in Dashboard or similiar.
// Better: DriveReportCard handles JUST the card. I need the modals here.

export default function Dashboard() {
    const router = useRouter();
    const {
        userProfile,
        activeGroupId,
        activeGroupName,
        groupMembers,
        setSelectedReportId,
        selectedTaskId,
        setSelectedTaskId,
        currentUser
    } = useApp();

    const { driveReports, deleteDriveReport, updateDriveReport, markAsSeen } = useDriveReports();

    const [isLoadingReports, setIsLoadingReports] = useState(true); // Maybe not needed if driveReports comes from context

    // --- DASHBOARD ACTIONS STATE ---
    const [activeCommentReport, setActiveCommentReport] = useState(null);
    const [activeTaskReport, setActiveTaskReport] = useState(null);

    const {
        tasks,
        fetchTasks,
        loading: loadingTasks,
        createTask,
        updateTask,
        deleteTask,
        addComment: addTaskComment
    } = useTasks();

    // Task Sidebar Logic
    const selectedTask = tasks.find(t => t.id === selectedTaskId);

    const potentialAssignees = React.useMemo(() => {
        const members = groupMembers || [];
        if (currentUser && !members.find(m => m.id === currentUser.id)) {
            return [...members, { ...currentUser, name: currentUser.full_name || currentUser.name }];
        }
        return members;
    }, [groupMembers, currentUser]);

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

    const handleTaskDelete = async (taskId) => {
        if (selectedTaskId === taskId) setSelectedTaskId(null);
        await deleteTask(taskId);
    };

    const handleAddTaskComment = async (taskId, text) => {
        await addTaskComment(taskId, text);
    };

    // Derived Stats & Filtering
    const myActiveTasks = (tasks || []).filter(t =>
        t.status !== 'done' &&
        (t.assignees?.some(a => a.user_id === userProfile?.id) || t.assignedTo === userProfile?.name)
    );

    const isSupervisor = userProfile?.system_role === 'admin' || groupMembers?.some(m => m.user_id === userProfile?.id && (m.role === 'supervisor' || m.role === 'labmanager'));

    // Alias driveReports as reports for legacy compatibility in counters or filtering
    // and provide simple review logic based on status
    const reports = driveReports || [];

    // Dashboard Stats Logic (Updated for Drive Reports)
    // "Por Revisar" -> Drive Reports NOT seen by current user
    const statsToReview = (driveReports || []).filter(r => !r.seen_by?.includes(currentUser?.id)).length;

    // "Vistos" (formerly Aprobados) -> Drive Reports SEEN by current user
    const statsSeen = (driveReports || []).filter(r => r.seen_by?.includes(currentUser?.id)).length;

    // --- DRIVE REPORTS LOGIC ---

    // Sort Drive Reports: Unseen first, then newest
    // Sort Drive Reports: Unseen first, then newest
    const sortedDriveReports = React.useMemo(() => {
        if (!driveReports) return [];
        // Filter: Only show reports NOT seen by current user
        const unseenReports = driveReports.filter(r => !r.seen_by?.includes(currentUser?.id));

        return unseenReports.sort((a, b) => {
            // Newest first
            return new Date(b.created_at || b.startDate) - new Date(a.created_at || a.startDate);
        });
    }, [driveReports, currentUser]);

    // Handlers
    const handleCreateNewTask = async () => {
        if (!activeGroupId) {
            alert("No hay un grupo activo para crear tareas.");
            return;
        }

        const { data: createdTask, error } = await createTask({
            title: 'Nueva Tarea (Borrador)',
            description: '',
            status: 'todo',
            priority: 'medium'
        });

        if (error) {
            alert(`Error al crear la tarea: ${error}`);
            return;
        }

        if (createdTask) {
            setSelectedTaskId(createdTask.id);
            // Redirection removed to stay in dashboard
        }
    };

    // --- DRIVE REPORTS LOGIC ---
    const handleToggleSeen = async (report) => {
        try {
            await markAsSeen(report.id);
        } catch (error) {
            console.error('Error toggling seen status:', error);
        }
    };

    const handleDeleteReport = async (report) => {
        if (window.confirm("¿Eliminar este reporte permanentemente?")) {
            await deleteDriveReport(report.id);
        }
    };

    const handleNavigateDriveReport = (report) => {
        // Navigate to Drive Module Library or Detail?
        // Usually Open Web Link logic is in Card, but here we might want to go to app module
        router.push('/drive-reports');
    };

    // --- END DRIVE REPORTS LOGIC ---

    const approvedCount = 0; // Legacy placeholder or calc from drive reports if needed

    const getStatusColor = (status) => {
        switch (status) {
            case 'done': return 'bg-green-100 text-green-700 border-green-200';
            case 'in_progress': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'todo': return 'bg-gray-100 text-gray-700 border-gray-200';
            default: return 'bg-gray-50 text-gray-500 border-gray-200';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'done': return 'Completada';
            case 'in_progress': return 'En Progreso';
            case 'todo': return 'Pendiente';
            default: return status;
        }
    };

    // Navigation Handlers
    const handleNavigateTasks = () => {
        router.push('/tasks');
    };

    const handleNavigateReport = (reportId) => {
        setSelectedReportId(reportId);
        router.push('/reports');
    };

    const handleNavigateTask = (taskId) => {
        setSelectedTaskId(taskId);
        router.push('/tasks');
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/50 animate-in fade-in duration-500">
            {/* Header - Compact */}
            <header className="px-4 py-3 bg-white border-b border-gray-200 shadow-sm flex justify-between items-center">
                <div>
                    <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <LayoutDashboard className="w-5 h-5 text-indigo-600" />
                        Dashboard
                    </h1>
                    <p className="text-xs text-slate-500 pl-1">
                        Hola <span className="font-bold text-indigo-600">{userProfile?.name}</span>, aquí tienes el resumen de tu actividad.
                    </p>
                </div>
                <div className="flex gap-4">
                    <div className="text-right hidden md:block">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Grupo Activo</p>
                        <p className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-full text-xs inline-block">{activeGroupName}</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-hidden p-4">
                <div className="max-w-7xl mx-auto h-full flex flex-col gap-4">

                    {/* Compact Stats Row - Fixed */}
                    <div className="flex flex-wrap items-center gap-2 text-xs flex-shrink-0">
                        <div className="px-2 py-1 bg-white rounded-full border border-gray-200 text-slate-600 flex items-center gap-1.5 shadow-sm">
                            <AlertCircle className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="font-medium">Mis Tareas:</span>
                            <span className="font-bold text-slate-800">{myActiveTasks.length}</span>
                        </div>
                        <div className="px-2 py-1 bg-white rounded-full border border-gray-200 text-slate-600 flex items-center gap-1.5 shadow-sm">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            <span className="font-medium">Vistos:</span>
                            <span className="font-bold text-slate-800">{statsSeen}</span>
                        </div>
                        <div className="px-2 py-1 bg-white rounded-full border border-gray-200 text-slate-600 flex items-center gap-1.5 shadow-sm">
                            <Clock className="w-3.5 h-3.5 text-orange-500" />
                            <span className="font-medium">Por Revisar:</span>
                            <span className="font-bold text-slate-800">{statsToReview}</span>
                        </div>
                    </div>

                    {/* 2x2 Grid Layout - Reduced height by 25% */}
                    <div className="flex-none h-[75%] grid grid-cols-1 lg:grid-cols-2 grid-rows-2 gap-4 min-h-0">

                        {/* Top Left: Announcements */}
                        <div className="min-h-0">
                            <div className="h-full">
                                <Announcements />
                            </div>
                        </div>

                        {/* Top Right: Drive Reports */}
                        <div className="min-h-0">
                            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
                                <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between bg-slate-50 flex-shrink-0">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-orange-500" />
                                        <h3 className="font-bold text-slate-700 text-sm">Reportes Drive</h3>
                                        {sortedDriveReports.length > 0 && (
                                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">
                                                {sortedDriveReports.length}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                                    {sortedDriveReports.length === 0 && (
                                        <div className="p-6 text-center text-slate-400 text-sm italic">
                                            No hay reportes sin ver
                                        </div>
                                    )}
                                    {sortedDriveReports.map(report => (
                                        <DriveReportCard
                                            key={report.id}
                                            report={report}
                                            currentUser={currentUser}
                                            onMarkSeen={handleToggleSeen}
                                            onDelete={handleDeleteReport}
                                            onComment={() => { alert("Funcionalidad de comentarios disponible en Librería de Reportes"); router.push('/drive-reports'); }}
                                            onCreateTask={() => { alert("Funcionalidad de tareas disponible en Librería de Reportes"); router.push('/drive-reports'); }}
                                            onOpen={handleNavigateDriveReport}
                                        />
                                    ))}
                                </div>
                            </section>
                        </div>

                        {/* Bottom Left: Tasks */}
                        <div className="min-h-0">
                            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
                                <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between bg-slate-50 flex-shrink-0">
                                    <div className="flex items-center gap-2">
                                        <CheckSquare className="w-4 h-4 text-indigo-500" />
                                        <h3 className="font-bold text-slate-700 text-sm">Mis Tareas</h3>
                                        <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">{myActiveTasks.length}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleCreateNewTask}
                                            className="text-xs px-2 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-1"
                                        >
                                            <Plus className="w-3 h-3" /> Nueva
                                        </button>
                                        <button
                                            onClick={handleNavigateTasks}
                                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                                        >
                                            Ver Todas
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                                    {myActiveTasks.length === 0 && (
                                        <div className="p-6 text-center text-slate-400 text-sm">
                                            No tienes tareas pendientes
                                        </div>
                                    )}
                                    <div className="p-3 space-y-2">
                                        {myActiveTasks.map(task => (
                                            <div
                                                key={task.id}
                                                onClick={() => handleNavigateTask(task.id)}
                                                className="group p-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg cursor-pointer transition-all"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-slate-700 text-sm group-hover:text-indigo-700 transition-colors line-clamp-1">
                                                            {task.title}
                                                        </p>
                                                        <p className="text-xs text-slate-400 mt-0.5">
                                                            Asignado por {task.assignedBy}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <div className={clsx("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border flex items-center gap-1",
                                                            task.priority === 'high' ? 'bg-red-50 text-red-600 border-red-200' :
                                                                task.priority === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                                                    'bg-blue-50 text-blue-600 border-blue-200')}>
                                                            <div className={clsx("w-1 h-1 rounded-full",
                                                                task.priority === 'high' ? 'bg-red-500' :
                                                                    task.priority === 'medium' ? 'bg-amber-500' :
                                                                        'bg-blue-500')} />
                                                            {task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Media' : 'Baja'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Bottom Right: Activity Feed */}
                        <div className="min-h-0">
                            <div className="h-full">
                                <ActivityFeed />
                            </div>
                        </div>
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
                        className="fixed inset-y-0 right-0 w-[400px] border-l border-gray-200 bg-white flex flex-col h-full shadow-2xl z-50"
                    >
                        <TaskDetailPanel
                            selectedTask={selectedTask}
                            currentUser={currentUser}
                            potentialAssignees={potentialAssignees}
                            onClose={() => setSelectedTaskId(null)}
                            onUpdate={handleTaskUpdate}
                            onAddComment={handleAddTaskComment}
                            reports={reports}
                            driveReports={driveReports}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

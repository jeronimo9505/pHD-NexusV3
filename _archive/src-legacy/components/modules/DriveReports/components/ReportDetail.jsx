import React, { useState } from 'react';
import { ArrowLeft, ExternalLink, CheckCircle, XCircle, Clock, Send, Plus, Calendar, Eye } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatDateShort } from '@/utils/helpers';
import { useTasks } from '../../Tasks/hooks/useTasks';

export default function ReportDetail({ report, onBack }) {
    const { updateDriveReport, currentUser, hasRole } = useApp();
    const { createTask, updateTask } = useTasks();
    const [taskText, setTaskText] = useState('');

    // Tasks are now passed directly in the report object from AppContext
    const reportTasks = report.tasks || [];

    const editLink = report.drive_file_id
        ? `https://docs.google.com/document/d/${report.drive_file_id}/edit`
        : '#';

    // For preview, we might want 'preview' or 'view'
    const previewLink = report.drive_file_id
        ? `https://docs.google.com/document/d/${report.drive_file_id}/preview`
        : '';

    const handleStatusChange = async (newStatus) => {
        await updateDriveReport(report.id, {
            status: newStatus,
            approval_date: newStatus === 'approved' ? new Date().toISOString() : null,
            approver_id: newStatus === 'approved' ? currentUser.id : null
        });
    };

    const handleAddTask = async () => {
        if (!taskText.trim()) return;

        await createTask({
            title: taskText,
            description: '',
            status: 'todo',
            priority: 'medium',
            sourceReportId: report.id
        });
        setTaskText('');
    };

    const toggleTask = async (taskId, currentStatus) => {
        await updateTask(taskId, {
            status: currentStatus === 'done' ? 'todo' : 'done'
        });
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <div>
                        <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                            {report.title}
                            <span className={`px-2 py-0.5 rounded-full text-xs uppercase ${report.status === 'approved' ? 'bg-green-100 text-green-700' :
                                report.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                    'bg-slate-100 text-slate-600'
                                }`}>
                                {report.status === 'draft' ? 'Borrador' :
                                    report.status === 'pending' ? 'Revisión' :
                                        report.status === 'approved' ? 'Aprobado' : report.status}
                            </span>
                        </h2>
                        <p className="text-xs text-slate-500">
                            Periodo: {report.period} • Creado por: {report.created_by_name}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <a
                        href={editLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 font-bold text-sm rounded-xl hover:bg-indigo-100 transition-colors"
                    >
                        <ExternalLink className="w-4 h-4" />
                        Editar en Drive
                    </a>
                </div>
            </div>

            {/* Main Content: Split View */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Document Preview */}
                <div className="flex-1 bg-slate-100 p-4 border-r border-slate-200">
                    <iframe
                        src={previewLink}
                        className="w-full h-full rounded-xl shadow-sm border border-slate-200 bg-white"
                        title="Document Preview"
                    />
                </div>

                {/* Right: Validation Panel */}
                <div className="w-80 bg-white flex flex-col shadow-xl z-20">
                    <div className="p-5 border-b border-slate-100">
                        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide mb-4">
                            Workflow de Validación
                        </h3>

                        {/* Workflow Actions */}
                        <div className="space-y-3">
                            {report.status === 'draft' && (
                                <button
                                    onClick={() => handleStatusChange('pending')}
                                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
                                >
                                    <Send className="w-4 h-4" /> Enviar a Revisión
                                </button>
                            )}

                            {report.status === 'pending' && hasRole('supervisor') && (
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => handleStatusChange('rejected')}
                                        className="py-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1"
                                    >
                                        <XCircle className="w-4 h-4" /> Solicitar Cambios
                                    </button>
                                    <button
                                        onClick={() => handleStatusChange('approved')}
                                        className="py-2.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1"
                                    >
                                        <CheckCircle className="w-4 h-4" /> Aprobar
                                    </button>
                                </div>
                            )}

                            {report.status === 'pending' && !hasRole('supervisor') && (
                                <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-lg flex items-center gap-2">
                                    <Clock className="w-4 h-4" /> Esperando revisión del supervisor...
                                </div>
                            )}

                            {report.status === 'approved' && (
                                <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                                    <div className="flex items-center gap-2 text-green-700 font-bold text-sm mb-1">
                                        <CheckCircle className="w-4 h-4" /> Reporte Aprobado
                                    </div>
                                    <p className="text-xs text-green-600">
                                        Fecha: {formatDateShort(report.approval_date)}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tasks Section */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-sm flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-slate-400" /> Tareas Pendientes
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {reportTasks.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-4">No hay tareas vinculadas.</p>
                            ) : (
                                reportTasks.map(task => (
                                    <div key={task.id} className="flex items-start gap-3 p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
                                        <input
                                            type="checkbox"
                                            checked={task.status === 'done'}
                                            onChange={() => toggleTask(task.id, task.status)}
                                            className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <div className={`text-sm ${task.status === 'done' ? 'opacity-50 line-through text-slate-400' : 'text-slate-700'}`}>
                                            {task.title}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Add Task Input */}
                        <div className="p-4 border-t border-slate-200 bg-white">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Agregar tarea..."
                                    className="flex-1 text-sm border-none bg-slate-50 focus:ring-0 rounded-lg px-3 py-2"
                                    value={taskText}
                                    onChange={(e) => setTaskText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                                />
                                <button
                                    onClick={handleAddTask}
                                    className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Viewers Section */}
                    <div className="p-4 border-t border-slate-100 bg-slate-50/30">
                        <div className="font-bold text-slate-700 text-sm flex items-center gap-2 mb-3">
                            <Eye className="w-4 h-4 text-slate-400" /> Visto por
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(!report.seenByNames || report.seenByNames.length === 0) ? (
                                <p className="text-[10px] text-slate-400 italic">Nadie lo ha visto todavía.</p>
                            ) : (
                                report.seenByNames.map((name, idx) => (
                                    <span key={idx} className="px-2 py-1 bg-white border border-slate-100 rounded-lg text-[10px] text-slate-600 font-medium shadow-sm">
                                        {name}
                                    </span>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { Clock, Trash2, CheckCircle2, UserCircle, FileText } from 'lucide-react';
import { formatDateShort, formatDateLong, getDaysSince } from '@/utils/helpers';
import clsx from 'clsx';

export default function TaskItem({
    task,
    isSelected,
    onClick,
    onUpdate,
    onDelete,
    onNavigateReport,
    potentialAssignees,
    getSourceReportLabel
}) {
    const [localTitle, setLocalTitle] = useState(task.title);

    useEffect(() => {
        setLocalTitle(task.title);
    }, [task.title]);

    const handleTitleBlur = () => {
        if (localTitle !== task.title) {
            onUpdate(task.id, 'title', localTitle);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    return (
        <div
            onClick={onClick}
            className={clsx(
                "group flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer relative",
                isSelected ? 'border-indigo-400 ring-1 ring-indigo-400 bg-white shadow-md' : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm'
            )}
        >
            <button
                onClick={(e) => { e.stopPropagation(); onUpdate(task.id, 'status', 'done'); }}
                className="mt-1 w-6 h-6 shrink-0 rounded-full border-2 border-gray-300 bg-white hover:border-emerald-400 flex items-center justify-center transition-colors"
                title="Marcar como completada"
            >
            </button>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                    <input
                        className="w-full font-semibold text-slate-800 bg-transparent outline-none border-b border-transparent focus:border-indigo-200 placeholder:text-slate-400 text-base"
                        value={localTitle}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setLocalTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        onKeyDown={handleKeyDown}
                        placeholder="Nombre de la tarea..."
                    />
                    <div className="flex flex-col items-end gap-1">
                        {task.assignedBy && (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap ml-2">
                                por {task.assignedBy}
                            </span>
                        )}
                        {task.assignees && task.assignees.length > 0 ? (
                            <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full whitespace-nowrap ml-2 border border-indigo-100 flex items-center gap-1">
                                <UserCircle className="w-3 h-3" />
                                {task.assignees.map(a => {
                                    const u = potentialAssignees.find(user => user.id === a.user_id);
                                    return u?.full_name || u?.name || 'Usuario';
                                }).join(', ')}
                            </span>
                        ) : task.assignedTo && task.assignedTo !== task.assignedBy && (
                            <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full whitespace-nowrap ml-2 border border-indigo-100 flex items-center gap-1">
                                <UserCircle className="w-3 h-3" /> {task.assignedTo}
                            </span>
                        )}
                    </div>
                </div>
                {task.description && <p className="text-xs text-slate-500 line-clamp-1 mt-1">{task.description}</p>}

                <div className="flex items-center gap-4 mt-2">
                    <span className={clsx("text-[10px] px-2 py-0.5 rounded font-bold uppercase", task.priority === 'high' ? 'bg-red-50 text-red-600' : task.priority === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600')}>{task.priority}</span>
                    <div className="flex items-center gap-1 text-xs text-slate-500"><Clock className="w-3 h-3" /> {task.dueDate ? formatDateShort(task.dueDate) : 'Sin fecha'}</div>
                    <div className="text-[10px] text-slate-400">Hace {getDaysSince(task.createdAt)} días</div>
                    {task.sourceReportId && (
                        <button
                            onClick={(e) => onNavigateReport(e, task.sourceReportId)}
                            className="flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-300 transition-colors z-10"
                        >
                            <FileText className="w-3 h-3" /> {getSourceReportLabel(task.sourceReportId)}
                        </button>
                    )}
                    {task.comments && task.comments.length > 0 && <div className="flex items-center gap-1 text-xs text-indigo-500"><div className="w-1 h-1 rounded-full bg-indigo-500" /> {task.comments.length} comentarios</div>}
                </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); if (window.confirm('¿Estás seguro de que quieres eliminar esta tarea?')) onDelete(task.id); }} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2"><Trash2 className="w-4 h-4" /></button>
        </div>
    );
}

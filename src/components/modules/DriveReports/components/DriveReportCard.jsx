import React from 'react';
import {
    FileText, CheckCircle2, MessageSquare, CheckSquare,
    Eye, EyeOff, Trash2, Presentation, StickyNote, Clock, ExternalLink
} from 'lucide-react';
import { getMonthLabel, formatDateShort } from '@/utils/helpers';
import clsx from 'clsx';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function DriveReportCard({
    report,
    currentUser,
    onMarkSeen,
    onDelete,
    onComment,
    onCreateTask,
    onOpen,
    expandedSection, // 'seen', 'tasks', 'comments' or null
    onToggleSection  // (section) => void
}) {
    // Check Status
    const isSeen = report.seen_by?.includes(currentUser?.id);
    const hasComments = report.comments?.length > 0;
    const hasTasks = report.tasks?.length > 0;

    return (
        <div className={clsx(
            "bg-white rounded-xl border p-4 transition-all hover:shadow-md relative group",
            isSeen ? "border-slate-200" : "border-indigo-200 shadow-sm bg-indigo-50/10"
        )}>
            {/* Delete Action (Top Right) */}
            {onDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(report); }}
                    className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Eliminar reporte"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            )}

            <div className="flex items-start gap-4">
                {/* Icon Box */}
                <div
                    onClick={() => onOpen && onOpen(report)}
                    className={clsx(
                        "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-95",
                        report.type === 'ppt' ? "bg-orange-100 text-orange-600" :
                            report.type === 'meeting_note' ? "bg-emerald-100 text-emerald-600" :
                                "bg-indigo-100 text-indigo-600"
                    )}
                >
                    {report.type === 'ppt' ? <Presentation className="w-6 h-6" /> :
                        report.type === 'meeting_note' ? <StickyNote className="w-6 h-6" /> :
                            <FileText className="w-6 h-6" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-start justify-between gap-4 mb-1">
                        <div>
                            <h3
                                onClick={() => onOpen && onOpen(report)}
                                className="font-bold text-slate-800 text-sm hover:text-indigo-600 cursor-pointer transition-colors line-clamp-1"
                            >
                                {report.title}
                            </h3>

                            {/* Metadata Line: Date - Author - Link */}
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                <span className={clsx(
                                    "font-medium",
                                    !isSeen && "text-indigo-500 font-bold"
                                )}>
                                    {report.created_at || report.startDate ? new Date(report.created_at || report.startDate).toLocaleString('es-ES', {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    }) : 'Sin fecha'}
                                </span>
                                <span>•</span>
                                <span className="truncate max-w-[120px]" title={report.author_name}>
                                    {report.author_name || 'Desconocido'}
                                </span>
                                {report.webViewLink && (
                                    <>
                                        {/* Link moved to action buttons */}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Top Actions: Seen Button */}
                        <div className="flex items-center gap-2">
                            {/* Open Drive Button - Prominent */}
                            {(report.webViewLink || report.alternateLink || report.drive_file_id) && (
                                <a
                                    href={
                                        report.drive_file_id && (report.type === 'report' || report.type === 'meeting_note' || !report.type)
                                            ? `https://docs.google.com/document/d/${report.drive_file_id}/edit`
                                            : (report.webViewLink || report.alternateLink || `https://drive.google.com/file/d/${report.drive_file_id}/view`)
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm shadow-amber-200"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Ver en Drive</span>
                                </a>
                            )}

                            <button
                                onClick={(e) => { e.stopPropagation(); onMarkSeen && onMarkSeen(report); }}
                                className={clsx(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors border",
                                    isSeen
                                        ? "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-500"
                                        : "bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200"
                                )}
                            >
                                {isSeen ? (
                                    <>
                                        <EyeOff className="w-3.5 h-3.5" />
                                        <span>Visto</span>
                                    </>
                                ) : (
                                    <>
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>No Visto</span>
                                    </>
                                )}
                            </button>

                            {/* Task Button */}
                            <button
                                onClick={(e) => { e.stopPropagation(); onCreateTask && onCreateTask(report); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
                            >
                                <CheckSquare className="w-3.5 h-3.5" />
                                <span>Tarea</span>
                            </button>

                            {/* Comment Button */}
                            <button
                                onClick={(e) => { e.stopPropagation(); onComment && onComment(report); }}
                                className={clsx(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors border",
                                    "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-200 border-transparent"
                                )}
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Comentar</span>
                            </button>
                        </div>
                    </div>

                    {/* Preview / Context */}
                    {report.sections?.context && (
                        <p className="text-xs text-slate-400 line-clamp-2 mt-2 italic mb-3">
                            {report.sections.context}
                        </p>
                    )}

                    {/* Bottom Info Bar */}
                    <div className="flex items-center gap-4 pt-3 border-t border-slate-50 mt-1">
                        {/* Seen History */}
                        <div
                            className={clsx(
                                "flex items-center gap-1 text-[10px] font-medium cursor-pointer transition-colors p-1 rounded hover:bg-slate-100",
                                expandedSection === 'seen' ? "text-indigo-600 bg-indigo-50" : "text-slate-400"
                            )}
                            onClick={(e) => { e.stopPropagation(); onToggleSection && onToggleSection('seen'); }}
                            title={report.seenByNames?.length > 0 ? `Visto por: ${report.seenByNames.join(', ')}` : 'Nadie lo ha visto todavía'}
                        >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Visto por {report.seen_by?.length || 0}</span>
                        </div>

                        {/* Tasks Count */}
                        <div className={clsx(
                            "flex items-center gap-1 text-[10px] font-medium transition-colors cursor-pointer p-1 rounded hover:bg-slate-100",
                            hasTasks ? "text-indigo-500" : "text-slate-400",
                            expandedSection === 'tasks' && "bg-indigo-50 text-indigo-600"
                        )}
                            onClick={(e) => { e.stopPropagation(); onToggleSection && onToggleSection('tasks'); }}
                        >
                            <CheckSquare className="w-3.5 h-3.5" />
                            <span>Tareas ({report.tasks?.length || 0})</span>
                        </div>

                        {/* Comments Count */}
                        <div
                            onClick={(e) => { e.stopPropagation(); onToggleSection && onToggleSection('comments'); }}
                            className={clsx(
                                "flex items-center gap-1 text-[10px] font-medium transition-colors cursor-pointer p-1 rounded hover:bg-slate-100",
                                hasComments ? "text-indigo-500" : "text-slate-400",
                                expandedSection === 'comments' && "bg-indigo-50 text-indigo-600"
                            )}
                        >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Comentarios ({report.comments?.length || 0})</span>
                        </div>

                        <div className="flex-1" />

                        {/* Timestamp */}
                        <div className="flex items-center gap-1 text-[10px] text-slate-300">
                            <Clock className="w-3 h-3" />
                            {formatDateShort(report.created_at)}
                        </div>
                    </div>

                </div>
            </div>

            {/* EXPANDED SECTIONS */}
            <AnimatePresence>
                {expandedSection && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-slate-100 bg-slate-50/50 overflow-hidden"
                    >
                        <div className="p-4">
                            {/* SEEN SECTION */}
                            {expandedSection === 'seen' && (
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                        <Eye className="w-3 h-3" /> Visto por
                                    </h4>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {report.seenByNames && report.seenByNames.length > 0 ? (
                                            report.seenByNames.map((name, idx) => (
                                                <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm">
                                                    <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                                                        {name.charAt(0)}
                                                    </div>
                                                    <span className="text-xs font-medium text-slate-700">{name}</span>
                                                    {/* We don't have time yet, so maybe just show name */}
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs text-slate-400 italic">Nadie lo ha visto todavía.</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* TASKS SECTION */}
                            {expandedSection === 'tasks' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                            <CheckSquare className="w-3 h-3" /> Tareas Vinculadas
                                        </h4>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onCreateTask && onCreateTask(report); }}
                                            className="text-xs text-indigo-600 font-bold hover:underline"
                                        >
                                            + Agregar Tarea
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        {hasTasks ? (
                                            report.tasks.map(task => (
                                                <div key={task.id} className="flex items-start gap-3 p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
                                                    <div className={clsx("mt-0.5 w-4 h-4 rounded border flex items-center justify-center",
                                                        task.status === 'done' ? "bg-indigo-100 border-indigo-200" : "border-slate-300"
                                                    )}>
                                                        {task.status === 'done' && <CheckCircle2 className="w-3 h-3 text-indigo-600" />}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className={clsx("text-xs font-medium", task.status === 'done' ? "text-slate-400 line-through" : "text-slate-700")}>
                                                            {task.title}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[10px] text-slate-400">{task.assignedTo ? `Asignado a: ${task.assignedTo}` : 'Sin asignar'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs text-slate-400 italic">No hay tareas vinculadas a este reporte.</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* COMMENTS SECTION */}
                            {expandedSection === 'comments' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                            <MessageSquare className="w-3 h-3" /> Comentarios
                                        </h4>
                                    </div>

                                    <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                                        {hasComments ? (
                                            report.comments.map(comment => (
                                                <div key={comment.id} className="flex gap-3">
                                                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                                                        {(comment.user_name || 'U').charAt(0)}
                                                    </div>
                                                    <div className="flex-1 bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm relative">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="text-xs font-bold text-slate-700">{comment.user_name}</span>
                                                            <span className="text-[10px] text-slate-400">{formatDateShort(comment.created_at, true)}</span>
                                                        </div>
                                                        <p className="text-xs text-slate-600">{comment.content}</p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs text-slate-400 italic">No hay comentarios aún.</p>
                                        )}
                                    </div>

                                    {/* Quick Reply - actually triggers the modal usually, or we can add inline later. 
                                        For now, user said "ver lo mismo", and the modal is good for input. 
                                        Let's add a button to open modal if they want to add.
                                    */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onComment && onComment(report); }}
                                        className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                                    >
                                        <MessageSquare className="w-3.5 h-3.5" /> Escribir un comentario...
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

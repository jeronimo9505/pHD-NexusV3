import React from 'react';
import {
    FileText, CheckCircle2, MessageSquare, CheckSquare,
    Eye, EyeOff, Trash2, Presentation, StickyNote, Clock, ExternalLink
} from 'lucide-react';
import { getMonthLabel, formatDateShort } from '@/utils/helpers';
import clsx from 'clsx';
import { useApp } from '@/context/AppContext';

export default function DriveReportCard({
    report,
    currentUser,
    onMarkSeen,
    onDelete,
    onComment,
    onCreateTask,
    onOpen
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
                            className="flex items-center gap-1 text-[10px] text-slate-400 font-medium cursor-help"
                            title={report.seenByNames?.length > 0 ? `Visto por: ${report.seenByNames.join(', ')}` : 'Nadie lo ha visto todavía'}
                        >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Visto por {report.seen_by?.length || 0}</span>
                        </div>

                        {/* Tasks Count */}
                        <div className={clsx(
                            "flex items-center gap-1 text-[10px] font-medium transition-colors",
                            hasTasks ? "text-indigo-500" : "text-slate-400"
                        )}>
                            <CheckSquare className="w-3.5 h-3.5" />
                            <span>Tareas ({report.tasks?.length || 0})</span>
                        </div>

                        {/* Comments Count */}
                        <div
                            onClick={(e) => { e.stopPropagation(); onComment && onComment(report); }}
                            className={clsx(
                                "flex items-center gap-1 text-[10px] font-medium transition-colors cursor-pointer hover:text-indigo-600",
                                hasComments ? "text-indigo-500" : "text-slate-400"
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
        </div>
    );
}

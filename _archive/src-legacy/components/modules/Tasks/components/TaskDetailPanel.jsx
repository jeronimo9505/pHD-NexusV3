import React, { useState, useEffect } from 'react';
import { AlignLeft, UserCircle, ChevronDown, CheckSquare, X, Send, FileText, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { formatDateShort, formatDateLong, getWeekLabel } from '@/utils/helpers';

export default function TaskDetailPanel({
    selectedTask,
    currentUser,
    potentialAssignees,
    onClose,
    onUpdate,
    onAddComment,
    reports = [], // For resolving report labels (legacy reports)
    driveReports = [] // For resolving Drive Report labels
}) {
    const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
    const [currentComment, setCurrentComment] = useState('');

    // Local state for buffered inputs
    const [localTitle, setLocalTitle] = useState('');
    const [localDescription, setLocalDescription] = useState('');

    // Sync local state when selected task changes
    useEffect(() => {
        if (selectedTask) {
            setLocalTitle(selectedTask.title || '');
            setLocalDescription(selectedTask.description || '');
        }
    }, [selectedTask]);

    const handleSaveTitle = () => {
        if (selectedTask && localTitle !== selectedTask.title) {
            onUpdate(selectedTask.id, 'title', localTitle);
        }
    };

    const handleSaveDescription = () => {
        if (selectedTask && localDescription !== (selectedTask.description || '')) {
            onUpdate(selectedTask.id, 'description', localDescription);
        }
    };

    const getSourceReportLabel = (reportId) => {
        if (!reportId) return null;

        // First, check Drive Reports
        const driveReport = driveReports.find(r => r.id === reportId);
        if (driveReport) {
            // Drive Reports have a title
            return driveReport.title || `Reporte Drive (${new Date(driveReport.created_at).toLocaleDateString('es-ES')})`;
        }

        // Then check legacy reports
        const report = reports.find(r => r.id === reportId);
        if (report) {
            return `Reporte ${getWeekLabel(report.startDate, report.endDate)}`;
        }

        return `Documento (ref: ${reportId.substring(0, 8)}...)`;
    };

    const handleNavigateToReport = (e, reportId) => {
        e.stopPropagation();
        // This functionality might need to be passed as a prop if used outside Tasks module
        // For now, we'll just emit an event or ignore if not provided
        console.warn("Navigate to report not implemented in standalone panel");
    };

    if (!selectedTask) return null;

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-slate-50">
                <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Detalles de Tarea</span>
                    <input
                        className="font-bold text-slate-800 text-base mt-1 bg-transparent outline-none w-full focus:border-b border-indigo-300"
                        value={localTitle}
                        onChange={(e) => setLocalTitle(e.target.value)}
                        onBlur={handleSaveTitle}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.currentTarget.blur();
                            }
                        }}
                    />
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-5 space-y-4 border-b border-gray-200 overflow-y-auto shrink-0 max-h-[50%] custom-scrollbar">
                    {/* Description and Metadata */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 flex items-center gap-1"><AlignLeft className="w-3 h-3" /> Descripción</label>
                        <textarea
                            className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none min-h-[80px] resize-none focus:border-indigo-300"
                            placeholder="Añadir descripción..."
                            value={localDescription}
                            onChange={(e) => setLocalDescription(e.target.value)}
                            onBlur={handleSaveDescription}
                        />
                    </div>

                    <div className="space-y-2 relative">
                        <label className="text-xs font-bold text-slate-500 flex items-center gap-1"><UserCircle className="w-3 h-3" /> Asignado a</label>

                        <button
                            onClick={(e) => { e.stopPropagation(); setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen); }}
                            className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-left hover:bg-slate-100 transition-colors"
                        >
                            <div className="flex flex-wrap gap-1 flex-1">
                                {(!selectedTask.assignees || selectedTask.assignees.length === 0) ? (
                                    selectedTask.assignedTo ? (
                                        <span className="text-slate-700 font-medium">{selectedTask.assignedTo}</span>
                                    ) : (
                                        <span className="text-slate-400">Seleccionar responsables...</span>
                                    )
                                ) : (
                                    potentialAssignees.filter(m => selectedTask.assignees.some(a => a.user_id === m.id)).map(m => (
                                        <span key={m.id} className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-indigo-600 font-medium shadow-sm">
                                            {m.name || m.full_name}
                                        </span>
                                    ))
                                )}
                            </div>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        </button>

                        {isAssigneeDropdownOpen && (
                            <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                                {potentialAssignees.map((member) => {
                                    const isAssigned = selectedTask.assignees?.some(a => a.user_id === member.id)
                                        // Fallback/Legacy
                                        || (!selectedTask.assignees && (selectedTask.assignedTo === member.name || selectedTask.assignedBy === member.name && member.name === currentUser?.name));

                                    return (
                                        <label key={member.id || member.name} className="flex items-center gap-2 p-2 hover:bg-indigo-50 rounded-md cursor-pointer transition-colors">
                                            <div className={clsx("w-4 h-4 rounded border flex items-center justify-center transition-colors", isAssigned ? "bg-indigo-600 border-indigo-600" : "border-slate-300 bg-white")}>
                                                {isAssigned && <CheckSquare className="w-3 h-3 text-white" />}
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={!!isAssigned}
                                                onChange={(e) => {
                                                    const currentIds = selectedTask.assignees?.map(a => a.user_id) || [];
                                                    let newIds;
                                                    if (e.target.checked) {
                                                        newIds = [...currentIds, member.id];
                                                    } else {
                                                        newIds = currentIds.filter(id => id !== member.id);
                                                    }
                                                    onUpdate(selectedTask.id, 'assignees', newIds);
                                                }}
                                            />
                                            <div className="flex-1">
                                                <div className="text-xs font-semibold text-slate-700">{member.full_name || member.name}</div>
                                                <div className="text-[10px] text-slate-400 capitalize">{member.role}</div>
                                            </div>
                                            {member.id === currentUser?.id && <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">(Tú)</span>}
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <span className="text-xs font-bold text-slate-500 block">Prioridad</span>
                            <select value={selectedTask.priority} onChange={(e) => onUpdate(selectedTask.id, 'priority', e.target.value)} className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 outline-none">
                                <option value="low">Baja</option>
                                <option value="medium">Media</option>
                                <option value="high">Alta</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs font-bold text-slate-500 block">Fecha Límite</span>
                            <input type="date" value={selectedTask.dueDate || ''} onChange={(e) => onUpdate(selectedTask.id, 'dueDate', e.target.value)} className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 outline-none text-slate-600" />
                        </div>
                    </div>

                    {/* Metadata */}
                    <div className="bg-indigo-50/50 rounded-lg p-3 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Creada por</span>
                            <span className="font-medium text-indigo-700">{selectedTask.assignedBy || 'Sistema'}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Fecha creación</span>
                            <span className="text-slate-700">{selectedTask.createdAt && !isNaN(new Date(selectedTask.createdAt)) ? formatDateLong(selectedTask.createdAt) : 'Reciente'}</span>
                        </div>
                        {selectedTask.sourceReportId && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Origen</span>
                                <div className="text-indigo-600 font-medium flex items-center gap-1 text-right">
                                    <FileText className="w-3 h-3" /> {getSourceReportLabel(selectedTask.sourceReportId)}
                                </div>
                            </div>
                        )}
                        {selectedTask.status === 'done' && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-emerald-600 font-bold">Completada</span>
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Comments Header & Input (Moved Up) */}
                <div className="p-3 bg-slate-50 border-b border-gray-200">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-2 mb-2">Comentarios</label>
                    <div className="relative flex items-center gap-2">
                        <input className="flex-1 bg-white border border-gray-200 rounded-full px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="Escribe un comentario..." value={currentComment} onChange={(e) => setCurrentComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
                        <button onClick={() => { if (currentComment.trim()) { onAddComment(selectedTask.id, currentComment); setCurrentComment(''); } }} className="bg-indigo-600 text-white p-2 rounded-full hover:bg-indigo-700 transition-colors shadow-sm">
                            <Send className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Comments List (Bottom, Growing Downwards) */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50/30">
                    {(!selectedTask.comments || selectedTask.comments.length === 0) && (
                        <div className="text-center text-xs text-slate-400 italic mt-4">No hay comentarios aún.</div>
                    )}
                    {[...(selectedTask.comments || [])].reverse().map(c => (
                        <div key={c.id} className={clsx("flex flex-col gap-1 animate-in fade-in slide-in-from-top-1", c.author === currentUser?.name ? 'items-end' : 'items-start')}>
                            <div className="flex items-center gap-2 px-1">
                                <span className="text-[10px] font-bold text-slate-600">{c.author}</span>
                                <span className="text-[9px] text-slate-400">{formatDateShort(c.date)}</span>
                            </div>
                            <div className={clsx("p-3 rounded-lg text-xs max-w-[85%] shadow-sm", c.author === currentUser?.name ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-gray-200 text-slate-700 rounded-tl-none')}>
                                {c.text}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

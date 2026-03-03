
import React, { useState, useEffect } from 'react';
import { X, Save, Calendar, AlignLeft, Flag, UserCircle } from 'lucide-react';
import clsx from 'clsx';

export default function TaskModal({ isOpen, onClose, onSave, initialData = null, groupMembers, currentUser }) {
    const [taskData, setTaskData] = useState({
        title: '',
        description: '',
        priority: 'medium',
        dueDate: '',
        status: 'pending',
        assignees: []
    });

    useEffect(() => {
        if (initialData) {
            setTaskData(initialData);
        } else {
            setTaskData({
                title: '',
                description: '',
                priority: 'medium',
                dueDate: '',
                status: 'pending',
                assignees: currentUser ? [currentUser.id] : []
            });
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (!taskData.title.trim()) return;
        onSave(taskData);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800">{initialData ? 'Editar Tarea' : 'Nueva Tarea Derivada'}</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500">Título</label>
                        <input
                            autoFocus
                            className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 font-medium"
                            value={taskData.title}
                            onChange={(e) => setTaskData({ ...taskData, title: e.target.value })}
                            placeholder="Título de la tarea..."
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 flex items-center gap-1"><AlignLeft className="w-3 h-3" /> Descripción</label>
                        <textarea
                            className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 h-24 resize-none"
                            value={taskData.description}
                            onChange={(e) => setTaskData({ ...taskData, description: e.target.value })}
                            placeholder="Detalles adicionales..."
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 flex items-center gap-1 mb-1">
                            <UserCircle className="w-3 h-3" /> Asignar a
                        </label>
                        <div className="border border-slate-200 rounded-lg p-2 max-h-32 overflow-y-auto custom-scrollbar bg-slate-50">
                            {groupMembers && groupMembers.length > 0 ? (
                                groupMembers.map(member => (
                                    <label key={member.id} className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            checked={taskData.assignees?.includes(member.id)}
                                            onChange={(e) => {
                                                const newAssignees = e.target.checked
                                                    ? [...(taskData.assignees || []), member.id]
                                                    : (taskData.assignees || []).filter(id => id !== member.id);
                                                setTaskData({ ...taskData, assignees: newAssignees });
                                            }}
                                        />
                                        <span className="text-sm text-slate-700">{member.full_name || member.name}</span>
                                        {member.id === currentUser?.id && <span className="text-[10px] text-slate-400">(Tú)</span>}
                                    </label>
                                ))
                            ) : (
                                <p className="text-xs text-slate-400 text-center py-2">No hay miembros disponibles</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 flex items-center gap-1"><Flag className="w-3 h-3" /> Prioridad</label>
                            <select
                                className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
                                value={taskData.priority}
                                onChange={(e) => setTaskData({ ...taskData, priority: e.target.value })}
                            >
                                <option value="low">Baja</option>
                                <option value="medium">Media</option>
                                <option value="high">Alta</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> Fecha Límite</label>
                            <input
                                type="date"
                                className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 text-slate-600"
                                value={taskData.dueDate}
                                onChange={(e) => setTaskData({ ...taskData, dueDate: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-slate-50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!taskData.title.trim()}
                        className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" /> Guardar Tarea
                    </button>
                </div>
            </div>
        </div>
    );
}

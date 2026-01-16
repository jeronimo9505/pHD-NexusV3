
import React, { useState } from 'react';
import { X, Search, Plus, Save, BookOpen, Clock } from 'lucide-react';
import clsx from 'clsx';

export default function ResourceSelector({ isOpen, onClose, onSelect, onCreate, existingResources = [], linkedResourceIds = [] }) {
    const [mode, setMode] = useState('select'); // 'select' | 'create'
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);

    // New Resource State
    const [newResource, setNewResource] = useState({
        title: '',
        url: '',
        category: 'Paper',
        description: ''
    });

    if (!isOpen) return null;

    const filteredResources = existingResources.filter(r =>
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleCreate = () => {
        if (!newResource.title) return;
        onCreate(newResource);
        setNewResource({ title: '', url: '', category: 'Paper', description: '' });
        setMode('select');
        onClose();
    };

    const handleSelectSubmit = () => {
        onSelect(selectedIds);
        setSelectedIds([]);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800">Gestionar Recursos</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
                </div>

                <div className="flex border-b border-gray-100">
                    <button
                        onClick={() => setMode('select')}
                        className={clsx("flex-1 py-3 text-sm font-medium transition-colors border-b-2", mode === 'select' ? "border-indigo-500 text-indigo-600 bg-indigo-50/50" : "border-transparent text-slate-500 hover:bg-slate-50")}
                    >
                        Seleccionar Existentes
                    </button>
                    <button
                        onClick={() => setMode('create')}
                        className={clsx("flex-1 py-3 text-sm font-medium transition-colors border-b-2", mode === 'create' ? "border-indigo-500 text-indigo-600 bg-indigo-50/50" : "border-transparent text-slate-500 hover:bg-slate-50")}
                    >
                        Crear Nuevo
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {mode === 'select' ? (
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                                    placeholder="Buscar recursos..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                {filteredResources.map(res => {
                                    const isAlreadyLinked = linkedResourceIds.includes(res.id);
                                    return (
                                        <div
                                            key={res.id}
                                            onClick={() => {
                                                if (isAlreadyLinked) return;
                                                if (selectedIds.includes(res.id)) {
                                                    setSelectedIds(selectedIds.filter(id => id !== res.id));
                                                } else {
                                                    setSelectedIds([...selectedIds, res.id]);
                                                }
                                            }}
                                            className={clsx(
                                                "p-3 rounded-lg border transition-all flex items-start gap-3",
                                                isAlreadyLinked ? "bg-gray-50 border-gray-100 opacity-60 cursor-not-allowed" : "cursor-pointer",
                                                selectedIds.includes(res.id) ? "border-indigo-500 bg-indigo-50" : (!isAlreadyLinked && "border-gray-200 hover:border-indigo-300")
                                            )}
                                        >
                                            <div className={clsx("w-4 h-4 rounded border mt-0.5 flex items-center justify-center transition-colors",
                                                isAlreadyLinked ? "bg-gray-200 border-gray-300" : (selectedIds.includes(res.id) ? "bg-indigo-500 border-indigo-500" : "border-slate-300")
                                            )}>
                                                {selectedIds.includes(res.id) && <Plus className="w-3 h-3 text-white rotate-45" />}
                                                {isAlreadyLinked && <Plus className="w-3 h-3 text-gray-500 rotate-45" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-700">{res.title} {isAlreadyLinked && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1 rounded ml-1">Vinculado</span>}</p>
                                                <p className="text-xs text-slate-500 line-clamp-1">{res.description || res.url}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">{res.category}</span>
                                                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" /> {res.date}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {filteredResources.length === 0 && (
                                    <p className="text-center text-sm text-slate-400 py-8">No se encontraron recursos.</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500">Título</label>
                                <input
                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                                    value={newResource.title}
                                    onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
                                    placeholder="Ej: Paper sobre Polímeros..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500">Categoría</label>
                                    <select
                                        className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
                                        value={newResource.category}
                                        onChange={(e) => setNewResource({ ...newResource, category: e.target.value })}
                                    >
                                        <option value="Paper">Paper</option>
                                        <option value="Course">Curso</option>
                                        <option value="Video">Video</option>
                                        <option value="Tool">Herramienta</option>
                                        <option value="Book">Libro</option>
                                        <option value="Report">Reporte</option>
                                        <option value="Resource">Otro</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500">URL (Opcional)</label>
                                    <input
                                        className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                                        value={newResource.url}
                                        onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500">Descripción</label>
                                <textarea
                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 resize-none h-24"
                                    value={newResource.description}
                                    onChange={(e) => setNewResource({ ...newResource, description: e.target.value })}
                                    placeholder="Breve resumen..."
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-slate-50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
                    {mode === 'select' ? (
                        <button
                            onClick={handleSelectSubmit}
                            disabled={selectedIds.length === 0}
                            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Vincular Seleccionados ({selectedIds.length})
                        </button>
                    ) : (
                        <button
                            onClick={handleCreate}
                            disabled={!newResource.title}
                            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Save className="w-4 h-4" /> Crear y Vincular
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

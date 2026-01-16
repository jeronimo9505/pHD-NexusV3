import React, { useState } from 'react';
import { X, FileText, Loader2, Calendar, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import * as driveService from '../../Drive/services/googleDriveService';
import { useApp } from '@/context/AppContext';
import { formatDateShort } from '@/utils/helpers';

export default function CreateReportModal({ onClose, onCreated }) {
    const { addDriveReport, currentUser, activeGroup } = useApp();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Period Selection State
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0-11
    const [showPicker, setShowPicker] = useState(false);

    const months = [
        'ene', 'feb', 'mar', 'abr', 'may', 'jun',
        'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
    ];

    const getFullPeriodLabel = () => {
        const date = new Date(selectedYear, selectedMonth, 1);
        return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    };

    const handleCreate = async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Calculate Date Range for Period
            const startDate = new Date(selectedYear, selectedMonth, 1);
            const endDate = new Date(selectedYear, selectedMonth + 1, 0); // Last day

            const startStr = startDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

            // 1. Calculate Period Logic correction
            // We use selectedYear and selectedMonth directly

            // Format: "YYYY-MM" for logic, "Octubre 2023" for display
            const periodKey = `${selectedYear}-${(selectedMonth + 1).toString().padStart(2, '0')}`;

            // Generate Title
            const dateObj = new Date(selectedYear, selectedMonth, 1);
            const monthName = dateObj.toLocaleString('es-ES', { month: 'long' });

            // Capitalize month name
            const monthNameCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);

            const title = `[Reporte] ${periodKey} - ${currentUser.full_name || 'Usuario'}`;

            // 2. Create Draft in DB (Local)
            const newReport = await addDriveReport({
                title: title,
                period: periodKey,
                drive_file_id: null, // Draft Mode
                status: 'draft',
                sections: {
                    context: '',
                    experimental: '',
                    findings: '',
                    difficulties: '',
                    nextSteps: ''
                },
                author_name: currentUser.full_name
            });

            onCreated(newReport); // Pass the new report back
        } catch (err) {
            setError(err.message || "Error al crear el reporte.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-visible animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-indigo-600" />
                        Nuevo Reporte
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="p-6 relative">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-start gap-2">
                            <span className="mt-0.5">⚠️</span>
                            {error}
                        </div>
                    )}

                    <div className="mb-6">
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                            Periodo del Reporte
                        </label>

                        {/* Custom Month Picker Trigger */}
                        <div
                            className="relative"
                            onClick={() => setShowPicker(!showPicker)}
                        >
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <div className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 bg-white flex items-center justify-between transition-all">
                                <span className="font-medium text-slate-700 capitalize">
                                    {getFullPeriodLabel()}
                                </span>
                                <span className="text-xs text-slate-400">Cambiar</span>
                            </div>

                            {/* Dropdown Picker */}
                            {showPicker && (
                                <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 animate-in fade-in slide-in-from-top-2">
                                    {/* Year Selector */}
                                    <div className="flex items-center justify-between mb-4 px-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedYear(y => y - 1); }}
                                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-500"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <span className="font-bold text-slate-800">{selectedYear}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedYear(y => y + 1); }}
                                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-500"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Month Grid */}
                                    <div className="grid grid-cols-4 gap-2">
                                        {months.map((m, idx) => {
                                            const isSelected = selectedMonth === idx;
                                            return (
                                                <button
                                                    key={m}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedMonth(idx);
                                                        setShowPicker(false);
                                                    }}
                                                    className={`
                                                        py-2 rounded-lg text-sm font-medium capitalize transition-all
                                                        ${isSelected
                                                            ? 'bg-indigo-600 text-white shadow-md'
                                                            : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}
                                                    `}
                                                >
                                                    {m}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowPicker(false); }}
                                            className="text-xs text-slate-400 hover:text-slate-600"
                                        >
                                            Cerrar
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const now = new Date();
                                                setSelectedMonth(now.getMonth());
                                                setSelectedYear(now.getFullYear());
                                                setShowPicker(false);
                                            }}
                                            className="text-xs text-indigo-600 font-bold hover:underline"
                                        >
                                            Este mes
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                        Se creará un documento en Google Drive basado en la <strong>Plantilla Oficial</strong> con tus datos precargados.
                    </p>
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors"
                        disabled={loading}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loading ? 'Generando...' : 'Crear Documento'}
                    </button>
                </div>
            </div>
        </div>
    );
}

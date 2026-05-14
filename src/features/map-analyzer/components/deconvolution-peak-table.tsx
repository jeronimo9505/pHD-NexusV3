'use client';

import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PeakConfig {
    id: string;
    name: string;
    model: 'Lorentzian' | 'Gaussian' | 'Voigt' | 'PseudoVoigt';
    center: number;
    center_min: number;
    center_max: number;
    fwhm_init: number;
    active: boolean;
}

const MODEL_OPTIONS = ['Lorentzian', 'Gaussian', 'Voigt', 'PseudoVoigt'] as const;
const PEAK_COLORS = [
    '#6366f1', '#f59e0b', '#10b981', '#ef4444',
    '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
];

interface Props {
    peaks: PeakConfig[];
    onChange: (peaks: PeakConfig[]) => void;
    disabled?: boolean;
}

export function DeconvolutionPeakTable({ peaks, onChange, disabled }: Props) {
    const update = (id: string, field: keyof PeakConfig, value: any) => {
        onChange(peaks.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const remove = (id: string) => {
        onChange(peaks.filter(p => p.id !== id));
    };

    const addBlank = () => {
        const newPeak: PeakConfig = {
            id: `peak_${Date.now()}`,
            name: `Peak_${peaks.length + 1}`,
            model: 'Lorentzian',
            center: 1500,
            center_min: 1470,
            center_max: 1530,
            fwhm_init: 30,
            active: true,
        };
        onChange([...peaks, newPeak]);
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Peak Model</span>
                <button
                    onClick={addBlank}
                    disabled={disabled}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold transition-all disabled:opacity-40"
                >
                    <Plus size={10} /> Add Peak
                </button>
            </div>

            {peaks.length === 0 && (
                <div className="text-center py-4 text-[11px] text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No peaks yet. Click on the spectrum or use Auto-detect.
                </div>
            )}

            {peaks.map((pk, idx) => (
                <div
                    key={pk.id}
                    className={cn(
                        "rounded-xl border p-2.5 transition-all",
                        pk.active
                            ? "bg-white border-slate-200 shadow-sm"
                            : "bg-slate-50 border-slate-100 opacity-60"
                    )}
                >
                    {/* Row 1: name, model, active toggle, delete */}
                    <div className="flex items-center gap-2 mb-2">
                        {/* Color dot */}
                        <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: PEAK_COLORS[idx % PEAK_COLORS.length] }}
                        />
                        {/* Name */}
                        <input
                            className="flex-1 min-w-0 text-xs font-bold bg-transparent border-b border-transparent focus:border-slate-300 outline-none text-slate-800 placeholder-slate-300"
                            value={pk.name}
                            onChange={e => update(pk.id, 'name', e.target.value)}
                            disabled={disabled}
                            placeholder="Name"
                        />
                        {/* Model selector */}
                        <select
                            className="text-[10px] font-medium bg-slate-100 border border-slate-200 rounded-lg px-1.5 py-1 outline-none text-slate-600 cursor-pointer"
                            value={pk.model}
                            onChange={e => update(pk.id, 'model', e.target.value as PeakConfig['model'])}
                            disabled={disabled}
                        >
                            {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        {/* Active toggle */}
                        <button
                            onClick={() => update(pk.id, 'active', !pk.active)}
                            disabled={disabled}
                            className={cn(
                                "w-8 h-4 rounded-full transition-all relative shrink-0",
                                pk.active ? "bg-indigo-500" : "bg-slate-200"
                            )}
                        >
                            <div className={cn(
                                "w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all shadow-sm",
                                pk.active ? "left-4" : "left-0.5"
                            )} />
                        </button>
                        {/* Delete */}
                        <button
                            onClick={() => remove(pk.id)}
                            disabled={disabled}
                            className="text-slate-300 hover:text-red-400 transition-colors disabled:opacity-30"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>

                    {/* Row 2: numeric inputs */}
                    <div className="grid grid-cols-3 gap-1.5">
                        <NumInput
                            label="Center"
                            unit="cm-1"
                            value={pk.center}
                            onChange={v => update(pk.id, 'center', v)}
                            disabled={disabled}
                        />
                        <NumInput
                            label="Min"
                            unit="cm-1"
                            value={pk.center_min}
                            onChange={v => update(pk.id, 'center_min', v)}
                            disabled={disabled}
                        />
                        <NumInput
                            label="Max"
                            unit="cm-1"
                            value={pk.center_max}
                            onChange={v => update(pk.id, 'center_max', v)}
                            disabled={disabled}
                        />
                        <NumInput
                            label="FWHM init"
                            unit="cm-1"
                            value={pk.fwhm_init}
                            onChange={v => update(pk.id, 'fwhm_init', v)}
                            disabled={disabled}
                            className="col-span-3"
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

function NumInput({
    label, unit, value, onChange, disabled, className
}: {
    label: string;
    unit?: string;
    value: number;
    onChange: (v: number) => void;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-0.5", className)}>
            <span className="text-[9px] text-slate-400 font-semibold">{label}</span>
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                <input
                    type="number"
                    className="flex-1 min-w-0 bg-transparent text-[11px] font-mono text-slate-700 outline-none"
                    value={value}
                    onChange={e => onChange(parseFloat(e.target.value) || 0)}
                    disabled={disabled}
                    step="1"
                />
                {unit && <span className="text-[9px] text-slate-300 shrink-0">{unit}</span>}
            </div>
        </div>
    );
}

export { PEAK_COLORS };

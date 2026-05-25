'use client';

import { Trash2, Plus, Sliders, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FittingPeakConfig {
    id: string;
    name: string;
    model: 'Lorentzian' | 'Gaussian' | 'Voigt' | 'PseudoVoigt' | 'Fano' | 'DecaySingleExp' | 'DecayBiExp';
    center: number;
    center_min: number;
    center_max: number;
    fwhm_init: number;
    amplitude: number;
    active: boolean;
    use_limits: boolean;
    // Fano asymmetry
    q?: number;
    // TRPL Lifetimes
    tau?: number;
    tau1?: number;
    tau2?: number;
    B?: number;
}

const MODEL_OPTIONS = [
    'Lorentzian', 'Gaussian', 'Voigt', 'PseudoVoigt', 'Fano', 'DecaySingleExp', 'DecayBiExp'
] as const;

const PEAK_COLORS = [
    '#6366f1', '#f59e0b', '#10b981', '#ef4444',
    '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
    '#ec4899', '#3b82f6', '#14b8a6', '#f43f5e'
];

interface Props {
    peaks: FittingPeakConfig[];
    onChange: (peaks: FittingPeakConfig[]) => void;
    disabled?: boolean;
}

export function FittingPeakTable({ peaks, onChange, disabled }: Props) {
    const update = (id: string, field: keyof FittingPeakConfig, value: any) => {
        onChange(peaks.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const remove = (id: string) => {
        onChange(peaks.filter(p => p.id !== id));
    };

    const addBlank = () => {
        const newPeak: FittingPeakConfig = {
            id: `fit_peak_${Date.now()}`,
            name: `Peak_${peaks.length + 1}`,
            model: 'Lorentzian',
            center: 1500,
            center_min: 1470,
            center_max: 1530,
            fwhm_init: 30,
            amplitude: 1000,
            active: true,
            use_limits: true,
            q: 1.0,
            tau: 20.0,
            tau1: 10.0,
            tau2: 40.0,
            B: 5.0
        };
        onChange([...peaks, newPeak]);
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Sliders size={11} className="text-indigo-500" /> Model Peak Parameters
                </span>
                <button
                    onClick={addBlank}
                    disabled={disabled}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold transition-all disabled:opacity-40 shadow-sm"
                >
                    <Plus size={10} /> Add Peak
                </button>
            </div>

            {peaks.length === 0 && (
                <div className="text-center py-5 text-[11px] text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    No active peaks. Use the "Add Peak" button or double click on the spectrum.
                </div>
            )}

            {peaks.map((pk, idx) => {
                const isTRPL = pk.model === 'DecaySingleExp' || pk.model === 'DecayBiExp';
                return (
                    <div
                        key={pk.id}
                        className={cn(
                            "rounded-xl border p-3 transition-all",
                            pk.active
                                ? "bg-white border-slate-200 shadow-sm hover:border-slate-300"
                                : "bg-slate-50 border-slate-100 opacity-60"
                        )}
                    >
                        {/* Row 1: dot, name, model, use limits toggle, active, delete */}
                        <div className="flex items-center gap-2 mb-3">
                            <div
                                className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                                style={{ backgroundColor: PEAK_COLORS[idx % PEAK_COLORS.length] }}
                            />
                            <input
                                className="flex-1 min-w-0 text-xs font-bold bg-transparent border-b border-transparent focus:border-slate-300 outline-none text-slate-800 placeholder-slate-300"
                                value={pk.name}
                                onChange={e => update(pk.id, 'name', e.target.value)}
                                disabled={disabled}
                                placeholder="Name"
                            />
                            <select
                                className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg px-2 py-1 outline-none text-slate-600 cursor-pointer transition-colors"
                                value={pk.model}
                                onChange={e => update(pk.id, 'model', e.target.value as FittingPeakConfig['model'])}
                                disabled={disabled}
                            >
                                {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            
                            {/* Use Limits Flag */}
                            <button
                                onClick={() => update(pk.id, 'use_limits', !pk.use_limits)}
                                disabled={disabled}
                                title={pk.use_limits ? "Fitting with parameter constraints" : "Free fitting without constraints"}
                                className={cn(
                                    "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors",
                                    pk.use_limits
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                                        : "bg-slate-50 border-slate-200 text-slate-500"
                                )}
                            >
                                <Shield size={9} />
                                {pk.use_limits ? "Lmt" : "Free"}
                            </button>

                            {/* Active Toggle */}
                            <button
                                onClick={() => update(pk.id, 'active', !pk.active)}
                                disabled={disabled}
                                className={cn(
                                    "w-8 h-4 rounded-full transition-all relative shrink-0",
                                    pk.active ? "bg-indigo-600" : "bg-slate-200"
                                )}
                            >
                                <div className={cn(
                                    "w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all shadow-sm",
                                    pk.active ? "left-4" : "left-0.5"
                                )} />
                            </button>

                            {/* Delete Button */}
                            <button
                                onClick={() => remove(pk.id)}
                                disabled={disabled}
                                className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-30"
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>

                        {/* Param input fields depending on model type */}
                        <div className="grid grid-cols-3 gap-2">
                            {/* Amplitude - always present */}
                            <NumInput
                                label="Amplitude"
                                value={pk.amplitude}
                                onChange={v => update(pk.id, 'amplitude', v)}
                                disabled={disabled}
                            />

                            {!isTRPL ? (
                                <>
                                    {/* Standard Center / min / max */}
                                    <NumInput
                                        label="Center"
                                        unit="cm-1"
                                        value={pk.center}
                                        onChange={v => update(pk.id, 'center', v)}
                                        disabled={disabled}
                                    />
                                    <NumInput
                                        label="FWHM init"
                                        unit="cm-1"
                                        value={pk.fwhm_init}
                                        onChange={v => update(pk.id, 'fwhm_init', v)}
                                        disabled={disabled}
                                    />
                                    {pk.use_limits && (
                                        <>
                                            <NumInput
                                                label="Center Min"
                                                unit="cm-1"
                                                value={pk.center_min}
                                                onChange={v => update(pk.id, 'center_min', v)}
                                                disabled={disabled}
                                            />
                                            <NumInput
                                                label="Center Max"
                                                unit="cm-1"
                                                value={pk.center_max}
                                                onChange={v => update(pk.id, 'center_max', v)}
                                                disabled={disabled}
                                            />
                                        </>
                                    )}
                                    {pk.model === 'Fano' && (
                                        <NumInput
                                            label="q (Fano)"
                                            value={pk.q ?? 1.0}
                                            onChange={v => update(pk.id, 'q', v)}
                                            disabled={disabled}
                                        />
                                    )}
                                </>
                            ) : (
                                <>
                                    {/* TRPL Decay times and background */}
                                    {pk.model === 'DecaySingleExp' && (
                                        <NumInput
                                            label="tau (ns)"
                                            value={pk.tau ?? 20.0}
                                            onChange={v => update(pk.id, 'tau', v)}
                                            disabled={disabled}
                                        />
                                    )}
                                    {pk.model === 'DecayBiExp' && (
                                        <>
                                            <NumInput
                                                label="tau1 (ns)"
                                                value={pk.tau1 ?? 10.0}
                                                onChange={v => update(pk.id, 'tau1', v)}
                                                disabled={disabled}
                                            />
                                            <NumInput
                                                label="tau2 (ns)"
                                                value={pk.tau2 ?? 40.0}
                                                onChange={v => update(pk.id, 'tau2', v)}
                                                disabled={disabled}
                                            />
                                        </>
                                    )}
                                    <NumInput
                                        label="B (Bg)"
                                        value={pk.B ?? 5.0}
                                        onChange={v => update(pk.id, 'B', v)}
                                        disabled={disabled}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
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
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                <input
                    type="number"
                    className="flex-1 min-w-0 bg-transparent text-[10px] font-mono text-slate-700 outline-none py-0.5"
                    value={value}
                    onChange={e => onChange(parseFloat(e.target.value) || 0)}
                    disabled={disabled}
                    step="any"
                />
                {unit && <span className="text-[9px] text-slate-300 shrink-0 font-medium">{unit}</span>}
            </div>
        </div>
    );
}

export { PEAK_COLORS };

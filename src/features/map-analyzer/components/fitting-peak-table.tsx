'use client';

import React from 'react';
import { Trash2, Plus, Sliders, Shield, ShieldAlert, Lock, Unlock } from 'lucide-react';
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
    // Advanced parameter constraints matching PySide6 LMfit builder
    fixedParams?: Record<string, boolean>;
    minParams?: Record<string, number>;
    maxParams?: Record<string, number>;
    exprParams?: Record<string, string>;
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
    showLimits?: boolean;
    showExpr?: boolean;
}

const PARAM_ORDER = ['center', 'fwhm_init', 'amplitude', 'q', 'tau', 'tau1', 'tau2', 'B'];

function supportsParam(model: string, param: string): boolean {
    if (model === 'DecaySingleExp') {
        return param === 'amplitude' || param === 'tau' || param === 'B';
    }
    if (model === 'DecayBiExp') {
        return param === 'amplitude' || param === 'tau1' || param === 'tau2' || param === 'B';
    }
    // Standard shapes
    if (param === 'amplitude' || param === 'center' || param === 'fwhm_init') {
        return true;
    }
    if (model === 'Fano' && param === 'q') {
        return true;
    }
    return false;
}

export function FittingPeakTable({ peaks, onChange, disabled, showLimits = false, showExpr = false }: Props) {
    
    const update = (id: string, field: keyof FittingPeakConfig, value: any) => {
        onChange(peaks.map(p => {
            if (p.id !== id) return p;
            if (field === 'center') {
                const center = Number(value);
                const oldCenter = Number(p.center);
                const oldMin = Number(p.center_min);
                const oldMax = Number(p.center_max);
                const halfWindow = Number.isFinite(oldCenter) && Number.isFinite(oldMin) && Number.isFinite(oldMax)
                    ? Math.max(Math.abs(oldCenter - oldMin), Math.abs(oldMax - oldCenter), 30)
                    : 30;
                const nextMinParams = { ...(p.minParams || {}) };
                const nextMaxParams = { ...(p.maxParams || {}) };
                if (nextMinParams.center !== undefined) nextMinParams.center = Math.round((center - halfWindow) * 100) / 100;
                if (nextMaxParams.center !== undefined) nextMaxParams.center = Math.round((center + halfWindow) * 100) / 100;
                return {
                    ...p,
                    center,
                    center_min: Math.round((center - halfWindow) * 100) / 100,
                    center_max: Math.round((center + halfWindow) * 100) / 100,
                    minParams: nextMinParams,
                    maxParams: nextMaxParams,
                };
            }
            if (field === 'fwhm_init' || field === 'amplitude') {
                const numericValue = Number(value);
                const minLimit = p.minParams?.[field] !== undefined ? Number(p.minParams[field]) : (field === 'fwhm_init' ? 4.0 : 0.0);
                const maxLimit = p.maxParams?.[field] !== undefined ? Number(p.maxParams[field]) : (field === 'fwhm_init' ? 100.0 : 10000.0);
                const clipped = Math.min(Math.max(numericValue, minLimit), maxLimit);
                return { ...p, [field]: Number.isFinite(clipped) ? clipped : numericValue };
            }
            return { ...p, [field]: value };
        }));
    };

    const updateNested = (id: string, group: 'fixedParams' | 'minParams' | 'maxParams' | 'exprParams', key: string, value: any) => {
        onChange(peaks.map(p => {
            if (p.id !== id) return p;
            const updatedGroup = { ...(p[group] || {}), [key]: value };
            return { ...p, [group]: updatedGroup };
        }));
    };

    const updateLimit = (id: string, group: 'minParams' | 'maxParams', key: string, value: number) => {
        onChange(peaks.map(p => {
            if (p.id !== id) return p;
            const updatedGroup = { ...(p[group] || {}), [key]: value };
            const currentValue = Number((p as any)[key]);
            const shouldClipValue = key === 'fwhm_init' || key === 'amplitude';
            const clippedValue = shouldClipValue
                ? group === 'minParams'
                    ? Math.max(currentValue, value)
                    : Math.min(currentValue, value)
                : currentValue;
            return {
                ...p,
                ...(key === 'center' && group === 'minParams' ? { center_min: value } : {}),
                ...(key === 'center' && group === 'maxParams' ? { center_max: value } : {}),
                ...(shouldClipValue && Number.isFinite(clippedValue) ? { [key]: clippedValue } : {}),
                [group]: updatedGroup,
            };
        }));
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
            B: 5.0,
            fixedParams: {},
            minParams: {},
            maxParams: {},
            exprParams: {}
        };
        onChange([...peaks, newPeak]);
    };

    // Determine active parameters present across all active peaks
    const activeParams = PARAM_ORDER.filter(param => 
        peaks.some(p => p.active && supportsParam(p.model, param))
    );

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0d111a] rounded-2xl border border-slate-800 p-3 shadow-xl select-none">
            {/* Header controls */}
            <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                    <Sliders size={14} className="text-indigo-400" />
                    <span className="text-xs font-black text-slate-200 uppercase tracking-widest">
                        Interactive Parameter Grid
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">
                        {peaks.length} {peaks.length === 1 ? 'peak' : 'peaks'}
                    </span>
                </div>
                <button
                    onClick={addBlank}
                    disabled={disabled}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold transition-all disabled:opacity-40 shadow-lg shadow-indigo-900/30"
                >
                    <Plus size={11} /> Add Peak
                </button>
            </div>

            {peaks.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-6 rounded-xl border border-dashed border-slate-800 bg-slate-950/20">
                    <Sliders size={24} className="text-slate-700 mb-3 animate-pulse" />
                    <p className="text-[11px] text-slate-400 font-bold mb-1">No Peak Seeds Configured</p>
                    <p className="text-[10px] text-slate-500 max-w-[280px]">
                        Double-click on the spectrum plot above to add peaks, or click the "Add Peak" button.
                    </p>
                </div>
            ) : (
                <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 border border-slate-800 rounded-xl bg-slate-950/40">
                    <table className="w-full text-left border-collapse text-[10px] font-sans">
                        <thead>
                            <tr className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10">
                                <th className="px-2 py-1.5 w-[36px] text-center"></th>
                                <th className="px-2 py-1.5 w-[76px] font-bold text-slate-400 uppercase tracking-wider">Label</th>
                                <th className="px-2 py-1.5 w-[100px] font-bold text-slate-400 uppercase tracking-wider">Model</th>
                                <th className="px-2 py-1.5 w-[44px] text-center font-bold text-slate-400 uppercase tracking-wider">Active</th>
                                
                                {activeParams.map(param => (
                                    <th key={param} className="px-2 py-1.5 min-w-[130px] border-l border-slate-800 text-center">
                                        <span className="text-indigo-400 font-extrabold uppercase tracking-wide">{param}</span>
                                        <div className="flex items-center justify-center gap-1 mt-1 text-[8px] text-slate-500 font-bold uppercase tracking-wider">
                                            {showLimits && <span className="w-10">min</span>}
                                            <span className="w-14">value</span>
                                            {showLimits && <span className="w-10">max</span>}
                                            <span className="w-6">fix</span>
                                            {showExpr && <span className="w-16">expr</span>}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {peaks.map((pk, idx) => {
                                return (
                                    <tr 
                                        key={pk.id} 
                                        className={cn(
                                            "border-b border-slate-800/40 hover:bg-slate-900/20 transition-all",
                                            !pk.active && "opacity-40"
                                        )}
                                    >
                                        {/* Delete */}
                                        <td className="px-2 py-1 text-center">
                                            <button
                                                onClick={() => remove(pk.id)}
                                                disabled={disabled}
                                                className="p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-950/20 transition-colors disabled:opacity-30"
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        </td>

                                        {/* Label */}
                                        <td className="px-2 py-1">
                                            <div className="flex items-center gap-1.5">
                                                <div 
                                                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                                                    style={{ backgroundColor: PEAK_COLORS[idx % PEAK_COLORS.length] }}
                                                />
                                                <input
                                                    className="w-full bg-slate-900/60 border border-slate-800 rounded-md px-1.5 py-0.5 text-xs font-bold text-slate-200 focus:border-indigo-500 focus:outline-none"
                                                    value={pk.name}
                                                    onChange={e => update(pk.id, 'name', e.target.value)}
                                                    disabled={disabled}
                                                    placeholder="Peak Label"
                                                />
                                            </div>
                                        </td>

                                        {/* Model */}
                                        <td className="px-2 py-1">
                                            <select
                                                className="w-full bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-md px-1.5 py-0.5 font-bold text-slate-400 focus:border-indigo-500 cursor-pointer focus:outline-none transition-colors"
                                                value={pk.model}
                                                onChange={e => update(pk.id, 'model', e.target.value as FittingPeakConfig['model'])}
                                                disabled={disabled}
                                            >
                                                {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </td>

                                        {/* Active Toggle */}
                                        <td className="px-2 py-1 text-center">
                                            <button
                                                onClick={() => update(pk.id, 'active', !pk.active)}
                                                disabled={disabled}
                                                className={cn(
                                                    "w-7 h-3.5 rounded-full transition-all relative shrink-0 mx-auto",
                                                    pk.active ? "bg-indigo-600" : "bg-slate-800"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-2.5 h-2.5 rounded-full bg-white absolute top-0.5 transition-all shadow-sm",
                                                    pk.active ? "left-3.5" : "left-0.5"
                                                )} />
                                            </button>
                                        </td>

                                        {/* Parameters */}
                                        {activeParams.map(param => {
                                            const supported = supportsParam(pk.model, param);
                                            if (!supported) {
                                                return (
                                                    <td key={param} className="px-2 py-1 border-l border-slate-800/40 text-center text-slate-700 bg-slate-950/10 font-bold select-none">-</td>
                                                );
                                            }

                                            // Determine current values in peak state
                                            const val = (pk as any)[param] !== undefined ? (pk as any)[param] : 0.0;
                                            const isFixed = !!pk.fixedParams?.[param];
                                            const minVal = pk.minParams?.[param] !== undefined ? pk.minParams[param] : (param === 'center' ? pk.center_min : (param === 'fwhm_init' ? 4.0 : 0.0));
                                            const maxVal = pk.maxParams?.[param] !== undefined ? pk.maxParams[param] : (param === 'center' ? pk.center_max : (param === 'fwhm_init' ? 100.0 : 10000.0));
                                            const exprVal = pk.exprParams?.[param] || '';

                                            return (
                                                <td key={param} className="px-2 py-1 border-l border-slate-800/40">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {/* Min parameter constraint */}
                                                        {showLimits && (
                                                            <input
                                                                type="number"
                                                                step="any"
                                                                className="w-10 bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-center text-[9px] font-mono text-slate-500 focus:border-indigo-500 focus:outline-none"
                                                                value={minVal}
                                                            onChange={e => updateLimit(pk.id, 'minParams', param, parseFloat(e.target.value) || 0.0)}
                                                                disabled={disabled || isFixed}
                                                            />
                                                        )}

                                                        {/* Main parameter value */}
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            className={cn(
                                                                "w-14 bg-slate-900 border rounded px-1 py-0.5 text-center text-[10px] font-mono focus:border-indigo-500 focus:outline-none",
                                                                isFixed ? "border-slate-800 text-slate-500 font-bold" : "border-slate-800 text-slate-200"
                                                            )}
                                                            value={val}
                                                            onChange={e => {
                                                                const num = parseFloat(e.target.value) || 0.0;
                                                                if (param === 'center' || param === 'fwhm_init' || param === 'amplitude') {
                                                                    update(pk.id, param as keyof FittingPeakConfig, num);
                                                                } else {
                                                                    update(pk.id, param as keyof FittingPeakConfig, num);
                                                                }
                                                            }}
                                                            disabled={disabled}
                                                        />

                                                        {/* Max parameter constraint */}
                                                        {showLimits && (
                                                            <input
                                                                type="number"
                                                                step="any"
                                                                className="w-10 bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-center text-[9px] font-mono text-slate-500 focus:border-indigo-500 focus:outline-none"
                                                                value={maxVal}
                                                            onChange={e => updateLimit(pk.id, 'maxParams', param, parseFloat(e.target.value) || 0.0)}
                                                                disabled={disabled || isFixed}
                                                            />
                                                        )}

                                                        {/* Lock/Unlock parameter status (fixed flag) */}
                                                        <button
                                                            onClick={() => updateNested(pk.id, 'fixedParams', param, !isFixed)}
                                                            disabled={disabled}
                                                            title={isFixed ? "Vary this parameter" : "Fix this parameter"}
                                                            className={cn(
                                                                "p-0.5 rounded transition-colors",
                                                                isFixed 
                                                                    ? "text-red-400 bg-red-950/20" 
                                                                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                                                            )}
                                                        >
                                                            {isFixed ? <Lock size={9} /> : <Unlock size={9} />}
                                                        </button>

                                                        {/* Expressions input */}
                                                        {showExpr && (
                                                            <input
                                                                type="text"
                                                                className="w-16 bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-center text-[8px] font-mono text-slate-400 focus:border-indigo-500 focus:outline-none"
                                                                value={exprVal}
                                                                onChange={e => updateNested(pk.id, 'exprParams', param, e.target.value)}
                                                                disabled={disabled}
                                                                placeholder="expr"
                                                            />
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export { PEAK_COLORS };

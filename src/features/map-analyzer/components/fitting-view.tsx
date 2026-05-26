'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { 
    Wand2, Play, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, 
    Loader2, Save, FolderOpen, RefreshCw, Scissors, Compass, Sliders, Activity,
    ChevronLeft, ChevronRight, Check, Sparkles, Trash2, Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FittingPeakTable, FittingPeakConfig, PEAK_COLORS } from './fitting-peak-table';
import { FittingResultsPanel, FittingMapFitResult } from './fitting-results-panel';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

const ENGINE = 'http://127.0.0.1:8888';

type FitStatus = 'idle' | 'fitting' | 'fit_done' | 'applying' | 'done' | 'error';

const BASELINE_METHODS = [
    { value: 'asls',     label: 'asLS',    desc: 'Asymmetric Least Squares (smooth, general)' },
    { value: 'airpls',   label: 'airPLS',  desc: 'Adaptive iterative (good for broad baselines)' },
    { value: 'linear',   label: 'Linear',  desc: 'Linear background fit' },
    { value: 'poly',     label: 'Polynomial', desc: 'Custom order polynomial fit' },
    { value: 'none',     label: 'None',    desc: 'No baseline correction' },
];

const AXIS = {
    gridcolor: '#1e293b', zerolinecolor: '#334155', color: '#94a3b8',
    tickfont: { size: 10, color: '#94a3b8' },
};
const LAYOUT_BASE = {
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#0f172a',
    font: { family: 'Inter, sans-serif', size: 10, color: '#94a3b8' },
    margin: { l: 55, r: 20, t: 10, b: 40 },
    xaxis: { ...AXIS, title: { text: 'Wavenumber / Energy', font: { size: 10 } } },
    yaxis: { ...AXIS, title: { text: 'Intensity', font: { size: 10 } } },
};

interface FitData {
    original: { x: number; y: number }[];
    corrected: { x: number; y: number }[];
    baseline: { x: number; y: number }[];
    best_fit: { x: number; y: number }[];
    residuals: { x: number; y: number }[];
    components: Record<string, { x: number; y: number }[]>;
    parameters: any[];
    metrics: { r_squared: number; chi2_reduced: number; aic: number; bic: number };
}

interface Props {
    vaultRoot: string;
    h5Path: string;
    mapWidth: number;
    mapHeight: number;
    nSpectra: number;
}

export function FittingView({ vaultRoot, h5Path, mapWidth, mapHeight, nSpectra }: Props) {
    const [step, setStep] = useState<number>(1);
    const [peaks, setPeaks] = useState<FittingPeakConfig[]>([]);
    const [status, setStatus] = useState<FitStatus>('idle');
    const [fitData, setFitData] = useState<FitData | null>(null);

    // Baseline settings
    const [baselineMethod, setBaselineMethod] = useState('asls');
    const [baselineParams, setBaselineParams] = useState<Record<string, any>>({ lam: 1e5, p: 0.01, order: 2 });
    const [isBaselineSubtracted, setIsBaselineSubtracted] = useState<boolean>(false);
    
    // X correction & Crop options
    const [xShift, setXShift] = useState(0.0);
    const [siRefMeasured, setSiRefMeasured] = useState(520.7);
    const [cropMin, setCropMin] = useState<number | ''>('');
    const [cropMax, setCropMax] = useState<number | ''>('');
    const [appliedCrop, setAppliedCrop] = useState<[number, number] | null>(null);

    const [mapResult, setMapResult] = useState<FittingMapFitResult | null>(null);
    const [rawSpectrum, setRawSpectrum] = useState<{ x: number[]; y: number[] } | null>(null);
    const [previewBaseline, setPreviewBaseline] = useState<{ baseline: {x:number, y:number}[], corrected: {x:number, y:number}[] } | null>(null);
    const [autoDetectThreshold, setAutoDetectThreshold] = useState<number>(0.05);
    
    // Advanced options
    const [thresholdSNR, setThresholdSNR] = useState(3.0);
    const [showResiduals, setShowResiduals] = useState(true);

    // Load representative spectrum
    useEffect(() => {
        if (!h5Path || !vaultRoot) return;
        setRawSpectrum(null);
        setFitData(null);
        setMapResult(null);
        setStatus('idle');
        setXShift(0.0);
        setAppliedCrop(null);
        setCropMin('');
        setCropMax('');
        setIsBaselineSubtracted(false);
        setStep(1);

        fetch(`${ENGINE}/api/map/representative-spectrum`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vault_root: vaultRoot, h5_relative_path: h5Path }),
        })
        .then(r => r.json())
        .then(d => {
            if (d.success && Array.isArray(d.data) && d.data.length > 0) {
                const x = d.data.map((p: any) => p.x);
                const y = d.data.map((p: any) => p.y);
                setRawSpectrum({ x, y });
                
                // Auto range
                const xmin = Math.min(...x);
                const xmax = Math.max(...x);
                setCropMin(Math.round(xmin));
                setCropMax(Math.round(xmax));

                // Try to load saved config
                handleLoadConfigFile();
            }
        })
        .catch(() => {});
    }, [h5Path, vaultRoot]);

    const handleLoadConfigFile = async () => {
        try {
            const res = await fetch(`${ENGINE}/api/fitting/load-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vault_root: vaultRoot, h5_relative_path: h5Path }),
            });
            const d = await res.json();
            if (d.success && d.config) {
                setPeaks(d.config.peaks || []);
                setBaselineMethod(d.config.baseline_method || 'asls');
                setBaselineParams(d.config.baseline_params || { lam: 1e5, p: 0.01, order: 2 });
                setXShift(d.config.x_shift || 0.0);
                if (d.config.crop_range) {
                    setAppliedCrop(d.config.crop_range);
                    setCropMin(d.config.crop_range[0]);
                    setCropMax(d.config.crop_range[1]);
                }
                toast.info("Loaded parameters from HDF5 file");
            }
        } catch (e) {}
    };

    const handleSaveConfigFile = async () => {
        try {
            const res = await fetch(`${ENGINE}/api/fitting/save-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_path: h5Path,
                    peaks,
                    baseline_method: baselineMethod,
                    baseline_params: baselineParams,
                    x_shift: xShift,
                    crop_range: appliedCrop,
                }),
            });
            const d = await res.json();
            if (d.success) {
                toast.success("Parameters saved to HDF5 file");
            } else {
                toast.error(d.message || "Failed to save config");
            }
        } catch (e) {
            toast.error("Error communicating with scientific backend");
        }
    };

    // Calculate Si-Ref offset
    const applySiRef = () => {
        const offset = 520.7 - siRefMeasured;
        setXShift(offset);
        toast.success(`X-axis corrected by Silicon Reference (Offset: ${offset.toFixed(2)} cm⁻¹)`);
    };

    const applyCropRange = () => {
        if (cropMin !== '' && cropMax !== '') {
            setAppliedCrop([Number(cropMin), Number(cropMax)]);
            toast.success(`Spectral crop applied: [${cropMin}, ${cropMax}]`);
        }
    };

    const resetCropRange = () => {
        setAppliedCrop(null);
        if (rawSpectrum) {
            setCropMin(Math.round(Math.min(...rawSpectrum.x)));
            setCropMax(Math.round(Math.max(...rawSpectrum.x)));
        }
        toast.info("Spectral range reset to bounds");
    };

    // Interactive click to add peak (restricted to Step 3)
    const handleChartClick = (event: any) => {
        if (step !== 3) return;
        if (!event || !event.points || event.points.length === 0) return;
        const pt = event.points[0];
        const xPos = pt.x;
        const yVal = pt.y;

        const newPeak: FittingPeakConfig = {
            id: `fit_peak_${Date.now()}`,
            name: `Peak_${peaks.length + 1}`,
            model: 'Lorentzian',
            center: Math.round(xPos * 10) / 10,
            center_min: Math.round((xPos - 30) * 10) / 10,
            center_max: Math.round((xPos + 30) * 10) / 10,
            fwhm_init: 20,
            amplitude: Math.round(yVal * 10) / 10,
            active: true,
            use_limits: true,
        };
        setPeaks(prev => [...prev, newPeak]);
        toast.success(`Added Peak at ${newPeak.center.toFixed(1)}`);
    };

    // Auto-Preview Baseline when parameters change
    useEffect(() => {
        if (!h5Path || !rawSpectrum || baselineMethod === 'none' || fitData) {
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`${ENGINE}/api/fitting/preview-baseline`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        vault_root: vaultRoot,
                        h5_relative_path: h5Path,
                        baseline_method: baselineMethod,
                        baseline_params: baselineParams,
                        x_shift: xShift,
                        crop_range: appliedCrop
                    }),
                });
                const d = await res.json();
                if (d.success) {
                    setPreviewBaseline({ baseline: d.baseline, corrected: d.corrected });
                }
            } catch (e) {
                // Silent catch for auto-preview
            }
        }, 400); // 400ms debounce

        return () => clearTimeout(timer);
    }, [h5Path, vaultRoot, baselineMethod, baselineParams, rawSpectrum, fitData, xShift, appliedCrop]);

    // Auto-detect peaks on corrected spectrum (restricted to Step 3)
    const handleAutoDetect = async () => {
        if (!h5Path) return;
        setStatus('fitting');
        try {
            const res = await fetch(`${ENGINE}/api/fitting/auto-detect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    vault_root: vaultRoot,
                    h5_relative_path: h5Path,
                    baseline_method: isBaselineSubtracted ? baselineMethod : 'none', 
                    baseline_params: baselineParams,
                    x_shift: xShift,
                    crop_range: appliedCrop,
                    threshold: autoDetectThreshold
                }),
            });
            const d = await res.json();
            if (d.success) {
                setPeaks(d.peaks);
                toast.success(`Detected and seeded ${d.peaks.length} peaks!`);
            } else {
                toast.error('Peak auto-detection failed');
            }
        } catch { 
            toast.error('Failed to communicate with science engine'); 
        } finally {
            setStatus('idle');
        }
    };

    // Run Single Fit (Step 4)
    const handleFitSingle = async () => {
        if (peaks.filter(p => p.active).length === 0) {
            toast.warning("Please add at least one active peak to fit.");
            return;
        }

        setStatus('fitting');
        try {
            const res = await fetch(`${ENGINE}/api/fitting/fit-representative`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_path: h5Path,
                    peaks,
                    baseline_method: isBaselineSubtracted ? baselineMethod : 'none',
                    baseline_params: baselineParams,
                    x_shift: xShift,
                    crop_range: appliedCrop,
                }),
            });
            const d = await res.json();
            if (d.success) {
                setFitData(d);
                // Update peak centers from output params
                const updatedPeaks = peaks.map(p => {
                    const safeName = p.name.replace(/[^a-zA-Z0-9_]/g, '_');
                    const centerParam = d.parameters.find((param: any) => param.name === `${safeName}_center`);
                    if (centerParam) {
                        return { ...p, center: Math.round(centerParam.value * 100) / 100 };
                    }
                    return p;
                });
                setPeaks(updatedPeaks);
                setStatus('fit_done');
                toast.success("Spectrum fitted successfully!");
            } else {
                setStatus('error');
                toast.error(d.message || "Fitting failed to converge.");
            }
        } catch (e) {
            setStatus('error');
            toast.error("Failed to connect to science engine");
        }
    };

    // Batch Apply (Step 5)
    const handleApplyMap = async () => {
        if (peaks.filter(p => p.active).length === 0) {
            toast.warning("Define active peak templates before applying to map.");
            return;
        }

        setStatus('applying');
        try {
            const res = await fetch(`${ENGINE}/api/fitting/apply-to-map`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_path: h5Path,
                    peaks,
                    baseline_method: isBaselineSubtracted ? baselineMethod : 'none',
                    baseline_params: baselineParams,
                    x_shift: xShift,
                    crop_range: appliedCrop,
                    threshold_snr: thresholdSNR,
                }),
            });
            const d = await res.json();
            if (d.success) {
                setMapResult(d);
                setStatus('done');
                toast.success("Batch fit applied to entire map!");
            } else {
                setStatus('error');
                toast.error(d.message || "Batch fit failed");
            }
        } catch (e) {
            setStatus('error');
            toast.error("Failed to complete parallel map fitting");
        }
    };

    // Build Plotly Data based on Step
    const plotlyData = useMemo(() => {
        if (!rawSpectrum) return [];
        const traces: any[] = [];

        // Apply shift/crop locally
        let renderX = rawSpectrum.x.map(xi => xi + xShift);
        let renderY = rawSpectrum.y;
        if (appliedCrop) {
            const [xmin, xmax] = appliedCrop;
            const mask = renderX.map(xi => xi >= xmin && xi <= xmax);
            renderX = renderX.filter((_, i) => mask[i]);
            renderY = renderY.filter((_, i) => mask[i]);
        }

        if (step === 1) {
            // Step 1: Región y Calibración
            traces.push({
                x: renderX,
                y: renderY,
                mode: 'lines',
                name: 'Original Spectrum',
                line: { color: '#6366f1', width: 2 }
            });
        } else if (step === 2) {
            // Step 2: Línea Base
            if (!isBaselineSubtracted) {
                traces.push({
                    x: renderX,
                    y: renderY,
                    mode: 'lines',
                    name: 'Spectrum',
                    line: { color: '#64748b', width: 1.5, dash: 'dot' }
                });
                if (previewBaseline) {
                    traces.push({
                        x: previewBaseline.baseline.map(p => p.x),
                        y: previewBaseline.baseline.map(p => p.y),
                        mode: 'lines',
                        name: 'Baseline Preview',
                        line: { color: '#f97316', width: 2 }
                    });
                }
            } else {
                if (previewBaseline) {
                    traces.push({
                        x: previewBaseline.corrected.map(p => p.x),
                        y: previewBaseline.corrected.map(p => p.y),
                        mode: 'lines',
                        name: 'Corrected Spectrum',
                        line: { color: '#10b981', width: 2 }
                    });
                } else {
                    traces.push({
                        x: renderX,
                        y: renderY,
                        mode: 'lines',
                        name: 'Spectrum',
                        line: { color: '#64748b', width: 1.5 }
                    });
                }
            }
        } else if (step === 3) {
            // Step 3: Añadir Picos
            let activeX = renderX;
            let activeY = renderY;
            if (isBaselineSubtracted && previewBaseline) {
                activeX = previewBaseline.corrected.map(p => p.x);
                activeY = previewBaseline.corrected.map(p => p.y);
            }
            traces.push({
                x: activeX,
                y: activeY,
                mode: 'lines',
                name: isBaselineSubtracted ? 'Corrected' : 'Spectrum',
                line: { color: '#10b981', width: 2 }
            });

            // Peak indicator lines
            peaks.forEach((pk, idx) => {
                if (!pk.active) return;
                const color = PEAK_COLORS[idx % PEAK_COLORS.length];
                traces.push({
                    x: [pk.center, pk.center],
                    y: [0, pk.amplitude],
                    mode: 'lines+markers',
                    name: pk.name,
                    line: { color, width: 2, dash: 'dash' },
                    marker: { size: 6, symbol: 'diamond' }
                });
            });
        } else if (step === 4) {
            // Step 4: Ajuste Espectral (Fitting)
            let activeX = renderX;
            let activeY = renderY;
            if (isBaselineSubtracted && previewBaseline) {
                activeX = previewBaseline.corrected.map(p => p.x);
                activeY = previewBaseline.corrected.map(p => p.y);
            }
            traces.push({
                x: activeX,
                y: activeY,
                mode: 'lines',
                name: isBaselineSubtracted ? 'Corrected' : 'Spectrum',
                line: { color: '#64748b', width: 1.5, dash: 'dot' }
            });

            if (fitData && status !== 'fitting') {
                const fitX = fitData.original.map(p => p.x);

                traces.push({
                    x: fitX,
                    y: fitData.best_fit.map(p => p.y),
                    mode: 'lines',
                    name: 'Best Fit',
                    line: { color: '#ef4444', width: 2 }
                });

                Object.entries(fitData.components).forEach(([compName, compPts], idx) => {
                    const color = PEAK_COLORS[idx % PEAK_COLORS.length];
                    traces.push({
                        x: fitX,
                        y: compPts.map(p => p.y),
                        mode: 'lines',
                        fill: 'tozeroy',
                        fillcolor: `${color}1A`,
                        name: compName.replace('_', ' '),
                        line: { color, width: 1.5 }
                    });
                });

                if (showResiduals) {
                    const maxVal = Math.max(...activeY);
                    traces.push({
                        x: fitX,
                        y: fitData.residuals.map(p => p.y - (0.12 * maxVal)),
                        mode: 'lines',
                        name: 'Residuals',
                        line: { color: '#10b981', width: 1 }
                    });
                }
            }
        }

        return traces;
    }, [rawSpectrum, step, isBaselineSubtracted, previewBaseline, peaks, fitData, status, showResiduals, xShift, appliedCrop]);

    const wizardSteps = [
        { id: 1, name: '1. Región & Calibración', icon: Scissors },
        { id: 2, name: '2. Línea Base', icon: Sliders },
        { id: 3, name: '3. Sembrar Picos', icon: Compass },
        { id: 4, name: '4. Ajuste Espectral', icon: Wand2 },
        { id: 5, name: '5. Mapa de Calor 2D', icon: Activity }
    ];

    return (
        <div className="flex flex-col h-full bg-[#0f172a] text-slate-100 font-sans overflow-hidden">
            {/* Top Wizard Steps Header */}
            <div className="bg-[#0b0f19] border-b border-slate-800 p-4 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                        SPECTROview Fitting Wizard
                    </h3>
                    <span className="text-[10px] bg-indigo-950 text-indigo-400 border border-indigo-800 px-2 py-0.5 rounded-full font-semibold">
                        Modo Secuencial
                    </span>
                </div>
                
                <div className="flex items-center gap-1.5 md:gap-3">
                    {wizardSteps.map((s, idx) => {
                        const Icon = s.icon;
                        const isActive = step === s.id;
                        const isCompleted = step > s.id;
                        
                        return (
                            <div key={s.id} className="flex items-center">
                                <button
                                    onClick={() => setStep(s.id)}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-xs font-semibold",
                                        isActive 
                                            ? "bg-gradient-to-r from-indigo-600 to-violet-600 border-indigo-500 text-white shadow-md shadow-indigo-950"
                                            : isCompleted
                                                ? "bg-[#131b2e] border-emerald-800 text-emerald-400"
                                                : "bg-[#131b2e] border-slate-800 text-slate-400 hover:border-slate-700"
                                    )}
                                >
                                    {isCompleted ? (
                                        <CheckCircle2 size={13} className="text-emerald-400" />
                                    ) : (
                                        <Icon size={13} className={isActive ? "text-white" : "text-slate-400"} />
                                    )}
                                    <span className="hidden md:inline">{s.name}</span>
                                </button>
                                {idx < wizardSteps.length - 1 && (
                                    <div className="h-[1px] w-3 md:w-5 bg-slate-850" />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left sidebar - Controls */}
                <div className="w-[340px] border-r border-slate-800 bg-[#0b0f19] p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
                    
                    {/* Render Step Sidebar content */}
                    {step === 1 && (
                        <div className="flex flex-col gap-4">
                            <div className="bg-[#131b2e] rounded-xl p-4 border border-slate-800">
                                <div className="flex items-center gap-2 mb-2 text-indigo-400">
                                    <Compass size={14} />
                                    <span className="text-xs font-bold uppercase tracking-wide">Calibración de Eje X</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
                                    Corrige corrimientos en el espectro. Introduce la posición medida del pico de Silicio estándar (520.7 cm⁻¹) o introduce un desplazamiento manual.
                                </p>
                                <div className="flex flex-col gap-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400 font-semibold">Si Medido:</span>
                                        <div className="flex items-center gap-1.5">
                                            <input 
                                                type="number"
                                                step="any"
                                                value={siRefMeasured}
                                                onChange={e => setSiRefMeasured(parseFloat(e.target.value) || 0)}
                                                className="bg-[#1e293b] text-slate-100 text-xs px-2.5 py-1 rounded-lg border border-slate-700 outline-none w-20 font-mono text-center"
                                            />
                                            <span className="text-[10px] text-slate-500">cm⁻¹</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400 font-semibold">Desplazamiento:</span>
                                        <div className="flex items-center gap-1.5">
                                            <input 
                                                type="number"
                                                step="any"
                                                value={xShift}
                                                onChange={e => setXShift(parseFloat(e.target.value) || 0)}
                                                className="bg-[#1e293b] text-slate-100 text-xs px-2.5 py-1 rounded-lg border border-slate-700 outline-none w-20 font-mono text-center"
                                            />
                                            <span className="text-[10px] text-slate-500">cm⁻¹</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={applySiRef}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors mt-1 shadow-sm flex items-center justify-center gap-1.5"
                                    >
                                        Calibrar Eje X
                                    </button>
                                </div>
                            </div>

                            <div className="bg-[#131b2e] rounded-xl p-4 border border-slate-800">
                                <div className="flex items-center gap-2 mb-2 text-pink-400">
                                    <Scissors size={14} />
                                    <span className="text-xs font-bold uppercase tracking-wide">Recortar Rango (Crop)</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
                                    Define el rango espectral activo para el ajuste.
                                </p>
                                <div className="flex items-center gap-2 mb-3">
                                    <input
                                        type="number"
                                        placeholder="Min"
                                        value={cropMin}
                                        onChange={e => setCropMin(e.target.value !== '' ? Number(e.target.value) : '')}
                                        className="bg-[#1e293b] text-slate-100 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 outline-none w-full font-mono text-center"
                                    />
                                    <span className="text-slate-500 text-xs">&mdash;</span>
                                    <input
                                        type="number"
                                        placeholder="Max"
                                        value={cropMax}
                                        onChange={e => setCropMax(e.target.value !== '' ? Number(e.target.value) : '')}
                                        className="bg-[#1e293b] text-slate-100 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 outline-none w-full font-mono text-center"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={applyCropRange}
                                        className="bg-[#1e293b] hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold py-1.5 rounded-lg transition-all"
                                    >
                                        Aplicar Recorte
                                    </button>
                                    <button
                                        onClick={resetCropRange}
                                        className="bg-[#1e293b] hover:bg-slate-800 border border-slate-700 text-slate-500 text-xs font-bold py-1.5 rounded-lg transition-all"
                                    >
                                        Restablecer
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="flex flex-col gap-4">
                            <div className="bg-[#131b2e] rounded-xl p-4 border border-slate-800">
                                <div className="flex items-center gap-2 mb-2 text-emerald-400">
                                    <Sliders size={14} />
                                    <span className="text-xs font-bold uppercase tracking-wide">Estimación de Línea Base</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
                                    Selecciona el modelo matemático para remover la autofluorescencia o el fondo continuo del espectro.
                                </p>
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9px] text-slate-400 font-bold uppercase">Algoritmo</span>
                                        <select
                                            value={baselineMethod}
                                            onChange={e => setBaselineMethod(e.target.value)}
                                            className="bg-[#1e293b] text-slate-100 text-xs px-2 py-1.5 rounded-lg border border-slate-700 outline-none cursor-pointer w-full font-semibold"
                                        >
                                            {BASELINE_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                        </select>
                                    </div>

                                    {baselineMethod === 'poly' && (
                                        <div className="flex flex-col gap-1 bg-[#0b0f19] p-2 rounded-lg border border-slate-850">
                                            <span className="text-[9px] text-slate-400 font-bold uppercase flex justify-between">
                                                <span>Grado Polinomio</span>
                                                <span className="text-indigo-400 font-mono">Grado {baselineParams.order}</span>
                                            </span>
                                            <input
                                                type="range"
                                                min="1"
                                                max="8"
                                                value={baselineParams.order}
                                                onChange={e => setBaselineParams(prev => ({ ...prev, order: parseInt(e.target.value) }))}
                                                className="w-full h-1.5 bg-[#1e293b] rounded-lg appearance-none cursor-pointer accent-indigo-500 my-1"
                                            />
                                        </div>
                                    )}

                                    {['asls', 'airpls'].includes(baselineMethod) && (
                                        <div className="flex flex-col gap-1 bg-[#0b0f19] p-2 rounded-lg border border-slate-850">
                                            <span className="text-[9px] text-slate-400 font-bold uppercase flex justify-between">
                                                <span>Suavizado log(λ)</span>
                                                <span className="text-indigo-400 font-mono">10^{Math.log10(baselineParams.lam).toFixed(1)}</span>
                                            </span>
                                            <input
                                                type="range"
                                                min="3"
                                                max="9"
                                                step="0.5"
                                                value={Math.log10(baselineParams.lam)}
                                                onChange={e => setBaselineParams(prev => ({ ...prev, lam: Math.pow(10, parseFloat(e.target.value)) }))}
                                                className="w-full h-1.5 bg-[#1e293b] rounded-lg appearance-none cursor-pointer accent-indigo-500 my-1"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-[#131b2e] rounded-xl p-4 border border-slate-800 flex flex-col gap-3">
                                <div className="text-[10px] text-slate-400 flex flex-col gap-1.5 leading-relaxed">
                                    <span className="font-bold text-slate-300">Estado de Sustracción:</span>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <div className={cn("w-2 h-2 rounded-full animate-pulse", isBaselineSubtracted ? "bg-emerald-400" : "bg-amber-400")} />
                                        <span className="font-mono text-xs font-semibold">
                                            {isBaselineSubtracted ? "Sustraída (Corrected)" : "Previewing (Uncorrected)"}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setIsBaselineSubtracted(!isBaselineSubtracted)}
                                    className={cn(
                                        "w-full text-xs font-bold py-2 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 border border-transparent",
                                        isBaselineSubtracted 
                                            ? "bg-amber-600 hover:bg-amber-700 text-white"
                                            : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                    )}
                                >
                                    {isBaselineSubtracted ? (
                                        <>
                                            <RefreshCw size={13} /> Deshacer Sustracción
                                        </>
                                    ) : (
                                        <>
                                            <Sliders size={13} /> Restar Línea Base
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="flex flex-col gap-4">
                            <div className="bg-[#131b2e] rounded-xl p-4 border border-slate-800">
                                <div className="flex items-center gap-2 mb-2 text-pink-400">
                                    <Compass size={14} />
                                    <span className="text-xs font-bold uppercase tracking-wide">Sembrar Picos Manualmente</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
                                    Haz clic directamente en cualquier punto de la curva del gráfico corregido para sembrar el centro del pico y estimar su amplitud.
                                </p>
                                <div className="bg-[#0b0f19] p-2.5 rounded-lg border border-slate-800 text-[10px] text-slate-400 flex flex-col gap-1.5 font-mono">
                                    <span className="text-slate-300 font-bold">Semillas Sembradas:</span>
                                    <span className="text-indigo-400 font-semibold">{peaks.length} picos activos</span>
                                </div>
                            </div>

                            <div className="bg-[#131b2e] rounded-xl p-4 border border-slate-800">
                                <div className="flex items-center gap-2 mb-2 text-indigo-400">
                                    <Wand2 size={14} />
                                    <span className="text-xs font-bold uppercase tracking-wide">Detección Automática</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
                                    Usa scipy para escanear y posicionar semillas automáticamente basándose en la prominencia.
                                </p>
                                <div className="flex flex-col gap-2.5">
                                    <div className="flex flex-col gap-1 bg-[#0b0f19] p-2 rounded-lg border border-slate-850">
                                        <span className="text-[9px] text-slate-400 font-bold uppercase flex justify-between">
                                            <span>Prominencia</span>
                                            <span className="text-indigo-400 font-mono">{autoDetectThreshold.toFixed(3)}</span>
                                        </span>
                                        <input
                                            type="range"
                                            min="0.005"
                                            max="0.30"
                                            step="0.005"
                                            value={autoDetectThreshold}
                                            onChange={e => setAutoDetectThreshold(parseFloat(e.target.value))}
                                            className="w-full h-1.5 bg-[#1e293b] rounded-lg appearance-none cursor-pointer accent-indigo-500 my-1"
                                        />
                                    </div>
                                    <button
                                        onClick={handleAutoDetect}
                                        disabled={status === 'fitting'}
                                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold py-2 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                                    >
                                        {status === 'fitting' ? (
                                            <>
                                                <Loader2 size={13} className="animate-spin" /> Buscando...
                                            </>
                                        ) : (
                                            <>
                                                <Wand2 size={13} /> Auto-detectar Semillas
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="flex flex-col gap-4">
                            <div className="bg-[#131b2e] rounded-xl p-4 border border-slate-800">
                                <div className="flex items-center gap-2 mb-2 text-indigo-400">
                                    <Wand2 size={14} />
                                    <span className="text-xs font-bold uppercase tracking-wide">Optimización lmfit</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
                                    Ajusta las curvas de picos configuradas sobre el espectro actual aplicando mínimos cuadrados no lineales.
                                </p>
                                <button
                                    onClick={handleFitSingle}
                                    disabled={status === 'fitting'}
                                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 w-full font-semibold text-center"
                                >
                                    {status === 'fitting' ? (
                                        <>
                                            <Loader2 size={13} className="animate-spin" /> Ajustando...
                                        </>
                                    ) : (
                                        <>
                                            <Wand2 size={13} /> Ajustar Espectro
                                        </>
                                    )}
                                </button>
                            </div>

                            {fitData && (
                                <div className="bg-[#131b2e] rounded-xl p-4 border border-slate-800 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-200">
                                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                                        <Sparkles size={11} className="text-amber-400 animate-pulse" /> Métricas de Ajuste
                                    </span>
                                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                                        <div className="bg-[#0b0f19] p-2 rounded border border-slate-850 flex flex-col gap-0.5">
                                            <span className="text-slate-500 font-semibold">R²</span>
                                            <span className="text-emerald-400 font-bold text-xs">{fitData.metrics.r_squared.toFixed(5)}</span>
                                        </div>
                                        <div className="bg-[#0b0f19] p-2 rounded border border-slate-850 flex flex-col gap-0.5">
                                            <span className="text-slate-500 font-semibold">χ² Reducida</span>
                                            <span className="text-indigo-400 font-bold text-xs">{fitData.metrics.chi2_reduced.toFixed(2)}</span>
                                        </div>
                                        <div className="bg-[#0b0f19] p-2 rounded border border-slate-850 flex flex-col gap-0.5">
                                            <span className="text-slate-500 font-semibold">AIC</span>
                                            <span className="text-indigo-400 font-bold text-xs">{fitData.metrics.aic.toFixed(1)}</span>
                                        </div>
                                        <div className="bg-[#0b0f19] p-2 rounded border border-slate-850 flex flex-col gap-0.5">
                                            <span className="text-slate-500 font-semibold">BIC</span>
                                            <span className="text-indigo-400 font-bold text-xs">{fitData.metrics.bic.toFixed(1)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleSaveConfigFile}
                                className="border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold py-2 rounded-xl transition-all text-xs flex items-center justify-center gap-1.5 w-full mt-2"
                            >
                                <Save size={13} /> Guardar Ajustes en H5
                            </button>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="flex flex-col gap-4">
                            <div className="bg-[#131b2e] rounded-xl p-4 border border-slate-800">
                                <div className="flex items-center gap-2 mb-2 text-pink-400">
                                    <Activity size={14} />
                                    <span className="text-xs font-bold uppercase tracking-wide">Ajuste de Mapa Completo</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
                                    Ejecuta el proceso en lote sobre cada uno de los espectros del mapa. Ignora píxeles con relación señal/ruido por debajo del umbral.
                                </p>
                                <div className="flex flex-col gap-2.5">
                                    <div className="flex items-center justify-between bg-[#0b0f19] p-2 rounded-lg border border-slate-800">
                                        <span className="text-[10px] text-slate-400 font-semibold">Umbral SNR:</span>
                                        <input
                                            type="number"
                                            step="any"
                                            value={thresholdSNR}
                                            onChange={e => setThresholdSNR(parseFloat(e.target.value) || 0)}
                                            className="bg-[#1e293b] text-slate-100 text-xs px-2 py-1 rounded border border-slate-700 outline-none w-16 text-center font-mono font-bold"
                                        />
                                    </div>

                                    <button
                                        onClick={handleApplyMap}
                                        disabled={status === 'applying'}
                                        className="bg-pink-600 hover:bg-pink-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition-all text-xs flex items-center justify-center gap-1.5 shadow-md w-full"
                                    >
                                        {status === 'applying' ? (
                                            <>
                                                <Loader2 size={13} className="animate-spin" /> Procesando Mapa...
                                            </>
                                        ) : (
                                            <>
                                                <Play size={13} /> Batch Fit Map
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {mapResult && (
                                <div className="bg-[#131b2e] rounded-xl p-4 border border-slate-800 flex flex-col gap-1.5 text-[10px] font-mono leading-relaxed animate-in slide-in-from-top duration-250">
                                    <span className="font-bold text-slate-300 mb-1">Resultado de Procesamiento:</span>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Espectros Totales:</span>
                                        <span className="text-slate-300 font-bold">{mapResult.n_spectra}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Ajustes Exitosos:</span>
                                        <span className="text-emerald-400 font-bold">{mapResult.success_count} ({((mapResult.success_count / mapResult.n_spectra) * 100).toFixed(1)}%)</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bottom Sidebar Step Navigation */}
                    <div className="mt-auto flex items-center justify-between gap-3 pt-4 border-t border-slate-800 bg-[#0b0f19]">
                        <button
                            disabled={step === 1}
                            onClick={() => setStep(prev => Math.max(1, prev - 1))}
                            className="flex-1 bg-[#1e293b] hover:bg-slate-800 border border-slate-700 disabled:opacity-40 text-slate-300 text-xs font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-1"
                        >
                            <ChevronLeft size={14} /> Anterior
                        </button>
                        <button
                            disabled={step === 5}
                            onClick={() => setStep(prev => Math.min(5, prev + 1))}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-1 shadow-md shadow-indigo-950"
                        >
                            Siguiente <ChevronRight size={14} />
                        </button>
                    </div>
                </div>

                {/* Main Area: Plot and parameter table */}
                <div className="flex-1 flex flex-col overflow-hidden bg-[#0f172a]">
                    <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
                        
                        {/* Plot area */}
                        <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-4 min-h-[350px] relative">
                            {rawSpectrum ? (
                                <Plot
                                    data={plotlyData}
                                    layout={{
                                        ...LAYOUT_BASE,
                                        height: 320,
                                        margin: { l: 50, r: 10, t: 10, b: 35 },
                                    }}
                                    onClick={handleChartClick}
                                    config={{ displayModeBar: false, responsive: true }}
                                    style={{ width: '100%' }}
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                                    <Loader2 size={24} className="animate-spin text-indigo-500" />
                                    Loading representative spectrum...
                                </div>
                            )}

                            {/* Dynamic Tips overlay depending on step */}
                            <div className="flex items-center gap-4 text-[10px] text-slate-400 mt-2 px-1">
                                {step === 1 && (
                                    <span>💡 Paso 1: Configura los límites X de recorte y/o aplica la calibración usando tu Silicio medido.</span>
                                )}
                                {step === 2 && (
                                    <span>💡 Paso 2: Selecciona un algoritmo de línea base. Haz clic en &quot;Restar Línea Base&quot; para aplanar el espectro.</span>
                                )}
                                {step === 3 && (
                                    <span>💡 Paso 3: Haz clic en el gráfico plano para colocar semillas o presiona &quot;Auto-detectar Semillas&quot;.</span>
                                )}
                                {step === 4 && (
                                    <span>💡 Paso 4: Ajusta los picos configurados presionando &quot;Ajustar Espectro&quot; en el panel izquierdo.</span>
                                )}
                                {step === 5 && (
                                    <span>💡 Paso 5: Haz clic en &quot;Batch Fit Map&quot; para ejecutar el ajuste por lotes en todos los píxeles de la muestra.</span>
                                )}

                                {step === 4 && fitData && (
                                    <div className="flex gap-3 ml-auto">
                                        <label className="flex items-center gap-1 cursor-pointer select-none">
                                            <input type="checkbox" checked={showResiduals} onChange={e=>setShowResiduals(e.target.checked)} className="rounded bg-[#1e293b] border-slate-700 accent-indigo-500" />
                                            Ver Residuales
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Interactive Parameter Seeding Table (Step 3 & Step 4) */}
                        {(step === 3 || step === 4) && (
                            <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-4 flex-1 min-h-[300px] animate-in fade-in slide-in-from-bottom duration-250">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                                        <Compass size={13} className="text-indigo-400" /> Configuración de Semillas y Picos
                                    </h4>
                                    {step === 3 && (
                                        <button 
                                            onClick={() => {
                                                const newPeak: FittingPeakConfig = {
                                                    id: `fit_peak_${Date.now()}`,
                                                    name: `Peak_${peaks.length + 1}`,
                                                    model: 'Lorentzian',
                                                    center: 500,
                                                    center_min: 470,
                                                    center_max: 530,
                                                    fwhm_init: 20,
                                                    amplitude: 100,
                                                    active: true,
                                                    use_limits: true,
                                                };
                                                setPeaks(prev => [...prev, newPeak]);
                                            }}
                                            className="bg-indigo-950 text-indigo-400 hover:bg-indigo-900 border border-indigo-800 text-[10px] font-bold py-1 px-2.5 rounded-lg transition-colors flex items-center gap-1"
                                        >
                                            <Plus size={12} /> Añadir Pico
                                        </button>
                                    )}
                                </div>
                                <FittingPeakTable peaks={peaks} onChange={setPeaks} disabled={status === 'fitting'} />
                            </div>
                        )}

                        {/* Informative placeholder cards for other steps */}
                        {step === 1 && (
                            <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 flex flex-col justify-center items-center text-center flex-1 min-h-[150px] animate-in fade-in">
                                <Scissors size={32} className="text-slate-600 mb-3 animate-pulse" />
                                <h4 className="text-xs font-bold text-slate-300 mb-1">Recorte y Alineación de Rangos</h4>
                                <p className="text-[10px] text-slate-500 max-w-sm">
                                    Optimiza el rendimiento del ajuste científico reduciendo la ventana a la zona de interés (ej: 1000 - 1800 cm⁻¹ para G/D en Grafeno) y ajustando corrimientos físicos del sensor.
                                </p>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 flex flex-col justify-center items-center text-center flex-1 min-h-[150px] animate-in fade-in">
                                <Sliders size={32} className="text-slate-600 mb-3 animate-pulse" />
                                <h4 className="text-xs font-bold text-slate-300 mb-1">Remoción de Fondo (Línea Base)</h4>
                                <p className="text-[10px] text-slate-500 max-w-sm">
                                    Utiliza el preview visual naranja del gráfico para sintonizar los hiperparámetros. En este paso el objetivo es lograr una curva corregida perfectamente aplanada en cero para facilitar la colocación de semillas.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Batch Map results panel sliding from bottom */}
                    {mapResult && (
                        <div className="h-[400px] border-t border-slate-800 bg-[#0b0f19] z-40 relative flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
                            <button 
                                onClick={() => setMapResult(null)}
                                className="absolute top-2 right-4 text-xs font-bold text-slate-400 hover:text-slate-200 bg-[#1e293b] hover:bg-slate-800 py-1 px-3 rounded-lg z-50 border border-slate-700 transition-colors shadow-lg"
                            >
                                Cerrar Mapas
                            </button>
                            <FittingResultsPanel
                                result={mapResult}
                                mapWidth={mapWidth}
                                mapHeight={mapHeight}
                                peakNames={peaks.map(p => p.name)}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

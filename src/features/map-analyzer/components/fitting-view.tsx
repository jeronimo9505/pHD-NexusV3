'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { 
    Wand2, Play, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, 
    Loader2, Save, FolderOpen, RefreshCw, Scissors, Compass, Sliders, Activity,
    ChevronLeft, ChevronRight, Check, Sparkles, Trash2, Plus, Lock, Unlock,
    Database, Undo, Clipboard, Copy, FileText
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
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#080d16',
    font: { family: 'Inter, sans-serif', size: 10, color: '#94a3b8' },
    margin: { l: 55, r: 20, t: 10, b: 40 },
    xaxis: { ...AXIS, title: { text: 'Wavenumber (cm⁻¹)', font: { size: 10 } } },
    yaxis: { ...AXIS, title: { text: 'Intensity (a.u.)', font: { size: 10 } } },
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
    const [peaks, setPeaks] = useState<FittingPeakConfig[]>([]);
    const [status, setStatus] = useState<FitStatus>('idle');
    const [fitData, setFitData] = useState<FitData | null>(null);

    // Baseline settings
    const [baselineMethod, setBaselineMethod] = useState('asls');
    const [baselineParams, setBaselineParams] = useState<Record<string, any>>({ lam: 1e5, p: 0.01, order: 2 });
    const [isBaselineSubtracted, setIsBaselineSubtracted] = useState<boolean>(true);
    
    // X correction & Crop options
    const [xShift, setXShift] = useState(0.0);
    const [xCorrectionMode, setXCorrectionMode] = useState<'none' | 'si_ref'>('none');
    const [siRefMeasured, setSiRefMeasured] = useState(520.7);
    const [cropMin, setCropMin] = useState<number | ''>('');
    const [cropMax, setCropMax] = useState<number | ''>('');
    const [appliedCrop, setAppliedCrop] = useState<[number, number] | null>(null);

    const [mapResult, setMapResult] = useState<FittingMapFitResult | null>(null);
    const [rawSpectrum, setRawSpectrum] = useState<{ x: number[]; y: number[] } | null>(null);
    const [previewBaseline, setPreviewBaseline] = useState<{ baseline: {x:number, y:number}[], corrected: {x:number, y:number}[] } | null>(null);
    const [autoDetectThreshold, setAutoDetectThreshold] = useState<number>(0.05);
    
    // UI control displays
    const [showResiduals, setShowResiduals] = useState(true);
    const [showComponents, setShowComponents] = useState(true);
    const [showLimits, setShowLimits] = useState(false);
    const [showExpr, setShowExpr] = useState(false);
    const [shapeSelection, setShapeSelection] = useState<FittingPeakConfig['model']>('Lorentzian');

    // Clipboard and templates
    const [peaksClipboard, setPeaksClipboard] = useState<FittingPeakConfig[] | null>(null);
    const [thresholdSNR, setThresholdSNR] = useState(3.0);

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
        setXCorrectionMode('none');
        setSiRefMeasured(520.7);
        setIsBaselineSubtracted(true);

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
                toast.success("Parameters persisted to HDF5 metadata!");
            } else {
                toast.error(d.message || "Failed to save config");
            }
        } catch (e) {
            toast.error("Error communicating with scientific backend");
        }
    };

    // Silicon Reference calibration offset
    const applySiRef = () => {
        const offset = 520.7 - siRefMeasured;
        setXShift(offset);
        toast.success(`X-axis offset corrected: ${offset >= 0 ? '+' : ''}${offset.toFixed(2)} cm⁻¹`);
    };

    const applyCropRange = () => {
        if (cropMin !== '' && cropMax !== '') {
            setAppliedCrop([Number(cropMin), Number(cropMax)]);
            toast.success(`Active spectral range cropped: [${cropMin}, ${cropMax}]`);
        }
    };

    const resetCropRange = () => {
        setAppliedCrop(null);
        if (rawSpectrum) {
            setCropMin(Math.round(Math.min(...rawSpectrum.x)));
            setCropMax(Math.round(Math.max(...rawSpectrum.x)));
        }
        toast.info("Spectral range reset to default bounds");
    };

    // Plotly interactive seeding (Double click to seed)
    const handleChartClick = (event: any) => {
        if (!event || !event.points || event.points.length === 0) return;
        const pt = event.points[0];
        const xPos = pt.x;
        const yVal = pt.y;

        const newPeak: FittingPeakConfig = {
            id: `fit_peak_${Date.now()}`,
            name: `${shapeSelection}_${peaks.length + 1}`,
            model: shapeSelection,
            center: Math.round(xPos * 10) / 10,
            center_min: Math.round((xPos - 30) * 10) / 10,
            center_max: Math.round((xPos + 30) * 10) / 10,
            fwhm_init: 20,
            amplitude: Math.round(yVal * 10) / 10,
            active: true,
            use_limits: true,
            fixedParams: {},
            minParams: {},
            maxParams: {},
            exprParams: {}
        };
        setPeaks(prev => [...prev, newPeak]);
        toast.success(`Seeded ${shapeSelection} at ${newPeak.center.toFixed(1)} cm⁻¹`);
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
                // Silent preview catching
            }
        }, 300); // Debounced

        return () => clearTimeout(timer);
    }, [h5Path, vaultRoot, baselineMethod, baselineParams, rawSpectrum, fitData, xShift, appliedCrop]);

    // Auto-detect peaks on baseline-subtracted spectrum
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
                toast.success(`Seeded ${d.peaks.length} peaks based on scipy prominence!`);
            } else {
                toast.error('Peak auto-detection failed');
            }
        } catch { 
            toast.error('Failed to communicate with science engine'); 
        } finally {
            setStatus('idle');
        }
    };

    // Run LMfit Fitting
    const handleFitSingle = async () => {
        if (peaks.filter(p => p.active).length === 0) {
            toast.warning("Define at least one active peak to adjust.");
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
                toast.success("Single spectrum fitting converged successfully!");
            } else {
                setStatus('error');
                toast.error(d.message || "Fitting failed to converge.");
            }
        } catch (e) {
            setStatus('error');
            toast.error("Failed to connect to science engine");
        }
    };

    // Batch Apply
    const handleApplyMap = async () => {
        if (peaks.filter(p => p.active).length === 0) {
            toast.warning("Define active peaks templates before running batch fit.");
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
                toast.success("Batch map processing finished successfully!");
            } else {
                setStatus('error');
                toast.error(d.message || "Batch fit failed");
            }
        } catch (e) {
            setStatus('error');
            toast.error("Failed to complete parallel map fitting");
        }
    };

    // Clipboard and layout templates
    const copyBaselineConfig = () => {
        const data = { baselineMethod, baselineParams };
        navigator.clipboard.writeText(JSON.stringify(data));
        toast.success("Baseline configuration copied to clipboard");
    };

    const pasteBaselineConfig = async () => {
        try {
            const text = await navigator.clipboard.readText();
            const data = JSON.parse(text);
            if (data && data.baselineMethod) {
                setBaselineMethod(data.baselineMethod);
                if (data.baselineParams) setBaselineParams(data.baselineParams);
                toast.success("Baseline configuration loaded from clipboard");
            } else {
                toast.error("Invalid baseline clipboard format");
            }
        } catch {
            toast.error("Could not read clipboard contents");
        }
    };

    const copyPeaksTemplate = () => {
        if (peaks.length === 0) {
            toast.warning("No peak configuration to copy.");
            return;
        }
        setPeaksClipboard(peaks);
        toast.success(`${peaks.length} peak templates copied to memory buffer`);
    };

    const pastePeaksTemplate = () => {
        if (!peaksClipboard || peaksClipboard.length === 0) {
            toast.warning("Peak template memory buffer is empty.");
            return;
        }
        const mapped = peaksClipboard.map((p, idx) => ({
            ...p,
            id: `fit_peak_${Date.now()}_${idx}`,
            name: `Peak_${peaks.length + idx + 1}`
        }));
        setPeaks(prev => [...prev, ...mapped]);
        toast.success(`Imported ${mapped.length} peaks from template buffer!`);
    };

    const clearAllPeaks = () => {
        setPeaks([]);
        setFitData(null);
        toast.info("Cleared all model peaks");
    };

    const copyModelConfig = () => {
        const data = { peaks, baselineMethod, baselineParams, xShift, cropRange: appliedCrop };
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        toast.success("Full SPECTROview model JSON copied to clipboard");
    };

    const pasteModelConfig = async () => {
        try {
            const text = await navigator.clipboard.readText();
            const data = JSON.parse(text);
            if (data && Array.isArray(data.peaks)) {
                setPeaks(data.peaks);
                if (data.baselineMethod) setBaselineMethod(data.baselineMethod);
                if (data.baselineParams) setBaselineParams(data.baselineParams);
                if (typeof data.xShift === 'number') setXShift(data.xShift);
                if (Array.isArray(data.cropRange)) {
                    setAppliedCrop(data.cropRange as [number, number]);
                    setCropMin(data.cropRange[0]);
                    setCropMax(data.cropRange[1]);
                }
                setFitData(null);
                toast.success("Full SPECTROview model pasted successfully!");
            } else {
                toast.error("Clipboard doesn't contain a valid SPECTROview model JSON.");
            }
        } catch {
            toast.error("Failed to parse clipboard contents.");
        }
    };

    // Build Plotly Data
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

        // 1. Plot raw spectrum
        if (!isBaselineSubtracted) {
            traces.push({
                x: renderX,
                y: renderY,
                mode: 'lines',
                name: 'Spectrum',
                line: { color: '#475569', width: 1.5, dash: 'dot' }
            });
            if (previewBaseline) {
                traces.push({
                    x: previewBaseline.baseline.map(p => p.x),
                    y: previewBaseline.baseline.map(p => p.y),
                    mode: 'lines',
                    name: 'Baseline (Preview)',
                    line: { color: '#f97316', width: 2 }
                });
            }
        } else {
            // Plot baseline-corrected
            if (previewBaseline) {
                traces.push({
                    x: previewBaseline.corrected.map(p => p.x),
                    y: previewBaseline.corrected.map(p => p.y),
                    mode: 'lines',
                    name: 'Corrected',
                    line: { color: '#10b981', width: 2 }
                });
            } else {
                traces.push({
                    x: renderX,
                    y: renderY,
                    mode: 'lines',
                    name: 'Spectrum',
                    line: { color: '#6366f1', width: 1.5 }
                });
            }
        }

        // 2. Plot seeds indicators
        peaks.forEach((pk, idx) => {
            if (!pk.active) return;
            const color = PEAK_COLORS[idx % PEAK_COLORS.length];
            traces.push({
                x: [pk.center, pk.center],
                y: [0, pk.amplitude],
                mode: 'lines+markers',
                name: `${pk.name} Seed`,
                line: { color, width: 1.5, dash: 'dash' },
                marker: { size: 5, symbol: 'diamond' }
            });
        });

        // 3. Plot fitted envelopes & components
        if (fitData && status !== 'fitting') {
            const fitX = fitData.original.map(p => p.x);

            traces.push({
                x: fitX,
                y: fitData.best_fit.map(p => p.y),
                mode: 'lines',
                name: 'Fitted Envelope',
                line: { color: '#ef4444', width: 2.5 }
            });

            if (showComponents) {
                Object.entries(fitData.components).forEach(([compName, compPts], idx) => {
                    const color = PEAK_COLORS[idx % PEAK_COLORS.length];
                    traces.push({
                        x: fitX,
                        y: compPts.map(p => p.y),
                        mode: 'lines',
                        fill: 'tozeroy',
                        fillcolor: `${color}13`,
                        name: compName.replace('_', ' '),
                        line: { color, width: 1.5, dash: 'solid' }
                    });
                });
            }

            if (showResiduals) {
                const maxVal = Math.max(...(isBaselineSubtracted && previewBaseline ? previewBaseline.corrected.map(p=>p.y) : renderY));
                traces.push({
                    x: fitX,
                    y: fitData.residuals.map(p => p.y - (0.12 * maxVal)),
                    mode: 'lines',
                    name: 'Residuals',
                    line: { color: '#10b981', width: 1 }
                });
            }
        }

        return traces;
    }, [rawSpectrum, isBaselineSubtracted, previewBaseline, peaks, fitData, status, showResiduals, showComponents, xShift, appliedCrop]);

    return (
        <div className="flex flex-col h-full w-full flex-1 bg-[#080d16] text-slate-100 font-sans overflow-hidden">
            {/* Workstation Top Bar Header */}
            <div className="bg-[#0b101d] border-b border-slate-800 p-4 shrink-0 flex items-center justify-between shadow-md select-none">
                <div className="flex items-center gap-3">
                    <Sliders size={16} className="text-indigo-400" />
                    <div>
                        <h3 className="text-xs font-black text-slate-100 uppercase tracking-widest leading-none">
                            SPECTROview Fitting Workstation
                        </h3>
                        <span className="text-[9px] text-slate-500 font-mono">
                            High-Fidelity Scientific Analysis Framework &mdash; PhD Nexus V3
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={copyModelConfig}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-300 text-[10px] font-bold transition-all shadow-sm"
                        title="Copy entire fit config model JSON"
                    >
                        <Copy size={11} /> Copy Model
                    </button>
                    <button
                        onClick={pasteModelConfig}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-300 text-[10px] font-bold transition-all shadow-sm"
                        title="Paste fit config model JSON"
                    >
                        <Clipboard size={11} /> Paste Model
                    </button>
                </div>
            </div>

            {/* Full-Width Spectrum Plot Area */}
            <div className="p-4 pb-0 bg-[#070b13] shrink-0 select-none">
                <div className="bg-[#0b101d] border border-slate-800/80 rounded-2xl p-4 min-h-[360px] relative shadow-xl">
                    {rawSpectrum ? (
                        <Plot
                            data={plotlyData}
                            layout={{
                                ...LAYOUT_BASE,
                                height: 310,
                                margin: { l: 50, r: 10, t: 10, b: 35 },
                            }}
                            onClick={handleChartClick}
                            config={{ 
                                displayModeBar: true, 
                                displaylogo: false, 
                                responsive: true,
                                modeBarButtonsToRemove: ['lasso2d', 'select2d']
                            }}
                            style={{ width: '100%' }}
                        />
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                            <Loader2 size={24} className="animate-spin text-indigo-500" />
                            Loading representative spectrum...
                        </div>
                    )}

                    {/* Interactive tips & visualization options overlays */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 px-1">
                        <span className="flex items-center gap-1">
                            💡 <span className="font-bold text-slate-400">Pro Tip:</span> Click on the graph to place a <b>{shapeSelection}</b> peak.
                        </span>

                        <div className="flex items-center gap-4 text-slate-400 font-semibold">
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input 
                                    type="checkbox" 
                                    checked={showComponents} 
                                    onChange={e => setShowComponents(e.target.checked)} 
                                    className="rounded bg-slate-900 border-slate-800 accent-indigo-500 w-3 h-3 cursor-pointer" 
                                />
                                Show Components
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input 
                                    type="checkbox" 
                                    checked={showResiduals} 
                                    onChange={e => setShowResiduals(e.target.checked)} 
                                    className="rounded bg-slate-900 border-slate-800 accent-indigo-500 w-3 h-3 cursor-pointer" 
                                />
                                Show Residuals
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Split Layout containing both control panel and parameters table side-by-side */}
            <div className="flex-1 flex overflow-hidden p-4 pt-2 gap-4">
                {/* Left control sidebar panel (VFitModelBuilder) */}
                <div className="w-[360px] rounded-2xl border border-slate-800 bg-[#060b13] p-4 flex flex-col gap-4 overflow-y-auto shrink-0 select-none">
                    
                    {/* X-AXIS CALIBRATION */}
                    <div className="bg-[#0e1525]/60 rounded-2xl border border-slate-800/80 p-4 flex flex-col gap-3 shadow-lg">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Compass size={13} /> X-axis Correction
                            </span>
                            <select
                                className="text-[9px] bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-bold text-slate-400 outline-none cursor-pointer"
                                value={xCorrectionMode}
                                onChange={e => setXCorrectionMode(e.target.value as 'none' | 'si_ref')}
                            >
                                <option value="none">Manual Shift</option>
                                <option value="si_ref">Silicon Ref</option>
                            </select>
                        </div>

                        {xCorrectionMode === 'si_ref' ? (
                            <div className="flex flex-col gap-2">
                                <p className="text-[9px] text-slate-400 leading-relaxed">
                                    Calibrate offsets via your measured Silicon reference peak (expected: 520.7 cm⁻¹).
                                </p>
                                <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
                                    <span className="text-[9px] text-slate-400 font-bold uppercase">Si Measured:</span>
                                    <div className="flex items-center gap-1">
                                        <input 
                                            type="number"
                                            step="any"
                                            value={siRefMeasured}
                                            onChange={e => setSiRefMeasured(parseFloat(e.target.value) || 0)}
                                            className="bg-transparent text-slate-200 text-[10px] font-mono text-center outline-none w-14"
                                        />
                                        <span className="text-[9px] text-slate-500 font-bold">cm⁻¹</span>
                                    </div>
                                </div>
                                {siRefMeasured !== 520.7 && (
                                    <div className="text-[9px] font-bold text-amber-400 font-mono text-center mt-0.5">
                                        Shift Calculated: {(520.7 - siRefMeasured) >= 0 ? '+' : ''}{(520.7 - siRefMeasured).toFixed(3)} cm⁻¹
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    <button
                                        onClick={applySiRef}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black py-1.5 rounded-xl transition-all shadow-md"
                                    >
                                        Correct
                                    </button>
                                    <button
                                        onClick={() => { setXShift(0); setSiRefMeasured(520.7); }}
                                        className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-black py-1.5 rounded-xl transition-all"
                                    >
                                        Undo
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <p className="text-[9px] text-slate-400 leading-relaxed">
                                    Enter a direct translation shift in wavenumber coordinate.
                                </p>
                                <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
                                    <span className="text-[9px] text-slate-400 font-bold uppercase">Manual Shift:</span>
                                    <div className="flex items-center gap-1">
                                        <input 
                                            type="number"
                                            step="any"
                                            value={xShift}
                                            onChange={e => setXShift(parseFloat(e.target.value) || 0)}
                                            className="bg-transparent text-slate-200 text-[10px] font-mono text-center outline-none w-14"
                                        />
                                        <span className="text-[9px] text-slate-500 font-bold">cm⁻¹</span>
                                    </div>
                                </div>
                                {xShift !== 0 && (
                                    <button
                                        onClick={() => setXShift(0)}
                                        className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-black py-1.5 rounded-xl transition-all mt-1"
                                    >
                                        Reset Shift
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* SPECTRAL RANGE WINDOW */}
                    <div className="bg-[#0e1525]/60 rounded-2xl border border-slate-800/80 p-4 flex flex-col gap-3 shadow-lg">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Scissors size={13} /> Spectral Range Window
                        </span>
                        <p className="text-[9px] text-slate-400 leading-relaxed">
                            Crop the calculation boundary window to target selected peaks (e.g. 1000 to 1800 cm⁻¹).
                        </p>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                placeholder="Min"
                                value={cropMin}
                                onChange={e => setCropMin(e.target.value !== '' ? Number(e.target.value) : '')}
                                className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-[10px] font-mono text-slate-300 text-center w-full focus:outline-none focus:border-indigo-500"
                            />
                            <span className="text-slate-600 text-xs">&mdash;</span>
                            <input
                                type="number"
                                placeholder="Max"
                                value={cropMax}
                                onChange={e => setCropMax(e.target.value !== '' ? Number(e.target.value) : '')}
                                className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-[10px] font-mono text-slate-300 text-center w-full focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                            <button
                                onClick={applyCropRange}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black py-1.5 rounded-xl transition-all shadow-md"
                            >
                                Crop Range
                            </button>
                            <button
                                onClick={resetCropRange}
                                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-black py-1.5 rounded-xl transition-all"
                            >
                                Reset Range
                            </button>
                        </div>
                    </div>

                    {/* DYNAMIC BASELINE CORRECTION */}
                    <div className="bg-[#0e1525]/60 rounded-2xl border border-slate-800/80 p-4 flex flex-col gap-3 shadow-lg">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Sliders size={13} /> Baseline Correction
                            </span>
                            <div className="flex gap-1.5">
                                <button
                                    onClick={copyBaselineConfig}
                                    className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                                    title="Copy baseline settings"
                                >
                                    <Copy size={9} />
                                </button>
                                <button
                                    onClick={pasteBaselineConfig}
                                    className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                                    title="Paste baseline settings"
                                >
                                    <Clipboard size={9} />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] text-slate-500 font-bold uppercase">Algorithm Mode</span>
                                <select
                                    value={baselineMethod}
                                    onChange={e => setBaselineMethod(e.target.value)}
                                    className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-slate-300 outline-none cursor-pointer w-full"
                                >
                                    {BASELINE_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>

                            {baselineMethod === 'poly' && (
                                <div className="flex flex-col gap-1 bg-[#0b0f19]/80 p-2.5 rounded-xl border border-slate-800">
                                    <span className="text-[9px] text-slate-400 font-bold uppercase flex justify-between">
                                        <span>Polynomial Order</span>
                                        <span className="text-indigo-400 font-mono">Order {baselineParams.order}</span>
                                    </span>
                                    <input
                                        type="range"
                                        min="1"
                                        max="8"
                                        value={baselineParams.order}
                                        onChange={e => setBaselineParams(prev => ({ ...prev, order: parseInt(e.target.value) }))}
                                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 my-1.5"
                                    />
                                </div>
                            )}

                            {['asls', 'airpls'].includes(baselineMethod) && (
                                <div className="flex flex-col gap-1 bg-[#0b0f19]/85 p-2.5 rounded-xl border border-slate-800">
                                    <span className="text-[9px] text-slate-400 font-bold uppercase flex justify-between">
                                        <span>log(λ) Smoothness</span>
                                        <span className="text-indigo-400 font-mono">10^{Math.log10(baselineParams.lam).toFixed(1)}</span>
                                    </span>
                                    <input
                                        type="range"
                                        min="3"
                                        max="9"
                                        step="0.1"
                                        value={Math.log10(baselineParams.lam) || 5}
                                        onChange={e => {
                                            const logVal = parseFloat(e.target.value);
                                            setBaselineParams(prev => ({ ...prev, lam: Math.pow(10, logVal) }));
                                        }}
                                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 my-1.5"
                                    />
                                    <div className="flex justify-between text-[7px] text-slate-500 font-bold uppercase font-sans mt-0.5">
                                        <span>10³ (Flexible)</span>
                                        <span>10⁶</span>
                                        <span>10⁹ (Flat)</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                                <div className="flex flex-col leading-none">
                                    <span className="text-[9px] text-slate-400 font-bold uppercase">Subtract Baseline</span>
                                    <span className="text-[7.5px] text-slate-500 font-semibold mt-1">
                                        {isBaselineSubtracted ? 'Spectrum is corrected' : 'Preview orange trace'}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setIsBaselineSubtracted(!isBaselineSubtracted)}
                                    className={cn(
                                        "w-7 h-4 rounded-full transition-all relative shrink-0",
                                        isBaselineSubtracted ? "bg-emerald-600" : "bg-slate-850"
                                    )}
                                >
                                    <div className={cn(
                                        "w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all shadow-sm",
                                        isBaselineSubtracted ? "left-3.5" : "left-0.5"
                                    )} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* PEAKS SHAPES AND AUTO SEEDING */}
                    <div className="bg-[#0e1525]/60 rounded-2xl border border-slate-800/80 p-4 flex flex-col gap-3 shadow-lg">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Plus size={13} className="text-pink-400" /> Peak Seeding Tools
                            </span>
                            <div className="flex gap-1.5">
                                <button
                                    onClick={copyPeaksTemplate}
                                    className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                                    title="Copy peaks template"
                                >
                                    <Copy size={9} />
                                </button>
                                <button
                                    onClick={pastePeaksTemplate}
                                    disabled={!peaksClipboard}
                                    className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-20"
                                    title="Paste peaks template"
                                >
                                    <Clipboard size={9} />
                                </button>
                                <button
                                    onClick={clearAllPeaks}
                                    className="p-1 rounded bg-slate-900 border border-slate-850 text-slate-500 hover:text-red-400 transition-colors"
                                    title="Clear all peaks"
                                >
                                    <Trash2 size={9} />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-1 bg-[#0b0f19]/80 p-2.5 rounded-xl border border-slate-800">
                                <span className="text-[9px] text-slate-400 font-bold uppercase flex justify-between">
                                    <span>Active Click Shape</span>
                                </span>
                                <p className="text-[8px] text-slate-500 leading-normal mb-1.5">
                                    Double-click on the graph to place a seed of this shape.
                                </p>
                                <select
                                    value={shapeSelection}
                                    onChange={e => setShapeSelection(e.target.value as FittingPeakConfig['model'])}
                                    className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 text-[10px] font-bold text-indigo-400 outline-none w-full"
                                >
                                    <option value="Lorentzian">Lorentzian Peak</option>
                                    <option value="Gaussian">Gaussian Peak</option>
                                    <option value="Voigt">Voigt Peak</option>
                                    <option value="PseudoVoigt">Pseudo-Voigt Peak</option>
                                    <option value="Fano">Fano Asymmetric Peak</option>
                                    <option value="DecaySingleExp">Decay Single Exp (TRPL)</option>
                                    <option value="DecayBiExp">Decay Bi Exp (TRPL)</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-2.5 bg-[#0b0f19]/80 p-3 rounded-xl border border-slate-800">
                                <div className="flex justify-between items-center text-[9px] uppercase font-bold text-slate-400">
                                    <span>Scipy Auto-Detect Prominence</span>
                                    <span className="text-indigo-400 font-mono">{autoDetectThreshold.toFixed(3)}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.005"
                                    max="0.30"
                                    step="0.005"
                                    value={autoDetectThreshold}
                                    onChange={e => setAutoDetectThreshold(parseFloat(e.target.value))}
                                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 my-1"
                                />
                                <button
                                    onClick={handleAutoDetect}
                                    disabled={status === 'fitting'}
                                    className="bg-indigo-650 hover:bg-indigo-700 disabled:opacity-40 text-white text-[10px] font-bold py-1.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                                >
                                    {status === 'fitting' ? (
                                        <>
                                            <Loader2 size={11} className="animate-spin" /> Scanning...
                                        </>
                                    ) : (
                                        <>
                                            <Wand2 size={11} /> Auto-Detect Seeds
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right workspace: dynamic parameters table and fitting controls */}
                <div className="flex-1 flex flex-col overflow-hidden bg-transparent gap-4 select-none">
                    {/* Dynamic VPeakTable Grid */}
                    <div className="flex-1 min-h-[250px] overflow-hidden flex flex-col">
                        <FittingPeakTable 
                            peaks={peaks} 
                            onChange={setPeaks} 
                            disabled={status === 'fitting'} 
                            showLimits={showLimits}
                            showExpr={showExpr}
                        />
                    </div>

                    {/* Bottom control panel: Fitting, Persistence, Options */}
                    <div className="bg-[#0b101d] border border-slate-800/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl select-none shrink-0">
                        {/* Dynamic Grid Column Toggles */}
                        <div className="flex items-center gap-3">
                            <span className="text-[9px] uppercase font-bold text-slate-500">Grid Options:</span>
                            <button
                                onClick={() => setShowLimits(!showLimits)}
                                className={cn(
                                    "px-3 py-1.5 rounded-xl border text-[9px] font-black transition-all uppercase tracking-wider",
                                    showLimits 
                                        ? "bg-emerald-950 border-emerald-800 text-emerald-400" 
                                        : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700"
                                )}
                            >
                                Constraints Limits
                            </button>
                            <button
                                onClick={() => setShowExpr(!showExpr)}
                                className={cn(
                                    "px-3 py-1.5 rounded-xl border text-[9px] font-black transition-all uppercase tracking-wider",
                                    showExpr 
                                        ? "bg-purple-950 border-purple-800 text-purple-400" 
                                        : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700"
                                )}
                            >
                                LMfit Expressions
                            </button>
                        </div>

                        {/* Fitting Optimizer actions */}
                        <div className="flex items-center gap-3">
                            {/* SNR Threshold input */}
                            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-[10px]">
                                <span className="text-slate-500 font-bold uppercase">Batch SNR:</span>
                                <input
                                    type="number"
                                    step="any"
                                    value={thresholdSNR}
                                    onChange={e => setThresholdSNR(parseFloat(e.target.value) || 0)}
                                    className="bg-transparent text-slate-300 text-[10px] font-mono text-center outline-none w-8 font-bold"
                                />
                            </div>

                            <button
                                onClick={handleFitSingle}
                                disabled={status === 'fitting'}
                                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-[10px] font-black py-2 px-4 rounded-xl transition-all shadow-md flex items-center gap-1.5 shadow-indigo-900/20"
                            >
                                {status === 'fitting' ? (
                                    <>
                                        <Loader2 size={12} className="animate-spin" /> Adjusting...
                                    </>
                                ) : (
                                    <>
                                        <Wand2 size={12} /> Fit Representative
                                    </>
                                )}
                            </button>

                            <button
                                onClick={handleApplyMap}
                                disabled={status === 'applying'}
                                className="bg-pink-600 hover:bg-pink-700 disabled:opacity-40 text-white text-[10px] font-black py-2 px-4 rounded-xl transition-all shadow-md flex items-center gap-1.5 shadow-pink-900/20"
                            >
                                {status === 'applying' ? (
                                    <>
                                        <Loader2 size={12} className="animate-spin" /> Batch Processing...
                                    </>
                                ) : (
                                    <>
                                        <Play size={12} /> Fit Sample Map
                                    </>
                                )}
                            </button>

                            <div className="w-[1px] h-6 bg-slate-800 mx-1" />

                            <button
                                onClick={handleSaveConfigFile}
                                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-indigo-400 text-[10px] font-black py-2 px-3 rounded-xl transition-all flex items-center gap-1.5"
                                title="Persist fitted params to HDF5 config attribute"
                            >
                                <Save size={12} /> Save to H5
                            </button>
                        </div>
                    </div>

                    {/* Batch Map results panel sliding from bottom */}
                    {mapResult && (
                        <div className="h-[400px] border-t border-slate-800 bg-[#070b13] z-40 relative flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300 shrink-0">
                            <button 
                                onClick={() => setMapResult(null)}
                                className="absolute top-2 right-4 text-[10px] font-bold text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 py-1 px-3 rounded-xl z-50 border border-slate-850 transition-colors shadow-lg"
                            >
                                Close Map analysis
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

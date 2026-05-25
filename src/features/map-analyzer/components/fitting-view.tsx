'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { 
    Wand2, Play, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, 
    Loader2, Save, FolderOpen, RefreshCw, Scissors, Compass, Sliders, Activity
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
    const [peaks, setPeaks] = useState<FittingPeakConfig[]>([]);
    const [status, setStatus] = useState<FitStatus>('idle');
    const [fitData, setFitData] = useState<FitData | null>(null);

    // Baseline settings
    const [baselineMethod, setBaselineMethod] = useState('asls');
    const [baselineParams, setBaselineParams] = useState<Record<string, any>>({ lam: 1e5, p: 0.01, order: 2 });
    
    // X correction & Crop options
    const [xShift, setXShift] = useState(0.0);
    const [siRefMeasured, setSiRefMeasured] = useState(520.7);
    const [cropMin, setCropMin] = useState<number | ''>('');
    const [cropMax, setCropMax] = useState<number | ''>('');
    const [appliedCrop, setAppliedCrop] = useState<[number, number] | null>(null);

    const [mapResult, setMapResult] = useState<FittingMapFitResult | null>(null);
    const [rawSpectrum, setRawSpectrum] = useState<{ x: number[]; y: number[] } | null>(null);
    
    // Advanced options
    const [thresholdSNR, setThresholdSNR] = useState(3.0);
    const [showBaseline, setShowBaseline] = useState(true);
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

    // Interactive click to add peak
    const handleChartClick = (event: any) => {
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

    // Run Single Fit
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
                    baseline_method: baselineMethod,
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

    // Batch Apply
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
                    baseline_method: baselineMethod,
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

    // Build Plotly Data
    const plotlyData = useMemo(() => {
        if (!rawSpectrum) return [];
        const traces: any[] = [];

        // Apply shift/crop locally for rendering baseline if fit not done
        let renderX = rawSpectrum.x.map(xi => xi + xShift);
        let renderY = rawSpectrum.y;
        if (appliedCrop) {
            const [xmin, xmax] = appliedCrop;
            const mask = renderX.map(xi => xi >= xmin && xi <= xmax);
            renderX = renderX.filter((_, i) => mask[i]);
            renderY = renderY.filter((_, i) => mask[i]);
        }

        // Original spectrum
        traces.push({
            x: renderX,
            y: renderY,
            mode: 'lines',
            name: 'Original',
            line: { color: '#64748b', width: 1.5, dash: 'dot' }
        });

        if (fitData && status !== 'fitting') {
            const fitX = fitData.original.map(p => p.x);
            
            // Baseline
            if (showBaseline) {
                traces.push({
                    x: fitX,
                    y: fitData.baseline.map(p => p.y),
                    mode: 'lines',
                    name: 'Baseline',
                    line: { color: '#f97316', width: 1.5 }
                });
            }

            // Corrected spectrum
            traces.push({
                x: fitX,
                y: fitData.corrected.map(p => p.y),
                mode: 'lines',
                name: 'Baseline Corrected',
                line: { color: '#a855f7', width: 2 }
            });

            // Peak components
            Object.entries(fitData.components).forEach(([name, compY], idx) => {
                const color = PEAK_COLORS[idx % PEAK_COLORS.length];
                traces.push({
                    x: fitX,
                    y: compY.map(p => p.y),
                    mode: 'lines',
                    fill: 'tozeroy',
                    fillcolor: `${color}1A`,
                    name: name.replace('_', ' '),
                    line: { color, width: 1.5 }
                });
            });

            // Cumulative Fit
            traces.push({
                x: fitX,
                y: fitData.best_fit.map(p => p.y),
                mode: 'lines',
                name: 'Best Fit',
                line: { color: '#ef4444', width: 2 }
            });

            // Residuals
            if (showResiduals) {
                traces.push({
                    x: fitX,
                    y: fitData.residuals.map(p => p.y - (0.1 * Math.max(...renderY))),
                    mode: 'lines',
                    name: 'Residuals (offset)',
                    line: { color: '#10b981', width: 1 }
                });
            }
        }

        return traces;
    }, [rawSpectrum, fitData, status, showBaseline, showResiduals, xShift, appliedCrop]);

    return (
        <div className="flex h-full bg-[#0f172a] text-slate-100 font-sans overflow-hidden">
            {/* Left sidebar - Controls */}
            <div className="w-[340px] border-r border-slate-800 bg-[#0b0f19] p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
                {/* Silicon Calibration */}
                <div className="bg-[#131b2e] rounded-xl p-3 border border-slate-800">
                    <h4 className="text-xs font-bold text-slate-300 mb-2.5 flex items-center gap-1.5 uppercase tracking-wide">
                        <Compass size={13} className="text-indigo-500" /> X-Axis Calibration (Si)
                    </h4>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-slate-400 w-24">Si Measured:</span>
                            <input 
                                type="number"
                                step="any"
                                value={siRefMeasured}
                                onChange={e => setSiRefMeasured(parseFloat(e.target.value) || 0)}
                                className="bg-[#1e293b] text-slate-100 text-xs px-2 py-1 rounded border border-slate-700 outline-none w-24 font-mono"
                            />
                            <span className="text-[10px] text-slate-500">cm⁻¹</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-slate-400 w-24">Shift Offset:</span>
                            <input 
                                type="number"
                                step="any"
                                value={xShift}
                                onChange={e => setXShift(parseFloat(e.target.value) || 0)}
                                className="bg-[#1e293b] text-slate-100 text-xs px-2 py-1 rounded border border-slate-700 outline-none w-24 font-mono"
                            />
                            <span className="text-[10px] text-slate-500">cm⁻¹</span>
                        </div>
                        <button
                            onClick={applySiRef}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold py-1 px-3 rounded-lg transition-colors mt-1 shadow-sm"
                        >
                            Correct X-Axis
                        </button>
                    </div>
                </div>

                {/* Cropping Range */}
                <div className="bg-[#131b2e] rounded-xl p-3 border border-slate-800">
                    <h4 className="text-xs font-bold text-slate-300 mb-2.5 flex items-center gap-1.5 uppercase tracking-wide">
                        <Scissors size={13} className="text-pink-500" /> Spectral Range (Crop)
                    </h4>
                    <div className="flex items-center gap-2 mb-2">
                        <input
                            type="number"
                            placeholder="Min"
                            value={cropMin}
                            onChange={e => setCropMin(e.target.value !== '' ? Number(e.target.value) : '')}
                            className="bg-[#1e293b] text-slate-100 text-xs px-2 py-1 rounded border border-slate-700 outline-none w-full font-mono text-center"
                        />
                        <span className="text-slate-500 text-xs">&mdash;</span>
                        <input
                            type="number"
                            placeholder="Max"
                            value={cropMax}
                            onChange={e => setCropMax(e.target.value !== '' ? Number(e.target.value) : '')}
                            className="bg-[#1e293b] text-slate-100 text-xs px-2 py-1 rounded border border-slate-700 outline-none w-full font-mono text-center"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={applyCropRange}
                            className="bg-[#1e293b] hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold py-1 rounded-lg transition-all"
                        >
                            Apply Crop
                        </button>
                        <button
                            onClick={resetCropRange}
                            className="bg-[#1e293b] hover:bg-slate-800 border border-slate-700 text-slate-500 text-[10px] font-bold py-1 rounded-lg transition-all"
                        >
                            Reset Bounds
                        </button>
                    </div>
                </div>

                {/* Baseline Estimate */}
                <div className="bg-[#131b2e] rounded-xl p-3 border border-slate-800">
                    <h4 className="text-xs font-bold text-slate-300 mb-2.5 flex items-center gap-1.5 uppercase tracking-wide">
                        <Sliders size={13} className="text-emerald-500" /> Baseline Settings
                    </h4>
                    <div className="flex flex-col gap-2.5">
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] text-slate-400 font-bold uppercase">Method</span>
                            <select
                                value={baselineMethod}
                                onChange={e => setBaselineMethod(e.target.value)}
                                className="bg-[#1e293b] text-slate-100 text-xs px-2 py-1 rounded border border-slate-700 outline-none cursor-pointer w-full font-semibold"
                            >
                                {BASELINE_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        {baselineMethod === 'poly' && (
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] text-slate-400 font-bold uppercase">Polynomial Order ({baselineParams.order})</span>
                                <input
                                    type="range"
                                    min="1"
                                    max="8"
                                    value={baselineParams.order}
                                    onChange={e => setBaselineParams(prev => ({ ...prev, order: parseInt(e.target.value) }))}
                                    className="w-full h-1.5 bg-[#1e293b] rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                            </div>
                        )}

                        {['asls', 'airpls'].includes(baselineMethod) && (
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] text-slate-400 font-bold uppercase">Smoothness log(λ): {Math.log10(baselineParams.lam).toFixed(1)}</span>
                                <input
                                    type="range"
                                    min="3"
                                    max="9"
                                    step="0.5"
                                    value={Math.log10(baselineParams.lam)}
                                    onChange={e => setBaselineParams(prev => ({ ...prev, lam: Math.pow(10, parseFloat(e.target.value)) }))}
                                    className="w-full h-1.5 bg-[#1e293b] rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Advanced Map options */}
                <div className="bg-[#131b2e] rounded-xl p-3 border border-slate-800">
                    <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                        <Activity size={13} className="text-amber-500" /> Batch Map Options
                    </h4>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">SNR Threshold:</span>
                            <input
                                type="number"
                                step="any"
                                value={thresholdSNR}
                                onChange={e => setThresholdSNR(parseFloat(e.target.value) || 0)}
                                className="bg-[#1e293b] text-slate-100 text-xs px-2 py-0.5 rounded border border-slate-700 outline-none w-16 text-center font-mono"
                            />
                        </div>
                    </div>
                </div>

                {/* General Actions */}
                <div className="mt-auto flex flex-col gap-2 pt-4 border-t border-slate-800">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={handleFitSingle}
                            disabled={status === 'fitting'}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl transition-all text-xs flex items-center justify-center gap-1.5 shadow-md disabled:opacity-40"
                        >
                            {status === 'fitting' ? (
                                <>
                                    <Loader2 size={12} className="animate-spin" /> Fitting...
                                </>
                            ) : (
                                <>
                                    <Wand2 size={12} /> Fit Single
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleApplyMap}
                            disabled={status === 'applying'}
                            className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 rounded-xl transition-all text-xs flex items-center justify-center gap-1.5 shadow-md disabled:opacity-40"
                        >
                            {status === 'applying' ? (
                                <>
                                    <Loader2 size={12} className="animate-spin" /> Batching...
                                </>
                            ) : (
                                <>
                                    <Play size={12} /> Batch Fit Map
                                </>
                            )}
                        </button>
                    </div>

                    <button
                        onClick={handleSaveConfigFile}
                        className="border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold py-1.5 rounded-xl transition-all text-xs flex items-center justify-center gap-1.5"
                    >
                        <Save size={12} /> Save to HDF5 file
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
                        <div className="flex items-center gap-4 text-[10px] text-slate-400 mt-2 px-1">
                            <span>💡 Tip: Click on the plot to manually add peak center seeds.</span>
                            <div className="flex gap-3 ml-auto">
                                <label className="flex items-center gap-1 cursor-pointer">
                                    <input type="checkbox" checked={showBaseline} onChange={e=>setShowBaseline(e.target.checked)} className="rounded bg-[#1e293b] border-slate-700" />
                                    Show Baseline
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer">
                                    <input type="checkbox" checked={showResiduals} onChange={e=>setShowResiduals(e.target.checked)} className="rounded bg-[#1e293b] border-slate-700" />
                                    Show Residuals
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Stats & parameters panel */}
                    {fitData && (
                        <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <h4 className="text-xs font-bold text-slate-300">Fit Statistics:</h4>
                                <StatItem label="R²" value={fitData.metrics.r_squared.toFixed(5)} highlight={fitData.metrics.r_squared > 0.99} />
                                <StatItem label="reduced χ²" value={fitData.metrics.chi2_reduced.toFixed(2)} />
                                <StatItem label="AIC" value={fitData.metrics.aic.toFixed(1)} />
                            </div>
                        </div>
                    )}

                    {/* Parameters Table */}
                    <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-4 flex-1 min-h-[300px]">
                        <FittingPeakTable peaks={peaks} onChange={setPeaks} disabled={status === 'fitting'} />
                    </div>
                </div>

                {/* Batch Map results panel sliding from bottom */}
                {mapResult && (
                    <div className="h-[400px] border-t border-slate-200 bg-white z-40 relative flex flex-col shadow-2xl animate-in slide-in-from-bottom">
                        <button 
                            onClick={() => setMapResult(null)}
                            className="absolute top-2 right-4 text-xs font-bold text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 py-1 px-3 rounded-lg z-50 transition-colors"
                        >
                            Close maps
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
    );
}

function StatItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className="flex items-center gap-1.5 bg-[#131b2e] px-2.5 py-1 rounded-lg border border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase">{label}:</span>
            <span className={cn("text-xs font-mono font-bold", highlight ? "text-emerald-400" : "text-indigo-400")}>{value}</span>
        </div>
    );
}

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchMapHeatmap } from '@/lib/desktop';
import { Settings, Maximize, ZoomIn, ZoomOut, Save, RefreshCw, AlertCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface HeatmapProps {
    vaultRoot: string;
    h5Path: string;
    mapWidth: number;
    mapHeight: number;
    stepSize?: number;
    nSpectra: number;
    wavenumberRange?: [number, number];
    selectedPixelIndex: number;
    onPixelSelect: (idx: number) => void;
    onToggleGraphene?: () => void;
    onUpdateDimensions?: (w: number, h: number, step?: number) => void;
    isDismissed?: boolean;
    onDismiss?: () => void;
}

export function HeatmapCanvas({
    vaultRoot, h5Path, mapWidth, mapHeight, stepSize = 1.0, nSpectra, wavenumberRange, selectedPixelIndex, onPixelSelect, onToggleGraphene, onUpdateDimensions, isDismissed, onDismiss
}: HeatmapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const [heatmapData, setHeatmapData] = useState<number[]>([]);
    const [minMax, setMinMax] = useState({ min: 0, max: 1 });
    const [userMin, setUserMin] = useState<number | null>(null);
    const [userMax, setUserMax] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    // Dimension Overrides
    const [wOverride, setWOverride] = useState(mapWidth);
    const [hOverride, setHOverride] = useState(mapHeight);
    const [stepOverride, setStepOverride] = useState(stepSize);
    const [actualN, setActualN] = useState(nSpectra);
    const [showSettings, setShowSettings] = useState(false);
    const [bannerDismissed, setBannerDismissed] = useState(false);

    // Sync local state when props change
    useEffect(() => {
        setWOverride(mapWidth);
        setHOverride(mapHeight);
        setStepOverride(stepSize);
    }, [mapWidth, mapHeight, stepSize]);

    // Auto-Correct logic
    const isMismatch = mapWidth !== 0 && (wOverride * hOverride) !== actualN && actualN > 0;
    const isMissingMetadata = mapWidth === 0 && mapHeight === 0;
    
    const safeN = actualN > 0 ? actualN : 1;
    const w = Math.max(1, wOverride > 0 && (!isMismatch || isMissingMetadata) ? wOverride : Math.ceil(Math.sqrt(safeN)));
    const h = Math.max(1, hOverride > 0 && (!isMismatch || isMissingMetadata) ? hOverride : Math.ceil(safeN / w));

    const isAutoDetectedPerfect = isMissingMetadata && (w * h === actualN);
    const showBanner = (isMismatch || (isMissingMetadata && !isAutoDetectedPerfect)) && !loading && actualN > 0 && !bannerDismissed && !isDismissed;

    const loadHeatmap = useCallback(async () => {
        if (!vaultRoot || !h5Path) return;
        setLoading(true);
        try {
            const res = await fetchMapHeatmap({
                vault_root: vaultRoot,
                h5_relative_path: h5Path,
                start_wavenumber: wavenumberRange?.[0],
                end_wavenumber: wavenumberRange?.[1]
            });
            if (res.success) {
                setHeatmapData(res.heatmap);
                if (res.n_spectra) {
                    setActualN(res.n_spectra);
                }
                
                // Calculate robust visual range (2nd to 98th percentile) 
                // to ignore cosmic rays / dead pixels automatically on load
                const valid = res.heatmap.filter((v: number) => typeof v === 'number' && !isNaN(v));
                valid.sort((a: number, b: number) => a - b);
                
                let robustMin = res.min;
                let robustMax = res.max;
                if (valid.length > 0) {
                    robustMin = valid[Math.floor(valid.length * 0.02)];
                    robustMax = valid[Math.floor(valid.length * 0.98)];
                }
                
                // Set the default slider bounds to the robust statistical range
                setMinMax({ min: robustMin, max: robustMax });
                setUserMin(null);
                setUserMax(null);
            }
        } catch (err: any) {
            toast.error(err.message || 'Failed to load heatmap');
        } finally {
            setLoading(false);
        }
    }, [vaultRoot, h5Path, wavenumberRange]);

    useEffect(() => {
        loadHeatmap();
    }, [loadHeatmap]);

    // Redraw Canvas when data or dimensions change
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || heatmapData.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set logical dimensions
        canvas.width = w;
        canvas.height = h;

        const imgData = ctx.createImageData(w, h);
        
        let cMin = userMin !== null ? userMin : minMax.min;
        let cMax = userMax !== null ? userMax : minMax.max;
        if (cMax <= cMin) cMax = cMin + 1; // Prevent division by zero
        
        const range = cMax - cMin;

        for (let i = 0; i < actualN; i++) {
            const val = heatmapData[i];
            if (val === undefined) continue;

            // Normalize 0-1 based on user bounds
            const norm = Math.max(0, Math.min(1, (val - cMin) / range));
            
            // Map to RGB (simple Viridis mock or Jet mock)
            // Hardcoded fast Viridis approximation
            const r = Math.max(0, Math.min(255, 255 * (3.11 * norm - 1.4)));
            const g = Math.max(0, Math.min(255, 255 * (2.8 * norm - 0.7)));
            const b = Math.max(0, Math.min(255, 255 * (1.5 - 2.8 * Math.abs(norm - 0.3))));

            const idx = i * 4;
            imgData.data[idx] = r;
            imgData.data[idx + 1] = g;
            imgData.data[idx + 2] = b;
            imgData.data[idx + 3] = 255;
        }

        ctx.putImageData(imgData, 0, 0);

        // Draw selection highlight if valid
        if (selectedPixelIndex >= 0 && selectedPixelIndex < actualN) {
            const px = selectedPixelIndex % w;
            const py = Math.floor(selectedPixelIndex / w);
            ctx.strokeStyle = '#00FFFF';
            ctx.lineWidth = Math.max(1, w / 100); 
            ctx.strokeRect(px, py, 1, 1);
        }

    }, [heatmapData, minMax, userMin, userMax, w, h, actualN, selectedPixelIndex]);

    // Handle canvas click to select pixel
    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);

        if (x >= 0 && x < w && y >= 0 && y < h) {
            const index = y * w + x;
            if (index < actualN) {
                onPixelSelect(index);
            }
        }
    };

    const handleSaveDimensions = () => {
        if (onUpdateDimensions) {
            onUpdateDimensions(wOverride, hOverride, stepOverride);
        }
        setShowSettings(false);
        setBannerDismissed(true); // Hide banner once synced
        toast.success(`Grid updated: ${wOverride}x${hOverride} @ ${stepOverride}µm/px`);
    };

    const handleGrapheneLaunch = () => {
        if (onToggleGraphene) {
            onToggleGraphene();
        }
    };

    return (
        <div className="flex-1 w-full h-full flex flex-col relative bg-slate-100/30" ref={containerRef}>
            {/* Toolbar (Light) */}
            <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between pointer-events-none z-20">
                <div className="flex items-center gap-2 pointer-events-auto bg-white/90 backdrop-blur-md pb-1.5 px-3 rounded-2xl border border-slate-100 shadow-xl shadow-slate-200/20">
                    <span className="text-sm font-bold text-slate-900 tracking-tight">
                        Map Viewer
                    </span>
                    <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase",
                        isMismatch ? "bg-amber-100 text-amber-700 animate-pulse" : "text-slate-400"
                    )}>
                        ({w}×{h} @ {stepSize}µm)
                    </span>
                    {wavenumberRange && (
                        <div className="flex items-center gap-1.5 ml-2">
                             <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                             <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100 font-bold">
                                {wavenumberRange[0].toFixed(0)} - {wavenumberRange[1].toFixed(0)} cm⁻¹
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 pointer-events-auto">
                    <button 
                        onClick={handleGrapheneLaunch}
                        className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 rounded-2xl flex items-center gap-2 transition-all text-xs font-bold shadow-sm"
                        title="Popup Matplotlib graphene bands script"
                    >
                         <div className="w-2 h-2 rounded-full bg-sky-500" />
                        Graphene Bands
                    </button>
                    <button onClick={() => setShowSettings(!showSettings)} className="p-2.5 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-indigo-600 transition-all shadow-sm hover:border-indigo-100">
                        <Settings size={18} />
                    </button>
                </div>
            </div>

            {/* Mismatch/Missing Metadata Warning */}
            {showBanner && (
                <div className={cn(
                    "absolute top-16 left-4 right-4 flex items-center justify-between border p-3 rounded-2xl z-20 shadow-lg animate-in slide-in-from-top-2 pointer-events-auto",
                    isMissingMetadata ? "bg-indigo-50 border-indigo-200" : "bg-amber-50 border-amber-200"
                )}>
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center",
                            isMissingMetadata ? "bg-indigo-100 text-indigo-600" : "bg-amber-100 text-amber-600"
                        )}>
                            <AlertCircle size={18} />
                        </div>
                        <div>
                            <div className={cn(
                                "text-xs font-bold leading-none mb-1",
                                isMissingMetadata ? "text-indigo-900" : "text-amber-900"
                            )}>
                                {isMissingMetadata ? "Auto-Detecting Grid Layout" : "Dimension Mismatch Detected"}
                            </div>
                            <p className={cn(
                                "text-[10px] font-medium",
                                isMissingMetadata ? "text-indigo-700" : "text-amber-700"
                            )}>
                                {isMissingMetadata 
                                    ? `Found ${actualN} spectra. Using ${w}×${h} square grid.` 
                                    : `File contains ${actualN} spectra, but metadata says ${mapWidth}×${mapHeight}. Switched to ${w}×${h} square grid.`
                                }
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setShowSettings(true)}
                            className={cn(
                                "px-3 py-1.5 bg-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border pointer-events-auto",
                                isMissingMetadata ? "hover:bg-indigo-100 text-indigo-700 border-indigo-200" : "hover:bg-amber-100 text-amber-700 border-amber-200"
                            )}
                        >
                            Adjust Manually
                        </button>
                        <button 
                            onClick={() => {
                                setBannerDismissed(true);
                                if (onDismiss) onDismiss();
                            }}
                            className={cn(
                                "p-1.5 rounded-lg transition-all pointer-events-auto",
                                isMissingMetadata ? "text-indigo-400 hover:bg-indigo-100" : "text-amber-400 hover:bg-amber-100"
                            )}
                            title="Dismiss Warning"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Config Overlay (Light) */}
            {showSettings && (
                <div className="absolute top-16 right-4 bg-white border border-slate-200 p-6 rounded-[24px] shadow-2xl z-30 w-72 pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-200">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-slate-900 flex items-center gap-2">
                            <Maximize size={16} className="text-indigo-500" />
                            Grid Parameters
                        </h4>
                        <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Grid Width (spectra)</label>
                            <input 
                                type="number" 
                                value={wOverride} 
                                onChange={(e) => setWOverride(parseInt(e.target.value) || 0)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-sm font-bold text-slate-900 transition-all font-mono"
                                placeholder="Auto-detect"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Grid Height (spectra)</label>
                            <input 
                                type="number" 
                                value={hOverride} 
                                onChange={(e) => setHOverride(parseInt(e.target.value) || 0)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-sm font-bold text-slate-900 transition-all font-mono"
                                placeholder="Auto-detect"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Step Size (µm / spectrum)</label>
                            <input 
                                type="number" 
                                step="0.1"
                                value={stepOverride} 
                                onChange={(e) => setStepOverride(parseFloat(e.target.value) || 1.0)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-sm font-bold text-slate-900 transition-all font-mono"
                            />
                        </div>
                        <div className="pt-2 flex justify-end">
                            <button onClick={handleSaveDimensions} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-lg shadow-indigo-100">
                                <Save size={16} /> Sync Layout
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Canvas Area (Keeping dark for data contrast, but with light container) */}
            <div className="flex-1 w-full h-full flex items-center justify-center p-12 relative overflow-hidden">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-sm z-30">
                        <div className="flex flex-col items-center gap-3">
                            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Rendering Heatmap</span>
                        </div>
                    </div>
                )}
                
                <div 
                    className="relative shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] bg-black"
                    style={{
                        width: w * 6,
                        height: h * 6,
                        maxWidth: '90%',
                        maxHeight: '90%',
                        aspectRatio: `${w} / ${h}`
                    }}
                >
                    <canvas 
                        ref={canvasRef} 
                        onClick={handleCanvasClick}
                        className="w-full h-full cursor-crosshair border border-slate-800 rounded-sm rendering-pixelated"
                    />
                </div>
            </div>

            {/* Range Slider (Premium Light) */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-white/90 backdrop-blur-md px-8 py-4 rounded-3xl border border-slate-100 shadow-2xl z-30">
                {(() => {
                    const absoluteMin = minMax.min;
                    const absoluteMax = minMax.max;
                    const cMin = userMin !== null ? userMin : absoluteMin;
                    const cMax = userMax !== null ? userMax : absoluteMax;
                    const rScale = absoluteMax - absoluteMin || 1;
                    const step = rScale > 50 ? 1 : (rScale > 5 ? 0.1 : 0.01);

                    const leftPct = Math.max(0, Math.min(100, ((cMin - absoluteMin) / rScale) * 100));
                    const rightPct = Math.max(0, Math.min(100, (1 - (cMax - absoluteMin) / rScale) * 100));

                    return (
                        <>
                            <div className="flex flex-col items-center">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">Min</span>
                                <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                                    {cMin.toFixed(step === 1 ? 0 : 1)}
                                </span>
                            </div>

                            <div className="relative w-72 h-4 flex items-center">
                                {/* Gradient Base */}
                                <div className="absolute w-full h-2 rounded-full bg-gradient-to-r from-blue-900 via-green-500 to-red-500 opacity-80" />
                                
                                {/* Overlay dimmers */}
                                <div className="absolute h-2 bg-slate-200/90 rounded-l-full ring-1 ring-slate-300" style={{ width: `${leftPct}%` }} />
                                <div className="absolute h-2 bg-slate-200/90 right-0 rounded-r-full ring-1 ring-slate-300" style={{ width: `${rightPct}%` }} />

                                {/* Thumbs */}
                                <input 
                                    type="range"
                                    min={absoluteMin} max={absoluteMax} step={step} value={cMin}
                                    onChange={(e) => {
                                        const v = parseFloat(e.target.value);
                                        if (v < cMax) setUserMin(v);
                                    }}
                                    className="absolute w-full appearance-none bg-transparent pointer-events-none 
                                    [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none 
                                    [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-white 
                                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-xl cursor-ew-resize 
                                    [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-600 transition-all active:[&::-webkit-slider-thumb]:scale-125"
                                />
                                <input 
                                    type="range"
                                    min={absoluteMin} max={absoluteMax} step={step} value={cMax}
                                    onChange={(e) => {
                                        const v = parseFloat(e.target.value);
                                        if (v > cMin) setUserMax(v);
                                    }}
                                    className="absolute w-full appearance-none bg-transparent pointer-events-none 
                                    [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none 
                                    [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-white 
                                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-xl cursor-ew-resize
                                    [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-600 transition-all active:[&::-webkit-slider-thumb]:scale-125"
                                />
                            </div>

                            <div className="flex flex-col items-center">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">Max</span>
                                <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                                    {cMax.toFixed(step === 1 ? 0 : 1)}
                                </span>
                            </div>

                            {(userMin !== null || userMax !== null) && (
                                <button 
                                    onClick={() => { setUserMin(null); setUserMax(null); }}
                                    className="absolute -top-3 -right-3 w-7 h-7 flex items-center justify-center bg-white text-rose-500 rounded-full border border-rose-100 shadow-xl cursor-pointer text-xs hover:bg-rose-50 transition-all font-bold"
                                    title="Reset To Default"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </>
                    );
                })()}
            </div>
        </div>
    );
}

// Add this to your global css later:
// .rendering-pixelated { image-rendering: pixelated; }
// .bg-dot-grid { background-image: radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px); background-size: 20px 20px; }

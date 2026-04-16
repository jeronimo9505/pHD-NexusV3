'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchGrapheneBands, fetchMapHeatmap } from '@/lib/desktop';
import { Settings, Save, AlertCircle, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { valToRgb, getCssGradient } from './colormaps';

interface GrapheneProps {
    vaultRoot: string;
    h5Path: string;
    mapWidth: number;
    mapHeight: number;
    stepSize?: number;
    nSpectra: number;
    selectedPixelIndex: number;
    onPixelSelect?: (idx: number) => void;
    onToggleStandard?: () => void;
    onUpdateDimensions?: (w: number, h: number, step?: number) => void;
    isDismissed?: boolean;
    onDismiss?: () => void;
    applySnv?: boolean;
    wavenumberRange?: [number, number];
}

export function GrapheneCanvasGrid({
    vaultRoot, h5Path, mapWidth, mapHeight, stepSize = 1.0, nSpectra, selectedPixelIndex, onPixelSelect, onToggleStandard, onUpdateDimensions, isDismissed, onDismiss, applySnv = false, wavenumberRange
}: GrapheneProps) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    
    // Custom region heatmap state
    const [customHeatmap, setCustomHeatmap] = useState<number[] | null>(null);
    const [customLoading, setCustomLoading] = useState(false);

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

    const loadData = useCallback(async () => {
        if (!vaultRoot || !h5Path) return;
        setLoading(true);
        try {
            const res = await fetchGrapheneBands({
                vault_root: vaultRoot,
                h5_relative_path: h5Path,
                apply_snv: applySnv,
            });
            if (res.success) {
                setData(res);
                if (res.n_spectra) {
                    setActualN(res.n_spectra);
                }
            }
        } catch (err: any) {
            toast.error(err.message || 'Failed to analyze graphene bands');
        } finally {
            setLoading(false);
        }
    }, [vaultRoot, h5Path, applySnv]);

    const handleSaveDimensions = () => {
        if (onUpdateDimensions) {
            onUpdateDimensions(wOverride, hOverride, stepOverride);
        }
        setShowSettings(false);
        setBannerDismissed(true);
        toast.success(`Grid updated: ${wOverride}x${hOverride} @ ${stepOverride}µm/px`);
    };

    useEffect(() => {
        loadData();
    }, [loadData]);

    const loadCustomHeatmap = useCallback(async () => {
        if (!vaultRoot || !h5Path || !wavenumberRange) {
            setCustomHeatmap(null);
            return;
        }
        setCustomLoading(true);
        try {
            const res = await fetchMapHeatmap({
                vault_root: vaultRoot,
                h5_relative_path: h5Path,
                start_wavenumber: wavenumberRange[0],
                end_wavenumber: wavenumberRange[1],
                apply_snv: applySnv
            });
            if (res.success) {
                setCustomHeatmap(res.heatmap);
            }
        } catch (err: any) {
            toast.error(err.message || 'Failed to load custom heatmap');
        } finally {
            setCustomLoading(false);
        }
    }, [vaultRoot, h5Path, wavenumberRange, applySnv]);

    useEffect(() => {
        loadCustomHeatmap();
    }, [loadCustomHeatmap]);

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = e.currentTarget;
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

    if (loading) {
        return (
            <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-slate-50/50 backdrop-blur-sm z-30 gap-4">
                <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
                    <div className="text-slate-900 font-extrabold text-sm tracking-tight">Computing Graphene Tensors...</div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Scientific Analysis in progress</p>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex-1 w-full h-full flex items-center justify-center bg-white text-slate-400 text-xs font-bold uppercase tracking-widest">
                No Graphene data computed yet
            </div>
        );
    }

    return (
        <div className="flex-1 w-full h-full flex flex-col relative overflow-hidden bg-white text-slate-800">
            {/* Toolbar */}
            <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between pointer-events-none z-20">
                <div className="flex items-center gap-2 pointer-events-auto bg-white/90 backdrop-blur pb-1 px-2 rounded-lg border border-slate-200 shadow-sm">
                    <span className="text-sm font-semibold text-sky-600">
                        Graphene Bands Mode
                    </span>
                    <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase",
                        isMismatch ? "bg-amber-100 text-amber-700 animate-pulse" : "text-slate-500"
                    )}>
                        ({w} x {h} @ {stepSize}µm)
                    </span>
                </div>

                <div className="flex gap-2 pointer-events-auto">
                    {onToggleStandard && (
                        <button 
                            onClick={onToggleStandard}
                            className="px-3 py-1.5 bg-slate-100 text-slate-600 border border-slate-300 rounded flex items-center gap-2 hover:bg-slate-200 hover:text-slate-900 transition-colors text-xs font-semibold"
                        >
                            Return to Standard Map
                        </button>
                    )}
                    <button onClick={() => setShowSettings(!showSettings)} className="p-2 bg-white border border-slate-200 rounded text-slate-500 hover:text-slate-900 shadow-sm transition-colors">
                        <Settings size={16} />
                    </button>
                </div>
            </div>

            {/* Config Overlay (Graphene Mode) */}
            {showSettings && (
                <div className="absolute top-16 right-4 bg-white border border-slate-200 p-6 rounded-[24px] shadow-2xl z-30 w-72 pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-200">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-slate-900 flex items-center gap-2">
                            <Settings size={16} className="text-indigo-500" />
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
                                "p-1.5 rounded-lg transition-all",
                                isMissingMetadata ? "text-indigo-400 hover:bg-indigo-100" : "text-amber-400 hover:bg-amber-100"
                            )}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Canvas Grid Area */}
            <div className="flex-1 w-full h-full p-2 pt-14 overflow-auto custom-scrollbar">
               <div className="grid grid-cols-3 grid-rows-2 gap-4 w-full h-full min-h-[600px] place-items-stretch">
                    
                    <RenderCanvas 
                        title="D Band Intensity" 
                        dataArr={data.map_D} 
                        w={w} h={h} nSpectra={actualN} stepSize={stepSize} cmap="Reds" 
                        selectedPixelIndex={selectedPixelIndex} 
                        onClick={handleCanvasClick} 
                        vmin={0} vmax={null}
                        colorbarLabel="Intensity (counts)"
                    />

                    <RenderCanvas 
                        title="G Band Intensity" 
                        dataArr={data.map_G} 
                        w={w} h={h} nSpectra={actualN} stepSize={stepSize} cmap="Greens" 
                        selectedPixelIndex={selectedPixelIndex} 
                        onClick={handleCanvasClick}
                        vmin={0} vmax={null} 
                        colorbarLabel="Intensity (counts)"
                    />

                    <RenderCanvas 
                        title="2D Band Intensity" 
                        dataArr={data.map_2D} 
                        w={w} h={h} nSpectra={actualN} stepSize={stepSize} cmap="Blues" 
                        selectedPixelIndex={selectedPixelIndex} 
                        onClick={handleCanvasClick} 
                        vmin={0} vmax={null}
                        colorbarLabel="Intensity (counts)"
                    />

                    <div className="col-span-1 h-full w-full">
                        <RenderCanvas 
                            title="I(2D)/I(G)" 
                            subtitle="multilayer→monolayer"
                            dataArr={data.ratio_2D_G} 
                            w={w} h={h} nSpectra={actualN} stepSize={stepSize} cmap="custom2DG" 
                            selectedPixelIndex={selectedPixelIndex} 
                            onClick={handleCanvasClick} 
                            vmin={0} vmax={3.5}
                            colorbarLabel="I(2D)/I(G)"
                        />
                    </div>
                    
                    {customHeatmap ? (
                        <div className="col-span-1 h-full w-full relative">
                            {customLoading && (
                                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
                                     <RefreshCw size={24} className="text-indigo-500 animate-spin" />
                                </div>
                            )}
                            <RenderCanvas 
                                title="Custom Range" 
                                subtitle={wavenumberRange ? `${wavenumberRange[0].toFixed(0)} - ${wavenumberRange[1].toFixed(0)} cm⁻¹` : ""}
                                dataArr={customHeatmap} 
                                w={w} h={h} nSpectra={actualN} stepSize={stepSize} cmap="viridis" 
                                selectedPixelIndex={selectedPixelIndex} 
                                onClick={handleCanvasClick} 
                                vmin={null} vmax={null}
                                colorbarLabel="Intensity (counts)"
                            />
                        </div>
                    ) : (
                        <div className="col-span-1 h-full w-full flex flex-col justify-center items-center text-center text-slate-400 text-sm bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 m-2 xl:m-4">
                            <AlertCircle size={48} className="opacity-20 mb-3"/>
                            <span className="font-semibold text-slate-500">Custom Integration Region</span>
                            <span className="text-[10px] text-slate-400 mt-2">Select a range below</span>
                        </div>
                    )}

                    <div className="col-span-1 h-full w-full">
                        <RenderCanvas 
                            title="I(D)/I(G)" 
                            subtitle=""
                            dataArr={data.ratio_D_G} 
                            w={w} h={h} nSpectra={actualN} stepSize={stepSize} cmap="customDGdefects" 
                            selectedPixelIndex={selectedPixelIndex} 
                            onClick={handleCanvasClick} 
                            vmin={0} vmax={1.0}
                            colorbarLabel="I(D)/I(G)"
                        />
                    </div>

               </div>
            </div>
        </div>
    );
}

// Subcomponent to render isolated canvass efficiently
function RenderCanvas({ title, subtitle, dataArr, w, h, nSpectra, stepSize = 1.0, cmap, selectedPixelIndex, onClick, vmin, vmax, colorbarLabel }: any) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !dataArr) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = w;
        canvas.height = h;

        const imgData = ctx.createImageData(w, h);
        
        let min = vmin !== null ? vmin : 0;
        let max = vmax !== null ? vmax : 1;

        if (vmax === null) {
            let sum = 0;
            let count = 0;
            for(let i=0; i<dataArr.length; i++) {
                if (dataArr[i] > 0) {
                    sum += dataArr[i];
                    count++;
                }
            }
            let mean = count > 0 ? sum / count : 1;
            max = mean * 1.25; 
        }

        // We only set the variables once the render cycle triggers
        const localMin = min;
        const localMax = max;

        for (let i = 0; i < nSpectra; i++) {
            const val = dataArr[i];
            const x = i % w;
            const y = Math.floor(i / w);
            // Removed visual Y inversion. Index 0 is Top-Left to match the standard blue Map Viewer exactly.
            const pixelIdx = (y * w + x) * 4;

            if (val <= 0 || isNaN(val)) {
                imgData.data[pixelIdx] = 255;
                imgData.data[pixelIdx + 1] = 255;
                imgData.data[pixelIdx + 2] = 255;
                imgData.data[pixelIdx + 3] = 255; 
            } else {
                const [r, g, b] = valToRgb(val, localMin, localMax, cmap);
                imgData.data[pixelIdx] = r;
                imgData.data[pixelIdx + 1] = g;
                imgData.data[pixelIdx + 2] = b;
                imgData.data[pixelIdx + 3] = 255;
            }
        }

        ctx.putImageData(imgData, 0, 0);

        if (selectedPixelIndex >= 0 && selectedPixelIndex < nSpectra) {
            const px = selectedPixelIndex % w;
            const py = Math.floor(selectedPixelIndex / w);
            
            ctx.strokeStyle = '#00FFFF'; // Bright cyan is best for visibility on dark red/blue/green
            ctx.lineWidth = Math.max(1, w / 60); 
            ctx.strokeRect(px, py, 1, 1);
        }

    }, [dataArr, w, h, nSpectra, selectedPixelIndex, cmap, vmin, vmax]);

    // Calculate display values
    let displayMax = vmax !== null ? vmax : 1;
    let displayMin = vmin !== null ? vmin : 0;
    if (vmax === null && dataArr) {
        let sum = 0, count = 0;
        for(let i=0; i<dataArr.length; i++) {
            if (dataArr[i] > 0) { sum += dataArr[i]; count++; }
        }
        displayMax = (count > 0 ? sum / count : 1) * 1.25;
    }

    return (
        <div className="flex flex-col w-full h-full bg-white relative p-2 xl:p-4 items-center justify-center">
            
            {/* Title Block (Natural DOM element, reserves space at the top automatically) */}
            <div className="flex-none text-center leading-tight mb-3 w-full mt-2">
                <div className="text-xl xl:text-2xl font-extrabold text-black tracking-tight">{title}</div>
                {subtitle && <div className="text-sm xl:text-lg font-bold text-black mt-1">{subtitle}</div>}
            </div>

            {/* Map Block (Squeezes into remaining height, forces width via aspect-ratio) */}
            <div className="flex-1 min-h-0 flex items-center justify-center w-full my-2">
                
                {/* The dynamic Canvas Box. It shrinks horizontally based on height. */}
                <div 
                    className="relative border-2 border-black bg-white"
                    style={{ 
                        height: '100%', 
                        aspectRatio: `${w}/${h}` 
                    }}
                >
                    {/* -- Y-AXIS -- (Absolute - Perfectly hugs left border) */}
                    <div className="absolute right-[100%] top-0 bottom-0 pr-10 xl:pr-12 flex items-center justify-center">
                        <div className="-rotate-90 text-lg xl:text-xl font-bold text-black whitespace-nowrap">Y (µm)</div>
                    </div>
                    {/* Y Ticks */}
                    <span className="absolute right-[100%] bottom-0 translate-y-1/2 pr-2 text-sm xl:text-base font-bold text-black">{0}</span>
                    <span className="absolute right-[100%] top-1/2 -translate-y-1/2 pr-2 text-sm xl:text-base font-bold text-black">{Math.round((h/2) * stepSize)}</span>
                    <span className="absolute right-[100%] top-0 -translate-y-1/2 pr-2 text-sm xl:text-base font-bold text-black">{Math.round(h * stepSize)}</span>
                    
                    {/* -- X-AXIS TICKS -- */}
                    <span className="absolute top-[100%] left-0 -translate-x-1/2 pt-2 text-sm xl:text-base font-bold text-black">{0}</span>
                    <span className="absolute top-[100%] left-1/2 -translate-x-1/2 pt-2 text-sm xl:text-base font-bold text-black">{Math.round((w/2) * stepSize)}</span>
                    <span className="absolute top-[100%] right-0 translate-x-1/2 pt-2 text-sm xl:text-base font-bold text-black">{Math.round(w * stepSize)}</span>
                    
                    {/* -- COLORBAR -- (Absolute - Perfectly hugs right border) */}
                    <div className="absolute left-[100%] top-0 bottom-0 pl-3 flex flex-row h-full pb-0">
                        <div 
                            className="w-5 xl:w-6 border-2 border-black h-full" 
                            style={{ background: `linear-gradient(to top, ${getCssGradient(cmap)})` }} 
                        />
                        {/* Spacing increased significantly (w-10 xl:w-12) to ensure numbers don't touch the text */}
                        <div className="flex flex-col justify-between text-sm xl:text-base font-bold text-black ml-2 relative w-10 xl:w-12">
                            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                                const val = displayMax - (i * (displayMax - displayMin) / 6);
                                const topPercent = (i * 100) / 6;
                                return (
                                    <span 
                                        key={i} 
                                        className="absolute -translate-y-1/2 whitespace-nowrap" 
                                        style={{ top: `${topPercent}%` }}
                                    >
                                        {val.toFixed(1)}
                                    </span>
                                );
                            })}
                        </div>
                        
                        {/* Label pushed further right (ml-4) */}
                        {colorbarLabel && (
                            <div className="relative flex-1 w-full ml-4 xl:ml-6">
                                <span className="absolute top-1/2 left-0 -translate-y-1/2 origin-left -rotate-90 text-lg xl:text-xl font-bold text-black whitespace-nowrap">
                                    {colorbarLabel}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Tick physically drawn lines via CSS */}
                    <div className="absolute left-0 bottom-0 w-full h-1 border-x border-b border-black -mb-1 opacity-50" />
                    <div className="absolute left-0 top-0 h-full w-1 border-y border-l border-black -ml-1 opacity-50" />
                            
                    {/* Canvas itself */}
                    <canvas 
                        ref={canvasRef} 
                        onClick={onClick}
                        className="w-full h-full object-fill rendering-pixelated cursor-crosshair block absolute inset-0 z-10"
                    />
                </div>

            </div>

            {/* X Axis Block (Natural DOM element, reserves space at the bottom) */}
            <div className="flex-none text-center w-full mt-8 mb-2">
                <span className="text-lg xl:text-xl font-bold text-black">X (µm)</span>
            </div>

        </div>
    );
}


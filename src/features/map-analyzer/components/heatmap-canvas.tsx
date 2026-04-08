'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchMapHeatmap } from '@/lib/desktop';
import { Settings, Maximize, ZoomIn, ZoomOut, Save } from 'lucide-react';
import { toast } from 'sonner';

interface HeatmapProps {
    vaultRoot: string;
    h5Path: string;
    mapWidth: number;
    mapHeight: number;
    nSpectra: number;
    wavenumberRange?: [number, number];
    selectedPixelIndex: number;
    onPixelSelect: (idx: number) => void;
    onToggleGraphene?: () => void;
}

export function HeatmapCanvas({
    vaultRoot, h5Path, mapWidth, mapHeight, nSpectra, wavenumberRange, selectedPixelIndex, onPixelSelect, onToggleGraphene
}: HeatmapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // ... rest of state
    const [heatmapData, setHeatmapData] = useState<number[]>([]);
    const [minMax, setMinMax] = useState({ min: 0, max: 1 });
    const [userMin, setUserMin] = useState<number | null>(null);
    const [userMax, setUserMax] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    // Dimension Overrides
    const [wOverride, setWOverride] = useState(mapWidth);
    const [hOverride, setHOverride] = useState(mapHeight);
    const [showSettings, setShowSettings] = useState(false);

    const w = wOverride > 0 ? wOverride : Math.ceil(Math.sqrt(nSpectra));
    const h = hOverride > 0 ? hOverride : Math.ceil(nSpectra / w);

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

        for (let i = 0; i < nSpectra; i++) {
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
        if (selectedPixelIndex >= 0 && selectedPixelIndex < nSpectra) {
            const px = selectedPixelIndex % w;
            const py = Math.floor(selectedPixelIndex / w);
            ctx.strokeStyle = '#00FFFF';
            ctx.lineWidth = Math.max(1, w / 100); 
            ctx.strokeRect(px, py, 1, 1);
        }

    }, [heatmapData, minMax, userMin, userMax, w, h, nSpectra, selectedPixelIndex]);

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
            if (index < nSpectra) {
                onPixelSelect(index);
            }
        }
    };

    const handleSaveDimensions = () => {
        // Ideally save to DB/H5 here, for now it just updates state
        setShowSettings(false);
        toast.success('Dimensions updated. (A DB/H5 save needs to be linked here based on global App state)');
    };

    const handleGrapheneLaunch = () => {
        if (onToggleGraphene) {
            onToggleGraphene();
        }
    };

    return (
        <div className="flex-1 w-full h-full flex flex-col relative" ref={containerRef}>
            {/* Toolbar */}
            <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between pointer-events-none z-20">
                <div className="flex items-center gap-2 pointer-events-auto bg-black/60 backdrop-blur pb-1 px-2 rounded-lg border border-slate-800">
                    <span className="text-sm font-semibold text-slate-300">
                        Map Viewer
                    </span>
                    <span className="text-xs text-slate-500">({w} x {h})</span>
                    {wavenumberRange && (
                        <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">
                            Range: {wavenumberRange[0].toFixed(1)} - {wavenumberRange[1].toFixed(1)} cm⁻¹
                        </span>
                    )}
                </div>

                <div className="flex gap-2 pointer-events-auto">
                    <button 
                        onClick={handleGrapheneLaunch}
                        className="px-3 py-1.5 bg-sky-600/20 text-sky-400 border border-sky-600/40 rounded flex items-center gap-2 hover:bg-sky-600 hover:text-white transition-colors text-xs font-semibold"
                        title="Popup Matplotlib graphene bands script"
                    >
                        Graphene Bands
                    </button>
                    <button onClick={() => setShowSettings(!showSettings)} className="p-2 bg-slate-900 border border-slate-700 rounded text-slate-400 hover:text-white transition-colors">
                        <Settings size={16} />
                    </button>
                </div>
            </div>

            {/* Config Overlay */}
            {showSettings && (
                <div className="absolute top-14 right-3 bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl z-30 w-64 text-sm pointer-events-auto">
                    <h4 className="font-semibold text-slate-200 mb-3">Map Dimensions</h4>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-slate-400">Width (pixels / µm)</label>
                            <input 
                                type="number" 
                                value={wOverride} 
                                onChange={(e) => setWOverride(parseInt(e.target.value) || 0)}
                                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 mt-1 outline-none focus:border-purple-500 text-slate-300"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400">Height (pixels / µm)</label>
                            <input 
                                type="number" 
                                value={hOverride} 
                                onChange={(e) => setHOverride(parseInt(e.target.value) || 0)}
                                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 mt-1 outline-none focus:border-purple-500 text-slate-300"
                            />
                        </div>
                        <div className="pt-2 flex justify-end">
                            <button onClick={handleSaveDimensions} className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded flex items-center gap-1.5 text-xs font-medium">
                                <Save size={14} /> Update
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Canvas Area */}
            <div className="flex-1 w-full h-full flex items-center justify-center p-8 relative overflow-hidden bg-dot-grid">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
                        <div className="animate-spin text-purple-500">⟳</div>
                    </div>
                )}
                
                {/* CSS scaling approach for crisp pixels */}
                <div 
                    className="relative shadow-2xl shadow-purple-900/20"
                    style={{
                        width: w * 5, // Magnification multiplier to make it visible
                        height: h * 5,
                        maxWidth: '80%',
                        maxHeight: '80%',
                        aspectRatio: `${w} / ${h}`
                    }}
                >
                    <canvas 
                        ref={canvasRef} 
                        onClick={handleCanvasClick}
                        className="w-full h-full cursor-crosshair border border-slate-700/50 rounded-sm rendering-pixelated"
                    />
                </div>
            </div>
            {/* Interactive Dual-Thumb Range Slider (Bottom) */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/80 backdrop-blur-md px-6 py-3 rounded-full border border-slate-700 shadow-2xl z-30">
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
                            <span className="text-xs font-mono text-slate-300 w-12 text-right">
                                {cMin.toFixed(step === 1 ? 0 : 2)}
                            </span>

                            <div className="relative w-64 h-4 flex items-center">
                                {/* Gradient Base */}
                                <div className="absolute w-full h-1.5 rounded-full bg-gradient-to-r from-blue-900 via-green-500 to-red-500" />
                                
                                {/* Overlay dimmers for out-of-range limits */}
                                <div className="absolute h-1.5 bg-black/70 rounded-l-full" style={{ width: `${leftPct}%` }} />
                                <div className="absolute h-1.5 bg-black/70 right-0 rounded-r-full" style={{ width: `${rightPct}%` }} />

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
                                    [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white 
                                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md cursor-ew-resize 
                                    [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-300"
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
                                    [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white 
                                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md cursor-ew-resize
                                    [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-300"
                                />
                            </div>

                            <span className="text-xs font-mono text-slate-300 w-12">
                                {cMax.toFixed(step === 1 ? 0 : 2)}
                            </span>

                            {(userMin !== null || userMax !== null) && (
                                <button 
                                    onClick={() => { setUserMin(null); setUserMax(null); }}
                                    className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center bg-slate-700 text-white rounded-full border border-slate-500 shadow cursor-pointer text-xs hover:bg-slate-600 transition-colors"
                                    title="Reset To Default"
                                >
                                    ✕
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

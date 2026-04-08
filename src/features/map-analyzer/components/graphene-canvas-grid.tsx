'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchGrapheneBands } from '@/lib/desktop';
import { Settings, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { valToRgb, getCssGradient } from './colormaps';

interface GrapheneProps {
    vaultRoot: string;
    h5Path: string;
    mapWidth: number;
    mapHeight: number;
    nSpectra: number;
    selectedPixelIndex: number;
    onPixelSelect: (idx: number) => void;
    onToggleStandard?: () => void;
}

export function GrapheneCanvasGrid({
    vaultRoot, h5Path, mapWidth, mapHeight, nSpectra, selectedPixelIndex, onPixelSelect, onToggleStandard
}: GrapheneProps) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    // Dimension Overrides
    const [wOverride, setWOverride] = useState(mapWidth);
    const [hOverride, setHOverride] = useState(mapHeight);
    const [showSettings, setShowSettings] = useState(false);

    const w = wOverride > 0 ? wOverride : Math.ceil(Math.sqrt(nSpectra));
    const h = hOverride > 0 ? hOverride : Math.ceil(nSpectra / w);

    const loadData = useCallback(async () => {
        if (!vaultRoot || !h5Path) return;
        setLoading(true);
        try {
            const res = await fetchGrapheneBands({
                vault_root: vaultRoot,
                h5_relative_path: h5Path,
            });
            if (res.success) {
                setData(res);
            }
        } catch (err: any) {
            toast.error(err.message || 'Failed to analyze graphene bands');
        } finally {
            setLoading(false);
        }
    }, [vaultRoot, h5Path]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = e.currentTarget;
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

    if (loading) {
        return (
            <div className="flex-1 w-full h-full flex items-center justify-center bg-black/40 relative z-10 flex-col gap-4">
                <div className="animate-spin text-sky-500 text-3xl">⟳</div>
                <div className="text-sky-400 font-semibold text-sm">Computing Graphene Tensors...</div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex-1 w-full h-full flex items-center justify-center bg-white text-slate-500 text-sm">
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
                    <span className="text-xs text-slate-500">({w} x {h})</span>
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

            {/* Canvas Grid Area */}
            <div className="flex-1 w-full h-full p-2 pt-14 overflow-auto custom-scrollbar">
               <div className="grid grid-cols-3 grid-rows-2 gap-4 w-full h-full min-h-[600px] place-items-stretch">
                    
                    <RenderCanvas 
                        title="D Band Intensity" 
                        dataArr={data.map_D} 
                        w={w} h={h} nSpectra={nSpectra} cmap="Reds" 
                        selectedPixelIndex={selectedPixelIndex} 
                        onClick={handleCanvasClick} 
                        vmin={0} vmax={null}
                        colorbarLabel="Intensity (counts)"
                    />

                    <RenderCanvas 
                        title="G Band Intensity" 
                        dataArr={data.map_G} 
                        w={w} h={h} nSpectra={nSpectra} cmap="Greens" 
                        selectedPixelIndex={selectedPixelIndex} 
                        onClick={handleCanvasClick}
                        vmin={0} vmax={null} 
                        colorbarLabel="Intensity (counts)"
                    />

                    <RenderCanvas 
                        title="2D Band Intensity" 
                        dataArr={data.map_2D} 
                        w={w} h={h} nSpectra={nSpectra} cmap="Blues" 
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
                            w={w} h={h} nSpectra={nSpectra} cmap="custom2DG" 
                            selectedPixelIndex={selectedPixelIndex} 
                            onClick={handleCanvasClick} 
                            vmin={0} vmax={3.5}
                            colorbarLabel="I(2D)/I(G)"
                        />
                    </div>
                    
                    <div className="col-span-1 h-full w-full flex flex-col justify-center items-center text-center text-slate-400 text-sm">
                        <AlertCircle size={48} className="opacity-20 mb-3"/>
                        <span className="font-semibold text-slate-500">Graphene Neural Vision</span>
                    </div>

                    <div className="col-span-1 h-full w-full">
                        <RenderCanvas 
                            title="I(D)/I(G)" 
                            subtitle=""
                            dataArr={data.ratio_D_G} 
                            w={w} h={h} nSpectra={nSpectra} cmap="customDGdefects" 
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
function RenderCanvas({ title, subtitle, dataArr, w, h, nSpectra, cmap, selectedPixelIndex, onClick, vmin, vmax, colorbarLabel }: any) {
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
                    <span className="absolute right-[100%] top-1/2 -translate-y-1/2 pr-2 text-sm xl:text-base font-bold text-black">{Math.round(h/2)}</span>
                    <span className="absolute right-[100%] top-0 -translate-y-1/2 pr-2 text-sm xl:text-base font-bold text-black">{h}</span>
                    
                    {/* -- X-AXIS TICKS -- */}
                    <span className="absolute top-[100%] left-0 -translate-x-1/2 pt-2 text-sm xl:text-base font-bold text-black">{0}</span>
                    <span className="absolute top-[100%] left-1/2 -translate-x-1/2 pt-2 text-sm xl:text-base font-bold text-black">{Math.round(w/2)}</span>
                    <span className="absolute top-[100%] right-0 translate-x-1/2 pt-2 text-sm xl:text-base font-bold text-black">{w}</span>
                    
                    {/* -- COLORBAR -- (Absolute - Perfectly hugs right border) */}
                    <div className="absolute left-[100%] top-0 bottom-0 pl-3 flex flex-row h-full pb-0">
                        <div 
                            className="w-5 xl:w-6 border-2 border-black h-full" 
                            style={{ background: `linear-gradient(to top, ${getCssGradient(cmap)})` }} 
                        />
                        {/* Spacing increased significantly (w-10 xl:w-12) to ensure numbers don't touch the text */}
                        <div className="flex flex-col justify-between text-sm xl:text-base font-bold text-black ml-2 relative w-10 xl:w-12">
                            <span className="absolute top-0 -translate-y-1/2 whitespace-nowrap">{displayMax.toFixed(1)}</span>
                            <span className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap">{(displayMax/2).toFixed(1)}</span>
                            <span className="absolute bottom-0 translate-y-1/2 whitespace-nowrap">{displayMin.toFixed(1)}</span>
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


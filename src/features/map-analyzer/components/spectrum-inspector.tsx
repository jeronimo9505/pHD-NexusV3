'use client';

import { useEffect, useState } from 'react';
import { fetchMapSpectrum } from '@/lib/desktop';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceArea, Tooltip } from 'recharts';
import { toast } from 'sonner';

interface SpectrumProps {
    vaultRoot: string;
    h5Path: string;
    pixelIndex: number;
    onRangeSelected: (range: [number, number] | undefined) => void;
}

export function SpectrumInspector({ vaultRoot, h5Path, pixelIndex, onRangeSelected }: SpectrumProps) {
    const [data, setData] = useState<{ x: number, y: number }[]>([]);
    const [loading, setLoading] = useState(false);

    // Brush Selection State
    const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
    const [refAreaRight, setRefAreaRight] = useState<number | null>(null);

    useEffect(() => {
        if (!h5Path || pixelIndex < 0) return;
        
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetchMapSpectrum({
                    vault_root: vaultRoot,
                    h5_relative_path: h5Path,
                    spectrum_index: pixelIndex
                });
                if (res.success) {
                    setData(res.data);
                }
            } catch (err: any) {
                toast.error(err.message || 'Failed to fetch spectrum');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [vaultRoot, h5Path, pixelIndex]);

    const zoom = () => {
        if (refAreaLeft === refAreaRight || refAreaRight === null || refAreaLeft === null) {
            setRefAreaLeft(null);
            setRefAreaRight(null);
            return;
        }

        // Determine min and max
        let [start, end] = [refAreaLeft, refAreaRight];
        if (start > end) [start, end] = [end, start];

        // Notify parent to slice the heatmap
        onRangeSelected([start, end]);

        setRefAreaLeft(null);
        setRefAreaRight(null);
    };

    const resetZoom = () => {
        onRangeSelected(undefined);
    };

    if (!h5Path) return null;

    return (
        <div className="w-full h-full flex flex-col p-4 relative bg-white">
            <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    <div className="text-xs font-bold text-slate-900">
                        Spectrum Area — <span className="text-slate-400">Index {pixelIndex}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={resetZoom}
                        className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg transition-all border border-slate-200"
                    >
                        Reset Range
                    </button>
                    <button 
                        className="text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg transition-all border border-indigo-100"
                    >
                        Save Data
                    </button>
                </div>
            </div>
            
            <div className="flex-1 relative pb-2 min-h-0" style={{ userSelect: 'none' }}>
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-24 h-1 bg-slate-100 overflow-hidden rounded-full">
                                <div className="h-full bg-indigo-500 w-1/2 animate-pulse" />
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading Spectra</span>
                        </div>
                    </div>
                )}
                
                {data.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={data}
                            margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
                            onMouseDown={(e: any) => { if (e && e.activeLabel) setRefAreaLeft(Number(e.activeLabel)) }}
                            onMouseMove={(e: any) => { if (refAreaLeft && e && e.activeLabel) setRefAreaRight(Number(e.activeLabel)) }}
                            onMouseUp={zoom}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis 
                                dataKey="x" 
                                type="number"
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(val) => val.toFixed(0)}
                                tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                                axisLine={{ stroke: '#e2e8f0' }}
                                tickLine={{ stroke: '#e2e8f0' }}
                            />
                            <YAxis 
                                type="number"
                                domain={['auto', 'auto']}
                                tickFormatter={(val) => (val > 1000 ? `${(val/1000).toFixed(1)}k` : val.toFixed(0))}
                                tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip 
                                contentStyle={{ 
                                    backgroundColor: '#ffffff', 
                                    borderColor: '#e2e8f0', 
                                    borderRadius: '12px',
                                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                    fontSize: '11px', 
                                    color: '#0f172a',
                                    fontWeight: 'bold'
                                }}
                                labelFormatter={(val: any) => `${val ? Number(val).toFixed(1) : '0'} cm⁻¹`}
                                formatter={(val: any) => [val ? Number(val).toFixed(2) : '0', 'Intensity']}
                            />
                            <Line 
                                type="linear" 
                                dataKey="y" 
                                stroke="#f43f5e" 
                                strokeWidth={2}
                                dot={false} 
                                isAnimationActive={false}
                            />
                            
                            {refAreaLeft && refAreaRight ? (
                                <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#6366f1" fillOpacity={0.1} />
                            ) : null}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}

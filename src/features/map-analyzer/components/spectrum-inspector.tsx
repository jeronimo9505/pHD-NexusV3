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
        <div className="w-full h-full flex flex-col p-2 relative">
            <div className="flex items-center justify-between mb-2 px-2">
                <div className="text-xs font-semibold text-slate-400">
                    Spectrum at Index {pixelIndex}
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={resetZoom}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded"
                    >
                        Reset Region
                    </button>
                </div>
            </div>
            
            <div className="flex-1 relative pb-2 min-h-0" style={{ userSelect: 'none' }}>
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50">
                        <div className="w-24 h-1 bg-slate-800 overflow-hidden rounded-full">
                            <div className="h-full bg-purple-500 w-1/2 animate-pulse" />
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
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis 
                                dataKey="x" 
                                type="number"
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(val) => val.toFixed(0)}
                                tick={{ fontSize: 10, fill: '#64748b' }}
                                axisLine={{ stroke: '#334155' }}
                            />
                            <YAxis 
                                type="number"
                                domain={['auto', 'auto']}
                                tickFormatter={(val) => (val > 1000 ? `${(val/1000).toFixed(1)}k` : val.toFixed(0))}
                                tick={{ fontSize: 10, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', fontSize: '11px', color: '#f8fafc' }}
                                labelFormatter={(val: number) => `${val.toFixed(1)} cm⁻¹`}
                                formatter={(val: number) => [val.toFixed(2), 'Intensity']}
                            />
                            <Line 
                                type="linear" 
                                dataKey="y" 
                                stroke="#f43f5e" 
                                strokeWidth={1.5}
                                dot={false} 
                                isAnimationActive={false}
                            />
                            
                            {refAreaLeft && refAreaRight ? (
                                <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#a855f7" fillOpacity={0.2} />
                            ) : null}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getFileContent } from '@/lib/google/drive';
import { ensureAuth } from '@/lib/google/auth';
import { Loader2, Activity, Download, Maximize2 } from 'lucide-react';

interface SpectrumGraphProps {
    fileId: string;
    title?: string;
}

export function SpectrumGraph({ fileId, title }: SpectrumGraphProps) {
    const [data, setData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            if (!fileId) return;
            setIsLoading(true);
            setError(null);
            try {
                const token = await ensureAuth();
                const content = await getFileContent(fileId, token);
                // Backward compatibility: Handle both raw arrays and new payload format
                let spectrumData = [];
                if (Array.isArray(content)) {
                    spectrumData = content;
                } else if (content && typeof content === 'object' && Array.isArray(content.data)) {
                    spectrumData = content.data;
                } else {
                    throw new Error("Invalid data format");
                }

                if (spectrumData.length > 0) {
                    setData(spectrumData);
                } else {
                    throw new Error("No data points found");
                }
            } catch (err: any) {
                console.error("Error fetching spectrum:", err);
                setError(err.message || "Failed to load spectrum");
            } finally {
                setIsLoading(false);
            }
        }

        fetchData();
    }, [fileId]);

    if (isLoading) {
        return (
            <div className="h-[300px] w-full flex flex-col items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100 italic text-slate-400">
                <Loader2 className="animate-spin mb-2" size={20} />
                <span className="text-xs">Loading spectrum data...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-[300px] w-full flex flex-col items-center justify-center bg-red-50/30 rounded-xl border border-red-100 text-red-500 text-xs">
                <Activity className="mb-2 opacity-50" size={20} />
                <span>{error}</span>
            </div>
        );
    }

    const handleDownload = () => {
        if (!data || data.length === 0) return;

        // Format as XY text (tab separated)
        const content = data.map(point => `${point.x}\t${point.y}`).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        // Use a safe filename
        const filename = (title || 'spectrum').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `${filename}.txt`;
        document.body.appendChild(a);
        a.click();

        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                    <Activity size={16} className="text-purple-500" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-tight">{title || 'Raman Spectrum'}</h4>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleDownload}
                        title="Download XY Data (.txt)"
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded transition-colors"
                    >
                        <Download size={14} />
                    </button>
                </div>
            </div>

            <div className="p-4 h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                            dataKey="x"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            tick={{ fontSize: 10 }}
                            tickFormatter={(val) => val.toFixed(0)}
                            stroke="#94a3b8"
                        />
                        <YAxis
                            domain={['auto', 'auto']}
                            tick={{ fontSize: 10 }}
                            tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
                            stroke="#94a3b8"
                            hide={false}
                        />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px' }}
                            itemStyle={{ fontWeight: 'bold' }}
                            labelFormatter={(label) => `Wavenumber: ${label.toFixed(2)}`}
                            formatter={(value: any) => [value.toFixed(2), 'raw data average']}
                        />
                        <Line
                            type="monotone"
                            dataKey="y"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                            animationDuration={1500}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
                <span className="text-[10px] text-slate-400 font-medium">Wavenumber (cm⁻¹)</span>
            </div>
        </div>
    );
}

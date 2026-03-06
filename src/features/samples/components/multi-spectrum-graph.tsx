'use client';

import { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceArea } from 'recharts';
import { Loader2, RefreshCcw } from 'lucide-react';
import { getFileContent } from '@/lib/google/drive';

// Array of distinct colors for multiple lines
const LINE_COLORS = [
    '#7c3aed', // Purple
    '#2563eb', // Blue
    '#d97706', // Amber
    '#16a34a', // Green
    '#dc2626', // Red
    '#0891b2', // Cyan
    '#db2777', // Pink
    '#ea580c', // Orange
    '#4f46e5', // Indigo
    '#059669', // Emerald
];

interface SpectrumConfig {
    fileId: string;
    label: string;
    subLabel?: string;
    charId: string;
}

interface MultiSpectrumGraphProps {
    selectedConfigs: SpectrumConfig[];
}

export function MultiSpectrumGraph({ selectedConfigs }: MultiSpectrumGraphProps) {
    const [dataFrames, setDataFrames] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

    // Zoom state
    const [refAreaLeft, setRefAreaLeft] = useState<string | number | null>(null);
    const [refAreaRight, setRefAreaRight] = useState<string | number | null>(null);
    const [left, setLeft] = useState<string | number>('dataMin');
    const [right, setRight] = useState<string | number>('dataMax');

    useEffect(() => {
        const fetchAll = async () => {
            if (selectedConfigs.length === 0) {
                setDataFrames({});
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const { ensureAuth } = await import('@/lib/google/auth');
                const token = await ensureAuth();

                // Build a fresh dict of { [charId]: dataPoints }
                const newData: Record<string, any[]> = {};

                // Fetch all in parallel
                await Promise.all(selectedConfigs.map(async (config) => {
                    // Try to avoid refetching if we already have it
                    if (dataFrames[config.charId]) {
                        newData[config.charId] = dataFrames[config.charId];
                        return;
                    }

                    const jsonStr = await getFileContent(config.fileId, token);
                    let parsed;

                    if (typeof jsonStr === 'string') {
                        parsed = JSON.parse(jsonStr);
                    } else {
                        parsed = jsonStr;
                    }

                    // Handle legacy flat arrays vs new object payload
                    let points = Array.isArray(parsed) ? parsed : (parsed.data || []);

                    // Filter out invalid points
                    points = points.filter((p: any) => typeof p.x === 'number' && typeof p.y === 'number');

                    // Sort by X ascending
                    points.sort((a: any, b: any) => a.x - b.x);

                    newData[config.charId] = points;
                }));

                setDataFrames(newData);

            } catch (err: any) {
                console.error("MultiSpectrum Fetch Error", err);
                setError(err.message || "Failed to load spectrum data");
            } finally {
                setLoading(false);
            }
        };

        fetchAll();
    }, [selectedConfigs]);

    // Merge dataframes into a single wide dataset for recharts
    // e.g., { x: 400, "charId1": 500, "charId2": 510 }
    const mergedData = useMemo(() => {
        const allX = new Set<number>();

        // Collect all unique X values (wave numbers)
        Object.values(dataFrames).forEach(points => {
            points.forEach(p => allX.add(p.x));
        });

        const sortedX = Array.from(allX).sort((a, b) => a - b);

        // Create the merged points
        return sortedX.map(x => {
            const row: any = { x };
            selectedConfigs.forEach(conf => {
                // Find the y value for this X in this specific charId's dataset
                // If it doesn't exist at this exact X, we leave it undefined (Recharts handles gaps)
                const points = dataFrames[conf.charId];
                if (points) {
                    // Binary search would be faster here, but a find is okay for typical spectra sizes, 
                    // or better, create a map for each dataset. Let's build maps.
                }
            });
            return row;
        });
    }, [dataFrames, selectedConfigs]);

    // Optimized Merging Line (Replacing the naive map above)
    const fastMergedData = useMemo(() => {
        const rowMap = new Map<number, any>();

        Object.entries(dataFrames).forEach(([charId, points]) => {
            points.forEach(p => {
                let row = rowMap.get(p.x);
                if (!row) {
                    row = { x: p.x };
                    rowMap.set(p.x, row);
                }
                row[charId] = p.y;
            });
        });

        // Sort Map by X value and return as array
        return Array.from(rowMap.values()).sort((a, b) => a.x - b.x);
    }, [dataFrames]);


    const handleZoom = () => {
        if (!refAreaLeft || !refAreaRight) {
            setRefAreaLeft(null);
            setRefAreaRight(null);
            return;
        }

        // Ensure left is smaller than right
        let [zoomLeft, zoomRight] = [refAreaLeft, refAreaRight].sort((a: any, b: any) => a - b);

        setRefAreaLeft(null);
        setRefAreaRight(null);
        setLeft(zoomLeft);
        setRight(zoomRight);
    };

    const zoomOut = () => {
        setRefAreaLeft(null);
        setRefAreaRight(null);
        setLeft('dataMin');
        setRight('dataMax');
    };

    const toggleSeries = (charId: string) => {
        setHiddenSeries(prev => {
            const next = new Set(prev);
            if (next.has(charId)) next.delete(charId);
            else next.add(charId);
            return next;
        });
    };

    if (loading && Object.keys(dataFrames).length === 0) {
        return (
            <div className="flex h-full items-center justify-center p-8 bg-slate-50/50 rounded-lg">
                <Loader2 className="animate-spin text-purple-600" size={32} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col h-full items-center justify-center p-8 text-red-600 bg-red-50 rounded-lg border border-red-100">
                <p className="font-medium text-sm text-center max-w-sm mb-4">Error loading data: {error}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <button
                        onClick={zoomOut}
                        disabled={left === 'dataMin' && right === 'dataMax'}
                        className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-600 rounded-md hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                    >
                        <RefreshCcw size={12} /> Reset Zoom
                    </button>
                    {loading && <Loader2 className="animate-spin text-purple-600 ml-2" size={14} />}
                </div>
            </div>

            {/* Graph */}
            <div className="flex-1 min-h-[400px] w-full bg-white border border-slate-200 rounded-lg p-4 shadow-inner">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={fastMergedData}
                        onMouseDown={(e: any) => e && setRefAreaLeft(e.activeLabel)}
                        onMouseMove={(e: any) => refAreaLeft && e && setRefAreaRight(e.activeLabel)}
                        onMouseUp={handleZoom}
                        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis
                            dataKey="x"
                            type="number"
                            domain={[left, right]}
                            tickFormatter={(v) => v.toFixed(0)}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            stroke="#cbd5e1"
                            label={{ value: 'Raman Shift (cm⁻¹)', position: 'bottom', fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                            allowDataOverflow
                        />
                        <YAxis
                            domain={['auto', 'auto']}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            stroke="#cbd5e1"
                            width={80}
                            label={{ value: 'Intensity (a.u.)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                            tickFormatter={(v) => v.toExponential(1)}
                            allowDataOverflow
                        />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}
                            labelFormatter={(v) => `Raman Shift: ${Number(v).toFixed(2)} cm⁻¹`}
                            formatter={(value: any, name: any, props: any) => {
                                // name is the dataKey by default unless overriden. We overrode it on <Line> to be config.label
                                return [Number(value).toFixed(2), name];
                            }}
                        />

                        <Legend
                            verticalAlign="top"
                            align="right"
                            content={(props: any) => {
                                const { payload } = props;
                                return (
                                    <ul className="flex flex-wrap gap-4 justify-center text-xs pb-4">
                                        {payload.map((entry: any, index: number) => {
                                            // Since we use name={config.label} in Line, entry.value is the label, and entry.dataKey is charId
                                            const config = selectedConfigs.find(c => c.charId === entry.dataKey);
                                            const isHidden = hiddenSeries.has(entry.dataKey);
                                            return (
                                                <li key={`item-${index}`} className="flex items-center gap-1.5 cursor-pointer opacity-90 hover:opacity-100 transition-opacity" onClick={() => toggleSeries(entry.dataKey)}>
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: isHidden ? '#cbd5e1' : entry.color }} />
                                                    <div className={`flex items-baseline gap-1 ${isHidden ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                                        <span className="font-semibold">{config?.label || entry.value}</span>
                                                        {config?.subLabel && <span className="text-[10px] text-slate-400">({config.subLabel})</span>}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                );
                            }}
                        />

                        {selectedConfigs.map((config, index) => {
                            const color = LINE_COLORS[index % LINE_COLORS.length];
                            const isHidden = hiddenSeries.has(config.charId);
                            return (
                                <Line
                                    key={config.charId}
                                    type="monotone"
                                    dataKey={config.charId}
                                    name={config.label}
                                    stroke={color}
                                    strokeWidth={isHidden ? 0 : 2}
                                    dot={false}
                                    activeDot={isHidden ? false : { r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }}
                                    isAnimationActive={false} // Disable animation for performance on large scientific datasets
                                    connectNulls={true}
                                />
                            );
                        })}

                        {refAreaLeft && refAreaRight && (
                            <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#e2e8f0" />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

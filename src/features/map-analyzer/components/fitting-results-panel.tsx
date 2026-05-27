'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { BarChart2, Zap, GitBranch, Map } from 'lucide-react';
import { cn } from '@/lib/utils';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export interface FittingMapFitResult {
    n_spectra: number;
    success_count: number;
    results: Record<string, Record<string, number> | { success: boolean; reason: string }>;
}

type Tab = 'distributions' | 'quality' | 'relations' | 'maps';

interface Props {
    result: FittingMapFitResult;
    mapWidth: number;
    mapHeight: number;
    peakNames: string[];
}

const PLOTLY_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#3b82f6'];
const BG = 'rgba(0,0,0,0)';
const AXIS_STYLE = {
    gridcolor: '#e2e8f0',
    zerolinecolor: '#cbd5e1',
    color: '#64748b',
    tickfont: { size: 10, color: '#64748b' },
};
const LAYOUT_BASE = {
    paper_bgcolor: BG,
    plot_bgcolor: BG,
    margin: { l: 50, r: 20, t: 30, b: 40 },
    font: { family: 'Inter, sans-serif', size: 11 },
    xaxis: AXIS_STYLE,
    yaxis: AXIS_STYLE,
};

export function FittingResultsPanel({ result, mapWidth, mapHeight, peakNames }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('quality');
    const [scatterX, setScatterX] = useState<string>('');
    const [scatterY, setScatterY] = useState<string>('');

    // Transform raw pixel results into structured arrays
    const { allParams, paramKeys } = useMemo(() => {
        const params: Record<string, (number | null)[]> = {};
        
        // Find all possible parameter names from successful pixels
        const keysSet = new Set<string>();
        Object.values(result.results).forEach(v => {
            if (v && !('success' in v)) {
                Object.keys(v).forEach(k => keysSet.add(k));
            }
        });
        
        // Initialize arrays
        const nTotal = mapWidth * mapHeight;
        keysSet.forEach(k => {
            params[k] = new Array(nTotal).fill(null);
        });

        // Fill arrays
        for (let i = 0; i < nTotal; i++) {
            const val = result.results[String(i)];
            if (val && !('success' in val)) {
                Object.entries(val).forEach(([k, v]) => {
                    params[k][i] = v;
                });
            }
        }

        return { allParams: params, paramKeys: Array.from(keysSet) };
    }, [result, mapWidth, mapHeight]);

    if (!scatterX && paramKeys.length > 0) setScatterX(paramKeys[0]);
    if (!scatterY && paramKeys.length > 0) setScatterY(paramKeys[Math.min(1, paramKeys.length - 1)]);

    // KPI stats
    const stats = useMemo(() => {
        const r2s = (allParams['r_squared'] || []).filter(v => v !== null) as number[];
        const meanR2 = r2s.length > 0 ? r2s.reduce((a,b)=>a+b, 0) / r2s.length : 0.0;
        const p95 = r2s.length > 0 ? (r2s.filter(v=>v>=0.95).length / r2s.length) * 100 : 0.0;
        const p99 = r2s.length > 0 ? (r2s.filter(v=>v>=0.99).length / r2s.length) * 100 : 0.0;
        return { meanR2, p95, p99 };
    }, [allParams]);

    const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'quality',       label: 'Fit Quality',    icon: <Zap size={12} /> },
        { id: 'distributions', label: 'Distributions',  icon: <BarChart2 size={12} /> },
        { id: 'relations',     label: 'Relations',      icon: <GitBranch size={12} /> },
        { id: 'maps',          label: 'Parameter Maps', icon: <Map size={12} /> },
    ];

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="px-6 pt-4 pb-3 border-b border-slate-100 shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-800">
                        Fitting Results &mdash; {result.success_count}/{result.n_spectra} spectra successfully fitted
                    </h3>
                    <div className="flex gap-3">
                        <KPI label="R2 mean" value={stats.meanR2.toFixed(4)} highlight={stats.meanR2 > 0.98} />
                        <KPI label="R2 > 0.95" value={`${stats.p95.toFixed(1)}%`} highlight={stats.p95 > 90} />
                        <KPI label="R2 > 0.99" value={`${stats.p99.toFixed(1)}%`} highlight={stats.p99 > 75} />
                    </div>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 w-fit">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                                activeTab === t.id
                                    ? "bg-white text-indigo-600 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
                {activeTab === 'quality' && (
                    <QualityTab r_squared_map={allParams['r_squared'] || []} />
                )}
                {activeTab === 'distributions' && (
                    <DistributionsTab allParams={allParams} paramKeys={paramKeys} />
                )}
                {activeTab === 'relations' && (
                    <RelationsTab
                        allParams={allParams}
                        paramKeys={paramKeys}
                        scatterX={scatterX}
                        scatterY={scatterY}
                        onSetX={setScatterX}
                        onSetY={setScatterY}
                    />
                )}
                {activeTab === 'maps' && (
                    <MapsTab
                        allParams={allParams}
                        paramKeys={paramKeys}
                        mapWidth={mapWidth}
                        mapHeight={mapHeight}
                    />
                )}
            </div>
        </div>
    );
}

function KPI({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={cn(
            "flex flex-col items-center px-3 py-1.5 rounded-xl border text-center",
            highlight ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
        )}>
            <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">{label}</span>
            <span className={cn("text-xs font-black", highlight ? "text-emerald-600" : "text-slate-700")}>{value}</span>
        </div>
    );
}

function QualityTab({ r_squared_map }: { r_squared_map: (number | null)[] }) {
    const validR2 = r_squared_map.filter(v => v !== null) as number[];
    const hist = buildHistogram(validR2, 30);

    return (
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 max-w-2xl mx-auto mt-4">
            <p className="text-xs font-bold text-slate-700 mb-3">Global R² Distribution</p>
            {validR2.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400">No fitting quality data available.</div>
            ) : (
                <Plot
                    data={[{
                        type: 'bar',
                        x: hist.bins,
                        y: hist.counts,
                        marker: { color: '#6366f1' },
                        hovertemplate: 'R²: %{x:.4f}<br>Count: %{y}<extra></extra>',
                    }]}
                    layout={{
                        ...LAYOUT_BASE,
                        height: 250,
                        xaxis: { ...AXIS_STYLE, title: { text: 'R²', font: { size: 10 } } },
                        yaxis: { ...AXIS_STYLE, title: { text: 'Count', font: { size: 10 } } },
                        bargap: 0.05,
                    }}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: '100%' }}
                />
            )}
        </div>
    );
}

function DistributionsTab({ allParams, paramKeys }: { allParams: Record<string, (number | null)[]>; paramKeys: string[] }) {
    const [selected, setSelected] = useState<string>(paramKeys[0] || '');

    const validData = (allParams[selected] || []).filter(v => v !== null) as number[];
    const hist = buildHistogram(validData, 30);

    return (
        <div className="flex flex-col gap-4 max-w-2xl mx-auto mt-2">
            <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Parameter:</span>
                <select
                    className="text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1 outline-none text-slate-700 cursor-pointer"
                    value={selected}
                    onChange={e => setSelected(e.target.value)}
                >
                    {paramKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                {validData.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-400">Select a valid parameter above.</div>
                ) : (
                    <Plot
                        data={[{
                            type: 'bar',
                            x: hist.bins,
                            y: hist.counts,
                            marker: { color: '#f59e0b' },
                            hovertemplate: 'Value: %{x:.4f}<br>Count: %{y}<extra></extra>',
                        }]}
                        layout={{
                            ...LAYOUT_BASE,
                            height: 240,
                            xaxis: { ...AXIS_STYLE, title: { text: selected, font: { size: 10 } } },
                            yaxis: { ...AXIS_STYLE, title: { text: 'Count', font: { size: 10 } } },
                            bargap: 0.05,
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%' }}
                    />
                )}
            </div>
        </div>
    );
}

function RelationsTab({
    allParams, paramKeys, scatterX, scatterY, onSetX, onSetY
}: {
    allParams: Record<string, (number | null)[]>;
    paramKeys: string[];
    scatterX: string;
    scatterY: string;
    onSetX: (v: string) => void;
    onSetY: (v: string) => void;
}) {
    const dataPoints = useMemo(() => {
        const xArr = allParams[scatterX] || [];
        const yArr = allParams[scatterY] || [];
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < xArr.length; i++) {
            if (xArr[i] !== null && yArr[i] !== null) {
                pts.push({ x: xArr[i] as number, y: yArr[i] as number });
            }
        }
        return pts;
    }, [allParams, scatterX, scatterY]);

    return (
        <div className="flex flex-col gap-4 max-w-3xl mx-auto">
            <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500">X Axis:</span>
                    <select
                        className="text-[11px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none"
                        value={scatterX}
                        onChange={e => onSetX(e.target.value)}
                    >
                        {paramKeys.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500">Y Axis:</span>
                    <select
                        className="text-[11px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none"
                        value={scatterY}
                        onChange={e => onSetY(e.target.value)}
                    >
                        {paramKeys.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <Plot
                    data={[{
                        x: dataPoints.map(p => p.x),
                        y: dataPoints.map(p => p.y),
                        mode: 'markers',
                        type: 'scatter',
                        marker: { color: '#10b981', size: 6, opacity: 0.7 },
                        hovertemplate: 'X: %{x:.2f}<br>Y: %{y:.2f}<extra></extra>',
                    }]}
                    layout={{
                        ...LAYOUT_BASE,
                        height: 300,
                        xaxis: { ...AXIS_STYLE, title: { text: scatterX, font: { size: 10 } } },
                        yaxis: { ...AXIS_STYLE, title: { text: scatterY, font: { size: 10 } } },
                    }}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: '100%' }}
                />
            </div>
        </div>
    );
}

function MapsTab({
    allParams, paramKeys, mapWidth, mapHeight
}: {
    allParams: Record<string, (number | null)[]>;
    paramKeys: string[];
    mapWidth: number;
    mapHeight: number;
}) {
    const [selected, setSelected] = useState<string>(paramKeys[0] || '');

    const zMatrix = useMemo(() => {
        const flat = allParams[selected] || [];
        const matrix: (number | null)[][] = [];
        for (let r = 0; r < mapHeight; r++) {
            const row: (number | null)[] = [];
            for (let c = 0; c < mapWidth; c++) {
                const idx = r * mapWidth + c;
                row.push(flat[idx] ?? null);
            }
            matrix.push(row);
        }
        return matrix;
    }, [allParams, selected, mapWidth, mapHeight]);

    return (
        <div className="flex flex-col gap-4 max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Mapping Parameter:</span>
                <select
                    className="text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1 outline-none text-slate-700 cursor-pointer transition-colors"
                    value={selected}
                    onChange={e => setSelected(e.target.value)}
                >
                    {paramKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-center">
                <Plot
                    data={[{
                        z: zMatrix,
                        type: 'heatmap',
                        colorscale: 'Viridis',
                        showscale: true,
                        connectgaps: true,
                        hoverongaps: false,
                        hovertemplate: 'X: %{x}<br>Y: %{y}<br>Value: %{z:.4f}<extra></extra>',
                    }]}
                    layout={{
                        ...LAYOUT_BASE,
                        height: 380,
                        width: 500,
                        xaxis: { ...AXIS_STYLE, title: { text: 'X Position', font: { size: 10 } } },
                        yaxis: { ...AXIS_STYLE, title: { text: 'Y Position', font: { size: 10 } } },
                    }}
                    config={{ displayModeBar: false, responsive: true }}
                />
            </div>
        </div>
    );
}

// Helper to build statistical histograms
function buildHistogram(values: number[], nBins: number) {
    if (values.length === 0) return { bins: [], counts: [] };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / nBins || 1.0;
    
    const bins = new Array(nBins).fill(0).map((_, i) => min + i * binWidth + binWidth / 2);
    const counts = new Array(nBins).fill(0);

    values.forEach(v => {
        let binIdx = Math.floor((v - min) / binWidth);
        if (binIdx >= nBins) binIdx = nBins - 1;
        if (binIdx < 0) binIdx = 0;
        counts[binIdx]++;
    });

    return { bins, counts };
}

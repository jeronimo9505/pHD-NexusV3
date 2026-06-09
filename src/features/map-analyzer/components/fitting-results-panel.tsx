'use client';

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import {
    BarChart2,
    Zap,
    GitBranch,
    Map,
    Eye,
    Search,
    AlertCircle,
    Loader2,
    ChevronRight,
    Maximize2,
    X,
    Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export interface FittingMapFitResult {
    n_spectra: number;
    success_count: number;
    results: Record<string, Record<string, number> | { success: boolean; reason: string }>;
}

type Tab = 'distributions' | 'quality' | 'relations' | 'maps' | 'inspect';

interface Props {
    result: FittingMapFitResult;
    mapWidth: number;
    mapHeight: number;
    peakNames: string[];
    vaultRoot?: string;
    h5Path?: string;
    peaks?: any[];
    baselineMethod?: string;
    baselineParams?: any;
    xShift?: number;
    cropRange?: [number, number] | null;
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

export function FittingResultsPanel({
    result,
    mapWidth,
    mapHeight,
    peakNames,
    vaultRoot,
    h5Path,
    peaks,
    baselineMethod,
    baselineParams,
    xShift,
    cropRange
}: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('quality');
    const [scatterX, setScatterX] = useState<string>('');
    const [scatterY, setScatterY] = useState<string>('');
    const [isExplorerOpen, setIsExplorerOpen] = useState(false);

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
        
        // Initialize arrays (robust fallback to result.n_spectra or key counts if dimensions are empty/0)
        const nTotal = result.n_spectra || (mapWidth * mapHeight) || Object.keys(result.results).length || 1;
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

    // Keep scatter selection in sync with parameter keys cleanly
    useEffect(() => {
        if (paramKeys.length > 0) {
            setScatterX(prev => paramKeys.includes(prev) ? prev : paramKeys[0]);
            setScatterY(prev => paramKeys.includes(prev) ? prev : paramKeys[Math.min(1, paramKeys.length - 1)]);
        }
    }, [paramKeys]);

    // KPI stats
    const stats = useMemo(() => {
        const r2s = (allParams['r_squared'] || []).filter(v => v !== null) as number[];
        const meanR2 = r2s.length > 0 ? r2s.reduce((a,b)=>a+b, 0) / r2s.length : 0.0;
        const p95 = r2s.length > 0 ? (r2s.filter(v=>v>=0.95).length / r2s.length) * 100 : 0.0;
        const p99 = r2s.length > 0 ? (r2s.filter(v=>v>=0.99).length / r2s.length) * 100 : 0.0;
        return { meanR2, p95, p99 };
    }, [allParams]);

    const issueStats = useMemo(() => {
        const failed = Math.max(0, result.n_spectra - result.success_count);
        const r2s = allParams['r_squared'] || [];
        const lowQuality = r2s.filter(v => v !== null && v < 0.95).length;
        return { failed, lowQuality };
    }, [result.n_spectra, result.success_count, allParams]);

    const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'quality',       label: 'Fit Quality',    icon: <Zap size={12} /> },
        { id: 'distributions', label: 'Distributions',  icon: <BarChart2 size={12} /> },
        { id: 'relations',     label: 'Relations',      icon: <GitBranch size={12} /> },
        { id: 'maps',          label: 'Parameter Maps', icon: <Map size={12} /> },
        { id: 'inspect',       label: 'Inspect Fits',   icon: <Eye size={12} /> },
    ];

    const renderActiveTab = (expanded = false) => (
        <>
            {activeTab === 'quality' && (
                <QualityTab r_squared_map={allParams['r_squared'] || []} expanded={expanded} />
            )}
            {activeTab === 'distributions' && (
                <DistributionsTab allParams={allParams} paramKeys={paramKeys} expanded={expanded} />
            )}
            {activeTab === 'relations' && (
                <RelationsTab
                    allParams={allParams}
                    paramKeys={paramKeys}
                    scatterX={scatterX}
                    scatterY={scatterY}
                    onSetX={setScatterX}
                    onSetY={setScatterY}
                    expanded={expanded}
                />
            )}
            {activeTab === 'maps' && (
                <MapsTab
                    allParams={allParams}
                    paramKeys={paramKeys}
                    mapWidth={mapWidth}
                    mapHeight={mapHeight}
                    expanded={expanded}
                />
            )}
            {activeTab === 'inspect' && (
                <InspectTab
                    result={result}
                    mapWidth={mapWidth}
                    mapHeight={mapHeight}
                    vaultRoot={vaultRoot}
                    h5Path={h5Path}
                    peaks={peaks}
                    baselineMethod={baselineMethod}
                    baselineParams={baselineParams}
                    xShift={xShift}
                    cropRange={cropRange}
                    expanded={expanded}
                />
            )}
        </>
    );

    return (
        <>
        <div className="flex flex-col h-full bg-white">
            <div className="px-6 pt-4 pb-3 border-b border-slate-100 shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">
                            Fitting Results - {result.success_count}/{result.n_spectra} spectra successfully fitted
                        </h3>
                        {(issueStats.failed > 0 || issueStats.lowQuality > 0) && (
                            <div className="mt-1 flex items-center gap-2 text-[10px] font-bold text-amber-600">
                                <AlertCircle size={11} />
                                {issueStats.failed} failed, {issueStats.lowQuality} low-quality fits need inspection
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex gap-3">
                            <KPI label="R2 mean" value={stats.meanR2.toFixed(4)} highlight={stats.meanR2 > 0.98} />
                            <KPI label="R2 > 0.95" value={`${stats.p95.toFixed(1)}%`} highlight={stats.p95 > 90} />
                            <KPI label="R2 > 0.99" value={`${stats.p99.toFixed(1)}%`} highlight={stats.p99 > 75} />
                        </div>
                        <button
                            onClick={() => {
                                setActiveTab('inspect');
                                setIsExplorerOpen(true);
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black transition-colors shadow-sm"
                            title="Open detailed fit map results in a larger workspace"
                        >
                            <Maximize2 size={12} /> Details
                        </button>
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
                {renderActiveTab(false)}
            </div>
        </div>
        {isExplorerOpen && createPortal(
            <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm p-5 animate-in fade-in duration-200">
                <div className="h-full w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                                <Activity size={18} />
                            </div>
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Fit Map Results Explorer</div>
                                <h2 className="text-lg font-black text-slate-900 leading-tight">
                                    {result.success_count}/{result.n_spectra} spectra fitted
                                </h2>
                                <p className="text-xs text-slate-500 font-medium">
                                    Inspect failed spectra, low R2 cases, parameters, residuals and per-spectrum refits.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <KPI label="failed" value={String(issueStats.failed)} highlight={issueStats.failed === 0} />
                            <KPI label="low R2" value={String(issueStats.lowQuality)} highlight={issueStats.lowQuality === 0} />
                            <KPI label="R2 mean" value={stats.meanR2.toFixed(4)} highlight={stats.meanR2 > 0.98} />
                            <button
                                onClick={() => setIsExplorerOpen(false)}
                                className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
                                title="Close detailed fit results"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="px-6 py-3 border-b border-slate-100 shrink-0 flex items-center justify-between">
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

                    <div className="flex-1 min-h-0 overflow-auto p-5 bg-white">
                        {renderActiveTab(true)}
                    </div>
                </div>
            </div>,
            document.body
        )}
        </>
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

function QualityTab({ r_squared_map, expanded = false }: { r_squared_map: (number | null)[]; expanded?: boolean }) {
    const validR2 = r_squared_map.filter(v => v !== null) as number[];
    const hist = buildHistogram(validR2, 30);

    return (
        <div className={cn("bg-slate-50 rounded-2xl p-4 border border-slate-100 mx-auto mt-4", expanded ? "max-w-5xl" : "max-w-2xl")}>
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
                        height: expanded ? 520 : 250,
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

function DistributionsTab({ allParams, paramKeys, expanded = false }: { allParams: Record<string, (number | null)[]>; paramKeys: string[]; expanded?: boolean }) {
    const [selected, setSelected] = useState<string>('');

    // Sync selected state when parameter keys load or update
    useEffect(() => {
        if (paramKeys.length > 0) {
            setSelected(prev => paramKeys.includes(prev) ? prev : paramKeys[0]);
        }
    }, [paramKeys]);

    const validData = (allParams[selected] || []).filter(v => v !== null) as number[];
    const hist = buildHistogram(validData, 30);

    return (
        <div className={cn("flex flex-col gap-4 mx-auto mt-2", expanded ? "max-w-5xl" : "max-w-2xl")}>
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
                            height: expanded ? 520 : 240,
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
    allParams, paramKeys, scatterX, scatterY, onSetX, onSetY, expanded = false
}: {
    allParams: Record<string, (number | null)[]>;
    paramKeys: string[];
    scatterX: string;
    scatterY: string;
    onSetX: (v: string) => void;
    onSetY: (v: string) => void;
    expanded?: boolean;
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
        <div className={cn("flex flex-col gap-4 mx-auto", expanded ? "max-w-6xl" : "max-w-3xl")}>
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
                        height: expanded ? 560 : 300,
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
    allParams, paramKeys, mapWidth, mapHeight, expanded = false
}: {
    allParams: Record<string, (number | null)[]>;
    paramKeys: string[];
    mapWidth: number;
    mapHeight: number;
    expanded?: boolean;
}) {
    const [selected, setSelected] = useState<string>('');

    // Sync selected parameter state
    useEffect(() => {
        if (paramKeys.length > 0) {
            setSelected(prev => paramKeys.includes(prev) ? prev : paramKeys[0]);
        }
    }, [paramKeys]);

    const zMatrix = useMemo(() => {
        const flat = allParams[selected] || [];
        
        // Defensive dimensions fallback if they are 0/invalid in file metadata
        let cols = mapWidth;
        let rows = mapHeight;
        if ((cols <= 0 || rows <= 0) && flat.length > 0) {
            cols = Math.ceil(Math.sqrt(flat.length));
            rows = Math.ceil(flat.length / cols);
        }
        
        const matrix: (number | null)[][] = [];
        for (let r = 0; r < rows; r++) {
            const row: (number | null)[] = [];
            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                row.push(flat[idx] ?? null);
            }
            matrix.push(row);
        }
        return matrix;
    }, [allParams, selected, mapWidth, mapHeight]);

    return (
        <div className={cn("flex flex-col gap-4 mx-auto", expanded ? "max-w-6xl" : "max-w-4xl")}>
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
                        height: expanded ? 620 : 380,
                        width: expanded ? 900 : 500,
                        xaxis: { ...AXIS_STYLE, title: { text: 'X Position', font: { size: 10 } } },
                        yaxis: { ...AXIS_STYLE, title: { text: 'Y Position', font: { size: 10 } } },
                    }}
                    config={{ displayModeBar: false, responsive: true }}
                />
            </div>
        </div>
    );
}

interface InspectTabProps {
    result: FittingMapFitResult;
    mapWidth: number;
    mapHeight: number;
    vaultRoot?: string;
    h5Path?: string;
    peaks?: any[];
    baselineMethod?: string;
    baselineParams?: any;
    xShift?: number;
    cropRange?: [number, number] | null;
    expanded?: boolean;
}

function InspectTab({
    result,
    mapWidth,
    mapHeight,
    vaultRoot,
    h5Path,
    peaks,
    baselineMethod = 'none',
    baselineParams = {},
    xShift = 0,
    cropRange = null,
    expanded = false
}: InspectTabProps) {
    const [search, setSearch] = useState('');
    const [filterFailedOnly, setFilterFailedOnly] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [pixelFit, setPixelFit] = useState<any | null>(null);
    const [isLoadingFit, setIsLoadingFit] = useState(false);
    const [fitError, setFitError] = useState<string | null>(null);

    // Generate list of all indices
    const list = useMemo(() => {
        const items = [];
        const width = mapWidth > 0
            ? mapWidth
            : mapHeight > 0
                ? Math.ceil((result.n_spectra || 1) / mapHeight)
                : Math.ceil(Math.sqrt(result.n_spectra || 1));
        for (let i = 0; i < result.n_spectra; i++) {
            const val = result.results[String(i)];
            const success = val && !('success' in val);
            const r2 = success ? (val as any).r_squared : null;
            const reason = val && 'success' in val ? (val as any).reason : '';
            const isLowQuality = success && r2 !== null && r2 < 0.95;
            
            items.push({
                index: i,
                x: width > 0 ? i % width : i,
                y: width > 0 ? Math.floor(i / width) : 0,
                success,
                r2,
                reason,
                issue: !success ? 'failed' : isLowQuality ? 'low-quality' : 'pass'
            });
        }
        return items;
    }, [result, mapWidth, mapHeight]);

    const inspectStats = useMemo(() => {
        const failed = list.filter(item => item.issue === 'failed').length;
        const lowQuality = list.filter(item => item.issue === 'low-quality').length;
        const pass = list.length - failed - lowQuality;
        const worstR2 = list
            .filter(item => item.r2 !== null)
            .sort((a, b) => (a.r2 as number) - (b.r2 as number))[0] || null;
        return { failed, lowQuality, pass, worstR2 };
    }, [list]);

    useEffect(() => {
        if (selectedIdx !== null || list.length === 0) return;
        const firstProblem = list.find(item => item.issue === 'failed') || list.find(item => item.issue === 'low-quality') || inspectStats.worstR2 || list[0];
        setSelectedIdx(firstProblem.index);
    }, [list, selectedIdx, inspectStats.worstR2]);

    // Filter items based on search and checkbox
    const filteredList = useMemo(() => {
        return list.filter(item => {
            // Search filter
            const matchesSearch = search.trim() === '' || String(item.index).includes(search);
            
            // Failed only filter: failed OR r2 < 0.95
            const isFailed = !item.success || (item.r2 !== null && item.r2 < 0.95);
            const matchesFailed = !filterFailedOnly || isFailed;
            
            return matchesSearch && matchesFailed;
        });
    }, [list, search, filterFailedOnly]);

    // Fetch fit for selected spectrum index
    useEffect(() => {
        if (selectedIdx === null || !vaultRoot || !h5Path) {
            setPixelFit(null);
            return;
        }

        let active = true;
        const fetchFit = async () => {
            setIsLoadingFit(true);
            setFitError(null);
            try {
                const res = await fetch('http://127.0.0.1:8888/api/fitting/fit-pixel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vault_root: vaultRoot,
                        h5_relative_path: h5Path,
                        spectrum_index: selectedIdx,
                        peaks: peaks || [],
                        baseline_method: baselineMethod,
                        baseline_params: baselineParams,
                        x_shift: xShift,
                        crop_range: cropRange
                    })
                });
                const data = await res.json();
                if (active) {
                    if (res.ok && data.success !== false) {
                        setPixelFit(data);
                    } else {
                        setFitError(data.message || data.detail || 'Fitting failed to converge');
                        setPixelFit(data);
                    }
                }
            } catch (err: any) {
                if (active) {
                    setFitError(err.message || 'Connection failed');
                }
            } finally {
                if (active) {
                    setIsLoadingFit(false);
                }
            }
        };

        fetchFit();
        return () => {
            active = false;
        };
    }, [selectedIdx, vaultRoot, h5Path, peaks, baselineMethod, baselineParams, xShift, cropRange]);

    // Render Plotly for selected pixel
    const plotlyTraces = useMemo(() => {
        if (!pixelFit || !pixelFit.original) return [];
        const traces: any[] = [];
        const fitX = pixelFit.original.map((p: any) => p.x);

        const useBaseline = baselineMethod !== 'none';

        if (!useBaseline) {
            // 1. Plot raw spectrum as solid line
            traces.push({
                x: fitX,
                y: pixelFit.original.map((p: any) => p.y),
                mode: 'lines',
                name: 'Spectrum',
                line: { color: '#3b82f6', width: 1.5 }
            });
        } else {
            // 1. Original spectrum (raw reference, dotted slate)
            traces.push({
                x: fitX,
                y: pixelFit.original.map((p: any) => p.y),
                mode: 'lines',
                name: 'Original',
                line: { color: '#64748b', width: 1, dash: 'dot' }
            });

            // 2. Baseline
            if (pixelFit.baseline) {
                traces.push({
                    x: fitX,
                    y: pixelFit.baseline.map((p: any) => p.y),
                    mode: 'lines',
                    name: 'Baseline',
                    line: { color: '#f59e0b', width: 1.5 }
                });
            }

            // 3. Corrected
            if (pixelFit.corrected) {
                traces.push({
                    x: fitX,
                    y: pixelFit.corrected.map((p: any) => p.y),
                    mode: 'lines',
                    name: 'Corrected',
                    line: { color: '#3b82f6', width: 1.5 }
                });
            }
        }

        // 4. Best Fit Envelope (always plot if available, even if fit failed to converge)
        if (pixelFit.best_fit) {
            traces.push({
                x: fitX,
                y: pixelFit.best_fit.map((p: any) => p.y),
                mode: 'lines',
                name: 'Best Fit',
                line: { color: '#ef4444', width: 2 }
            });

            // Components
            if (pixelFit.components) {
                Object.entries(pixelFit.components).forEach(([compName, compPts]: [string, any], idx) => {
                    const color = PLOTLY_COLORS[idx % PLOTLY_COLORS.length];
                    traces.push({
                        x: fitX,
                        y: compPts.map((p: any) => p.y),
                        mode: 'lines',
                        fill: 'tozeroy',
                        fillcolor: `${color}10`,
                        name: compName.replace('_', ' '),
                        line: { color, width: 1 }
                    });
                });
            }
        }

        // 5. Residuals (offset at bottom, always plot if available)
        if (pixelFit.residuals) {
            const referenceSpectrum = useBaseline ? (pixelFit.corrected || pixelFit.original) : pixelFit.original;
            const maxVal = Math.max(...referenceSpectrum.map((p: any) => p.y));
            traces.push({
                x: fitX,
                y: pixelFit.residuals.map((p: any) => p.y - (0.15 * maxVal)),
                mode: 'lines',
                name: 'Residuals',
                line: { color: '#10b981', width: 1 }
            });
        }

        return traces;
    }, [pixelFit, baselineMethod]);

    const selectedItem = selectedIdx !== null ? list.find(item => item.index === selectedIdx) : null;
    const chartHeight = expanded ? 520 : 220;

    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-3">
                <InspectorStat label="Failed fits" value={inspectStats.failed} tone={inspectStats.failed > 0 ? 'red' : 'green'} />
                <InspectorStat label="Low R2 fits" value={inspectStats.lowQuality} tone={inspectStats.lowQuality > 0 ? 'amber' : 'green'} />
                <InspectorStat label="Passing fits" value={inspectStats.pass} tone="green" />
                <InspectorStat
                    label="Worst R2"
                    value={inspectStats.worstR2?.r2 !== null && inspectStats.worstR2?.r2 !== undefined ? inspectStats.worstR2.r2.toFixed(4) : '-'}
                    tone={inspectStats.worstR2?.r2 !== null && inspectStats.worstR2?.r2 !== undefined && inspectStats.worstR2.r2 < 0.95 ? 'amber' : 'slate'}
                />
            </div>

        <div className={cn(
            "flex border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50",
            expanded ? "h-[calc(100vh-285px)] min-h-[560px]" : "h-[320px]"
        )}>
            {/* Left side list */}
            <div className="w-80 border-r border-slate-100 flex flex-col bg-white shrink-0">
                <div className="p-3 border-b border-slate-50 flex flex-col gap-2 shrink-0">
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search spectrum index..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-100 rounded-xl text-xs font-medium placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white transition-all"
                        />
                    </div>
                    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={filterFailedOnly}
                            onChange={e => setFilterFailedOnly(e.target.checked)}
                            className="rounded border-slate-200 accent-indigo-600 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Low Quality / Failed Fits (R² &lt; 0.95)</span>
                    </label>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                    {filteredList.length === 0 ? (
                        <div className="text-center py-10 text-[11px] text-slate-400">No matching spectra found.</div>
                    ) : (
                        filteredList.map(item => {
                            const isSelected = selectedIdx === item.index;
                            const isLowQuality = item.success && item.r2 !== null && item.r2 < 0.95;
                            return (
                                <button
                                    key={item.index}
                                    onClick={() => setSelectedIdx(item.index)}
                                    className={cn(
                                        "w-full text-left px-4 py-2.5 flex items-center justify-between text-xs transition-colors",
                                        isSelected 
                                            ? "bg-indigo-50/80 text-indigo-700" 
                                            : "hover:bg-slate-50 text-slate-700"
                                    )}
                                >
                                    <div className="flex flex-col gap-0.5">
                                        <span className="font-bold text-slate-800">Spectrum #{item.index}</span>
                                        <span className="text-[9px] font-mono text-slate-400">Map X:{item.x} Y:{item.y}</span>
                                        {item.success ? (
                                            <span className={cn(
                                                "text-[10px] font-mono",
                                                isLowQuality ? "text-amber-500 font-bold" : "text-slate-400"
                                            )}>
                                                R²: {item.r2?.toFixed(4)}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                                                <AlertCircle size={10} />
                                                {item.reason || 'Failed'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {item.success ? (
                                            isLowQuality ? (
                                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100">Low Quality</span>
                                            ) : (
                                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">Pass</span>
                                            )
                                        ) : (
                                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-red-50 text-red-700 border border-red-100">Fail</span>
                                        )}
                                        <ChevronRight size={12} className={isSelected ? "text-indigo-500" : "text-slate-300"} />
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Right side detail chart & parameters */}
            <div className="flex-1 flex flex-col bg-white overflow-hidden p-4">
                {selectedIdx === null ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                        <Eye size={24} className="text-slate-300" />
                        Select a spectrum from the list to inspect its fit details.
                        {!vaultRoot || !h5Path ? (
                            <span className="text-[10px] text-amber-500 font-bold">Spectrum refit needs vault and H5 path context.</span>
                        ) : null}
                    </div>
                ) : isLoadingFit ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                        <Loader2 size={24} className="animate-spin text-indigo-500" />
                        Fitting spectrum #{selectedIdx}...
                    </div>
                ) : fitError && !pixelFit ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-xs text-red-500 gap-2 p-6 text-center">
                        <AlertCircle size={24} className="text-red-500" />
                        <span className="font-bold">Solver Error</span>
                        <p className="text-slate-500 text-[11px] leading-relaxed max-w-sm">{fitError}</p>
                    </div>
                ) : pixelFit ? (
                    <div className="flex-1 flex overflow-hidden gap-4 min-h-0">
                        {/* Chart Area */}
                        <div className="flex-1 flex flex-col justify-center min-w-0">
                            <div className="flex items-center justify-between mb-2 shrink-0 gap-3">
                                <div>
                                    <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                                        Spectrum #{selectedIdx} Fit Visualization
                                    </h4>
                                    {selectedItem && (
                                        <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold text-slate-400">
                                            <span>Map X:{selectedItem.x} Y:{selectedItem.y}</span>
                                            <span className="text-slate-300">|</span>
                                            <span className={cn(
                                                selectedItem.issue === 'failed' ? "text-red-500" : selectedItem.issue === 'low-quality' ? "text-amber-500" : "text-emerald-600"
                                            )}>
                                                {selectedItem.issue === 'failed' ? 'Failed fit' : selectedItem.issue === 'low-quality' ? 'Low R2 fit' : 'Passing fit'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                {fitError && (
                                    <span className="text-[10px] text-red-500 font-bold bg-red-50 border border-red-150 px-2 py-0.5 rounded-md flex items-center gap-1">
                                        <AlertCircle size={10} />
                                        {fitError}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 min-h-0 relative border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50">
                                <Plot
                                    data={plotlyTraces}
                                    layout={{
                                        ...LAYOUT_BASE,
                                        margin: { l: 45, r: 10, t: 10, b: 30 },
                                    }}
                                    config={{ displayModeBar: false, responsive: true }}
                                    useResizeHandler={true}
                                    style={{ width: '100%', height: '100%' }}
                                />
                            </div>
                        </div>

                        {/* Parameter Details Panel */}
                        {pixelFit.parameters && (
                            <div className="w-64 flex flex-col border border-slate-100 rounded-xl overflow-hidden shrink-0">
                                <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 flex items-center justify-between shrink-0">
                                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Parameters</span>
                                    {pixelFit.metrics?.r_squared !== undefined && (
                                        <span className="text-[10px] font-mono font-bold text-indigo-600">R²: {pixelFit.metrics.r_squared.toFixed(5)}</span>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto divide-y divide-slate-50 text-[11px]">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/30 text-[9px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-50">
                                                <th className="px-3 py-1.5 font-bold">Name</th>
                                                <th className="px-3 py-1.5 text-right font-bold">Value</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 font-mono text-[10px]">
                                            {pixelFit.parameters.map((p: any) => (
                                                <tr key={p.name} className="hover:bg-slate-50/50 text-slate-700">
                                                    <td className="px-3 py-1.5 font-sans font-medium text-slate-500 truncate max-w-[120px]" title={p.name}>
                                                        {p.name.replace(/_/g, ' ')}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right font-bold">
                                                        {p.value !== null ? p.value.toFixed(2) : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
        </div>
    );
}

function InspectorStat({ label, value, tone }: { label: string; value: string | number; tone: 'red' | 'amber' | 'green' | 'slate' }) {
    const toneClass = {
        red: 'bg-red-50 border-red-100 text-red-700',
        amber: 'bg-amber-50 border-amber-100 text-amber-700',
        green: 'bg-emerald-50 border-emerald-100 text-emerald-700',
        slate: 'bg-slate-50 border-slate-100 text-slate-700',
    }[tone];

    return (
        <div className={cn("rounded-xl border px-3 py-2", toneClass)}>
            <div className="text-[9px] font-black uppercase tracking-widest opacity-70">{label}</div>
            <div className="mt-0.5 text-sm font-black">{value}</div>
        </div>
    );
}

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

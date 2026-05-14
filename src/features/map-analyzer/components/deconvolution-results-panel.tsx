'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { BarChart2, Zap, GitBranch, Map } from 'lucide-react';
import { cn } from '@/lib/utils';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export interface MapFitResult {
    n_spectra: number;
    results_per_peak: Record<string, {
        center_map: (number | null)[];
        fwhm_map: (number | null)[];
        area_map: (number | null)[];
        amplitude_map: (number | null)[];
    }>;
    r2_map: (number | null)[];
    rms_map: (number | null)[];
    global_metrics: {
        r2_mean: number;
        r2_std: number;
        r2_p95: number;
        r2_p99: number;
        rms_mean: number;
        n_success: number;
        n_total: number;
    };
}

type Tab = 'distributions' | 'quality' | 'relations' | 'maps';

interface Props {
    result: MapFitResult;
    mapWidth: number;
    mapHeight: number;
    peakNames: string[];
}

const PLOTLY_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f97316'];
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

export function DeconvolutionResultsPanel({ result, mapWidth, mapHeight, peakNames }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('quality');
    const [scatterX, setScatterX] = useState<string>('');
    const [scatterY, setScatterY] = useState<string>('');

    const allParams = useMemo(() => {
        const params: Record<string, (number | null)[]> = {};
        for (const [pname, data] of Object.entries(result.results_per_peak)) {
            params[`${pname} - Center (cm-1)`]  = data.center_map;
            params[`${pname} - FWHM (cm-1)`]    = data.fwhm_map;
            params[`${pname} - Area`]            = data.area_map;
            params[`${pname} - Amplitude`]       = data.amplitude_map;
        }
        params['R2 (fit quality)'] = result.r2_map;
        params['RMS residual']     = result.rms_map;
        return params;
    }, [result]);

    const paramKeys = Object.keys(allParams);

    if (!scatterX && paramKeys.length > 1) setScatterX(paramKeys[0]);
    if (!scatterY && paramKeys.length > 1) setScatterY(paramKeys[Math.min(1, paramKeys.length - 1)]);

    const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'quality',       label: 'Fit Quality',    icon: <Zap size={12} /> },
        { id: 'distributions', label: 'Distributions',  icon: <BarChart2 size={12} /> },
        { id: 'relations',     label: 'Relations',      icon: <GitBranch size={12} /> },
        { id: 'maps',          label: 'Parameter Maps', icon: <Map size={12} /> },
    ];

    const { global_metrics: gm } = result;

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="px-6 pt-4 pb-3 border-b border-slate-100 shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-800">Fit Results &mdash; {gm.n_success}/{gm.n_total} spectra fitted</h3>
                    <div className="flex gap-3">
                        <KPI label="R2 mean" value={gm.r2_mean.toFixed(4)} highlight={gm.r2_mean > 0.98} />
                        <KPI label="R2 > 0.95" value={`${gm.r2_p95.toFixed(1)}%`} highlight={gm.r2_p95 > 90} />
                        <KPI label="R2 > 0.99" value={`${gm.r2_p99.toFixed(1)}%`} highlight={gm.r2_p99 > 75} />
                        <KPI label="RMS mean" value={gm.rms_mean.toFixed(1)} />
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
                {activeTab === 'quality' && <QualityTab result={result} />}
                {activeTab === 'distributions' && <DistributionsTab result={result} peakNames={peakNames} />}
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
                    <MapsTab result={result} mapWidth={mapWidth} mapHeight={mapHeight} peakNames={peakNames} />
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
            <span className={cn("text-sm font-black", highlight ? "text-emerald-600" : "text-slate-700")}>{value}</span>
        </div>
    );
}

function QualityTab({ result }: { result: MapFitResult }) {
    const valid_r2  = result.r2_map.filter(v => v !== null) as number[];
    const valid_rms = result.rms_map.filter(v => v !== null) as number[];

    const r2Hist  = buildHistogram(valid_r2, 40);
    const rmsHist = buildHistogram(valid_rms, 40);

    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                <p className="text-[11px] font-bold text-slate-600 mb-2">R2 Distribution (all spectra)</p>
                <Plot
                    data={[{
                        type: 'bar',
                        x: r2Hist.bins,
                        y: r2Hist.counts,
                        marker: { color: valid_r2.map(v => v >= 0.99 ? '#10b981' : v >= 0.95 ? '#6366f1' : '#f59e0b') },
                        hovertemplate: 'R2: %{x:.4f}<br>Count: %{y}<extra></extra>',
                    }]}
                    layout={{
                        ...LAYOUT_BASE,
                        height: 200,
                        xaxis: { ...AXIS_STYLE, title: { text: 'R2', font: { size: 10 } }, range: [Math.max(0, Math.min(...valid_r2) - 0.01), 1.005] },
                        yaxis: { ...AXIS_STYLE, title: { text: 'Count', font: { size: 10 } } },
                        bargap: 0.05,
                        shapes: [
                            { type: 'line', x0: 0.95, x1: 0.95, y0: 0, y1: 1, yref: 'paper', line: { color: '#6366f1', dash: 'dot', width: 1 } } as any,
                            { type: 'line', x0: 0.99, x1: 0.99, y0: 0, y1: 1, yref: 'paper', line: { color: '#10b981', dash: 'dot', width: 1 } } as any,
                        ],
                        annotations: [
                            { x: 0.95, y: 1.05, yref: 'paper', text: '0.95', showarrow: false, font: { size: 9, color: '#6366f1' } } as any,
                            { x: 0.99, y: 1.05, yref: 'paper', text: '0.99', showarrow: false, font: { size: 9, color: '#10b981' } } as any,
                        ],
                    } as any}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: '100%' }}
                />
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                <p className="text-[11px] font-bold text-slate-600 mb-2">RMS Residual Distribution</p>
                <Plot
                    data={[{
                        type: 'bar',
                        x: rmsHist.bins,
                        y: rmsHist.counts,
                        marker: { color: '#f59e0b' },
                        hovertemplate: 'RMS: %{x:.2f}<br>Count: %{y}<extra></extra>',
                    }]}
                    layout={{
                        ...LAYOUT_BASE,
                        height: 200,
                        xaxis: { ...AXIS_STYLE, title: { text: 'RMS residual', font: { size: 10 } } },
                        yaxis: { ...AXIS_STYLE, title: { text: 'Count', font: { size: 10 } } },
                        bargap: 0.05,
                    } as any}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: '100%' }}
                />
            </div>

            <div className="col-span-2 bg-slate-50 rounded-2xl p-3 border border-slate-100">
                <p className="text-[11px] font-bold text-slate-600 mb-1">R2 per Spectrum (sorted)</p>
                <p className="text-[10px] text-slate-400 mb-2">Points below dashed lines indicate spectra where the fit was poor.</p>
                <Plot
                    data={[{
                        type: 'scatter',
                        mode: 'markers',
                        x: Array.from({ length: valid_r2.length }, (_, i) => i),
                        y: [...valid_r2].sort((a, b) => a - b),
                        marker: {
                            size: 4,
                            color: [...valid_r2].sort(),
                            colorscale: [
                                [0, '#ef4444'], [0.5, '#f59e0b'], [0.95, '#6366f1'], [1, '#10b981']
                            ],
                            showscale: true,
                            colorbar: { title: { text: 'R2' } as any, thickness: 10, len: 0.8 },
                        },
                        hovertemplate: 'Spectrum #%{x}<br>R2: %{y:.5f}<extra></extra>',
                    }]}
                    layout={{
                        ...LAYOUT_BASE,
                        height: 180,
                        xaxis: { ...AXIS_STYLE, title: { text: 'Spectrum index (sorted)', font: { size: 10 } } },
                        yaxis: { ...AXIS_STYLE, title: { text: 'R2', font: { size: 10 } }, range: [0, 1.01] },
                        shapes: [
                            { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0.95, y1: 0.95, line: { color: '#6366f1', dash: 'dot', width: 1 } } as any,
                            { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0.99, y1: 0.99, line: { color: '#10b981', dash: 'dot', width: 1 } } as any,
                        ],
                    } as any}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: '100%' }}
                />
            </div>
        </div>
    );
}

function DistributionsTab({ result, peakNames }: { result: MapFitResult; peakNames: string[] }) {
    const PROPS: Array<{ key: 'center_map' | 'fwhm_map' | 'area_map'; label: string; unit: string }> = [
        { key: 'center_map', label: 'Center Position', unit: 'cm-1' },
        { key: 'fwhm_map',   label: 'FWHM',            unit: 'cm-1' },
        { key: 'area_map',   label: 'Area',             unit: 'a.u.' },
    ];

    return (
        <div className="flex flex-col gap-4">
            {PROPS.map(({ key, label, unit }) => (
                <div key={key} className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                    <p className="text-[11px] font-bold text-slate-600 mb-2">{label} ({unit})</p>
                    <Plot
                        data={peakNames.map((name, idx) => {
                            const vals = (result.results_per_peak[name]?.[key] ?? []).filter(v => v !== null) as number[];
                            const hist = buildHistogram(vals, 30);
                            return {
                                type: 'bar' as const,
                                name,
                                x: hist.bins,
                                y: hist.counts,
                                marker: { color: PLOTLY_COLORS[idx % PLOTLY_COLORS.length], opacity: 0.75 },
                                hovertemplate: `<b>${name}</b><br>${label}: %{x:.2f} ${unit}<br>Count: %{y}<extra></extra>`,
                            };
                        })}
                        layout={{
                            ...LAYOUT_BASE,
                            height: 180,
                            barmode: 'overlay',
                            xaxis: { ...AXIS_STYLE, title: { text: unit, font: { size: 10 } } },
                            yaxis: { ...AXIS_STYLE, title: { text: 'Count', font: { size: 10 } } },
                            bargap: 0.05,
                            legend: { orientation: 'h', y: 1.1, font: { size: 10 } },
                        } as any}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%' }}
                    />
                    <div className="grid grid-cols-4 gap-2 mt-2">
                        {peakNames.map((name, idx) => {
                            const vals = (result.results_per_peak[name]?.[key] ?? []).filter(v => v !== null) as number[];
                            if (!vals.length) return null;
                            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
                            const sorted = [...vals].sort((a, b) => a - b);
                            const median = sorted[Math.floor(sorted.length / 2)];
                            const q1 = sorted[Math.floor(sorted.length * 0.25)];
                            const q3 = sorted[Math.floor(sorted.length * 0.75)];
                            return (
                                <div key={name} className="text-center bg-white rounded-xl p-2 border border-slate-100">
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PLOTLY_COLORS[idx % PLOTLY_COLORS.length] }} />
                                        <span className="text-[10px] font-bold text-slate-600">{name}</span>
                                    </div>
                                    <div className="text-[9px] text-slate-500 space-y-0.5">
                                        <div>mean = {mean.toFixed(2)}</div>
                                        <div>median = {median.toFixed(2)}</div>
                                        <div>IQR = {(q3 - q1).toFixed(2)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

function RelationsTab({
    allParams, paramKeys, scatterX, scatterY, onSetX, onSetY,
}: {
    allParams: Record<string, (number | null)[]>;
    paramKeys: string[];
    scatterX: string;
    scatterY: string;
    onSetX: (s: string) => void;
    onSetY: (s: string) => void;
}) {
    const xVals = allParams[scatterX] ?? [];
    const yVals = allParams[scatterY] ?? [];

    const pairs: { x: number; y: number }[] = [];
    for (let i = 0; i < xVals.length; i++) {
        if (xVals[i] !== null && yVals[i] !== null) {
            pairs.push({ x: xVals[i] as number, y: yVals[i] as number });
        }
    }

    const pearson = computePearson(pairs.map(p => p.x), pairs.map(p => p.y));

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-slate-400 font-semibold uppercase">X axis</span>
                    <select
                        value={scatterX}
                        onChange={e => onSetX(e.target.value)}
                        className="text-[11px] bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 outline-none font-medium text-slate-700 cursor-pointer max-w-[220px]"
                    >
                        {paramKeys.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-slate-400 font-semibold uppercase">Y axis</span>
                    <select
                        value={scatterY}
                        onChange={e => onSetY(e.target.value)}
                        className="text-[11px] bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 outline-none font-medium text-slate-700 cursor-pointer max-w-[220px]"
                    >
                        {paramKeys.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                </div>
                <div className={cn(
                    "flex flex-col items-center px-3 py-1.5 rounded-xl border text-center mt-4",
                    Math.abs(pearson) > 0.7 ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-slate-200"
                )}>
                    <span className="text-[9px] text-slate-400 font-semibold uppercase">Pearson r</span>
                    <span className={cn("text-sm font-black", Math.abs(pearson) > 0.7 ? "text-indigo-600" : "text-slate-600")}>
                        {pearson.toFixed(4)}
                    </span>
                </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                <Plot
                    data={[{
                        type: 'scattergl',
                        mode: 'markers',
                        x: pairs.map(p => p.x),
                        y: pairs.map(p => p.y),
                        marker: { size: 4, color: '#6366f1', opacity: 0.5 },
                        hovertemplate: `${scatterX}: %{x:.3f}<br>${scatterY}: %{y:.3f}<extra></extra>`,
                    }]}
                    layout={{
                        ...LAYOUT_BASE,
                        height: 340,
                        xaxis: { ...AXIS_STYLE, title: { text: scatterX, font: { size: 10 } } },
                        yaxis: { ...AXIS_STYLE, title: { text: scatterY, font: { size: 10 } } },
                        annotations: [{
                            xref: 'paper', yref: 'paper',
                            x: 0.98, y: 0.98,
                            text: `r = ${pearson.toFixed(4)}`,
                            showarrow: false,
                            font: { size: 11, color: '#6366f1', family: 'Inter' },
                            bgcolor: 'rgba(99,102,241,0.1)',
                            bordercolor: '#6366f1',
                            borderwidth: 1,
                            borderpad: 4,
                        } as any],
                    } as any}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: '100%' }}
                />
            </div>
        </div>
    );
}

function MapsTab({ result, mapWidth, mapHeight, peakNames }: {
    result: MapFitResult; mapWidth: number; mapHeight: number; peakNames: string[];
}) {
    const cols = Math.max(1, mapWidth);
    const rows = Math.max(1, mapHeight);

    const PROPS: Array<{ key: 'center_map' | 'fwhm_map' | 'area_map'; label: string }> = [
        { key: 'center_map', label: 'Center' },
        { key: 'fwhm_map',   label: 'FWHM' },
        { key: 'area_map',   label: 'Area' },
    ];

    const allMaps: Array<{ title: string; z: (number | null)[][] }> = [];

    for (const name of peakNames) {
        for (const { key, label } of PROPS) {
            const flat = result.results_per_peak[name]?.[key] ?? [];
            if (cols > 1 && rows > 1 && flat.length === cols * rows) {
                const z: (number | null)[][] = [];
                for (let r = 0; r < rows; r++) {
                    z.push(flat.slice(r * cols, r * cols + cols) as (number | null)[]);
                }
                allMaps.push({ title: `${name} - ${label}`, z });
            } else {
                allMaps.push({ title: `${name} - ${label}`, z: [] });
            }
        }
    }

    const r2flat = result.r2_map;
    if (cols > 1 && rows > 1 && r2flat.length === cols * rows) {
        const z: (number | null)[][] = [];
        for (let r = 0; r < rows; r++) z.push(r2flat.slice(r * cols, r * cols + cols) as (number | null)[]);
        allMaps.push({ title: 'R2 spatial', z });
    }

    return (
        <div className="grid grid-cols-3 gap-3">
            {allMaps.map(({ title, z }) => (
                <div key={title} className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-500 mb-2">{title}</p>
                    {z.length > 0 ? (
                        <Plot
                            data={[{
                                type: 'heatmap',
                                z,
                                colorscale: title.includes('R2') ? 'RdYlGn' : 'Viridis',
                                showscale: true,
                                colorbar: { thickness: 8, len: 0.85, tickfont: { size: 8 } } as any,
                            }]}
                            layout={{
                                ...LAYOUT_BASE,
                                height: 160,
                                margin: { l: 10, r: 50, t: 10, b: 10 },
                                xaxis: { visible: false },
                                yaxis: { visible: false, scaleanchor: 'x' },
                            } as any}
                            config={{ displayModeBar: false, responsive: true }}
                            style={{ width: '100%' }}
                        />
                    ) : (
                        <div className="text-center text-[10px] text-slate-400 py-4">
                            Map dimensions not available
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function buildHistogram(values: number[], bins: number): { bins: number[]; counts: number[] } {
    if (!values.length) return { bins: [], counts: [] };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const step = (max - min) / bins || 1;
    const counts = new Array(bins).fill(0);
    const binCenters = Array.from({ length: bins }, (_, i) => min + (i + 0.5) * step);
    for (const v of values) {
        const idx = Math.min(Math.floor((v - min) / step), bins - 1);
        counts[idx]++;
    }
    return { bins: binCenters, counts };
}

function computePearson(x: number[], y: number[]): number {
    if (x.length < 2) return 0;
    const n = x.length;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - mx, dy = y[i] - my;
        num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
    }
    return dx2 * dy2 > 0 ? num / Math.sqrt(dx2 * dy2) : 0;
}

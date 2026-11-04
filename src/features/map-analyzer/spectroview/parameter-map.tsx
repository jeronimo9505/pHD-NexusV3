'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { request } from './client';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
type MapResult = { metric: string; metrics: string[]; values: (number | null)[]; statuses: string[]; status_counts: Record<string, number>; valid_count: number; total: number; grid: { width: number; height: number } | null; coordinates: [number, number][] | null; coordinate_units: string | null };
const statusLabels: Record<string, string> = { pending: 'Pending', converged: 'Converged', evaluated: 'Fixed model evaluated', invalid_data: 'Invalid data', insufficient_points: 'Insufficient points', not_converged: 'Not converged', cancelled: 'Cancelled' };
const statusColors: Record<string, string> = { pending: '#94a3b8', converged: '#059669', evaluated: '#2563eb', invalid_data: '#dc2626', insufficient_points: '#d97706', not_converged: '#9333ea', cancelled: '#475569' };

export function ParameterMap({ vaultRoot, runId, completed, onSelect }: { vaultRoot: string; runId: string; completed: number; onSelect: (index: number) => void }) {
    const [metric, setMetric] = useState('r_squared');
    const [showStatus, setShowStatus] = useState(false);
    const [response, setResponse] = useState<{ key: string; value: MapResult } | null>(null);
    const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
    const queryKey = `${runId}:${metric}:${completed}`;
    const data = response?.key === queryKey ? response.value : null;
    const error = failure?.key === queryKey ? failure.message : '';
    useEffect(() => {
        const controller = new AbortController();
        void request<MapResult>('map', { vault_root: vaultRoot, run_id: runId, metric }, controller.signal).then(value => {
            if (!controller.signal.aborted) { setResponse({ key: queryKey, value }); setFailure(null); }
        }).catch(reason => { if (!controller.signal.aborted) setFailure({ key: queryKey, message: reason.message }); });
        return () => controller.abort();
    }, [vaultRoot, runId, completed, metric, queryKey]);

    const physical = Boolean(data?.coordinates);
    const spatial = physical || Boolean(data?.grid);
    const x = data?.values.map((_, i) => data.coordinates ? data.coordinates[i][0] : data.grid ? i % data.grid.width : i) ?? [];
    const y = data?.values.map((_, i) => data.coordinates ? data.coordinates[i][1] : data.grid ? Math.floor(i / data.grid.width) : 0) ?? [];
    const indices = data?.values.flatMap((value, i) => value === null ? [] : [i]) ?? [];
    const states = Object.keys(data?.status_counts ?? {});
    return <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Parameter map</h3><label className="flex items-center gap-2 text-xs">Parameter<select className="rounded-lg border border-slate-200 p-2" value={metric} onChange={event => setMetric(event.target.value)}>{(data?.metrics ?? [metric]).map(name => <option key={name}>{name}</option>)}</select></label></div>
        {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : data ? <>
            <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={showStatus} onChange={event => setShowStatus(event.target.checked)} />Show processing status · all spectra</label>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">{states.map(state => <span key={state} className="rounded bg-slate-50 px-2 py-1">{statusLabels[state] ?? state}: {data.status_counts[state]}</span>)}</div>
            <Plot className="w-full" data={showStatus ? states.map((state, stateIndex) => {
                const rows = data.statuses.flatMap((value, i) => value === state ? [i] : []);
                return { type: 'scattergl' as const, mode: 'markers' as const, name: statusLabels[state] ?? state,
                    x: rows.map(i => x[i]), y: rows.map(i => spatial ? y[i] : stateIndex), customdata: rows,
                    marker: { color: statusColors[state] ?? '#64748b', size: spatial ? 8 : 5, symbol: spatial ? 'square' : 'circle' },
                    hovertemplate: 'Spectrum %{customdata}<extra>%{fullData.name}</extra>' };
            }) : [{
                type: 'scattergl', mode: 'markers', x: indices.map(i => x[i]), y: indices.map(i => spatial ? y[i] : data.values[i]), customdata: indices,
                marker: { color: indices.map(i => data.values[i]!), colorscale: 'Viridis', showscale: true, size: spatial ? 8 : 4, symbol: spatial ? 'square' : 'circle', colorbar: { title: { text: metric }, thickness: 12 } },
                hovertemplate: 'Spectrum %{customdata}<br>x=%{x}<br>y=%{y}<br>value=%{marker.color}<extra></extra>',
            }]} layout={{ height: 340, margin: { l: showStatus && !spatial ? 135 : 55, r: 45, t: 20, b: 45 }, font: { size: 11, color: '#64748b' }, xaxis: { title: { text: physical ? `X (${data.coordinate_units ?? 'unknown units'})` : spatial ? 'Column index' : 'Spectrum index' } }, yaxis: { title: { text: physical ? `Y (${data.coordinate_units ?? 'unknown units'})` : spatial ? 'Row index' : showStatus ? '' : metric }, ...(showStatus && !spatial ? { tickmode: 'array' as const, tickvals: states.map((_, i) => i), ticktext: states.map(state => statusLabels[state] ?? state) } : {}) }, uirevision: `${runId}-${metric}-${showStatus}` }} config={{ responsive: true, displaylogo: false }} useResizeHandler onClick={event => {
                const index = Number(event.points[0]?.customdata);
                if (Number.isSafeInteger(index) && index >= 0 && index < data.total) onSelect(index);
            }} />
            <p className="text-xs text-slate-500">{showStatus ? `${data.total.toLocaleString()} spectra shown by processing status. Convergence does not establish scientific validity.` : `${data.valid_count.toLocaleString()} / ${data.total.toLocaleString()} parameter values shown. Switch to processing status to inspect failed or pending spectra.`} Click a point to inspect it.{!physical && spatial ? ' Grid indices are display positions, not calibrated coordinates.' : ''}</p>
        </> : <div className="flex h-80 items-center justify-center text-sm text-slate-400">Loading parameter map…</div>}
    </section>;
}

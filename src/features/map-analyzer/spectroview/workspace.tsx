'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Activity, Download, Play, Save, Square } from 'lucide-react';
import { ModelEditor, makePeak } from './model-editor';
import { ParameterMap } from './parameter-map';
import { SelectionPreview } from './selection-preview';
import { exportRun, request, type Capabilities, type Dataset, type Run, type Spec, type Spectrum, type Preview } from './client';
import { applyPreviewParameters, previewKey } from './preview-state';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const field = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm';
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40';
const emptySpec: Spec = { model: { peak_models: {} }, baseline: { mode: null, coef: 5, order_max: 3 }, fit_params: { loss: 'linear', fit_negative: false, coef_noise: 0, max_ite: 200 } };

export function SpectroviewWorkspace({ vaultRoot, h5Path }: { vaultRoot: string; h5Path: string }) {
    const [dataset, setDataset] = useState<Dataset | null>(null);
    const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
    const [spec, setSpec] = useState<Spec>(emptySpec);
    const [runs, setRuns] = useState<Run[]>([]);
    const [run, setRun] = useState<Run | null>(null);
    const [index, setIndex] = useState(0);
    const [spectrum, setSpectrum] = useState<Spectrum | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [initialPreview, setInitialPreview] = useState<{ key: string; value: Preview } | null>(null);
    const [fitPreview, setFitPreview] = useState<{ key: string; value: Preview } | null>(null);
    const [previewFailure, setPreviewFailure] = useState<{ key: string; message: string } | null>(null);
    const [showSaved, setShowSaved] = useState(false);
    const [subtractBaseline, setSubtractBaseline] = useState(false);
    const [showComponents, setShowComponents] = useState(true);
    const [clickAdd, setClickAdd] = useState(false);
    const alive = useRef(true);
    const draftKey = `spectroview-draft-v1:${vaultRoot}:${h5Path}`;
    const currentPreviewKey = previewKey(h5Path, index, spec);
    const fittedPreview = fitPreview?.key === currentPreviewKey ? fitPreview.value : null;
    const draftPreview = fittedPreview ?? (initialPreview?.key === currentPreviewKey ? initialPreview.value : null);
    const previewError = previewFailure?.key === currentPreviewKey ? previewFailure.message : '';

    useEffect(() => {
        if (!dataset || !capabilities || showSaved) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            void request<Preview>('preview', { vault_root: vaultRoot, h5_relative_path: h5Path, index, spec, mode: 'initial' }, controller.signal).then(value => {
                if (!controller.signal.aborted) { setInitialPreview({ key: currentPreviewKey, value }); setPreviewFailure(null); }
            }).catch(reason => { if (!controller.signal.aborted) setPreviewFailure({ key: currentPreviewKey, message: reason.message }); });
        }, 450);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [dataset, capabilities, showSaved, vaultRoot, h5Path, index, spec, currentPreviewKey]);

    useEffect(() => {
        alive.current = true;
        const controller = new AbortController();
        const source = { vault_root: vaultRoot, h5_relative_path: h5Path };
        void Promise.all([request<Dataset>('inspect', source, controller.signal), request<Capabilities>('capabilities', {}, controller.signal), request<Run[]>('runs', source, controller.signal)]).then(([data, caps, saved]) => {
            if (controller.signal.aborted) return;
            setDataset(data); setCapabilities(caps); setRuns(saved);
            const latest = saved[0] ?? null;
            setRun(latest);
            let restored: Spec | undefined;
            try {
                const draft = JSON.parse(localStorage.getItem(draftKey) ?? 'null');
                if (draft?.schema_version === 1 && draft.spec?.model?.peak_models) restored = draft.spec;
            } catch { /* A damaged UI draft never affects saved analyses. */ }
            setSpec(restored ?? latest?.spec ?? { ...emptySpec, crop: data.axis_range, model: { peak_models: { '0': { Lorentzian: makePeak('Lorentzian', caps.models.Lorentzian, (data.axis_range[0] + data.axis_range[1]) / 2) } } } });
        }).catch(reason => { if (!controller.signal.aborted) setError(String(reason.message)); });
        return () => { alive.current = false; controller.abort(); };
    }, [vaultRoot, h5Path, draftKey]);

    useEffect(() => {
        if (!dataset) return;
        try { localStorage.setItem(draftKey, JSON.stringify({ schema_version: 1, spec })); }
        catch { setError('Could not save the local draft. Use Save analysis to persist it in the vault.'); }
    }, [spec, dataset, draftKey]);

    const runId = run?.run_id;
    const completed = run?.completed;
    const active = Boolean(run?.worker_active);
    useEffect(() => {
        if (!runId || !active) return;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const updated = await request<Run>('status', { vault_root: vaultRoot, run_id: runId }, controller.signal);
                if (controller.signal.aborted) return;
                setRun(updated);
                setRuns(previous => previous.map(item => item.run_id === updated.run_id ? updated : item));
                if (updated.worker_active) timer = setTimeout(poll, 1200);
            } catch (reason) {
                if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'Could not read progress'); timer = setTimeout(poll, 3000); }
            }
        };
        void poll();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [runId, active, vaultRoot]);

    useEffect(() => {
        if (!dataset) return;
        const controller = new AbortController();
        setSpectrum(null);
        void request<Spectrum>('spectrum', { vault_root: vaultRoot, h5_relative_path: h5Path, index, run_id: runId }, controller.signal).then(data => {
            if (!controller.signal.aborted) setSpectrum(data);
        }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
        return () => controller.abort();
    }, [dataset, vaultRoot, h5Path, index, runId, completed]);

    async function action(operation: () => Promise<void>) {
        setBusy(true); setError('');
        try { await operation(); }
        catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Operation failed'); }
        finally { if (alive.current) setBusy(false); }
    }
    async function save(start: boolean) {
        if (start && !fittedPreview?.success) throw new Error('Fit and review the current spectrum before applying this model.');
        const saved = await request<Run>('create', { vault_root: vaultRoot, h5_relative_path: h5Path, spec });
        if (!alive.current) return;
        setRuns(previous => [saved, ...previous]); setRun(saved);
        if (start) {
            setShowSaved(true);
            const running = await request<Run>('start', { vault_root: vaultRoot, run_id: saved.run_id });
            if (alive.current) setRun(running);
        }
    }
    async function fitSelected() {
        const key = currentPreviewKey;
        setShowSaved(false);
        const value = await request<Preview>('preview', { vault_root: vaultRoot, h5_relative_path: h5Path, index, spec, mode: 'fit' });
        if (alive.current) { setFitPreview({ key, value }); setPreviewFailure(null); }
    }
    function addFromPlot(x: number, y: number) {
        if (!capabilities || !Number.isFinite(x) || !Number.isFinite(y)) return;
        const hints = makePeak('Lorentzian', capabilities.models.Lorentzian, x);
        let baseline = 0;
        if (!subtractBaseline && draftPreview) {
            const nearest = draftPreview.x.reduce((best, value, i, values) => Math.abs(value-x) < Math.abs(values[best]-x) ? i : best, 0);
            baseline = draftPreview.baseline[nearest] ?? 0;
        }
        hints.ampli.value = Math.max(0.001, y-baseline);
        setSpec(previous => ({ ...previous, model: { peak_models: { ...previous.model.peak_models, [String(Object.keys(previous.model.peak_models).length)]: { Lorentzian: hints } } } }));
        setShowSaved(false);
    }
    const dirty = run && JSON.stringify(spec) !== JSON.stringify(run.spec);
    const fit = showSaved ? spectrum?.fit : draftPreview;
    const previewComponents = showComponents ? fit?.components ?? [] : [];
    const center = dataset ? (dataset.axis_range[0] + dataset.axis_range[1]) / 2 : 1580;

    return <div className="flex h-full min-h-0 flex-col bg-slate-50 text-slate-800">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
            <div><h2 className="flex items-center gap-2 text-base font-semibold"><Activity size={18} className="text-indigo-600" /> SPECTROview <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] text-indigo-700">Integration preview</span></h2><p className="mt-1 text-xs text-slate-500">{dataset ? `${dataset.n_spectra.toLocaleString()} spectra · ${dataset.n_channels} channels · engine ${capabilities?.version ?? '…'}` : 'Connecting to the local engine…'}</p></div>
            <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !capabilities} onClick={() => void action(fitSelected)}><Play size={14} />1 · Fit selected spectrum</button><button className={button} disabled={busy || !capabilities} onClick={() => void action(() => save(false))}><Save size={14} />Save analysis</button><button className={`${button} bg-indigo-600 text-white`} disabled={busy || active || !capabilities || !fittedPreview?.success} title="First fit the selected spectrum with the current settings and review its residuals" onClick={() => void action(() => save(true))}><Play size={14} />{dataset?.n_spectra === 1 ? '2 · Fit & save spectrum' : `2 · Apply to map (${dataset?.n_spectra ?? '…'})`}</button><button className={button} disabled={!run?.blocks.length || busy} onClick={() => void action(() => exportRun(vaultRoot, run!.run_id))}><Download size={14} />CSV</button></div>
        </header>
        {error ? <div role="alert" className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800">{error}</div> : null}
        <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="flex flex-wrap items-start gap-4">
                <aside className="min-w-0 flex-[1_1_250px] space-y-4">
                    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-semibold">Preparation</h3>
                        <label className="block text-xs text-slate-600">Range minimum<input className={field} type="number" step="any" value={spec.crop?.[0] ?? ''} onChange={event => setSpec({ ...spec, crop: [Number(event.target.value), spec.crop?.[1] ?? center] })} /></label>
                        <label className="block text-xs text-slate-600">Range maximum<input className={field} type="number" step="any" value={spec.crop?.[1] ?? ''} onChange={event => setSpec({ ...spec, crop: [spec.crop?.[0] ?? center, Number(event.target.value)] })} /></label>
                        <label className="block text-xs text-slate-600">Baseline<select className={field} value={spec.baseline?.mode ?? ''} onChange={event => setSpec({ ...spec, baseline: { ...spec.baseline, mode: event.target.value || null } })}>{['', 'arpls', 'airpls', 'asls', 'modpoly'].map(value => <option key={value} value={value}>{value || 'None'}</option>)}</select></label>
                        {spec.baseline?.mode ? <label className="block text-xs text-slate-600">{spec.baseline.mode === 'modpoly' ? 'Polynomial order' : 'Smoothing · log₁₀ λ'}<input className={field} type="number" min={0} max={spec.baseline.mode === 'modpoly' ? 12 : 15} value={spec.baseline.mode === 'modpoly' ? spec.baseline.order_max ?? 3 : spec.baseline.coef ?? 5} onChange={event => setSpec({ ...spec, baseline: { ...spec.baseline, [spec.baseline?.mode === 'modpoly' ? 'order_max' : 'coef']: Number(event.target.value) } })} /></label> : null}
                        <label className="block text-xs text-slate-600">Loss<select className={field} value={spec.fit_params?.loss ?? 'linear'} onChange={event => setSpec({ ...spec, fit_params: { ...spec.fit_params, loss: event.target.value } })}>{(capabilities?.losses ?? ['linear']).map(value => <option key={value}>{value}</option>)}</select></label>
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={spec.fit_params?.fit_negative ?? false} onChange={event => setSpec({ ...spec, fit_params: { ...spec.fit_params, fit_negative: event.target.checked } })} />Include negative intensities</label>
                        <p className="text-xs leading-relaxed text-slate-500">Original intensities are preserved. No smoothing or normalization is applied.</p>
                    </section>
                    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-semibold">Saved analyses</h3><select aria-label="Saved analysis" className={field} value={runId ?? ''} onChange={event => {
                        const selected = runs.find(item => item.run_id === event.target.value);
                        if (selected) { setRun(selected); setSpec(selected.spec); setShowSaved(true); }
                    }}><option value="" disabled>No saved analysis</option>{runs.map(item => <option key={item.run_id} value={item.run_id}>{new Date(item.created_at).toLocaleString()} · {item.state}</option>)}</select>
                        {run ? <><div className="text-xs" role="status">{active ? 'Processing' : run.state} · {run.completed}/{run.source.n_spectra}</div><progress className="w-full accent-indigo-600" value={run.completed} max={run.source.n_spectra} aria-label="Completed spectra" />{run.error ? <p className="text-xs text-rose-700">{run.error}</p> : null}<button className={`${button} w-full`} disabled={busy || (!active && run.state === 'completed')} onClick={() => void action(async () => {
                            if (active) await request('cancel', { vault_root: vaultRoot, run_id: run.run_id });
                            else { const updated = await request<Run>('start', { vault_root: vaultRoot, run_id: run.run_id }); if (alive.current) setRun(updated); }
                        })}>{active ? <><Square size={12} />Stop after current checkpoint</> : <><Play size={12} />Start / resume saved run</>}</button></> : null}
                        {dirty ? <p className="text-xs text-amber-700">Draft differs from this run. The plot shows the saved result; resume uses its saved model.</p> : null}
                    </section>
                    {dataset?.warnings.map(warning => <p key={warning} className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">{warning}</p>)}
                </aside>
                <main className="min-w-0 flex-[3_1_560px] space-y-4">
                    {dataset && capabilities ? <SelectionPreview vaultRoot={vaultRoot} h5Path={h5Path} spec={spec} count={dataset.n_spectra} currentIndex={index} onInspect={value => {
                        setIndex(value.index); setShowSaved(false);
                        setFitPreview({ key: previewKey(h5Path, value.index, spec), value });
                    }} /> : null}
                    <section className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Spectrum inspector</h3><label className="flex items-center gap-2 text-xs">Spectrum index<input className="w-24 rounded-md border border-slate-200 p-2" type="number" min={0} max={(dataset?.n_spectra ?? 1)-1} value={index} onChange={event => setIndex(Math.max(0, Math.min((dataset?.n_spectra ?? 1)-1, Math.floor(Number(event.target.value)))))} /></label></div>
                        <div className="my-3 flex flex-wrap items-center gap-3 text-xs">
                            <button className={button} aria-pressed={!showSaved} onClick={() => setShowSaved(false)}>Current model / preview</button><button className={button} aria-pressed={showSaved} disabled={!run} onClick={() => setShowSaved(true)}>Saved result</button>
                            <label className="flex items-center gap-1"><input type="checkbox" checked={subtractBaseline} onChange={event => setSubtractBaseline(event.target.checked)} />Subtract baseline</label>
                            <label className="flex items-center gap-1"><input type="checkbox" checked={showComponents} onChange={event => setShowComponents(event.target.checked)} />Components</label>
                            <button className={button} aria-pressed={clickAdd} disabled={busy || showSaved} onClick={() => setClickAdd(!clickAdd)}>{clickAdd ? 'Click a spectrum point to add a peak' : 'Add peak from spectrum'}</button>
                        </div>
                        {!showSaved && previewError ? <p role="alert" className="mb-2 text-xs text-rose-700">{previewError}</p> : null}
                        {spectrum ? <Plot className="w-full" data={[
                            { x: subtractBaseline && fit ? fit.x : spectrum.x, y: subtractBaseline && fit ? fit.best.map((value, i) => value === null || fit.residual[i] === null ? null : value + fit.residual[i]!) : spectrum.raw, name: subtractBaseline && fit ? 'Baseline-corrected data' : 'Original', type: 'scattergl', mode: 'lines', line: { color: '#94a3b8', width: 1 } },
                            ...(fit ? [
                                { x: fit.x, y: subtractBaseline ? fit.best : fit.best.map((v, i) => v === null || fit.baseline[i] === null ? null : v + fit.baseline[i]!), name: !showSaved && !fittedPreview ? 'Initial model' : 'Best fit', type: 'scattergl' as const, mode: 'lines' as const, line: { color: '#4f46e5', width: 2 } },
                                ...(!subtractBaseline ? [{ x: fit.x, y: fit.baseline, name: 'Baseline', type: 'scattergl' as const, mode: 'lines' as const, line: { color: '#f59e0b', width: 1 } }] : []),
                                ...previewComponents.map((component, j) => ({ x: fit.x, y: subtractBaseline ? component : component.map((v, i) => v === null || fit.baseline[i] === null ? null : v + fit.baseline[i]!), name: `P${j+1}${subtractBaseline ? '' : ' + baseline'}`, type: 'scattergl' as const, mode: 'lines' as const, line: { width: 1, dash: 'dot' as const } })),
                                { x: fit.x, y: fit.residual, name: 'Residual', type: 'scattergl' as const, mode: 'lines' as const, yaxis: 'y2', line: { color: '#e11d48', width: 1 } },
                            ] : []),
                        ]} layout={{ height: 420, margin: { l: 55, r: 15, t: 55, b: 45 }, paper_bgcolor: 'white', plot_bgcolor: 'white', font: { size: 11, color: '#64748b' }, legend: { orientation: 'h', y: 1.15 }, xaxis: { title: { text: dataset?.axis_units } }, yaxis: { domain: [0.28, 1], title: { text: dataset?.intensity_units } }, yaxis2: { domain: [0, 0.18], title: { text: 'Residual' } }, uirevision: `${h5Path}-${index}` }} config={{ responsive: true, displaylogo: false }} useResizeHandler onClick={event => {
                            const point = event.points[0];
                            if (clickAdd && !showSaved && !busy && point?.curveNumber === 0) addFromPlot(Number(point.x), Number(point.y));
                        }} /> : <div className="flex h-80 items-center justify-center text-sm text-slate-400">{dataset ? 'Loading spectrum…' : 'Waiting for acquisition…'}</div>}
                        <p className="text-xs text-slate-500">{showSaved ? (fit ? `Saved result: ${fit.status}` : 'No saved fit for this spectrum yet.') : draftPreview ? `${fittedPreview ? 'Unsaved fitted preview' : 'Initial model · not optimized'}: ${draftPreview.status}` : 'Updating model preview…'}</p>
                        {fit && (showSaved || fittedPreview) ? <div className="mt-3 flex flex-wrap items-center gap-3 text-xs"><span>R²: {fit.r_squared?.toFixed(5) ?? '—'}</span><span>RMSE: {fit.rmse?.toPrecision(5) ?? '—'}</span>{!showSaved && fittedPreview ? <button className={button} disabled={busy || !fittedPreview.success} onClick={() => setSpec(applyPreviewParameters(spec, fittedPreview.parameters))}>Use fitted values as starting model</button> : null}</div> : null}
                        {!showSaved ? <p className="mt-2 text-xs text-slate-500">Fit this spectrum and inspect components and residuals before applying to the map. Changes invalidate its preview. One successful fit does not establish quality across the entire map.</p> : null}
                        {fit ? <div className="mt-3 flex flex-wrap gap-2">{Object.entries(fit.parameters).map(([name, value]) => <span key={name} className="rounded-md bg-slate-50 px-2 py-1 text-xs">{name}: {value === null ? '—' : value.toPrecision(6)}</span>)}</div> : null}
                    </section>
                    {run ? <ParameterMap key={run.run_id} vaultRoot={vaultRoot} runId={run.run_id} completed={run.completed} onSelect={selected => { setIndex(selected); setShowSaved(true); }} /> : null}
                    {capabilities ? <ModelEditor model={spec.model} registry={capabilities.models} center={center} onChange={model => setSpec({ ...spec, model })} /> : null}
                    <p className="px-1 text-xs text-slate-500">Preview scope: model editing, map fitting, parameter maps, saved runs and CSV. Advanced statistics and the remaining SPECTROview tools are still being integrated.</p>
                </main>
            </div>
        </div>
    </div>;
}

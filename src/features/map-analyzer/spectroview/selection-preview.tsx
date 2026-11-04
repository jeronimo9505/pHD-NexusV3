'use client';

import { useEffect, useRef, useState } from 'react';
import { request, type Preview, type Spec } from './client';

export function SelectionPreview({ vaultRoot, h5Path, spec, count, currentIndex, onInspect }: {
    vaultRoot: string; h5Path: string; spec: Spec; count: number; currentIndex: number; onInspect: (result: Preview) => void;
}) {
    const storageKey = `spectroview-selection-v1:${vaultRoot}:${h5Path}`;
    const [text, setText] = useState('');
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<{ key: string; message: string } | null>(null);
    const [response, setResponse] = useState<{ key: string; results: Preview[] } | null>(null);
    const controller = useRef<AbortController | null>(null);
    const tokens = text.trim() ? text.trim().split(/[\s,;]+/) : [];
    const indices = tokens.map(Number);
    const valid = indices.length > 0 && indices.length <= 32 && tokens.every(token => /^\d+$/.test(token)) && indices.every(i => Number.isSafeInteger(i) && i >= 0 && i < count) && new Set(indices).size === indices.length;
    const key = JSON.stringify([vaultRoot, h5Path, spec, indices]);
    const results = response?.key === key ? response.results : null;
    useEffect(() => {
        try { setText(localStorage.getItem(storageKey) ?? ''); } catch { /* Selection is optional UI state. */ }
        setReady(true);
        return () => controller.current?.abort();
    }, [storageKey]);
    useEffect(() => {
        if (ready) { try { localStorage.setItem(storageKey, text); } catch { /* Analysis remains in the vault. */ } }
    }, [ready, storageKey, text]);
    async function fitSelection() {
        controller.current?.abort();
        const pending = new AbortController(); controller.current = pending;
        setBusy(true); setError(null);
        try {
            const value = await request<{ results: Preview[] }>('preview-selection', { vault_root: vaultRoot, h5_relative_path: h5Path, spec, indices }, pending.signal);
            if (!pending.signal.aborted) setResponse({ key, results: value.results });
        } catch (reason) {
            if (!pending.signal.aborted) setError({ key, message: reason instanceof Error ? reason.message : 'Selection fit failed' });
        } finally { if (!pending.signal.aborted) setBusy(false); }
    }
    return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold">Compare selected spectra before map fitting</h3>
        <label className="block text-xs">Spectrum indices (0–{count - 1}, up to 32, separated by commas)
            <input className="mt-1 w-full rounded-lg border border-slate-200 p-2" value={text} onChange={event => setText(event.target.value)} placeholder="0, 12, 40" />
        </label>
        <div className="flex flex-wrap gap-2">
            <button className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40" disabled={indices.includes(currentIndex) || indices.length >= 32 || (tokens.length > 0 && !valid)} onClick={() => setText([...indices, currentIndex].join(', '))}>Add inspected spectrum ({currentIndex})</button>
            <button className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-40" disabled={!valid || busy} onClick={() => void fitSelection()}>{busy ? 'Fitting selection…' : `Fit selection (${indices.length})`}</button>
        </div>
        {tokens.length > 0 && !valid ? <p role="alert" className="text-xs text-rose-700">Enter up to 32 unique integer indices within this acquisition.</p> : null}
        {error?.key === key ? <p role="alert" className="text-xs text-rose-700">{error.message}</p> : null}
        {results ? <div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr>{['Spectrum', 'Status', 'R²', 'RMSE', 'Review'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{results.map(result => <tr key={result.index} className="border-t"><td className="p-2">{result.index}</td><td className="p-2">{result.status}</td><td className="p-2">{result.r_squared?.toFixed(5) ?? '—'}</td><td className="p-2">{result.rmse?.toPrecision(5) ?? '—'}</td><td className="p-2"><button className="text-indigo-700 underline" onClick={() => onInspect(result)}>Inspect spectrum {result.index}</button></td></tr>)}</tbody></table></div> : null}
        <p className="text-xs text-slate-500">Each spectrum uses the current model independently. Inspect its curves and residuals below. Changing the selection or model invalidates this comparison. These previews are not saved analyses.</p>
    </section>;
}

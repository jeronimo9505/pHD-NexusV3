'use client';

import type { Hint, Model } from './client';

const input = 'w-24 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs';

export function makePeak(shape: string, parameters: string[], center: number): Record<string, Hint> {
    return Object.fromEntries(parameters.map(name => [name, {
        value: name === 'x0' ? center : name.startsWith('fwhm') ? 20 : name === 'alpha' ? 0.5 : name === 'q' ? 2 : name.startsWith('tau') ? 1 : name === 'B' ? 0 : 100,
        min: name === 'x0' || name === 'q' || name === 'B' ? null : 0,
        max: name === 'alpha' ? 1 : null, vary: true,
    }]));
}

export function ModelEditor({ model, registry, center, onChange }: { model: Model; registry: Record<string, string[]>; center: number; onChange: (model: Model) => void }) {
    function change(peak: string, name: string, field: keyof Hint, value: number | string | boolean | null) {
        const next = structuredClone(model);
        const shape = Object.keys(next.peak_models[peak])[0];
        next.peak_models[peak][shape][name] = { ...next.peak_models[peak][shape][name], [field]: value };
        onChange(next);
    }
    return <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Peak model</h3>
            <button type="button" className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700" onClick={() => {
                const index = String(Object.keys(model.peak_models).length);
                onChange({ peak_models: { ...model.peak_models, [index]: { Lorentzian: makePeak('Lorentzian', registry.Lorentzian, center) } } });
            }}>Add peak</button>
        </div>
        <div className="max-h-96 overflow-auto"><table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>{['Peak / profile', 'Parameter', 'Minimum', 'Value', 'Maximum', 'Fixed', 'Expression'].map(text => <th key={text} className="px-3 py-2 font-medium">{text}</th>)}</tr></thead>
            <tbody>{Object.entries(model.peak_models).flatMap(([index, definition]) => {
                const [shape, hints] = Object.entries(definition)[0];
                return Object.entries(hints).map(([name, hint], row) => <tr key={`${index}-${name}`} className="border-t border-slate-100">
                    <td className="px-3 py-2">{row === 0 ? <div className="flex items-center gap-2"><span>P{Number(index) + 1}</span><select aria-label={`Profile for peak ${Number(index) + 1}`} className={`${input} w-36`} value={shape} onChange={event => {
                        const profile = event.target.value;
                        onChange({ peak_models: { ...model.peak_models, [index]: { [profile]: makePeak(profile, registry[profile], hints.x0?.value ?? center) } } });
                    }}>{Object.keys(registry).map(profile => <option key={profile}>{profile}</option>)}</select></div> : null}</td>
                    <td className="px-3 py-2 font-medium text-slate-700">{name}</td>
                    {(['min', 'value', 'max'] as const).map(field => <td key={field} className="px-3 py-2"><input type="number" step="any" aria-label={`P${Number(index)+1} ${name} ${field}`} className={input} value={hint[field] ?? ''} placeholder={field === 'value' ? '' : 'Unbounded'} onChange={event => change(index, name, field, event.target.value === '' ? (field === 'value' ? 0 : null) : Number(event.target.value))} /></td>)}
                    <td className="px-3 py-2"><input type="checkbox" aria-label={`Fix P${Number(index)+1} ${name}`} checked={hint.vary === false} onChange={event => change(index, name, 'vary', !event.target.checked)} /></td>
                    <td className="px-3 py-2"><input className={`${input} w-40`} aria-label={`Expression for P${Number(index)+1} ${name}`} value={hint.expr ?? ''} onChange={event => change(index, name, 'expr', event.target.value)} placeholder="e.g. P1_x0 + 20" /></td>
                </tr>);
            })}</tbody>
        </table></div>
        <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>Changes create a new analysis. Saved results keep their original model.</span><button type="button" disabled={Object.keys(model.peak_models).length < 2} className="shrink-0 text-rose-600 disabled:opacity-40" onClick={() => {
            const entries = Object.entries(model.peak_models); entries.pop(); onChange({ peak_models: Object.fromEntries(entries) });
        }}>Remove last peak</button></div>
    </section>;
}

import type { Model } from './client';

/** Remove a peak while retaining the meaning of every surviving expression. */
export function removePeak(model: Model, index: string): Model {
    const entries = Object.entries(model.peak_models).sort(([a], [b]) => Number(a) - Number(b));
    if (!entries.some(([key]) => key === index)) throw new Error('Peak does not exist.');
    if (entries.length < 2) throw new Error('Keep at least one peak in the model.');
    const removed = Number(index) + 1;
    const remaining = entries.filter(([key]) => key !== index);
    const renumber = new Map(remaining.map(([key], i) => [Number(key) + 1, i + 1]));
    const next = structuredClone(Object.fromEntries(remaining));
    for (const [key, definition] of Object.entries(next)) {
        for (const hints of Object.values(definition)) {
            for (const [name, hint] of Object.entries(hints)) {
                if (!hint.expr) continue;
                hint.expr = hint.expr.replace(/\bP(\d+)_([A-Za-z][A-Za-z0-9_]*)\b/g, (reference, number: string, parameter: string) => {
                    const original = Number(number);
                    if (original === removed) throw new Error(`P${Number(key) + 1}_${name} depends on ${reference}. Edit its expression before removing P${removed}.`);
                    const replacement = renumber.get(original);
                    if (replacement === undefined) throw new Error(`Unknown peak in expression: ${reference}. Correct it before removing a peak.`);
                    return `P${replacement}_${parameter}`;
                });
            }
        }
    }
    return { peak_models: Object.fromEntries(remaining.map(([key], i) => [String(i), next[key]])) };
}

import type { Spec } from './client';

export function previewKey(path: string, index: number, spec: Spec): string {
    return JSON.stringify([path, index, spec]);
}

export function applyPreviewParameters(spec: Spec, parameters: Record<string, number | null>): Spec {
    const next = structuredClone(spec);
    for (const [index, definition] of Object.entries(next.model.peak_models)) {
        for (const hints of Object.values(definition)) {
            for (const [name, hint] of Object.entries(hints)) {
                const value = parameters[`P${Number(index) + 1}_${name}`];
                if (hint.vary === false || (hint.expr && hint.expr.toLowerCase() !== 'none') || value === null || value === undefined || !Number.isFinite(value)) continue;
                if ((hint.min != null && value < hint.min) || (hint.max != null && value > hint.max)) continue;
                hint.value = value;
            }
        }
    }
    return next;
}

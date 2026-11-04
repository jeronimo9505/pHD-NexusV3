import { SCIENCE_ENGINE_URL } from '@/lib/desktop';

export type Hint = { value: number; min?: number | null; max?: number | null; vary?: boolean; expr?: string };
export type Model = { peak_models: Record<string, Record<string, Record<string, Hint>>> };
export type Spec = { model: Model; baseline?: { mode?: string | null; coef?: number; order_max?: number }; crop?: [number, number]; fit_params?: { loss?: string; fit_negative?: boolean; coef_noise?: number; max_ite?: number; xtol?: number; ftol?: number; f_scale?: number } };
export type Dataset = { relative_path: string; n_spectra: number; n_channels: number; axis_range: [number, number]; axis_units: string; intensity_units: string; grid: { width: number; height: number } | null; coordinate_units: string | null; warnings: string[] };
export type Run = { run_id: string; state: string; worker_active?: boolean; completed: number; created_at: string; source: Dataset; spec: Spec; error: string | null; blocks: { start: number; stop: number }[] };
export type Capabilities = { version: string; models: Record<string, string[]>; losses: string[] };
export type Preview = { index: number; mode: 'initial' | 'fit'; x: number[]; raw: (number | null)[]; best: (number | null)[]; baseline: (number | null)[]; residual: (number | null)[]; components: (number | null)[][]; parameters: Record<string, number | null>; success: boolean; status: string; r_squared: number | null; rmse: number | null; saved: false };
export type Spectrum = { index: number; x: number[]; raw: (number | null)[]; fit: null | Pick<Preview, 'x' | 'best' | 'baseline' | 'residual' | 'components' | 'status' | 'parameters' | 'success' | 'r_squared' | 'rmse'> };

export async function request<T>(operation: string, payload: object, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${SCIENCE_ENGINE_URL}/api/spectroview/v1/${operation}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(typeof error.detail === 'string' ? error.detail : `SPECTROview request failed (${response.status})`);
    }
    return response.json() as Promise<T>;
}

export async function exportRun(vault: string, id: string) {
    const response = await fetch(`${SCIENCE_ENGINE_URL}/api/spectroview/v1/export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vault_root: vault, run_id: id }),
    });
    if (!response.ok) throw new Error('Could not export this analysis');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url; link.download = `spectroview-${id}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

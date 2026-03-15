/**
 * Environment detection utility.
 * Returns true only when the app is running inside a Tauri desktop window.
 * Use this to conditionally show/hide desktop-exclusive features.
 */
export const isDesktop = typeof window !== "undefined" && "__TAURI__" in window;

/** 
 * URL of the local Python science engine sidecar.
 * This is only accessible when the desktop app is running.
 */
export const SCIENCE_ENGINE_URL = "http://127.0.0.1:8765";

/**
 * Check if the Python science engine is online.
 */
export async function checkEngineHealth(): Promise<boolean> {
    try {
        const res = await fetch(`${SCIENCE_ENGINE_URL}/health`, { signal: AbortSignal.timeout(2000) });
        return res.ok;
    } catch {
        return false;
    }
}

export type IngestRequest = {
    file_path: string;
    vault_root: string;
    group_id: string;
    sample_id?: string;
    analyte?: string;
    laser_wavelength_nm?: number;
    laser_power_uw?: number;
    integration_time_s?: number;
    accumulations?: number;
    technique?: string;
};

export type IngestResponse = {
    success: boolean;
    h5_relative_path: string;
    preview_base64?: string;
    wavenumber_range?: [number, number];
    n_points?: number;
    message: string;
};

/**
 * Send a file ingestion request to the Python engine.
 */
export async function ingestFile(request: IngestRequest): Promise<IngestResponse> {
    const res = await fetch(`${SCIENCE_ENGINE_URL}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Ingestion failed");
    }
    return res.json();
}

/**
 * Fetch processed spectrum data from the engine for a given .h5 file.
 */
export async function fetchSpectrum(h5AbsPath: string): Promise<{
    wavenumbers: number[];
    intensities: number[];
    metadata: Record<string, string>;
}> {
    const url = new URL(`${SCIENCE_ENGINE_URL}/api/spectrum`);
    url.searchParams.set("h5_path", h5AbsPath);

    const res = await fetch(url.toString());
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Could not fetch spectrum");
    }
    return res.json();
}

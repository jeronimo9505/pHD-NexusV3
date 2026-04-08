/**
 * Environment detection utility.
 * Returns true only when the app is running inside a Tauri desktop window.
 * Use this to conditionally show/hide desktop-exclusive features.
 */
export const isDesktop = typeof window !== "undefined" && 
    ("__TAURI__" in window || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

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
    sample_code?: string;
    sample_name?: string;
    analyte?: string;
    laser_wavelength_nm?: number;
    laser_power_uw?: number;
    integration_time_s?: number;
    accumulations?: number;
    technique?: string;
    parameters?: Record<string, string>;
};

export type IngestResponse = {
    success: boolean;
    h5_relative_path: string;
    preview_base64?: string;
    wavenumber_range?: [number, number];
    n_points?: number;
    n_spectra?: number;
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

/**
 * Request the Python engine to compute a representative (median) spectrum
 * from multiple .h5 files.
 */
export async function fetchRepresentativeSpectrum(
    vaultRoot: string,
    h5RelativePaths: string[]
): Promise<{ success: boolean; data: { x: number; y: number }[]; message: string }> {
    const res = await fetch(`${SCIENCE_ENGINE_URL}/api/representative-spectrum`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            vault_root: vaultRoot,
            h5_relative_paths: h5RelativePaths,
        }),
    });
    
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Could not fetch representative spectrum");
    }
    
    return res.json();
}

/**
 * Fetch list of all .h5 files from the local Vault.
 */
export async function fetchVaultFiles(vaultRoot: string, groupId?: string): Promise<{
    success: boolean;
    files: Array<{
        id: string;
        h5_relative_path: string;
        name: string;
        sample_name: string;
        technique: string;
        measured_at: string;
        created_at: string;
        n_spectra: number;
        map_width: number;
        map_height: number;
    }>;
}> {
    const url = new URL(`${SCIENCE_ENGINE_URL}/api/vault-files`);
    url.searchParams.set("vault_root", vaultRoot);
    if (groupId) url.searchParams.set("group_id", groupId);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Could not fetch vault files");
    return res.json();
}

/**
 * Fetch heatmap data from an .h5 file.
 */
export async function fetchMapHeatmap(request: {
    vault_root: string;
    h5_relative_path: string;
    start_wavenumber?: number;
    end_wavenumber?: number;
}): Promise<{ success: boolean; n_spectra: number; heatmap: number[]; min: number; max: number; message?: string }> {
    const res = await fetch(`${SCIENCE_ENGINE_URL}/api/map/heatmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Could not fetch heatmap");
    }
    return res.json();
}

/**
 * Fetch a specific 1D spectrum from an .h5 map.
 */
export async function fetchMapSpectrum(request: {
    vault_root: string;
    h5_relative_path: string;
    spectrum_index: number;
}): Promise<{ success: boolean; data: { x: number; y: number }[] }> {
    const res = await fetch(`${SCIENCE_ENGINE_URL}/api/map/spectrum`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Could not fetch spectrum slice");
    }
    return res.json();
}

/**
 * Compute Graphene Bands matrix natively via Python vectorization.
 */
export async function fetchGrapheneBands(request: {
    vault_root: string;
    h5_relative_path: string;
}): Promise<{ 
    success: boolean; 
    n_spectra: number;
    map_D: number[];
    map_G: number[];
    map_2D: number[];
    ratio_2D_G: number[];
    ratio_D_G: number[];
}> {
    const res = await fetch(`${SCIENCE_ENGINE_URL}/api/map/graphene-bands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Could not fetch graphene bands");
    }
    return res.json();
}


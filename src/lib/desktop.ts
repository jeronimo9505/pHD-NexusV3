/**
 * Environment detection utility.
 * Returns true when running inside the Tauri desktop app.
 * Tauri serves Next.js on localhost internally, so localhost/127.0.0.1 is a
 * reliable indicator. __TAURI__ is also checked as a belt-and-suspenders guard.
 */
export const isDesktop = typeof window !== "undefined" &&
    ("__TAURI__" in window || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

/** 
 * URL of the local Python science engine sidecar.
 * This is only accessible when the desktop app is running.
 */
export const SCIENCE_ENGINE_URL = "http://127.0.0.1:8888";

/**
 * Check if the Python science engine is online.
 */
export async function checkEngineHealth(): Promise<boolean> {
    if (!isDesktop) return false;
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
    logbook_name?: string;
    analyte?: string;
    laser_wavelength_nm?: number;
    laser_power_uw?: number;
    integration_time_s?: number;
    accumulations?: number;
    technique?: string;
    parameters?: Record<string, string>;
    is_generic?: boolean;
};

export type IngestResponse = {
    success: boolean;
    h5_relative_path: string;
    preview_base64?: string;
    wavenumber_range?: [number, number];
    n_points?: number;
    n_spectra?: number;
    metadata?: Record<string, any>;
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
 * Send a group file ingestion request to the Python engine.
 */
export async function ingestGroupFiles(request: {
    file_paths: string[];
    vault_root: string;
    group_id: string;
    sample_id?: string;
    sample_code?: string;
    sample_name?: string;
    logbook_name?: string;
    analyte?: string;
    laser_wavelength_nm?: number;
    laser_power_uw?: number;
    integration_time_s?: number;
    accumulations?: number;
    technique?: string;
    measured_at?: string;
    parameters?: Record<string, string>;
}): Promise<IngestResponse> {
    const res = await fetch(`${SCIENCE_ENGINE_URL}/api/ingest/group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Group Ingestion failed");
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
 * Fetch list of all folders (logbooks) in the Vault root.
 * Returns empty list gracefully when not on desktop.
 */
export async function fetchVaultLogbooks(vaultRoot: string): Promise<{
    success: boolean;
    logbooks: Array<{
        id: string;
        name: string;
        path: string;
    }>;
}> {
    if (!isDesktop) return { success: false, logbooks: [] };
    try {
        const url = new URL(`${SCIENCE_ENGINE_URL}/api/vault-logbooks`);
        url.searchParams.set("vault_root", vaultRoot);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error("Could not fetch logbooks");
        return res.json();
    } catch {
        return { success: false, logbooks: [] };
    }
}

/**
 * Fetch list of all .h5 files from the local Vault.
 * Returns empty list gracefully when not on desktop.
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
    if (!isDesktop) return { success: false, files: [] };
    try {
        const url = new URL(`${SCIENCE_ENGINE_URL}/api/vault-files`);
        url.searchParams.set("vault_root", vaultRoot);
        if (groupId) url.searchParams.set("group_id", groupId);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error("Could not fetch vault files");
        return res.json();
    } catch {
        return { success: false, files: [] };
    }
}

/**
 * Fetch heatmap data from an .h5 file.
 */
export async function fetchMapHeatmap(request: {
    vault_root: string;
    h5_relative_path: string;
    start_wavenumber?: number;
    end_wavenumber?: number;
    apply_snv?: boolean;
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
    apply_snv?: boolean;
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

/**
 * Fetch Graphene Analytics composite image from Python engine.
 */
export async function fetchGrapheneAnalytics(request: {
    vault_root: string;
    h5_relative_path: string;
    mono_th?: number;
    damage_th?: number;
    min_intensity?: number;
    apply_snv?: boolean;
}): Promise<{ 
    success: boolean; 
    composite_base64: string;
}> {
    const res = await fetch(`${SCIENCE_ENGINE_URL}/api/map/graphene-analytics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Could not fetch graphene analytics");
    }
    return res.json();
}

/**
 * Send a request to the Python science engine to save a base64 image in the vault sample folder.
 */
export async function savePastedImage(request: {
    image_base64: string;
    vault_root: string;
    filename?: string;
    metadata: Record<string, any>;
}): Promise<{ success: boolean; relative_path: string; filename: string; message: string }> {
    const res = await fetch(`${SCIENCE_ENGINE_URL}/api/save-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Could not save image");
    }
    return res.json();
}

/**
 * Request the Python engine to rename and update the metadata of local HDF5 files.
 */
export async function renameVaultFiles(request: {
    vault_root: string;
    h5_relative_paths: string[];
    metadata: Record<string, any>;
}): Promise<{ success: boolean; renamed_paths: Record<string, string>; message: string }> {
    try {
        const res = await fetch(`${SCIENCE_ENGINE_URL}/api/map/rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Renaming failed");
        }
        return res.json();
    } catch (err: any) {
        if (err?.message === 'Failed to fetch' || err?.name === 'TypeError') {
            throw new Error('Python engine not running. Start it with: python .\\start.py');
        }
        throw err;
    }
}


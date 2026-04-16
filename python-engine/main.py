"""
PhD Nexus Desktop - Python Science Engine
FastAPI sidecar that runs on localhost:8765
Handles Raman file ingestion, conversion to HDF5, and scientific processing.
"""

import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import os

from readers.witec import read_witec_txt
from readers.matlab import read_matlab_mat
from processor import convert_to_h5, generate_preview

app = FastAPI(
    title="PhD Nexus Science Engine",
    description="Local scientific processing sidecar for Raman data",
    version="0.1.0"
)

# Allow requests from the Tauri app (localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "tauri://localhost", "https://tauri.localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngestRequest(BaseModel):
    file_path: str               # Absolute path to the source file
    vault_root: str              # User-configured local vault root path
    group_id: str
    sample_id: Optional[str] = None
    sample_code: Optional[str] = None
    sample_name: Optional[str] = None
    logbook_name: Optional[str] = None
    analyte: Optional[str] = None
    laser_wavelength_nm: Optional[int] = None
    laser_power_uw: Optional[float] = None
    integration_time_s: Optional[float] = None
    accumulations: Optional[int] = 1
    technique: Optional[str] = "raman"
    measured_at: Optional[str] = None
    parameters: Optional[dict] = None


class IngestResponse(BaseModel):
    success: bool
    h5_relative_path: str        # Relative path from vault_root to the .h5 file
    preview_base64: Optional[str] = None  # PNG preview as base64
    wavenumber_range: Optional[list] = None
    n_points: Optional[int] = None
    n_spectra: Optional[int] = None
    message: str


class RepresentativeSpectrumRequest(BaseModel):
    vault_root: str
    h5_relative_paths: list[str]

class RepresentativeSpectrumResponse(BaseModel):
    success: bool
    data: Optional[list[dict]] = None
    message: str


@app.get("/health")
def health():
    """Check if the engine is running."""
    return {"status": "online", "version": "0.1.0"}


@app.post("/api/ingest", response_model=IngestResponse)
async def ingest_file(request: IngestRequest):
    """
    Main ingestion endpoint.
    1. Reads the source file (Witec .txt, .mat, etc.)
    2. Converts to HDF5 with metadata embedded
    3. Organizes in vault folder structure
    4. Returns the relative path and a preview PNG in base64
    """
    source_path = Path(request.file_path)
    
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {request.file_path}")

    # Detect format and read
    ext = source_path.suffix.lower()
    try:
        if ext == ".txt":
            wavenumbers, intensities, metadata = read_witec_txt(source_path)
        elif ext == ".mat":
            wavenumbers, intensities, metadata = read_matlab_mat(source_path)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}. Supported: .txt, .mat")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {str(e)}")

    # Build metadata dict
    full_metadata = {
        "group_id": request.group_id,
        "logbook_name": request.logbook_name or "",
        "sample_id": request.sample_id or "",
        "sample_code": request.sample_code or "",
        "sample_name": request.sample_name or "",
        "analyte": request.analyte or metadata.get("analyte", ""),
        "laser_wavelength_nm": request.laser_wavelength_nm or metadata.get("laser_wavelength_nm", 0),
        "laser_power_uw": request.laser_power_uw or metadata.get("laser_power_uw", 0.0),
        "integration_time_s": request.integration_time_s or metadata.get("integration_time_s", 0.0),
        "accumulations": request.accumulations or 1,
        "technique": request.technique or "raman",
        "source_format": ext.lstrip("."),
        "original_filename": source_path.name,
        "measured_at": request.measured_at or "",
        "parameters": request.parameters or {},
    }

    # Convert to HDF5 and organize in vault
    try:
        h5_path, relative_path = convert_to_h5(
            wavenumbers=wavenumbers,
            intensities=intensities,
            metadata=full_metadata,
            vault_root=request.vault_root,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HDF5 conversion failed: {str(e)}")

    # Generate preview PNG as base64
    try:
        preview_b64 = generate_preview(wavenumbers, intensities, full_metadata)
    except Exception:
        preview_b64 = None

    return IngestResponse(
        success=True,
        h5_relative_path=relative_path,
        preview_base64=preview_b64,
        wavenumber_range=[float(wavenumbers.min()), float(wavenumbers.max())],
        n_points=len(wavenumbers),
        n_spectra=1 if intensities.ndim == 1 else intensities.shape[0],
        message=f"Successfully ingested {source_path.name} → {relative_path}"
    )


@app.get("/api/spectrum")
def get_spectrum(h5_path: str, dataset_key: str = "/spectrum"):
    """
    Read an existing .h5 file and return the spectrum data for plotting.
    """
    import h5py
    import numpy as np

    path = Path(h5_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="HDF5 file not found")

    try:
        with h5py.File(path, "r") as f:
            wavenumbers = f[f"{dataset_key}/wavenumbers"][:].tolist()
            intensities = f[f"{dataset_key}/intensities"][:].tolist()
            metadata = dict(f.attrs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read HDF5: {str(e)}")

    return {
        "wavenumbers": wavenumbers,
        "intensities": intensities,
        "metadata": {k: str(v) for k, v in metadata.items()}
    }

@app.post("/api/representative-spectrum", response_model=RepresentativeSpectrumResponse)
def get_representative_spectrum(request: RepresentativeSpectrumRequest):
    """
    Computes a representative (median) spectrum from multiple local H5 files.
    """
    import h5py
    import numpy as np
    from scipy.interpolate import interp1d

    if not request.h5_relative_paths:
        return RepresentativeSpectrumResponse(success=False, message="No paths provided", data=[])
    
    vault_root = Path(request.vault_root)
    all_x = []
    all_y = []
    
    for rel_path in request.h5_relative_paths:
        abs_path = vault_root / rel_path
        if not abs_path.exists():
            continue
            
        try:
            with h5py.File(abs_path, 'r') as f:
                if "spectrum/wavenumbers" in f and "spectrum/intensities" in f:
                    x = f["spectrum/wavenumbers"][:]
                    y = f["spectrum/intensities"][:]
                    # Sort by x just in case
                    idx = np.argsort(x)
                    all_x.append(x[idx])
                    all_y.append(y[idx])
        except Exception:
            pass
            
    if not all_x:
        return RepresentativeSpectrumResponse(success=False, message="Could not read any valid spectra", data=[])
        
    # Find a common x-axis if they vary slightly (very common)
    min_x = max([x[0] for x in all_x])
    max_x = min([x[-1] for x in all_x])
    
    # We'll base the number of points on the first valid spectrum
    num_points = len(all_x[0])
    
    common_x = np.linspace(min_x, max_x, num_points)
    interpolated_ys = []
    
    for x, y in zip(all_x, all_y):
        # Only interpolate points within bounds
        f = interp1d(x, y, kind='linear', bounds_error=False, fill_value="extrapolate")
        y_int = f(common_x)
        interpolated_ys.append(y_int)
        
    y_stack = np.vstack(interpolated_ys)
    # Compute median across all Ys to avoid outliers from cosmic rays etc.
    median_y = np.median(y_stack, axis=0)
    
    out_data = [{"x": float(x_val), "y": float(y_val)} for x_val, y_val in zip(common_x, median_y)]
    return RepresentativeSpectrumResponse(success=True, message="Calculated median spectrum", data=out_data)


@app.get("/api/vault-logbooks")
def list_vault_logbooks(vault_root: str):
    """
    Returns a list of folders at the root of the vault. 
    Each folder usually represents a Logbook_ID or group.
    """
    root_path = Path(vault_root)
    if not root_path.exists() or not root_path.is_dir():
        return {"success": False, "logbooks": []}
    
    logbooks = []
    for item in root_path.iterdir():
        if item.is_dir() and not item.name.startswith("."):
            logbooks.append({
                "id": item.name,
                "name": item.name.replace("Logbook_", "").replace("_", " "),
                "path": item.name
            })
    
    # Sort alphabetically
    logbooks.sort(key=lambda x: x["name"])
    return {"success": True, "logbooks": logbooks}


@app.get("/api/vault-files")
def list_vault_files(vault_root: str, group_id: str = None):
    """
    Recursively scans the vault_root for .h5 files, returning a list of paths and metadata.
    If group_id is provided, it only searches inside that specific logbook folder.
    """
    import h5py
    root_path = Path(vault_root)
    
    # Optimization: if group_id is provided, we only scan that subdirectory
    search_path = root_path
    if group_id:
        target = root_path / group_id
        if target.exists() and target.is_dir():
            search_path = target

    if not search_path.exists() or not search_path.is_dir():
        return {"success": False, "files": []}

    files = []
    # Use rglob for recursive finding
    for p in search_path.rglob("*.h5"):
        try:
            with h5py.File(p, "r") as f:
                meta = dict(f.attrs)
                # We trust the folder structure for "Logbook filtering"
                # If a group_id is provided, it means we already filtered the search_path to that folder.
                # So any file found here belongs to this group/logbook.
                    
                rel_path = p.relative_to(root_path).as_posix()
                
                # Check dimensions
                n_spectra = 1
                try:
                    intensities = f["/spectrum/intensities"]
                    if len(intensities.shape) >= 2:
                        n_spectra = intensities.shape[0] if len(intensities.shape) == 2 else np.prod(intensities.shape[:-1])
                except:
                    pass
                
                files.append({
                    "id": rel_path,
                    "h5_relative_path": rel_path,
                    "name": p.name,
                    "sample_name": meta.get("sample_name") or meta.get("sample_code", "Unknown"),
                    "technique": meta.get("technique", "Unknown"),
                    "measured_at": meta.get("measured_at", ""),
                    "created_at": meta.get("created_at", ""),
                    "n_spectra": n_spectra,
                    "map_width": int(meta.get("map_width", 0)),
                    "map_height": int(meta.get("map_height", 0)),
                })
        except Exception:
            pass

    # Sort files by created_at descending
    files.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"success": True, "files": files}

class HeatmapRequest(BaseModel):
    vault_root: str
    h5_relative_path: str
    start_wavenumber: Optional[float] = None
    end_wavenumber: Optional[float] = None
    apply_snv: bool = False

@app.post("/api/map/heatmap")
def get_map_heatmap(request: HeatmapRequest):
    """
    Returns the aggregated intensity (or peak intensity) for each spectrum to construct a heatmap.
    If a wavenumber range is provided, it integrates strictly within that range.
    """
    import h5py
    import numpy as np
    
    path = Path(request.vault_root) / request.h5_relative_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="HDF5 file not found")

    try:
        with h5py.File(path, "r") as f:
            wavenumbers = f["/spectrum/wavenumbers"][:]
            intensities = f["/spectrum/intensities"][:]
            
            # If 1D, return single value
            if intensities.ndim == 1:
                intensities = intensities.reshape(1, -1)
                
            n_spectra = intensities.shape[0]
            
            if request.apply_snv:
                mean = np.mean(intensities, axis=1, keepdims=True)
                std = np.std(intensities, axis=1, keepdims=True)
                std[std == 0] = 1
                intensities = (intensities - mean) / std
                
            # Find bounds
            if request.start_wavenumber is not None and request.end_wavenumber is not None:
                mask = (wavenumbers >= request.start_wavenumber) & (wavenumbers <= request.end_wavenumber)
            else:
                mask = np.ones(len(wavenumbers), dtype=bool)
                
            if not np.any(mask):
                return {"success": False, "message": "No wavenumbers in selected range."}
                
            # Slice and aggregate (integral/sum)
            sliced = intensities[:, mask]
            
            # Use sum or max? Sum is equivalent to area under curve
            heatmap_data = np.sum(sliced, axis=1)
            
            return {
                "success": True,
                "n_spectra": n_spectra,
                "heatmap": heatmap_data.tolist(),
                "min": float(np.min(heatmap_data)),
                "max": float(np.max(heatmap_data))
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Heatmap calc failed: {str(e)}")


class SpectrumRequest(BaseModel):
    vault_root: str
    h5_relative_path: str
    spectrum_index: int

@app.post("/api/map/spectrum")
def get_map_spectrum(request: SpectrumRequest):
    """
    Returns a single 1D spectrum from a 2D map given a flattened index.
    """
    import h5py
    
    path = Path(request.vault_root) / request.h5_relative_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="HDF5 file not found")

    try:
        with h5py.File(path, "r") as f:
            wavenumbers = f["/spectrum/wavenumbers"][:]
            intensities = f["/spectrum/intensities"]
            
            if intensities.ndim == 1:
                y = intensities[:]
            else:
                if request.spectrum_index < 0 or request.spectrum_index >= intensities.shape[0]:
                    raise HTTPException(status_code=400, detail="Index out of bounds")
                y = intensities[request.spectrum_index, :]
                
            return {
                "success": True,
                "data": [{"x": float(x), "y": float(y_val)} for x, y_val in zip(wavenumbers, y)]
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Spectrum calc failed: {str(e)}")

class GrapheneScriptRequest(BaseModel):
    vault_root: str
    h5_relative_path: str
    apply_snv: bool = False

@app.post("/api/map/graphene-bands")
def get_graphene_bands(request: GrapheneScriptRequest):
    """
    Computes Graphene Bands natively and returns the raw flattened maps.
    This replaces the slow Matplotlib window with an instantly computed JSON response.
    """
    import h5py
    import numpy as np
    from scipy.signal import savgol_filter
    
    path = Path(request.vault_root) / request.h5_relative_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="HDF5 file not found")
        
    try:
        with h5py.File(path, "r") as f:
            wavenumbers = f["/spectrum/wavenumbers"][:]
            intensities_raw = f["/spectrum/intensities"][:]
            
            if intensities_raw.ndim == 1:
                intensities_raw = intensities_raw.reshape(1, -1)
                
            n_spectra = intensities_raw.shape[0]
            
            if request.apply_snv:
                mean = np.mean(intensities_raw, axis=1, keepdims=True)
                std = np.std(intensities_raw, axis=1, keepdims=True)
                std[std == 0] = 1
                intensities_raw = (intensities_raw - mean) / std
            
            # 1. Vectorized Smoothing
            # savgol_filter on axis=1 applies to each spectrum efficiently
            processed = savgol_filter(intensities_raw, window_length=7, polyorder=3, axis=1)
            
            # --- Config ---
            bands = {
                'D': (1300, 1350),
                'G': (1580, 1600),
                '2D': (2523, 2721)
            }
            noises = {
                'D': [(1200, 1250), (1360, 1400)],
                'G': [(1500, 1550), (1620, 1650)],
                '2D': [(2550, 2580), (2720, 2750)]
            }
            snr_threshold = 3.0
            epsilon = 1e-5
            
            # Helper to get mask array for a range
            def get_mask(r):
                return (wavenumbers >= r[0]) & (wavenumbers <= r[1])
            
            # Output arrays
            maps = {'D': np.zeros(n_spectra), 'G': np.zeros(n_spectra), '2D': np.zeros(n_spectra)}
            
            for key in ['D', 'G', '2D']:
                b_range = bands[key]
                n_ranges = noises[key]
                
                band_mask = get_mask(b_range)
                noise_mask = get_mask(n_ranges[0]) | get_mask(n_ranges[1])
                
                # If these features don't exist in the scan, skip
                if not np.any(band_mask) or not np.any(noise_mask):
                    continue
                    
                # Vectorized peaks (Max intensity in band)
                peaks = np.max(processed[:, band_mask], axis=1)
                
                # Vectorized background noise mean & std
                noise_data = processed[:, noise_mask]
                noise_mean = np.mean(noise_data, axis=1)
                noise_std = np.std(noise_data, axis=1)
                
                # Vectorized SNR calculation
                # Avoid division by zero
                valid_std = noise_std > 0
                snr = np.zeros(n_spectra)
                snr[valid_std] = (peaks[valid_std] - noise_mean[valid_std]) / noise_std[valid_std]
                
                # Filter by SNR threshold
                valid_snr = snr >= snr_threshold
                maps[key][valid_snr] = peaks[valid_snr]
                
            # Correlaciones (Ratios)
            map_G = maps['G']
            map_D = maps['D']
            map_2D = maps['2D']
            
            ratio_2D_G = np.zeros(n_spectra)
            valid_2D_G = (map_2D > 0) & (map_G > 0)
            ratio_2D_G[valid_2D_G] = map_2D[valid_2D_G] / (map_G[valid_2D_G] + epsilon)
            
            ratio_D_G = np.zeros(n_spectra)
            valid_D_G = (map_D > 0) & (map_G > 0)
            ratio_D_G[valid_D_G] = map_D[valid_D_G] / (map_G[valid_D_G] + epsilon)
            
            # Pack all data back
            return {
                "success": True,
                "n_spectra": n_spectra,
                "map_D": maps['D'].tolist(),
                "map_G": maps['G'].tolist(),
                "map_2D": maps['2D'].tolist(),
                "ratio_2D_G": ratio_2D_G.tolist(),
                "ratio_D_G": ratio_D_G.tolist()
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graphene calc failed: {str(e)}")

class GrapheneAnalyticsRequest(BaseModel):
    vault_root: str
    h5_relative_path: str
    mono_th: float = 1.5
    damage_th: float = 0.3
    min_intensity: float = 0.0
    apply_snv: bool = False

@app.post("/api/map/graphene-analytics")
def get_graphene_analytics(request: GrapheneAnalyticsRequest):
    import h5py
    from scripts.graphene_analytics import generate_analytics_base64
    
    path = Path(request.vault_root) / request.h5_relative_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="HDF5 file not found")
        
    try:
        with h5py.File(path, "r") as f:
            wavenumbers = f["/spectrum/wavenumbers"][:]
            intensities = f["/spectrum/intensities"][:]
            
            b64_img = generate_analytics_base64(
                wavenumbers=wavenumbers, 
                intensities=intensities,
                mono_th=request.mono_th,
                damage_th=request.damage_th,
                min_intensity=request.min_intensity,
                apply_snv=request.apply_snv
            )
            
            return {
                "success": True,
                "composite_base64": b64_img
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graphene analytics failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8765, reload=False)

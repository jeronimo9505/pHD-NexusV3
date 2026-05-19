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
from datetime import datetime
import os

from readers.witec import read_witec_txt
from readers.matlab import read_matlab_mat
from processor import convert_to_h5, generate_preview, get_representative_spectrum
import h5py
import numpy as np
from scipy.signal import savgol_filter
from scipy.interpolate import interp1d

app = FastAPI(
    title="PhD Nexus Science Engine",
    description="Local scientific processing sidecar for Raman data",
    version="0.1.0"
)

# Essential CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    is_generic: Optional[bool] = False


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


class SaveImageRequest(BaseModel):
    image_base64: str            # base64 data of the image
    vault_root: str              # User-configured local vault root path
    filename: Optional[str] = None
    metadata: dict               # contains group_id, sample_id, sample_code, sample_name, logbook_name, technique

class SaveImageResponse(BaseModel):
    success: bool
    relative_path: str
    filename: str
    message: str



@app.get("/health")
def health():
    """Check if the engine is running."""
    print(">>> HEALTH CHECK RECEIVED <<<")
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
    
    # Check if we should do generic copy (no H5 conversion)
    is_raman = request.technique and request.technique.lower() in ["raman", "sers"]
    should_do_generic = request.is_generic or not is_raman or ext not in [".txt", ".mat"]

    if should_do_generic:
        from processor import copy_file_to_vault
        try:
            target_path, relative_path = copy_file_to_vault(
                source_path=source_path,
                metadata=request.dict(),
                vault_root=request.vault_root
            )
            return IngestResponse(
                success=True,
                h5_relative_path=relative_path,
                message=f"Successfully stored raw file: {source_path.name} → {relative_path}"
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Generic file storage failed: {str(e)}")

    try:
        if ext == ".txt":
            wavenumbers, intensities, metadata = read_witec_txt(source_path)
        elif ext == ".mat":
            wavenumbers, intensities, metadata = read_matlab_mat(source_path)
        else:
            # This shouldn't be reached due to should_do_generic check above, but for safety:
            raise HTTPException(status_code=400, detail=f"Unsupported spectral format: {ext}")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse spectral file: {str(e)}")

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
    path = Path(h5_path)
    print(f"DEBUG: Getting spectrum from {path}")
    if not path.exists():
        print(f"DEBUG: File NOT found at {path}")
        raise HTTPException(status_code=404, detail="HDF5 file not found")

    try:
        with h5py.File(path, "r") as f:
            wavenumbers = f[f"{dataset_key}/wavenumbers"][:].tolist()
            intensities = f[f"{dataset_key}/intensities"][:].tolist()
            metadata = dict(f.attrs)
            print(f"DEBUG: Successfully read spectrum. Points: {len(wavenumbers)}")
    except Exception as e:
        print(f"DEBUG: h5py error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to read HDF5: {str(e)}")

    return {
        "wavenumbers": wavenumbers,
        "intensities": intensities,
        "metadata": {k: str(v) for k, v in metadata.items()}
    }

@app.post("/api/representative-spectrum", response_model=RepresentativeSpectrumResponse)
def api_get_representative_spectrum(request: RepresentativeSpectrumRequest):
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
                    
                    if y.ndim == 2:
                        y = np.mean(y, axis=0)
                        
                    # Sort by x just in case
                    idx = np.argsort(x)
                    all_x.append(x[idx])
                    all_y.append(y[idx])
        except Exception as e:
            print(f"Error processing {rel_path}: {e}")
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


@app.post("/api/save-image", response_model=SaveImageResponse)
async def save_image(request: SaveImageRequest):
    """
    Saves a base64 image file into the vault folder structure.
    """
    import base64
    import re
    from processor import _build_vault_subpath

    try:
        # Clean base64 header if present
        base64_data = request.image_base64
        if "," in base64_data:
            base64_data = base64_data.split(",")[1]

        img_data = base64.b64decode(base64_data)

        # Determine vault subpath
        subpath = _build_vault_subpath(request.metadata)
        abs_dir = Path(request.vault_root) / subpath
        abs_dir.mkdir(parents=True, exist_ok=True)

        # Build filename
        fn = request.filename or f"Pasted_Image_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"

        # Safely clean out invalid characters
        fn = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', fn)
        if not fn.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif')):
            fn += ".png"

        target_path = abs_dir / fn

        # Handle duplicates
        if target_path.exists():
            stem = Path(fn).stem
            ext = Path(fn).suffix
            counter = 1
            while target_path.exists():
                target_path = abs_dir / f"{stem}_{counter}{ext}"
                counter += 1

        with open(target_path, "wb") as f:
            f.write(img_data)

        relative_path = target_path.relative_to(Path(request.vault_root)).as_posix()

        return SaveImageResponse(
            success=True,
            relative_path=relative_path,
            filename=target_path.name,
            message=f"Saved image to {relative_path}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")


@app.get("/api/vault-file")
def get_vault_file(path: str, vault_root: str):
    """
    Serves any file from the vault folder.
    Used to render images or read files in the frontend UI.
    """
    from fastapi.responses import FileResponse
    abs_path = Path(vault_root) / path
    if not abs_path.exists() or not abs_path.is_file():
        raise HTTPException(status_code=404, detail="File not found in vault")
    return FileResponse(abs_path)



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
                
                def decode_attr(val, default=""):
                    if val is None: return default
                    if isinstance(val, bytes): return val.decode("utf-8", "ignore")
                    if hasattr(val, "decode"): return val.decode("utf-8", "ignore")
                    return str(val)

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
                    "sample_name": decode_attr(meta.get("sample_name") or meta.get("sample_code", "Unknown")).strip(),
                    "technique": decode_attr(meta.get("technique", "Unknown")).strip(),
                    "measured_at": decode_attr(meta.get("measured_at", "")).strip(),
                    "created_at": decode_attr(meta.get("created_at", "")),
                    "n_spectra": n_spectra,
                    "map_width": int(meta.get("map_width", 0)),
                    "map_height": int(meta.get("map_height", 0)),
                    "pipeline_applied": decode_attr(meta.get("pipeline_applied")).lower() == "true",
                    "pipeline_name": decode_attr(meta.get("pipeline_name", "")),
                    "pipeline_history": decode_attr(meta.get("pipeline_history", "")),
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
    path = Path(request.vault_root) / request.h5_relative_path
    print(f"DEBUG: Processing heatmap for {path}")
    if not path.exists():
        print(f"DEBUG: Heatmap file NOT found at {path}")
        raise HTTPException(status_code=404, detail="HDF5 file not found")

    try:
        with h5py.File(path, "r") as f:
            print("DEBUG: File opened successfully")
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

class RepSpectrumRequest(BaseModel):
    vault_root: str
    h5_relative_path: str

@app.post("/api/map/representative-spectrum")
def get_map_representative_spectrum(request: RepSpectrumRequest):
    """
    Returns the median representative spectrum of a single HDF5 file.
    """
    rep_specs = get_representative_spectrum(request.vault_root, [request.h5_relative_path])
    if not rep_specs:
        raise HTTPException(status_code=404, detail="Could not extract representative spectrum")
        
    return {
        "success": True,
        "data": [{"x": float(pt["x"]), "y": float(pt["y"])} for pt in rep_specs]
    }

class PipelinePreviewRequest(BaseModel):
    vault_root: str
    h5_relative_path: str
    steps: list[dict]
    focus_index: int = -1

@app.post("/api/pipeline/preview")
def preview_pipeline(request: PipelinePreviewRequest):
    """
    Runs the pipeline steps on the representative spectrum of the file.
    Returns both the original and the processed spectrum, and optionally the baseline.
    """
    print(f"DEBUG: Pipeline Preview Request for {request.h5_relative_path}")
    from pipeline_engine import apply_pipeline, _step_baseline
    
    # Get representative spectrum
    rep_specs = get_representative_spectrum(request.vault_root, [request.h5_relative_path])
    print(f"DEBUG: Representative spectrum points: {len(rep_specs)}")
    if not rep_specs:
        raise HTTPException(status_code=404, detail=f"Could not extract representative spectrum for {request.h5_relative_path}")
        
    x_raw = np.array([pt["x"] for pt in rep_specs])
    y_raw = np.array([pt["y"] for pt in rep_specs])
    
    results = apply_pipeline(x_raw, y_raw, request.steps, focus_index=request.focus_index)
    x_processed = results["x"]
    y_processed = results["y"]
    y_base = results["baseline"]
    y_stage_in = results["stage_input"]
    
    return {
        "success": True,
        "original": [{"x": float(x), "y": float(y)} for x, y in zip(x_raw, y_raw)],
        "processed": [{"x": float(x), "y": float(y)} for x, y in zip(x_processed, y_processed)],
        "baseline": [{"x": float(x), "y": float(y)} for x, y in zip(x_processed, y_base)] if y_base is not None else None,
        "stage_input": [{"x": float(x), "y": float(y)} for x, y in zip(results["x_stage"], results["stage_input"])] if results["stage_input"] is not None else None,
        "spike_positions": results.get("spike_positions", []),
    }

class PipelineApplyRequest(BaseModel):
    vault_root: str
    h5_relative_path: str
    steps: list[dict]
    pipeline_name: Optional[str] = "unnamed_pipeline"

@app.post("/api/pipeline/apply")
def apply_pipeline_to_file(request: PipelineApplyRequest):
    """
    Applies the pipeline to an entire HDF5 file (all spectra).
    Saves a new derived file and returns its path.
    """
    from pipeline_engine import apply_pipeline
    import json
    
    vault_root = Path(request.vault_root)
    source_path = vault_root / request.h5_relative_path
    
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Source HDF5 file not found")
        
    try:
        # Load raw data
        with h5py.File(source_path, "r") as f:
            wavenumbers = f["/spectrum/wavenumbers"][:]
            intensities = f["/spectrum/intensities"][:]
            metadata = dict(f.attrs)
            
        # Process
        results = apply_pipeline(wavenumbers, intensities, request.steps)
        x_new = results["x"]
        y_new = results["y"]
        
        # Build new filename
        # E.g. Sample_A01_Raman_Spot1.h5 -> Sample_A01_Raman_Spot1_preprocessed.h5
        stem = source_path.stem
        parent_dir = source_path.parent
        new_filename = f"{stem}_preprocessed.h5"
        
        # Ensure no overwrite
        counter = 1
        while (parent_dir / new_filename).exists():
            new_filename = f"{stem}_preprocessed_{counter}.h5"
            counter += 1
            
        target_path = parent_dir / new_filename
        relative_path = target_path.relative_to(vault_root).as_posix()
        
        # Update metadata
        metadata["pipeline_applied"] = "true"
        metadata["pipeline_name"] = request.pipeline_name or "unnamed"
        metadata["pipeline_history"] = json.dumps(request.steps)
        metadata["processed_at"] = datetime.now().isoformat()
        
        # Save new file
        with h5py.File(target_path, "w") as f:
            # Copy all root attributes (metadata)
            for k, v in metadata.items():
                try:
                    f.attrs[k] = v
                except Exception:
                    try:
                        f.attrs[k] = str(v)
                    except Exception:
                        pass
                
            grp = f.create_group("spectrum")
            ds_wn = grp.create_dataset("wavenumbers", data=x_new, compression="gzip")
            ds_wn.attrs["units"] = "cm^-1"
            ds_wn.attrs["label"] = "Raman Shift (Processed)"
            
            ds_int = grp.create_dataset("intensities", data=y_new, compression="gzip")
            ds_int.attrs["units"] = "counts (Processed)"
            ds_int.attrs["label"] = "Intensity (Processed)"
            
        def decode_attr(val, default=""):
            if val is None: return default
            if isinstance(val, bytes): return val.decode("utf-8", "ignore")
            if hasattr(val, "decode"): return val.decode("utf-8", "ignore")
            return str(val)

        # Prepare the file metadata for the frontend to add to sidebar
        file_info = {
            "id": str(target_path.stat().st_mtime), # Temporary ID
            "h5_relative_path": relative_path,
            "name": new_filename,
            "sample_name": decode_attr(metadata.get("sample_name") or metadata.get("sample_code", "Unknown")).strip(),
            "technique": decode_attr(metadata.get("technique", "raman")).strip(),
            "measured_at": decode_attr(metadata.get("measured_at", "")).strip(),
            "created_at": decode_attr(metadata.get("processed_at", "")).strip(),
            "n_spectra": int(y_new.shape[0]),
            "map_width": int(metadata.get("map_width", 0)),
            "map_height": int(metadata.get("map_height", 0)),
            "pipeline_applied": True,
            "pipeline_name": metadata.get("pipeline_name", "unnamed"),
            "pipeline_history": metadata.get("pipeline_history", ""),
            "parent_name": source_path.name
        }
        
        return {
            "success": True,
            "file": file_info,
            "message": f"Successfully created preprocessed file {new_filename}"
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "message": f"Pipeline application failed: {str(e)}"
        }

class DeleteMapRequest(BaseModel):
    vault_root: str
    h5_relative_path: str

@app.post("/api/map/delete")
def delete_map_file(request: DeleteMapRequest):
    try:
        path = Path(request.vault_root) / request.h5_relative_path
        if not path.exists():
            return {"success": False, "message": "File not found on disk"}
            
        import os
        os.remove(path)
        return {"success": True, "message": "File deleted successfully"}
    except Exception as e:
        return {"success": False, "message": f"Failed to delete file: {str(e)}"}


class RenameRequest(BaseModel):
    vault_root: str
    h5_relative_paths: list[str]
    metadata: dict

class RenameResponse(BaseModel):
    success: bool
    renamed_paths: dict[str, str]
    message: str

@app.post("/api/map/rename", response_model=RenameResponse)
def rename_map_files(request: RenameRequest):
    """
    Renames physical H5 files when parameters are updated,
    strictly retaining the original spot counter.
    """
    import re
    import shutil
    from processor import _build_vault_subpath
    
    vault_root = Path(request.vault_root)
    renamed_paths = {}
    
    try:
        for rel_path in request.h5_relative_paths:
            old_abs_path = vault_root / rel_path
            if not old_abs_path.exists():
                print(f"Rename warning: file not found at {old_abs_path}")
                continue
                
            # 1. Read existing H5 attributes to preserve and merge
            existing_attrs = {}
            try:
                with h5py.File(old_abs_path, "r") as f:
                    for k in f.attrs.keys():
                        existing_attrs[k] = f.attrs[k]
            except Exception as e:
                print(f"Error reading attributes from {rel_path}: {e}")
                
            # Decode existing attributes if they are bytes/strings
            def decode_val(val):
                if isinstance(val, bytes):
                    return val.decode("utf-8", "ignore")
                return val
                
            existing_attrs = {k: decode_val(v) for k, v in existing_attrs.items()}
            
            # Merge existing attributes with new metadata
            merged_metadata = {**existing_attrs, **request.metadata}
            
            # 2. Extract spot number from the old filename
            old_name = old_abs_path.name
            match = re.search(r'Spot(\d+)', old_name, re.IGNORECASE)
            spot_str = f"Spot{match.group(1)}" if match else "Spot1"
            
            # 3. Build new filename
            parts = []
            sample = (
                merged_metadata.get("sample_code") or
                merged_metadata.get("sample_name") or
                merged_metadata.get("sample_id") or "unknown"
            )
            # Sanitise: µ → u, strip anything not filename-safe, cap at 25 chars
            def sanitise(val: str, maxlen: int = 25) -> str:
                val = str(val).replace("µ", "u").replace("μ", "u")
                val = re.sub(r'[^a-zA-Z0-9\-\.]', '', val)
                return val[:maxlen]

            def is_junk_value(val: str) -> bool:
                """Return True for values that should NOT appear in the filename."""
                v = str(val)
                if len(v) > 60:                                  # too long → skip
                    return True
                if re.search(r'\.(txt|csv|mat|h5|hdf5)$', v, re.IGNORECASE):  # raw filename
                    return True
                if re.search(r'\d{4}-\d{2}-\d{2}', v):          # contains a date
                    return True
                if re.match(r'^\d+\.\d+\.\d+', v):               # version string x.y.z
                    return True
                if re.match(r'^\d+\.\d+$', v) and float(v) < 0.01:  # tiny float artifact
                    return True
                if '\\' in v or '/' in v:                         # filesystem path
                    return True
                return False

            parts.append(sanitise(sample, 20))

            technique = merged_metadata.get("technique", "raman")
            parts.append(sanitise(technique.upper(), 10))

            # Extract ordered custom keys
            ordered_keys = merged_metadata.get("__order__", [])
            if isinstance(ordered_keys, str):
                import json
                try:
                    ordered_keys = json.loads(ordered_keys)
                except Exception:
                    ordered_keys = []

            system_keys = {
                'equipment', 'notes', '__order__', 'file_origin', 'drive_file_link',
                'local_h5_paths', 'original_files', 'local_h5_path', 'original_file',
                'raman_spectrum_file_id', '__bulk_id__', 'file_metadata', 'attached_images',
                'attached_image', 'group_id', 'sample_id', 'sample_code', 'sample_name',
                'logbook_name', 'technique', 'performed_at', 'created_at', 'updated_at',
                'points', 'spectra', 'range', 'start_time', 'end_time',
            }

            params = {}
            for k in ordered_keys:
                if k in merged_metadata and k.lower() not in system_keys:
                    params[k] = merged_metadata[k]

            # Add any remaining non-system keys not already captured
            for k, v in merged_metadata.items():
                if k.lower() not in system_keys and k not in params:
                    params[k] = v

            # Append clean, short tokens — skip junk values
            for k, v in params.items():
                if not v:
                    continue
                raw = str(v)
                if is_junk_value(raw):
                    continue
                clean_v = sanitise(raw, 20)
                if clean_v:
                    parts.append(clean_v)

            parts.append(spot_str)

            # Build filename and hard-cap at 150 chars stem to stay well under MAX_PATH
            stem = "_".join(parts)
            if len(stem) > 150:
                # Keep sample id + technique + spot, truncate the middle
                core = f"{parts[0]}_{parts[1]}"
                tail = f"_{spot_str}"
                budget = 150 - len(core) - len(tail)
                middle = "_".join(parts[2:-1])[:max(0, budget)]
                stem = f"{core}_{middle}{tail}" if middle else f"{core}{tail}"

            new_filename = stem + ".h5"
            
            # 4. Determine new directory subpath
            new_subpath = _build_vault_subpath(merged_metadata)
            new_dir = vault_root / new_subpath
            new_dir.mkdir(parents=True, exist_ok=True)
            
            new_abs_path = new_dir / new_filename
            
            # Ensure no overwrite if file with new name already exists
            if new_abs_path.exists() and new_abs_path != old_abs_path:
                stem = new_abs_path.stem
                ext = new_abs_path.suffix
                counter = 1
                while new_abs_path.exists():
                    new_abs_path = new_dir / f"{stem}_{counter}{ext}"
                    counter += 1
            
            # 5. Physically rename / move the file
            if old_abs_path != new_abs_path:
                shutil.move(str(old_abs_path), str(new_abs_path))
                
            # 6. Open the new file in r+ mode and update all attributes
            try:
                with h5py.File(new_abs_path, "r+") as f:
                    for k, v in merged_metadata.items():
                        if v is not None:
                            try:
                                if isinstance(v, (dict, list)):
                                    import json
                                    f.attrs[k] = json.dumps(v)
                                else:
                                    f.attrs[k] = str(v)
                            except Exception:
                                pass
            except Exception as e:
                print(f"Error updating new H5 attributes for {new_abs_path}: {e}")
                
            # Keep track of renamed path
            new_rel_path = new_abs_path.relative_to(vault_root).as_posix()
            renamed_paths[rel_path] = new_rel_path
            
        return RenameResponse(
            success=True,
            renamed_paths=renamed_paths,
            message="Successfully renamed and updated local HDF5 files."
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"File renaming failed: {str(e)}")




# =============================================================================
# DECONVOLUTION ENDPOINTS
# =============================================================================

class DeconvolutionFitRequest(BaseModel):
    vault_root: str
    h5_relative_path: str
    peaks: list[dict]           # list of PeakConfig dicts
    baseline_method: str = "asls"
    baseline_params: Optional[dict] = None
    mask_peaks: bool = False

class DeconvolutionApplyRequest(BaseModel):
    vault_root: str
    h5_relative_path: str
    peaks: list[dict]
    baseline_method: str = "asls"
    baseline_params: Optional[dict] = None
    mask_peaks: bool = False
    threshold_snr: float = 5.0
    warm_start: bool = False
    use_clustering: bool = False

@app.get("/api/deconvolution/templates")
def get_deconvolution_templates():
    """Return all available model templates with their descriptions and default peaks."""
    from scripts.deconvolution_engine import MODEL_TEMPLATES
    # Make serializable (no dataclasses)
    out = {}
    for key, tmpl in MODEL_TEMPLATES.items():
        out[key] = {
            "label": tmpl["label"],
            "description": tmpl["description"],
            "peaks": tmpl["peaks"],  # already plain dicts
        }
    return {"success": True, "templates": out}


@app.post("/api/deconvolution/fit-representative")
def deconvolution_fit_representative(request: DeconvolutionFitRequest):
    """
    Fit peaks on the representative (median) spectrum of the file.
    Used for interactive adjustment before applying to the full map.
    """
    from scripts.deconvolution_engine import fit_spectrum
    from processor import get_representative_spectrum

    path = Path(request.vault_root) / request.h5_relative_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="HDF5 file not found")

    # Get representative spectrum
    rep = get_representative_spectrum(request.vault_root, [request.h5_relative_path])
    if not rep:
        raise HTTPException(status_code=404, detail="Could not extract representative spectrum")

    x = np.array([pt["x"] for pt in rep])
    y = np.array([pt["y"] for pt in rep])

    if not request.peaks:
        return {"success": False, "message": "No peaks provided"}

    params = request.baseline_params or {}
    if request.mask_peaks and request.peaks:
        # Create exclusion zones based on current peaks (center +/- fwhm)
        exclude_regions = []
        for p in request.peaks:
            if p.get("active", True):
                c = float(p.get("center", 0))
                w = float(p.get("fwhm_init", 50))
                exclude_regions.append((c - w*1.5, c + w*1.5))
        params["exclude_regions"] = exclude_regions

    result = fit_spectrum(
        x=x,
        y=y,
        peaks=request.peaks,
        baseline_method=request.baseline_method,
        baseline_params=params,
    )

    def arr(a):
        return [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x, a)]

    return {
        "success": result.success,
        "message": result.message,
        "original":   arr(y),
        "corrected":  arr(result.corrected),
        "baseline":   arr(result.baseline),
        "best_fit":   arr(result.best_fit),
        "residuals":  arr(result.residuals),
        "components": {
            name: arr(vals) for name, vals in result.components.items()
        },
        "parameters": result.parameters,
        "metrics":    result.metrics,
        "local_metrics": result.local_metrics,
    }


@app.post("/api/deconvolution/apply-to-map")
def deconvolution_apply_to_map(request: DeconvolutionApplyRequest):
    """
    Batch fit over every spectrum in the map.
    Returns per-pixel parameter arrays and statistical quality metrics.
    This is the heavy endpoint; it processes all N spectra sequentially.
    """
    from scripts.deconvolution_engine import fit_map_batch

    path = Path(request.vault_root) / request.h5_relative_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="HDF5 file not found")

    try:
        with h5py.File(path, "r") as f:
            wavenumbers  = f["/spectrum/wavenumbers"][:]
            intensities  = f["/spectrum/intensities"][:]

        if intensities.ndim == 1:
            intensities = intensities.reshape(1, -1)

        result = fit_map_batch(
            wavenumbers=wavenumbers,
            intensities_2d=intensities,
            peaks=request.peaks,
            baseline_method=request.baseline_method,
            baseline_params=request.baseline_params or {},
            threshold_snr=request.threshold_snr,
            warm_start=request.warm_start,
            use_clustering=request.use_clustering,
        )
        result["success"] = True
        return result

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Batch fit failed: {str(e)}")


class DeconvolutionAutoDetectRequest(BaseModel):
    vault_root: str
    h5_relative_path: str
    baseline_method: str = "asls"
    baseline_params: dict = {}
    threshold: float = 0.05

@app.post("/api/deconvolution/auto-detect")
def deconvolution_auto_detect(request: DeconvolutionAutoDetectRequest):
    """
    Auto-detect peaks on the representative spectrum using scipy.
    Returns a list of suggested PeakConfig dicts.
    """
    from scripts.deconvolution_engine import auto_detect_peaks, apply_baseline
    from processor import get_representative_spectrum

    rep = get_representative_spectrum(request.vault_root, [request.h5_relative_path])
    if not rep:
        raise HTTPException(status_code=404, detail="Could not extract representative spectrum")

    x = np.array([pt["x"] for pt in rep])
    y = np.array([pt["y"] for pt in rep])

    # Apply baseline first so detection is on corrected spectrum
    y_corr, _ = apply_baseline(x, y, request.baseline_method, request.baseline_params or {})

    detected = auto_detect_peaks(x, y_corr, prominence=request.threshold)
    return {"success": True, "peaks": detected}


class DeconvolutionPreviewBaselineRequest(BaseModel):
    vault_root: str
    h5_relative_path: str
    baseline_method: str = "asls"
    baseline_params: dict = {}

@app.post("/api/deconvolution/preview-baseline")
def deconvolution_preview_baseline(request: DeconvolutionPreviewBaselineRequest):
    from scripts.deconvolution_engine import apply_baseline
    from processor import get_representative_spectrum

    rep = get_representative_spectrum(request.vault_root, [request.h5_relative_path])
    if not rep:
        raise HTTPException(status_code=404, detail="Could not extract representative spectrum")

    x = np.array([pt["x"] for pt in rep])
    y = np.array([pt["y"] for pt in rep])

    y_corr, baseline = apply_baseline(x, y, request.baseline_method, request.baseline_params)

    return {
        "success": True,
        "baseline": [{"x": float(x[i]), "y": float(baseline[i])} for i in range(len(x))],
        "corrected": [{"x": float(x[i]), "y": float(y_corr[i])} for i in range(len(x))]
    }

@app.post("/api/deconvolution/save-config")
def deconvolution_save_config(request: DeconvolutionFitRequest):
    import json
    path = Path(request.vault_root) / request.h5_relative_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="HDF5 file not found")
    try:
        with h5py.File(path, "r+") as f:
            if "config" not in f:
                f.create_group("config")
            config_data = {
                "peaks": request.peaks,
                "baseline_method": request.baseline_method,
                "baseline_params": request.baseline_params or {},
                "updated_at": datetime.now().isoformat()
            }
            f["config"].attrs["deconvolution"] = json.dumps(config_data)
        return {"success": True, "message": "Configuration saved to file"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/deconvolution/load-config")
def deconvolution_load_config(request: dict):
    import json
    path = Path(request.get("vault_root")) / request.get("h5_relative_path")
    if not path.exists():
        return {"success": False, "message": "File not found"}
    try:
        with h5py.File(path, "r") as f:
            if "config" in f and "deconvolution" in f["config"].attrs:
                data = json.loads(f["config"].attrs["deconvolution"])
                return {"success": True, "config": data}
        return {"success": False, "message": "No saved config found"}
    except Exception as e:
        return {"success": False, "message": str(e)}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8888, reload=False)

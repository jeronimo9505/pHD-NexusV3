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
from processor import convert_to_h5, organize_file, generate_preview

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
    analyte: Optional[str] = None
    laser_wavelength_nm: Optional[int] = None
    laser_power_uw: Optional[float] = None
    integration_time_s: Optional[float] = None
    accumulations: Optional[int] = 1
    technique: Optional[str] = "raman"
    measured_at: Optional[str] = None


class IngestResponse(BaseModel):
    success: bool
    h5_relative_path: str        # Relative path from vault_root to the .h5 file
    preview_base64: Optional[str] = None  # PNG preview as base64
    wavenumber_range: Optional[list] = None
    n_points: Optional[int] = None
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
        "sample_id": request.sample_id or "",
        "analyte": request.analyte or metadata.get("analyte", ""),
        "laser_wavelength_nm": request.laser_wavelength_nm or metadata.get("laser_wavelength_nm", 0),
        "laser_power_uw": request.laser_power_uw or metadata.get("laser_power_uw", 0.0),
        "integration_time_s": request.integration_time_s or metadata.get("integration_time_s", 0.0),
        "accumulations": request.accumulations or 1,
        "technique": request.technique or "raman",
        "source_format": ext.lstrip("."),
        "original_filename": source_path.name,
        "measured_at": request.measured_at or "",
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


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8765, reload=False)

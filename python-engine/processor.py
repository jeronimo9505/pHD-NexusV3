"""
File processor: converts spectral data to HDF5, organizes in vault, and generates preview PNGs.
"""

import h5py
import numpy as np
import base64
import io
from pathlib import Path
from datetime import datetime
from typing import Tuple, Dict, Any, Optional, List
import shutil


def _build_h5_filename(metadata: Dict[str, Any], target_dir: Path) -> str:
    """
    Smart rename: {SampleCode}_{Technique}_{Param1}..._Spot{X}.h5
    Falls back gracefully if metadata is missing. Auto-increments Spot {X}.
    """
    parts = []
    
    # Prefer sample_code or sample_name as the primary identifier
    sample = metadata.get("sample_code") or metadata.get("sample_name") or metadata.get("analyte") or metadata.get("sample_id") or "unknown"
    parts.append(str(sample)[:20])
    
    technique = metadata.get("technique", "raman")
    parts.append(technique.upper())
    
    params = metadata.get("parameters", {})
    if params:
        # Append parameters with their exact strings (e.g. 70 uW, 1 s)
        for k, v in params.items():
            if v:
                clean_v = str(v).replace(" ", "")
                parts.append(clean_v)
    else:
        # Fallback for old endpoints
        laser = metadata.get("laser_wavelength_nm")
        if laser:
            parts.append(f"{laser}nm")
        power = metadata.get("laser_power_uw")
        if power:
            parts.append(f"{float(power):.1f}uW")

    import re
    existing_spots = []
    if target_dir.exists():
        for f in target_dir.glob("*.h5"):
            # Check all .h5 files that start with the Sample code to count spots globally for this sample folder
            if f.name.startswith(parts[0]):
                match = re.search(r'Spot(\d+)\.h5$', f.name, re.IGNORECASE)
                if match:
                    existing_spots.append(int(match.group(1)))
                    
    next_spot = max(existing_spots) + 1 if existing_spots else 1
    parts.append(f"Spot{next_spot}")
    
    filename = "_".join(parts) + ".h5"
    
    # Safely clean out invalid characters but keep greek micro symbols
    filename = re.sub(r'[^a-zA-Z0-9_\-\.μµ]', '_', filename)
    return filename


def _clean_name(s: str) -> str:
    """Safely cleans a string for use as a folder name."""
    import re
    if not s: return ""
    # Replace forbidden Windows characters with a dash
    s = re.sub(r'[\\/:*?"<>|]', '-', s)
    # Filter to only allowed characters (alphanumeric, spaces, underscores, dashes, dots, micro symbols)
    s = re.sub(r'[^a-zA-Z0-9_\-\.μµ ]', '', s)
    # Remove extra spaces
    s = " ".join(s.split())
    return s.strip()


def _build_vault_subpath(metadata: Dict[str, Any]) -> str:
    """
    Global Architecture Data Vault: /{LogbookName}/{SampleCode - SampleName}/{Technique}/{Year}/
    """
    # 1. Logbook Level
    logbook_name = metadata.get("logbook_name")
    if logbook_name:
        logbook_folder = _clean_name(logbook_name)
    else:
        # Fallback to group_id segment if no name provided
        group_id = metadata.get("group_id", "Default_Logbook")
        if len(str(group_id)) == 36 and "-" in str(group_id):
            logbook_folder = f"Logbook_{str(group_id)[:8]}"
        else:
            logbook_folder = _clean_name(str(group_id))[:30]

    # 2. Sample Level: [Code] - [Name]
    code = metadata.get("sample_code") or ""
    name = metadata.get("sample_name") or metadata.get("analyte") or ""
    
    if code and name:
        sample_folder = _clean_name(f"{code} - {name}")
    elif code:
        sample_folder = _clean_name(code)
    elif name:
        sample_folder = _clean_name(name)
    else:
        # Emergency Fallback to ID
        sample_id = metadata.get("sample_id", "unknown")
        if len(str(sample_id)) == 36 and "-" in str(sample_id):
            sample_folder = f"Sample_{str(sample_id)[:8]}"
        else:
            sample_folder = _clean_name(str(sample_id))[:30]

    # Limit folder name length for safety
    logbook_folder = logbook_folder[:100] or "Unknown_Logbook"
    sample_folder = sample_folder[:100] or "Unknown_Sample"
    
    # 3. Technique Level
    technique = metadata.get("technique", "raman").upper()
    
    # 4. Temporal Level (Year)
    year = datetime.now().year
    
    return f"{logbook_folder}/{sample_folder}/{technique}/{year}"



def convert_to_h5(
    wavenumbers: np.ndarray,
    intensities: np.ndarray,
    metadata: Dict[str, Any],
    vault_root: str,
) -> Tuple[Path, str]:
    """
    Convert spectrum to HDF5 and save in vault.
    
    Returns:
        h5_path: absolute Path to the created .h5 file
        relative_path: path relative to vault_root (stored in Supabase)
    """
    subpath = _build_vault_subpath(metadata)
    
    abs_dir = Path(vault_root) / subpath
    abs_dir.mkdir(parents=True, exist_ok=True)

    filename = _build_h5_filename(metadata, abs_dir)
    
    h5_path = abs_dir / filename
    relative_path = f"{subpath}/{filename}"
    
    with h5py.File(h5_path, "w") as f:
        # Store spectrum data
        grp = f.create_group("spectrum")
        ds_wn = grp.create_dataset("wavenumbers", data=wavenumbers, compression="gzip")
        ds_wn.attrs["units"] = "cm^-1"
        ds_wn.attrs["label"] = "Raman Shift"
        
        ds_int = grp.create_dataset("intensities", data=intensities, compression="gzip")
        ds_int.attrs["units"] = "counts"
        ds_int.attrs["label"] = "Intensity"
        
        # Store all metadata as root attributes
        for key, value in metadata.items():
            if value is not None:
                try:
                    f.attrs[key] = str(value)
                except Exception:
                    pass
        
        f.attrs["created_at"] = datetime.now().isoformat()
        f.attrs["phdnexus_version"] = "0.1.0"
    
    return h5_path, relative_path


def generate_preview(
    wavenumbers: np.ndarray,
    intensities: np.ndarray,
    metadata: Dict[str, Any],
) -> Optional[str]:
    """
    Generate a clean spectrum preview PNG, return as base64 string.
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        
        fig, ax = plt.subplots(figsize=(8, 4), dpi=100)
        fig.patch.set_facecolor("#0f172a")
        ax.set_facecolor("#1e293b")
        
        ax.plot(wavenumbers, intensities, color="#818cf8", linewidth=1.2, alpha=0.95)
        ax.fill_between(wavenumbers, intensities, alpha=0.15, color="#818cf8")
        
        # Labels
        laser = metadata.get("laser_wavelength_nm")
        analyte = metadata.get("analyte", "")
        title = f"{analyte} - {laser}nm" if analyte and laser else "Raman Spectrum"
        
        ax.set_title(title, color="#e2e8f0", fontsize=11, pad=8)
        ax.set_xlabel("Raman Shift (cm⁻¹)", color="#94a3b8", fontsize=9)
        ax.set_ylabel("Intensity (counts)", color="#94a3b8", fontsize=9)
        ax.tick_params(colors="#64748b", labelsize=8)
        for spine in ax.spines.values():
            spine.set_edgecolor("#334155")
        
        ax.grid(True, color="#1e293b", linewidth=0.5, alpha=0.5)
        
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format="png", bbox_inches="tight", facecolor=fig.get_facecolor())
        plt.close(fig)
        buf.seek(0)
        
        return base64.b64encode(buf.read()).decode("utf-8")
    except Exception as e:
        print(f"Preview generation failed: {e}")
        return None

def copy_file_to_vault(
    source_path: Path,
    metadata: Dict[str, Any],
    vault_root: str,
) -> Tuple[Path, str]:
    """
    Copies a generic file to the vault without conversion.
    Maintains original filename but follows vault directory organization.
    """
    subpath = _build_vault_subpath(metadata)
    abs_dir = Path(vault_root) / subpath
    abs_dir.mkdir(parents=True, exist_ok=True)

    target_path = abs_dir / source_path.name
    
    # If file exists, add a suffix to avoid overwriting
    if target_path.exists():
        stem = source_path.stem
        ext = source_path.suffix
        counter = 1
        while target_path.exists():
            target_path = abs_dir / f"{stem}_{counter}{ext}"
            counter += 1
            
    shutil.copy2(source_path, target_path)
    relative_path = target_path.relative_to(Path(vault_root)).as_posix()
    
    return target_path, relative_path

def get_representative_spectrum(vault_root: str, h5_relative_paths: List[str]) -> List[Dict[str, float]]:
    """
    Computes a single representative spectrum (median) from multiple H5 files or a map.
    Ensures all spectra are aligned to the same X-grid before merging.
    """
    if not h5_relative_paths:
        return []

    target_wn = None
    all_spectra = []

    for rel_path in h5_relative_paths:
        abs_path = Path(vault_root) / rel_path
        if not abs_path.exists(): continue
        
        try:
            with h5py.File(abs_path, 'r') as f:
                if "spectrum" not in f: continue
                
                wn = f["spectrum/wavenumbers"][:]
                ints = f["spectrum/intensities"][:]
                
                # Force 2D (n_spectra, n_points)
                if ints.ndim == 1:
                    ints = ints.reshape(1, -1)
                
                # Sort this file's data by wavenumber
                idx = np.argsort(wn)
                wn = wn[idx]
                ints = ints[:, idx]
                
                if target_wn is None:
                    target_wn = wn
                    
                # Align if grids differ
                if not np.array_equal(wn, target_wn):
                    from scipy.interpolate import interp1d
                    for i in range(ints.shape[0]):
                        f_int = interp1d(wn, ints[i], bounds_error=False, fill_value=0)
                        all_spectra.append(f_int(target_wn))
                else:
                    for i in range(ints.shape[0]):
                        all_spectra.append(ints[i])
        except Exception as e:
            print(f"Error reading {rel_path}: {e}")

    if target_wn is None or not all_spectra:
        return []

    # Median aggregate
    stacked = np.vstack(all_spectra)
    median_spec = np.median(stacked, axis=0)
    
    # Final data conversion for JSON
    return [{"x": float(x), "y": float(y)} for x, y in zip(target_wn, median_spec)]

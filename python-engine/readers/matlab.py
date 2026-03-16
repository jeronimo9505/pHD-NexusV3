"""
MATLAB .mat file reader.
Handles both legacy (.mat v5) and HDF5-based (.mat v7.3) files from MATLAB.
"""

import numpy as np
from pathlib import Path
from typing import Tuple, Dict, Any


def read_matlab_mat(path: Path) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
    """
    Parse a MATLAB .mat file containing spectral data.
    
    Expects the .mat file to contain variables named (case-insensitive):
    - 'wavenumber', 'wavelength', or 'x' for the x-axis
    - 'intensity', 'spectrum', or 'y' for the intensity
    
    Returns:
        wavenumbers: 1D numpy array
        intensities: 1D numpy array
        metadata: dict with any metadata found
    """
    metadata: Dict[str, Any] = {}

    try:
        import scipy.io as sio
        mat = sio.loadmat(str(path))
    except NotImplementedError:
        # HDF5-based .mat v7.3
        try:
            import h5py
            with h5py.File(path, "r") as f:
                return _read_mat_h5(f)
        except Exception as e:
            raise ValueError(f"Cannot read .mat v7.3 file: {e}")
    except Exception as e:
        raise ValueError(f"Cannot read .mat file: {e}")

    # Find wavenumber and intensity arrays
    wavenumbers = _find_array(mat, ["wavenumber", "wavenumbers", "wavelength", "x", "raman_shift"])
    intensities = _find_array(mat, ["intensity", "intensities", "spectrum", "y", "signal"])

    if wavenumbers is None:
        raise ValueError("Could not find wavenumber array. Expected variable named: wavenumber, wavelength, or x.")
    if intensities is None:
        raise ValueError("Could not find intensity array. Expected variable named: intensity, spectrum, or y.")

    wavenumbers = wavenumbers.flatten()
    intensities = intensities.flatten()

    metadata["wavenumber_min"] = float(np.min(wavenumbers))
    metadata["wavenumber_max"] = float(np.max(wavenumbers))
    metadata["total_points"] = len(wavenumbers)

    return wavenumbers, intensities, metadata


def _find_array(mat: dict, candidates: list) -> np.ndarray | None:
    """Search a mat dict for a variable matching a list of candidate names."""
    keys_lower = {k.lower(): k for k in mat.keys() if not k.startswith("_")}
    for c in candidates:
        if c in keys_lower:
            arr = mat[keys_lower[c]]
            if isinstance(arr, np.ndarray):
                return arr.squeeze()
    return None


def _read_mat_h5(f) -> Tuple[np.ndarray, np.ndarray, Dict]:
    """Read HDF5-based .mat v7.3 file."""
    import h5py
    candidates_x = ["wavenumber", "wavenumbers", "wavelength", "x", "raman_shift"]
    candidates_y = ["intensity", "intensities", "spectrum", "y", "signal"]

    keys_lower = {k.lower(): k for k in f.keys()}

    x_key = next((keys_lower[c] for c in candidates_x if c in keys_lower), None)
    y_key = next((keys_lower[c] for c in candidates_y if c in keys_lower), None)

    if x_key is None or y_key is None:
        raise ValueError("Could not find wavenumber or intensity arrays in .mat v7.3 file.")

    wavenumbers = np.array(f[x_key]).flatten()
    intensities = np.array(f[y_key]).flatten()
    return wavenumbers, intensities, {}

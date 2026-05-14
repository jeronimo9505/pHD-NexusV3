import numpy as np
from pathlib import Path
from typing import Tuple, Dict, Any

def read_witec_txt(path: Path) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
    """
    Parse a Witec .txt spectrum file, handling maps and single spectra.
    Robustly detects stacked 2-column formats and multi-column formats.
    """
    metadata: Dict[str, Any] = {}
    data_lines = []

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    # Separate header from data
    for line in lines:
        stripped = line.strip()
        if not stripped: continue
        parts = stripped.replace(",", ".").split()
        try:
            float(parts[0])
            data_lines.append([float(p.replace(",", ".")) for p in parts])
        except (ValueError, IndexError):
            continue

    if not data_lines:
        raise ValueError("No numeric data found in file.")

    array = np.array(data_lines)
    
    # Case 1: Multi-column format (Wn, Int1, Int2, ...)
    if array.shape[1] > 2:
        wavenumbers = array[:, 0]
        intensities = array[:, 1:].T
    # Case 2: Stacked 2-column format (Wn, Int) repeated for each spectrum
    else:
        raw_wn = array[:, 0]
        raw_int = array[:, 1]
        
        # Detect where the X axis restarts (new spectrum)
        # We look for a significant jump back in wavenumber
        if len(raw_wn) > 1:
            # Determine if it's descending or ascending
            is_descending = raw_wn[1] < raw_wn[0]
            if is_descending:
                restarts = np.where(np.diff(raw_wn) > 100)[0] # Large positive jump in descending data
            else:
                restarts = np.where(np.diff(raw_wn) < -100)[0] # Large negative jump in ascending data
            
            if len(restarts) > 0:
                # It's a stacked map
                n_points = restarts[0] + 1
                n_spectra = len(raw_wn) // n_points
                wavenumbers = raw_wn[:n_points]
                intensities = raw_int[:n_spectra * n_points].reshape(n_spectra, n_points)
            else:
                # Just a single spectrum
                wavenumbers = raw_wn
                intensities = raw_int.reshape(1, -1)
        else:
            wavenumbers = raw_wn
            intensities = raw_int.reshape(1, -1)

    # CRITICAL: Always return data in ASCENDING wavenumber order
    if len(wavenumbers) > 1 and wavenumbers[1] < wavenumbers[0]:
        wavenumbers = wavenumbers[::-1]
        intensities = intensities[:, ::-1]

    metadata["wavenumber_min"] = float(np.min(wavenumbers))
    metadata["wavenumber_max"] = float(np.max(wavenumbers))
    metadata["total_points"] = len(wavenumbers)
    metadata["n_spectra"] = intensities.shape[0]

    return wavenumbers, intensities, metadata

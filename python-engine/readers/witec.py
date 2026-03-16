"""
Witec .txt file reader.
Handles single spectrum and map spectral files from Witec microscopes.

Typical Witec .txt format:
-----------
(optional header lines starting with # or other char)
Wavenumber  Intensity
100.0       235.4
101.0       237.8
...
-----------
"""

import numpy as np
from pathlib import Path
from typing import Tuple, Dict, Any


def read_witec_txt(path: Path) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
    """
    Parse a Witec .txt spectrum file.
    
    Returns:
        wavenumbers: 1D numpy array of Raman shift (cm^-1)
        intensities: 1D or 2D numpy array of intensity counts
        metadata: dict with any header information extracted
    """
    metadata: Dict[str, Any] = {}
    header_lines = []
    data_lines = []

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    # Separate header from data
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        
        # Try to parse as float pair
        parts = stripped.replace(",", ".").split()
        try:
            float(parts[0])
            data_lines.append(parts)
        except (ValueError, IndexError):
            # It's a header line
            header_lines.append(stripped)

    # Extract metadata from header
    for h in header_lines:
        lower = h.lower()
        if "laser" in lower and "nm" in lower:
            # e.g. "Laser: 633 nm"
            try:
                metadata["laser_wavelength_nm"] = int("".join(filter(str.isdigit, h.split("nm")[0])))
            except Exception:
                pass
        if "power" in lower or "intensity" in lower:
            metadata["raw_header_power"] = h
        if "integration" in lower or "accumulation" in lower:
            metadata["raw_header_time"] = h

    # Parse the data
    if not data_lines:
        raise ValueError("No numeric data found in file. Make sure it has two columns (wavenumber, intensity).")

    try:
        array = np.array([[float(p.replace(",", ".")) for p in row[:2]] for row in data_lines if len(row) >= 2])
    except ValueError as e:
        raise ValueError(f"Could not parse data rows: {e}")

    if array.shape[1] < 2:
        raise ValueError("Expected at least 2 columns (wavenumber, intensity).")

    wavenumbers = array[:, 0]
    intensities = array[:, 1]

    metadata["wavenumber_min"] = float(np.min(wavenumbers))
    metadata["wavenumber_max"] = float(np.max(wavenumbers))
    metadata["total_points"] = len(wavenumbers)

    return wavenumbers, intensities, metadata

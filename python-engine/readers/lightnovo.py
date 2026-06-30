import numpy as np
import math
from pathlib import Path
from typing import Tuple, Dict, Any
import re

def parse_filename_metadata(filename: str) -> dict:
    meta = {}
    laser_match = re.search(r'(\d+)\s*nm', filename, re.IGNORECASE)
    if laser_match:
        meta['laser_wavelength_nm'] = int(laser_match.group(1))

    power_match = re.search(r'(?:power[^\d]*)?(\d+(?:\.\d+)?)\s*(uW|µW|mW)?', filename, re.IGNORECASE)
    if power_match:
        val = float(power_match.group(1))
        unit = power_match.group(2)
        if "power" in filename.lower() or power_match.group(2):
            if unit:
                unit = unit.lower()
            else:
                unit = 'mw' if val < 10.0 else 'uw'
                
            if 'mw' in unit:
                meta['laser_power_mw'] = val
                meta['laser_power_uw'] = val * 1000
            else:
                meta['laser_power_uw'] = val

    time_match = re.search(r'(\d+(?:\.\d+)?)\s*(s|ms)', filename, re.IGNORECASE)
    if time_match:
        val = float(time_match.group(1))
        unit = time_match.group(2).lower()
        if 'ms' in unit:
            meta['exposure_ms'] = val
            meta['integration_time_s'] = val / 1000.0
        else:
            meta['integration_time_s'] = val
            meta['exposure_ms'] = val * 1000.0

    acc_match = re.search(r'(\d+)\s*acc', filename, re.IGNORECASE)
    if acc_match:
        meta['accumulations'] = int(acc_match.group(1))

    obj_match = re.search(r'(\d+)\s*x', filename, re.IGNORECASE)
    if obj_match:
        is_size = re.search(r'\d+\s*x\s*\d+', filename, re.IGNORECASE)
        if not is_size or obj_match.group(0) not in is_size.group(0):
            meta['objective'] = int(obj_match.group(1))

    analyte_match = re.search(r'_(R6G\d+-\d+|[a-zA-Z0-9]+Au|BLANCO)_', filename)
    if analyte_match:
        meta['analyte'] = analyte_match.group(1)

    return meta

def parse_markdown_metadata(dir_path: Path, target_name: str) -> dict:
    meta = {}
    for md_file in dir_path.glob("*.md"):
        try:
            with open(md_file, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            
            if target_name.lower() not in content.lower():
                continue
                
            lines = content.splitlines()
            for idx, line in enumerate(lines):
                if target_name.lower() in line.lower():
                    # Look ahead for a table starting within next 10 lines
                    for j in range(idx + 1, min(idx + 10, len(lines))):
                        look_line = lines[j].strip()
                        if look_line.startswith("|"):
                            # Parse table
                            for k in range(j, min(j + 20, len(lines))):
                                table_line = lines[k].strip()
                                if not table_line.startswith("|"):
                                    break
                                parts = [p.strip() for p in table_line.split("|")]
                                if parts and not parts[0]:
                                    parts.pop(0)
                                if parts and not parts[-1]:
                                    parts.pop()
                                if len(parts) >= 2:
                                    key = parts[0].strip().replace("`", "").replace(" ", "").replace("_", "").lower()
                                    val = parts[1].strip().replace("`", "")
                                    if not val or val == "Valor visible" or "---" in val or "---" in key:
                                        continue
                                    
                                    if "wavelength" in key or "laser" == key or "laserwavelength" in key:
                                        num_match = re.search(r'\d+', val)
                                        if num_match:
                                            meta['laser_wavelength_nm'] = int(num_match.group(0))
                                    elif "exposure" in key or "time" in key or "exposurems" in key:
                                        num_match = re.search(r'\d+', val)
                                        if num_match:
                                            ms = float(num_match.group(0))
                                            meta['exposure_ms'] = ms
                                            meta['integration_time_s'] = ms / 1000.0
                                    elif "devicesn" in key or "sn" in key or "serial" in key:
                                        meta['device_sn'] = val
                                    elif "current" in key or "lasercurrent" in key:
                                        num_match = re.search(r'\d+', val)
                                        if num_match:
                                            meta['laser_current_mA'] = float(num_match.group(0))
                                    elif "gain" in key:
                                        num_match = re.search(r'\d+', val)
                                        if num_match:
                                            meta['gain_multiplier'] = float(num_match.group(0))
                                    elif "accumulations" in key or "acquisitions" in key or "repetition" in key:
                                        num_match = re.search(r'\d+', val)
                                        if num_match:
                                            meta['accumulations'] = int(num_match.group(0))
                                    elif "power" in key:
                                        num_match = re.search(r'(\d+(?:\.\d+)?)\s*(uW|µW|mW|W)?', val, re.IGNORECASE)
                                        if num_match:
                                            p_val = float(num_match.group(1))
                                            p_unit = num_match.group(2)
                                            if p_unit:
                                                p_unit = p_unit.lower()
                                            elif "mw" in key:
                                                p_unit = 'mw'
                                            elif "uw" in key or "µw" in key:
                                                p_unit = 'uw'
                                            else:
                                                p_unit = 'mw' if p_val < 10.0 else 'uw'
                                                
                                            if p_unit == 'mw':
                                                meta['laser_power_mw'] = p_val
                                                meta['laser_power_uw'] = p_val * 1000
                                            else:
                                                meta['laser_power_uw'] = p_val
                                    elif "analyte" in key:
                                        meta['analyte'] = val
                                    elif "objective" in key:
                                        num_match = re.search(r'\d+', val)
                                        if num_match:
                                            meta['objective'] = int(num_match.group(0))
                            break
        except Exception as e:
            print(f"Error parsing file {md_file}: {e}")
            
    return meta

def read_mrspectra(path: Path) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
    """
    Parse a Lightnovo Raman .mrspectra file.
    Expects data in float32 little-endian, shaped as Y x X x Channel x SpectralPoint (2 channels, 1101 points).
    """
    raw = np.fromfile(path, dtype="<f4")
    
    n_channels = 2
    n_points = 1101
    values_per_pixel = n_channels * n_points
    
    if raw.size % values_per_pixel != 0:
        raise ValueError(
            f"File size ({raw.size} floats) is not divisible by {values_per_pixel} (2 channels x 1101 spectral points)."
        )
        
    n_pixels = raw.size // values_per_pixel
    side = int(math.sqrt(n_pixels))
    
    if side * side == n_pixels:
        data = raw.reshape(side, side, n_channels, n_points)
        data_flat = data.reshape(-1, n_channels, n_points)
    else:
        data_flat = raw.reshape(-1, n_channels, n_points)
        
    intensities = data_flat[:, 0, :]
    wavenumbers = np.arange(n_points, dtype=np.float32)
    
    target_name = path.stem
    fn_meta = parse_filename_metadata(path.name)
    md_meta = parse_markdown_metadata(path.parent, target_name)
    
    metadata = {**fn_meta, **md_meta}
    if 'objective' not in metadata:
        metadata['objective'] = 10

    metadata["wavenumber_min"] = float(np.min(wavenumbers))
    metadata["wavenumber_max"] = float(np.max(wavenumbers))
    metadata["total_points"] = n_points
    metadata["n_spectra"] = n_pixels
    metadata["source_format"] = "mrspectra"
    
    if side * side == n_pixels:
        metadata["map_height"] = side
        metadata["map_width"] = side
        metadata["spots"] = f"{side}x{side}"
    else:
        metadata["spots"] = f"{n_pixels}x1"
        
    return wavenumbers, intensities, metadata

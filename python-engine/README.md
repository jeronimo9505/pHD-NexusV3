# PhD Nexus Python Science Engine

This is the local scientific processing sidecar for the PhD Nexus Desktop application.

## Quick Start (Development)

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start the engine
python start.py
# OR
uvicorn main:app --host 127.0.0.1 --port 8765 --reload

# 3. Visit the API docs
open http://127.0.0.1:8765/docs
```

## Architecture

- **FastAPI server** runs on `localhost:8765`
- The Tauri desktop app communicates with it via HTTP
- All heavy scientific processing stays local, never uploaded to the cloud

## Files

| File | Purpose |
|---|---|
| `main.py` | FastAPI app, API endpoints |
| `processor.py` | HDF5 converter, file organizer, PNG preview |
| `readers/witec.py` | Witec .txt parser |
| `readers/matlab.py` | MATLAB .mat parser (v5 and v7.3) |
| `readers/lightnovo.py` | Lightnovo `.mrspectra` parser |

## Supported Formats

| Format | Extension | Reader |
|---|---|---|
| Witec ASCII | `.txt` | `readers/witec.py` |
| MATLAB | `.mat` | `readers/matlab.py` |
| Lightnovo | `.mrspectra` | `readers/lightnovo.py` |
| *More coming* | `.csv`, `.spc`, `.sp` | *TBD* |

### Lightnovo `.mrspectra` Metadata Ingestion
The `.mrspectra` files are raw binary float32 files without embedded metadata. The Science Engine automatically looks for a companion `.md` markdown file in the same directory. To auto-fill metadata, create a markdown table containing any of these keys:
* **Laser Power**: `LaserPower_mW` (or any key containing `power`). Supports automatic unit detection and conversion.
* **Accumulations / Repetitions**: `RepetitionCount`, `RepetitionsCount` (or any key containing `repetition`, `accumulations`, or `acquisitions`).
* **Laser Wavelength**: `LaserWavelength_nm` (or containing `laserwavelength` / `laser` / `wavelength`).
* **Exposure / Acquisition Time**: `Exposure_ms` (or containing `exposure` / `time`).
* **Objective**: `Objective` (or containing `objective`).
* **Device Serial**: `DeviceSN` (or containing `devicesn` / `sn` / `serial`).
* **Laser Current**: `LaserCurrent_mA` (or containing `current`).
* **Gain**: `GainMultiplier` (or containing `gain`).

## HDF5 File Structure

```
measurement.h5
├── spectrum/
│   ├── wavenumbers  [float64 array]  (cm^-1)
│   └── intensities  [float64 array]  (counts)
└── (root attributes: metadata)
    ├── group_id
    ├── sample_id
    ├── analyte
    ├── laser_wavelength_nm
    ├── laser_power_uw
    ├── technique
    └── created_at
```

## Vault Folder Structure

```
{vault_root}/
└── {group_id_prefix}/
    └── {technique}/
        └── {year}/
            └── {month}/
                └── {sample}_{technique}_{laser}nm_{power}uW_{datetime}.h5
```

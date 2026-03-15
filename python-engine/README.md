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

## Supported Formats

| Format | Extension | Reader |
|---|---|---|
| Witec ASCII | `.txt` | `readers/witec.py` |
| MATLAB | `.mat` | `readers/matlab.py` |
| *More coming* | `.csv`, `.spc`, `.sp` | *TBD* |

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

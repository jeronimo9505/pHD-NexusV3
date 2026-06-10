import os
import h5py
import numpy as np
import requests
from pathlib import Path

def setup_dummy_files(vault_root: Path):
    sample_dir = vault_root / "Default_Logbook" / "TEST01 - TestSample" / "RAMAN" / "2026"
    sample_dir.mkdir(parents=True, exist_ok=True)

    # Generate 3 dummy files with slightly different wavenumber grids
    # File 1: 100 to 1000 cm^-1, 100 points
    wn1 = np.linspace(100, 1000, 100)
    ints1 = np.sin(wn1 / 100.0) + 10.0

    # File 2: 102 to 1002 cm^-1, 100 points
    wn2 = np.linspace(102, 1002, 100)
    ints2 = np.cos(wn2 / 100.0) + 12.0

    # File 3: 100 to 1000 cm^-1, 100 points
    wn3 = np.linspace(100, 1000, 100)
    ints3 = np.sin(wn3 / 50.0) + 15.0

    files = [
        ("TEST01_RAMAN_785nm_Spot1.h5", wn1, ints1),
        ("TEST01_RAMAN_785nm_Spot2.h5", wn2, ints2),
        ("TEST01_RAMAN_785nm_Spot3.h5", wn3, ints3)
    ]

    paths = []
    for filename, wn, ints in files:
        filepath = sample_dir / filename
        with h5py.File(filepath, "w") as f:
            f.attrs["sample_code"] = "TEST01"
            f.attrs["sample_name"] = "TestSample"
            f.attrs["technique"] = "raman"
            f.attrs["laser_wavelength_nm"] = "785"
            f.attrs["laser_power_uw"] = "100.0"
            f.attrs["integration_time_s"] = "1.0"

            grp = f.create_group("spectrum")
            grp.create_dataset("wavenumbers", data=wn)
            grp.create_dataset("intensities", data=ints)

        rel_path = filepath.relative_to(vault_root).as_posix()
        paths.append(rel_path)
        print(f"Created dummy file: {filepath} (relative: {rel_path})")

    return paths

def run_test():
    vault_root = Path(os.getcwd()) / "scratch" / "dummy_vault"
    h5_paths = setup_dummy_files(vault_root)

    url = "http://127.0.0.1:8888/api/map/group"
    payload = {
        "vault_root": str(vault_root),
        "h5_relative_paths": h5_paths,
        "group_name": "TEST01_RAMAN_GroupedMap.h5"
    }

    print("\nSending request to group endpoint...")
    try:
        response = requests.post(url, json=payload)
        print("Response status code:", response.status_code)
        res_data = response.json()
        print("Response data:", res_data)

        if res_data.get("success"):
            new_rel_path = res_data["file"]["h5_relative_path"]
            new_abs_path = vault_root / new_rel_path
            print(f"\nVerifying grouped H5 file at {new_abs_path}...")
            with h5py.File(new_abs_path, "r") as f:
                print("Attributes:")
                for k in f.attrs.keys():
                    print(f"  {k}: {f.attrs[k]}")

                print("Datasets:")
                wn = f["spectrum/wavenumbers"][:]
                ints = f["spectrum/intensities"][:]
                print(f"  wavenumbers shape: {wn.shape}")
                print(f"  intensities shape: {ints.shape}")

                assert ints.shape == (3, 100), f"Expected shape (3, 100), got {ints.shape}"
                print("\nSUCCESS: Verification passed! Shape is correct and spectra are aligned.")
        else:
            print("FAILURE: Grouping endpoint returned success=False")
    except Exception as e:
        print("Error connecting to server or verifying:", e)

if __name__ == "__main__":
    run_test()

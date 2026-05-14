import h5py
import numpy as np
import os

# Try to find the file mentioned in the screenshot
search_path = r"C:\Users\Rodrigo\OneDrive - unizar.es\phd-Rodrigo\Logbook_28054599"
target_file = "A4_RAMAN_R6G10-6_633nm_71µW_50x_2s_20_5x5map_Spot1.h5"

found_path = None
for root, dirs, files in os.walk(search_path):
    if target_file in files:
        found_path = os.path.join(root, target_file)
        break

if not found_path:
    print(f"File not found: {target_file}")
else:
    print(f"Found: {found_path}")
    try:
        with h5py.File(found_path, 'r') as f:
            ints = f["spectrum/intensities"][:]
            wns = f["spectrum/wavenumbers"][:]
            print(f"Intensities shape: {ints.shape}")
            print(f"Wavenumbers shape: {wns.shape}")
            print(f"Wn range: {wns.min()} to {wns.max()}")
            print(f"Is monotonic: {np.all(np.diff(wns) > 0) or np.all(np.diff(wns) < 0)}")
            
            # Check for duplicates
            unique_wns = np.unique(wns)
            print(f"Unique wavenumbers: {len(unique_wns)} / {len(wns)}")
            
            # Check for NaNs
            print(f"NaNs in Wn: {np.isnan(wns).sum()}")
            print(f"NaNs in Ints: {np.isnan(ints).sum()}")
            
    except Exception as e:
        print(f"Error: {e}")

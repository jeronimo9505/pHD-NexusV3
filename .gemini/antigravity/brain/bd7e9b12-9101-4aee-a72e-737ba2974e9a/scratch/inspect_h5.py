import h5py
import numpy as np

file_path = r"c:\Users\Rodrigo\Downloads\Depurado 2\Nueva carpeta\A9-B3_RAMAN_R6G10-6_633nm_70µW_50x_2s_20acc_Spot1.h5"

try:
    with h5py.File(file_path, 'r') as f:
        print(f"File: {file_path}")
        print("\nStructure:")
        def print_structure(name, obj):
            print(f"{'  ' * name.count('/')}{name} ({type(obj).__name__})")
            if isinstance(obj, h5py.Dataset):
                print(f"{'  ' * (name.count('/') + 1)}Shape: {obj.shape}, Dtype: {obj.dtype}")
        f.visititems(print_structure)
        
        # Check specific datasets
        if 'wavenumber' in f:
            wn = f['wavenumber'][:]
            print(f"\nWavenumber range: {wn.min()} to {wn.max()} (len: {len(wn)})")
            print(f"First 5: {wn[:5]}")
            print(f"Last 5: {wn[-5:]}")
            # Check monotonicity
            diffs = np.diff(wn)
            print(f"Monotonic increasing: {np.all(diffs > 0)}")
            print(f"Monotonic decreasing: {np.all(diffs < 0)}")
            
        if 'spectra' in f:
            specs = f['spectra']
            print(f"\nSpectra shape: {specs.shape}")
            
except Exception as e:
    print(f"Error: {e}")

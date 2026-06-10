import h5py
import numpy as np

path = r"C:\Users\Rodrigo\OneDrive - unizar.es\phd-Rodrigo\Paper\P1 - New Sample\RAMAN\2026\grafeno.h5"
try:
    with h5py.File(path, "r") as f:
        print("Keys:", list(f.keys()))
        wn = f["spectrum/wavenumbers"][:]
        ints = f["spectrum/intensities"][:]
        print("Wavenumbers shape:", wn.shape)
        print("Intensities shape:", ints.shape)
        print("Wavenumbers range:", wn[0], "to", wn[-1])
except Exception as e:
    print("Error:", e)

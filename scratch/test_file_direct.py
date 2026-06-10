import os
import h5py

folder = r"C:\Users\Rodrigo\Downloads\Depurado 2\Nueva carpeta"
files = [f for f in os.listdir(folder) if f.endswith(".h5")]
if not files:
    print("No H5 files found")
else:
    path = os.path.join(folder, files[0])
    print("Opening path:", path)
    try:
        with h5py.File(path, "r") as f:
            print("Keys in root:", list(f.keys()))
            if "spectrum" in f:
                print("Keys in spectrum group:", list(f["spectrum"].keys()))
                wn = f["spectrum/wavenumbers"][:]
                ints = f["spectrum/intensities"][:]
                print("Wavenumbers shape:", wn.shape)
                print("Intensities shape:", ints.shape)
                print("Wavenumbers range:", wn[0], "to", wn[-1])
            else:
                print("No spectrum group found")
    except Exception as e:
        print("Error:", e)

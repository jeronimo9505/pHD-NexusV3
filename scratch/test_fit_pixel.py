import requests
import json

url = "http://127.0.0.1:8888/api/fitting/fit-pixel"
payload = {
    "vault_root": "C:/Users/Rodrigo/Downloads/Depurado 2",
    "h5_relative_path": "Nueva carpeta/A9-B3_RAMAN_R6G10-6_633nm_70W_50x_2s_20acc_Spot1.h5",
    "spectrum_index": 0,
    "peaks": [
        {"name": "Lorentzian 1", "model": "Lorentzian", "center": 1590.0, "fwhm_init": 30.0, "amplitude": 1000.0, "active": True}
    ],
    "baseline_method": "asls",
    "baseline_params": {"lam": 1e5, "p": 0.01},
    "x_shift": 0.0,
    "crop_range": None
}

try:
    res = requests.post(url, json=payload)
    print("Status code:", res.status_code)
    data = res.json()
    print("Success:", data.get("success"))
    print("Message:", data.get("message"))
    print("Keys:", list(data.keys()))
    if "original" in data and len(data["original"]) > 0:
        print("Original length:", len(data["original"]))
        print("Original first 3 points:", data["original"][:3])
    if "corrected" in data and len(data["corrected"]) > 0:
        print("Corrected length:", len(data["corrected"]))
        print("Corrected first 3 points:", data["corrected"][:3])
    if "best_fit" in data and len(data["best_fit"]) > 0:
        print("Best fit length:", len(data["best_fit"]))
        print("Best fit first 3 points:", data["best_fit"][:3])
except Exception as e:
    print("Error:", e)

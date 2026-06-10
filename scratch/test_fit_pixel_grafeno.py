import requests
import json

url = "http://127.0.0.1:8888/api/fitting/fit-pixel"
payload = {
    "vault_root": r"C:\Users\Rodrigo\OneDrive - unizar.es\phd-Rodrigo",
    "h5_relative_path": "Paper/P1 - New Sample/RAMAN/2026/grafeno.h5",
    "spectrum_index": 0,
    "peaks": [
        {"name": "Lorentzian 1", "model": "Lorentzian", "center": 2652.91, "fwhm_init": 30.0, "amplitude": 2700.14, "active": True},
        {"name": "Lorentzian 2", "model": "Lorentzian", "center": 2477.99, "fwhm_init": 30.0, "amplitude": 100.0, "active": True},
        {"name": "Lorentzian 3", "model": "Lorentzian", "center": 1581.17, "fwhm_init": 30.0, "amplitude": 100.0, "active": True},
        {"name": "Lorentzian 4", "model": "Lorentzian", "center": 1331.1, "fwhm_init": 30.0, "amplitude": 100.0, "active": True}
    ],
    "baseline_method": "asls",
    "baseline_params": {"lam": 1e5, "p": 0.01},
    "x_shift": 0.0,
    "crop_range": [1000, 3000]
}

try:
    res = requests.post(url, json=payload)
    print("Status code:", res.status_code)
    data = res.json()
    print("Success:", data.get("success"))
    print("Message:", data.get("message"))
    print("Keys in response:", list(data.keys()))
    if "original" in data and len(data["original"]) > 0:
        print("Original length:", len(data["original"]))
        print("Original first 3 points:", data["original"][:3])
        print("Original last 3 points:", data["original"][-3:])
    if "corrected" in data and len(data["corrected"]) > 0:
        print("Corrected length:", len(data["corrected"]))
        print("Corrected first 3 points:", data["corrected"][:3])
    if "best_fit" in data and len(data["best_fit"]) > 0:
        print("Best fit length:", len(data["best_fit"]))
        print("Best fit first 3 points:", data["best_fit"][:3])
    if "parameters" in data:
        print("Parameters length:", len(data["parameters"]))
        for p in data["parameters"][:3]:
            print(f"  {p['name']}: {p['value']}")
except Exception as e:
    print("Error:", e)

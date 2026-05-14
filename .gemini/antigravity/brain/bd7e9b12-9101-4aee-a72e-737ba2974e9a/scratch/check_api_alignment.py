import requests
import json

url = "http://localhost:8765/api/pipeline/preview"
payload = {
    "vault_root": r"C:\Users\Rodrigo\OneDrive - unizar.es\phd-Rodrigo",
    "h5_relative_path": r"Logbook_28054599/A4/RAMAN/2026/A4_RAMAN_R6G10-6_633nm_71µW_50x_2s_20_5x5map_Spot1.h5",
    "steps": [{"type": "crop", "enabled": True, "params": {"start": 425, "end": 2600}}],
    "focus_index": 0
}

try:
    response = requests.post(url, json=payload)
    data = response.json()
    
    orig = data.get("original", [])
    proc = data.get("processed", [])
    inp = data.get("stage_input", []) # Wait, stage_input is just a list of Y values?
    
    print(f"Original len: {len(orig)}")
    print(f"Processed len: {len(proc)}")
    
    if orig and proc:
        # Find first matching point
        p0_x = proc[0]["x"]
        for i, o in enumerate(orig):
            if abs(o["x"] - p0_x) < 0.1:
                print(f"First match at index {i}")
                print(f"Orig[i]: {orig[i]}")
                print(f"Proc[0]: {proc[0]}")
                # Check if intensities match if it's just a crop
                if abs(orig[i]["y"] - proc[0]["y"]) < 0.1:
                    print("Values match! Alignemnt is correct on server.")
                else:
                    print(f"VALUES MISMATCH! Orig: {orig[i]['y']}, Proc: {proc[0]['y']}")
                break
    
    # Check if stage_input exists
    if "stage_input" in data:
        print(f"Stage input len: {len(data['stage_input'])}")

except Exception as e:
    print(f"Error: {e}")

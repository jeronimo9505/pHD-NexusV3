import os
import requests
import json

supabase_url = None
supabase_key = None

env_paths = [".env.local"] # Read ONLY plain text env.local
for path in env_paths:
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    val = v.strip().strip("'").strip('"')
                    if val.startswith("encrypted:"):
                        continue
                    if k.strip() == "NEXT_PUBLIC_SUPABASE_URL":
                        supabase_url = val
                    elif k.strip() == "SUPABASE_SERVICE_ROLE_KEY" and not supabase_key:
                        supabase_key = val
                    elif k.strip() == "NEXT_PUBLIC_SUPABASE_ANON_KEY" and not supabase_key:
                        supabase_key = val

if not supabase_url or not supabase_key:
    print("Error: Could not find Supabase credentials in env files.")
    exit(1)

# Query sample_characterizations
headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}",
    "Content-Type": "application/json"
}

url = f"{supabase_url}/rest/v1/sample_characterizations?select=id,type,data&limit=20"
try:
    res = requests.get(url, headers=headers)
    if res.status_code == 200:
        data = res.json()
        print(f"Found {len(data)} characterizations:")
        for idx, char in enumerate(data):
            char_data = char.get("data", {})
            h5_paths = char_data.get("local_h5_paths", []) if isinstance(char_data, dict) else []
            print(f"{idx + 1}. Type: {char.get('type')}, H5 Paths: {h5_paths}")
    else:
        print(f"Error querying Supabase: {res.status_code} - {res.text}")
except Exception as e:
    print(f"Exception: {e}")

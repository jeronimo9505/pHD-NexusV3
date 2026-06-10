import os
import re
import h5py
from pathlib import Path

# Suffix pattern matching the frontend regex:
# /(_preprocessed(_\d+)?|_rgi(_\w+)?|_deconvolution(_\d+)?|_fitting(_\d+)?)$/i
DERIVATIVE_REGEX = re.compile(
    r"(_preprocessed(_\d+)?|_rgi(_\w+)?|_deconvolution(_\d+)?|_fitting(_\d+)?)$",
    re.IGNORECASE
)

def backfill_metadata(vault_root_str: str):
    vault_root = Path(vault_root_str).resolve()
    if not vault_root.exists() or not vault_root.is_dir():
        print(f"Error: Vault root path does not exist or is not a directory: {vault_root_str}")
        return

    print(f"Scanning vault root: {vault_root}")

    # 1. Gather all H5 files
    h5_files = list(vault_root.rglob("*.h5"))
    print(f"Found {len(h5_files)} HDF5 files in the vault.")

    # Map from lower-case filename stem to its relative path (for quick lookups)
    file_map = {}
    for p in h5_files:
        rel_path = p.relative_to(vault_root).as_posix()
        file_map[p.stem.lower()] = rel_path

    updated_count = 0
    skipped_count = 0
    no_parent_count = 0

    # 2. Trace and update parent_file metadata
    for p in h5_files:
        stem = p.name[:-3] if p.name.lower().endswith(".h5") else p.stem
        match = DERIVATIVE_REGEX.search(stem)

        if not match:
            # Not a derivative file
            continue

        # Determine parent stem
        parent_stem = stem[:match.start()]
        parent_rel_path = file_map.get(parent_stem.lower())

        if not parent_rel_path:
            print(f"[-] Could not find parent file for {p.name} (searched for stem: {parent_stem})")
            no_parent_count += 1
            continue

        # Write parent_file attribute
        child_rel_path = p.relative_to(vault_root).as_posix()
        try:
            # Check current parent_file attribute
            has_correct_metadata = False
            with h5py.File(p, "r") as f:
                current_parent = f.attrs.get("parent_file", "")
                if isinstance(current_parent, bytes):
                    current_parent = current_parent.decode("utf-8", "ignore")
                if current_parent == parent_rel_path:
                    has_correct_metadata = True

            if has_correct_metadata:
                skipped_count += 1
                continue

            # Open in read-write mode to update attribute
            with h5py.File(p, "r+") as f:
                f.attrs["parent_file"] = parent_rel_path

            print(f"[+] Updated {child_rel_path} -> parent_file: {parent_rel_path}")
            updated_count += 1
        except Exception as e:
            print(f"[!] Error writing metadata for {child_rel_path}: {e}")

    print("\n--- Summary ---")
    print(f"Successfully updated: {updated_count} files")
    print(f"Already correct (skipped): {skipped_count} files")
    print(f"Derivatives with missing parent file: {no_parent_count} files")

if __name__ == "__main__":
    import sys
    # Look for vault root argument or ask for input
    if len(sys.argv) > 1:
        vault_path = sys.argv[1]
    else:
        # Default to Nueva carpeta in the current directory if it exists as a fallback
        default_path = "./Nueva carpeta"
        if os.path.exists(default_path):
            vault_path = default_path
        else:
            vault_path = input("Enter the absolute path to your local vault directory: ").strip()

    backfill_metadata(vault_path)

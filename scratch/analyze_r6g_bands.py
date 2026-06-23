import os
import glob
import h5py
import numpy as np
import scipy.optimize as opt

# Let's ensure we use the correct path
vault_root = "C:/Users/Rodrigo/OneDrive - unizar.es/phd-Rodrigo/SERS Au and G"

file_patterns = {
    "A13-B2-B1": ("A13-B2-B1 - Bt-CuG-Au e-beam/RAMAN/2026", "A13-B2-B1_RAMAN_R6G10-6_633nm*.h5"),
    "A12-B2-c2": ("A12-B2-c2 - Bt-CuG-Au e-beam/RAMAN/2026", "A12-B2-c2_RAMAN_R6G10-6_633nm*.h5"),
    "A13-B1": ("A13-B1 - Bt-Au e-beam/RAMAN/2026", "A13-B1_RAMAN_R6G10-6_633nm*.h5"),
    "A12-B1": ("A12-B1 - Bt-Au e-beam/RAMAN/2026", "A12-B1_RAMAN_R6G10-6_633nm*Spot5.h5"),
}

groups = {
    "A13-B2-B1": "Bt-CuG-Au e-beam",
    "A12-B2-c2": "Bt-CuG-Au e-beam",
    "A13-B1": "Bt-Au e-beam",
    "A12-B1": "Bt-Au e-beam",
}

peak_ranges = {
    "611": (595, 625),
    "774": (755, 790)
}

def lorentzian(x, amp, center, fwhm, background):
    gamma = fwhm / 2.0
    return background + amp * (gamma**2) / ((x - center)**2 + gamma**2)

def fit_peak_lorentzian(x, y, search_range):
    mask = (x >= search_range[0]) & (x <= search_range[1])
    x_sub = x[mask]
    y_sub = y[mask]
    
    if len(x_sub) < 4:
        return None, None
        
    bg_guess = np.min(y_sub)
    amp_guess = np.max(y_sub) - bg_guess
    idx_max = np.argmax(y_sub)
    center_guess_sub = x_sub[idx_max]
    fwhm_guess = 10.0
    
    p0 = [amp_guess, center_guess_sub, fwhm_guess, bg_guess]
    bounds = (
        [0.0, search_range[0], 1.0, 0.0],
        [amp_guess * 10, search_range[1], 40.0, np.max(y_sub)]
    )
    
    try:
        popt, _ = opt.curve_fit(lorentzian, x_sub, y_sub, p0=p0, bounds=bounds, maxfev=2000)
        # Return popt[1] (center) and popt[0] (amplitude above background)
        return popt[1], popt[0]
    except:
        # Fallback to simple max and local intensity
        center = fit_peak_parabolic(x, y, search_range)
        intensity = np.max(y_sub) - np.min(y_sub)
        return center, intensity

def fit_peak_parabolic(x, y, search_range):
    mask = (x >= search_range[0]) & (x <= search_range[1])
    x_sub = x[mask]
    y_sub = y[mask]
    
    if len(x_sub) < 3:
        return None
        
    idx_max = np.argmax(y_sub)
    if idx_max == 0 or idx_max == len(y_sub) - 1:
        return x_sub[idx_max]
        
    x_fit = x_sub[idx_max-1 : idx_max+2]
    y_fit = y_sub[idx_max-1 : idx_max+2]
    
    coeffs = np.polyfit(x_fit, y_fit, 2)
    a, b, c = coeffs
    if a < 0:
        return -b / (2 * a)
    else:
        return x_sub[idx_max]

print("=== DETAILED PEAK FIT AND INTENSITY ANALYSIS ===")

all_results = {}

for name, (folder, pattern) in file_patterns.items():
    search_dir = os.path.join(vault_root, folder)
    if not os.path.exists(search_dir):
        print(f"Directory NOT found: {search_dir}")
        continue
        
    search_pattern = os.path.join(search_dir, pattern)
    matching_files = glob.glob(search_pattern)
    
    if not matching_files:
        print(f"No files matching '{pattern}' in '{folder}'")
        continue
        
    abs_path = matching_files[0]
    
    with h5py.File(abs_path, "r") as f:
        wavenumbers = f["/spectrum/wavenumbers"][:]
        intensities = f["/spectrum/intensities"][:]
        
        diffs = np.diff(wavenumbers)
        avg_step = np.mean(diffs)
        
        # We'll store lists of (position, intensity)
        results = {"611": [], "774": []}
        
        if intensities.ndim == 1:
            intensities = intensities.reshape(1, -1)
            
        n_spectra = intensities.shape[0]
        
        for i in range(n_spectra):
            y = intensities[i]
            
            # Peak 611
            p611, int611 = fit_peak_lorentzian(wavenumbers, y, peak_ranges["611"])
            if p611 is not None and int611 is not None:
                results["611"].append((p611, int611))
                
            # Peak 774
            p774, int774 = fit_peak_lorentzian(wavenumbers, y, peak_ranges["774"])
            if p774 is not None and int774 is not None:
                results["774"].append((p774, int774))
                
        all_results[name] = {
            "avg_step": avg_step,
            "results": results
        }

# Grouped data structure
grouped_vals = {
    "Bt-CuG-Au e-beam": {"611_pos": [], "611_int": [], "774_pos": [], "774_int": []},
    "Bt-Au e-beam": {"611_pos": [], "611_int": [], "774_pos": [], "774_int": []}
}

for name, res_info in all_results.items():
    g = groups[name]
    
    print(f"\nSubstrate/File: {name} ({g})")
    print(f"  Spectral step size (Resolution): {res_info['avg_step']:.4f} cm^-1")
    
    for pk in ["611", "774"]:
        data_tuples = res_info["results"][pk]
        if data_tuples:
            positions = [d[0] for d in data_tuples]
            ints = [d[1] for d in data_tuples]
            
            # Add to grouped
            grouped_vals[g][f"{pk}_pos"].extend(positions)
            grouped_vals[g][f"{pk}_int"].extend(ints)
            
            mean_pos = np.mean(positions)
            std_pos = np.std(positions)
            rsd_pos = (std_pos / mean_pos) * 100
            
            mean_int = np.mean(ints)
            std_int = np.std(ints)
            rsd_int = (std_int / mean_int) * 100
            
            print(f"  Band ~{pk} cm^-1:")
            print(f"    Position:  {mean_pos:.4f} ± {std_pos:.4f} cm^-1  (RSD% = {rsd_pos:.4f}%)")
            print(f"    Intensity: {mean_int:.1f} ± {std_int:.1f} a.u.  (RSD% = {rsd_int:.2f}%)")

print("\n" + "="*60)
print("GROUPED STATISTICS COMPARISON")
print("="*60)

for g_name, data in grouped_vals.items():
    print(f"\nGroup Substrate: {g_name}")
    for pk in ["611", "774"]:
        pos_list = data[f"{pk}_pos"]
        int_list = data[f"{pk}_int"]
        
        if pos_list:
            mean_pos = np.mean(pos_list)
            std_pos = np.std(pos_list)
            rsd_pos = (std_pos / mean_pos) * 100
            
            mean_int = np.mean(int_list)
            std_int = np.std(int_list)
            rsd_int = (std_int / mean_int) * 100
            
            print(f"  Band ~{pk} cm^-1 (n={len(pos_list)}):")
            print(f"    Position:  {mean_pos:.4f} ± {std_pos:.4f} cm^-1  (RSD% = {rsd_pos:.4f}%)")
            print(f"    Intensity: {mean_int:.1f} ± {std_int:.1f} a.u.  (RSD% = {rsd_int:.2f}%)")

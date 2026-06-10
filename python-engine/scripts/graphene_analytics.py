import os
import io
import base64
import numpy as np
import pandas as pd
from scipy.signal import savgol_filter
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

FS_TICK = 10
FS_LABEL = 10
FS_TITLE = 12
FS_TEXT = 10
FS_LEGEND = 10
FS_SUPTITLE = 14
FS_QUAD = 12

def _interp_cross(x1: float, y1: float, x2: float, y2: float, target: float) -> float:
    if not np.isfinite([x1, y1, x2, y2, target]).all():
        return float('nan')
    if y2 == y1:
        return float('nan')
    return float(x1 + (target - y1) * (x2 - x1) / (y2 - y1))

def _compute_fwhm(x: np.ndarray, y: np.ndarray, peak_idx: int, half_max: float) -> float:
    n = len(x)
    left_idx = peak_idx
    while left_idx > 0 and (not np.isfinite(y[left_idx]) or y[left_idx] > half_max):
        left_idx -= 1
        
    if left_idx == peak_idx:
        return float('nan')
        
    # Prevent infinite extrapolation if the half max is outside our sliced window bounds
    if left_idx == 0 and y[0] > half_max:
        return float('nan')
        
    left_cross = _interp_cross(x[left_idx], y[left_idx], x[left_idx + 1], y[left_idx + 1], half_max)

    right_idx = peak_idx
    while right_idx < n - 1 and (not np.isfinite(y[right_idx]) or y[right_idx] > half_max):
        right_idx += 1
        
    if right_idx == peak_idx:
        return float('nan')
        
    # Prevent infinite extrapolation
    if right_idx == n - 1 and y[n - 1] > half_max:
        return float('nan')
        
    right_cross = _interp_cross(x[right_idx - 1], y[right_idx - 1], x[right_idx], y[right_idx], half_max)

    if not np.isfinite(left_cross) or not np.isfinite(right_cross) or right_cross <= left_cross:
        return float('nan')
        
    fwhm = float(right_cross - left_cross)
    # Physically, a FWHM for 2D peak > 200 is noise/baseline artifact
    if fwhm > 200 or fwhm < 0:
        return float('nan')
    return fwhm

def peak_metrics(spectrum: np.ndarray, wavenumbers: np.ndarray, band_range, min_intensity: float = 0.0) -> tuple:
    idx = (wavenumbers >= band_range[0]) & (wavenumbers <= band_range[1])
    if not np.any(idx):
        return (np.nan, np.nan, np.nan, np.nan)
    x = wavenumbers[idx].astype(float)
    y = spectrum[idx].astype(float)
    mask = np.isfinite(x) & np.isfinite(y)
    if not np.any(mask):
        return (np.nan, np.nan, np.nan, np.nan)
    x = x[mask]
    y = y[mask]
    if x.size == 0 or y.size == 0:
        return (np.nan, np.nan, np.nan, np.nan)

    y = y - np.nanmin(y)
    peak_idx = int(np.nanargmax(y))
    peak_val = float(y[peak_idx])
    if not np.isfinite(peak_val) or peak_val < min_intensity:
        return (np.nan, np.nan, np.nan, np.nan)
    peak_pos = float(x[peak_idx])
    half_max = peak_val / 2.0
    fwhm = _compute_fwhm(x, y, peak_idx, half_max)
    try:
        area = float(np.trapezoid(y, x)) if x.size > 1 else float('nan')
    except AttributeError:
        area = float(np.trapz(y, x)) if x.size > 1 else float('nan')
    return (peak_val, peak_pos, fwhm, area)

def generate_analytics_base64(wavenumbers: np.ndarray, intensities: np.ndarray, mono_th: float = 1.5, damage_th: float = 0.3, min_intensity: float = 0.0, apply_snv: bool = False) -> str:
    D_band = (1300, 1350)
    G_band = (1580, 1600)
    TwoD_band = (2523, 2721)
    EPS = 1e-12

    # intensities may be (n_spectra, len(wavenumbers)) or (y, x, len(wavenumbers))
    if intensities.ndim == 3:
        intensities = intensities.reshape(-1, intensities.shape[-1])
    elif intensities.ndim == 1:
        intensities = intensities.reshape(1, -1)

    n_spectra = intensities.shape[0]
    
    if apply_snv:
        mean = np.mean(intensities, axis=1, keepdims=True)
        std = np.std(intensities, axis=1, keepdims=True)
        std[std == 0] = 1
        intensities = (intensities - mean) / std
        
    try:
        intensities = savgol_filter(intensities, window_length=7, polyorder=3, axis=1)
    except:
        pass
    
    map_D_I = np.full(n_spectra, np.nan)
    map_G_I = np.full(n_spectra, np.nan)
    map_2D_I = np.full(n_spectra, np.nan)
    map_2D_fwhm = np.full(n_spectra, np.nan)

    # Pre-slice wavenumbers
    idx_D = (wavenumbers >= D_band[0]) & (wavenumbers <= D_band[1])
    idx_G = (wavenumbers >= G_band[0]) & (wavenumbers <= G_band[1])
    idx_2D = (wavenumbers >= TwoD_band[0]) & (wavenumbers <= TwoD_band[1])
    
    x_2D = wavenumbers[idx_2D].astype(float)
    
    # Pre-slice intensities
    int_D = intensities[:, idx_D].astype(float)
    int_G = intensities[:, G_idx].astype(float) if 'G_idx' in locals() else intensities[:, idx_G].astype(float)
    int_2D = intensities[:, idx_2D].astype(float)

    for i in range(n_spectra):
        y_D = int_D[i]
        valid_D = np.isfinite(y_D)
        if np.any(valid_D):
            map_D_I[i] = float(np.max(y_D[valid_D]))

        y_G = int_G[i]
        valid_G = np.isfinite(y_G)
        if np.any(valid_G):
            map_G_I[i] = float(np.max(y_G[valid_G]))

        y_2D = int_2D[i]
        valid_2D = np.isfinite(y_2D)
        if np.any(valid_2D):
            y_2D_v = y_2D[valid_2D]
            y_min = float(np.min(y_2D_v))
            p_idx = int(np.argmax(y_2D_v))
            p_val = float(y_2D_v[p_idx])
            
            # Recalculate original array index for FWHM matching correct X
            orig_p_idx = np.where(valid_2D)[0][p_idx]
            
            map_2D_I[i] = p_val
            if p_val > min_intensity:
                map_2D_fwhm[i] = _compute_fwhm(x_2D, y_2D_v - y_min, p_idx, (p_val - y_min) / 2.0)

    I_ratio_2D_G = np.where(np.isfinite(map_2D_I) & np.isfinite(map_G_I) & (map_G_I > 0),
                             map_2D_I / (map_G_I + EPS), np.nan)
    I_ratio_D_G = np.where(np.isfinite(map_D_I) & np.isfinite(map_G_I) & (map_G_I > 0),
                           map_D_I / (map_G_I + EPS), np.nan)

    figc = plt.figure(figsize=(24, 7))
    gs = figc.add_gridspec(2, 4, width_ratios=[1.5, 2.0, 1.2, 1.2], wspace=0.35, hspace=0.45)
    
    # --- FWHM Histogram ---
    ax2 = figc.add_subplot(gs[:, 0])
    # --- Hexbin ---
    ax = figc.add_subplot(gs[:, 1])
    
    # --- Representative Spectra (4 Quadrants) ---
    ax_q2 = figc.add_subplot(gs[0, 2])
    ax_q1 = figc.add_subplot(gs[0, 3], sharex=ax_q2, sharey=ax_q2)
    ax_q3 = figc.add_subplot(gs[1, 2], sharex=ax_q2, sharey=ax_q2)
    ax_q4 = figc.add_subplot(gs[1, 3], sharex=ax_q2, sharey=ax_q2)
    
    # Hexbin setup
    valid_hex = np.isfinite(I_ratio_2D_G) & np.isfinite(I_ratio_D_G)
    x = I_ratio_2D_G[valid_hex]
    y = I_ratio_D_G[valid_hex]

    if x.size > 0 and y.size > 0:
        try: x_hi = float(np.nanpercentile(x, 99.5))
        except Exception: x_hi = float(np.nanmax(x))
        try: y_hi = float(np.nanpercentile(y, 99.5))
        except Exception: y_hi = float(np.nanmax(y))
        
        x_max = max(x_hi * 1.05, mono_th * 1.1)
        y_max = max(y_hi * 1.05, damage_th * 1.1)

        hb = ax.hexbin(x, y, gridsize=(40, 25), bins='log', cmap='viridis', extent=[0, x_max, 0, y_max])
        cb = figc.colorbar(hb, ax=ax, fraction=0.046, pad=0.04)
        cb.set_label('log10(count)', fontsize=FS_LABEL, fontweight='bold')

        ax.axvline(mono_th, color='#2E7D32', linestyle='--', linewidth=1.3)
        ax.axhline(damage_th, color='#B71C1C', linestyle='--', linewidth=1.3)
        ax.set_title('Hexbin: I(2D)/I(G) vs I(D)/I(G)', pad=16, fontsize=FS_TITLE, fontweight='bold')
        
        ax.set_xlim(0, x_max)
        ax.set_ylim(0, y_max)

        x0, x1 = ax.get_xlim()
        y0, y1 = ax.get_ylim()
        qx_left, qx_right = 0.5 * (x0 + mono_th), 0.5 * (mono_th + x1)
        qy_low, qy_high = 0.5 * (y0 + damage_th), 0.5 * (damage_th + y1)
        quad_style = dict(boxstyle='round', facecolor='white', alpha=0.6, linewidth=0.0)
        ax.text(qx_left, qy_low, 'Q3', ha='center', va='center', fontsize=FS_QUAD, fontweight='bold', bbox=quad_style)
        ax.text(qx_right, qy_low, 'Q4', ha='center', va='center', fontsize=FS_QUAD, fontweight='bold', bbox=quad_style)
        ax.text(qx_left, qy_high, 'Q2', ha='center', va='center', fontsize=FS_QUAD, fontweight='bold', bbox=quad_style)
        ax.text(qx_right, qy_high, 'Q1', ha='center', va='center', fontsize=FS_QUAD, fontweight='bold', bbox=quad_style)

        ax.set_xlabel('I(2D)/I(G)', labelpad=8, fontsize=FS_LABEL, fontweight='bold')
        ax.set_ylabel('I(D)/I(G)', labelpad=8, fontsize=FS_LABEL, fontweight='bold')
        ax.grid(alpha=0.2, linestyle=':')

        pct_mono = 100.0 * np.nanmean(I_ratio_2D_G[valid_hex] >= mono_th)
        pct_damage = 100.0 * np.nanmean(I_ratio_D_G[valid_hex] > damage_th)

        ax.text(0.02, 0.95, f"Monolayer: {pct_mono:.1f}%\nDamage: {pct_damage:.1f}%", transform=ax.transAxes, ha='left', va='top', fontsize=FS_TEXT, fontweight='bold', bbox=dict(boxstyle='round', facecolor='white', alpha=0.85))

    # FWHM Histogram setup
    fwhm_vals = map_2D_fwhm[np.isfinite(map_2D_fwhm)]
    fwhm_vals = fwhm_vals[(fwhm_vals > 0) & (fwhm_vals < 200)] # Ignore non-physical extreme FWHMs from noise fits
    if fwhm_vals.size:
        try:
            bins = np.histogram_bin_edges(fwhm_vals, bins='fd')
            if bins.size < 2: bins = np.linspace(np.nanmin(fwhm_vals) - 1, np.nanmax(fwhm_vals) + 1, 20)
        except Exception:
            bins = np.linspace(max(10, np.nanmin(fwhm_vals) - 2), np.nanmax(fwhm_vals) + 2, 30)

        n_counts, _, _ = ax2.hist(fwhm_vals, bins=bins, color='#7E57C2', alpha=0.75, edgecolor='white')

        fwhm_quality_threshold = 32.0
        ax2.axvline(fwhm_quality_threshold, color='#FF7043', linestyle='--', linewidth=1.6)
        med_val = float(np.nanmedian(fwhm_vals))
        if np.isfinite(med_val):
            ax2.axvline(med_val, color='#1E88E5', linestyle='-', linewidth=1.6)

        n_pix = int(fwhm_vals.size)
        try: pct_mono_fwhm = float(100.0 * np.mean(fwhm_vals <= fwhm_quality_threshold))
        except: pct_mono_fwhm = float('nan')

        lines = [f"Pixels: {n_pix}", f"Mono ≤ {fwhm_quality_threshold:.0f}: {pct_mono_fwhm:.1f}%"]
        if np.isfinite(med_val): lines.append(f"Median: {med_val:.1f}")
        ax2.text(0.95, 0.95, "\n".join(lines), transform=ax2.transAxes, ha='right', va='top', fontsize=FS_TEXT, fontweight='bold', bbox=dict(boxstyle='round', facecolor='white', alpha=0.9))

        ax2.set_xlabel('FWHM(2D) [cm⁻¹]', fontsize=FS_LABEL, fontweight='bold')
        ax2.set_ylabel('Pixel count', fontsize=FS_LABEL, fontweight='bold')
        ax2.set_title('FWHM(2D) distribution', fontsize=FS_TITLE, fontweight='bold')
        ax2.grid(alpha=0.25, linestyle=':')

    # Representative Spectra Setup
    try:
        valid = np.isfinite(I_ratio_2D_G) & np.isfinite(I_ratio_D_G)
        xR = I_ratio_2D_G
        yR = I_ratio_D_G

        q_masks = {
            'Q1': valid & (xR >= mono_th) & (yR > damage_th),     # High X, High Y
            'Q2': valid & (xR < mono_th) & (yR > damage_th),      # Low X, High Y
            'Q3': valid & (xR < mono_th) & (yR <= damage_th),     # Low X, Low Y
            'Q4': valid & (xR >= mono_th) & (yR <= damage_th),    # High X, Low Y
        }
        
        axes_map = {
            'Q1': ax_q1,
            'Q2': ax_q2,
            'Q3': ax_q3,
            'Q4': ax_q4
        }

        colors_q = {'Q1': '#1565C0', 'Q2': '#2E7D32', 'Q3': '#F9A825', 'Q4': '#C62828'}
        
        for key in ['Q1', 'Q2', 'Q3', 'Q4']:
            ax3 = axes_map[key]
            c = colors_q[key]
            m = q_masks[key]
            count = int(np.count_nonzero(m))
            if count > 0:
                specs = intensities[m.flatten(), :]
                rep = np.nanmedian(specs, axis=0)
                y_max = np.nanmax(rep) if np.nanmax(rep) > 0 else 1
                rep = rep / y_max
                ax3.plot(wavenumbers, rep, label=f"{key} ({count / n_spectra * 100:.1f}%)", color=c, lw=1.2)

            for br, bgc in [(D_band, '#8E24AA'), (G_band, '#3949AB'), (TwoD_band, '#00897B')]:
                ax3.axvspan(br[0], br[1], color=bgc, alpha=0.08)
            
            ax3.set_title(f'Median Spectra {key}', fontsize=FS_TITLE, fontweight='bold')
            ax3.legend(loc='upper right', prop={'weight': 'bold', 'size': FS_LEGEND})
            ax3.grid(alpha=0.2, linestyle=':')
            
            # Bottom row gets X labels
            if key in ['Q3', 'Q4']:
                ax3.set_xlabel('Wavenumber [cm⁻¹]', fontsize=FS_LABEL, fontweight='bold')
            else:
                ax3.tick_params(labelbottom=False)
                
            # Left row gets Y labels
            if key in ['Q2', 'Q3']:
                ax3.set_ylabel('Intensity', fontsize=FS_LABEL, fontweight='bold')
            else:
                ax3.tick_params(labelleft=False)

    except Exception as e:
        print(f"Error in spectra: {e}")

    figc.tight_layout()

    buf = io.BytesIO()
    figc.savefig(buf, format='png', dpi=120)
    plt.close(figc)
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode('utf-8')
    return b64


def generate_rgi_analytics_base64(
    wavenumbers: np.ndarray,
    intensities: np.ndarray,
    map_D_I: np.ndarray,
    map_G_I: np.ndarray,
    map_2D_I: np.ndarray,
    map_2D_fwhm: np.ndarray,
    mono_th: float = 1.5,
    damage_th: float = 0.3,
    min_intensity: float = 0.0,
    apply_snv: bool = False
) -> str:
    D_band = (1300, 1350)
    G_band = (1580, 1600)
    TwoD_band = (2523, 2721)
    EPS = 1e-12

    if intensities.ndim == 3:
        intensities = intensities.reshape(-1, intensities.shape[-1])
    elif intensities.ndim == 1:
        intensities = intensities.reshape(1, -1)

    n_spectra = intensities.shape[0]
    
    if apply_snv:
        mean = np.mean(intensities, axis=1, keepdims=True)
        std = np.std(intensities, axis=1, keepdims=True)
        std[std == 0] = 1
        intensities = (intensities - mean) / std
        
    try:
        intensities = savgol_filter(intensities, window_length=7, polyorder=3, axis=1)
    except:
        pass

    # Ensure inputs are clean float arrays and treat None/NaN properly
    map_D_I = np.array([np.nan if v is None or np.isnan(v) else float(v) for v in map_D_I])
    map_G_I = np.array([np.nan if v is None or np.isnan(v) else float(v) for v in map_G_I])
    map_2D_I = np.array([np.nan if v is None or np.isnan(v) else float(v) for v in map_2D_I])
    map_2D_fwhm = np.array([np.nan if v is None or np.isnan(v) else float(v) for v in map_2D_fwhm])

    I_ratio_2D_G = np.where(np.isfinite(map_2D_I) & np.isfinite(map_G_I) & (map_G_I > 0),
                             map_2D_I / (map_G_I + EPS), np.nan)
    I_ratio_D_G = np.where(np.isfinite(map_D_I) & np.isfinite(map_G_I) & (map_G_I > 0),
                           map_D_I / (map_G_I + EPS), np.nan)

    figc = plt.figure(figsize=(24, 7))
    gs = figc.add_gridspec(2, 4, width_ratios=[1.5, 2.0, 1.2, 1.2], wspace=0.35, hspace=0.45)
    
    # --- FWHM Histogram ---
    ax2 = figc.add_subplot(gs[:, 0])
    # --- Hexbin ---
    ax = figc.add_subplot(gs[:, 1])
    
    # --- Representative Spectra (4 Quadrants) ---
    ax_q2 = figc.add_subplot(gs[0, 2])
    ax_q1 = figc.add_subplot(gs[0, 3], sharex=ax_q2, sharey=ax_q2)
    ax_q3 = figc.add_subplot(gs[1, 2], sharex=ax_q2, sharey=ax_q2)
    ax_q4 = figc.add_subplot(gs[1, 3], sharex=ax_q2, sharey=ax_q2)
    
    # Hexbin setup
    valid_hex = np.isfinite(I_ratio_2D_G) & np.isfinite(I_ratio_D_G)
    x = I_ratio_2D_G[valid_hex]
    y = I_ratio_D_G[valid_hex]

    if x.size > 0 and y.size > 0:
        try: x_hi = float(np.nanpercentile(x, 99.5))
        except Exception: x_hi = float(np.nanmax(x))
        try: y_hi = float(np.nanpercentile(y, 99.5))
        except Exception: y_hi = float(np.nanmax(y))
        
        x_max = max(x_hi * 1.05, mono_th * 1.1)
        y_max = max(y_hi * 1.05, damage_th * 1.1)

        hb = ax.hexbin(x, y, gridsize=(40, 25), bins='log', cmap='viridis', extent=[0, x_max, 0, y_max])
        cb = figc.colorbar(hb, ax=ax, fraction=0.046, pad=0.04)
        cb.set_label('log10(count)', fontsize=FS_LABEL, fontweight='bold')

        ax.axvline(mono_th, color='#2E7D32', linestyle='--', linewidth=1.3)
        ax.axhline(damage_th, color='#B71C1C', linestyle='--', linewidth=1.3)
        ax.set_title('Hexbin: I(2D)/I(G) vs I(D)/I(G)', pad=16, fontsize=FS_TITLE, fontweight='bold')
        
        ax.set_xlim(0, x_max)
        ax.set_ylim(0, y_max)

        x0, x1 = ax.get_xlim()
        y0, y1 = ax.get_ylim()
        qx_left, qx_right = 0.5 * (x0 + mono_th), 0.5 * (mono_th + x1)
        qy_low, qy_high = 0.5 * (y0 + damage_th), 0.5 * (damage_th + y1)
        quad_style = dict(boxstyle='round', facecolor='white', alpha=0.6, linewidth=0.0)
        ax.text(qx_left, qy_low, 'Q3', ha='center', va='center', fontsize=FS_QUAD, fontweight='bold', bbox=quad_style)
        ax.text(qx_right, qy_low, 'Q4', ha='center', va='center', fontsize=FS_QUAD, fontweight='bold', bbox=quad_style)
        ax.text(qx_left, qy_high, 'Q2', ha='center', va='center', fontsize=FS_QUAD, fontweight='bold', bbox=quad_style)
        ax.text(qx_right, qy_high, 'Q1', ha='center', va='center', fontsize=FS_QUAD, fontweight='bold', bbox=quad_style)

        ax.set_xlabel('I(2D)/I(G)', labelpad=8, fontsize=FS_LABEL, fontweight='bold')
        ax.set_ylabel('I(D)/I(G)', labelpad=8, fontsize=FS_LABEL, fontweight='bold')
        ax.grid(alpha=0.2, linestyle=':')

        pct_mono = 100.0 * np.nanmean(I_ratio_2D_G[valid_hex] >= mono_th)
        pct_damage = 100.0 * np.nanmean(I_ratio_D_G[valid_hex] > damage_th)

        ax.text(0.02, 0.95, f"Monolayer: {pct_mono:.1f}%\nDamage: {pct_damage:.1f}%", transform=ax.transAxes, ha='left', va='top', fontsize=FS_TEXT, fontweight='bold', bbox=dict(boxstyle='round', facecolor='white', alpha=0.85))

    # FWHM Histogram setup
    fwhm_vals = map_2D_fwhm[np.isfinite(map_2D_fwhm)]
    fwhm_vals = fwhm_vals[(fwhm_vals > 0) & (fwhm_vals < 200)] # Ignore non-physical extreme FWHMs from noise fits
    if fwhm_vals.size:
        try:
            bins = np.histogram_bin_edges(fwhm_vals, bins='fd')
            if bins.size < 2: bins = np.linspace(np.nanmin(fwhm_vals) - 1, np.nanmax(fwhm_vals) + 1, 20)
        except Exception:
            bins = np.linspace(max(10, np.nanmin(fwhm_vals) - 2), np.nanmax(fwhm_vals) + 2, 30)

        n_counts, _, _ = ax2.hist(fwhm_vals, bins=bins, color='#7E57C2', alpha=0.75, edgecolor='white')

        fwhm_quality_threshold = 32.0
        ax2.axvline(fwhm_quality_threshold, color='#FF7043', linestyle='--', linewidth=1.6)
        med_val = float(np.nanmedian(fwhm_vals))
        if np.isfinite(med_val):
            ax2.axvline(med_val, color='#1E88E5', linestyle='-', linewidth=1.6)

        n_pix = int(fwhm_vals.size)
        try: pct_mono_fwhm = float(100.0 * np.mean(fwhm_vals <= fwhm_quality_threshold))
        except: pct_mono_fwhm = float('nan')

        lines = [f"Pixels: {n_pix}", f"Mono ≤ {fwhm_quality_threshold:.0f}: {pct_mono_fwhm:.1f}%"]
        if np.isfinite(med_val): lines.append(f"Median: {med_val:.1f}")
        ax2.text(0.95, 0.95, "\n".join(lines), transform=ax2.transAxes, ha='right', va='top', fontsize=FS_TEXT, fontweight='bold', bbox=dict(boxstyle='round', facecolor='white', alpha=0.9))

        ax2.set_xlabel('FWHM(2D) [cm⁻¹]', fontsize=FS_LABEL, fontweight='bold')
        ax2.set_ylabel('Pixel count', fontsize=FS_LABEL, fontweight='bold')
        ax2.set_title('FWHM(2D) distribution', fontsize=FS_TITLE, fontweight='bold')
        ax2.grid(alpha=0.25, linestyle=':')

    # Representative Spectra Setup
    try:
        valid = np.isfinite(I_ratio_2D_G) & np.isfinite(I_ratio_D_G)
        xR = I_ratio_2D_G
        yR = I_ratio_D_G

        q_masks = {
            'Q1': valid & (xR >= mono_th) & (yR > damage_th),     # High X, High Y
            'Q2': valid & (xR < mono_th) & (yR > damage_th),      # Low X, High Y
            'Q3': valid & (xR < mono_th) & (yR <= damage_th),     # Low X, Low Y
            'Q4': valid & (xR >= mono_th) & (yR <= damage_th),    # High X, Low Y
        }
        
        axes_map = {
            'Q1': ax_q1,
            'Q2': ax_q2,
            'Q3': ax_q3,
            'Q4': ax_q4
        }

        colors_q = {'Q1': '#1565C0', 'Q2': '#2E7D32', 'Q3': '#F9A825', 'Q4': '#C62828'}
        
        for key in ['Q1', 'Q2', 'Q3', 'Q4']:
            ax3 = axes_map[key]
            c = colors_q[key]
            m = q_masks[key]
            count = int(np.count_nonzero(m))
            if count > 0:
                specs = intensities[m.flatten(), :]
                rep = np.nanmedian(specs, axis=0)
                y_max = np.nanmax(rep) if np.nanmax(rep) > 0 else 1
                rep = rep / y_max
                ax3.plot(wavenumbers, rep, label=f"{key} ({count / n_spectra * 100:.1f}%)", color=c, lw=1.2)

            for br, bgc in [(D_band, '#8E24AA'), (G_band, '#3949AB'), (TwoD_band, '#00897B')]:
                ax3.axvspan(br[0], br[1], color=bgc, alpha=0.08)
            
            ax3.set_title(f'Median Spectra {key}', fontsize=FS_TITLE, fontweight='bold')
            ax3.legend(loc='upper right', prop={'weight': 'bold', 'size': FS_LEGEND})
            ax3.grid(alpha=0.2, linestyle=':')
            
            # Bottom row gets X labels
            if key in ['Q3', 'Q4']:
                ax3.set_xlabel('Wavenumber [cm⁻¹]', fontsize=FS_LABEL, fontweight='bold')
            else:
                ax3.tick_params(labelbottom=False)
                
            # Left row gets Y labels
            if key in ['Q2', 'Q3']:
                ax3.set_ylabel('Intensity', fontsize=FS_LABEL, fontweight='bold')
            else:
                ax3.tick_params(labelleft=False)

    except Exception as e:
        print(f"Error in spectra: {e}")

    figc.tight_layout()

    buf = io.BytesIO()
    figc.savefig(buf, format='png', dpi=120)
    plt.close(figc)
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode('utf-8')
    return b64


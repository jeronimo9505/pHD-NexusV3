#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Graphene Raman map analysis - intensity-based correlation visuals
-----------------------------------------------------------------
Generates:
1) Hexbin of I(2D)/I(G) vs I(D)/I(G) with threshold lines and percentages.
2) Histogram of FWHM(2D) values as computed from raw spectra.
3) Representative spectra (mediana) por cuadrante (según umbrales).
4) Imagen resumen con las tres figuras en una fila.

Usage example:
python banana4_clean.py "C:/path/G5_100um.txt" 100 100 --outdir ./output --show
"""

import os
import argparse
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# Global font settings
FS_TICK = 14
FS_LABEL = 14
FS_TITLE = 16
FS_TEXT = 14
FS_LEGEND = 14
FS_SUPTITLE = 18
FS_QUAD = 16


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
    left_cross = _interp_cross(x[left_idx], y[left_idx], x[left_idx + 1], y[left_idx + 1], half_max)

    right_idx = peak_idx
    while right_idx < n - 1 and (not np.isfinite(y[right_idx]) or y[right_idx] > half_max):
        right_idx += 1
    if right_idx == peak_idx:
        return float('nan')
    right_cross = _interp_cross(x[right_idx - 1], y[right_idx - 1], x[right_idx], y[right_idx], half_max)

    if not np.isfinite(left_cross) or not np.isfinite(right_cross) or right_cross <= left_cross:
        return float('nan')
    return float(right_cross - left_cross)


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
    area = float(np.trapezoid(y, x)) if x.size > 1 else float('nan')
    return (peak_val, peak_pos, fwhm, area)


def parse_args():
    parser = argparse.ArgumentParser(description="Graphene Raman map - intensity correlations and FWHM metrics")
    parser.add_argument('filename', nargs='?', default=r"C:\\Users\\Rodrigo\\OneDrive - unizar.es\\España\\Pj SERS with graphen\\03_Characterization\\04_Raman\\TFM Area\\W - BT-Au15nm-G.txt")
    parser.add_argument('area_size_x', nargs='?', type=float, default=50.0)
    parser.add_argument('area_size_y', nargs='?', type=float, default=50.0)
    parser.add_argument('--laser', type=float, default=633.0, help='Laser wavelength (nm), informational')
    parser.add_argument('--mono_th', type=float, default=1.5, help='Monolayer-like threshold for intensity ratio I(2D)/I(G)')
    parser.add_argument('--damage_th', type=float, default=0.3, help='Damage threshold for intensity ratio I(D)/I(G)')
    parser.add_argument('--min_intensity', type=float, default=0.0, help='Discard peaks < min_intensity as no signal')
    parser.add_argument('--invert_y', action='store_true', default=True, help='Invert Y axis to match your visualization')
    parser.add_argument('--outdir', type=str, default='.', help='Output directory (figures)')
    parser.add_argument('--show', action='store_true', help='Show figures interactively')
    return parser.parse_args()


def load_witec_cube(filename: str, invert_y: bool) -> tuple:
    df = pd.read_csv(filename, sep='\t', header=[0, 1])
    wavenumbers = df.iloc[:, 0].values.astype(float)
    columns_lvl0 = df.columns.get_level_values(0)[1:]
    positions = [tuple(map(int, col.split('(')[-1].rstrip(')').split('/'))) for col in columns_lvl0]

    m_max = max(p[0] for p in positions) + 1
    n_max = max(p[1] for p in positions) + 1
    n_spec = len(wavenumbers)

    intensities = np.zeros((m_max, n_max, n_spec), dtype=float)
    for idx, (m, n) in enumerate(positions):
        intensities[n, m, :] = df.iloc[:, idx + 1].values.astype(float)

    if invert_y:
        intensities = intensities[::-1, :, :]

    return intensities, wavenumbers, m_max, n_max


def main():
    args = parse_args()

    print(f"Using file: {args.filename}")
    print(f"Declared area: {args.area_size_x} x {args.area_size_y} um^2 | Laser: {args.laser} nm")

    intensities, wavenumbers, m_max, n_max = load_witec_cube(args.filename, args.invert_y)

    D_band = (1300, 1350)
    G_band = (1580, 1600)
    TwoD_band = (2600, 2700)
    EPS = 1e-12

    map_D_I = np.full((m_max, n_max), np.nan)
    map_G_I = np.full((m_max, n_max), np.nan)
    map_2D_I = np.full((m_max, n_max), np.nan)
    map_2D_fwhm = np.full((m_max, n_max), np.nan)

    for i in range(m_max):
        for j in range(n_max):
            spectrum = intensities[i, j, :]
            if spectrum.size == 0:
                continue
            d_I, _, _, _ = peak_metrics(spectrum, wavenumbers, D_band, args.min_intensity)
            g_I, _, _, _ = peak_metrics(spectrum, wavenumbers, G_band, args.min_intensity)
            td_I, _, td_fwhm, _ = peak_metrics(spectrum, wavenumbers, TwoD_band, args.min_intensity)

            map_D_I[i, j] = d_I
            map_G_I[i, j] = g_I
            map_2D_I[i, j] = td_I
            map_2D_fwhm[i, j] = td_fwhm

    I_ratio_2D_G = np.where(np.isfinite(map_2D_I) & np.isfinite(map_G_I) & (map_G_I > 0),
                             map_2D_I / (map_G_I + EPS), np.nan)
    I_ratio_D_G = np.where(np.isfinite(map_D_I) & np.isfinite(map_G_I) & (map_G_I > 0),
                           map_D_I / (map_G_I + EPS), np.nan)

    os.makedirs(args.outdir, exist_ok=True)

    # Hexbin intensity correlations
    hexbin_path = os.path.join(args.outdir, 'hexbin_intensity_correlation.png')
    valid_hex = np.isfinite(I_ratio_2D_G) & np.isfinite(I_ratio_D_G)
    x = I_ratio_2D_G[valid_hex].ravel()
    y = I_ratio_D_G[valid_hex].ravel()

    if x.size > 0 and y.size > 0:
        fig, ax = plt.subplots(figsize=(6.8, 5.6))
        hb = ax.hexbin(x, y, gridsize=45, bins='log', cmap='viridis')
        cb = fig.colorbar(hb, ax=ax)
        cb.set_label('log10(count)', fontsize=FS_LABEL, fontweight='bold')
        cb.ax.tick_params(labelsize=FS_TICK)

        ax.axvline(args.mono_th, color='#2E7D32', linestyle='--', linewidth=1.3, label=f'Monolayer threshold {args.mono_th:.2f}')
        ax.axhline(args.damage_th, color='#B71C1C', linestyle='--', linewidth=1.3, label=f'Damage threshold {args.damage_th:.2f}')

        ax.set_title('Hexbin: I(2D)/I(G) vs I(D)/I(G)', pad=16, fontsize=FS_TITLE, fontweight='bold')
        try:
            x_hi = float(np.nanpercentile(x, 99.5))
        except Exception:
            x_hi = float(np.nanmax(x))
        try:
            y_hi = float(np.nanpercentile(y, 99.5))
        except Exception:
            y_hi = float(np.nanmax(y))
        ax.set_xlim(0, max(x_hi * 1.05, args.mono_th * 1.1))
        ax.set_ylim(0, max(y_hi * 1.05, args.damage_th * 1.1))

        # Quadrant labels placed at centers, with requested renaming (Q4->Q1, Q3->Q2, Q1->Q3, Q2->Q4)
        x0, x1 = ax.get_xlim()
        y0, y1 = ax.get_ylim()
        qx_left = 0.5 * (x0 + args.mono_th)
        qx_right = 0.5 * (args.mono_th + x1)
        qy_low = 0.5 * (y0 + args.damage_th)
        qy_high = 0.5 * (args.damage_th + y1)
        quad_style = dict(boxstyle='round', facecolor='white', alpha=0.6, linewidth=0.0)
        ax.text(qx_left, qy_low, 'Q3', ha='center', va='center', fontsize=FS_QUAD, fontweight='bold', bbox=quad_style)
        ax.text(qx_right, qy_low, 'Q4', ha='center', va='center', fontsize=FS_QUAD, fontweight='bold', bbox=quad_style)
        ax.text(qx_left, qy_high, 'Q2', ha='center', va='center', fontsize=FS_QUAD, fontweight='bold', bbox=quad_style)
        ax.text(qx_right, qy_high, 'Q1', ha='center', va='center', fontsize=FS_QUAD, fontweight='bold', bbox=quad_style)

        ax.set_xlabel('I(2D)/I(G)', labelpad=8, fontsize=FS_LABEL, fontweight='bold')
        ax.set_ylabel('I(D)/I(G)', labelpad=8, fontsize=FS_LABEL, fontweight='bold')
        ax.tick_params(labelsize=FS_TICK)
        ax.grid(alpha=0.2, linestyle=':')

        pct_mono = 100.0 * np.nanmean(I_ratio_2D_G[valid_hex] >= args.mono_th) if np.any(valid_hex) else np.nan
        pct_damage = 100.0 * np.nanmean(I_ratio_D_G[valid_hex] > args.damage_th) if np.any(valid_hex) else np.nan

        ax.text(0.02, 0.82, f"Monolayer: {pct_mono:.1f}%", transform=ax.transAxes, ha='left', va='top', fontsize=FS_TEXT, fontweight='bold', bbox=dict(boxstyle='round', facecolor='white', alpha=0.85))
        ax.text(0.02, 0.76, f"Damage: {pct_damage:.1f}%", transform=ax.transAxes, ha='left', va='top', fontsize=FS_TEXT, fontweight='bold', bbox=dict(boxstyle='round', facecolor='white', alpha=0.85))

        ax.legend(loc='upper left', frameon=True, prop={'weight': 'bold', 'size': FS_LEGEND})

        fig.tight_layout()
        fig.savefig(hexbin_path, dpi=240)
        if args.show:
            plt.show()
        plt.close(fig)
    else:
        print('No valid intensity ratios to plot hexbin.')
        hexbin_path = None

    # FWHM(2D) histogram (clean labels, single info box, no legend)
    fwhm_vals = map_2D_fwhm[np.isfinite(map_2D_fwhm)]
    fwhm_path = os.path.join(args.outdir, 'fwhm2d_distribution.png')
    if fwhm_vals.size:
        fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))

        # Robust bins; fallback if degenerate
        try:
            bins = np.histogram_bin_edges(fwhm_vals, bins='fd')
            if bins.size < 2:
                lo, hi = np.nanmin(fwhm_vals), np.nanmax(fwhm_vals)
                bins = np.linspace(lo - 1, hi + 1, 20)
        except Exception:
            lo, hi = np.nanmin(fwhm_vals), np.nanmax(fwhm_vals)
            bins = np.linspace(max(10, lo - 2), hi + 2, 30)

        n_counts, _, _ = ax2.hist(fwhm_vals, bins=bins, color='#7E57C2', alpha=0.75, edgecolor='white')

        fwhm_quality_threshold = 32.0
        ax2.axvline(fwhm_quality_threshold, color='#FF7043', linestyle='--', linewidth=1.6)
        med_val = float(np.nanmedian(fwhm_vals))
        if np.isfinite(med_val):
            ax2.axvline(med_val, color='#1E88E5', linestyle='-', linewidth=1.6)

        # Single consolidated textbox (no legend to avoid overlap)
        n_pix = int(fwhm_vals.size)
        try:
            pct_mono_fwhm = float(100.0 * np.mean(fwhm_vals <= fwhm_quality_threshold))
        except Exception:
            pct_mono_fwhm = float('nan')

        lines = [
            f"Pixels: {n_pix}",
            f"Mono ≤ {fwhm_quality_threshold:.0f}: {pct_mono_fwhm:.1f}%",
        ]
        if np.isfinite(med_val):
            lines.append(f"Median: {med_val:.1f}")
        ax2.text(0.4, 0.95, "\n".join(lines),
                 transform=ax2.transAxes, ha='right', va='top',
                 fontsize=FS_TEXT, fontweight='bold',
                 bbox=dict(boxstyle='round', facecolor='white', alpha=0.9))

        # Better in-plot label placement for lines (avoid overlap with bars)
        y_top = float(np.nanmax(n_counts)) if np.size(n_counts) else ax2.get_ylim()[1]
        ax2.text(fwhm_quality_threshold, y_top * 0.92, '32 cm⁻¹', color='#FF7043',
                 ha='center', va='top', fontsize=max(9, FS_TEXT - 1), fontweight='bold')
        if np.isfinite(med_val):
            ax2.text(med_val, y_top * 0.84, f'Median {med_val:.1f}', color='#1E88E5',
                     ha='center', va='top', fontsize=max(9, FS_TEXT - 1), fontweight='bold')

        ax2.set_xlabel('FWHM(2D) [cm⁻¹]', fontsize=FS_LABEL, fontweight='bold')
        ax2.set_ylabel('Pixel count', fontsize=FS_LABEL, fontweight='bold')
        ax2.set_title('FWHM(2D) distribution', fontsize=FS_TITLE, fontweight='bold')
        ax2.tick_params(labelsize=FS_TICK)
        ax2.grid(alpha=0.25, linestyle=':')

        fig2.tight_layout()
        fig2.savefig(fwhm_path, dpi=240)
        if args.show:
            plt.show()
        plt.close(fig2)
    else:
        print('No valid FWHM(2D) values for histogram.')
        fwhm_path = None

        



  
        
    # Representative spectra per quadrant (based on intensity ratios)
    spectra_path = os.path.join(args.outdir, 'quadrant_representative_spectra.png')
    try:
        valid = np.isfinite(I_ratio_2D_G) & np.isfinite(I_ratio_D_G)
        xR = I_ratio_2D_G
        yR = I_ratio_D_G

        q_masks = {
            'Q1: low I(D)/I(G), low I(2D)/I(G)': valid & (xR < args.mono_th) & (yR <= args.damage_th),
            'Q2: low I(D)/I(G), high I(2D)/I(G)': valid & (xR >= args.mono_th) & (yR <= args.damage_th),
            'Q3: high I(D)/I(G), low I(2D)/I(G)': valid & (xR < args.mono_th) & (yR > args.damage_th),
            'Q4: high I(D)/I(G), high I(2D)/I(G)': valid & (xR >= args.mono_th) & (yR > args.damage_th),
        }

        flat_int = intensities.reshape(-1, intensities.shape[-1])
        figq, axes = plt.subplots(2, 2, figsize=(10.2, 7.8), sharex=True)
        axes = axes.flatten()

        keys = ['Q1: low I(D)/I(G), low I(2D)/I(G)',
                'Q2: low I(D)/I(G), high I(2D)/I(G)',
                'Q3: high I(D)/I(G), low I(2D)/I(G)',
                'Q4: high I(D)/I(G), high I(2D)/I(G)']
        index_order = [2, 3, 0, 1]

        for ax_idx, key in zip(index_order, keys):
            ax = axes[ax_idx]
            m = q_masks[key]
            count = int(np.count_nonzero(m))
            if count > 0:
                idx_flat = m.flatten()
                specs = flat_int[idx_flat, :]
                rep = np.nanmedian(specs, axis=0)
                ax.plot(wavenumbers, rep, color='#263238', lw=1.2)
                r2d_g = float(np.nanmedian(xR[m]))
                rd_g = float(np.nanmedian(yR[m]))
                ax.text(0.02, 0.95, f'n={count}\nmed I(2D)/I(G)={r2d_g:.2f}\nmed I(D)/I(G)={rd_g:.2f}',
                        transform=ax.transAxes, va='top', ha='left', fontsize=FS_TEXT, fontweight='bold',
                        bbox=dict(boxstyle='round', facecolor='white', alpha=0.85))
            else:
                ax.text(0.5, 0.5, 'No pixels', transform=ax.transAxes,
                        ha='center', va='center', fontsize=FS_TEXT, fontweight='bold')
            for br, c in [(D_band, '#8E24AA'), (G_band, '#3949AB'), (TwoD_band, '#00897B')]:
                ax.axvspan(br[0], br[1], color=c, alpha=0.08)
            ax.grid(alpha=0.2, linestyle=':')
            ax.tick_params(labelsize=FS_TICK)

            prefix, rest = key.split(':', 1)
            rename = {'Q1': 'Q3', 'Q2': 'Q4', 'Q3': 'Q2', 'Q4': 'Q1'}
            new_prefix = rename.get(prefix, prefix)
            ax.set_title(f"{new_prefix}:{rest}", fontsize=FS_LABEL, fontweight='bold')

        axes[2].set_xlabel('Wavenumber [cm^-1]', fontsize=FS_LABEL, fontweight='bold')
        axes[3].set_xlabel('Wavenumber [cm^-1]', fontsize=FS_LABEL, fontweight='bold')
        for k in [0, 2]:
            axes[k].set_ylabel('Intensity (a.u.)', fontsize=FS_LABEL, fontweight='bold')

        figq.suptitle('Representative spectra per quadrant (median)', y=0.98, fontsize=FS_SUPTITLE, fontweight='bold')
        figq.tight_layout(rect=[0, 0, 1, 0.96])
        figq.savefig(spectra_path, dpi=240)
        if args.show:
            plt.show()
        plt.close(figq)
    except Exception as e:
        print(f'Failed to generate quadrant spectra: {e}')
        spectra_path = None

    # Summary composite figure (one row)
    composite_path = os.path.join(args.outdir, 'summary_composite.png')
    try:
        figc, axc = plt.subplots(1, 3, figsize=(18, 6))
        figc.subplots_adjust(wspace=0.08)
        panels = [
            (fwhm_path, 'FWHM(2D) distribution'),
            (hexbin_path, 'Hexbin: I(2D)/I(G) vs I(D)/I(G)'),
            (spectra_path, 'Representative spectra per quadrant'),
        ]
        for ax, (p, title) in zip(axc, panels):
            ax.axis('off')
            if p and os.path.exists(p):
                img = plt.imread(p)
                ax.imshow(img)
                ax.set_title(title, fontsize=FS_LABEL, fontweight='bold')
            else:
                ax.text(0.5, 0.5, f'Missing: {title}', transform=ax.transAxes,
                        ha='center', va='center', fontsize=FS_LABEL, fontweight='bold',
                        bbox=dict(boxstyle='round', facecolor='white', alpha=0.85))
        figc.tight_layout(rect=[0, 0, 1, 1])
        figc.savefig(composite_path, dpi=200)
        if args.show:
            plt.show()
        plt.close(figc)
    except Exception as e:
        print(f'Failed to generate composite summary: {e}')
        composite_path = None

    print('\n=== Generated outputs ===')
    print(f"Hexbin (intensities): {hexbin_path}")
    print(f"FWHM histogram: {fwhm_path}")
    print(f"Quadrant spectra: {spectra_path}")
    print(f"Summary composite: {composite_path}")


if __name__ == '__main__':
    main()

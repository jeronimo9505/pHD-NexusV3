import numpy as np
import h5py
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap, LinearSegmentedColormap
from scipy.signal import savgol_filter
import io
import sys
import os
from PIL import Image as PILImage

# --- Axis/Font style (scalable) ---
FONT_SCALE = 1.2
BASE_TICK = 16
BASE_LABEL = 18
BASE_TITLE = 18
SPINE_LW = 1.7  
FONT_WEIGHT = 'bold'  

FS_TICK = int(BASE_TICK * FONT_SCALE)
FS_LABEL = int(BASE_LABEL * FONT_SCALE)
FS_TITLE = int(BASE_TITLE * FONT_SCALE)

# Config
D_band = (1300, 1350)
G_band = (1580, 1600)
TwoD_band = (2600, 2700)

noise_ranges = {
    'D': [(1200, 1250), (1360, 1400)],
    'G': [(1500, 1550), (1620, 1650)],
    '2D': [(2550, 2580), (2720, 2750)]
}

snr_threshold = 3
epsilon = 1e-5

if len(sys.argv) < 2:
    print("Usage: python graphene.py <path_to_h5>")
    sys.exit(1)

h5_path = sys.argv[1]

# --- Leer datos del archivo .h5 ---
with h5py.File(h5_path, 'r') as f:
    wavenumbers = f['/spectrum/wavenumbers'][:]
    intensities_raw = f['/spectrum/intensities'][:]
    
    meta = dict(f.attrs)
    map_width = int(meta.get('map_width', 0))
    map_height = int(meta.get('map_height', 0))
    n_spectra = intensities_raw.shape[0]

# Auto-detect dimensions if missing
if map_width <= 0 or map_height <= 0:
    map_width = int(np.ceil(np.sqrt(n_spectra)))
    map_height = int(np.ceil(n_spectra / map_width))

area_size_x = float(map_width)
area_size_y = float(map_height)
m_max = map_width
n_max = map_height

# We expect intensities to be reshaped to (n_max(y), m_max(x), wavenumbers)
# Assuming row-major order: y is the slow axis, x is the fast axis
# In Python, reshape(n_max, m_max, -1) creates an array where [y, x, w]
# If the original scan was columns instead, this needs tweaking. We assume standard.
try:
    intensities = intensities_raw.reshape((n_max, m_max, len(wavenumbers)))
except Exception as e:
    # If partial scan, pad it
    padded = np.zeros((n_max * m_max, len(wavenumbers)))
    padded[:n_spectra, :] = intensities_raw
    intensities = padded.reshape((n_max, m_max, len(wavenumbers)))

# Flip Y axis to match origin='lower' standard if desired (as g4.py did)
intensities = intensities[::-1, :, :]

# --- Preprocesamiento ---
def smooth_spectrum(spectrum):
    wl = 7
    return savgol_filter(spectrum, wl, 3)

processed_intensities = np.zeros_like(intensities)
for i in range(n_max):
    for j in range(m_max):
        processed_intensities[i, j, :] = smooth_spectrum(intensities[i, j, :])

# --- Funciones para SNR y máximo ---
def snr_local(spectrum, band_range, noise_ranges):
    idx_band = (wavenumbers >= band_range[0]) & (wavenumbers <= band_range[1])
    peak = np.max(spectrum[idx_band])
    idx_noise = np.hstack([np.where((wavenumbers >= r[0]) & (wavenumbers <= r[1]))[0] for r in noise_ranges])
    noise = spectrum[idx_noise]
    valid_noise = noise[np.isfinite(noise)]
    if len(valid_noise) == 0: return 0
    std_noise = np.std(valid_noise)
    return (peak - np.mean(valid_noise)) / std_noise if std_noise != 0 else 0

def max_in_range(spectrum, band_range):
    idx = (wavenumbers >= band_range[0]) & (wavenumbers <= band_range[1])
    return np.max(spectrum[idx]) if np.any(idx) else np.nan

# --- Crear mapas ---
# Note: In g4.py map logic was map[y, x] originally but written as map[i, j] where i=m_max. 
# We fixed it here: map_D will be shape (n_max, m_max)
map_D = np.zeros((n_max, m_max))
map_G = np.zeros((n_max, m_max))
map_2D = np.zeros((n_max, m_max))

for i in range(n_max):
    for j in range(m_max):
        spectrum = processed_intensities[i, j, :]
        if snr_local(spectrum, D_band, noise_ranges['D']) >= snr_threshold:
            map_D[i, j] = max_in_range(spectrum, D_band)
        if snr_local(spectrum, G_band, noise_ranges['G']) >= snr_threshold:
            map_G[i, j] = max_in_range(spectrum, G_band)
        if snr_local(spectrum, TwoD_band, noise_ranges['2D']) >= snr_threshold:
            map_2D[i, j] = max_in_range(spectrum, TwoD_band)

# --- Correlaciones ---
ratio_2D_G = np.zeros_like(map_2D)
valid_2D_G = (map_2D > 0) & (map_G > 0)
ratio_2D_G[valid_2D_G] = map_2D[valid_2D_G] / (map_G[valid_2D_G] + epsilon)

ratio_D_G = np.zeros_like(map_D)
valid_D_G = (map_D > 0) & (map_G > 0)
ratio_D_G[valid_D_G] = map_D[valid_D_G] / (map_G[valid_D_G] + epsilon)

def mask_zeros(arr): return np.where(arr == 0, np.nan, arr)

map_D_masked = mask_zeros(map_D)
map_G_masked = mask_zeros(map_G)
map_2D_masked = mask_zeros(map_2D)
ratio_2D_G_masked = mask_zeros(ratio_2D_G)
ratio_D_G_masked = mask_zeros(ratio_D_G)

def cmap_white_for_nan(base):
    import matplotlib
    cmap = matplotlib.colormaps.get_cmap(base)
    new_cmap = ListedColormap(cmap(np.linspace(0, 1, 256)))
    new_cmap.set_bad('white')
    return new_cmap

extent = [0, area_size_x, 0, area_size_y]

# --- Visualización ---
fig, axs = plt.subplots(2, 3, figsize=(18, 10))
valid_mean_vals = []
for arr in (map_D, map_G, map_2D):
    valid = arr[arr > 0]
    if valid.size:
        valid_mean_vals.append(float(np.nanmean(valid)))
global_mean_max = max(valid_mean_vals) if valid_mean_vals else 1.0
GLOBAL_VMAX = global_mean_max * 1.25

im0 = axs[0, 0].imshow(map_D_masked, cmap=cmap_white_for_nan('Reds'), extent=extent, origin='lower', vmin=0, vmax=GLOBAL_VMAX)
axs[0, 0].set_title('D Band Intensity')
axs[0, 0].set_xlabel('X (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
axs[0, 0].set_ylabel('Y (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
fig.colorbar(im0, ax=axs[0, 0])

im1 = axs[0, 1].imshow(map_G_masked, cmap=cmap_white_for_nan('Greens'), extent=extent, origin='lower', vmin=0, vmax=GLOBAL_VMAX)
axs[0, 1].set_title('G Band Intensity')
axs[0, 1].set_xlabel('X (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
axs[0, 1].set_ylabel('Y (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
fig.colorbar(im1, ax=axs[0, 1])

im2 = axs[0, 2].imshow(map_2D_masked, cmap=cmap_white_for_nan('Blues'), extent=extent, origin='lower', vmin=0, vmax=GLOBAL_VMAX)
axs[0, 2].set_title('2D Band Intensity')
axs[0, 2].set_xlabel('X (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
axs[0, 2].set_ylabel('Y (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
fig.colorbar(im2, ax=axs[0, 2])

vmin_ratio, vmax_ratio = 0.0, 3.5
stops = [
    (0.00, (1.0, 1.0, 1.0)),    
    (0.01, (1.0, 0.0, 0.0)),    
    (0.30, (1.0, 0.2, 0.0)),    
    (0.50, (1.0, 0.4, 0.0)),    
    (1.00, (1.0, 0.647, 0.0)),  
    (1.60, (1.0, 1.0, 0.0)),    
    (2.50, (0.565, 0.933, 0.565)), 
    (3.00, (0.0, 0.5, 0.0)),    
    (3.50, (0.0, 0.392, 0.0)),  
]
normed_positions = [ (v - vmin_ratio) / (vmax_ratio - vmin_ratio) for v, _ in stops ]
colors = [ c for _, c in stops ]
cmap_2DG = LinearSegmentedColormap.from_list('custom2DG_grad', list(zip(normed_positions, colors)), N=256)
cmap_2DG.set_bad('white')

im3 = axs[1, 0].imshow(ratio_2D_G_masked, cmap=cmap_2DG, origin='lower', extent=extent, vmin=vmin_ratio, vmax=vmax_ratio)
axs[1, 0].set_title('I(2D)/I(G)\nmultilayer→monolayer')
axs[1, 0].set_xlabel('X (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
axs[1, 0].set_ylabel('Y (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
fig.colorbar(im3, ax=axs[1, 0])

cmap_DG = LinearSegmentedColormap.from_list('DGdefects', [(1.0, 1.0, 1.0), (1.0, 0.7, 0.7), (1.0, 0.0, 0.0), (0.2, 0.0, 0.0)])
cmap_DG.set_bad('white')

im4 = axs[1, 1].imshow(ratio_D_G_masked, cmap=cmap_DG, extent=extent, origin='lower', vmin=0, vmax=1)
axs[1, 1].set_title('I(D)/I(G)')
axs[1, 1].set_xlabel('X (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
axs[1, 1].set_ylabel('Y (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
fig.colorbar(im4, ax=axs[1, 1])

spectrum_ax = axs[1, 2]
spectrum_line, = spectrum_ax.plot(wavenumbers, processed_intensities[0, 0, :])
spectrum_ax.set_title('Pixel Spectrum (0, 0)')

def onclick(event):
    if event.inaxes not in axs[:2, :3].flatten():
        return
    x, y = event.xdata, event.ydata
    col = int(x / (area_size_x / m_max))
    row = int(y / (area_size_y / n_max))
    if 0 <= row < n_max and 0 <= col < m_max:
        spectrum = processed_intensities[row, col, :]
        spectrum_ax.clear()
        spectrum_ax.plot(wavenumbers, spectrum)
        spectrum_ax.set_title(f'Pixel Spectrum ({row}, {col})')
        fig.canvas.draw_idle()

fig.canvas.mpl_connect('button_press_event', onclick)
plt.tight_layout()
plt.show()

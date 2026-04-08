import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from scipy.signal import savgol_filter
import io
import tempfile
from PIL import Image as PILImage

# --- Axis/Font style (scalable) ---
# Ajusta este factor para aumentar/disminuir todo el tamaño de ejes de forma global
FONT_SCALE = 1.2
BASE_TICK = 16
BASE_LABEL = 18
BASE_TITLE = 18
SPINE_LW = 1.7  # grosor de los bordes de los ejes
FONT_WEIGHT = 'bold'  # 'normal' o 'bold' para poner el texto en negrita

FS_TICK = int(BASE_TICK * FONT_SCALE)
FS_LABEL = int(BASE_LABEL * FONT_SCALE)
FS_TITLE = int(BASE_TITLE * FONT_SCALE)

# Try optional clipboard backends
try:
    import win32clipboard
    import win32con
    _HAS_WIN32 = True
except Exception:
    _HAS_WIN32 = False

try:
    # Try PyQt5 (used by Qt backends)
    from PyQt5 import QtWidgets, QtGui, QtCore
    _HAS_QT = True
except Exception:
    try:
        from PySide2 import QtWidgets, QtGui, QtCore
        _HAS_QT = True
    except Exception:
        _HAS_QT = False

# --- Configuración del archivo y parámetros ---
import sys

# --- Configuración del archivo y parámetros ---
filename = r"C:\Users\Rodrigo\OneDrive - unizar.es\Scripts\grafeno\G5_100um.txt"
area_size_x = 100.0
area_size_y = 100.0

# --- Soporte para argumentos desde GUI o terminal ---
if len(sys.argv) >= 4:
    filename = sys.argv[1]
    area_size_x = float(sys.argv[2])
    area_size_y = float(sys.argv[3])
    print(f"Archivo pasado: {filename}")
    print(f"Area size X: {area_size_x}")
    print(f"Area size Y: {area_size_y}")
else:
    print(f"Usando archivo por defecto: {filename}")
    print(f"Area size X: {area_size_x}")
    print(f"Area size Y: {area_size_y}")


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

# --- Leer datos del archivo ---
df = pd.read_csv(filename, sep='\t', header=[0, 1])
wavenumbers = df.iloc[:, 0].values.astype(float)
columns = df.columns.get_level_values(0)[1:]
positions = [tuple(map(int, col.split('(')[-1].rstrip(')').split('/'))) for col in columns]

m_max = max(p[0] for p in positions) + 1
n_max = max(p[1] for p in positions) + 1
intensities = np.zeros((m_max, n_max, len(wavenumbers)))

for idx, (m, n) in enumerate(positions):
    intensities[n, m, :] = df.iloc[:, idx + 1].values.astype(float)
   
intensities = intensities[::-1, :, :]



# --- Preprocesamiento ---
def smooth_spectrum(spectrum):
    wl = 7
    wl = wl if wl % 2 == 1 else wl + 1
    wl = min(wl, len(spectrum) - 1 if len(spectrum) % 2 == 0 else len(spectrum))
    # No normalizar los datos: aplicar suavizado directamente sobre la intensidad original
    return savgol_filter(spectrum, wl, 3)

processed_intensities = np.zeros_like(intensities)
for i in range(m_max):
    for j in range(n_max):
        processed_intensities[i, j, :] = smooth_spectrum(intensities[i, j, :])

# --- Funciones para SNR y máximo ---
def snr_local(spectrum, band_range, noise_ranges):
    idx_band = (wavenumbers >= band_range[0]) & (wavenumbers <= band_range[1])
    peak = np.max(spectrum[idx_band])
    idx_noise = np.hstack([np.where((wavenumbers >= r[0]) & (wavenumbers <= r[1]))[0] for r in noise_ranges])
    noise = spectrum[idx_noise]
    return (peak - np.mean(noise)) / np.std(noise) if np.std(noise) != 0 else 0

def max_in_range(spectrum, band_range):
    idx = (wavenumbers >= band_range[0]) & (wavenumbers <= band_range[1])
    return np.max(spectrum[idx]) if np.any(idx) else np.nan

# --- Crear mapas ---
map_D, map_G, map_2D = np.zeros((m_max, n_max)), np.zeros((m_max, n_max)), np.zeros((m_max, n_max))

for i in range(m_max):
    for j in range(n_max):
        spectrum = processed_intensities[i, j, :]
        if snr_local(spectrum, D_band, noise_ranges['D']) >= snr_threshold:
            map_D[i, j] = max_in_range(spectrum, D_band)
        if snr_local(spectrum, G_band, noise_ranges['G']) >= snr_threshold:
            map_G[i, j] = max_in_range(spectrum, G_band)
        if snr_local(spectrum, TwoD_band, noise_ranges['2D']) >= snr_threshold:
            map_2D[i, j] = max_in_range(spectrum, TwoD_band)

# --- Correlaciones corregidas: solo donde ambos mapas son válidos, si no, cero ---
ratio_2D_G = np.zeros_like(map_2D)
valid_2D_G = (map_2D > 0) & (map_G > 0)
ratio_2D_G[valid_2D_G] = map_2D[valid_2D_G] / (map_G[valid_2D_G] + epsilon)

ratio_D_G = np.zeros_like(map_D)
valid_D_G = (map_D > 0) & (map_G > 0)
ratio_D_G[valid_D_G] = map_D[valid_D_G] / (map_G[valid_D_G] + epsilon)


# --- Reemplazar ceros por np.nan para mostrar como blanco ---
def mask_zeros(arr): return np.where(arr == 0, np.nan, arr)

map_D_masked = mask_zeros(map_D)
map_G_masked = mask_zeros(map_G)
map_2D_masked = mask_zeros(map_2D)
ratio_2D_G_masked = mask_zeros(ratio_2D_G)
ratio_D_G_masked = mask_zeros(ratio_D_G)

# --- Colormaps que muestran nan como blanco ---
def cmap_white_for_nan(base):
    # Use new colormap API to avoid deprecation warning
    import matplotlib
    cmap = matplotlib.colormaps.get_cmap(base)
    new_cmap = ListedColormap(cmap(np.linspace(0, 1, 256)))
    new_cmap.set_bad('white')
    return new_cmap

extent = [0, area_size_x, 0, area_size_y]

# --- Visualización ---
fig, axs = plt.subplots(2, 3, figsize=(18, 10))
# Escala global para intensidades (usar el promedio por banda; tomar la banda con mayor promedio y sumar 25%)
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
cbar0 = fig.colorbar(im0, ax=axs[0, 0])
cbar0.ax.tick_params(labelsize=FS_TICK, colors='black')
cbar0.outline.set_edgecolor('black')
cbar0.set_label('Intensity (counts)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
for t in cbar0.ax.get_yticklabels():
    t.set_fontweight(FONT_WEIGHT)

im1 = axs[0, 1].imshow(map_G_masked, cmap=cmap_white_for_nan('Greens'), extent=extent, origin='lower', vmin=0, vmax=GLOBAL_VMAX)
axs[0, 1].set_title('G Band Intensity')
axs[0, 1].set_xlabel('X (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
axs[0, 1].set_ylabel('Y (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
cbar1 = fig.colorbar(im1, ax=axs[0, 1])
cbar1.ax.tick_params(labelsize=FS_TICK, colors='black')
cbar1.outline.set_edgecolor('black')
cbar1.set_label('Intensity (counts)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
for t in cbar1.ax.get_yticklabels():
    t.set_fontweight(FONT_WEIGHT)

im2 = axs[0, 2].imshow(map_2D_masked, cmap=cmap_white_for_nan('Blues'), extent=extent, origin='lower', vmin=0, vmax=GLOBAL_VMAX)
axs[0, 2].set_title('2D Band Intensity')
axs[0, 2].set_xlabel('X (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
axs[0, 2].set_ylabel('Y (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
cbar2 = fig.colorbar(im2, ax=axs[0, 2])
cbar2.ax.tick_params(labelsize=FS_TICK, colors='black')
cbar2.outline.set_edgecolor('black')
cbar2.set_label('Intensity (counts)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
for t in cbar2.ax.get_yticklabels():
    t.set_fontweight(FONT_WEIGHT)

from matplotlib.colors import LinearSegmentedColormap

# --- Custom colormap segmentado y con gradiente suave para I(2D)/I(G) ---
# Reglas solicitadas:
# 0 -> blanco
# 0.01–0.5 -> rojo
# 0.5–1 -> naranja
# 1–1.6 -> amarillo
# 1.6–2.5 -> verde claro
# 2.5–3 -> verde
# 3–3.5 -> verde oscuro
ratio_2D_G_colormap = np.where(ratio_2D_G == 0, np.nan, ratio_2D_G)  # 0 como blanco (se enmascara a NaN)

vmin_ratio, vmax_ratio = 0.0, 3.5
# Ajuste para transiciones suaves (gradiente continuo): añadimos puntos intermedios y
# eliminamos tramos planos para evitar cortes marcados entre colores.
stops = [
    (0.00, (1.0, 1.0, 1.0)),    # blanco
    (0.01, (1.0, 0.0, 0.0)),    # rojo
    (0.30, (1.0, 0.2, 0.0)),    # rojo anaranjado (transición)
    (0.50, (1.0, 0.4, 0.0)),    # hacia naranja
    (1.00, (1.0, 0.647, 0.0)),  # naranja (#FFA500)
    (1.60, (1.0, 1.0, 0.0)),    # amarillo
    (2.50, (0.565, 0.933, 0.565)), # verde claro (#90EE90)
    (3.00, (0.0, 0.5, 0.0)),    # verde (#008000)
    (3.50, (0.0, 0.392, 0.0)),  # verde oscuro (#006400)
]
normed_positions = [ (v - vmin_ratio) / (vmax_ratio - vmin_ratio) for v, _ in stops ]
colors = [ c for _, c in stops ]
cmap_2DG = LinearSegmentedColormap.from_list('custom2DG_grad', list(zip(normed_positions, colors)), N=256)
cmap_2DG.set_bad('white')  # np.nan se muestra blanco

# --- Visualización con el nuevo colormap (vmin=0, vmax=3.5) ---
im3 = axs[1, 0].imshow(ratio_2D_G_colormap,
                       cmap=cmap_2DG,
                       origin='lower',
                       extent=extent,
                       vmin=vmin_ratio,
                       vmax=vmax_ratio)
axs[1, 0].set_title('I(2D)/I(G)\nmultilayer→monolayer')
axs[1, 0].set_xlabel('X (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
axs[1, 0].set_ylabel('Y (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
cbar3 = fig.colorbar(im3, ax=axs[1, 0])
cbar3.ax.tick_params(labelsize=FS_TICK, colors='black')
cbar3.outline.set_edgecolor('black')
cbar3.set_label('I(2D)/I(G)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
# Ticks espaciados uniformemente (cada 0.5 de 0.0 a 3.5)
ticks = np.arange(vmin_ratio, vmax_ratio + 1e-9, 0.5)
cbar3.set_ticks(ticks)
for t in cbar3.ax.get_yticklabels():
    t.set_fontweight(FONT_WEIGHT)

from matplotlib.colors import LinearSegmentedColormap

# --- Custom colormap: blanco → rosado → rojo → rojo oscuro ---
cmap_DG = LinearSegmentedColormap.from_list(
    'DGdefects',
    [
        (1.0, 1.0, 1.0),  # blanco (0, sin defectos)
        (1.0, 0.7, 0.7),  # rosado claro (~0.33)
        (1.0, 0.0, 0.0),  # rojo puro (~0.66)
        (0.2, 0.0, 0.0),  # rojo oscuro/negro (1, muchos defectos)
    ]
)
cmap_DG.set_bad('white')


im4 = axs[1, 1].imshow(ratio_D_G_masked, cmap=cmap_DG, extent=extent, origin='lower', vmin=0, vmax=1)

axs[1, 1].set_title('I(D)/I(G)')
axs[1, 1].set_xlabel('X (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
axs[1, 1].set_ylabel('Y (µm)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
cbar4 = fig.colorbar(im4, ax=axs[1, 1])
cbar4.ax.tick_params(labelsize=FS_TICK, colors='black')
cbar4.outline.set_edgecolor('black')
cbar4.set_label('I(D)/I(G)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
for t in cbar4.ax.get_yticklabels():
    t.set_fontweight(FONT_WEIGHT)

spectrum_ax = axs[1, 2]
spectrum_line, = spectrum_ax.plot(wavenumbers, processed_intensities[0, 0, :])
spectrum_ax.set_title('Pixel Spectrum (0, 0)')
spectrum_ax.set_xlabel('Wavenumber (cm⁻¹)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
spectrum_ax.set_ylabel('Intensity (a.u.)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)

# --- Interactividad: clic en mapa ---
def onclick(event):

    # Right-click: copy image to clipboard (no menu)
    if event.button == 3 and event.inaxes in axs[:2, :3].flatten():
        ax = event.inaxes
        ok = copy_axes_image_to_clipboard(ax, fig)
        if ok:
            print('Imagen copiada al portapapeles.')
        else:
            print('No se pudo copiar al portapapeles.')
        return

    # Left-click: show spectrum (existing behavior)
    if event.inaxes not in axs[:2, :3].flatten():
        return
    x, y = event.xdata, event.ydata
    col = int(x / (area_size_x / n_max))
    row = int(y / (area_size_y / m_max))
    if 0 <= row < m_max and 0 <= col < n_max:
        spectrum = processed_intensities[row, col, :]
        if np.all(spectrum == 0):
            spectrum_ax.clear()
            spectrum_ax.set_title(f'Pixel ({row}, {col}): sin datos')
            spectrum_ax.axis('off')
        else:
            spectrum_ax.clear()
            spectrum_ax.plot(wavenumbers, spectrum)
            spectrum_ax.set_title(f'Pixel Spectrum ({row}, {col})', fontsize=FS_TITLE, color='black', fontweight=FONT_WEIGHT)
            spectrum_ax.set_xlabel('Wavenumber (cm⁻¹)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
            spectrum_ax.set_ylabel('Intensity (a.u.)', fontsize=FS_LABEL, color='black', fontweight=FONT_WEIGHT)
        fig.canvas.draw_idle()


def copy_axes_image_to_clipboard(ax, fig=fig):
    """Render the figure, crop to the axes bbox and copy that image to the Windows clipboard.

    Tries Qt clipboard first (if Qt is available), otherwise falls back to pywin32 + Pillow.
    """
    # Use savefig to BytesIO for exact output (like matplotlib's save)
    bbox = ax.get_window_extent().transformed(fig.dpi_scale_trans.inverted())
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches=bbox)
    buf.seek(0)
    pil_img = PILImage.open(buf).convert('RGB')

    # Try Qt clipboard
    if _HAS_QT:
        try:
            qimg = QtGui.QImage(pil_img.tobytes(), pil_img.width, pil_img.height, QtGui.QImage.Format_RGB888)
            app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
            clipboard = app.clipboard()
            clipboard.setImage(qimg)
            print('Imagen copiada al portapapeles (Qt backend)')
            return True
        except Exception as e:
            print(f'Error Qt clipboard: {e}')

    # Fallback: use win32clipboard + BMP (DIB) trick
    if _HAS_WIN32:
        try:
            output = io.BytesIO()
            pil_img.save(output, 'BMP')
            data = output.getvalue()[14:]
            win32clipboard.OpenClipboard()
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardData(win32con.CF_DIB, data)
            win32clipboard.CloseClipboard()
            print('Imagen copiada al portapapeles (Windows backend)')
            return True
        except Exception as e:
            print(f'Error Windows clipboard: {e}')
            try:
                win32clipboard.CloseClipboard()
            except Exception:
                pass

    print('No se pudo copiar al portapapeles: falta PyQt5/PySide2 o pywin32/Pillow.')
    return False


def show_context_menu(event):
    """Show a small context menu at the mouse position with a 'Copy image to clipboard' action."""
    ax = event.inaxes
    backend = plt.get_backend().lower()

    def _on_copy():
        ok = copy_axes_image_to_clipboard(ax, fig)
        if not ok:
            print('No se pudo copiar al portapapeles: falta PyQt5/PySide2 o pywin32/Pillow.')

    # Tk backend menu
    if 'tk' in backend:
        try:
            import tkinter as _tk
            menu = _tk.Menu(fig.canvas.manager.window, tearoff=0)
            menu.add_command(label='Copiar imagen al portapapeles', command=_on_copy)
            menu.tk_popup(int(event.guiEvent.x_root), int(event.guiEvent.y_root))
            return
        except Exception:
            pass

    # Qt backend menu
    if 'qt' in backend and _HAS_QT:
        try:
            qmenu = QtWidgets.QMenu()
            action = qmenu.addAction('Copiar imagen al portapapeles')
            pos = event.guiEvent.globalPos() if hasattr(event, 'guiEvent') else QtCore.QPoint(int(event.x), int(event.y))
            selected = qmenu.exec_(pos)
            if selected == action:
                _on_copy()
            return
        except Exception:
            pass

    # Generic fallback: just perform copy
    _on_copy()

fig.canvas.mpl_connect('button_press_event', onclick)

# --- Aplicar estilos de ejes (ticks negros más grandes, bordes más gruesos, títulos más grandes) ---
for ax in axs.flat:
    ax.tick_params(axis='both', labelsize=FS_TICK, colors='black')
    # Bordes de ejes
    for spine in ax.spines.values():
        spine.set_color('black')
        spine.set_linewidth(SPINE_LW)
    # Título (si existe)
    title = ax.get_title()
    if title:
        ax.set_title(title, fontsize=FS_TITLE, color='black', fontweight=FONT_WEIGHT)
    # Poner ticks en negrita
    for t in ax.get_xticklabels() + ax.get_yticklabels():
        t.set_fontweight(FONT_WEIGHT)

plt.tight_layout()
plt.show()

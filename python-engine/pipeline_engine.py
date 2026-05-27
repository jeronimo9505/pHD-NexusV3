import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from scipy.ndimage import median_filter

# Robust imports
try:
    from sklearn.preprocessing import StandardScaler, MinMaxScaler
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

try:
    import pybaselines
    HAS_PYBASELINES = True
except ImportError:
    HAS_PYBASELINES = False


def apply_pipeline(x: np.ndarray, y: np.ndarray, steps: List[Dict[str, Any]], focus_index: int = -1) -> Dict[str, Any]:
    """
    Executes a sequence of spectral preprocessing steps.
    x: (n_points,)
    y: (n_spectra, n_points) or (n_points,)
    """
    is_1d = (y.ndim == 1)
    if is_1d:
        y = y.reshape(1, -1)

    x_current = x.copy()
    y_current = y.copy()
    x_at_stage = None
    stage_input = None
    baseline = np.zeros_like(y)
    spike_positions = []

    for i, step in enumerate(steps):
        if not step.get("enabled", True):
            continue

        # Capture input for the stage the user is currently editing
        if i == focus_index:
            stage_input = y_current[0].copy()
            x_at_stage = x_current.copy()

        stype = step.get("type", "").lower()
        params = step.get("params", {})

        try:
            if stype == "crop":
                x_current, y_current = _step_crop(x_current, y_current, params)
                baseline = np.zeros_like(y_current)

            elif stype == "despike":
                y_current, spikes = _step_despike(x_current, y_current, params)
                if i == focus_index:
                    spike_positions = spikes

            elif stype == "baseline":
                y_current, current_baselines = _step_baseline(x_current, y_current, params)
                if i == focus_index:
                    baseline = current_baselines

            elif stype == "normalize":
                y_current = _step_normalize(y_current, params)

        except Exception as e:
            print(f"Error in {stype}: {e}")
            import traceback
            traceback.print_exc()

    return {
        "success": True,
        "x": x_current,
        "y": y_current[0] if is_1d else y_current,
        "baseline": baseline[0] if is_1d else baseline,
        "stage_input": stage_input,
        "x_stage": x_at_stage,
        "spike_positions": spike_positions,
    }


def _step_crop(x: np.ndarray, y: np.ndarray, params: dict):
    """Cuts the spectrum to the specified wavenumber range."""
    start = params.get("start", x.min())
    end = params.get("end", x.max())
    mask = (x >= start) & (x <= end)
    if not np.any(mask):
        return x, y
    return x[mask], y[:, mask]


def _step_despike(x: np.ndarray, y: np.ndarray, params: dict) -> Tuple[np.ndarray, List[float]]:
    """
    Detects and removes cosmic ray spikes from Raman spectra.

    Methods:
      - modified_z  : Modified Z-score on raw signal (MAD-based). Good general purpose.
      - whitaker_hayes : Z-score on 1st derivative. Standard for cosmic rays in Raman.
      - iqr         : IQR-based detection. Robust with noisy spectra.
    """
    method = params.get("method", "modified_z").lower()
    threshold = float(params.get("threshold", 5.0))
    window = max(3, int(params.get("window", 7)))
    if window % 2 == 0:
        window += 1  # must be odd for median_filter
    iterations = max(1, int(params.get("iterations", 1)))

    y_out = y.copy()
    all_spike_x = set()

    for iteration in range(iterations):
        for i in range(y_out.shape[0]):
            spec = y_out[i]
            spike_mask = np.zeros(len(spec), dtype=bool)

            if method == "modified_z":
                # Modified Z-score on raw signal using MAD
                filtered = median_filter(spec, size=window)
                diff = np.abs(spec - filtered)
                mad = np.median(diff)
                if mad < 1e-10:
                    mad = 1e-10
                z_scores = 0.6745 * diff / mad
                spike_mask = z_scores > threshold

            elif method == "whitaker_hayes":
                # Whitaker-Hayes: Z-score applied to 1st derivative (np.diff)
                # Best for narrow cosmic ray spikes in Raman
                delta = np.diff(spec)
                median_delta = np.median(delta)
                mad_delta = np.median(np.abs(delta - median_delta))
                if mad_delta < 1e-10:
                    mad_delta = 1e-10
                z_scores = np.abs(0.6745 * (delta - median_delta) / mad_delta)
                # diff has N-1 points; a spike at index k affects z[k-1] and z[k]
                spike_diff_mask = z_scores > threshold
                # Expand back to N points
                spike_mask_expanded = np.zeros(len(spec), dtype=bool)
                spike_mask_expanded[1:] |= spike_diff_mask
                spike_mask_expanded[:-1] |= spike_diff_mask
                spike_mask = spike_mask_expanded

            elif method == "iqr":
                # IQR-based detection
                filtered = median_filter(spec, size=window)
                residuals = spec - filtered
                q1 = np.percentile(residuals, 25)
                q3 = np.percentile(residuals, 75)
                iqr = q3 - q1
                if iqr < 1e-10:
                    iqr = 1e-10
                # Points beyond threshold*IQR from median are spikes
                lower = q1 - threshold * iqr
                upper = q3 + threshold * iqr
                spike_mask = (residuals < lower) | (residuals > upper)

            # Replace spikes with local median interpolation
            if np.any(spike_mask):
                corrected = median_filter(spec, size=window)
                y_out[i, spike_mask] = corrected[spike_mask]

                # Collect spike x-positions (for first spectrum only, for visualization)
                if i == 0:
                    spike_indices = np.where(spike_mask)[0]
                    for idx in spike_indices:
                        all_spike_x.add(float(x[idx]))

    spike_positions = sorted(list(all_spike_x))
    return y_out, spike_positions


def _step_baseline(x: np.ndarray, y: np.ndarray, params: dict) -> Tuple[np.ndarray, np.ndarray]:
    """
    Baseline correction using pybaselines.

    Supported methods:
      Whittaker:   asls, iasls, airpls, arpls, drpls, psalsa
      Polynomial:  modpoly, imodpoly
      Smoothing:   snip
      Other:       rubberband
    """
    method = params.get("method", "asls").lower()

    # Build peak-protection weights if regions are provided
    # peak_regions: list of [start_wn, end_wn] that should NOT be flattened
    peak_regions = params.get("peak_regions", [])
    weights = None
    if peak_regions:
        weights = np.ones(len(x))
        for region in peak_regions:
            try:
                r_start = float(region[0])
                r_end = float(region[1])
                mask = (x >= r_start) & (x <= r_end)
                weights[mask] = 0.0
            except (IndexError, TypeError, ValueError):
                pass

    try:
        from pybaselines import Baseline
        fitter = Baseline(x_data=x)
    except Exception as e:
        print(f"pybaselines import error: {e}")
        return y, np.zeros_like(y)

    y_out = np.zeros_like(y)
    baselines = np.zeros_like(y)

    for i in range(y.shape[0]):
        spec = y[i]
        try:
            kwargs = {}
            if weights is not None:
                kwargs["weights"] = weights

            # ── Whittaker Smoothing Methods ──────────────────────────────────
            if method == "asls":
                # Asymmetric Least Squares — best general purpose
                # λ: smoothness (1e2 to 1e10), p: asymmetry (0.001 to 0.1)
                lam = float(params.get("lam", 1e5))
                p = float(params.get("p", 0.001))
                b, _ = fitter.asls(spec, lam=lam, p=p, **kwargs)

            elif method == "iasls":
                # Improved Asymmetric Least Squares — adds 1st derivative constraint
                lam = float(params.get("lam", 1e5))
                p = float(params.get("p", 0.01))
                lam_1 = float(params.get("lam_1", 1e-4))
                b, _ = fitter.iasls(spec, lam=lam, p=p, lam_1=lam_1, **kwargs)

            elif method == "airpls":
                # Adaptive Iterative Reweighted PLS — good for fluorescence
                lam = float(params.get("lam", 1e5))
                b, _ = fitter.airpls(spec, lam=lam, **kwargs)

            elif method == "arpls":
                # Asymmetrically Reweighted PLS — robust, handles baseline drift well
                lam = float(params.get("lam", 1e5))
                b, _ = fitter.arpls(spec, lam=lam, **kwargs)

            elif method == "drpls":
                # Doubly Reweighted PLS — handles both peaks and noise well
                lam = float(params.get("lam", 1e5))
                eta = float(params.get("eta", 0.5))
                b, _ = fitter.drpls(spec, lam=lam, eta=eta, **kwargs)

            elif method == "psalsa":
                # Peaked Signal's Asymmetric LS — PEAK AWARE, excellent for Raman
                # Explicitly designed NOT to flatten peaks
                lam = float(params.get("lam", 1e5))
                p = float(params.get("p", 0.5))
                k = float(params.get("k", 2.0))
                b, _ = fitter.psalsa(spec, lam=lam, p=p, k=k, **kwargs)

            # ── Polynomial Methods ────────────────────────────────────────────
            elif method == "modpoly":
                # Modified Polynomial Fit
                poly_order = int(params.get("poly_order", 5))
                b, _ = fitter.modpoly(spec, poly_order=poly_order, **kwargs)

            elif method == "imodpoly":
                # Improved Modified Polynomial Fit — iterative, more accurate
                poly_order = int(params.get("poly_order", 5))
                tol = float(params.get("tol", 1e-3))
                b, _ = fitter.imodpoly(spec, poly_order=poly_order, tol=tol, **kwargs)

            # ── Smoothing Methods ─────────────────────────────────────────────
            elif method == "snip":
                # Statistics-sensitive Non-linear Iterative Peak-clipping
                # Great for nuclear spectra and Raman; parameter = number of iterations
                max_half_window = int(params.get("max_half_window", 40))
                decreasing = bool(params.get("decreasing", False))
                b, _ = fitter.snip(
                    spec,
                    max_half_window=max_half_window,
                    decreasing=decreasing,
                    **kwargs
                )

            # ── Classification / Other ────────────────────────────────────────
            elif method == "rubberband":
                # Convex hull rubberband — fast, parameter-free, good for linear baselines
                b, _ = fitter.rubberband(spec)

            else:
                b, _ = fitter.asls(spec, lam=1e5, p=0.001)

        except Exception as e:
            print(f"Baseline method '{method}' failed for spectrum {i}: {e}")
            import traceback
            traceback.print_exc()
            b = np.zeros_like(spec)

        y_out[i] = spec - b
        baselines[i] = b

    return y_out, baselines


def _step_normalize(y: np.ndarray, params: dict) -> np.ndarray:
    method = params.get("method", "snv").lower()
    y_out = np.zeros_like(y)
    for i in range(y.shape[0]):
        spec = y[i]
        if method == "snv":
            y_out[i] = (spec - np.mean(spec)) / (np.std(spec) + 1e-8)
        elif method == "minmax":
            mi, ma = np.min(spec), np.max(spec)
            y_out[i] = (spec - mi) / (ma - mi + 1e-8)
        elif method == "vector":
            norm = np.linalg.norm(spec)
            y_out[i] = spec / norm if norm > 0 else spec
        else:
            y_out[i] = spec
    return y_out

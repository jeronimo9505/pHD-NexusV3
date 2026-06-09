"""
Deconvolution Engine — PhD Nexus Science Engine
Peak fitting for Raman spectra using lmfit.

Supports:
- Interactive fit on representative spectrum
- Batch fit over entire maps
- Multiple line shapes: Lorentzian, Gaussian, Voigt, PseudoVoigt
- Baseline correction via pybaselines
- Statistical output: R², χ², AIC, BIC, per-peak parameters + errors
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
import numpy as np
import lmfit
from lmfit.models import LorentzianModel, GaussianModel, VoigtModel, PseudoVoigtModel
from scipy.signal import find_peaks as scipy_find_peaks
from pybaselines import Baseline
import re
from concurrent.futures import ProcessPoolExecutor
import os

def sanitize_prefix(name: str) -> str:
    """Return a valid python identifier for lmfit prefix from the given name."""
    s = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    if s and s[0].isdigit():
        s = 'p_' + s
    return s

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class PeakConfig:
    name: str
    model: str          # "Lorentzian" | "Gaussian" | "Voigt" | "PseudoVoigt"
    center: float
    center_min: float
    center_max: float
    fwhm_init: float = 30.0
    active: bool = True


@dataclass
class FitResult:
    best_fit: np.ndarray
    components: dict            # {peak_name: np.ndarray}
    baseline: np.ndarray
    corrected: np.ndarray
    residuals: np.ndarray
    x: np.ndarray
    parameters: list            # list of dicts with health checks
    metrics: dict               # r_squared, chi2_reduced, aic, bic
    local_metrics: dict         # Regional R2 and RMSE
    success: bool
    message: str = ""


# ---------------------------------------------------------------------------
# Model templates (presets with informative descriptions)
# ---------------------------------------------------------------------------

MODEL_TEMPLATES = {
    "generic": {
        "label": "Generic Raman",
        "description": (
            "General purpose — no predefined bands. "
            "Click on the spectrum to add peaks, or use Auto-detect."
        ),
        "peaks": [],
    },
    "graphene": {
        "label": "Graphene",
        "description": (
            "Graphene template based on expert Raman analysis:\n"
            "• D  ~1322 cm⁻¹ — Defects, edges, substrate interaction\n"
            "• G  ~1583 cm⁻¹ — sp² C-C bonds\n"
            "• D' ~1620 cm⁻¹ — Intravalley defects (activate to test G + D' model)\n"
            "• 2460 ~2460 cm⁻¹ — Second order combined band\n"
            "• 2D ~2637 cm⁻¹ — Layer evaluation (monolayer indicator)\n"
            "• 2800 ~2800 cm⁻¹ — Tentative secondary band"
        ),
        "peaks": [
            {
                "name": "D",  "model": "Lorentzian", "center": 1322.0, "center_min": 1300.0, "center_max": 1360.0, "fwhm_init": 40.0,  "active": True,
                "description": "Indica defectos, bordes, desorden estructural, interacción con el sustrato o posible efecto del Au/SERS."
            },
            {
                "name": "G",  "model": "Lorentzian", "center": 1583.0, "center_min": 1550.0, "center_max": 1610.0, "fwhm_init": 20.0,  "active": True,
                "description": "Es la banda principal del grafeno/grafito, asociada a vibraciones de enlaces sp² C–C."
            },
            {
                "name": "D_prime", "model": "Lorentzian", "center": 1620.0, "center_min": 1605.0, "center_max": 1635.0, "fwhm_init": 15.0,  "active": False,
                "description": "Hombro derecho de la banda G. Suele aparecer cuando hay banda D clara. Activar para probar el modelo G + D' y verificar si mejora el residual local."
            },
            {
                "name": "2460", "model": "Lorentzian", "center": 2460.0, "center_min": 2430.0, "center_max": 2490.0, "fwhm_init": 30.0,  "active": True,
                "description": "Probablemente corresponde a una banda combinada de segundo orden (ej. D+G*). Compatible con grafeno."
            },
            {
                "name": "2D", "model": "Lorentzian", "center": 2637.0, "center_min": 2600.0, "center_max": 2700.0, "fwhm_init": 35.0,  "active": True,
                "description": "Banda importante para evaluar número de capas. Intensa y estrecha favorece monolayer-like."
            },
            {
                "name": "2800", "model": "Lorentzian", "center": 2800.0, "center_min": 2750.0, "center_max": 2850.0, "fwhm_init": 40.0,  "active": False,
                "description": "Banda secundaria tentativa. Las tipo D+G suelen estar en 2900-2950, por lo que requiere revisión."
            },
        ],
    },
    "carbon_materials": {
        "label": "Carbon Materials",
        "description": (
            "D, G and 2D bands for general carbon-based materials:\n"
            "• D  ~1350 cm⁻¹ — structural disorder (A₁g mode)\n"
            "• G  ~1580 cm⁻¹ — sp² carbon network (E₂g mode)\n"
            "• 2D ~2680 cm⁻¹ — second-order, broad for disordered carbons\n"
            "ID/Iɢ ratio indicates degree of disorder."
        ),
        "peaks": [
            {"name": "D",  "model": "Lorentzian", "center": 1350.0, "center_min": 1280.0, "center_max": 1420.0, "fwhm_init": 60.0,  "active": True},
            {"name": "G",  "model": "Lorentzian", "center": 1580.0, "center_min": 1540.0, "center_max": 1620.0, "fwhm_init": 30.0,  "active": True},
            {"name": "2D", "model": "Lorentzian", "center": 2680.0, "center_min": 2600.0, "center_max": 2760.0, "fwhm_init": 80.0,  "active": True},
        ],
    },
    "sers": {
        "label": "SERS (generic)",
        "description": (
            "Surface-Enhanced Raman Scattering — generic template.\n"
            "No predefined bands: peak positions depend on the analyte molecule.\n"
            "Use Auto-detect or click the spectrum to place peaks manually."
        ),
        "peaks": [],
    },
}


# ---------------------------------------------------------------------------
# Baseline correction
# ---------------------------------------------------------------------------

def apply_baseline(
    x: np.ndarray,
    y: np.ndarray,
    method: str = "asls",
    params: Optional[dict] = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Returns (y_corrected, baseline).
    Supported methods: 'asls', 'airpls', 'snip', 'modpoly', 'none'.
    """
    if params is None:
        params = {}

    if method == "none":
        min_y = np.min(y)
        return y - min_y, np.full_like(y, min_y)

    fitter = Baseline(x_data=x)

    try:
        # Support dynamic peak masking
        weights = np.ones_like(y)
        exclude_regions = params.get("exclude_regions", [])
        if exclude_regions:
            for r_min, r_max in exclude_regions:
                weights[(x >= r_min) & (x <= r_max)] = 0.0

        if method == "asls":
            lam = float(params.get("lam", 1e6))
            p   = float(params.get("p", 0.01))
            baseline_y, _ = fitter.asls(y, lam=lam, p=p, weights=weights)
        elif method == "airpls":
            lam = float(params.get("lam", 1e6))
            baseline_y, _ = fitter.airpls(y, lam=lam, weights=weights)
        elif method == "snip":
            max_half_window = int(params.get("max_half_window", 40))
            baseline_y, _ = fitter.snip(y, max_half_window=max_half_window)
        elif method == "modpoly":
            poly_order = int(params.get("poly_order", 5))
            baseline_y, _ = fitter.modpoly(y, poly_order=poly_order, weights=weights)
        else:
            baseline_y = np.zeros_like(y)
    except Exception:
        baseline_y = np.zeros_like(y)

    corrected = y - baseline_y
    return corrected, baseline_y


# ---------------------------------------------------------------------------
# lmfit model builder
# ---------------------------------------------------------------------------

def _model_class(model_name: str):
    mapping = {
        "Lorentzian":  LorentzianModel,
        "Gaussian":    GaussianModel,
        "Voigt":       VoigtModel,
        "PseudoVoigt": PseudoVoigtModel,
    }
    return mapping.get(model_name, LorentzianModel)


def build_lmfit_model(peaks: list[dict]) -> tuple[lmfit.CompositeModel, lmfit.Parameters]:
    """
    Build a composite lmfit model from a list of PeakConfig dicts.
    Returns (composite_model, params).
    """
    active_peaks = [p for p in peaks if p.get("active", True)]
    if not active_peaks:
        raise ValueError("No active peaks to fit.")

    composite = None
    params = lmfit.Parameters()

    for pk in active_peaks:
        safe_name = sanitize_prefix(pk['name'])
        prefix = f"{safe_name}_"
        ModelCls = _model_class(pk["model"])
        m = ModelCls(prefix=prefix)

        center      = float(pk["center"])
        center_min  = float(pk["center_min"])
        center_max  = float(pk["center_max"])
        fwhm_init   = float(pk.get("fwhm_init", 30.0))

        # sigma from FWHM (for Lorentzian: FWHM = 2*sigma, for Gaussian: FWHM = 2.35482004503*sigma)
        if pk["model"] == "Gaussian":
            sigma_init = fwhm_init / 2.35482004503
        else:
            sigma_init = fwhm_init / 2.0

        p = m.make_params(
            center=dict(value=center, min=center_min, max=center_max),
            sigma=dict(value=sigma_init, min=1.0, max=200.0),
            amplitude=dict(value=1000.0, min=0.0),
        )
        params.update(p)

        composite = m if composite is None else composite + m

    return composite, params


# ---------------------------------------------------------------------------
# Fit single spectrum
# ---------------------------------------------------------------------------

def fit_spectrum(
    x: np.ndarray,
    y: np.ndarray,
    peaks: list[dict],
    baseline_method: str = "asls",
    baseline_params: Optional[dict] = None,
) -> FitResult:
    """
    Full pipeline: baseline → fit → metrics.
    """
    if baseline_params is None:
        baseline_params = {}

    # 1. Baseline
    y_corr, baseline = apply_baseline(x, y, baseline_method, baseline_params)

    # 2. Build model
    try:
        model, params = build_lmfit_model(peaks)
    except ValueError as e:
        return FitResult(
            best_fit=np.zeros_like(x),
            components={},
            baseline=baseline,
            corrected=y_corr,
            residuals=y_corr,
            x=x,
            parameters=[],
            metrics={"r_squared": 0, "chi2_reduced": 0, "aic": 0, "bic": 0},
            local_metrics={},
            success=False,
            message=str(e),
        )

    # 3. Normalize amplitude init guess from data
    y_max = float(np.max(y_corr)) if np.max(y_corr) > 0 else 1.0
    for name in params:
        if "amplitude" in name:
            params[name].set(value=y_max * 0.5, min=0.0)

    # 4. Fit
    try:
        result = model.fit(y_corr, params, x=x, method="leastsq", max_nfev=400)
    except Exception as e:
        return FitResult(
            best_fit=np.zeros_like(x),
            components={},
            baseline=baseline,
            corrected=y_corr,
            residuals=y_corr,
            x=x,
            parameters=[],
            metrics={"r_squared": 0, "chi2_reduced": 0, "aic": 0, "bic": 0},
            local_metrics={},
            success=False,
            message=f"Fit failed: {e}",
        )

    # 5. Components
    comps = result.eval_components(x=x)
    components = {k.rstrip("_"): v for k, v in comps.items()}

    # 6. Residuals & metrics
    best_fit  = result.best_fit
    residuals = y_corr - best_fit

    ss_res = float(np.sum(residuals**2))
    ss_tot = float(np.sum((y_corr - np.mean(y_corr))**2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0

    n_pts  = len(y_corr)
    n_vars = result.nvarys
    chi2_r = float(result.redchi) if result.redchi is not None else 0.0
    aic    = float(result.aic)    if result.aic    is not None else 0.0
    bic    = float(result.bic)    if result.bic    is not None else 0.0

    # 7. Extract per-peak parameters
    parameters = []
    active_peaks = [p for p in peaks if p.get("active", True)]
    for pk in active_peaks:
        safe_name = sanitize_prefix(pk['name'])
        prefix = f"{safe_name}_"
        pnames = result.params
        def _val(key, default=0.0):
            p = pnames.get(prefix + key)
            return float(p.value) if p is not None else default
        def _err(key, default=0.0):
            p = pnames.get(prefix + key)
            return float(p.stderr) if (p is not None and p.stderr is not None) else default

        sigma    = _val("sigma")
        if pk["model"] == "Gaussian":
            fwhm = sigma * 2.35482004503
        elif pk["model"] == "Lorentzian":
            fwhm = sigma * 2.0
        else:
            fwhm = _val("fwhm", sigma * 2.0)
        amp      = _val("amplitude")
        center   = _val("center")
        # Area: for Lorentzian = π*amp*sigma; Gaussian ≈ amp*sigma*sqrt(2π)
        if pk["model"] == "Lorentzian":
            area = float(np.pi * amp * sigma)
        else:
            area = float(amp * sigma * np.sqrt(2 * np.pi))

        health = "OK"
        if fwhm > 150:
            health = "Rejected (Too broad)"
        elif amp < (np.max(y_corr) * 0.01):
            health = "Warning (Low amplitude)"

        parameters.append({
            "name":          pk["name"],
            "model":         pk["model"],
            "center":        round(center, 3),
            "center_err":    round(_err("center"), 4),
            "fwhm":          round(fwhm, 3),
            "fwhm_err":      round(_err("sigma") * 2.35482004503, 4) if pk["model"] == "Gaussian" else round(_err("sigma") * 2.0, 4),
            "amplitude":     round(amp, 3),
            "amplitude_err": round(_err("amplitude"), 4),
            "area":          round(area, 3),
            "health":        health,
            "description":   pk.get("description", ""),
        })

    # 8. Local Metrics (D, G, 2D)
    local_metrics = {}
    windows = {"D": (1250, 1400), "G": (1500, 1650), "2D": (2550, 2750)}
    for w_name, (w_min, w_max) in windows.items():
        mask = (x >= w_min) & (x <= w_max)
        if np.any(mask):
            loc_y = y_corr[mask]
            loc_res = residuals[mask]
            loc_ss_res = float(np.sum(loc_res**2))
            loc_ss_tot = float(np.sum((loc_y - np.mean(loc_y))**2))
            loc_r2 = 1.0 - loc_ss_res / loc_ss_tot if loc_ss_tot > 0 else 0.0
            loc_rmse = float(np.sqrt(np.mean(loc_res**2)))
            local_metrics[f"r2_{w_name}"] = round(loc_r2, 4)
            local_metrics[f"rmse_{w_name}"] = round(loc_rmse, 4)

    return FitResult(
        best_fit=best_fit,
        components=components,
        baseline=baseline,
        corrected=y_corr,
        residuals=residuals,
        x=x,
        parameters=parameters,
        metrics={
            "r_squared":    round(r_squared, 6),
            "chi2_reduced": round(chi2_r, 6),
            "aic":          round(aic, 3),
            "bic":          round(bic, 3),
        },
        local_metrics=local_metrics,
        success=True,
        message="OK",
    )


# ---------------------------------------------------------------------------
# Helper for parallel processing
# ---------------------------------------------------------------------------

def _fit_single_spectrum(args):
    """Picklable helper for parallel fitting."""
    i, wavenumbers, y, peaks, baseline_method, baseline_params = args
    
    # 1. Smart Thresholding (SNR Cutoff)
    # Basic check: if max-min is too low, skip
    if np.max(y) - np.min(y) < 2.0: # Hard floor
        return i, None
        
    try:
        # Import inside for process safety
        from scripts.deconvolution_engine import fit_spectrum
        res = fit_spectrum(wavenumbers, y, peaks, baseline_method, baseline_params)
        return i, res
    except Exception:
        return i, None

def fit_map_batch(
    wavenumbers: np.ndarray,
    intensities_2d: np.ndarray,
    peaks: list[dict],
    baseline_method: str = "asls",
    baseline_params: Optional[dict] = None,
    threshold_snr: float = 0.0,
    warm_start: bool = False,
    use_clustering: bool = False,
) -> dict:
    """
    Applies fit_spectrum to every row of intensities_2d.
    Returns a dict of flat arrays ready for the frontend.
    """
    if baseline_params is None:
        baseline_params = {}

    n_spectra = intensities_2d.shape[0]
    active_peaks = [p for p in peaks if p.get("active", True)]
    peak_names = [p["name"] for p in active_peaks]

    # Initialize output arrays
    results_per_peak = {
        name: {
            "center_map":    np.full(n_spectra, np.nan),
            "fwhm_map":      np.full(n_spectra, np.nan),
            "area_map":      np.full(n_spectra, np.nan),
            "amplitude_map": np.full(n_spectra, np.nan),
        }
        for name in peak_names
    }
    r2_map  = np.full(n_spectra, np.nan)
    rms_map = np.full(n_spectra, np.nan)

    if warm_start:
        # Sequential with warm start
        last_good_peaks = None
        for i in range(n_spectra):
            y = intensities_2d[i]
            signal_span = np.max(y) - np.min(y)
            if threshold_snr > 0 and signal_span < threshold_snr:
                continue
                
            current_peaks = last_good_peaks if last_good_peaks is not None else peaks
            try:
                res = fit_spectrum(wavenumbers, y, current_peaks, baseline_method, baseline_params)
                if not res.success:
                    last_good_peaks = None
                    continue

                r2_map[i]  = res.metrics["r_squared"]
                rms_map[i] = float(np.sqrt(np.mean(res.residuals**2)))

                next_peaks = []
                all_good = True
                for param in res.parameters:
                    name = param["name"]
                    if name in results_per_peak:
                        results_per_peak[name]["center_map"][i]    = param["center"]
                        results_per_peak[name]["fwhm_map"][i]      = param["fwhm"]
                        results_per_peak[name]["area_map"][i]      = param["area"]
                        results_per_peak[name]["amplitude_map"][i] = param["amplitude"]
                    
                    if param["health"] == "Rejected (Too broad)":
                        all_good = False
                    
                    for p_orig in peaks:
                        if p_orig["name"] == name:
                            p_new = p_orig.copy()
                            p_new["center"] = param["center"]
                            next_peaks.append(p_new)
                            break
                last_good_peaks = next_peaks if all_good else None
            except Exception:
                last_good_peaks = None
                continue
    else:
        # Parallel Execution
        max_workers = max(1, (os.cpu_count() or 4) - 1)
        tasks = [
            (i, wavenumbers, intensities_2d[i], peaks, baseline_method, baseline_params)
            for i in range(n_spectra)
            if (np.max(intensities_2d[i]) - np.min(intensities_2d[i])) >= threshold_snr
        ]
        
        if tasks:
            completed = 0
            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                for i, res in executor.map(_fit_single_spectrum, tasks):
                    completed += 1
                    if completed % 50 == 0:
                        print(f">>> Batch Fitting Progress: {completed}/{len(tasks)} ({(completed/len(tasks)*100):.1f}%)")
                        
                    if res and res.success:
                        r2_map[i]  = res.metrics["r_squared"]
                        rms_map[i] = float(np.sqrt(np.mean(res.residuals**2)))
                        for param in res.parameters:
                            name = param["name"]
                            if name in results_per_peak:
                                results_per_peak[name]["center_map"][i]    = param["center"]
                                results_per_peak[name]["fwhm_map"][i]      = param["fwhm"]
                                results_per_peak[name]["area_map"][i]      = param["area"]
                                results_per_peak[name]["amplitude_map"][i] = param["amplitude"]

    # Global metrics
    valid_r2 = r2_map[~np.isnan(r2_map)]
    global_metrics = {
        "r2_mean":   float(np.mean(valid_r2))  if len(valid_r2) > 0 else 0.0,
        "r2_std":    float(np.std(valid_r2))   if len(valid_r2) > 0 else 0.0,
        "r2_p95":    float(np.mean(valid_r2 >= 0.95)) * 100 if len(valid_r2) > 0 else 0.0,
        "r2_p99":    float(np.mean(valid_r2 >= 0.99)) * 100 if len(valid_r2) > 0 else 0.0,
        "rms_mean":  float(np.nanmean(rms_map)) if np.any(~np.isnan(rms_map)) else 0.0,
        "n_success": int(np.sum(~np.isnan(r2_map))),
        "n_total":   n_spectra,
    }

    # Serialize (replace NaN with None for JSON)
    def to_list(arr):
        return [None if np.isnan(v) else float(v) for v in arr]

    return {
        "n_spectra": n_spectra,
        "results_per_peak": {
            name: {k: to_list(v) for k, v in vals.items()}
            for name, vals in results_per_peak.items()
        },
        "r2_map":         to_list(r2_map),
        "rms_map":        to_list(rms_map),
        "global_metrics": global_metrics,
    }


# ---------------------------------------------------------------------------
# Auto-detect peaks helper
# ---------------------------------------------------------------------------

def auto_detect_peaks(
    x: np.ndarray,
    y: np.ndarray,
    prominence: float = 0.05,
    distance: int = 15,
    width: int = 3,
) -> list[dict]:
    """
    Detect peaks using scipy.signal.find_peaks.
    Returns a list of PeakConfig dicts ready for the frontend.
    """
    y_norm = (y - y.min()) / (y.max() - y.min() + 1e-10)
    indices, props = scipy_find_peaks(
        y_norm,
        prominence=prominence,
        distance=distance,
        width=width,
    )

    detected = []
    for i, idx in enumerate(indices):
        center = float(x[idx])
        # Estimate width from scipy
        w_pts = props.get("widths", [15])[i] if "widths" in props else 15
        fwhm_est = float(w_pts * (x[1] - x[0]) * 2.355) if len(x) > 1 else 30.0

        detected.append({
            "name":       f"Peak_{i+1}",
            "model":      "Lorentzian",
            "center":     round(center, 2),
            "center_min": round(center - 30.0, 2),
            "center_max": round(center + 30.0, 2),
            "fwhm_init":  round(max(fwhm_est, 10.0), 2),
            "active":     True,
        })

    return detected

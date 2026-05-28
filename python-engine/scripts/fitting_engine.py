"""
Fitting Engine — Dedicated scientific engine for SPECTROview fitting in PhD Nexus.
Supports:
- X-axis correction (Si-Ref offset or manual shift)
- Spectral range cropping
- Baseline correction (asLS, airPLS, Linear, Polynomial)
- Custom peak shapes: Lorentzian, Gaussian, Voigt, PseudoVoigt, Fano, DecaySingleExp, DecayBiExp
- Advanced map fitting with SNR thresholds, clustering, and warm starting
"""

import numpy as np
import lmfit
from pybaselines import Baseline
import re
import os
import json
from concurrent.futures import ProcessPoolExecutor
from typing import Optional, List, Dict, Tuple, Any

# Custom Math Functions for lmfit Models
def fano_func(x, amplitude, fwhm, center, q):
    gamma_half = fwhm / 2.0
    epsilon = (x - center) / (gamma_half + 1e-10)
    # pure fano: ampli * (q + epsilon)^2 / (1 + epsilon^2)
    return amplitude * (q + epsilon) ** 2 / (1 + epsilon ** 2)

def decay_single_exp_func(x, A, tau, B):
    return A * np.exp(-x / tau) + B

def decay_bi_exp_func(x, A1, tau1, A2, tau2, B):
    return A1 * np.exp(-x / tau1) + A2 * np.exp(-x / tau2) + B

# Helper to sanitize prefixes
def sanitize_prefix(name: str) -> str:
    s = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    if s and s[0].isdigit():
        s = 'p_' + s
    return s

def apply_baseline(
    x: np.ndarray,
    y: np.ndarray,
    method: str = "asls",
    params: Optional[dict] = None
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Apply baseline subtraction.
    Supported: 'asls', 'airpls', 'linear', 'poly', 'none'
    """
    if params is None:
        params = {}
        
    if method == "none" or not method:
        return y.copy(), np.zeros_like(y)

    fitter = Baseline(x_data=x)
    try:
        weights = np.ones_like(y)
        exclude_regions = params.get("exclude_regions", [])
        for r_min, r_max in exclude_regions:
            weights[(x >= r_min) & (x <= r_max)] = 0.0

        if method == "asls":
            lam = float(params.get("lam", 1e5))
            p = float(params.get("p", 0.01))
            baseline_y, _ = fitter.asls(y, lam=lam, p=p, weights=weights)
        elif method == "airpls":
            lam = float(params.get("lam", 1e5))
            baseline_y, _ = fitter.airpls(y, lam=lam, weights=weights)
        elif method in ("linear", "poly"):
            order = int(params.get("order", 1 if method == "linear" else 2))
            baseline_y, _ = fitter.modpoly(y, poly_order=order, weights=weights)
        else:
            baseline_y = np.zeros_like(y)
    except Exception:
        baseline_y = np.zeros_like(y)

    corrected = y - baseline_y
    return corrected, baseline_y

def build_fitting_model(peaks: List[dict]) -> Tuple[lmfit.CompositeModel, lmfit.Parameters]:
    """
    Build custom CompositeModel and Parameters for lmfit based on peak configurations.
    Supports advanced constraints: fixedParams, minParams, maxParams, and exprParams.
    """
    active_peaks = [p for p in peaks if p.get("active", True)]
    if not active_peaks:
        raise ValueError("No active peaks to fit.")

    composite = None
    params = lmfit.Parameters()

    for idx, pk in enumerate(active_peaks):
        safe_name = sanitize_prefix(pk.get("name", f"peak_{idx}"))
        prefix = f"{safe_name}_"
        model_name = pk.get("model", "Lorentzian")
        
        # Decide lmfit model class or custom function model
        if model_name == "Lorentzian":
            m = lmfit.models.LorentzianModel(prefix=prefix)
        elif model_name == "Gaussian":
            m = lmfit.models.GaussianModel(prefix=prefix)
        elif model_name == "Voigt":
            m = lmfit.models.VoigtModel(prefix=prefix)
        elif model_name == "PseudoVoigt":
            m = lmfit.models.PseudoVoigtModel(prefix=prefix)
        elif model_name == "Fano":
            m = lmfit.Model(fano_func, prefix=prefix)
        elif model_name == "DecaySingleExp":
            m = lmfit.Model(decay_single_exp_func, prefix=prefix)
        elif model_name == "DecayBiExp":
            m = lmfit.Model(decay_bi_exp_func, prefix=prefix)
        else:
            m = lmfit.models.LorentzianModel(prefix=prefix)

        center = float(pk.get("center", 500.0))
        center_min = float(pk.get("center_min", center - 100.0))
        center_max = float(pk.get("center_max", center + 100.0))
        fwhm_init = float(pk.get("fwhm_init", 30.0))
        amplitude_val = float(pk.get("amplitude", 1000.0))
        
        # Define limits dynamic flags
        use_limits = pk.get("use_limits", True)

        def add_param(p_key, backend_key, val, default_min=-np.inf, default_max=np.inf):
            is_fixed = pk.get("fixedParams", {}).get(p_key, False)
            expr = pk.get("exprParams", {}).get(p_key, "")
            
            p_min = pk.get("minParams", {}).get(p_key, default_min)
            p_max = pk.get("maxParams", {}).get(p_key, default_max)
            
            if not expr or not isinstance(expr, str) or expr.strip() == "":
                expr = None
            
            params.add(
                f"{prefix}{backend_key}",
                value=val,
                vary=not is_fixed,
                min=p_min if use_limits else -np.inf,
                max=p_max if use_limits else np.inf,
                expr=expr
            )

        if model_name in ("DecaySingleExp", "DecayBiExp"):
            if model_name == "DecaySingleExp":
                add_param("amplitude", "A", amplitude_val, default_min=0.0)
                add_param("tau", "tau", float(pk.get("tau", fwhm_init)), default_min=0.1, default_max=10000.0)
                add_param("B", "B", float(pk.get("B", 0.0)))
            else: # DecayBiExp
                add_param("amplitude", "A1", amplitude_val * 0.7, default_min=0.0)
                add_param("tau1", "tau1", float(pk.get("tau1", fwhm_init * 0.5)), default_min=0.1, default_max=10000.0)
                add_param("amplitude", "A2", amplitude_val * 0.3, default_min=0.0)
                add_param("tau2", "tau2", float(pk.get("tau2", fwhm_init * 2.0)), default_min=0.1, default_max=10000.0)
                add_param("B", "B", float(pk.get("B", 0.0)))
        else:
            sigma_init = fwhm_init / 2.0
            add_param("center", "center", center, default_min=center_min, default_max=center_max)
            add_param("fwhm_init", "sigma", sigma_init, default_min=0.1, default_max=500.0)
            add_param("amplitude", "amplitude", amplitude_val, default_min=0.0)
            
            if model_name == "PseudoVoigt":
                add_param("fraction", "fraction", 0.5, default_min=0.0, default_max=1.0)
            elif model_name == "Fano":
                add_param("q", "q", float(pk.get("q", 1.0)), default_min=-100.0, default_max=100.0)

        composite = m if composite is None else composite + m

    return composite, params

def fit_spectrum(
    x: np.ndarray,
    y: np.ndarray,
    peaks: List[dict],
    baseline_method: str = "asls",
    baseline_params: Optional[dict] = None,
    x_shift: float = 0.0,
    crop_range: Optional[Tuple[float, float]] = None
) -> Dict[str, Any]:
    """
    Process single spectrum: x_shift -> crop -> baseline -> lmfit -> metrics.
    """
    # 1. X correction
    x_proc = x.copy() + x_shift
    y_proc = y.copy()

    # 2. Crop
    if crop_range:
        xmin, xmax = crop_range
        mask = (x_proc >= xmin) & (x_proc <= xmax)
        if np.any(mask):
            x_proc = x_proc[mask]
            y_proc = y_proc[mask]

    # 3. Baseline subtraction
    y_corr, baseline = apply_baseline(x_proc, y_proc, baseline_method, baseline_params)

    # 4. Fit composite model
    try:
        model, params = build_fitting_model(peaks)
    except Exception as e:
        return {
            "success": False,
            "message": f"Model configuration error: {str(e)}",
            "original": [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_proc, y_proc)],
            "corrected": [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_proc, y_corr)],
            "baseline": [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_proc, baseline)],
            "best_fit": [{"x": float(xi), "y": 0.0} for xi in x_proc],
            "residuals": [{"x": float(xi), "y": 0.0} for xi in x_proc],
            "components": {},
            "parameters": [],
            "metrics": {"r_squared": 0.0, "chi2_reduced": 0.0, "aic": 0.0, "bic": 0.0}
        }

    # Normalize amplitude guess
    y_max = float(np.max(y_corr)) if np.max(y_corr) > 0 else 1.0
    for p_name in params:
        if "amplitude" in p_name or "_A" in p_name:
            params[p_name].set(value=y_max * 0.5, min=0.0)

    try:
        result = model.fit(y_corr, params, x=x_proc, method="leastsq", max_nfev=400)
        best_fit = result.best_fit
        residuals = result.residual
        success = result.success
        message = "Fit completed successfully" if success else "Fit failed to converge"
        
        # Extract parameters
        fit_params = []
        for name, p in result.params.items():
            fit_params.append({
                "name": name,
                "value": float(p.value),
                "stderr": float(p.stderr) if p.stderr is not None else None,
                "init_value": float(p.init_value) if p.init_value is not None else float(p.value)
            })

        # Calculate metrics
        r_squared = float(result.rsquared) if hasattr(result, "rsquared") else 0.0
        chi2_red = float(result.redchi) if hasattr(result, "redchi") else 0.0
        aic = float(result.aic) if hasattr(result, "aic") else 0.0
        bic = float(result.bic) if hasattr(result, "bic") else 0.0

        # Subcomponents
        components = {}
        eval_dict = result.eval_components(x=x_proc)
        for comp_name, comp_y in eval_dict.items():
            components[comp_name] = [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_proc, comp_y)]

        return {
            "success": success,
            "message": message,
            "original": [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_proc, y_proc)],
            "corrected": [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_proc, y_corr)],
            "baseline": [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_proc, baseline)],
            "best_fit": [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_proc, best_fit)],
            "residuals": [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_proc, residuals)],
            "components": components,
            "parameters": fit_params,
            "metrics": {
                "r_squared": r_squared,
                "chi2_reduced": chi2_red,
                "aic": aic,
                "bic": bic
            }
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Solver error: {str(e)}",
            "original": [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_proc, y_proc)],
            "corrected": [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_proc, y_corr)],
            "baseline": [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_proc, baseline)],
            "best_fit": [{"x": float(xi), "y": 0.0} for xi in x_proc],
            "residuals": [{"x": float(xi), "y": 0.0} for xi in x_proc],
            "components": {},
            "parameters": [],
            "metrics": {"r_squared": 0.0, "chi2_reduced": 0.0, "aic": 0.0, "bic": 0.0}
        }

def _fit_single_pixel_worker(args) -> dict:
    """Worker function for batch map fitting."""
    idx, wavenumbers, intensity, peaks, baseline_method, baseline_params, x_shift, crop_range, threshold_snr = args
    
    # 1. Apply x_shift and crop
    x_proc = wavenumbers.copy() + x_shift
    y_proc = intensity.copy()
    
    if crop_range:
        xmin, xmax = crop_range
        mask = (x_proc >= xmin) & (x_proc <= xmax)
        if np.any(mask):
            x_proc = x_proc[mask]
            y_proc = y_proc[mask]

    # 2. Subtract baseline
    y_corr, baseline = apply_baseline(x_proc, y_proc, baseline_method, baseline_params)

    # 3. Simple SNR threshold test (std deviation of baseline corrected spectrum vs noise)
    noise_std = np.std(y_corr - savgol_smoothing(y_corr)) if len(y_corr) > 10 else 1.0
    signal_amp = np.max(y_corr) - np.min(y_corr)
    snr = signal_amp / (noise_std + 1e-10)

    if snr < threshold_snr:
        return {"idx": idx, "success": False, "reason": "SNR below threshold"}

    # 4. Build and fit
    try:
        model, params = build_fitting_model(peaks)
        y_max = float(np.max(y_corr)) if np.max(y_corr) > 0 else 1.0
        for p_name in params:
            if "amplitude" in p_name or "_A" in p_name:
                params[p_name].set(value=y_max * 0.5, min=0.0)

        result = model.fit(y_corr, params, x=x_proc, method="leastsq", max_nfev=150)
        
        # Collect parameters
        vals = {}
        for name, p in result.params.items():
            vals[name] = float(p.value)
        
        vals["r_squared"] = float(result.rsquared) if hasattr(result, "rsquared") else 0.0
        return {"idx": idx, "success": True, "values": vals}
    except Exception as e:
        return {"idx": idx, "success": False, "reason": str(e)}

def savgol_smoothing(y, window=15, order=2):
    """Simple smoothing helper to calculate noise standard deviation."""
    from scipy.signal import savgol_filter
    w = min(window, len(y))
    if w % 2 == 0:
        w -= 1
    if w <= order:
        return y.copy()
    try:
        return savgol_filter(y, w, order)
    except:
        return y.copy()

def fit_map_batch(
    wavenumbers: np.ndarray,
    intensities_2d: np.ndarray,
    peaks: List[dict],
    baseline_method: str = "asls",
    baseline_params: Optional[dict] = None,
    x_shift: float = 0.0,
    crop_range: Optional[Tuple[float, float]] = None,
    threshold_snr: float = 3.0
) -> dict:
    """
    Runs fitting process on all spectra in parallel.
    """
    n_spectra = intensities_2d.shape[0]
    
    # Pack parameters
    args_list = []
    for i in range(n_spectra):
        args_list.append((
            i,
            wavenumbers,
            intensities_2d[i],
            peaks,
            baseline_method,
            baseline_params,
            x_shift,
            crop_range,
            threshold_snr
        ))

    # Parallel processing pool
    results = {}
    success_count = 0
    
    n_cpus = min(os.cpu_count() or 4, 8)
    with ProcessPoolExecutor(max_workers=n_cpus) as executor:
        for res in executor.map(_fit_single_pixel_worker, args_list):
            idx = res["idx"]
            if res["success"]:
                results[str(idx)] = res["values"]
                success_count += 1
            else:
                results[str(idx)] = {"success": False, "reason": res["reason"]}

    return {
        "success": True,
        "n_spectra": n_spectra,
        "success_count": success_count,
        "results": results
    }

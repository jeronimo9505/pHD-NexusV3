"""
Raman Global Intelligence (RGI) Engine
Chemometric-assisted map fitting and analysis.
Segments maps into spectral families using PCA/NMF/KMeans,
selects representative spectra, and runs cluster-guided constrained map fits.
"""

import os
import json
import numpy as np
import h5py
import re
from typing import Optional, List, Dict, Tuple, Any
from concurrent.futures import ProcessPoolExecutor
from pybaselines import Baseline
import lmfit
from sklearn.decomposition import PCA, NMF
from sklearn.cluster import KMeans

# Custom Math Functions for lmfit Models
def fano_func(x, amplitude, fwhm, center, q):
    gamma_half = fwhm / 2.0
    epsilon = (x - center) / (gamma_half + 1e-10)
    return amplitude * (q + epsilon) ** 2 / (1 + epsilon ** 2)

def decay_single_exp_func(x, A, tau, B):
    return A * np.exp(-x / tau) + B

def decay_bi_exp_func(x, A1, tau1, A2, tau2, B):
    return A1 * np.exp(-x / tau1) + A2 * np.exp(-x / tau2) + B

def sanitize_prefix(name: str) -> str:
    s = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    if s and s[0].isdigit():
        s = 'p_' + s
    return s

def safe_float(v) -> float:
    try:
        val = float(v)
        if np.isnan(val) or np.isinf(val):
            return 0.0
        return val
    except:
        return 0.0

def to_safe_float_list(arr) -> list:
    if arr is None:
        return []
    narr = np.asarray(arr)
    clean = np.nan_to_num(narr, nan=0.0, posinf=0.0, neginf=0.0)
    return clean.tolist()

def residual_noise_metrics(residuals: np.ndarray, corrected: np.ndarray) -> dict:
    residual_arr = np.asarray(residuals, dtype=float)
    corrected_arr = np.asarray(corrected, dtype=float)
    finite_res = residual_arr[np.isfinite(residual_arr)]
    finite_signal = corrected_arr[np.isfinite(corrected_arr)]

    if finite_res.size == 0:
        return {
            "rmse": 0.0,
            "std": 0.0,
            "mad": 0.0,
            "mean_abs": 0.0,
            "max_abs": 0.0,
            "peak_to_peak": 0.0,
            "residual_to_signal_pct": 0.0,
        }

    signal_span = float(np.max(finite_signal) - np.min(finite_signal)) if finite_signal.size > 0 else 0.0
    rmse = float(np.sqrt(np.mean(finite_res ** 2)))
    return {
        "rmse": rmse,
        "std": float(np.std(finite_res)),
        "mad": float(np.median(np.abs(finite_res - np.median(finite_res)))),
        "mean_abs": float(np.mean(np.abs(finite_res))),
        "max_abs": float(np.max(np.abs(finite_res))),
        "peak_to_peak": float(np.max(finite_res) - np.min(finite_res)),
        "residual_to_signal_pct": float((rmse / signal_span) * 100.0) if signal_span > 0 else 0.0,
    }

def savgol_smoothing(y, window=15, order=2):
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

def apply_baseline(
    x: np.ndarray,
    y: np.ndarray,
    method: str = "asls",
    params: Optional[dict] = None
) -> Tuple[np.ndarray, np.ndarray]:
    if params is None:
        params = {}
    if method == "none" or not method:
        min_y = np.min(y)
        return y - min_y, np.full_like(y, min_y)

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
    active_peaks = [p for p in peaks if p.get("active", True)]
    if not active_peaks:
        raise ValueError("No active peaks to fit.")

    composite = None
    params = lmfit.Parameters()

    for idx, pk in enumerate(active_peaks):
        safe_name = sanitize_prefix(pk.get("name", f"peak_{idx}"))
        prefix = f"{safe_name}_"
        model_name = pk.get("model", "Lorentzian")
        
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
            else: 
                add_param("amplitude", "A1", amplitude_val * 0.7, default_min=0.0)
                add_param("tau1", "tau1", float(pk.get("tau1", fwhm_init * 0.5)), default_min=0.1, default_max=10000.0)
                add_param("amplitude", "A2", amplitude_val * 0.3, default_min=0.0)
                add_param("tau2", "tau2", float(pk.get("tau2", fwhm_init * 2.0)), default_min=0.1, default_max=10000.0)
                add_param("B", "B", float(pk.get("B", 0.0)))
        else:
            if model_name == "Gaussian":
                sigma_init = fwhm_init / 2.35482004503
            else:
                sigma_init = fwhm_init / 2.0
            add_param("center", "center", center, default_min=center_min, default_max=center_max)
            add_param("fwhm_init", "sigma", sigma_init, default_min=2.0, default_max=50.0)
            add_param("amplitude", "amplitude", amplitude_val, default_min=0.0)
            if model_name == "Gaussian":
                params.add(f"{prefix}fwhm", expr=f"2.35482004503 * {prefix}sigma")
            else:
                params.add(f"{prefix}fwhm", expr=f"2.0 * {prefix}sigma")
            
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
    x_proc = x.copy() + x_shift
    y_proc = y.copy()

    if crop_range:
        xmin, xmax = crop_range
        mask = (x_proc >= xmin) & (x_proc <= xmax)
        if np.any(mask):
            x_proc = x_proc[mask]
            y_proc = y_proc[mask]

    y_corr, baseline = apply_baseline(x_proc, y_proc, baseline_method, baseline_params)

    try:
        model, params = build_fitting_model(peaks)
    except Exception as e:
        return {
            "success": False,
            "message": f"Model error: {str(e)}",
            "parameters": []
        }

    y_max = float(np.max(y_corr)) if np.max(y_corr) > 0 else 1.0
    for p_name in params:
        if ("amplitude" in p_name or "_A" in p_name) and params[p_name].expr is None:
            params[p_name].set(value=y_max * 0.5, min=0.0)

    try:
        result = model.fit(y_corr, params, x=x_proc, method="leastsq", max_nfev=1000)
        best_fit = result.best_fit
        residuals = result.residual
        noise_metrics = residual_noise_metrics(residuals, y_corr)
        success = result.success
        message = "Fit completed successfully" if success else "Fit failed to converge"
        
        fit_params = []
        for name, p in result.params.items():
            stderr_val = float(p.stderr) if p.stderr is not None else None
            if stderr_val is not None and (np.isnan(stderr_val) or np.isinf(stderr_val)):
                stderr_val = None
            fit_params.append({
                "name": name,
                "value": safe_float(p.value),
                "stderr": stderr_val,
                "init_value": safe_float(p.init_value) if p.init_value is not None else safe_float(p.value)
            })

        components = {}
        eval_dict = result.eval_components(x=x_proc)
        for comp_name, comp_y in eval_dict.items():
            components[comp_name] = [{"x": safe_float(xi), "y": safe_float(yi)} for xi, yi in zip(x_proc, comp_y)]

        return {
            "success": success,
            "message": message,
            "original": [{"x": safe_float(xi), "y": safe_float(yi)} for xi, yi in zip(x_proc, y_proc)],
            "corrected": [{"x": safe_float(xi), "y": safe_float(yi)} for xi, yi in zip(x_proc, y_corr)],
            "baseline": [{"x": safe_float(xi), "y": safe_float(yi)} for xi, yi in zip(x_proc, baseline)],
            "best_fit": [{"x": safe_float(xi), "y": safe_float(yi)} for xi, yi in zip(x_proc, best_fit)],
            "residuals": [{"x": safe_float(xi), "y": safe_float(yi)} for xi, yi in zip(x_proc, residuals)],
            "components": components,
            "parameters": fit_params,
            "metrics": {
                "r_squared": safe_float(result.rsquared) if hasattr(result, "rsquared") else 0.0,
                "chi2_reduced": safe_float(result.redchi) if hasattr(result, "redchi") else 0.0,
                "aic": safe_float(result.aic) if hasattr(result, "aic") else 0.0,
                "bic": safe_float(result.bic) if hasattr(result, "bic") else 0.0,
                "rmse": safe_float(noise_metrics["rmse"]),
                "residual_std": safe_float(noise_metrics["std"]),
                "residual_mad": safe_float(noise_metrics["mad"]),
                "residual_mean_abs": safe_float(noise_metrics["mean_abs"]),
                "residual_max_abs": safe_float(noise_metrics["max_abs"]),
                "residual_peak_to_peak": safe_float(noise_metrics["peak_to_peak"]),
                "residual_to_signal_pct": safe_float(noise_metrics["residual_to_signal_pct"]),
            },
            "noise": noise_metrics
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Solver error: {str(e)}",
            "parameters": []
        }

def _finite_or_none(values: np.ndarray) -> list:
    arr = np.asarray(values, dtype=float)
    return [None if not np.isfinite(v) else float(v) for v in arr]

def _status_labels(
    success_map: np.ndarray,
    r2_map: np.ndarray,
    snr_map: np.ndarray,
    quality_classes: np.ndarray,
    snr_reliable_min: float,
) -> list:
    labels = []
    for success, r2, snr, qclass in zip(success_map, r2_map, snr_map, quality_classes):
        if not success:
            labels.append("invalid")
        elif qclass == 4 or not np.isfinite(r2) or r2 < 0.85:
            labels.append("low_confidence")
        elif not np.isfinite(snr) or snr < snr_reliable_min:
            labels.append("low_snr")
        else:
            labels.append("reliable")
    return labels

def _confidence_values(success_map: np.ndarray, r2_map: np.ndarray, snr_map: np.ndarray) -> np.ndarray:
    r2_safe = np.nan_to_num(r2_map, nan=0.0, posinf=0.0, neginf=0.0)
    snr_safe = np.nan_to_num(snr_map, nan=0.0, posinf=0.0, neginf=0.0)
    r2_score = np.clip(r2_safe, 0.0, 1.0)
    snr_score = np.clip(snr_safe / 10.0, 0.0, 1.0)
    confidence = r2_score * snr_score
    confidence[~success_map] = 0.0
    return confidence

def _find_param_map(peak_maps: Dict[str, np.ndarray], band: str, suffix: str) -> Optional[np.ndarray]:
    prefixes = [sanitize_prefix(band), band]
    candidates = [f"{prefix}_{suffix}" for prefix in prefixes]
    for candidate in candidates:
        if candidate in peak_maps:
            return peak_maps[candidate]

    lowered = {k.lower(): v for k, v in peak_maps.items()}
    for candidate in candidates:
        if candidate.lower() in lowered:
            return lowered[candidate.lower()]
    return None

def _find_stderr_map(peak_stderrs: Dict[str, np.ndarray], band: str, suffix: str) -> Optional[np.ndarray]:
    return _find_param_map(peak_stderrs, band, suffix)

def _empty_metric(n_spectra: int) -> np.ndarray:
    return np.full(n_spectra, np.nan, dtype=float)

def _safe_ratio(numerator: np.ndarray, denominator: np.ndarray, min_denominator: float = 1e-12) -> np.ndarray:
    num = np.asarray(numerator, dtype=float)
    den = np.asarray(denominator, dtype=float)
    out = np.full_like(num, np.nan, dtype=float)
    mask = np.isfinite(num) & np.isfinite(den) & (np.abs(den) > min_denominator)
    out[mask] = num[mask] / den[mask]
    return out

def _estimate_lorentzian_height(area: Optional[np.ndarray], fwhm: Optional[np.ndarray], n_spectra: int) -> np.ndarray:
    height = _empty_metric(n_spectra)
    if area is None or fwhm is None:
        return height

    area_arr = np.asarray(area, dtype=float)
    fwhm_arr = np.asarray(fwhm, dtype=float)
    mask = np.isfinite(area_arr) & np.isfinite(fwhm_arr) & (fwhm_arr > 0)
    height[mask] = (2.0 * area_arr[mask]) / (np.pi * fwhm_arr[mask])
    return height

def _height_or_lorentzian_estimate(
    height: Optional[np.ndarray],
    area: Optional[np.ndarray],
    fwhm: Optional[np.ndarray],
    n_spectra: int,
) -> Tuple[np.ndarray, str]:
    estimated = _estimate_lorentzian_height(area, fwhm, n_spectra)
    if height is None:
        return estimated, "estimated_from_area_fwhm"

    height_arr = np.asarray(height, dtype=float)
    if np.any(np.isfinite(height_arr)):
        merged = height_arr.copy()
        missing = ~np.isfinite(merged) & np.isfinite(estimated)
        merged[missing] = estimated[missing]
        source = "fit_with_area_fwhm_fallback" if np.any(missing) else "fit"
        return merged, source

    return estimated, "estimated_from_area_fwhm"

def _summary_statistics(values: np.ndarray, reliable_mask: np.ndarray) -> dict:
    arr = np.asarray(values, dtype=float)
    finite_mask = np.isfinite(arr)
    reliable_values = arr[finite_mask & reliable_mask]

    stats = {
        "count": int(arr.size),
        "valid_count": int(np.sum(finite_mask)),
        "nan_count": int(arr.size - np.sum(finite_mask)),
        "reliable_count": int(reliable_values.size),
        "mean": None,
        "median": None,
        "std": None,
        "min": None,
        "max": None,
        "q1": None,
        "q3": None,
        "p10": None,
        "p90": None,
    }
    if reliable_values.size == 0:
        return stats

    stats.update({
        "mean": float(np.mean(reliable_values)),
        "median": float(np.median(reliable_values)),
        "std": float(np.std(reliable_values)),
        "min": float(np.min(reliable_values)),
        "max": float(np.max(reliable_values)),
        "q1": float(np.percentile(reliable_values, 25)),
        "q3": float(np.percentile(reliable_values, 75)),
        "p10": float(np.percentile(reliable_values, 10)),
        "p90": float(np.percentile(reliable_values, 90)),
    })
    return stats

def _histogram(values: np.ndarray, reliable_mask: np.ndarray, bins: int = 30) -> dict:
    arr = np.asarray(values, dtype=float)
    data = arr[np.isfinite(arr) & reliable_mask]
    if data.size == 0:
        return {"bin_edges": [], "bin_centers": [], "counts": []}
    counts, edges = np.histogram(data, bins=bins)
    centers = (edges[:-1] + edges[1:]) / 2.0
    return {
        "bin_edges": [float(v) for v in edges],
        "bin_centers": [float(v) for v in centers],
        "counts": [int(v) for v in counts],
    }

def _rankdata_average(values: np.ndarray) -> np.ndarray:
    arr = np.asarray(values, dtype=float)
    order = np.argsort(arr, kind="mergesort")
    ranks = np.empty(arr.size, dtype=float)
    sorted_arr = arr[order]
    i = 0
    while i < arr.size:
        j = i + 1
        while j < arr.size and sorted_arr[j] == sorted_arr[i]:
            j += 1
        avg_rank = (i + j - 1) / 2.0 + 1.0
        ranks[order[i:j]] = avg_rank
        i = j
    return ranks

def _pairwise_correlation(series: Dict[str, np.ndarray], keys: list, reliable_mask: np.ndarray, method: str = "pearson") -> list:
    matrix = []
    for row_key in keys:
        row = []
        x_raw = np.asarray(series[row_key], dtype=float)
        for col_key in keys:
            y_raw = np.asarray(series[col_key], dtype=float)
            mask = reliable_mask & np.isfinite(x_raw) & np.isfinite(y_raw)
            if np.sum(mask) < 3:
                row.append(None)
                continue
            x = x_raw[mask]
            y = y_raw[mask]
            if method == "spearman":
                x = _rankdata_average(x)
                y = _rankdata_average(y)
            if np.std(x) == 0 or np.std(y) == 0:
                row.append(None)
            else:
                row.append(float(np.corrcoef(x, y)[0, 1]))
        matrix.append(row)
    return matrix

def _stat_value(statistics: dict, key: str, field: str) -> Optional[float]:
    value = statistics.get(key, {}).get(field)
    return float(value) if isinstance(value, (int, float)) and np.isfinite(value) else None

def build_interpretation_summary(
    n_spectra: int,
    success_count: int,
    quality_classes: np.ndarray,
    reason_summary: dict,
    scientific_results: dict,
) -> dict:
    class_counts = {
        "background": int(np.sum(quality_classes == 0)),
        "defect_rich": int(np.sum(quality_classes == 1)),
        "monolayer_like": int(np.sum(quality_classes == 2)),
        "multilayer_like": int(np.sum(quality_classes == 3)),
        "low_confidence": int(np.sum(quality_classes == 4)),
    }
    class_fractions = {
        key: (count / n_spectra if n_spectra > 0 else 0.0)
        for key, count in class_counts.items()
    }
    interpretable_count = int(scientific_results.get("interpretable_count", 0))
    fit_reliable_count = int(scientific_results.get("fit_reliable_count", 0))
    analysis_count = int(scientific_results.get("analysis_count", 0))
    analysis_mask_type = scientific_results.get("analysis_mask_type", "interpretable_graphene")
    quality_thresholds = scientific_results.get("quality_thresholds", {})
    interpretable_fraction = interpretable_count / n_spectra if n_spectra > 0 else 0.0
    converged_fraction = success_count / n_spectra if n_spectra > 0 else 0.0
    low_conf_fraction = class_fractions["low_confidence"]
    invalid_fraction = max(n_spectra - success_count, 0) / n_spectra if n_spectra > 0 else 0.0

    dominant_reason = None
    if reason_summary:
        dominant_reason = max(reason_summary.items(), key=lambda item: item[1])[0]

    if interpretable_fraction >= 0.60 and low_conf_fraction <= 0.20 and invalid_fraction <= 0.20:
        readiness = "ready"
    elif interpretable_fraction >= 0.25 and converged_fraction >= 0.50:
        readiness = "review"
    else:
        readiness = "not_ready"

    statistics = scientific_results.get("statistics", {})
    key_metrics = {
        "pos_G_mean": _stat_value(statistics, "pos_G", "mean"),
        "fwhm_G_mean": _stat_value(statistics, "fwhm_G", "mean"),
        "pos_2D_mean": _stat_value(statistics, "pos_2D", "mean"),
        "fwhm_2D_mean": _stat_value(statistics, "fwhm_2D", "mean"),
        "ID_IG_mean": _stat_value(statistics, "ID_IG_height", "mean"),
        "I2D_IG_mean": _stat_value(statistics, "I2D_IG_height", "mean"),
    }

    notes = []
    if invalid_fraction > 0.40:
        notes.append("Many pixels were invalid; inspect SNR threshold, baseline and cluster representative fits.")
    if low_conf_fraction > 0.25:
        notes.append("A large low-confidence region exists; avoid publication interpretation without manual review.")
    if class_fractions["background"] > 0.50:
        notes.append("Most pixels are classified as background/substrate; statistics focus only on interpretable graphene pixels.")
    if class_fractions["defect_rich"] > 0.25:
        notes.append("Defect-rich graphene is a major fraction of the map; inspect ID/IG and D-band confidence.")
    if analysis_mask_type == "reliable_fits_fallback":
        notes.append("No pixels passed strict graphene classing; descriptive statistics use reliable converged fits as fallback.")
    if dominant_reason and dominant_reason != "OK":
        notes.append(f"Dominant fit issue: {dominant_reason}.")
    if not notes:
        notes.append("Map has enough interpretable graphene signal for descriptive statistics.")

    return {
        "readiness": readiness,
        "total_pixels": int(n_spectra),
        "fit_converged_fraction": float(converged_fraction),
        "fit_reliable_fraction": float(fit_reliable_count / n_spectra if n_spectra > 0 else 0.0),
        "interpretable_fraction": float(interpretable_fraction),
        "analysis_fraction": float(analysis_count / n_spectra if n_spectra > 0 else 0.0),
        "analysis_count": int(analysis_count),
        "analysis_mask_type": str(analysis_mask_type),
        "invalid_fraction": float(invalid_fraction),
        "low_confidence_fraction": float(low_conf_fraction),
        "quality_thresholds": quality_thresholds,
        "class_counts": class_counts,
        "class_fractions": {key: float(value) for key, value in class_fractions.items()},
        "dominant_fit_reason": dominant_reason,
        "key_metrics": key_metrics,
        "notes": notes,
    }

def build_scientific_results(
    peak_maps: Dict[str, np.ndarray],
    peak_stderrs: Dict[str, np.ndarray],
    success_map: np.ndarray,
    r2_map: np.ndarray,
    snr_map: np.ndarray,
    quality_classes: np.ndarray,
    snr_reliable_min: float = 3.0,
    r2_reliable_min: float = 0.85,
) -> dict:
    n_spectra = len(success_map)
    reliable_mask = (
        success_map
        & np.isfinite(r2_map)
        & (r2_map >= r2_reliable_min)
        & np.isfinite(snr_map)
        & (snr_map >= snr_reliable_min)
        & (quality_classes != 4)
    )
    interpretable_mask = reliable_mask & np.isin(quality_classes, [1, 2, 3])
    analysis_mask = interpretable_mask.copy()
    analysis_mask_type = "interpretable_graphene"
    if np.sum(analysis_mask) == 0 and np.sum(reliable_mask) > 0:
        analysis_mask = reliable_mask.copy()
        analysis_mask_type = "reliable_fits_fallback"
    confidence = _confidence_values(success_map, r2_map, snr_map)
    source_status = _status_labels(success_map, r2_map, snr_map, quality_classes, snr_reliable_min)

    band_metrics = {}
    metric_series: Dict[str, np.ndarray] = {}
    metric_labels: Dict[str, str] = {}

    for band in ["D", "G", "2D"]:
        position = _find_param_map(peak_maps, band, "center")
        sigma = _find_param_map(peak_maps, band, "sigma")
        fwhm = _find_param_map(peak_maps, band, "fwhm")
        area = _find_param_map(peak_maps, band, "amplitude")
        height = _find_param_map(peak_maps, band, "height")

        position_stderr = _find_stderr_map(peak_stderrs, band, "center")
        sigma_stderr = _find_stderr_map(peak_stderrs, band, "sigma")
        fwhm_stderr = _find_stderr_map(peak_stderrs, band, "fwhm")
        area_stderr = _find_stderr_map(peak_stderrs, band, "amplitude")
        height_stderr = _find_stderr_map(peak_stderrs, band, "height")

        if position is None:
            position = _empty_metric(n_spectra)
        if fwhm is None and sigma is not None:
            fwhm = np.asarray(sigma, dtype=float) * 2.0
        elif fwhm is None:
            fwhm = _empty_metric(n_spectra)
        if area is None:
            area = _empty_metric(n_spectra)
        height, height_source = _height_or_lorentzian_estimate(height, area, fwhm, n_spectra)

        if position_stderr is None:
            position_stderr = _empty_metric(n_spectra)
        if fwhm_stderr is None and sigma_stderr is not None:
            fwhm_stderr = np.asarray(sigma_stderr, dtype=float) * 2.0
        elif fwhm_stderr is None:
            fwhm_stderr = _empty_metric(n_spectra)
        if area_stderr is None:
            area_stderr = _empty_metric(n_spectra)
        if height_stderr is None:
            height_stderr = _empty_metric(n_spectra)

        suffix = "2D" if band == "2D" else band
        band_metric_map = {
            f"pos_{suffix}": ("position_cm1", f"Pos({band})", position),
            f"fwhm_{suffix}": ("fwhm_cm1", f"FWHM({band})", fwhm),
            f"area_{suffix}": ("area", f"Area({band})", area),
            f"height_{suffix}": ("height", f"Height({band})", height),
        }
        for key, (_, label, values) in band_metric_map.items():
            metric_series[key] = np.asarray(values, dtype=float)
            metric_labels[key] = label

        band_metrics[band] = {
            "position_cm1": _finite_or_none(position),
            "fwhm_cm1": _finite_or_none(fwhm),
            "area": _finite_or_none(area),
            "height": _finite_or_none(height),
            "confidence": _finite_or_none(confidence),
            "source_status": source_status,
            "metric_source": {
                "position_cm1": "fit" if np.any(np.isfinite(position)) else "missing",
                "fwhm_cm1": "fit_or_sigma_derived" if np.any(np.isfinite(fwhm)) else "missing",
                "area": "fit" if np.any(np.isfinite(area)) else "missing",
                "height": height_source,
            },
            "stderr": {
                "position_cm1": _finite_or_none(position_stderr),
                "fwhm_cm1": _finite_or_none(fwhm_stderr),
                "area": _finite_or_none(area_stderr),
                "height": _finite_or_none(height_stderr),
            }
        }

    ratio_specs = {
        "ID_IG_height": ("ID/IG Height", _safe_ratio(metric_series["height_D"], metric_series["height_G"])),
        "AD_AG_area": ("AD/AG Area", _safe_ratio(metric_series["area_D"], metric_series["area_G"])),
        "I2D_IG_height": ("I2D/IG Height", _safe_ratio(metric_series["height_2D"], metric_series["height_G"])),
        "A2D_AG_area": ("A2D/AG Area", _safe_ratio(metric_series["area_2D"], metric_series["area_G"])),
        "FWHM_2D_FWHM_G": ("FWHM(2D)/FWHM(G)", _safe_ratio(metric_series["fwhm_2D"], metric_series["fwhm_G"])),
    }

    ratio_metrics = {}
    for key, (label, values) in ratio_specs.items():
        metric_series[key] = values
        metric_labels[key] = label
        ratio_metrics[key] = {
            "label": label,
            "values": _finite_or_none(values),
        }

    statistics = {}
    histograms = {}
    histogram_keys = [
        "pos_G", "fwhm_G", "area_G",
        "pos_2D", "fwhm_2D", "area_2D",
        "ID_IG_height", "I2D_IG_height",
    ]

    for key, values in metric_series.items():
        statistics[key] = {
            "label": metric_labels[key],
            "analysis_mask": analysis_mask_type,
            **_summary_statistics(values, analysis_mask),
        }
        if key in histogram_keys:
            histograms[key] = {
                "label": metric_labels[key],
                "analysis_mask": analysis_mask_type,
                **_histogram(values, analysis_mask, bins=30),
            }

    correlation_keys = [
        "pos_G",
        "pos_2D",
        "fwhm_G",
        "fwhm_2D",
        "ID_IG_height",
        "I2D_IG_height",
    ]
    correlations = {
        "metrics": correlation_keys,
        "labels": [metric_labels[k] for k in correlation_keys],
        "analysis_mask": analysis_mask_type,
        "pearson": _pairwise_correlation(metric_series, correlation_keys, analysis_mask, method="pearson"),
        "spearman": _pairwise_correlation(metric_series, correlation_keys, analysis_mask, method="spearman"),
    }

    return {
        "band_metrics": band_metrics,
        "ratio_metrics": ratio_metrics,
        "statistics": statistics,
        "histograms": histograms,
        "correlations": correlations,
        "reliable_mask": [bool(v) for v in reliable_mask],
        "interpretable_mask": [bool(v) for v in interpretable_mask],
        "analysis_mask": [bool(v) for v in analysis_mask],
        "analysis_mask_type": analysis_mask_type,
        "fit_reliable_count": int(np.sum(reliable_mask)),
        "interpretable_count": int(np.sum(interpretable_mask)),
        "analysis_count": int(np.sum(analysis_mask)),
        "quality_thresholds": {
            "r2_reliable_min": float(r2_reliable_min),
            "snr_reliable_min": float(snr_reliable_min),
        },
        "scientific_maps": {
            key: {
                "label": metric_labels[key],
                "values": _finite_or_none(values),
            }
            for key, values in metric_series.items()
        },
    }

def _fit_single_pixel_rgi_worker(args) -> dict:
    idx, wavenumbers, intensity, peaks, baseline_method, baseline_params, x_shift, crop_range, threshold_snr = args
    
    x_proc = wavenumbers.copy() + x_shift
    y_proc = intensity.copy()
    
    if crop_range:
        xmin, xmax = crop_range
        mask = (x_proc >= xmin) & (x_proc <= xmax)
        if np.any(mask):
            x_proc = x_proc[mask]
            y_proc = y_proc[mask]

    y_corr, baseline = apply_baseline(x_proc, y_proc, baseline_method, baseline_params)

    # Calculate SNR using Savitzky-Golay
    y_smooth = savgol_smoothing(y_corr)
    noise_std = np.std(y_corr - y_smooth) if len(y_corr) > 10 else 1.0
    signal_amp = np.max(y_corr) - np.min(y_corr)
    snr = signal_amp / (noise_std + 1e-10)

    if snr < threshold_snr:
        return {"idx": idx, "success": False, "reason": "SNR_LOW", "snr": float(snr)}

    try:
        model, params = build_fitting_model(peaks)
        y_max = float(np.max(y_corr)) if np.max(y_corr) > 0 else 1.0
        
        # Override initial values with peak seeds provided
        for p in peaks:
            safe_name = sanitize_prefix(p["name"])
            center_key = f"{safe_name}_center"
            sigma_key = f"{safe_name}_sigma"
            amplitude_key = f"{safe_name}_amplitude"

            if center_key in params and params[center_key].expr is None:
                center_val = p.get("center")
                if center_val is not None:
                    params[center_key].set(value=float(center_val))

            if sigma_key in params and params[sigma_key].expr is None:
                sigma_val = p.get("sigma")
                if sigma_val is None:
                    fwhm_val = p.get("fwhm_init")
                    sigma_val = float(fwhm_val) / 2.0 if fwhm_val is not None else None
                if sigma_val is not None:
                    params[sigma_key].set(value=float(sigma_val))

            if amplitude_key in params and params[amplitude_key].expr is None:
                params[amplitude_key].set(value=float(p.get("amplitude", y_max * 0.5)), min=0.0)

        result = model.fit(y_corr, params, x=x_proc, method="leastsq", max_nfev=800)
        
        # Collect parameters
        vals = {}
        stderrs = {}
        for name, p in result.params.items():
            vals[name] = float(p.value)
            stderrs[name] = float(p.stderr) if p.stderr is not None else None
            
        return {
            "idx": idx, 
            "success": result.success, 
            "reason": "OK" if result.success else "CONVERGE_FAIL",
            "values": vals,
            "stderrs": stderrs,
            "snr": float(snr),
            "r_squared": float(result.rsquared) if hasattr(result, "rsquared") else 0.0,
            "chi2_reduced": float(result.redchi) if hasattr(result, "redchi") else 0.0,
            "rmse": float(np.sqrt(np.mean(result.residual**2)))
        }
    except Exception as e:
        message = str(e)
        reason = "SEED_ERR" if "NoneType" in message or "float()" in message else "SOLVER_ERR"
        return {"idx": idx, "success": False, "reason": reason, "message": message, "snr": float(snr)}


class RamanGlobalIntelligenceEngine:
    def __init__(self, h5_path: str):
        self.h5_path = h5_path

    def build_map_model(
        self,
        crop_range: Optional[List[float]] = None,
        baseline_method: str = "asls",
        baseline_params: Optional[dict] = None,
        x_shift: float = 0.0,
        n_components_pca: int = 5,
        n_components_nmf: int = 3,
        n_clusters: int = 4,
        normalization: str = "vector"
    ) -> dict:
        if not os.path.exists(self.h5_path):
            return {"success": False, "message": "HDF5 file not found"}

        with h5py.File(self.h5_path, "r") as f:
            wavenumbers = f["/spectrum/wavenumbers"][:]
            intensities_2d = f["/spectrum/intensities"][:]

        if intensities_2d.ndim == 1:
            intensities_2d = intensities_2d.reshape(1, -1)

        n_spectra = intensities_2d.shape[0]

        # 1. Preprocessing (Crop, Shift, Baseline)
        x_proc = wavenumbers.copy() + x_shift
        xmin, xmax = (crop_range[0], crop_range[1]) if crop_range else (x_proc[0], x_proc[-1])
        mask = (x_proc >= xmin) & (x_proc <= xmax)
        x_crop = x_proc[mask]

        X_corr = []
        baselines = []
        for i in range(n_spectra):
            y_pixel = intensities_2d[i][mask]
            y_corr, bs = apply_baseline(x_crop, y_pixel, baseline_method, baseline_params)
            X_corr.append(y_corr)
            baselines.append(bs)

        X_corr = np.array(X_corr)  # [n_spectra, n_wavenumbers_cropped]
        
        # 2. Normalization for Machine Learning
        X_ml = X_corr.copy()
        if normalization == "vector":
            norms = np.linalg.norm(X_ml, axis=1, keepdims=True)
            X_ml = X_ml / (norms + 1e-10)
        elif normalization == "area":
            areas = np.trapz(X_ml, x=x_crop, axis=1)[:, np.newaxis]
            X_ml = X_ml / (areas + 1e-10)
        elif normalization == "max":
            maxvals = np.max(X_ml, axis=1, keepdims=True)
            X_ml = X_ml / (maxvals + 1e-10)

        # Replace any residual NaNs/Infs
        X_ml = np.nan_to_num(X_ml)

        # 3. Principal Component Analysis (PCA)
        n_comp_pca = min(n_components_pca, X_ml.shape[0], X_ml.shape[1])
        pca = PCA(n_components=n_comp_pca)
        pca_scores = pca.fit_transform(X_ml)
        pca_components = pca.components_
        explained_variance = pca.explained_variance_ratio_

        # 4. Non-negative Matrix Factorization (NMF)
        n_comp_nmf = min(n_components_nmf, X_ml.shape[0], X_ml.shape[1])
        nmf = NMF(n_components=n_comp_nmf, init='random', random_state=42, max_iter=1000)
        nmf_abundance = nmf.fit_transform(np.clip(X_ml, 0, None))
        nmf_components = nmf.components_

        # 5. Clustering (KMeans)
        n_clust = min(n_clusters, X_ml.shape[0])
        kmeans = KMeans(n_clusters=n_clust, random_state=42, n_init=10)
        cluster_labels = kmeans.fit_predict(pca_scores)

        # 6. Representative Selection (nearest spectrum to cluster center)
        cluster_representatives = []
        cluster_sizes = []
        for c_idx in range(n_clust):
            pixel_indices = np.where(cluster_labels == c_idx)[0]
            cluster_sizes.append(len(pixel_indices))
            if len(pixel_indices) == 0:
                cluster_representatives.append(-1)
                continue
            
            c_scores = pca_scores[pixel_indices]
            center = np.mean(c_scores, axis=0)
            dists = np.linalg.norm(c_scores - center, axis=1)
            best_local_idx = np.argmin(dists)
            best_global_idx = int(pixel_indices[best_local_idx])
            cluster_representatives.append(best_global_idx)

        # Write results back to H5
        with h5py.File(self.h5_path, "r+") as f:
            # Delete old RGI analysis if exists
            if "/analysis/rgi_v1" in f:
                del f["/analysis/rgi_v1"]

            rgi_grp = f.create_group("/analysis/rgi_v1")
            
            # Preprocessing Group
            prep_grp = rgi_grp.create_group("preprocessing")
            prep_grp.attrs["baseline_method"] = baseline_method
            prep_grp.attrs["baseline_params"] = json.dumps(baseline_params or {})
            prep_grp.attrs["x_shift"] = x_shift
            prep_grp.attrs["crop_range"] = [float(xmin), float(xmax)]
            prep_grp.attrs["normalization"] = normalization

            # ML datasets
            rgi_grp.create_dataset("decomposition/pca_scores", data=pca_scores)
            rgi_grp.create_dataset("decomposition/pca_components", data=pca_components)
            rgi_grp.create_dataset("decomposition/pca_explained_variance", data=explained_variance)
            rgi_grp.create_dataset("decomposition/nmf_components", data=nmf_components)
            rgi_grp.create_dataset("decomposition/nmf_abundance", data=nmf_abundance)

            rgi_grp.create_dataset("clustering/cluster_labels", data=cluster_labels)
            rgi_grp.create_dataset("clustering/representatives", data=cluster_representatives)
            rgi_grp.create_dataset("clustering/sizes", data=cluster_sizes)

        # Build spectra data for representatives to send back
        rep_spectra_data = []
        for c_idx, global_idx in enumerate(cluster_representatives):
            y_raw = intensities_2d[global_idx]
            y_crop_pixel = y_raw[mask]
            rep_spectra_data.append({
                "cluster_id": c_idx,
                "pixel_index": global_idx,
                "wavenumbers": to_safe_float_list(x_crop),
                "intensity_raw": to_safe_float_list(y_crop_pixel),
                "intensity_corr": to_safe_float_list(X_corr[global_idx]),
                "baseline": to_safe_float_list(baselines[global_idx])
            })

        return {
            "success": True,
            "n_spectra": n_spectra,
            "n_clusters": n_clust,
            "cluster_sizes": [int(x) for x in cluster_sizes],
            "representatives": [int(x) for x in cluster_representatives],
            "pca_explained_variance": to_safe_float_list(explained_variance),
            "rep_spectra": rep_spectra_data,
            "cluster_labels": [int(x) for x in cluster_labels]
        }

    def run_constrained_map_fit(
        self,
        peaks: List[dict],
        baseline_method: str = "asls",
        baseline_params: Optional[dict] = None,
        x_shift: float = 0.0,
        crop_range: Optional[List[float]] = None,
        threshold_snr: float = 3.0,
        cluster_models_override: Optional[Dict[int, List[dict]]] = None,
        progress_callback = None
    ) -> dict:
        if not os.path.exists(self.h5_path):
            return {"success": False, "message": "HDF5 file not found"}

        with h5py.File(self.h5_path, "r") as f:
            wavenumbers = f["/spectrum/wavenumbers"][:]
            intensities_2d = f["/spectrum/intensities"][:]
            
            # Load cluster labels
            if "/analysis/rgi_v1/clustering/cluster_labels" not in f:
                return {"success": False, "message": "Run map segmentation (Step 1) before map fitting."}
            cluster_labels = f["/analysis/rgi_v1/clustering/cluster_labels"][:]

        if intensities_2d.ndim == 1:
            intensities_2d = intensities_2d.reshape(1, -1)

        n_spectra = intensities_2d.shape[0]

        # Pack arguments
        args_list = []
        for i in range(n_spectra):
            # Select the correct peaks seeds template: use the cluster override if provided
            c_id = int(cluster_labels[i])
            pixel_peaks = peaks
            if cluster_models_override and c_id in cluster_models_override:
                pixel_peaks = cluster_models_override[c_id]
                
            args_list.append((
                i,
                wavenumbers,
                intensities_2d[i],
                pixel_peaks,
                baseline_method,
                baseline_params,
                x_shift,
                crop_range,
                threshold_snr
            ))

        # Parallel pooling
        results = {}
        success_count = 0
        n_cpus = min(os.cpu_count() or 4, 8)
        
        from concurrent.futures import as_completed
        
        with ProcessPoolExecutor(max_workers=n_cpus) as executor:
            futures = [executor.submit(_fit_single_pixel_rgi_worker, args) for args in args_list]
            completed_count = 0
            
            for future in as_completed(futures):
                res = future.result()
                idx = res["idx"]
                results[str(idx)] = res

                if res["success"]:
                    success_count += 1
                
                completed_count += 1
                if progress_callback:
                    try:
                        progress_callback(completed_count, n_spectra)
                    except:
                        pass

        # Extract spatial parameter maps
        first_success = next((v for v in results.values() if v["success"]), None)
        param_names = list(first_success["values"].keys()) if first_success else []
        
        # Build 1D arrays of results
        r2_map = np.full(n_spectra, np.nan)
        rmse_map = np.full(n_spectra, np.nan)
        snr_map = np.full(n_spectra, np.nan)
        success_map = np.zeros(n_spectra, dtype=bool)
        pixel_reasons = np.full(n_spectra, "UNKNOWN", dtype=object)
        
        peak_maps = {
            pname: np.full(n_spectra, np.nan)
            for pname in param_names
        }
        peak_stderrs = {
            pname: np.full(n_spectra, np.nan)
            for pname in param_names
        }

        # Fill values
        for i in range(n_spectra):
            res = results[str(i)]
            pixel_reasons[i] = res.get("reason", "UNKNOWN")
            snr_map[i] = res.get("snr", np.nan)
            if res["success"]:
                success_map[i] = True
                r2_map[i] = res["r_squared"]
                rmse_map[i] = res["rmse"]
                for pname in param_names:
                    peak_maps[pname][i] = res["values"].get(pname, np.nan)
                    peak_stderrs[pname][i] = res["stderrs"].get(pname, np.nan)

        # Graphene Quality Classification Layer
        quality_classes = np.zeros(n_spectra, dtype=int)
        g_amp_values = _find_param_map(peak_maps, "G", "amplitude")
        d_amp_values = _find_param_map(peak_maps, "D", "amplitude")
        twoD_amp_values = _find_param_map(peak_maps, "2D", "amplitude")
        g_height_values = _find_param_map(peak_maps, "G", "height")
        d_height_values = _find_param_map(peak_maps, "D", "height")
        twoD_height_values = _find_param_map(peak_maps, "2D", "height")
        g_fwhm_values = _find_param_map(peak_maps, "G", "fwhm")
        d_fwhm_values = _find_param_map(peak_maps, "D", "fwhm")
        twoD_fwhm_values = _find_param_map(peak_maps, "2D", "fwhm")
        g_sigma_values = _find_param_map(peak_maps, "G", "sigma")
        d_sigma_values = _find_param_map(peak_maps, "D", "sigma")
        twoD_sigma_values = _find_param_map(peak_maps, "2D", "sigma")

        if g_amp_values is None:
            g_amp_values = _empty_metric(n_spectra)
        if d_amp_values is None:
            d_amp_values = _empty_metric(n_spectra)
        if twoD_amp_values is None:
            twoD_amp_values = _empty_metric(n_spectra)
        if g_fwhm_values is None and g_sigma_values is not None:
            g_fwhm_values = np.asarray(g_sigma_values, dtype=float) * 2.0
        elif g_fwhm_values is None:
            g_fwhm_values = _empty_metric(n_spectra)
        if d_fwhm_values is None and d_sigma_values is not None:
            d_fwhm_values = np.asarray(d_sigma_values, dtype=float) * 2.0
        elif d_fwhm_values is None:
            d_fwhm_values = _empty_metric(n_spectra)
        if twoD_fwhm_values is None and twoD_sigma_values is not None:
            twoD_fwhm_values = np.asarray(twoD_sigma_values, dtype=float) * 2.0
        elif twoD_fwhm_values is None:
            twoD_fwhm_values = _empty_metric(n_spectra)

        g_height_values, _ = _height_or_lorentzian_estimate(g_height_values, g_amp_values, g_fwhm_values, n_spectra)
        d_height_values, _ = _height_or_lorentzian_estimate(d_height_values, d_amp_values, d_fwhm_values, n_spectra)
        twoD_height_values, _ = _height_or_lorentzian_estimate(twoD_height_values, twoD_amp_values, twoD_fwhm_values, n_spectra)
        
        for i in range(n_spectra):
            if not success_map[i]:
                quality_classes[i] = 0  # Background
                continue
                
            r2 = r2_map[i]
            if r2 < 0.85:
                quality_classes[i] = 4  # Low confidence
                continue
                
            g_height = g_height_values[i] if np.isfinite(g_height_values[i]) else 0.0
            d_height = d_height_values[i] if np.isfinite(d_height_values[i]) else 0.0
            twoD_height = twoD_height_values[i] if np.isfinite(twoD_height_values[i]) else 0.0
            twoD_fwhm = twoD_fwhm_values[i] if np.isfinite(twoD_fwhm_values[i]) else 40.0
                    
            if g_height < 10.0 and twoD_height < 10.0:
                quality_classes[i] = 0  # Background
            elif d_height > 10.0 and g_height > 10.0 and (d_height / g_height) > 0.4:
                quality_classes[i] = 1  # Defective
            elif twoD_height > 10.0 and twoD_fwhm < 32.0:
                quality_classes[i] = 2  # Monolayer
            else:
                quality_classes[i] = 3  # Multilayer

        scientific_results = build_scientific_results(
            peak_maps=peak_maps,
            peak_stderrs=peak_stderrs,
            success_map=success_map,
            r2_map=r2_map,
            snr_map=snr_map,
            quality_classes=quality_classes,
            snr_reliable_min=threshold_snr,
        )

        reason_summary = {}
        reason_messages = {}
        for reason in pixel_reasons:
            reason_key = str(reason)
            reason_summary[reason_key] = reason_summary.get(reason_key, 0) + 1
        for res in results.values():
            reason_key = str(res.get("reason", "UNKNOWN"))
            message = res.get("message")
            if message and reason_key not in reason_messages:
                reason_messages[reason_key] = str(message)[:300]

        interpretation_summary = build_interpretation_summary(
            n_spectra=n_spectra,
            success_count=success_count,
            quality_classes=quality_classes,
            reason_summary=reason_summary,
            scientific_results=scientific_results,
        )

        # Save results back to H5 /analysis/rgi_v1/fits
        with h5py.File(self.h5_path, "r+") as f:
            rgi_grp = f["/analysis/rgi_v1"]
            if "fits" in rgi_grp:
                del rgi_grp["fits"]
            fits_grp = rgi_grp.create_group("fits")
            fits_grp.create_dataset("r2", data=r2_map)
            fits_grp.create_dataset("rmse", data=rmse_map)
            fits_grp.create_dataset("snr", data=snr_map)
            fits_grp.create_dataset("success", data=success_map)
            fits_grp.create_dataset("graphene_quality_class", data=quality_classes)
            str_dtype = h5py.string_dtype(encoding="utf-8")
            fits_grp.create_dataset("pixel_reasons", data=[str(x) for x in pixel_reasons], dtype=str_dtype)
            
            for pname in param_names:
                h5_name = pname.replace(" ", "_")
                fits_grp.create_dataset(f"maps/{h5_name}", data=peak_maps[pname])
                fits_grp.create_dataset(f"stderrs/{h5_name}", data=peak_stderrs[pname])

            scientific_grp = fits_grp.create_group("scientific")
            scientific_maps_grp = scientific_grp.create_group("maps")
            scientific_grp.create_dataset("reliable_mask", data=np.array(scientific_results["reliable_mask"], dtype=bool))
            scientific_grp.create_dataset("interpretable_mask", data=np.array(scientific_results["interpretable_mask"], dtype=bool))
            scientific_grp.create_dataset("analysis_mask", data=np.array(scientific_results["analysis_mask"], dtype=bool))
            scientific_grp.attrs["analysis_mask_type"] = scientific_results["analysis_mask_type"]
            for key, payload in scientific_results["scientific_maps"].items():
                values = np.array([
                    np.nan if v is None else float(v)
                    for v in payload["values"]
                ], dtype=float)
                scientific_maps_grp.create_dataset(key, data=values)
                scientific_maps_grp[key].attrs["label"] = payload["label"]

            scientific_ratios_grp = scientific_grp.create_group("ratios")
            for key, payload in scientific_results["ratio_metrics"].items():
                values = np.array([
                    np.nan if v is None else float(v)
                    for v in payload["values"]
                ], dtype=float)
                scientific_ratios_grp.create_dataset(key, data=values)
                scientific_ratios_grp[key].attrs["label"] = payload["label"]

            scientific_grp.attrs["statistics_json"] = json.dumps(scientific_results["statistics"])
            scientific_grp.attrs["histograms_json"] = json.dumps(scientific_results["histograms"])
            scientific_grp.attrs["correlations_json"] = json.dumps(scientific_results["correlations"])
            scientific_grp.attrs["reason_summary_json"] = json.dumps(reason_summary)
            scientific_grp.attrs["reason_messages_json"] = json.dumps(reason_messages)
            scientific_grp.attrs["interpretation_summary_json"] = json.dumps(interpretation_summary)

            fits_grp.attrs["fit_config_json"] = json.dumps({
                "peaks": peaks,
                "crop_range": crop_range,
                "baseline_method": baseline_method,
                "baseline_params": baseline_params,
                "x_shift": x_shift,
                "threshold_snr": threshold_snr
            })

        summary_results = {}
        for pname in param_names:
            clean_name = pname.replace(" ", "_")
            summary_results[clean_name] = [None if np.isnan(v) else float(v) for v in peak_maps[pname]]
            summary_results[f"{clean_name}_stderr"] = [None if np.isnan(v) else float(v) for v in peak_stderrs[pname]]

        return {
            "success": True,
            "n_spectra": n_spectra,
            "success_count": success_count,
            "r2_mean": float(np.nanmean(r2_map)) if np.any(~np.isnan(r2_map)) else 0.0,
            "r2": [None if np.isnan(v) else float(v) for v in r2_map],
            "rmse": [None if np.isnan(v) else float(v) for v in rmse_map],
            "snr": [None if np.isnan(v) else float(v) for v in snr_map],
            "success_map": [bool(x) for x in success_map],
            "pixel_reasons": [str(x) for x in pixel_reasons],
            "reason_summary": reason_summary,
            "reason_messages": reason_messages,
            "interpretation_summary": interpretation_summary,
            "quality_classes": [int(x) for x in quality_classes],
            "results": summary_results,
            **scientific_results,
        }

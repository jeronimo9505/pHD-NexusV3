"""
RGI2 Engine
Advanced, isolated Raman map fitting workflow.

RGI2 never writes to /analysis/rgi_v1. All analysis state is stored under
/analysis/rgi2_v1, and callers should operate on *_rgi2_* file copies.
"""

import json
import os
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple

import h5py
import lmfit
import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import NMF, PCA
from sklearn.mixture import GaussianMixture

from scripts.rgi_engine import (
    apply_baseline,
    build_fitting_model,
    build_interpretation_summary,
    build_scientific_results,
    fit_spectrum,
    safe_float,
    savgol_smoothing,
    sanitize_prefix,
    to_safe_float_list,
)


RGI2_GROUP = "/analysis/rgi2_v1"


def _clean_json_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _clean_json_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean_json_value(v) for v in value]
    if isinstance(value, tuple):
        return [_clean_json_value(v) for v in value]
    if isinstance(value, np.ndarray):
        return _clean_json_value(value.tolist())
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        v = float(value)
        return None if not np.isfinite(v) else v
    if isinstance(value, float):
        return None if not np.isfinite(value) else value
    return value


def _finite_or_none(values: np.ndarray) -> list:
    arr = np.asarray(values, dtype=float)
    return [None if not np.isfinite(v) else float(v) for v in arr]


def _read_spectrum_matrix(h5_path: str) -> Tuple[np.ndarray, np.ndarray]:
    with h5py.File(h5_path, "r") as f:
        wavenumbers = f["/spectrum/wavenumbers"][:]
        intensities = f["/spectrum/intensities"][:]
    if intensities.ndim == 1:
        intensities = intensities.reshape(1, -1)
    return wavenumbers, intensities


def _preprocess_matrix(
    wavenumbers: np.ndarray,
    intensities: np.ndarray,
    crop_range: Optional[List[float]],
    baseline_method: str,
    baseline_params: Optional[dict],
    x_shift: float,
    normalization: str,
    despike: bool = False,
    despike_method: str = "whitaker_hayes",
    despike_threshold: float = 7.0,
    despike_window: int = 7,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    x_proc = wavenumbers.copy() + x_shift
    xmin, xmax = (crop_range[0], crop_range[1]) if crop_range else (x_proc[0], x_proc[-1])
    mask = (x_proc >= xmin) & (x_proc <= xmax)
    x_crop = x_proc[mask]
    x_raw = intensities[:, mask]
    x_clean = x_raw.copy()

    if despike:
        try:
            import sys

            engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            if engine_dir not in sys.path:
                sys.path.append(engine_dir)
            from pipeline_engine import _step_despike

            x_clean, _ = _step_despike(
                x_crop,
                x_clean,
                {
                    "method": despike_method,
                    "threshold": despike_threshold,
                    "window": despike_window,
                },
            )
        except Exception as exc:
            print(f"RGI2 despike failed, continuing with cropped raw spectra: {exc}")

    corrected = []
    baselines = []
    for row in x_clean:
        y_corr, baseline = apply_baseline(x_crop, row, baseline_method, baseline_params or {})
        corrected.append(y_corr)
        baselines.append(baseline)

    x_corr = np.nan_to_num(np.asarray(corrected, dtype=float))
    baselines_arr = np.nan_to_num(np.asarray(baselines, dtype=float))
    x_ml = x_corr.copy()

    if normalization == "area":
        areas = np.trapz(x_ml, x=x_crop, axis=1)[:, np.newaxis]
        x_ml = x_ml / (areas + 1e-10)
    elif normalization == "max":
        maxvals = np.max(np.abs(x_ml), axis=1, keepdims=True)
        x_ml = x_ml / (maxvals + 1e-10)
    else:
        norms = np.linalg.norm(x_ml, axis=1, keepdims=True)
        x_ml = x_ml / (norms + 1e-10)

    return x_crop, x_raw, x_clean, x_corr, np.nan_to_num(x_ml), baselines_arr


def _representatives_from_probabilities(
    scores: np.ndarray,
    labels: np.ndarray,
    probabilities: np.ndarray,
    n_clusters: int,
) -> Tuple[List[int], List[int]]:
    reps: List[int] = []
    sizes: List[int] = []
    for cluster_id in range(n_clusters):
        idxs = np.where(labels == cluster_id)[0]
        sizes.append(int(len(idxs)))
        if len(idxs) == 0:
            reps.append(-1)
            continue
        cluster_scores = scores[idxs]
        center = np.mean(cluster_scores, axis=0)
        distances = np.linalg.norm(cluster_scores - center, axis=1)
        membership = probabilities[idxs, cluster_id] if probabilities.ndim == 2 else np.ones(len(idxs))
        rank = distances / (membership + 1e-6)
        reps.append(int(idxs[int(np.argmin(rank))]))
    return reps, sizes


def _cluster_priors_from_fits(cluster_fit_data: Optional[dict], cluster_models_override: Optional[dict]) -> Dict[int, dict]:
    priors: Dict[int, dict] = {}
    if cluster_fit_data:
        for raw_key, fit in cluster_fit_data.items():
            try:
                cluster_id = int(raw_key)
            except Exception:
                continue
            params = {}
            for param in fit.get("parameters", []) or []:
                name = param.get("name")
                if name:
                    params[name] = {
                        "value": safe_float(param.get("value")),
                        "stderr": param.get("stderr"),
                    }
            priors[cluster_id] = {
                "parameters": params,
                "metrics": fit.get("metrics", {}),
            }

    if cluster_models_override:
        for raw_key, peaks in cluster_models_override.items():
            try:
                cluster_id = int(raw_key)
            except Exception:
                continue
            priors.setdefault(cluster_id, {})["peaks"] = peaks
    return priors


def _fit_pixel_with_priors(args: tuple) -> dict:
    (
        idx,
        wavenumbers,
        intensity,
        peaks,
        baseline_method,
        baseline_params,
        x_shift,
        crop_range,
        threshold_snr,
        threshold_r2,
        cluster_id,
        cluster_prior,
        lambda_cluster,
        despike,
        despike_method,
        despike_threshold,
        despike_window,
    ) = args

    x_proc = wavenumbers.copy() + x_shift
    y_proc = intensity.copy()
    if crop_range:
        xmin, xmax = crop_range
        mask = (x_proc >= xmin) & (x_proc <= xmax)
        if np.any(mask):
            x_proc = x_proc[mask]
            y_proc = y_proc[mask]

    if despike:
        try:
            import sys

            engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            if engine_dir not in sys.path:
                sys.path.append(engine_dir)
            from pipeline_engine import _step_despike

            y_clean, _ = _step_despike(
                x_proc,
                y_proc.reshape(1, -1),
                {
                    "method": despike_method,
                    "threshold": despike_threshold,
                    "window": despike_window,
                },
            )
            y_proc = y_clean[0]
        except Exception as exc:
            print(f"RGI2 worker despike failed for pixel {idx}: {exc}")

    y_corr, _baseline = apply_baseline(x_proc, y_proc, baseline_method, baseline_params or {})
    y_smooth = savgol_smoothing(y_corr)
    noise_std = float(np.std(y_corr - y_smooth)) if len(y_corr) > 10 else 1.0
    signal_amp = float(np.max(y_corr) - np.min(y_corr)) if y_corr.size else 0.0
    snr = signal_amp / (noise_std + 1e-10)
    if snr < threshold_snr:
        return {"idx": idx, "cluster_id": cluster_id, "success": False, "reason": "low_snr", "snr": float(snr)}

    try:
        model, params = build_fitting_model(peaks)
        prior_params = (cluster_prior or {}).get("parameters", {})

        for peak in peaks:
            safe_name = sanitize_prefix(peak.get("name", "peak"))
            center_prior_value = prior_params.get(f"{safe_name}_center", {}).get("value")
            if center_prior_value is None:
                center_prior_value = peak.get("center")
            
            # Encontrar el máximo local en y_corr dentro de la región del pico para este espectro
            local_max_seed = None
            if center_prior_value is not None:
                search_mask = (x_proc >= (center_prior_value - 15.0)) & (x_proc <= (center_prior_value + 15.0))
                if np.any(search_mask):
                    sub_x = x_proc[search_mask]
                    sub_y = y_corr[search_mask]
                    local_max_seed = float(sub_x[np.argmax(sub_y)])

            for suffix, config_key in (("center", "center"), ("sigma", "fwhm_init"), ("amplitude", "amplitude")):
                p_name = f"{safe_name}_{suffix}"
                if p_name not in params or params[p_name].expr is not None:
                    continue
                prior_value = prior_params.get(p_name, {}).get("value")
                if prior_value is None:
                    if suffix == "sigma" and peak.get(config_key) is not None:
                        prior_value = float(peak.get(config_key)) / 2.0
                    else:
                        prior_value = peak.get(config_key)

                if suffix == "center" and local_max_seed is not None:
                    params[p_name].set(value=local_max_seed)
                    user_min = peak.get("minParams", {}).get("center")
                    user_max = peak.get("maxParams", {}).get("center")
                    fit_min = float(user_min) if user_min is not None else (local_max_seed - 10.0)
                    fit_max = float(user_max) if user_max is not None else (local_max_seed + 10.0)
                    params[p_name].set(min=fit_min, max=fit_max)
                else:
                    if prior_value is not None:
                        params[p_name].set(value=float(prior_value))

        prior_names = [name for name in prior_params.keys() if name in params and params[name].expr is None]
        y_scale = max(float(np.std(y_corr)), 1.0)

        def residual(local_params):
            spec_resid = (model.eval(local_params, x=x_proc) - y_corr) / y_scale
            if not prior_names or lambda_cluster <= 0:
                return spec_resid
            penalties = []
            for name in prior_names:
                prior_value = prior_params[name].get("value")
                if prior_value is None:
                    continue
                stderr = prior_params[name].get("stderr")
                scale = abs(float(stderr)) if stderr not in (None, 0) else max(abs(float(prior_value)) * 0.05, 1.0)
                # Si es un parámetro de posición (center) y la escala es demasiado pequeña (stderr muy bajo),
                # establecemos un mínimo razonable (por ejemplo, 5.0 cm^-1) para evitar el bloqueo rígido del píxel.
                if "center" in name and scale < 5.0:
                    scale = 5.0
                penalties.append(np.sqrt(lambda_cluster) * ((local_params[name].value - float(prior_value)) / scale))
            if not penalties:
                return spec_resid
            return np.concatenate([spec_resid, np.asarray(penalties, dtype=float)])

        minimizer = lmfit.Minimizer(residual, params)
        result = minimizer.minimize(method="leastsq", max_nfev=900)
        best_fit = model.eval(result.params, x=x_proc)
        raw_residual = y_corr - best_fit
        ss_res = float(np.sum(raw_residual ** 2))
        ss_tot = float(np.sum((y_corr - np.mean(y_corr)) ** 2)) + 1e-12
        r_squared = 1.0 - (ss_res / ss_tot)
        rmse = float(np.sqrt(np.mean(raw_residual ** 2)))

        values = {}
        stderrs = {}
        for name, param in result.params.items():
            values[name] = safe_float(param.value)
            stderrs[name] = None if param.stderr is None else safe_float(param.stderr)

        status = "reliable" if result.success and r_squared >= threshold_r2 else "review"
        return {
            "idx": idx,
            "cluster_id": cluster_id,
            "success": bool(result.success),
            "reason": "OK" if result.success else "converge_fail",
            "status": status,
            "values": values,
            "stderrs": stderrs,
            "snr": float(snr),
            "r_squared": float(r_squared),
            "rmse": rmse,
            "prior_penalty": float(lambda_cluster),
        }
    except Exception as exc:
        return {
            "idx": idx,
            "cluster_id": cluster_id,
            "success": False,
            "reason": "solver_err",
            "message": str(exc)[:300],
            "snr": float(snr),
        }


def _smooth_1d_by_neighbors(values: np.ndarray, valid: np.ndarray, width: int, height: int, edge_preserving: bool) -> np.ndarray:
    arr = values.copy()
    if width <= 0 or height <= 0 or width * height < len(values):
        return arr
    grid = arr[: width * height].reshape(height, width)
    valid_grid = valid[: width * height].reshape(height, width)
    out = grid.copy()
    for y in range(height):
        for x in range(width):
            if valid_grid[y, x] and np.isfinite(grid[y, x]):
                continue
            ys = slice(max(0, y - 1), min(height, y + 2))
            xs = slice(max(0, x - 1), min(width, x + 2))
            neighbors = grid[ys, xs]
            neighbor_valid = valid_grid[ys, xs] & np.isfinite(neighbors)
            if not np.any(neighbor_valid):
                continue
            vals = neighbors[neighbor_valid]
            out[y, x] = float(np.median(vals) if edge_preserving else np.mean(vals))
    arr[: width * height] = out.reshape(-1)
    return arr


class RamanGlobalIntelligence2Engine:
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
        normalization: str = "vector",
        clustering_method: str = "gmm",
        despike: bool = False,
        despike_method: str = "whitaker_hayes",
        despike_threshold: float = 7.0,
        despike_window: int = 7,
    ) -> dict:
        wavenumbers, intensities = _read_spectrum_matrix(self.h5_path)
        n_spectra = intensities.shape[0]
        x_crop, x_raw, x_clean, x_corr, x_ml, baselines = _preprocess_matrix(
            wavenumbers,
            intensities,
            crop_range,
            baseline_method,
            baseline_params,
            x_shift,
            normalization,
            despike,
            despike_method,
            despike_threshold,
            despike_window,
        )

        n_comp_pca = max(1, min(n_components_pca, x_ml.shape[0], x_ml.shape[1]))
        pca = PCA(n_components=n_comp_pca, random_state=42)
        pca_scores = pca.fit_transform(x_ml)

        n_comp_nmf = max(1, min(n_components_nmf, x_ml.shape[0], x_ml.shape[1]))
        nmf = NMF(n_components=n_comp_nmf, init="nndsvda", random_state=42, max_iter=1200)
        nmf_abundance = nmf.fit_transform(np.clip(x_ml, 0, None))
        nmf_components = nmf.components_

        n_clust = max(1, min(n_clusters, n_spectra))
        method = (clustering_method or "gmm").lower()
        if method == "kmeans":
            model = KMeans(n_clusters=n_clust, random_state=42, n_init=10)
            labels = model.fit_predict(pca_scores)
            probabilities = np.zeros((n_spectra, n_clust), dtype=float)
            probabilities[np.arange(n_spectra), labels] = 1.0
        elif method in ("nmf", "mcr", "mcr-like"):
            labels = np.argmax(nmf_abundance, axis=1)
            probabilities = nmf_abundance / (np.sum(nmf_abundance, axis=1, keepdims=True) + 1e-10)
            if probabilities.shape[1] != n_clust:
                n_clust = probabilities.shape[1]
        else:
            model = GaussianMixture(n_components=n_clust, covariance_type="full", random_state=42, reg_covar=1e-6)
            labels = model.fit_predict(pca_scores)
            probabilities = model.predict_proba(pca_scores)

        representatives, cluster_sizes = _representatives_from_probabilities(pca_scores, labels, probabilities, n_clust)

        with h5py.File(self.h5_path, "r+") as f:
            if RGI2_GROUP in f:
                del f[RGI2_GROUP]
            rgi2 = f.create_group(RGI2_GROUP)
            prep = rgi2.create_group("preprocessing")
            prep.attrs["baseline_method"] = baseline_method
            prep.attrs["baseline_params"] = json.dumps(baseline_params or {})
            prep.attrs["x_shift"] = float(x_shift)
            prep.attrs["crop_range"] = [float(x_crop[0]), float(x_crop[-1])]
            prep.attrs["normalization"] = normalization
            prep.attrs["clustering_method"] = method
            prep.attrs["despike"] = bool(despike)
            prep.attrs["despike_method"] = despike_method
            prep.attrs["despike_threshold"] = float(despike_threshold)
            prep.attrs["despike_window"] = int(despike_window)
            rgi2.create_dataset("decomposition/pca_scores", data=pca_scores)
            rgi2.create_dataset("decomposition/pca_components", data=pca.components_)
            rgi2.create_dataset("decomposition/pca_explained_variance", data=pca.explained_variance_ratio_)
            rgi2.create_dataset("decomposition/nmf_components", data=nmf_components)
            rgi2.create_dataset("decomposition/nmf_abundance", data=nmf_abundance)
            rgi2.create_dataset("clustering/cluster_labels", data=labels)
            rgi2.create_dataset("clustering/cluster_probabilities", data=probabilities)
            rgi2.create_dataset("clustering/representatives", data=representatives)
            rgi2.create_dataset("clustering/sizes", data=cluster_sizes)

        rep_spectra = []
        for cluster_id, rep_idx in enumerate(representatives):
            if rep_idx < 0:
                continue
            rep_spectra.append({
                "cluster_id": int(cluster_id),
                "pixel_index": int(rep_idx),
                "membership": float(probabilities[rep_idx, cluster_id]) if probabilities.ndim == 2 else 1.0,
                "wavenumbers": to_safe_float_list(x_crop),
                "intensity_raw": to_safe_float_list(x_raw[rep_idx]),
                "intensity_despiked": to_safe_float_list(x_clean[rep_idx]),
                "intensity_corr": to_safe_float_list(x_corr[rep_idx]),
                "baseline": to_safe_float_list(baselines[rep_idx]),
            })

        return {
            "success": True,
            "engine": "rgi2",
            "n_spectra": int(n_spectra),
            "n_clusters": int(n_clust),
            "clustering_method": method,
            "cluster_sizes": [int(v) for v in cluster_sizes],
            "representatives": [int(v) for v in representatives],
            "cluster_labels": [int(v) for v in labels],
            "cluster_probabilities": _clean_json_value(probabilities),
            "pca_explained_variance": to_safe_float_list(pca.explained_variance_ratio_),
            "nmf_components": _clean_json_value(nmf_components),
            "nmf_abundance": _clean_json_value(nmf_abundance),
            "rep_spectra": rep_spectra,
        }

    def fit_representative(
        self,
        cluster_id: int,
        peaks: List[dict],
        baseline_method: str = "asls",
        baseline_params: Optional[dict] = None,
        x_shift: float = 0.0,
        crop_range: Optional[List[float]] = None,
        despike: bool = False,
        despike_method: str = "whitaker_hayes",
        despike_threshold: float = 7.0,
        despike_window: int = 7,
    ) -> dict:
        wavenumbers, intensities = _read_spectrum_matrix(self.h5_path)
        with h5py.File(self.h5_path, "r") as f:
            reps = f[f"{RGI2_GROUP}/clustering/representatives"][:]
        if cluster_id < 0 or cluster_id >= len(reps):
            return {"success": False, "message": "Invalid RGI2 cluster id"}
        pixel_index = int(reps[cluster_id])
        if pixel_index < 0:
            return {"success": False, "message": "Cluster has no representative pixel"}
        result = fit_spectrum(
            wavenumbers,
            intensities[pixel_index],
            peaks,
            baseline_method=baseline_method,
            baseline_params=baseline_params or {},
            x_shift=x_shift,
            crop_range=tuple(crop_range) if crop_range else None,
            despike=despike,
            despike_method=despike_method,
            despike_threshold=despike_threshold,
            despike_window=despike_window,
        )
        result["pixel_index"] = pixel_index
        result["cluster_id"] = cluster_id
        return result

    def run_advanced_map_fit(
        self,
        peaks: List[dict],
        baseline_method: str = "asls",
        baseline_params: Optional[dict] = None,
        x_shift: float = 0.0,
        crop_range: Optional[List[float]] = None,
        threshold_snr: float = 3.0,
        threshold_r2: float = 0.85,
        cluster_models_override: Optional[Dict[int, List[dict]]] = None,
        cluster_fit_data: Optional[dict] = None,
        lambda_cluster: float = 0.5,
        spatial_mode: str = "edge-preserving",
        map_width: int = 0,
        map_height: int = 0,
        despike: bool = False,
        despike_method: str = "whitaker_hayes",
        despike_threshold: float = 7.0,
        despike_window: int = 7,
        progress_callback=None,
    ) -> dict:
        wavenumbers, intensities = _read_spectrum_matrix(self.h5_path)
        n_spectra = intensities.shape[0]
        with h5py.File(self.h5_path, "r") as f:
            labels = f[f"{RGI2_GROUP}/clustering/cluster_labels"][:]
            probabilities = f[f"{RGI2_GROUP}/clustering/cluster_probabilities"][:]

        priors = _cluster_priors_from_fits(cluster_fit_data, cluster_models_override)
        args_list = []
        for idx in range(n_spectra):
            cluster_id = int(labels[idx])
            pixel_peaks = peaks
            if cluster_models_override and cluster_id in cluster_models_override:
                pixel_peaks = cluster_models_override[cluster_id]
            args_list.append((
                idx,
                wavenumbers,
                intensities[idx],
                pixel_peaks,
                baseline_method,
                baseline_params or {},
                x_shift,
                crop_range,
                threshold_snr,
                threshold_r2,
                cluster_id,
                priors.get(cluster_id, {}),
                lambda_cluster,
                despike,
                despike_method,
                despike_threshold,
                despike_window,
            ))

        results: Dict[str, dict] = {}
        success_count = 0
        max_workers = min(os.cpu_count() or 4, 8)
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(_fit_pixel_with_priors, args) for args in args_list]
            completed = 0
            for future in as_completed(futures):
                res = future.result()
                results[str(res["idx"])] = res
                if res.get("success"):
                    success_count += 1
                completed += 1
                if progress_callback:
                    progress_callback(completed, n_spectra)

        first_success = next((v for v in results.values() if v.get("success") and v.get("values")), None)
        param_names = list(first_success.get("values", {}).keys()) if first_success else []
        r2_map = np.full(n_spectra, np.nan)
        rmse_map = np.full(n_spectra, np.nan)
        snr_map = np.full(n_spectra, np.nan)
        success_map = np.zeros(n_spectra, dtype=bool)
        status_labels = np.full(n_spectra, "failed", dtype=object)
        pixel_reasons = np.full(n_spectra, "unknown", dtype=object)
        rescued_map = np.zeros(n_spectra, dtype=bool)
        peak_maps = {name: np.full(n_spectra, np.nan) for name in param_names}
        peak_stderrs = {name: np.full(n_spectra, np.nan) for name in param_names}

        for idx in range(n_spectra):
            res = results[str(idx)]
            pixel_reasons[idx] = res.get("reason", "unknown")
            status_labels[idx] = res.get("status", "failed")
            snr_map[idx] = res.get("snr", np.nan)
            if res.get("success"):
                success_map[idx] = True
                r2_map[idx] = res.get("r_squared", np.nan)
                rmse_map[idx] = res.get("rmse", np.nan)
                for name in param_names:
                    peak_maps[name][idx] = res.get("values", {}).get(name, np.nan)
                    stderr = res.get("stderrs", {}).get(name, np.nan)
                    peak_stderrs[name][idx] = np.nan if stderr is None else stderr

        reliable_mask = success_map & np.isfinite(r2_map) & (r2_map >= threshold_r2) & np.isfinite(snr_map) & (snr_map >= threshold_snr)
        if spatial_mode and spatial_mode != "off" and param_names:
            edge_preserving = spatial_mode == "edge-preserving"
            for name in param_names:
                before = peak_maps[name].copy()
                peak_maps[name] = _smooth_1d_by_neighbors(peak_maps[name], reliable_mask, map_width, map_height, edge_preserving)
                rescued_map |= ~np.isfinite(before) & np.isfinite(peak_maps[name])

        cluster_confidence = np.max(probabilities, axis=1) if probabilities.ndim == 2 else np.ones(n_spectra)
        residual_structure = rmse_map / (np.nanmedian(rmse_map) + 1e-10)
        confidence = np.nan_to_num(r2_map, nan=0.0) * np.clip(np.nan_to_num(snr_map, nan=0.0) / 10.0, 0.0, 1.0) * cluster_confidence
        spatial_consistency = np.ones(n_spectra, dtype=float)
        if map_width > 1 and map_height > 0 and map_width * map_height >= n_spectra:
            for idx in range(n_spectra):
                y = idx // map_width
                x = idx % map_width
                neighbors = []
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    nidx = ny * map_width + nx
                    if 0 <= nx < map_width and 0 <= ny < map_height and nidx < n_spectra:
                        neighbors.append(labels[nidx] == labels[idx])
                spatial_consistency[idx] = float(np.mean(neighbors)) if neighbors else 1.0

        quality_classes = np.zeros(n_spectra, dtype=int)
        quality_classes[success_map & (r2_map < threshold_r2)] = 4
        quality_classes[success_map & (r2_map >= threshold_r2)] = 3
        scientific_results = build_scientific_results(
            peak_maps=peak_maps,
            peak_stderrs=peak_stderrs,
            success_map=success_map,
            r2_map=r2_map,
            snr_map=snr_map,
            quality_classes=quality_classes,
            snr_reliable_min=threshold_snr,
            r2_reliable_min=threshold_r2,
        )

        reason_summary: Dict[str, int] = {}
        for reason in pixel_reasons:
            reason_summary[str(reason)] = reason_summary.get(str(reason), 0) + 1
        interpretation_summary = build_interpretation_summary(
            n_spectra=n_spectra,
            success_count=success_count,
            quality_classes=quality_classes,
            reason_summary=reason_summary,
            scientific_results=scientific_results,
        )

        extra_maps = {
            "rgi2_confidence": confidence,
            "cluster_probability": cluster_confidence,
            "residual_structure": residual_structure,
            "spatially_rescued": rescued_map.astype(float),
            "spatial_consistency": spatial_consistency,
        }

        with h5py.File(self.h5_path, "r+") as f:
            rgi2 = f[RGI2_GROUP]
            if "fits" in rgi2:
                del rgi2["fits"]
            fits = rgi2.create_group("fits")
            fits.create_dataset("r2", data=r2_map)
            fits.create_dataset("rmse", data=rmse_map)
            fits.create_dataset("snr", data=snr_map)
            fits.create_dataset("success", data=success_map)
            fits.create_dataset("quality_class", data=quality_classes)
            fits.create_dataset("cluster_probability", data=cluster_confidence)
            fits.create_dataset("rgi2_confidence", data=confidence)
            fits.create_dataset("residual_structure", data=residual_structure)
            fits.create_dataset("spatially_rescued", data=rescued_map)
            fits.create_dataset("spatial_consistency", data=spatial_consistency)
            str_dtype = h5py.string_dtype(encoding="utf-8")
            fits.create_dataset("pixel_reasons", data=[str(v) for v in pixel_reasons], dtype=str_dtype)
            fits.create_dataset("status_labels", data=[str(v) for v in status_labels], dtype=str_dtype)
            for name in param_names:
                h5_name = name.replace(" ", "_")
                fits.create_dataset(f"maps/{h5_name}", data=peak_maps[name])
                fits.create_dataset(f"stderrs/{h5_name}", data=peak_stderrs[name])
            sci = fits.create_group("scientific")
            maps_grp = sci.create_group("maps")
            sci.create_dataset("reliable_mask", data=np.array(scientific_results["reliable_mask"], dtype=bool))
            sci.create_dataset("interpretable_mask", data=np.array(scientific_results["interpretable_mask"], dtype=bool))
            sci.create_dataset("analysis_mask", data=np.array(scientific_results["analysis_mask"], dtype=bool))
            sci.attrs["analysis_mask_type"] = scientific_results["analysis_mask_type"]
            for key, payload in scientific_results["scientific_maps"].items():
                values = np.array([np.nan if v is None else float(v) for v in payload["values"]], dtype=float)
                maps_grp.create_dataset(key, data=values)
                maps_grp[key].attrs["label"] = payload["label"]
            for key, values in extra_maps.items():
                maps_grp.create_dataset(key, data=values)
                maps_grp[key].attrs["label"] = key.replace("_", " ").title()
            sci.attrs["statistics_json"] = json.dumps(_clean_json_value(scientific_results["statistics"]))
            sci.attrs["histograms_json"] = json.dumps(_clean_json_value(scientific_results["histograms"]))
            sci.attrs["correlations_json"] = json.dumps(_clean_json_value(scientific_results["correlations"]))
            sci.attrs["interpretation_summary_json"] = json.dumps(_clean_json_value(interpretation_summary))
            fits.attrs["fit_config_json"] = json.dumps(_clean_json_value({
                "peaks": peaks,
                "baseline_method": baseline_method,
                "baseline_params": baseline_params or {},
                "x_shift": x_shift,
                "crop_range": crop_range,
                "threshold_snr": threshold_snr,
                "threshold_r2": threshold_r2,
                "lambda_cluster": lambda_cluster,
                "spatial_mode": spatial_mode,
                "despike": despike,
                "despike_method": despike_method,
                "despike_threshold": despike_threshold,
                "despike_window": despike_window,
            }))

        summary_results = {}
        for name in param_names:
            clean = name.replace(" ", "_")
            summary_results[clean] = _finite_or_none(peak_maps[name])
            summary_results[f"{clean}_stderr"] = _finite_or_none(peak_stderrs[name])
        for key, values in extra_maps.items():
            summary_results[key] = _finite_or_none(values)

        return {
            "success": True,
            "engine": "rgi2",
            "n_spectra": int(n_spectra),
            "success_count": int(success_count),
            "reliable_count": int(np.sum(reliable_mask)),
            "rescued_count": int(np.sum(rescued_map)),
            "r2_mean": float(np.nanmean(r2_map)) if np.any(np.isfinite(r2_map)) else 0.0,
            "r2": _finite_or_none(r2_map),
            "rmse": _finite_or_none(rmse_map),
            "snr": _finite_or_none(snr_map),
            "success_map": [bool(v) for v in success_map],
            "quality_classes": [int(v) for v in quality_classes],
            "status_labels": [str(v) for v in status_labels],
            "pixel_reasons": [str(v) for v in pixel_reasons],
            "reason_summary": reason_summary,
            "interpretation_summary": interpretation_summary,
            "results": summary_results,
            "cluster_labels": [int(v) for v in labels],
            **scientific_results,
        }

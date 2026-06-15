'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    Activity,
    AlertCircle,
    BarChart3,
    BookOpenText,
    BrainCircuit,
    CheckCircle2,
    Database,
    Download,
    Eye,
    Info,
    Loader2,
    Play,
    RefreshCw,
    Save,
    ShieldCheck,
    Sliders,
    SlidersHorizontal,
    Sparkles,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FittingPeakConfig, FittingPeakTable, PEAK_COLORS } from './fitting-peak-table';
import { SCIENCE_ENGINE_URL } from '@/lib/desktop';
import { valToRgb, getCssGradient } from './colormaps';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

const RESULT_VIEWS = [
    { value: 'map',           label: 'Map' },
    { value: 'metrics',       label: 'Metrics' },
    { value: 'histograms',    label: 'Histograms' },
    { value: 'relationships', label: 'Relationships' },
    { value: 'vector',        label: 'Vector Plot' },
    { value: 'graphene',      label: 'Graphene' },
    { value: 'analytics',     label: 'Analytics' },
    { value: 'inspect',       label: 'Inspect Fit' },
] as const;

type ResultView = typeof RESULT_VIEWS[number]['value'];

const QUALITY_CLASS_LABELS_RGI2: Record<number, { label: string; color: string; desc: string }> = {
    0: { label: 'Background / Substrate', color: '#64748b', desc: 'No graphene signal detected' },
    1: { label: 'Defect-rich Graphene',   color: '#f59e0b', desc: 'High D-band intensity (ID/IG > 0.4)' },
    2: { label: 'Monolayer Graphene',      color: '#6366f1', desc: 'Symmetric, narrow 2D band (FWHM < 32 cm⁻¹)' },
    3: { label: 'Multilayer Graphene',     color: '#8b5cf6', desc: 'Broadened 2D band shape (FWHM >= 32 cm⁻¹)' },
    4: { label: 'Low Confidence Fit',      color: '#ef4444', desc: 'Converged but poor fit quality (R² < 0.85)' },
};

const AXIS_RGI2 = {
    gridcolor: '#1e293b', zerolinecolor: '#334155', color: '#94a3b8',
    tickfont: { size: 10, color: '#94a3b8' },
};

const LAYOUT_BASE_RGI2 = {
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#080d16',
    font: { family: 'Inter, sans-serif', size: 10, color: '#94a3b8' },
    margin: { l: 55, r: 20, t: 10, b: 40 },
    xaxis: { ...AXIS_RGI2 },
    yaxis: { ...AXIS_RGI2 },
};

type Stage = 1 | 2 | 3 | 4;
type Status = 'idle' | 'modeling' | 'fitting_rep' | 'mapping' | 'saving';
type ClusteringMethod = 'gmm' | 'kmeans' | 'nmf';
type SpatialMode = 'off' | 'smooth' | 'edge-preserving';
type RepresentativeTraceKey = 'raw' | 'despiked' | 'corrected' | 'baseline' | 'bestFit' | 'components' | 'residuals';

const DEFAULT_TRACE_VISIBILITY: Record<RepresentativeTraceKey, boolean> = {
    raw: true,
    despiked: true,
    corrected: true,
    baseline: true,
    bestFit: true,
    components: true,
    residuals: true,
};

const TRACE_TOGGLES: { key: RepresentativeTraceKey; label: string; color: string }[] = [
    { key: 'raw', label: 'Raw', color: '#64748b' },
    { key: 'despiked', label: 'Despiked', color: '#38bdf8' },
    { key: 'corrected', label: 'Corrected', color: '#34d399' },
    { key: 'baseline', label: 'Baseline', color: '#f59e0b' },
    { key: 'bestFit', label: 'Best Fit', color: '#f8fafc' },
    { key: 'components', label: 'Peaks', color: '#a78bfa' },
    { key: 'residuals', label: 'Residual', color: '#fb7185' },
];

interface Props {
    vaultRoot: string;
    h5Path: string;
    mapWidth: number;
    mapHeight: number;
    stepSize?: number;
    nSpectra: number;
    onFileCreated?: (file: any) => void;
}

const baselineParams = { lam: 1e5, p: 0.01, order: 2 };

function defaultGraphenePeaks(clusterId: number): FittingPeakConfig[] {
    return [
        {
            id: `rgi2_${clusterId}_D`,
            name: 'D',
            model: 'Lorentzian',
            center: 1347,
            center_min: 1310,
            center_max: 1385,
            fwhm_init: 32,
            amplitude: 120,
            active: true,
            use_limits: true,
            fixedParams: {},
            minParams: {},
            maxParams: {},
            exprParams: {},
        },
        {
            id: `rgi2_${clusterId}_G`,
            name: 'G',
            model: 'Lorentzian',
            center: 1585,
            center_min: 1540,
            center_max: 1625,
            fwhm_init: 18,
            amplitude: 600,
            active: true,
            use_limits: true,
            fixedParams: {},
            minParams: {},
            maxParams: {},
            exprParams: {},
        },
        {
            id: `rgi2_${clusterId}_2D`,
            name: '2D',
            model: 'Lorentzian',
            center: 2680,
            center_min: 2620,
            center_max: 2740,
            fwhm_init: 30,
            amplitude: 850,
            active: true,
            use_limits: true,
            fixedParams: {},
            minParams: {},
            maxParams: {},
            exprParams: {},
        },
    ];
}

function safeGrid(values: any[] | undefined, width: number, height: number, total: number) {
    const safeN = Math.max(1, total || values?.length || 1);
    const w = width > 0 ? width : Math.ceil(Math.sqrt(safeN));
    const h = height > 0 ? height : Math.ceil(safeN / w);
    const rows: any[][] = [];
    for (let y = 0; y < h; y++) {
        const row: any[] = [];
        for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            row.push(idx < safeN ? values?.[idx] ?? null : null);
        }
        rows.push(row);
    }
    return { z: rows, w, h };
}

function Metric({ label, value, tone = 'emerald' }: { label: string; value: string | number; tone?: 'emerald' | 'cyan' | 'amber' | 'rose' }) {
    const color = {
        emerald: 'text-emerald-300',
        cyan: 'text-cyan-300',
        amber: 'text-amber-300',
        rose: 'text-rose-300',
    }[tone];
    return (
        <div className="border border-slate-800 bg-slate-950/70 rounded-lg px-3 py-2 min-w-0">
            <div className="text-[9px] font-black uppercase tracking-wider text-slate-500 truncate">{label}</div>
            <div className={cn('text-sm font-black mt-1 truncate', color)}>{value}</div>
        </div>
    );
}

export function Rgi2View({ vaultRoot, h5Path, mapWidth, mapHeight, stepSize = 1, nSpectra, onFileCreated }: Props) {
    const [stage, setStage] = useState<Stage>(1);
    const [status, setStatus] = useState<Status>('idle');
    const [activePath, setActivePath] = useState(h5Path);
    const [fitProgress, setFitProgress] = useState<{ completed: number; total: number; active: boolean } | null>(null);

    const [cropMin, setCropMin] = useState(1100);
    const [cropMax, setCropMax] = useState(3100);
    const [baselineMethod, setBaselineMethod] = useState('asls');
    const [normalization, setNormalization] = useState('vector');
    const [despike, setDespike] = useState(false);
    const [despikeMethod, setDespikeMethod] = useState('whitaker_hayes');
    const [despikeThreshold, setDespikeThreshold] = useState(7);
    const [despikeWindow, setDespikeWindow] = useState(7);
    const [clusteringMethod, setClusteringMethod] = useState<ClusteringMethod>('gmm');
    const [nPCAComponents, setNPCAComponents] = useState(5);
    const [nNMFComponents, setNNMFComponents] = useState(3);
    const [nClusters, setNClusters] = useState(4);
    const [thresholdSNR, setThresholdSNR] = useState(3);
    const [thresholdR2, setThresholdR2] = useState(0.85);
    const [lambdaCluster, setLambdaCluster] = useState(0.5);
    const [spatialMode, setSpatialMode] = useState<SpatialMode>('edge-preserving');

    const [modelData, setModelData] = useState<any | null>(null);
    const [activeCluster, setActiveCluster] = useState(0);
    const [clusterPeaks, setClusterPeaks] = useState<Record<number, FittingPeakConfig[]>>({});
    const [clusterFitData, setClusterFitData] = useState<Record<number, any>>({});
    const [mapFitResult, setMapFitResult] = useState<any | null>(null);
    const [selectedMapKey, setSelectedMapKey] = useState('rgi2_confidence');
    const [traceVisibility, setTraceVisibility] = useState<Record<RepresentativeTraceKey, boolean>>(DEFAULT_TRACE_VISIBILITY);
    const [addPeakByClick, setAddPeakByClick] = useState(false);
    const [showInfoNote, setShowInfoNote] = useState(false);
    const representativePlotRef = useRef<any>(null);
    const representativePlotContainerRef = useRef<HTMLDivElement | null>(null);

    // Stage 4 result views
    const [resultsView, setResultsView] = useState<ResultView>('map');
    const [selectedHistogramKey, setSelectedHistogramKey] = useState<string>('pos_G');
    const [scatterXKey, setScatterXKey] = useState<string>('pos_G');
    const [scatterYKey, setScatterYKey] = useState<string>('pos_2D');

    // Pixel Fit Inspector
    const [selectedPixelIndex, setSelectedPixelIndex] = useState<number | null>(null);
    const [pixelFitData, setPixelFitData] = useState<any | null>(null);
    const [isLoadingPixelFit, setIsLoadingPixelFit] = useState<boolean>(false);
    const [fitError, setFitError] = useState<string | null>(null);

    useEffect(() => {
        setActivePath(h5Path);
        setStage(1);
        setModelData(null);
        setClusterPeaks({});
        setClusterFitData({});
        setMapFitResult(null);
        setSelectedMapKey('rgi2_confidence');

        if (!vaultRoot || !h5Path) return;
        let cancelled = false;
        async function loadSaved() {
            try {
                const res = await fetch(`${SCIENCE_ENGINE_URL}/api/rgi2/load-results`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vault_root: vaultRoot, h5_relative_path: h5Path }),
                });
                const data = await res.json();
                if (cancelled || !data.success || !data.session_data) return;
                const session = data.session_data;
                setActivePath(session.activePath || h5Path);
                setCropMin(session.cropMin ?? 1100);
                setCropMax(session.cropMax ?? 3100);
                setBaselineMethod(session.baselineMethod ?? 'asls');
                setNormalization(session.normalization ?? 'vector');
                setDespike(session.despike ?? false);
                setDespikeMethod(session.despikeMethod ?? 'whitaker_hayes');
                setDespikeThreshold(session.despikeThreshold ?? 7);
                setDespikeWindow(session.despikeWindow ?? 7);
                setTraceVisibility({ ...DEFAULT_TRACE_VISIBILITY, ...(session.traceVisibility ?? {}) });
                setAddPeakByClick(session.addPeakByClick ?? false);
                setClusteringMethod(session.clusteringMethod ?? 'gmm');
                setNPCAComponents(session.nPCAComponents ?? 5);
                setNNMFComponents(session.nNMFComponents ?? 3);
                setNClusters(session.nClusters ?? 4);
                setThresholdSNR(session.thresholdSNR ?? 3);
                setThresholdR2(session.thresholdR2 ?? 0.85);
                setLambdaCluster(session.lambdaCluster ?? 0.5);
                setSpatialMode(session.spatialMode ?? 'edge-preserving');
                setModelData(session.modelData ?? null);
                setClusterPeaks(session.clusterPeaks ?? {});
                setClusterFitData(session.clusterFitData ?? {});
                setMapFitResult(session.mapFitResult ?? null);
                setStage(session.mapFitResult ? 4 : session.modelData ? 2 : 1);
                if (session.mapFitResult) {
                    const mfr = session.mapFitResult;
                    setSelectedHistogramKey(mfr.histograms?.pos_G ? 'pos_G' : Object.keys(mfr.histograms || {})[0] || 'pos_G');
                    setScatterXKey(mfr.scientific_maps?.pos_G ? 'pos_G' : Object.keys(mfr.scientific_maps || {})[0] || 'pos_G');
                    setScatterYKey(mfr.scientific_maps?.pos_2D ? 'pos_2D' : Object.keys(mfr.scientific_maps || {})[1] || 'pos_2D');
                }
            } catch {
                // Saved sessions are optional.
            }
        }
        loadSaved();
        return () => {
            cancelled = true;
        };
    }, [h5Path, vaultRoot]);

    // Pixel Fit Inspector effect (fetches /api/fitting/fit-pixel when pixel is selected)
    useEffect(() => {
        if (selectedPixelIndex === null || !vaultRoot || !activePath || !mapFitResult) {
            setPixelFitData(null);
            setFitError(null);
            return;
        }
        let active = true;
        const fetchFit = async () => {
            setIsLoadingPixelFit(true);
            setFitError(null);
            try {
                const fitConfig = mapFitResult.fit_config || {};
                const peaks = clusterPeaks[0] || fitConfig.peaks || [];
                const res = await fetch(`${SCIENCE_ENGINE_URL}/api/fitting/fit-pixel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vault_root: vaultRoot,
                        h5_relative_path: activePath,
                        spectrum_index: selectedPixelIndex,
                        peaks,
                        baseline_method: fitConfig.baseline_method || baselineMethod,
                        baseline_params: fitConfig.baseline_params || { lam: 1e5, p: 0.01, order: 2 },
                        x_shift: fitConfig.x_shift || 0.0,
                        crop_range: fitConfig.crop_range || [cropMin, cropMax],
                        despike: fitConfig.despike ?? despike,
                        despike_method: fitConfig.despike_method || despikeMethod,
                        despike_threshold: fitConfig.despike_threshold ?? despikeThreshold,
                        despike_window: fitConfig.despike_window ?? despikeWindow,
                    })
                });
                const data = await res.json();
                if (active) {
                    if (res.ok && data.success !== false) {
                        setPixelFitData(data);
                    } else {
                        setFitError(data.message || data.detail || 'Fitting failed to converge');
                        setPixelFitData(data);
                    }
                }
            } catch (err: any) {
                if (active) setFitError(err.message || 'Connection failed');
            } finally {
                if (active) setIsLoadingPixelFit(false);
            }
        };
        fetchFit();
        return () => { active = false; };
    }, [selectedPixelIndex, vaultRoot, activePath, mapFitResult, clusterPeaks, baselineMethod, despike, despikeMethod, despikeThreshold, despikeWindow, cropMin, cropMax]);

    const activePeaks = clusterPeaks[activeCluster] || [];
    const activeRepresentative = useMemo(() => {
        return modelData?.rep_spectra?.find((rep: any) => rep.cluster_id === activeCluster) || null;
    }, [modelData, activeCluster]);
    const activeClusterFit = clusterFitData[activeCluster];

    const clusterTrace = useMemo(() => {
        if (!modelData?.cluster_labels) return [];
        const { z } = safeGrid(modelData.cluster_labels, mapWidth, mapHeight, modelData.n_spectra || nSpectra);
        return [{
            z,
            type: 'heatmap',
            colorscale: 'Viridis',
            showscale: true,
            hovertemplate: 'X:%{x}<br>Y:%{y}<br>Cluster:%{z}<extra></extra>',
        }];
    }, [modelData, mapWidth, mapHeight, nSpectra]);

    const selectedMapValues = useMemo(() => {
        if (!mapFitResult) return [];
        if (mapFitResult.results?.[selectedMapKey]) return mapFitResult.results[selectedMapKey];
        if (mapFitResult.scientific_maps?.[selectedMapKey]?.values) return mapFitResult.scientific_maps[selectedMapKey].values;
        return mapFitResult.r2 || [];
    }, [mapFitResult, selectedMapKey]);

    const mapTrace = useMemo(() => {
        if (!mapFitResult) return [];
        const { z } = safeGrid(selectedMapValues, mapWidth, mapHeight, mapFitResult.n_spectra || nSpectra);
        return [{
            z,
            type: 'heatmap',
            colorscale: selectedMapKey.includes('confidence') ? 'Viridis' : 'Turbo',
            showscale: true,
            hovertemplate: 'X:%{x}<br>Y:%{y}<br>Value:%{z}<extra></extra>',
        }];
    }, [mapFitResult, selectedMapValues, mapWidth, mapHeight, nSpectra, selectedMapKey]);

    const mapKeys = useMemo(() => {
        if (!mapFitResult) return [];
        const resultKeys = Object.keys(mapFitResult.results || {});
        const scientificKeys = Object.keys(mapFitResult.scientific_maps || {});
        return Array.from(new Set(['rgi2_confidence', 'cluster_probability', 'spatial_consistency', 'residual_structure', 'pos_G', 'pos_2D', 'ID_IG_height', ...resultKeys, ...scientificKeys]));
    }, [mapFitResult]);

    // ── Scientific maps for Stage 4 visualisations ──────────────────────────
    const scientificMapSeries = useMemo(() => {
        if (!mapFitResult?.scientific_maps) return {} as Record<string, { label: string; values: Array<number | null> }>;
        return mapFitResult.scientific_maps as Record<string, { label: string; values: Array<number | null> }>;
    }, [mapFitResult]);

    const histogramOptions = useMemo(() => {
        return Object.entries(mapFitResult?.histograms || {}).map(([key, val]: [string, any]) => ({
            key,
            label: val.label || key.replace(/_/g, ' ')
        }));
    }, [mapFitResult]);

    const relationshipMetricOptions = useMemo(() => {
        return Object.entries(scientificMapSeries).map(([key, payload]) => ({
            key,
            label: payload.label || key.replace(/_/g, ' ')
        }));
    }, [scientificMapSeries]);

    const histogramStats = useMemo(() => {
        const key = selectedHistogramKey || histogramOptions[0]?.key;
        return mapFitResult?.statistics?.[key] || null;
    }, [mapFitResult, selectedHistogramKey, histogramOptions]);

    const histogramTrace = useMemo(() => {
        const key = selectedHistogramKey || histogramOptions[0]?.key;
        const histogram = mapFitResult?.histograms?.[key];
        if (!histogram || !histogram.bin_centers?.length) return [];
        const traces: any[] = [{
            type: 'bar' as const,
            x: histogram.bin_centers,
            y: histogram.counts,
            marker: { color: histogram.bin_centers.map(() => '#10b981'), opacity: 0.75, line: { color: '#059669', width: 0.5 } },
            name: histogram.label || key,
            hovertemplate: '%{x:.3f}<br>Count: %{y}<extra></extra>',
        }];
        const st = mapFitResult?.statistics?.[key];
        if (st?.mean != null && st?.std != null && st.std > 0 && histogram.bin_edges?.length > 1) {
            const mean = st.mean as number;
            const std = st.std as number;
            const totalCount = (histogram.counts as number[]).reduce((a: number, b: number) => a + b, 0);
            const binWidth = (histogram.bin_edges[histogram.bin_edges.length - 1] - histogram.bin_edges[0]) / (histogram.bin_edges.length - 1);
            const xMin = histogram.bin_edges[0];
            const xMax = histogram.bin_edges[histogram.bin_edges.length - 1];
            const nPts = 120;
            const xCurve: number[] = [];
            const yCurve: number[] = [];
            for (let i = 0; i <= nPts; i++) {
                const xi = xMin + (i / nPts) * (xMax - xMin);
                const gaussian = (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((xi - mean) / std) ** 2);
                xCurve.push(xi);
                yCurve.push(gaussian * totalCount * binWidth);
            }
            traces.push({ type: 'scatter', mode: 'lines', x: xCurve, y: yCurve, line: { color: '#f59e0b', width: 2 }, name: 'Normal fit', hovertemplate: '%{x:.3f}<br>Normal: %{y:.1f}<extra></extra>' });
            const maxCount = Math.max(...(histogram.counts as number[]));
            traces.push({ type: 'scatter', mode: 'lines', x: [mean, mean], y: [0, maxCount * 1.05], line: { color: '#f59e0b', width: 1.5, dash: 'dash' }, name: `Mean: ${mean.toFixed(3)}`, hoverinfo: 'skip' });
        }
        return traces;
    }, [mapFitResult, selectedHistogramKey, histogramOptions]);

    const relationshipTrace = useMemo(() => {
        const xSeries = scientificMapSeries[scatterXKey]?.values || [];
        const ySeries = scientificMapSeries[scatterYKey]?.values || [];
        const reliableMask = mapFitResult?.analysis_mask || mapFitResult?.interpretable_mask || mapFitResult?.reliable_mask || [];
        const x: number[] = [], y: number[] = [], text: string[] = [];
        for (let i = 0; i < Math.min(xSeries.length, ySeries.length); i++) {
            const xv = xSeries[i], yv = ySeries[i];
            const reliable = reliableMask.length === 0 ? true : reliableMask[i];
            if (reliable && typeof xv === 'number' && typeof yv === 'number' && Number.isFinite(xv) && Number.isFinite(yv)) {
                x.push(xv); y.push(yv); text.push(`Pixel #${i}`);
            }
        }
        return [{ type: 'scattergl' as const, mode: 'markers', x, y, text, hoverinfo: 'text+x+y', marker: { color: '#38bdf8', size: 7, opacity: 0.72, line: { color: '#0f172a', width: 0.5 } }, name: 'Analysis pixels' } as any];
    }, [mapFitResult, scientificMapSeries, scatterXKey, scatterYKey]);

    const correlationTrace = useMemo(() => {
        const corr = mapFitResult?.correlations;
        if (!corr?.pearson) return [];
        return [{ type: 'heatmap' as const, z: corr.pearson, x: corr.labels, y: corr.labels, zmin: -1, zmax: 1, colorscale: 'RdBu', reversescale: true, hovertemplate: '%{y} vs %{x}<br>Pearson: %{z:.3f}<extra></extra>', colorbar: { tickfont: { color: '#94a3b8', size: 9 }, title: { text: 'r', font: { color: '#94a3b8', size: 9 } } } } as any];
    }, [mapFitResult]);

    const handlePixelClickRgi2 = useCallback((eventData: any) => {
        if (!eventData?.points?.[0] || !mapFitResult) return;
        const pt = eventData.points[0];
        let col = Math.floor(pt.x), row = Math.floor(pt.y);
        if (Array.isArray(pt.pointNumber)) { row = pt.pointNumber[0]; col = pt.pointNumber[1]; }
        else if (Array.isArray(pt.pointIndex)) { row = pt.pointIndex[0]; col = pt.pointIndex[1]; }
        else if (pt.pointNumber !== undefined && Number.isInteger(Number(pt.pointNumber))) {
            const fi = Number(pt.pointNumber); row = Math.floor(fi / mapWidth); col = fi % mapWidth;
        }
        row = Math.max(0, Math.min(mapHeight - 1, Math.round(row)));
        col = Math.max(0, Math.min(mapWidth - 1, Math.round(col)));
        const idx = row * mapWidth + col;
        const total = mapFitResult.n_spectra || nSpectra;
        if (idx >= 0 && idx < total) setSelectedPixelIndex(idx);
    }, [mapWidth, mapHeight, nSpectra, mapFitResult]);

    const representativeTrace = useMemo(() => {
        const traces: any[] = [];
        const rep = activeRepresentative;
        const fit = activeClusterFit;

        if (rep?.wavenumbers?.length) {
            if (traceVisibility.raw) {
                traces.push({
                    x: rep.wavenumbers,
                    y: rep.intensity_raw,
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Raw',
                    line: { color: '#64748b', width: 1 },
                });
            }
            if (despike && traceVisibility.despiked && rep.intensity_despiked) {
                traces.push({
                    x: rep.wavenumbers,
                    y: rep.intensity_despiked,
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Despiked',
                    line: { color: '#38bdf8', width: 1.3 },
                });
            }
            if (traceVisibility.corrected) {
                traces.push({
                    x: rep.wavenumbers,
                    y: rep.intensity_corr,
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Corrected',
                    line: { color: '#34d399', width: 1.5 },
                });
            }
            if (traceVisibility.baseline) {
                traces.push({
                    x: rep.wavenumbers,
                    y: rep.baseline,
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Baseline',
                    line: { color: '#f59e0b', width: 1, dash: 'dot' },
                });
            }
        }

        if (traceVisibility.bestFit && fit?.best_fit?.length) {
            traces.push({
                x: fit.best_fit.map((p: any) => p.x),
                y: fit.best_fit.map((p: any) => p.y),
                type: 'scatter',
                mode: 'lines',
                name: 'Best Fit',
                line: { color: '#f8fafc', width: 2 },
            });
        }

        if (traceVisibility.components && fit?.components) {
            Object.entries(fit.components).forEach(([name, points], idx) => {
                const pts = points as any[];
                traces.push({
                    x: pts.map(p => p.x),
                    y: pts.map(p => p.y),
                    type: 'scatter',
                    mode: 'lines',
                    name: name.replace(/_$/, ''),
                    line: { width: 1, dash: 'dash', color: ['#f97316', '#a78bfa', '#22d3ee', '#f472b6'][idx % 4] },
                    opacity: 0.75,
                });
            });
        }

        if (traceVisibility.residuals && fit?.residuals?.length) {
            const residualX = fit.residuals.map((p: any) => p.x);
            const residualY = fit.residuals.map((p: any) => p.y);
            const residualStd = Number(fit.metrics?.residual_std ?? fit.noise?.std ?? 0);
            if (Number.isFinite(residualStd) && residualStd > 0) {
                traces.push({
                    x: residualX,
                    y: residualX.map(() => residualStd),
                    type: 'scatter',
                    mode: 'lines',
                    name: '+Noise',
                    yaxis: 'y2',
                    line: { color: 'rgba(251,113,133,0)', width: 0 },
                    hoverinfo: 'skip',
                    showlegend: false,
                });
                traces.push({
                    x: residualX,
                    y: residualX.map(() => -residualStd),
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Noise Band',
                    yaxis: 'y2',
                    fill: 'tonexty',
                    fillcolor: 'rgba(251,113,133,0.14)',
                    line: { color: 'rgba(251,113,133,0)', width: 0 },
                    hoverinfo: 'skip',
                    showlegend: false,
                });
            }
            traces.push({
                x: residualX,
                y: residualY,
                type: 'scatter',
                mode: 'lines',
                name: 'Residual',
                yaxis: 'y2',
                line: { color: '#fb7185', width: 1 },
            });
            traces.push({
                x: residualX,
                y: residualX.map(() => 0),
                type: 'scatter',
                mode: 'lines',
                name: 'Zero Residual',
                yaxis: 'y2',
                line: { color: '#64748b', width: 1, dash: 'dot' },
                hoverinfo: 'skip',
                showlegend: false,
            });
        }

        return traces;
    }, [activeRepresentative, activeClusterFit, despike, traceVisibility]);

    const representativeMarkers = useMemo(() => {
        const active = activePeaks.filter(peak => peak.active);
        return {
            shapes: active.map((peak, idx) => ({
                type: 'line' as const,
                xref: 'x' as const,
                yref: 'paper' as const,
                x0: peak.center,
                x1: peak.center,
                y0: 0.25,
                y1: 1,
                line: {
                    color: PEAK_COLORS[idx % PEAK_COLORS.length],
                    width: 1,
                    dash: 'dot' as const,
                },
            })),
            annotations: active.map((peak, idx) => ({
                x: peak.center,
                y: 1.01,
                xref: 'x' as const,
                yref: 'paper' as const,
                text: `${peak.name} ${Math.round(peak.center)}`,
                showarrow: false,
                font: { size: 9, color: PEAK_COLORS[idx % PEAK_COLORS.length] },
                bgcolor: 'rgba(2,6,23,0.75)',
                bordercolor: 'rgba(51,65,85,0.9)',
                borderwidth: 1,
                borderpad: 2,
            })),
        };
    }, [activePeaks]);

    const fitSummary = useMemo(() => {
        const metrics = activeClusterFit?.metrics || {};
        const fmt = (value: any, digits = 3) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-';
        return {
            r2: fmt(metrics.r_squared, 4),
            rmse: fmt(metrics.rmse, 3),
            residualStd: fmt(metrics.residual_std, 3),
            residualToSignal: fmt(metrics.residual_to_signal_pct, 2),
        };
    }, [activeClusterFit]);

    const toggleTraceVisibility = (key: RepresentativeTraceKey) => {
        setTraceVisibility(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const setActiveClusterPeaks = (peaks: FittingPeakConfig[], clearFit = true) => {
        setClusterPeaks(prev => ({
            ...prev,
            [activeCluster]: peaks,
        }));
        if (clearFit) {
            setClusterFitData(prev => {
                if (!prev[activeCluster]) return prev;
                const next = { ...prev };
                delete next[activeCluster];
                return next;
            });
        }
    };

    const estimateRepresentativeAmplitude = (center: number) => {
        const x = activeRepresentative?.wavenumbers || [];
        const y = activeRepresentative?.intensity_corr || activeRepresentative?.intensity_despiked || activeRepresentative?.intensity_raw || [];
        if (!x.length || !y.length) return 100;
        let bestIdx = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        x.forEach((value: number, idx: number) => {
            const dist = Math.abs(Number(value) - center);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = idx;
            }
        });
        const local = y.slice(Math.max(0, bestIdx - 4), Math.min(y.length, bestIdx + 5)).map((value: any) => Number(value)).filter(Number.isFinite);
        const amplitude = local.length ? Math.max(...local) : Number(y[bestIdx]);
        return Number.isFinite(amplitude) ? Math.max(Math.round(Math.abs(amplitude) * 100) / 100, 1) : 100;
    };

    const addPeakAtCenter = (centerValue: number) => {
        const center = Math.round(centerValue * 100) / 100;
        const nextIndex = activePeaks.length + 1;
        const amplitude = estimateRepresentativeAmplitude(center);
        const newPeak: FittingPeakConfig = {
            id: `rgi2_${activeCluster}_manual_${Date.now()}`,
            name: `P${nextIndex}`,
            model: 'Lorentzian',
            center,
            center_min: Math.round((center - 30) * 100) / 100,
            center_max: Math.round((center + 30) * 100) / 100,
            fwhm_init: 24,
            amplitude,
            active: true,
            use_limits: true,
            fixedParams: {},
            minParams: {},
            maxParams: {},
            exprParams: {},
        };
        setActiveClusterPeaks([...(clusterPeaks[activeCluster] || []), newPeak]);
        toast.success(`Peak added at ${center} cm-1`);
    };

    const handleRepresentativePlotAreaClick = (event: any) => {
        if (!addPeakByClick || busy || !activeRepresentative) return;
        event.preventDefault?.();
        event.stopPropagation?.();
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('.modebar, .legend, .annotation')) return;

        const graphDiv = representativePlotRef.current;
        const xaxis = graphDiv?._fullLayout?.xaxis;
        const yaxis = graphDiv?._fullLayout?.yaxis;
        const container = representativePlotContainerRef.current;
        const rect = graphDiv?.getBoundingClientRect?.() || container?.getBoundingClientRect?.();
        if (!rect) return;

        let xValue: number | null = null;

        if (xaxis && yaxis) {
            const axisOffset = Number(xaxis._offset);
            const axisLength = Number(xaxis._length);
            const yOffset = Number(yaxis._offset);
            const yLength = Number(yaxis._length);
            const plotX = event.clientX - rect.left - (Number.isFinite(axisOffset) ? axisOffset : 55);
            const plotY = event.clientY - rect.top - (Number.isFinite(yOffset) ? yOffset : 22);
            const plotWidth = Number.isFinite(axisLength) && axisLength > 0 ? axisLength : Math.max(rect.width - 75, 1);
            const plotHeight = Number.isFinite(yLength) && yLength > 0 ? yLength : Math.max(rect.height - 64, 1);

            if (plotY >= 0 && plotY <= plotHeight) {
                const clampedX = Math.min(Math.max(plotX, 0), plotWidth);
                const converted = Number(typeof xaxis.p2l === 'function'
                    ? xaxis.p2l(clampedX)
                    : xaxis.range?.[0] + (clampedX / plotWidth) * (xaxis.range?.[1] - xaxis.range?.[0]));
                if (Number.isFinite(converted)) xValue = converted;
            }
        }

        if (xValue === null) {
            const wavenumbers = (activeRepresentative?.wavenumbers || []).map((value: any) => Number(value)).filter(Number.isFinite);
            if (!wavenumbers.length) return;
            const rangeMin = Number(xaxis?.range?.[0]);
            const rangeMax = Number(xaxis?.range?.[1]);
            const xmin = Number.isFinite(rangeMin) ? rangeMin : Math.min(...wavenumbers);
            const xmax = Number.isFinite(rangeMax) ? rangeMax : Math.max(...wavenumbers);
            const plotLeft = 55;
            const plotRight = 20;
            const plotWidth = Math.max(rect.width - plotLeft - plotRight, 1);
            const plotX = Math.min(Math.max(event.clientX - rect.left - plotLeft, 0), plotWidth);
            xValue = xmin + (plotX / plotWidth) * (xmax - xmin);
        }

        if (!Number.isFinite(xValue)) return;
        addPeakAtCenter(xValue);
    };

    const runMapModel = async () => {
        setStatus('modeling');
        try {
            const res = await fetch(`${SCIENCE_ENGINE_URL}/api/rgi2/build-map-model`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_path: activePath,
                    crop_range: [cropMin, cropMax],
                    baseline_method: baselineMethod,
                    baseline_params: baselineParams,
                    despike,
                    despike_method: despikeMethod,
                    despike_threshold: despikeThreshold,
                    despike_window: despikeWindow,
                    n_components_pca: nPCAComponents,
                    n_components_nmf: nNMFComponents,
                    n_clusters: nClusters,
                    normalization,
                    clustering_method: clusteringMethod,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.detail || data.message || 'RGI2 map model failed');
            }
            if (data.h5_relative_path && data.h5_relative_path !== activePath) {
                setActivePath(data.h5_relative_path);
                if (data.file_details) onFileCreated?.(data.file_details);
            }
            setModelData(data);
            const seeds: Record<number, FittingPeakConfig[]> = {};
            for (let i = 0; i < data.n_clusters; i++) seeds[i] = defaultGraphenePeaks(i);
            setClusterPeaks(seeds);
            setActiveCluster(0);
            setStage(2);
            toast.success('RGI2 map model created on isolated copy');
        } catch (err: any) {
            toast.error(err.message || 'RGI2 map model failed');
        } finally {
            setStatus('idle');
        }
    };

    const fitRepresentative = async () => {
        if (!activePeaks.length) {
            toast.warning('Add at least one peak for this cluster');
            return;
        }
        setStatus('fitting_rep');
        try {
            const res = await fetch(`${SCIENCE_ENGINE_URL}/api/rgi2/fit-representatives`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_path: activePath,
                    cluster_id: activeCluster,
                    peaks: activePeaks,
                    baseline_method: baselineMethod,
                    baseline_params: baselineParams,
                    crop_range: [cropMin, cropMax],
                    despike,
                    despike_method: despikeMethod,
                    despike_threshold: despikeThreshold,
                    despike_window: despikeWindow,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.detail || data.message || 'Representative fit failed');
            }
            setClusterFitData(prev => ({ ...prev, [activeCluster]: data }));
            setClusterPeaks(prev => ({
                ...prev,
                [activeCluster]: activePeaks.map(peak => {
                    const safe = peak.name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, 'p_$1');
                    const center = data.parameters?.find((p: any) => p.name === `${safe}_center`);
                    const fwhm = data.parameters?.find((p: any) => p.name === `${safe}_fwhm`);
                    const amp = data.parameters?.find((p: any) => p.name === `${safe}_amplitude`);
                    const nextCenter = center ? Math.round(center.value * 100) / 100 : peak.center;
                    const previousHalfWindow = Math.max(
                        Math.abs(Number(peak.center) - Number(peak.center_min)),
                        Math.abs(Number(peak.center_max) - Number(peak.center)),
                        30
                    );
                    const nextMinParams = { ...(peak.minParams || {}) };
                    const nextMaxParams = { ...(peak.maxParams || {}) };
                    if (nextMinParams.center !== undefined) nextMinParams.center = Math.round((nextCenter - previousHalfWindow) * 100) / 100;
                    if (nextMaxParams.center !== undefined) nextMaxParams.center = Math.round((nextCenter + previousHalfWindow) * 100) / 100;
                    return {
                        ...peak,
                        center: nextCenter,
                        center_min: Math.round((nextCenter - previousHalfWindow) * 100) / 100,
                        center_max: Math.round((nextCenter + previousHalfWindow) * 100) / 100,
                        fwhm_init: fwhm ? Math.round(fwhm.value * 100) / 100 : peak.fwhm_init,
                        amplitude: amp ? Math.round(amp.value * 100) / 100 : peak.amplitude,
                        minParams: nextMinParams,
                        maxParams: nextMaxParams,
                    };
                }),
            }));
            toast.success(`Cluster ${activeCluster} prior updated`);
        } catch (err: any) {
            toast.error(err.message || 'Representative fit failed');
        } finally {
            setStatus('idle');
        }
    };

    const runAdvancedFit = async () => {
        setStatus('mapping');
        setFitProgress({ completed: 0, total: nSpectra, active: true });
        const intervalId = window.setInterval(async () => {
            try {
                const res = await fetch(`${SCIENCE_ENGINE_URL}/api/rgi2/fit-progress`);
                setFitProgress(await res.json());
            } catch {
                // Progress is best-effort.
            }
        }, 500);

        try {
            const res = await fetch(`${SCIENCE_ENGINE_URL}/api/rgi2/run-advanced-map-fit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_path: activePath,
                    peaks: clusterPeaks[0] || defaultGraphenePeaks(0),
                    baseline_method: baselineMethod,
                    baseline_params: baselineParams,
                    crop_range: [cropMin, cropMax],
                    despike,
                    despike_method: despikeMethod,
                    despike_threshold: despikeThreshold,
                    despike_window: despikeWindow,
                    threshold_snr: thresholdSNR,
                    threshold_r2: thresholdR2,
                    cluster_models_override: clusterPeaks,
                    cluster_fit_data: clusterFitData,
                    lambda_cluster: lambdaCluster,
                    spatial_mode: spatialMode,
                    map_width: mapWidth,
                    map_height: mapHeight,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.detail || data.message || 'Advanced map fit failed');
            }
            setMapFitResult(data);
            setSelectedMapKey(data.results?.rgi2_confidence ? 'rgi2_confidence' : 'r2');
            setResultsView('map');
            setSelectedHistogramKey(data.histograms?.pos_G ? 'pos_G' : Object.keys(data.histograms || {})[0] || 'pos_G');
            setScatterXKey(data.scientific_maps?.pos_G ? 'pos_G' : Object.keys(data.scientific_maps || {})[0] || 'pos_G');
            setScatterYKey(data.scientific_maps?.pos_2D ? 'pos_2D' : Object.keys(data.scientific_maps || {})[1] || 'pos_2D');
            setSelectedPixelIndex(null);
            setStage(4);
            toast.success('RGI2 advanced fit completed');
        } catch (err: any) {
            toast.error(err.message || 'Advanced map fit failed');
        } finally {
            window.clearInterval(intervalId);
            setFitProgress(null);
            setStatus('idle');
        }
    };

    const saveSession = async () => {
        setStatus('saving');
        try {
            const payload = {
                activePath,
                cropMin,
                cropMax,
                baselineMethod,
                normalization,
                despike,
                despikeMethod,
                despikeThreshold,
                despikeWindow,
                traceVisibility,
                addPeakByClick,
                clusteringMethod,
                nPCAComponents,
                nNMFComponents,
                nClusters,
                thresholdSNR,
                thresholdR2,
                lambdaCluster,
                spatialMode,
                modelData,
                clusterPeaks,
                clusterFitData,
                mapFitResult,
            };
            const res = await fetch(`${SCIENCE_ENGINE_URL}/api/rgi2/save-results`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_path: activePath,
                    session_data: payload,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');
            if (data.h5_relative_path) setActivePath(data.h5_relative_path);
            if (data.file_details) onFileCreated?.(data.file_details);
            toast.success('RGI2 session saved');
        } catch (err: any) {
            toast.error(err.message || 'RGI2 save failed');
        } finally {
            setStatus('idle');
        }
    };

    const busy = status !== 'idle';
    const progressPct = fitProgress?.total ? Math.round((fitProgress.completed / fitProgress.total) * 100) : 0;

    return (
        <div className="h-full w-full bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
            <div className="h-16 shrink-0 border-b border-slate-800 bg-slate-950/95 px-5 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
                        <BrainCircuit size={18} className="text-emerald-300" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-sm font-black uppercase tracking-wider text-white">RGI2 Workspace</h1>
                        <p className="text-[10px] text-slate-500 truncate">{activePath}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {[1, 2, 3, 4].map(num => (
                        <button
                            key={num}
                            onClick={() => setStage(num as Stage)}
                            className={cn(
                                'h-8 px-3 rounded-lg text-[10px] font-black border transition-all',
                                stage === num ? 'bg-emerald-400 text-slate-950 border-emerald-300' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                            )}
                        >
                            {num === 1 ? 'Map Model' : num === 2 ? 'Cluster Priors' : num === 3 ? 'Advanced Fit' : 'Review'}
                        </button>
                    ))}
                    <button
                        onClick={saveSession}
                        disabled={busy}
                        className="h-8 px-3 rounded-lg bg-slate-100 text-slate-950 text-[10px] font-black flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {status === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        Save
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-[360px_minmax(0,1fr)]">
                <aside className="border-r border-slate-800 bg-slate-950 p-4 overflow-y-auto">
                    <div className="space-y-4">
                        <section className="space-y-3">
                            <div className="flex items-center justify-between gap-2 text-xs font-black uppercase tracking-wider text-slate-300">
                                <div className="flex items-center gap-2">
                                    <SlidersHorizontal size={14} className="text-emerald-300" />
                                    Model Controls
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowInfoNote(true)}
                                    className="flex h-7 items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 text-[9px] font-black uppercase tracking-wide text-emerald-200 hover:border-emerald-300 hover:bg-emerald-400/15"
                                    title="RGI2 parameter guide"
                                >
                                    <Info size={12} />
                                    Info
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="space-y-1">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Crop Min</span>
                                    <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs" type="number" value={cropMin} onChange={e => setCropMin(Number(e.target.value))} />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Crop Max</span>
                                    <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs" type="number" value={cropMax} onChange={e => setCropMax(Number(e.target.value))} />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Baseline</span>
                                    <select className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs" value={baselineMethod} onChange={e => setBaselineMethod(e.target.value)}>
                                        <option value="asls">asLS</option>
                                        <option value="airpls">airPLS</option>
                                        <option value="linear">Linear</option>
                                        <option value="poly">Polynomial</option>
                                        <option value="none">None</option>
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Normalize</span>
                                    <select className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs" value={normalization} onChange={e => setNormalization(e.target.value)}>
                                        <option value="vector">Vector</option>
                                        <option value="area">Area</option>
                                        <option value="max">Max</option>
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Clustering</span>
                                    <select className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs" value={clusteringMethod} onChange={e => setClusteringMethod(e.target.value as ClusteringMethod)}>
                                        <option value="gmm">GMM Soft</option>
                                        <option value="kmeans">KMeans</option>
                                        <option value="nmf">NMF/MCR-like</option>
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Spatial</span>
                                    <select className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs" value={spatialMode} onChange={e => setSpatialMode(e.target.value as SpatialMode)}>
                                        <option value="edge-preserving">Edge-preserving</option>
                                        <option value="smooth">Smooth</option>
                                        <option value="off">Off</option>
                                    </select>
                                </label>
                                <label className="col-span-2 flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">Remove Cosmic Rays</span>
                                    <input className="h-4 w-4 accent-emerald-400" type="checkbox" checked={despike} onChange={e => setDespike(e.target.checked)} />
                                </label>
                                {despike && (
                                    <>
                                        <label className="space-y-1">
                                            <span className="text-[9px] font-bold text-slate-500 uppercase">Despike</span>
                                            <select className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs" value={despikeMethod} onChange={e => setDespikeMethod(e.target.value)}>
                                                <option value="whitaker_hayes">Whitaker-Hayes</option>
                                                <option value="modified_z">Modified Z</option>
                                                <option value="iqr">IQR</option>
                                            </select>
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-[9px] font-bold text-slate-500 uppercase">Window</span>
                                            <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs" type="number" min="3" step="2" value={despikeWindow} onChange={e => setDespikeWindow(Number(e.target.value))} />
                                        </label>
                                    </>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="block">
                                    <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500"><span>PCA</span><span>{nPCAComponents}</span></div>
                                    <input className="w-full accent-emerald-400" type="range" min="2" max="12" value={nPCAComponents} onChange={e => setNPCAComponents(Number(e.target.value))} />
                                </label>
                                <label className="block">
                                    <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500"><span>NMF</span><span>{nNMFComponents}</span></div>
                                    <input className="w-full accent-emerald-400" type="range" min="2" max="10" value={nNMFComponents} onChange={e => setNNMFComponents(Number(e.target.value))} />
                                </label>
                                <label className="block">
                                    <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500"><span>Clusters</span><span>{nClusters}</span></div>
                                    <input className="w-full accent-emerald-400" type="range" min="2" max="10" value={nClusters} onChange={e => setNClusters(Number(e.target.value))} />
                                </label>
                                <label className="block">
                                    <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500"><span>SNR</span><span>{thresholdSNR.toFixed(1)}</span></div>
                                    <input className="w-full accent-cyan-400" type="range" min="0.5" max="12" step="0.5" value={thresholdSNR} onChange={e => setThresholdSNR(Number(e.target.value))} />
                                </label>
                                <label className="block">
                                    <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500"><span>R2</span><span>{thresholdR2.toFixed(2)}</span></div>
                                    <input className="w-full accent-cyan-400" type="range" min="0.5" max="0.99" step="0.01" value={thresholdR2} onChange={e => setThresholdR2(Number(e.target.value))} />
                                </label>
                                <label className="block">
                                    <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500"><span>Cluster Prior</span><span>{lambdaCluster.toFixed(2)}</span></div>
                                    <input className="w-full accent-amber-400" type="range" min="0" max="2" step="0.05" value={lambdaCluster} onChange={e => setLambdaCluster(Number(e.target.value))} />
                                </label>
                                {despike && (
                                    <label className="block">
                                        <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500"><span>Cosmic Threshold</span><span>{despikeThreshold.toFixed(1)}</span></div>
                                        <input className="w-full accent-rose-400" type="range" min="3" max="15" step="0.5" value={despikeThreshold} onChange={e => setDespikeThreshold(Number(e.target.value))} />
                                    </label>
                                )}
                            </div>
                        </section>

                        <section className="grid grid-cols-2 gap-2">
                            <Metric label="Spectra" value={modelData?.n_spectra || nSpectra || 0} />
                            <Metric label="Clusters" value={modelData?.n_clusters || nClusters} tone="cyan" />
                            <Metric label="Reliable" value={mapFitResult?.reliable_count ?? '-'} tone="emerald" />
                            <Metric label="Rescued" value={mapFitResult?.rescued_count ?? '-'} tone="amber" />
                        </section>

                        <button
                            onClick={runMapModel}
                            disabled={busy}
                            className="w-full h-10 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {status === 'modeling' ? <Loader2 size={15} className="animate-spin" /> : <BrainCircuit size={15} />}
                            Build RGI2 Model
                        </button>
                    </div>
                </aside>

                <main className="min-w-0 min-h-0 p-4 overflow-hidden">
                    {stage === 1 && (
                        <div className="h-full grid grid-rows-[auto_minmax(0,1fr)] gap-3">
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-300">
                                <Database size={14} className="text-emerald-300" />
                                Map Model
                            </div>
                            <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
                                {clusterTrace.length ? (
                                    <Plot data={clusterTrace as any} layout={{ autosize: true, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#020617', font: { color: '#94a3b8' }, margin: { l: 35, r: 20, t: 20, b: 30 } }} useResizeHandler className="w-full h-full" />
                                ) : (
                                    <div className="h-full flex items-center justify-center text-sm text-slate-500">RGI2 model not built</div>
                                )}
                            </div>
                        </div>
                    )}

                    {stage === 2 && (
                        <div className="h-full grid grid-cols-[260px_minmax(0,1fr)] gap-3">
                            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 overflow-y-auto">
                                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Clusters</div>
                                <div className="space-y-2">
                                    {Array.from({ length: modelData?.n_clusters || nClusters }).map((_, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setActiveCluster(idx)}
                                            className={cn(
                                                'w-full rounded-lg border px-3 py-2 text-left transition-all',
                                                activeCluster === idx ? 'border-emerald-400 bg-emerald-400/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                                            )}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-black">Cluster {idx}</span>
                                                {clusterFitData[idx] ? <CheckCircle2 size={14} className="text-emerald-300" /> : <Activity size={14} className="text-slate-500" />}
                                            </div>
                                            <div className="text-[10px] text-slate-500 mt-1">{modelData?.cluster_sizes?.[idx] ?? 0} pixels</div>
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={fitRepresentative}
                                    disabled={busy || !modelData}
                                    className="mt-3 w-full h-9 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {status === 'fitting_rep' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                    Fit Representative
                                </button>
                            </div>
                            <div className="min-h-0 grid grid-rows-[minmax(220px,0.9fr)_minmax(260px,1.1fr)] gap-3">
                                <div className="rounded-lg border border-slate-800 bg-slate-950/70 overflow-hidden grid grid-rows-[auto_minmax(0,1fr)]">
                                    <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Representative Spectrum</div>
                                            {activeClusterFit?.success && (
                                                <div className="hidden min-w-0 items-center gap-1 lg:flex">
                                                    <span className="rounded-md border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">R2 {fitSummary.r2}</span>
                                                    <span className="rounded-md border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">RMSE {fitSummary.rmse}</span>
                                                    <span className="rounded-md border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">Noise {fitSummary.residualStd}</span>
                                                    <span className="rounded-md border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">Err {fitSummary.residualToSignal}%</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                                            <button
                                                type="button"
                                                disabled={busy || !activeRepresentative}
                                                onClick={() => setAddPeakByClick(value => !value)}
                                                className={cn(
                                                    'h-6 rounded-md border px-2 text-[9px] font-black uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-35',
                                                    addPeakByClick ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.25)]' : 'border-slate-800 bg-slate-950 text-slate-500 hover:border-slate-600'
                                                )}
                                            >
                                                {addPeakByClick ? 'Click Add On' : 'Click Add'}
                                            </button>
                                            {TRACE_TOGGLES.map(toggle => {
                                                const disabled = toggle.key === 'despiked' && !despike;
                                                const active = traceVisibility[toggle.key] && !disabled;
                                                return (
                                                    <button
                                                        key={toggle.key}
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => toggleTraceVisibility(toggle.key)}
                                                        className={cn(
                                                            'h-6 rounded-md border px-2 text-[9px] font-black uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-35',
                                                            active ? 'border-slate-500 bg-slate-800 text-white' : 'border-slate-800 bg-slate-950 text-slate-500 hover:border-slate-600'
                                                        )}
                                                    >
                                                        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: toggle.color }} />
                                                        {toggle.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    {representativeTrace.length ? (
                                        <div ref={representativePlotContainerRef} className={cn('relative h-full w-full min-h-0', addPeakByClick && 'cursor-crosshair')}>
                                            <Plot
                                                data={representativeTrace as any}
                                                layout={{
                                                    autosize: true,
                                                    paper_bgcolor: 'rgba(0,0,0,0)',
                                                    plot_bgcolor: '#020617',
                                                    font: { color: '#94a3b8', size: 10 },
                                                    margin: { l: 55, r: 20, t: 22, b: 42 },
                                                    xaxis: { gridcolor: '#1e293b', color: '#94a3b8', title: { text: 'Raman Shift (cm-1)' } },
                                                    yaxis: { gridcolor: '#1e293b', color: '#94a3b8', title: { text: 'Intensity (a.u.)' }, domain: traceVisibility.residuals && activeClusterFit?.residuals?.length ? [0.28, 1] : [0, 1] },
                                                    yaxis2: { gridcolor: '#1e293b', color: '#94a3b8', title: { text: 'Residual' }, domain: [0, 0.18], zeroline: true, zerolinecolor: '#64748b' },
                                                    legend: { orientation: 'h', y: 1.1, x: 0, font: { size: 9 } },
                                                    shapes: representativeMarkers.shapes,
                                                    annotations: representativeMarkers.annotations,
                                                    dragmode: addPeakByClick ? false : 'zoom',
                                                    clickmode: 'event',
                                                }}
                                                config={{ responsive: true, displaylogo: false }}
                                                onInitialized={(_, graphDiv) => { representativePlotRef.current = graphDiv; }}
                                                onUpdate={(_, graphDiv) => { representativePlotRef.current = graphDiv; }}
                                                useResizeHandler
                                                className="w-full h-full"
                                            />
                                            {addPeakByClick && (
                                                <div
                                                    className="absolute inset-0 z-10 cursor-crosshair"
                                                    onPointerDown={handleRepresentativePlotAreaClick}
                                                >
                                                    <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-emerald-400/30 bg-slate-950/85 px-2 py-1 text-[10px] font-bold text-emerald-200">
                                                        Click spectrum area to add Lorentzian peak
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-slate-500">
                                            {activeRepresentative ? 'Select at least one spectrum trace to display.' : 'Build the RGI2 model to inspect the representative spectrum.'}
                                        </div>
                                    )}
                                </div>
                                <div className="min-h-0">
                                    <FittingPeakTable
                                        peaks={activePeaks}
                                        onChange={(peaks) => setActiveClusterPeaks(peaks)}
                                        disabled={busy}
                                        showLimits
                                        showExpr
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {stage === 3 && (
                        <div className="h-full flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 rounded-xl bg-emerald-400/10 border border-emerald-300/30 flex items-center justify-center mb-5">
                                <ShieldCheck size={28} className="text-emerald-300" />
                            </div>
                            <h2 className="text-lg font-black text-white mb-2">Advanced Constrained Fit</h2>
                            <div className="grid grid-cols-4 gap-2 mb-6 w-full max-w-2xl">
                                <Metric label="Cluster Priors" value={Object.keys(clusterFitData).length} />
                                <Metric label="Lambda" value={lambdaCluster.toFixed(2)} tone="amber" />
                                <Metric label="Spatial" value={spatialMode} tone="cyan" />
                                <Metric label="R2 Min" value={thresholdR2.toFixed(2)} />
                            </div>
                            {fitProgress && (
                                <div className="w-full max-w-xl mb-4">
                                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                                        <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progressPct}%` }} />
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-bold mt-2">{fitProgress.completed} / {fitProgress.total} pixels</div>
                                </div>
                            )}
                            <button
                                onClick={runAdvancedFit}
                                disabled={busy || !modelData}
                                className="h-11 px-6 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black flex items-center gap-2 disabled:opacity-50"
                            >
                                {status === 'mapping' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                                Run Advanced Fit
                            </button>
                        </div>
                    )}

                    {stage === 4 && (
                        <div className="h-full grid grid-rows-[auto_minmax(0,1fr)] gap-3">
                            <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-800 rounded-xl p-1 shrink-0 overflow-x-auto">
                                {RESULT_VIEWS.map(view => (
                                    <button
                                        key={view.value}
                                        onClick={() => setResultsView(view.value)}
                                        className={cn(
                                            'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shrink-0 whitespace-nowrap',
                                            resultsView === view.value
                                                ? 'bg-emerald-400 text-slate-950'
                                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                        )}
                                    >
                                        {view.label}
                                    </button>
                                ))}
                            </div>
                            <div className="min-h-0 overflow-hidden">
                                {resultsView === 'map' && (
                                    <div className="h-full grid grid-cols-[minmax(0,1fr)_300px] gap-3">
                                        <div className="flex flex-col gap-2 min-h-0">
                                            <div className="flex items-center gap-2 shrink-0">
                                                <select className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs flex-1" value={selectedMapKey} onChange={e => setSelectedMapKey(e.target.value)}>
                                                    {mapKeys.map(key => <option key={key} value={key}>{key.replace(/_/g, ' ')}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex-1 rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
                                                {mapTrace.length ? (
                                                    <Plot data={mapTrace as any} layout={{ autosize: true, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#020617', font: { color: '#94a3b8' }, margin: { l: 35, r: 20, t: 20, b: 30 }, xaxis: { showgrid: false }, yaxis: { showgrid: false, scaleanchor: 'x' } }} useResizeHandler onClick={handlePixelClickRgi2} className="w-full h-full" />
                                                ) : (
                                                    <div className="h-full flex items-center justify-center text-sm text-slate-500">No RGI2 fit results</div>
                                                )}
                                            </div>
                                            {selectedMapKey === 'graphene_quality_class' && (
                                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-bold text-slate-500 shrink-0">
                                                    {Object.entries(QUALITY_CLASS_LABELS_RGI2).map(([k, d]) => (
                                                        <div key={k} className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: d.color }} /><span>{d.label.split(' ')[0]}</span></div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 overflow-y-auto">
                                            <div className="grid grid-cols-2 gap-2 mb-3">
                                                <Metric label="Success" value={mapFitResult?.success_count ?? '-'} />
                                                <Metric label="Reliable" value={mapFitResult?.reliable_count ?? '-'} />
                                                <Metric label="R2 Mean" value={mapFitResult?.r2_mean?.toFixed?.(4) ?? '-'} tone="cyan" />
                                                <Metric label="Rescued" value={mapFitResult?.rescued_count ?? '-'} tone="amber" />
                                            </div>
                                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Fit Reasons</div>
                                            <div className="space-y-1">
                                                {Object.entries(mapFitResult?.reason_summary || {}).map(([key, value]) => (
                                                    <div key={key} className="flex items-center justify-between text-xs border border-slate-800 bg-slate-900/50 rounded px-2 py-1.5">
                                                        <span className="text-slate-300">{key}</span>
                                                        <span className="font-black text-emerald-300">{String(value)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mt-4 mb-2">Interpretation</div>
                                            <div className="text-xs text-slate-400 leading-relaxed">
                                                {mapFitResult?.interpretation_summary?.notes?.join(' ') || 'Run RGI2 advanced fit to generate review notes.'}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {resultsView === 'metrics' && (
                                    <div className="h-full overflow-y-auto p-1">
                                        {mapFitResult ? (
                                            <Rgi2MetricsPanel result={mapFitResult} />
                                        ) : (
                                            <Rgi2EmptyState title="No fit data" body="Run the advanced fit to see scientific metrics." />
                                        )}
                                    </div>
                                )}
                                {resultsView === 'histograms' && (
                                    <div className="h-full flex gap-4 min-h-0">
                                        <div className="w-64 shrink-0 flex flex-col gap-4 bg-slate-950/40 border border-slate-800 rounded-xl p-4 overflow-y-auto">
                                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Parameter</div>
                                            <div className="flex flex-col gap-1">
                                                {histogramOptions.map(opt => (
                                                    <button key={opt.key} onClick={() => setSelectedHistogramKey(opt.key)}
                                                        className={cn('px-3 py-2 rounded-lg text-xs font-bold text-left transition-all border', selectedHistogramKey === opt.key ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white hover:border-slate-700')}>
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {histogramStats && (
                                                <div className="border-t border-slate-800 pt-3 space-y-2">
                                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Statistics</div>
                                                    {[['Mean', histogramStats.mean?.toFixed(4)], ['Median', histogramStats.median?.toFixed(4)], ['Std', histogramStats.std?.toFixed(4)], ['P10', histogramStats.p10?.toFixed(4)], ['P90', histogramStats.p90?.toFixed(4)], ['Count', histogramStats.reliable_count]].map(([l, v]) => (
                                                        <div key={l as string} className="flex justify-between text-[10px]">
                                                            <span className="text-slate-500 font-bold uppercase">{l}</span>
                                                            <span className="font-mono text-slate-300">{v ?? '--'}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                                            {histogramTrace.length ? (
                                                <Plot data={histogramTrace as any} layout={{ ...LAYOUT_BASE_RGI2, xaxis: { ...AXIS_RGI2, title: { text: histogramOptions.find(o => o.key === selectedHistogramKey)?.label || selectedHistogramKey } }, yaxis: { ...AXIS_RGI2, title: { text: 'Count' } }, barmode: 'overlay', autosize: true }} useResizeHandler className="w-full h-full" config={{ displayModeBar: false, responsive: true }} />
                                            ) : (
                                                <Rgi2EmptyState title="No histogram data" body="The histogram for this parameter is not available yet." />
                                            )}
                                        </div>
                                    </div>
                                )}
                                {resultsView === 'relationships' && (
                                    <div className="h-full grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 min-h-0">
                                        <div className="flex flex-col gap-2 min-h-0">
                                            <div className="flex gap-2 items-center shrink-0">
                                                <div className="flex-1">
                                                    <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">X Axis</div>
                                                    <select className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs" value={scatterXKey} onChange={e => setScatterXKey(e.target.value)}>
                                                        {relationshipMetricOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                                                    </select>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Y Axis</div>
                                                    <select className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs" value={scatterYKey} onChange={e => setScatterYKey(e.target.value)}>
                                                        {relationshipMetricOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                                                <Plot data={relationshipTrace as any} layout={{ ...LAYOUT_BASE_RGI2, xaxis: { ...AXIS_RGI2, title: { text: relationshipMetricOptions.find(o => o.key === scatterXKey)?.label || scatterXKey } }, yaxis: { ...AXIS_RGI2, title: { text: relationshipMetricOptions.find(o => o.key === scatterYKey)?.label || scatterYKey } }, autosize: true }} useResizeHandler className="w-full h-full" config={{ displayModeBar: false, responsive: true }} />
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2 min-h-0">
                                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0">Pearson Correlation Matrix</div>
                                            <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                                                {correlationTrace.length ? (
                                                    <Plot data={correlationTrace as any} layout={{ autosize: true, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#080d16', font: { family: 'Inter, sans-serif', size: 9, color: '#94a3b8' }, margin: { l: 100, r: 20, t: 20, b: 100 } }} useResizeHandler className="w-full h-full" config={{ displayModeBar: false, responsive: true }} />
                                                ) : (
                                                    <Rgi2EmptyState title="No correlation data" body="Correlation matrix requires scientific maps with multiple parameters." />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {resultsView === 'vector' && (
                                    <div className="h-full overflow-hidden">
                                        <RgiVectorTabRgi2 result={mapFitResult} clusterLabels={modelData?.cluster_labels} nClusters={modelData?.n_clusters || nClusters} />
                                    </div>
                                )}
                                {resultsView === 'graphene' && (
                                    <div className="h-full overflow-hidden">
                                        <RgiGrapheneTabRgi2 result={mapFitResult} mapWidth={mapWidth} mapHeight={mapHeight} nSpectra={nSpectra} stepSize={stepSize} />
                                    </div>
                                )}
                                {resultsView === 'analytics' && (
                                    <div className="h-full overflow-hidden">
                                        <RgiAnalyticsTabRgi2 result={mapFitResult} vaultRoot={vaultRoot} h5Path={activePath} />
                                    </div>
                                )}
                                {resultsView === 'inspect' && (
                                    <div className="h-full overflow-hidden">
                                        <RgiInspectTabRgi2
                                            result={mapFitResult}
                                            mapWidth={mapWidth}
                                            mapHeight={mapHeight}
                                            selectedPixelIndex={selectedPixelIndex}
                                            setSelectedPixelIndex={setSelectedPixelIndex}
                                            pixelFitData={pixelFitData}
                                            isLoadingPixelFit={isLoadingPixelFit}
                                            fitError={fitError}
                                            selectedMapKey={selectedMapKey}
                                            setSelectedMapKey={setSelectedMapKey}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {showInfoNote && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm" onClick={() => setShowInfoNote(false)}>
                    <div
                        className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl"
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10">
                                    <BookOpenText size={18} className="text-emerald-300" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black uppercase tracking-wider text-white">RGI2 Process Info Note</h2>
                                    <p className="text-[10px] font-bold text-slate-500">How to choose parameters before building clusters, priors, and the advanced map fit.</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowInfoNote(false)}
                                className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white"
                                title="Close"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div className="max-h-[calc(88vh-74px)] overflow-y-auto p-5">
                            <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                                <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                                    <h3 className="mb-3 text-[11px] font-black uppercase tracking-wider text-emerald-300">Recommended workflow</h3>
                                    <ol className="space-y-2 text-xs leading-relaxed text-slate-300">
                                        <li><span className="font-black text-white">1.</span> Set crop first. Keep only the spectral region you want RGI2 to learn and fit.</li>
                                        <li><span className="font-black text-white">2.</span> Enable cosmic ray removal only if you see narrow spike artifacts. Rebuild the model after changing it.</li>
                                        <li><span className="font-black text-white">3.</span> Build the map model. Check if clusters separate real spectral behavior, not just noise.</li>
                                        <li><span className="font-black text-white">4.</span> Fit representatives cluster by cluster. Use Lorentzian first for Raman D/G/2D unless the residual says otherwise.</li>
                                        <li><span className="font-black text-white">5.</span> Run Advanced Fit with a moderate Cluster Prior. Review R2, residuals, failed pixels, and rescued pixels.</li>
                                    </ol>
                                </section>

                                <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                                    <h3 className="mb-3 text-[11px] font-black uppercase tracking-wider text-cyan-300">Fast starting recipe</h3>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-md border border-slate-800 bg-slate-950 p-2"><span className="block text-[9px] font-black uppercase text-slate-500">Graphene crop</span><span className="font-bold text-white">1100-3100 cm-1</span></div>
                                        <div className="rounded-md border border-slate-800 bg-slate-950 p-2"><span className="block text-[9px] font-black uppercase text-slate-500">Baseline</span><span className="font-bold text-white">asLS</span></div>
                                        <div className="rounded-md border border-slate-800 bg-slate-950 p-2"><span className="block text-[9px] font-black uppercase text-slate-500">Normalize</span><span className="font-bold text-white">Vector</span></div>
                                        <div className="rounded-md border border-slate-800 bg-slate-950 p-2"><span className="block text-[9px] font-black uppercase text-slate-500">Clustering</span><span className="font-bold text-white">GMM Soft</span></div>
                                        <div className="rounded-md border border-slate-800 bg-slate-950 p-2"><span className="block text-[9px] font-black uppercase text-slate-500">Clusters</span><span className="font-bold text-white">3-6</span></div>
                                        <div className="rounded-md border border-slate-800 bg-slate-950 p-2"><span className="block text-[9px] font-black uppercase text-slate-500">Cluster Prior</span><span className="font-bold text-white">0.35-0.70</span></div>
                                    </div>
                                </section>
                            </div>

                            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                {[
                                    ['Crop Min / Max', 'Cuts the spectrum before despike, baseline, clustering, and fitting. Too wide adds irrelevant noise; too narrow can remove bands. For graphene, keep D/G/2D visible.'],
                                    ['Baseline', 'Removes slow background. asLS is a safe default. airPLS can help fluorescence. None is useful only when data is already corrected. Bad baseline creates false peak area.'],
                                    ['Normalize', 'Controls how spectra are compared for clustering. Vector is best general default. Area helps when total integrated signal matters. Max emphasizes shape and peak ratios.'],
                                    ['Clustering', 'KMeans gives hard groups. GMM Soft gives probabilities and is usually better for transitional pixels. NMF/MCR-like separates spectral components and abundances.'],
                                    ['Spatial', 'Off keeps raw pixel fits. Smooth fills unstable maps gently. Edge-preserving uses neighbors but tries not to blur real boundaries. Use edge-preserving for maps with domains.'],
                                    ['Remove Cosmic Rays', 'Use only when narrow one-point or few-point spikes are visible. It runs after crop and before baseline. If threshold is too low, real narrow peaks can be damaged.'],
                                    ['PCA', 'Number of variance components used for clustering. Start 4-6. Increase if clusters miss subtle spectral differences. Lower if clusters split noise.'],
                                    ['NMF', 'Number of non-negative spectral components. Start 2-4. Increase for mixed materials or extra bands. Too high can create artificial components.'],
                                    ['Clusters', 'How many representative spectral families to create. Start 3-6. Increase only if representatives look truly different. Too many clusters make priors unstable.'],
                                    ['SNR', 'Minimum signal-to-noise required for a pixel to be trusted. Higher is stricter. If many good pixels are rejected, lower it. If noisy fits pass, raise it.'],
                                    ['R2', 'Minimum goodness-of-fit for reliable pixels. 0.85 is practical. Use 0.90-0.95 for clean spectra; lower for weak/noisy maps. Always check residuals.'],
                                    ['Cluster Prior', 'How strongly each pixel is pulled toward its cluster representative fit. 0 is free fitting. 0.35-0.70 is usually balanced. Above 1 can hide real local variation.'],
                                ].map(([title, body]) => (
                                    <section key={title} className="rounded-lg border border-slate-800 bg-slate-900/35 p-3">
                                        <h4 className="mb-1 text-[10px] font-black uppercase tracking-wider text-white">{title}</h4>
                                        <p className="text-xs leading-relaxed text-slate-400">{body}</p>
                                    </section>
                                ))}
                            </div>

                            <section className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/10 p-4">
                                <h3 className="mb-2 text-[11px] font-black uppercase tracking-wider text-amber-200">How to judge if settings are good</h3>
                                <div className="grid gap-2 text-xs leading-relaxed text-slate-300 md:grid-cols-3">
                                    <p><span className="font-black text-white">Representatives:</span> each cluster spectrum should look physically different, not just noisier or brighter.</p>
                                    <p><span className="font-black text-white">Residual:</span> residual should be structureless noise. Peaks left in residual mean missing peak, wrong width, or bad baseline.</p>
                                    <p><span className="font-black text-white">Map fit:</span> reliable pixels should increase without forcing unrealistic smoothness or identical peak centers everywhere.</p>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage-4 helper components (adapted from rgi-view.tsx for RGI2 data shapes)
// ─────────────────────────────────────────────────────────────────────────────

function Rgi2EmptyState({ title, body }: { title: string; body: string }) {
    return (
        <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center border border-slate-900 rounded-xl bg-slate-950/40 p-8">
            <AlertCircle size={22} className="text-amber-400 mb-3" />
            <div className="text-xs font-black uppercase text-slate-300">{title}</div>
            <p className="text-[10px] text-slate-500 max-w-md mt-2 leading-4">{body}</p>
        </div>
    );
}

function Rgi2MetricsPanel({ result }: { result: any }) {
    const stats = result?.statistics || {};
    const ratioKeys = ['ID_IG_height', 'AD_AG_area', 'I2D_IG_height', 'A2D_AG_area', 'FWHM_2D_FWHM_G'];
    const detailKeys = ['pos_G', 'fwhm_G', 'area_G', 'height_G', 'pos_2D', 'fwhm_2D', 'area_2D', 'height_2D', 'ID_IG_height', 'I2D_IG_height'];

    const fmt = (v: any, d = 4) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '--');

    return (
        <div className="flex flex-col gap-4 pb-4">
            <div>
                <h4 className="text-[11px] font-black text-slate-300 uppercase">Band Metrics</h4>
                <p className="text-[9px] font-bold text-slate-500">{result?.n_spectra ?? 0} spectra — analysis mask applied</p>
            </div>

            <div className="overflow-x-auto border border-slate-850 rounded-xl bg-slate-950/40">
                <table className="w-full text-[10px]">
                    <thead className="bg-slate-950 text-slate-500 uppercase">
                        <tr>
                            <th className="text-left px-3 py-2 font-black">Band</th>
                            <th className="text-left px-3 py-2 font-black">Position</th>
                            <th className="text-left px-3 py-2 font-black">FWHM</th>
                            <th className="text-left px-3 py-2 font-black">Area</th>
                            <th className="text-left px-3 py-2 font-black">Height</th>
                            <th className="text-right px-3 py-2 font-black">Analysis Px</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(['D', 'G', '2D'] as const).map(band => {
                            const suffix = band;
                            const pos = stats[`pos_${suffix}`];
                            const fwhm = stats[`fwhm_${suffix}`];
                            const area = stats[`area_${suffix}`];
                            const height = stats[`height_${suffix}`];
                            const cnt = Math.max(pos?.reliable_count || 0, fwhm?.reliable_count || 0);
                            const cell = (s: any, unit?: string) => (
                                <td className="px-3 py-3 align-top">
                                    <div className="font-mono text-slate-200">{fmt(s?.mean)} ± {fmt(s?.std)}</div>
                                    <div className="text-[9px] text-slate-500">median {fmt(s?.median)}{unit ? ` | ${unit}` : ''}</div>
                                </td>
                            );
                            return (
                                <tr key={band} className="border-t border-slate-900/80">
                                    <td className="px-3 py-3 font-black text-emerald-400">{band}</td>
                                    {cell(pos, 'cm⁻¹')}
                                    {cell(fwhm, 'cm⁻¹')}
                                    {cell(area)}
                                    {cell(height)}
                                    <td className="px-3 py-3 text-right font-mono text-slate-300">{cnt}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="grid grid-cols-5 gap-2">
                {ratioKeys.map(key => (
                    <div key={key} className="border border-slate-850 rounded-lg bg-slate-950/40 p-3">
                        <div className="text-[9px] font-black uppercase tracking-wider text-slate-500 truncate">{stats[key]?.label || key}</div>
                        <div className="text-xs font-black text-cyan-400 mt-1">{fmt(stats[key]?.mean)} ± {fmt(stats[key]?.std)}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">median {fmt(stats[key]?.median)}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
                {detailKeys.map(key => (
                    <div key={key} className="border border-slate-850 rounded-lg bg-slate-950/30 p-3">
                        <div className="flex justify-between gap-3">
                            <div className="text-[10px] font-black uppercase text-slate-400">{stats[key]?.label || key}</div>
                            <div className="text-[9px] font-mono text-emerald-400">{stats[key]?.reliable_count || 0} px</div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-[9px]">
                            {[['Mean', fmt(stats[key]?.mean)], ['Median', fmt(stats[key]?.median)], ['Std', fmt(stats[key]?.std)], ['P10', fmt(stats[key]?.p10)], ['P90', fmt(stats[key]?.p90)], ['NaN', stats[key]?.nan_count ?? '--']].map(([l, v]) => (
                                <div key={l} className="bg-slate-950/50 border border-slate-900 rounded-md p-2">
                                    <div className="font-black uppercase text-slate-600">{l}</div>
                                    <div className="font-mono text-slate-300 mt-0.5">{v}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Vector Plot (Strain / Doping Decoupling) ─────────────────────────────────
function RgiVectorTabRgi2({ result, clusterLabels, nClusters }: { result: any; clusterLabels?: number[]; nClusters?: number }) {
    const referenceOrigins = {
        '532':   { G0: 1581.6, twoD0: 2669.7,  label: '532 nm (Green)' },
        '632.8': { G0: 1581.6, twoD0: 2637.25, label: '632.8 nm (He-Ne Red)' },
        '785':   { G0: 1581.6, twoD0: 2603.7,  label: '785 nm (NIR)' },
    } as const;

    const rawG   = result?.scientific_maps?.pos_G?.values   || [];
    const raw2D  = result?.scientific_maps?.pos_2D?.values  || [];
    const mask   = result?.analysis_mask || result?.interpretable_mask || result?.reliable_mask || [];

    const [colorByCluster, setColorByCluster] = useState(false);

    const CLUSTER_COLORS = [
        '#38bdf8', // Cluster 0: cyan
        '#a78bfa', // Cluster 1: purple
        '#34d399', // Cluster 2: green
        '#fb923c', // Cluster 3: orange
        '#ec4899', // Cluster 4: pink
        '#eab308', // Cluster 5: yellow
        '#f43f5e', // Cluster 6: rose
        '#94a3b8', // Cluster 7: slate/grey
    ];

    const { validG, valid2D, validClusterIds } = useMemo(() => {
        const g: number[] = [], d: number[] = [];
        const c: number[] = [];
        const labels = clusterLabels || result?.cluster_labels || [];
        for (let i = 0; i < Math.min(rawG.length, raw2D.length); i++) {
            const gv = rawG[i], dv = raw2D[i];
            const ok = mask.length === 0 ? true : mask[i] === true;
            if (ok && gv != null && Number.isFinite(gv) && dv != null && Number.isFinite(dv)) {
                g.push(gv);
                d.push(dv);
                c.push(labels[i] ?? 0);
            }
        }
        return { validG: g, valid2D: d, validClusterIds: c };
    }, [rawG, raw2D, mask, clusterLabels, result]);

    const stats = useMemo(() => {
        if (!validG.length || !valid2D.length) return null;
        const meanG  = validG.reduce((s, v) => s + v, 0) / validG.length;
        const mean2D = valid2D.reduce((s, v) => s + v, 0) / valid2D.length;
        const stdG   = Math.sqrt(validG.reduce((s, v) => s + (v - meanG) ** 2, 0) / validG.length);
        const std2D  = Math.sqrt(valid2D.reduce((s, v) => s + (v - mean2D) ** 2, 0) / valid2D.length);
        let autoLaser: '532' | '632.8' | '785' = '532';
        if (mean2D < 2620) autoLaser = '785';
        else if (mean2D < 2655) autoLaser = '632.8';
        return { meanG, mean2D, stdG, std2D, autoLaser };
    }, [validG, valid2D]);

    const [selectedLaser, setSelectedLaser] = useState<'532' | '632.8' | '785'>(stats?.autoLaser ?? '632.8');
    useEffect(() => { if (stats?.autoLaser) setSelectedLaser(stats.autoLaser); }, [stats?.autoLaser]);

    const { G0, twoD0 } = referenceOrigins[selectedLaser];

    const pixelMetrics = useMemo(() => {
        if (!validG.length || !valid2D.length) return null;
        const strains: number[] = [], dopings: number[] = [];
        for (let i = 0; i < validG.length; i++) {
            const dG = validG[i] - G0, d2D = valid2D[i] - twoD0;
            strains.push((0.7 * dG - d2D) / 90.0);
            dopings.push((dG + 60.0 * ((0.7 * dG - d2D) / 90.0)) / 4.5);
        }
        const meanStrain = strains.reduce((s, v) => s + v, 0) / strains.length;
        const meanDoping = dopings.reduce((s, v) => s + v, 0) / dopings.length;
        const stdStrain  = Math.sqrt(strains.reduce((s, v) => s + (v - meanStrain) ** 2, 0) / strains.length);
        const stdDoping  = Math.sqrt(dopings.reduce((s, v) => s + (v - meanDoping) ** 2, 0) / dopings.length);
        return { meanStrain, stdStrain, meanDoping, stdDoping };
    }, [validG, valid2D, G0, twoD0]);

    const plotlyData = useMemo(() => {
        if (!validG.length || !valid2D.length || !stats) return [];
        const traces: any[] = [];
        const G_min = 1580, G_max = 1600;
        const strains = [0.2, 0.1, 0.0, -0.1, -0.2, -0.3, -0.4, -0.5, -0.6];
        strains.forEach(eps => {
            traces.push({ x: [G_min, G_max], y: [G_min, G_max].map(x => twoD0 - 90 * eps + 0.7 * (x - G0)), mode: 'lines', line: { color: eps === 0 ? '#3b82f6' : '#1e293b', width: eps === 0 ? 1.5 : 0.8, dash: eps === 0 ? 'solid' : 'dash' }, showlegend: false, hoverinfo: 'none' });
            traces.push({ x: [1595], y: [twoD0 - 90 * eps + 0.7 * (1595 - G0) + 0.8], mode: 'text', text: [`${eps > 0 ? '+' : ''}${eps.toFixed(1)}`], textfont: { size: 8, color: eps === 0 ? '#3b82f6' : '#475569' }, showlegend: false, hoverinfo: 'none' });
        });
        const dopings = [0, 2, 4, 6, 8, 10, 12, 14, 16];
        dopings.forEach(dop => {
            traces.push({ x: [G_min, G_max], y: [G_min, G_max].map(x => twoD0 - 6.75 * dop + 2.2 * (x - G0)), mode: 'lines', line: { color: dop === 0 ? '#64748b' : '#0f172a', width: dop === 0 ? 1.2 : 0.6, dash: dop === 0 ? 'solid' : 'dot' }, showlegend: false, hoverinfo: 'none' });
            const labelX = (twoD0 - 9 - twoD0 + 6.75 * dop) / 2.2 + G0;
            if (labelX >= G_min && labelX <= G_max) traces.push({ x: [labelX], y: [twoD0 - 10.2], mode: 'text', text: [`${dop}`], textfont: { size: 8, color: dop === 0 ? '#94a3b8' : '#334155' }, showlegend: false, hoverinfo: 'none' });
        });
        traces.push({
            x: validG,
            y: valid2D,
            type: 'scattergl',
            mode: 'markers',
            name: 'Pixels',
            showlegend: false,
            text: validClusterIds.map(cid => `Cluster ${cid}`),
            hovertemplate: 'G: %{x:.2f} cm⁻¹<br>2D: %{y:.2f} cm⁻¹<br>%{text}<extra></extra>',
            marker: {
                color: colorByCluster
                    ? validClusterIds.map(cid => CLUSTER_COLORS[cid % CLUSTER_COLORS.length])
                    : '#06b6d4',
                size: 4,
                opacity: colorByCluster ? 0.45 : 0.22,
            }
        });
        traces.push({ x: [stats.meanG], y: [stats.mean2D], error_x: { type: 'data', array: [stats.stdG], visible: true, color: '#f43f5e', thickness: 2, width: 4 }, error_y: { type: 'data', array: [stats.std2D], visible: true, color: '#f43f5e', thickness: 2, width: 4 }, type: 'scatter', mode: 'markers', name: 'Mean', marker: { color: '#f43f5e', size: 10, line: { color: 'white', width: 2 } } });
        return traces;
    }, [validG, valid2D, stats, G0, twoD0, colorByCluster, validClusterIds]);

    if (!validG.length || !valid2D.length || !stats || !pixelMetrics) {
        return <Rgi2EmptyState title="Not enough fitted pixels" body="Vector plot requires both pos_G and pos_2D map datasets." />;
    }

    return (
        <div className="flex-1 w-full h-full flex gap-4 bg-[#050910] text-slate-300 p-4 overflow-hidden">
            <div className="w-64 shrink-0 flex flex-col gap-4 bg-slate-950/40 border border-slate-800 rounded-2xl p-4 overflow-y-auto">
                <div className="flex items-center gap-2"><Sliders size={14} className="text-cyan-400" /><span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Calibration</span></div>
                <div className="flex flex-col gap-1">
                    {(['532', '632.8', '785'] as const).map(wl => (
                        <button key={wl} onClick={() => setSelectedLaser(wl)}
                            className={cn('w-full px-3 py-2 rounded-xl text-xs font-bold transition-all border flex justify-between items-center', selectedLaser === wl ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-400' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-white')}>
                            <span>{referenceOrigins[wl].label}</span>
                            {stats.autoLaser === wl && <span className="text-[8px] bg-cyan-900/60 text-cyan-300 px-1.5 py-0.5 rounded font-black uppercase">Auto</span>}
                        </button>
                    ))}
                </div>
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-900">
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Vector Styling</div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-200 select-none">
                        <input
                            type="checkbox"
                            checked={colorByCluster}
                            onChange={e => setColorByCluster(e.target.checked)}
                            className="rounded border-slate-800 bg-slate-900 text-cyan-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                        />
                        <span>Color by Cluster</span>
                    </label>
                    {colorByCluster && (
                        <div className="flex flex-col gap-1 mt-1 pt-1.5 border-t border-slate-900/50">
                            <div className="text-[8px] font-bold text-slate-500 uppercase">Cluster Legend</div>
                            <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                                {Array.from({ length: nClusters || 6 }).map((_, cid) => (
                                    <div key={cid} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CLUSTER_COLORS[cid % CLUSTER_COLORS.length] }} />
                                        <span className="truncate">Cluster {cid}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-900">
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Decoupling Stats</div>
                    <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-3">
                        <span className="text-[8px] font-bold text-slate-500 uppercase">Avg Strain (ε)</span>
                        <div className="text-sm font-black text-cyan-400 font-mono">{pixelMetrics.meanStrain >= 0 ? '+' : ''}{(pixelMetrics.meanStrain * 100).toFixed(3)}%</div>
                        <div className="text-[8px] text-slate-500">± {(pixelMetrics.stdStrain * 100).toFixed(3)}% ({pixelMetrics.meanStrain >= 0 ? 'tensile' : 'compressive'})</div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-3">
                        <span className="text-[8px] font-bold text-slate-500 uppercase">Avg Doping (n)</span>
                        <div className="text-sm font-black text-slate-200 font-mono">{pixelMetrics.meanDoping.toFixed(3)}</div>
                        <div className="text-[8px] text-slate-500">± {pixelMetrics.stdDoping.toFixed(3)} × 10¹² cm⁻²</div>
                    </div>
                </div>
            </div>
            <div className="flex-1 min-h-0 bg-slate-950/30 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                <div className="p-3 border-b border-slate-900/80 flex justify-between items-center">
                    <div>
                        <h4 className="text-[10px] font-black text-slate-300 uppercase">Strain & Doping Decoupling</h4>
                        <p className="text-[8px] text-slate-500">{validG.length} mapped pixels · Reference: {selectedLaser} nm</p>
                    </div>
                </div>
                <div className="flex-1 min-h-0 bg-[#050910]">
                    <Plot data={plotlyData} layout={{ autosize: true, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#080d16', font: { family: 'Inter, sans-serif', size: 10, color: '#94a3b8' }, margin: { l: 55, r: 25, t: 20, b: 45 }, xaxis: { gridcolor: '#1e293b', color: '#94a3b8', range: [1580, 1600], title: { text: 'G band position (cm⁻¹)' } }, yaxis: { gridcolor: '#1e293b', color: '#94a3b8', range: [twoD0 - 20, twoD0 + 35], title: { text: '2D band position (cm⁻¹)' } }, legend: { font: { color: '#94a3b8', size: 9 }, bgcolor: 'rgba(15,23,42,0.85)', bordercolor: '#1e293b', borderwidth: 1 } } as any} config={{ displayModeBar: false, responsive: true }} useResizeHandler style={{ width: '100%', height: '100%' }} />
                </div>
            </div>
        </div>
    );
}

// ── Graphene Canvas Maps ─────────────────────────────────────────────────────
function RgiGrapheneTabRgi2({ result, mapWidth, mapHeight, nSpectra, stepSize }: { result: any; mapWidth: number; mapHeight: number; nSpectra: number; stepSize: number }) {
    const sci = result?.scientific_maps as Record<string, { label: string; values: Array<number | null> }> || {};
    const get = (key: string) => sci[key]?.values || [];
    const data_D = get('height_D'), data_G = get('height_G'), data_2D = get('height_2D');
    const ratio_2D_G = get('I2D_IG_height'), fwhm_2D = get('fwhm_2D'), ratio_D_G = get('ID_IG_height');
    return (
        <div className="w-full h-full overflow-auto p-2">
            <div className="grid grid-cols-3 grid-rows-2 gap-4 w-full h-full min-h-[600px]">
                <Rgi2GrapheneCanvas title="D Band Height" dataArr={data_D} w={mapWidth} h={mapHeight} nSpectra={nSpectra} stepSize={stepSize} cmap="Reds" vmin={0} vmax={null} colorbarLabel="Height" />
                <Rgi2GrapheneCanvas title="G Band Height" dataArr={data_G} w={mapWidth} h={mapHeight} nSpectra={nSpectra} stepSize={stepSize} cmap="Greens" vmin={0} vmax={null} colorbarLabel="Height" />
                <Rgi2GrapheneCanvas title="2D Band Height" dataArr={data_2D} w={mapWidth} h={mapHeight} nSpectra={nSpectra} stepSize={stepSize} cmap="Blues" vmin={0} vmax={null} colorbarLabel="Height" />
                <Rgi2GrapheneCanvas title="I(2D)/I(G)" subtitle="monolayer indicator" dataArr={ratio_2D_G} w={mapWidth} h={mapHeight} nSpectra={nSpectra} stepSize={stepSize} cmap="custom2DG" vmin={0} vmax={3.5} colorbarLabel="Ratio" />
                <Rgi2GrapheneCanvas title="FWHM(2D)" subtitle="crystal quality" dataArr={fwhm_2D} w={mapWidth} h={mapHeight} nSpectra={nSpectra} stepSize={stepSize} cmap="viridis" vmin={0} vmax={120} colorbarLabel="cm⁻¹" />
                <Rgi2GrapheneCanvas title="I(D)/I(G)" subtitle="defects" dataArr={ratio_D_G} w={mapWidth} h={mapHeight} nSpectra={nSpectra} stepSize={stepSize} cmap="customDGdefects" vmin={0} vmax={1} colorbarLabel="Ratio" />
            </div>
        </div>
    );
}

function Rgi2GrapheneCanvas({ title, subtitle, dataArr, w, h, nSpectra, stepSize = 1, cmap, vmin, vmax, colorbarLabel }: any) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !dataArr) return;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        const img = ctx.createImageData(w, h);
        let min = vmin ?? 0, max = vmax ?? 1;
        if (vmax === null) {
            let sum = 0, cnt = 0;
            for (let i = 0; i < dataArr.length; i++) { const v = dataArr[i]; if (v !== null && v > 0) { sum += v; cnt++; } }
            max = (cnt > 0 ? sum / cnt : 1) * 1.25;
        }
        for (let i = 0; i < nSpectra; i++) {
            const v = dataArr[i]; const x = i % w, y = Math.floor(i / w); const px = (y * w + x) * 4;
            if (v === null || v <= 0 || isNaN(v)) { img.data[px] = 11; img.data[px+1] = 15; img.data[px+2] = 25; img.data[px+3] = 255; }
            else { const [r, g, b] = valToRgb(v, min, max, cmap); img.data[px] = r; img.data[px+1] = g; img.data[px+2] = b; img.data[px+3] = 255; }
        }
        ctx.putImageData(img, 0, 0);
    }, [dataArr, w, h, nSpectra, cmap, vmin, vmax]);

    let dispMax = vmax ?? 1, dispMin = vmin ?? 0;
    if (vmax === null && dataArr) { let s = 0, c = 0; for (const v of dataArr) if (v !== null && v > 0) { s += v; c++; } dispMax = (c > 0 ? s / c : 1) * 1.25; }

    return (
        <div className="flex flex-col w-full h-full bg-[#050910] border border-slate-850 rounded-xl p-2 items-center justify-center select-none hover:border-slate-700 transition-colors">
            <div className="text-center mb-2">
                <div className="text-xs font-black text-slate-200">{title}</div>
                {subtitle && <div className="text-[9px] font-bold text-slate-500 mt-0.5">{subtitle}</div>}
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center w-full my-1">
                <div className="relative border border-slate-800" style={{ height: '100%', aspectRatio: `${w}/${h}` }}>
                    <div className="absolute left-[100%] top-0 bottom-0 pl-1.5 flex flex-row h-full">
                        <div className="w-2 border border-slate-800 h-full" style={{ background: `linear-gradient(to top, ${getCssGradient(cmap)})` }} />
                        <div className="flex flex-col justify-between text-[7px] font-bold text-slate-400 ml-1 relative w-6">
                            {[0,1,2,3,4,5,6].map(i => {
                                const val = dispMax - (i * (dispMax - dispMin) / 6);
                                return <span key={i} className="absolute -translate-y-1/2 whitespace-nowrap" style={{ top: `${(i * 100) / 6}%` }}>{val.toFixed(1)}</span>;
                            })}
                        </div>
                        {colorbarLabel && <div className="relative flex-1 w-full ml-1"><span className="absolute top-1/2 left-0 -translate-y-1/2 origin-left -rotate-90 text-[8px] font-black text-slate-500 uppercase whitespace-nowrap">{colorbarLabel}</span></div>}
                    </div>
                    <canvas ref={canvasRef} className="w-full h-full object-fill block absolute inset-0 z-10" />
                </div>
            </div>
            <div className="text-center mt-4"><span className="text-[9px] font-black text-slate-500 uppercase">X (µm)</span></div>
        </div>
    );
}

// ── Analytics (server-side composite image) ───────────────────────────────────
function RgiAnalyticsTabRgi2({ result, vaultRoot, h5Path }: { result: any; vaultRoot: string; h5Path: string }) {
    const [monoTh, setMonoTh] = useState(1.5);
    const [damageTh, setDamageTh] = useState(0.3);
    const [applySnv, setApplySnv] = useState(false);
    const [b64Image, setB64Image] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        if (!vaultRoot || !h5Path || !result) return;
        setLoading(true); setB64Image(null);
        try {
            const sci = result.scientific_maps || {};
            const getVal = (key: string) => (sci[key]?.values || result.results?.[key] || []).map((v: any) => v === null ? null : parseFloat(v));
            const res = await fetch(`${SCIENCE_ENGINE_URL}/api/rgi/graphene-analytics`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vault_root: vaultRoot, h5_relative_path: h5Path, map_D_I: getVal('height_D'), map_G_I: getVal('height_G'), map_2D_I: getVal('height_2D'), map_2D_fwhm: getVal('fwhm_2D'), mono_th: monoTh, damage_th: damageTh, apply_snv: applySnv }),
            });
            const data = await res.json();
            if (data?.success && data.composite_base64) setB64Image(data.composite_base64);
            else toast.error('Failed to generate analytics image');
        } catch (err: any) { toast.error(err.message || 'Analytics failed'); }
        finally { setLoading(false); }
    }, [vaultRoot, h5Path, result, monoTh, damageTh, applySnv]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="flex-1 w-full h-full flex gap-4 bg-[#050910] text-slate-300 p-4 overflow-hidden">
            <div className="w-64 shrink-0 bg-slate-950/40 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4">
                <div className="flex items-center gap-2"><SlidersHorizontal size={14} className="text-emerald-400" /><span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Analytics Tuning</span></div>
                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400"><span>Mono Threshold</span><span className="font-mono text-emerald-400">{monoTh.toFixed(2)}</span></div>
                    <input type="range" min="0.5" max="3.0" step="0.05" value={monoTh} onChange={e => setMonoTh(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-900 rounded-lg accent-emerald-500" />
                    <div className="text-[8px] text-slate-500">I(2D)/I(G) threshold for monolayer classification.</div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400"><span>Damage Threshold</span><span className="font-mono text-red-400">{damageTh.toFixed(2)}</span></div>
                    <input type="range" min="0.05" max="1.0" step="0.05" value={damageTh} onChange={e => setDamageTh(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-900 rounded-lg accent-red-500" />
                    <div className="text-[8px] text-slate-500">I(D)/I(G) threshold for defective classification.</div>
                </div>
                <label className="flex items-center justify-between bg-slate-900/40 border border-slate-800 rounded-xl p-3 cursor-pointer">
                    <div><span className="text-[10px] font-bold text-slate-300">SNV Norm</span><div className="text-[8px] text-slate-500">Standard Normal Variate</div></div>
                    <button onClick={() => setApplySnv(v => !v)} className={cn('w-8 h-4 rounded-full p-0.5 transition-colors', applySnv ? 'bg-emerald-500' : 'bg-slate-800')}>
                        <div className={cn('w-3 h-3 bg-white rounded-full shadow transition-transform', applySnv ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                </label>
                <div className="mt-auto flex flex-col gap-2">
                    <button onClick={load} disabled={loading} className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2">
                        <RefreshCw size={12} className={cn(loading && 'animate-spin')} /> Refresh
                    </button>
                    <button onClick={() => { if (!b64Image) return; const a = document.createElement('a'); a.href = `data:image/png;base64,${b64Image}`; a.download = 'rgi2_analytics.png'; a.click(); }}
                        disabled={!b64Image || loading} className={cn('w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2', b64Image && !loading ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-950 border border-slate-900 text-slate-600 cursor-not-allowed')}>
                        <Download size={12} /> Export HQ Report
                    </button>
                </div>
            </div>
            <div className="flex-1 bg-slate-950/30 border border-slate-800 rounded-2xl flex items-center justify-center overflow-hidden">
                {loading ? (<div className="flex flex-col items-center gap-3"><RefreshCw className="w-10 h-10 text-emerald-400 animate-spin" /><div className="text-sm font-extrabold text-slate-200">Computing RGI2 Analytics...</div></div>)
                    : b64Image ? (<img src={`data:image/png;base64,${b64Image}`} alt="Analytics" className="w-full h-full object-contain rounded-xl p-4" />)
                    : (<div className="flex flex-col items-center gap-3 text-slate-500"><AlertCircle className="w-12 h-12 opacity-20" /><div className="text-xs font-bold uppercase">No analytics yet</div></div>)}
            </div>
        </div>
    );
}

// ── Pixel Fit Inspector ───────────────────────────────────────────────────────
function RgiInspectTabRgi2({ result, mapWidth, mapHeight, selectedPixelIndex, setSelectedPixelIndex, pixelFitData, isLoadingPixelFit, fitError, selectedMapKey, setSelectedMapKey }: {
    result: any; mapWidth: number; mapHeight: number;
    selectedPixelIndex: number | null; setSelectedPixelIndex: (idx: number | null) => void;
    pixelFitData: any; isLoadingPixelFit: boolean; fitError: string | null;
    selectedMapKey: string; setSelectedMapKey: (k: string) => void;
}) {
    const [showRaw, setShowRaw] = useState(true);
    const [showBaseline, setShowBaseline] = useState(true);
    const [showComponents, setShowComponents] = useState(true);

    const sci = useMemo(() => (result?.scientific_maps as Record<string, { label: string; values: Array<number | null> }>) || {}, [result]);
    const scientificOptions = useMemo(() => Object.entries(sci).map(([key, p]) => ({ key, label: p.label || key.replace(/_/g, ' ') })), [sci]);

    // Build map heatmap
    const mapTrace2 = useMemo(() => {
        if (!result) return [];
        const z: number[][] = [], text: string[][] = [];
        const total = result.n_spectra || 0;
        for (let y = 0; y < mapHeight; y++) {
            const row: number[] = [], tRow: string[] = [];
            for (let x = 0; x < mapWidth; x++) {
                const idx = y * mapWidth + x;
                if (idx >= total) { row.push(NaN); tRow.push(''); continue; }
                const val = selectedMapKey === 'r2' ? result.r2?.[idx]
                    : selectedMapKey === 'snr' ? result.snr?.[idx]
                    : selectedMapKey === 'rmse' ? result.rmse?.[idx]
                    : sci[selectedMapKey]?.values?.[idx] ?? result.results?.[selectedMapKey]?.[idx];
                row.push(val != null ? val : NaN);
                tRow.push(`Pixel #${idx} (${x},${y})\nValue: ${val != null ? val.toFixed(3) : 'NaN'}`);
            }
            z.push(row); text.push(tRow);
        }
        return [{ z, text, type: 'heatmap', hoverinfo: 'text', colorscale: 'Viridis', showscale: true, colorbar: { tickfont: { color: '#94a3b8', size: 9 } } } as any];
    }, [result, selectedMapKey, mapWidth, mapHeight, sci]);

    const miniMapTraces = useMemo(() => {
        const traces = [...mapTrace2];
        if (selectedPixelIndex !== null) {
            traces.push({ x: [selectedPixelIndex % mapWidth], y: [Math.floor(selectedPixelIndex / mapWidth)], type: 'scatter', mode: 'markers', hoverinfo: 'skip', showlegend: false, marker: { symbol: 'square-open', size: 10, line: { color: '#00ffff', width: 2 } } });
        }
        return traces;
    }, [mapTrace2, selectedPixelIndex, mapWidth]);

    const handleMapClick = useCallback((ev: any) => {
        if (!ev?.points?.[0]) return;
        const pt = ev.points[0];
        let col = Math.floor(pt.x), row = Math.floor(pt.y);
        if (Array.isArray(pt.pointNumber)) { row = pt.pointNumber[0]; col = pt.pointNumber[1]; }
        row = Math.max(0, Math.min(mapHeight - 1, Math.round(row)));
        col = Math.max(0, Math.min(mapWidth - 1, Math.round(col)));
        const idx = row * mapWidth + col;
        if (idx >= 0 && idx < (result?.n_spectra || 0)) setSelectedPixelIndex(idx);
    }, [mapWidth, mapHeight, result, setSelectedPixelIndex]);

    // Pixel fit traces
    const plotTraces = useMemo(() => {
        if (!pixelFitData?.original) return [];
        const traces: any[] = [];
        const origX = pixelFitData.original.map((p: any) => p.x);
        if (showRaw) traces.push({ x: origX, y: pixelFitData.original.map((p: any) => p.y), mode: 'lines', name: 'Raw', line: { color: '#64748b', width: 1.2, dash: 'dot' } });
        if (showBaseline && pixelFitData.baseline) traces.push({ x: origX, y: pixelFitData.baseline.map((p: any) => p.y), mode: 'lines', name: 'Baseline', line: { color: '#f97316', width: 1.2 } });
        if (pixelFitData.corrected) traces.push({ x: origX, y: pixelFitData.corrected.map((p: any) => p.y), mode: 'lines', name: 'Corrected', line: { color: '#10b981', width: 1.8 } });
        if (pixelFitData.best_fit) traces.push({ x: origX, y: pixelFitData.best_fit.map((p: any) => p.y), mode: 'lines', name: 'Best Fit', line: { color: '#6366f1', width: 2 } });
        if (showComponents && pixelFitData.components) {
            Object.entries(pixelFitData.components).forEach(([name, pts], idx) => {
                const color = PEAK_COLORS[idx % PEAK_COLORS.length];
                traces.push({ x: (pts as any[]).map(p => p.x), y: (pts as any[]).map(p => p.y), mode: 'lines', fill: 'tozeroy', fillcolor: `${color}10`, name: name.replace(/_/g, ' '), line: { color, width: 1.2 } });
            });
        }
        return traces;
    }, [pixelFitData, showRaw, showBaseline, showComponents]);

    // Summary stats for inspect tab
    const nTotal = result?.n_spectra || 0;
    const failed = useMemo(() => Array.from({ length: nTotal }, (_, i) => !(result?.success_map?.[i])).filter(Boolean).length, [result, nTotal]);
    const passed = nTotal - failed;

    return (
        <div className="flex-1 w-full h-full flex flex-col gap-3 bg-[#050910] text-slate-300 p-4 overflow-hidden min-h-[500px]">
            <div className="grid grid-cols-4 gap-3 shrink-0">
                {[['Failed', failed, 'red'], ['Passed', passed, 'green'], ['Total', nTotal, 'slate'], ['R2 Min', result?.r2_mean?.toFixed(4) ?? '-', 'cyan']].map(([l, v, t]) => (
                    <div key={l as string} className={cn('rounded-xl border px-3 py-2', { red: 'border-red-900/50 text-red-400', green: 'border-emerald-900/50 text-emerald-400', slate: 'border-slate-800 text-slate-300', cyan: 'border-cyan-900/50 text-cyan-400' }[t as string])}>
                        <div className="text-[8px] font-black uppercase opacity-60">{l}</div>
                        <div className="mt-0.5 text-xs font-black font-mono">{String(v)}</div>
                    </div>
                ))}
            </div>
            <div className="flex-1 flex gap-4 min-h-0 border border-slate-850 rounded-2xl bg-slate-900/10 overflow-hidden">
                <div className="w-[400px] border-r border-slate-850 flex flex-col bg-slate-950/20 shrink-0 overflow-hidden p-4 gap-3">
                    <div className="text-[10px] font-black uppercase text-slate-400 flex justify-between shrink-0">
                        <span>Pixel Selector Map</span>
                        {selectedPixelIndex !== null && <span className="text-cyan-400 font-mono">X:{selectedPixelIndex % mapWidth} Y:{Math.floor(selectedPixelIndex / mapWidth)}</span>}
                    </div>
                    <select className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none shrink-0" value={selectedMapKey} onChange={e => setSelectedMapKey(e.target.value)}>
                        <option value="r2">R² Quality</option>
                        <option value="snr">SNR</option>
                        <option value="rmse">RMSE</option>
                        {scientificOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                    <div className="flex-1 min-h-0 border border-slate-850 rounded-xl overflow-hidden bg-[#050910]">
                        <Plot data={miniMapTraces} layout={{ autosize: true, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#020617', font: { color: '#94a3b8' }, margin: { l: 30, r: 55, t: 10, b: 20 }, xaxis: { showgrid: false }, yaxis: { showgrid: false, scaleanchor: 'x' } }} config={{ displayModeBar: false, responsive: true }} useResizeHandler style={{ width: '100%', height: '100%' }} onClick={handleMapClick} />
                    </div>
                </div>
                <div className="flex-1 flex flex-col bg-slate-950/10 overflow-hidden p-4">
                    {selectedPixelIndex === null ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-500 gap-2"><Eye size={24} className="text-slate-700 animate-pulse" />Select a pixel to inspect its fit.</div>
                    ) : isLoadingPixelFit ? (
                        <div className="flex-1 flex items-center justify-center gap-2 text-xs text-slate-400"><Loader2 size={24} className="animate-spin text-cyan-500" />Fitting spectrum #{selectedPixelIndex}...</div>
                    ) : fitError && !pixelFitData ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-xs text-red-400"><AlertCircle size={24} /><span className="font-extrabold uppercase">Solver Error</span><p className="text-slate-500 text-[10px] max-w-sm text-center">{fitError}</p></div>
                    ) : pixelFitData ? (
                        <div className="flex-1 flex overflow-hidden gap-4 min-h-0">
                            <div className="flex-1 flex flex-col min-w-0">
                                <div className="flex items-center justify-between mb-2 gap-3 shrink-0">
                                    <div className="text-[10px] font-black text-slate-200 uppercase">Spectrum #{selectedPixelIndex}</div>
                                    <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800 px-2.5 py-1 rounded-xl">
                                        <label className="flex items-center gap-1.5 text-[9px] uppercase font-bold text-slate-400 cursor-pointer">
                                            <input type="checkbox" checked={showRaw} onChange={e => setShowRaw(e.target.checked)} className="w-3 h-3" />
                                            Raw
                                        </label>
                                        <label className="flex items-center gap-1.5 text-[9px] uppercase font-bold text-slate-400 cursor-pointer">
                                            <input type="checkbox" checked={showBaseline} onChange={e => setShowBaseline(e.target.checked)} className="w-3 h-3" />
                                            Baseline
                                        </label>
                                        <label className="flex items-center gap-1.5 text-[9px] uppercase font-bold text-slate-400 cursor-pointer">
                                            <input type="checkbox" checked={showComponents} onChange={e => setShowComponents(e.target.checked)} className="w-3 h-3" />
                                            Components
                                        </label>
                                    </div>
                                </div>
                                <div className="flex-1 min-h-0 border border-slate-900 rounded-xl overflow-hidden bg-[#050910]">
                                    <Plot data={plotTraces} layout={{ autosize: true, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#080d16', font: { family: 'Inter, sans-serif', size: 10, color: '#94a3b8' }, margin: { l: 45, r: 15, t: 15, b: 35 }, xaxis: { gridcolor: '#1e293b', color: '#94a3b8', autorange: true }, yaxis: { gridcolor: '#1e293b', color: '#94a3b8', autorange: true } }} config={{ displayModeBar: false, responsive: true }} useResizeHandler style={{ width: '100%', height: '100%' }} />
                                </div>
                            </div>
                            {pixelFitData.parameters && (
                                <div className="w-56 flex flex-col border border-slate-900 bg-slate-950/20 rounded-xl overflow-hidden shrink-0">
                                    <div className="bg-slate-900/40 px-3 py-2 border-b border-slate-900 flex justify-between items-center shrink-0">
                                        <span className="text-[9px] font-black text-slate-400 uppercase">Parameters</span>
                                        {pixelFitData.metrics?.r_squared != null && <span className="text-[10px] font-mono text-cyan-400">R²: {pixelFitData.metrics.r_squared.toFixed(4)}</span>}
                                    </div>
                                    <div className="flex-1 overflow-y-auto text-[10px] bg-[#03060c]">
                                        <table className="w-full text-left">
                                            <thead className="sticky top-0 bg-slate-950 border-b border-slate-900 text-[8px] font-bold text-slate-500 uppercase">
                                                <tr><th className="p-2">Name</th><th className="p-2 text-right">Value</th><th className="p-2 text-right">±</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-900 font-mono text-slate-400">
                                                {pixelFitData.parameters.map((p: any) => (
                                                    <tr key={p.name} className="hover:bg-slate-900/30">
                                                        <td className="p-2 font-sans text-slate-300 truncate max-w-[90px]" title={p.name}>{p.name.replace(/_/g, ' ')}</td>
                                                        <td className="p-2 text-right text-slate-200">{p.value != null ? p.value.toFixed(2) : '-'}</td>
                                                        <td className="p-2 text-right text-slate-600 text-[9px]">{p.stderr != null ? `±${p.stderr.toFixed(2)}` : '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

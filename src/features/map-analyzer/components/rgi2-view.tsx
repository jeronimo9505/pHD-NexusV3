'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    Activity,
    BarChart3,
    BookOpenText,
    BrainCircuit,
    CheckCircle2,
    Database,
    Info,
    Loader2,
    Play,
    Save,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FittingPeakConfig, FittingPeakTable, PEAK_COLORS } from './fitting-peak-table';
import { SCIENCE_ENGINE_URL } from '@/lib/desktop';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

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
            } catch {
                // Saved sessions are optional.
            }
        }
        loadSaved();
        return () => {
            cancelled = true;
        };
    }, [h5Path, vaultRoot]);

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
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-300">
                                    <BarChart3 size={14} className="text-emerald-300" />
                                    Scientific Review
                                </div>
                                <select className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs" value={selectedMapKey} onChange={e => setSelectedMapKey(e.target.value)}>
                                    {mapKeys.map(key => <option key={key} value={key}>{key}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-3 min-h-0">
                                <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
                                    {mapTrace.length ? (
                                        <Plot data={mapTrace as any} layout={{ autosize: true, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#020617', font: { color: '#94a3b8' }, margin: { l: 35, r: 20, t: 20, b: 30 } }} useResizeHandler className="w-full h-full" />
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-slate-500">No RGI2 fit results</div>
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

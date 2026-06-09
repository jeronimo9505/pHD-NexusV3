'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { 
    Wand2, Play, AlertCircle, CheckCircle2, Loader2, RefreshCw, 
    Sliders, Activity, ChevronRight, Check, Sparkles, SlidersHorizontal,
    LayoutGrid, BarChart3, Database, ShieldAlert, Cpu, FileText,
    ChevronDown, ChevronUp, Save
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FittingPeakTable, FittingPeakConfig, PEAK_COLORS } from './fitting-peak-table';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

const ENGINE = 'http://127.0.0.1:8888';

const BASELINE_METHODS = [
    { value: 'asls',     label: 'asLS',    desc: 'Asymmetric Least Squares (smooth, general)' },
    { value: 'airpls',   label: 'airPLS',  desc: 'Adaptive iterative (good for broad baselines)' },
    { value: 'linear',   label: 'Linear',  desc: 'Linear background fit' },
    { value: 'poly',     label: 'Polynomial', desc: 'Custom order polynomial fit' },
    { value: 'none',     label: 'None',    desc: 'No baseline correction' },
];

const NORMALIZATION_METHODS = [
    { value: 'vector',   label: 'Vector (L2 Norm)', desc: 'Divide by L2 vector length (recommended)' },
    { value: 'area',     label: 'Area Integration', desc: 'Normalize area under curve to 1' },
    { value: 'max',      label: 'Max Peak Height',  desc: 'Scale max intensity to 1' },
];

const RESULT_VIEWS = [
    { value: 'map', label: 'Map' },
    { value: 'metrics', label: 'Metrics' },
    { value: 'histograms', label: 'Histograms' },
    { value: 'relationships', label: 'Relationships' },
] as const;

const QUALITY_CLASS_LABELS: Record<number, { label: string; color: string; desc: string }> = {
    0: { label: "Background / Substrate", color: "#64748b", desc: "No graphene signal detected" },
    1: { label: "Defect-rich Graphene", color: "#f59e0b", desc: "High D-band intensity (ID/IG > 0.4)" },
    2: { label: "Monolayer Graphene", color: "#6366f1", desc: "Symmetric, narrow 2D band (FWHM < 32 cm⁻¹)" },
    3: { label: "Multilayer Graphene", color: "#8b5cf6", desc: "Broadened 2D band shape (FWHM >= 32 cm⁻¹)" },
    4: { label: "Low Confidence Fit", color: "#ef4444", desc: "Converged but poor fit quality (R² < 0.85)" },
};

const AXIS = {
    gridcolor: '#1e293b', zerolinecolor: '#334155', color: '#94a3b8',
    tickfont: { size: 10, color: '#94a3b8' },
};

const LAYOUT_BASE = {
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#080d16',
    font: { family: 'Inter, sans-serif', size: 10, color: '#94a3b8' },
    margin: { l: 55, r: 20, t: 10, b: 40 },
    xaxis: { ...AXIS, title: { text: 'Wavenumber (cm⁻¹)', font: { size: 10 } } },
    yaxis: { ...AXIS, title: { text: 'Intensity (a.u.)', font: { size: 10 } } },
};

const WORKFLOW_STAGES = [
    {
        number: 1,
        label: 'Map Intelligence',
        goal: 'Separate the Raman map into spectral families before fitting.',
        visual: 'PCA variance, cluster map, cluster sizes.',
        result: 'Representative pixels and ML-ready map model.'
    },
    {
        number: 2,
        label: 'Cluster Models',
        goal: 'Fit one representative spectrum per family and tune D/G/2D seeds.',
        visual: 'Raw, corrected, baseline, best fit and peak components.',
        result: 'Cluster-specific fitting priors for the full map.'
    },
    {
        number: 3,
        label: 'Scientific Maps',
        goal: 'Run constrained pixel fitting and convert fits into interpretable maps.',
        visual: 'Graphene class, parameter maps, R2, SNR and confidence summary.',
        result: 'Quality classes, band parameters and publication-ready outputs.'
    }
] as const;

function ResultMetric({
    label,
    value,
    detail,
    tone = 'emerald'
}: {
    label: string;
    value: string | number;
    detail: string;
    tone?: 'emerald' | 'indigo' | 'cyan' | 'amber';
}) {
    const toneClass = {
        emerald: 'text-emerald-400',
        indigo: 'text-indigo-400',
        cyan: 'text-cyan-400',
        amber: 'text-amber-400'
    }[tone];

    return (
        <div className="border border-slate-850 bg-slate-950/50 rounded-lg p-3">
            <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</div>
            <div className={cn("text-sm font-black mt-1", toneClass)}>{value}</div>
            <div className="text-[9px] text-slate-500 mt-0.5 truncate">{detail}</div>
        </div>
    );
}

const sanitizePrefix = (name: string) => {
    let s = name.replace(/[^a-zA-Z0-9_]/g, '_');
    if (s && /^\d/.test(s)) {
        s = 'p_' + s;
    }
    return s;
};

interface Props {
    vaultRoot: string;
    h5Path: string;
    mapWidth: number;
    mapHeight: number;
    nSpectra: number;
    onFileCreated?: (file: any) => void;
}

export function RgiView({ vaultRoot, h5Path, mapWidth, mapHeight, nSpectra, onFileCreated }: Props) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [status, setStatus] = useState<'idle' | 'segmenting' | 'fitting_rep' | 'mapping' | 'error'>('idle');
    const [showStageDetails, setShowStageDetails] = useState<boolean>(false);
    const [fitProgress, setFitProgress] = useState<{ completed: number; total: number; active: boolean } | null>(null);
    const [plotRevision, setPlotRevision] = useState<number>(0);

    // Preprocessing & ML params
    const [cropMin, setCropMin] = useState<number>(1100);
    const [cropMax, setCropMax] = useState<number>(3100);
    const [baselineMethod, setBaselineMethod] = useState<string>('asls');
    const [baselineParams, setBaselineParams] = useState<Record<string, any>>({ lam: 1e5, p: 0.01, order: 2 });
    const [nPCAComponents, setNPCAComponents] = useState<number>(5);
    const [nNMFComponents, setNNMFComponents] = useState<number>(3);
    const [nClusters, setNClusters] = useState<number>(4);
    const [normalization, setNormalization] = useState<string>('vector');
    const [xShift, setXShift] = useState<number>(0.0);
    const [showRawSpectrum, setShowRawSpectrum] = useState<boolean>(true);
    const [showBaseline, setShowBaseline] = useState<boolean>(true);
    const [showComponents, setShowComponents] = useState<boolean>(true);

    // Step 1 Results
    const [segmentationData, setSegmentationData] = useState<any | null>(null);

    // Step 2 Cluster Models State
    const [activeCluster, setActiveCluster] = useState<number>(0);
    const [clusterPeaks, setClusterPeaks] = useState<Record<number, FittingPeakConfig[]>>({});
    const [clusterFitData, setClusterFitData] = useState<Record<number, any>>({});
    const [isLoadingRepFit, setIsLoadingRepFit] = useState<boolean>(false);
    const [showLimits, setShowLimits] = useState<boolean>(false);
    const [showExpr, setShowExpr] = useState<boolean>(false);

    // Step 3 Map Fitting Results
    const [mapFitResult, setMapFitResult] = useState<any | null>(null);
    const [selectedMapKey, setSelectedMapKey] = useState<string>('graphene_quality_class');
    const [resultsView, setResultsView] = useState<'map' | 'metrics' | 'histograms' | 'relationships'>('map');
    const [selectedHistogramKey, setSelectedHistogramKey] = useState<string>('pos_G');
    const [scatterXKey, setScatterXKey] = useState<string>('pos_G');
    const [scatterYKey, setScatterYKey] = useState<string>('pos_2D');
    const [thresholdSNR, setThresholdSNR] = useState<number>(3.0);

    // Reset and try to load saved session when selected file changes
    useEffect(() => {
        setStep(1);
        setSegmentationData(null);
        setClusterPeaks({});
        setClusterFitData({});
        setMapFitResult(null);
        setResultsView('map');
        setSelectedHistogramKey('pos_G');
        setScatterXKey('pos_G');
        setScatterYKey('pos_2D');
        setStatus('idle');

        if (!h5Path || !vaultRoot) return;

        const loadSavedRgiSession = async () => {
            try {
                const res = await fetch(`${ENGINE}/api/rgi/load-results`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vault_root: vaultRoot,
                        h5_relative_path: h5Path
                    })
                });
                const data = await res.json();
                if (data && data.success && data.session_data) {
                    const session = data.session_data;
                    
                    // Restore Step 1 parameters
                    if (session.cropMin !== undefined) setCropMin(session.cropMin);
                    if (session.cropMax !== undefined) setCropMax(session.cropMax);
                    if (session.baselineMethod !== undefined) setBaselineMethod(session.baselineMethod);
                    if (session.baselineParams !== undefined) setBaselineParams(session.baselineParams);
                    if (session.xShift !== undefined) setXShift(session.xShift);
                    if (session.nPCAComponents !== undefined) setNPCAComponents(session.nPCAComponents);
                    if (session.nNMFComponents !== undefined) setNNMFComponents(session.nNMFComponents);
                    if (session.nClusters !== undefined) setNClusters(session.nClusters);
                    if (session.normalization !== undefined) setNormalization(session.normalization);
                    
                    // Restore Step 1 Output
                    if (session.segmentationData) setSegmentationData(session.segmentationData);

                    // Restore Step 2 Outputs & Inputs
                    if (session.clusterPeaks) setClusterPeaks(session.clusterPeaks);
                    if (session.clusterFitData) setClusterFitData(session.clusterFitData);
                    if (session.activeCluster !== undefined) setActiveCluster(session.activeCluster);

                    // Restore Step 3 Outputs & Inputs
                    if (session.mapFitResult) {
                        setMapFitResult(session.mapFitResult);
                        
                        // Select default parameters to avoid crashes
                        const mfr = session.mapFitResult;
                        setSelectedMapKey('graphene_quality_class');
                        setSelectedHistogramKey(mfr.histograms?.pos_G ? 'pos_G' : Object.keys(mfr.histograms || {})[0] || '');
                        setScatterXKey(mfr.scientific_maps?.pos_G ? 'pos_G' : Object.keys(mfr.scientific_maps || {})[0] || '');
                        setScatterYKey(mfr.scientific_maps?.pos_2D ? 'pos_2D' : Object.keys(mfr.scientific_maps || {})[1] || '');
                    }
                    if (session.thresholdSNR !== undefined) setThresholdSNR(session.thresholdSNR);

                    // Navigate directly to Step 3
                    setStep(3);
                    toast.success("Loaded saved RGI session successfully!");
                }
            } catch (err) {
                console.error("Failed to load saved RGI session:", err);
            }
        };

        loadSavedRgiSession();
    }, [h5Path, vaultRoot]);

    const [isSavingResults, setIsSavingResults] = useState(false);
    const [saveSuffix, setSaveSuffix] = useState<string>(() => {
        const d = new Date();
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `rgi_${yy}${mm}${dd}`;
    });

    const handleSaveRgiResults = async () => {
        if (!segmentationData || !mapFitResult) {
            toast.error("Please run the analysis through Step 3 before saving results.");
            return;
        }

        setIsSavingResults(true);
        try {
            const sessionPayload = {
                cropMin,
                cropMax,
                baselineMethod,
                baselineParams,
                xShift,
                nPCAComponents,
                nNMFComponents,
                nClusters,
                normalization,
                segmentationData,
                clusterPeaks,
                clusterFitData,
                activeCluster,
                mapFitResult,
                thresholdSNR
            };

            const res = await fetch(`${ENGINE}/api/rgi/save-results`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_path: h5Path,
                    session_data: sessionPayload,
                    save_suffix: saveSuffix
                })
            });

            const data = await res.json();
            if (data.success) {
                toast.success("RGI results saved successfully!");
                if (onFileCreated && data.file_details) {
                    onFileCreated(data.file_details);
                }
            } else {
                toast.error(data.message || "Failed to save results.");
            }
        } catch (e) {
            console.error("Error saving results:", e);
            toast.error("Failed to connect to science engine.");
        } finally {
            setIsSavingResults(false);
        }
    };

    // Handle Segmentation
    const handleRunSegmentation = async () => {
        setStatus('segmenting');
        try {
            const res = await fetch(`${ENGINE}/api/rgi/build-map-model`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_path: h5Path,
                    crop_range: [cropMin, cropMax],
                    baseline_method: baselineMethod,
                    baseline_params: baselineParams,
                    x_shift: xShift,
                    n_components_pca: nPCAComponents,
                    n_components_nmf: nNMFComponents,
                    n_clusters: nClusters,
                    normalization: normalization
                })
            });
            const data = await res.json();
            if (data.success) {
                setSegmentationData(data);
                toast.success("Raman map segmentation finished successfully!");
                
                // Initialize default graphene seeds for each cluster
                const initialSeeds: Record<number, FittingPeakConfig[]> = {};
                for (let c = 0; c < data.n_clusters; c++) {
                    const rep = data.rep_spectra.find((s: any) => s.cluster_id === c);
                    const isBg = data.cluster_sizes[c] / nSpectra < 0.2 && c === 0; // heuristic
                    
                    initialSeeds[c] = [
                        {
                            id: `rgi_peak_${c}_G`,
                            name: 'G',
                            model: 'Lorentzian',
                            center: 1585.0,
                            center_min: 1540.0,
                            center_max: 1620.0,
                            fwhm_init: 18.0,
                            amplitude: isBg ? 10.0 : 500.0,
                            active: true,
                            use_limits: true,
                            fixedParams: {}, minParams: {}, maxParams: {}, exprParams: {}
                        },
                        {
                            id: `rgi_peak_${c}_2D`,
                            name: '2D',
                            model: 'Lorentzian',
                            center: 2680.0,
                            center_min: 2630.0,
                            center_max: 2730.0,
                            fwhm_init: 28.0,
                            amplitude: isBg ? 10.0 : 800.0,
                            active: true,
                            use_limits: true,
                            fixedParams: {}, minParams: {}, maxParams: {}, exprParams: {}
                        },
                        {
                            id: `rgi_peak_${c}_D`,
                            name: 'D',
                            model: 'Lorentzian',
                            center: 1347.0,
                            center_min: 1310.0,
                            center_max: 1380.0,
                            fwhm_init: 30.0,
                            amplitude: 10.0,
                            active: true,
                            use_limits: true,
                            fixedParams: {}, minParams: {}, maxParams: {}, exprParams: {}
                        }
                    ];
                }
                setClusterPeaks(initialSeeds);
                setActiveCluster(0);
                setStep(2);
            } else {
                toast.error(data.message || "Segmentation failed.");
            }
        } catch (e) {
            toast.error("Failed to connect to science engine");
        } finally {
            setStatus('idle');
        }
    };

    // Fit Representative Spectrum for cluster
    const handleFitRepresentative = async () => {
        const peaks = clusterPeaks[activeCluster];
        if (!peaks || peaks.filter(p => p.active).length === 0) {
            toast.warning("Define at least one active peak seed.");
            return;
        }

        setIsLoadingRepFit(true);
        try {
            const res = await fetch(`${ENGINE}/api/rgi/fit-representatives`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_path: h5Path,
                    cluster_id: activeCluster,
                    peaks: peaks,
                    baseline_method: baselineMethod,
                    baseline_params: baselineParams,
                    x_shift: xShift,
                    crop_range: [cropMin, cropMax]
                })
            });
            const data = await res.json();
            if (data.success) {
                setClusterFitData(prev => ({ ...prev, [activeCluster]: data }));
                setPlotRevision(prev => prev + 1);
                toast.success(`Representative spectrum fit for Cluster #${activeCluster} converged!`);

                // Update peak centers in cluster state
                const updatedPeaks = peaks.map(p => {
                    const safeName = sanitizePrefix(p.name);
                    const centerParam = data.parameters.find((param: any) => param.name === `${safeName}_center`);
                    const fwhmParam = data.parameters.find((param: any) => param.name === `${safeName}_fwhm`);
                    const ampParam = data.parameters.find((param: any) => param.name === `${safeName}_amplitude`);
                    
                    return {
                        ...p,
                        center: centerParam ? Math.round(centerParam.value * 100) / 100 : p.center,
                        fwhm_init: fwhmParam ? Math.round(fwhmParam.value * 100) / 100 : p.fwhm_init,
                        amplitude: ampParam ? Math.round(ampParam.value * 100) / 100 : p.amplitude
                    };
                });
                setClusterPeaks(prev => ({ ...prev, [activeCluster]: updatedPeaks }));
            } else {
                toast.error(data.message || "Fit failed to converge.");
            }
        } catch (e) {
            toast.error("Failed to connect to science engine");
        } finally {
            setIsLoadingRepFit(false);
        }
    };

    const handleDownloadFitTxt = () => {
        const fit = clusterFitData[activeCluster];
        if (!fit) return;

        let content = `SPECTROview Cluster Representative Spectrum Fit Report\n`;
        content += `======================================================\n`;
        content += `Cluster ID: #${activeCluster}\n`;
        content += `R2 (Coefficient of Determination): ${fit.metrics?.r_squared?.toFixed(6) || 'N/A'}\n`;
        content += `RMSE (Root Mean Square Error): ${fit.metrics?.rmse?.toFixed(6) || 'N/A'}\n`;
        content += `Chi-Squared Reduced: ${fit.metrics?.chi2_reduced?.toFixed(6) || 'N/A'}\n`;
        content += `AIC (Akaike Info Criterion): ${fit.metrics?.aic?.toFixed(6) || 'N/A'}\n`;
        content += `BIC (Bayesian Info Criterion): ${fit.metrics?.bic?.toFixed(6) || 'N/A'}\n\n`;
        content += `Fitted Parameters:\n`;
        content += `------------------\n`;
        content += `Parameter Name\tValue\tStandard Error\n`;
        if (Array.isArray(fit.parameters)) {
            fit.parameters.forEach((p: any) => {
                content += `${p.name}\t${p.value}\t${p.stderr !== null && p.stderr !== undefined ? p.stderr : 'N/A'}\n`;
            });
        }
        content += `\nSpectral Coordinates Data:\n`;
        content += `--------------------------\n`;
        content += `Wavenumber (cm^-1)\tRaw Intensity\tBaseline\tCorrected Intensity\tBest Fit Envelope\tResiduals\n`;
        if (fit.original) {
            for (let i = 0; i < fit.original.length; i++) {
                const wn = fit.original[i].x;
                const raw = fit.original[i].y;
                const base = fit.baseline?.[i]?.y ?? 0;
                const corr = fit.corrected?.[i]?.y ?? 0;
                const best = fit.best_fit?.[i]?.y ?? 0;
                const resid = fit.residuals?.[i]?.y ?? 0;
                content += `${wn.toFixed(3)}\t${raw.toFixed(3)}\t${base.toFixed(3)}\t${corr.toFixed(3)}\t${best.toFixed(3)}\t${resid.toFixed(3)}\n`;
            }
        }

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cluster_${activeCluster}_fit_report.txt`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Representative fit report downloaded successfully!");
    };

    // Plotly interactive seeding (Double click to seed)
    const handleChartClick = (event: any) => {
        if (!event || !event.points || event.points.length === 0) return;
        const pt = event.points[0];
        const xPos = pt.x;
        const yVal = pt.y;

        const newPeak: FittingPeakConfig = {
            id: `rgi_peak_${activeCluster}_${Date.now()}`,
            name: `Peak_${(clusterPeaks[activeCluster]?.length || 0) + 1}`,
            model: 'Lorentzian',
            center: Math.round(xPos * 10) / 10,
            center_min: Math.round((xPos - 30) * 10) / 10,
            center_max: Math.round((xPos + 30) * 10) / 10,
            fwhm_init: 20,
            amplitude: Math.round(yVal * 10) / 10,
            active: true,
            use_limits: true,
            fixedParams: {},
            minParams: {},
            maxParams: {},
            exprParams: {}
        };

        setClusterPeaks(prev => ({
            ...prev,
            [activeCluster]: [...(prev[activeCluster] || []), newPeak]
        }));
        toast.success(`Seeded Lorentzian peak at ${newPeak.center.toFixed(1)} cm⁻¹ for Cluster #${activeCluster}`);
    };

    // Run Constrained Map Fit
    const handleRunMapFit = async () => {
        setStatus('mapping');
        setFitProgress({ completed: 0, total: nSpectra, active: true });
        
        // Start polling progress
        const intervalId = setInterval(async () => {
            try {
                const res = await fetch(`${ENGINE}/api/rgi/fit-progress`);
                const data = await res.json();
                if (data) {
                    setFitProgress(data);
                }
            } catch (e) {
                // Ignore polling errors
            }
        }, 400);

        try {
            // Build the override config dict: cluster_id -> peaks
            const overrides: Record<number, any[]> = {};
            for (let c = 0; c < nClusters; c++) {
                if (clusterPeaks[c]) {
                    overrides[c] = clusterPeaks[c];
                }
            }

            const res = await fetch(`${ENGINE}/api/rgi/run-constrained-map-fit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_path: h5Path,
                    peaks: clusterPeaks[0] || [], // fallback
                    baseline_method: baselineMethod,
                    baseline_params: baselineParams,
                    x_shift: xShift,
                    crop_range: [cropMin, cropMax],
                    threshold_snr: thresholdSNR,
                    cluster_models_override: overrides
                })
            });
            const data = await res.json();
            if (data.success) {
                setMapFitResult(data);
                toast.success("RGI constrained map fit completed successfully!");
                
                // Select first parameter map key if quality class has no valid metrics
                const keys = Object.keys(data.results);
                if (keys.length > 0) {
                    setSelectedMapKey('graphene_quality_class');
                }
                setSelectedHistogramKey(data.histograms?.pos_G ? 'pos_G' : Object.keys(data.histograms || {})[0] || '');
                setScatterXKey(data.scientific_maps?.pos_G ? 'pos_G' : Object.keys(data.scientific_maps || {})[0] || '');
                setScatterYKey(data.scientific_maps?.pos_2D ? 'pos_2D' : Object.keys(data.scientific_maps || {})[1] || '');
                setStep(3);
            } else {
                toast.error(data.message || "Batch map fitting failed.");
            }
        } catch (e) {
            toast.error("Connection failed.");
        } finally {
            clearInterval(intervalId);
            setFitProgress(null);
            setStatus('idle');
        }
    };

    // Plotly cluster map trace
    const clusterMapTrace = useMemo(() => {
        if (!segmentationData || !segmentationData.representatives || !segmentationData.cluster_labels) return [];
        const z: number[][] = [];
        const text: string[][] = [];
        
        for (let y = 0; y < mapHeight; y++) {
            const row: number[] = [];
            const textRow: string[] = [];
            for (let x = 0; x < mapWidth; x++) {
                const idx = y * mapWidth + x;
                if (idx >= nSpectra) {
                    row.push(NaN);
                    textRow.push("Empty Pixel");
                    continue;
                }
                const clusterId = segmentationData.cluster_labels[idx];
                row.push(clusterId);
                textRow.push(`Pixel #${idx} (X:${x} Y:${y})\nCluster: #${clusterId}`);
            }
            z.push(row);
            text.push(textRow);
        }

        const colors = ['#6366f1', '#10b981', '#ec4899', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6', '#3b82f6', '#ef4444'];
        const colorscale = colors.slice(0, nClusters).map((color, i) => [
            i / (nClusters - 1 || 1), color
        ]);

        return [{
            z,
            text,
            type: 'heatmap' as const,
            hoverinfo: 'text',
            colorscale: colorscale,
            showscale: false
        } as any];
    }, [segmentationData, mapWidth, mapHeight, nSpectra, nClusters]);

    // Render Plotly traces for representative spectrum fit (Step 2)
    const repPlotlyTraces = useMemo(() => {
        const fit = clusterFitData[activeCluster];
        const rep = segmentationData?.rep_spectra?.find((s: any) => s.cluster_id === activeCluster);
        if (!rep) return [];

        const traces: any[] = [];
        const peaksList = clusterPeaks[activeCluster] || [];

        if (fit && fit.original) {
            // Use the fit's own x-axis (already x-shifted and cropped by the engine)
            const fitX = fit.original.map((p: any) => p.x);
            const correctedY: number[] = fit.corrected.map((p: any) => p.y);
            const maxCorrY = Math.max(...correctedY, 1.0);

            // 1. Seed indicator dashes (scale to corrected spectrum)
            peaksList.forEach((pk, idx) => {
                if (!pk.active) return;
                const color = PEAK_COLORS[idx % PEAK_COLORS.length];
                traces.push({
                    x: [pk.center, pk.center],
                    y: [0, maxCorrY * 0.85],
                    mode: 'lines+markers',
                    name: `${pk.name} Seed`,
                    line: { color, width: 1.5, dash: 'dash' },
                    marker: { color, size: 5, symbol: 'diamond' }
                });
            });

            // 2. Raw Spectrum
            if (showRawSpectrum) {
                traces.push({
                    x: fitX, y: fit.original.map((p: any) => p.y),
                    mode: 'lines', name: 'Raw Spectrum',
                    line: { color: '#475569', width: 1, dash: 'dot' }
                });
            }
            // 3. Baseline
            if (showBaseline) {
                traces.push({
                    x: fitX, y: fit.baseline.map((p: any) => p.y),
                    mode: 'lines', name: 'Baseline',
                    line: { color: '#f97316', width: 1.5 }
                });
            }
            // 4. Corrected Spectrum (Emerald Green to match Fitting SV!)
            traces.push({
                x: fitX, y: correctedY,
                mode: 'lines', name: 'Corrected Spectrum',
                line: { color: '#10b981', width: 2 }
            });
            // 5. Components (filled) — color matches the peak label color in the table
            if (showComponents && fit.components) {
                Object.entries(fit.components).forEach(([name, pts]: [string, any]) => {
                    // Match component to its peak by sanitized name
                    const cleanComp = name.replace(/_+$/, '').toLowerCase();
                    const peakIdx = peaksList.findIndex(p =>
                        sanitizePrefix(p.name).toLowerCase() === cleanComp
                    );
                    const color = PEAK_COLORS[peakIdx !== -1 ? peakIdx : 0];
                    const displayName = peakIdx !== -1 ? peaksList[peakIdx].name : name.replace(/_+$/, '');
                    traces.push({
                        x: fitX, y: pts.map((p: any) => p.y),
                        mode: 'lines',
                        fill: 'tozeroy',
                        fillcolor: `${color}25`,
                        name: displayName,
                        line: { color, width: 2 }
                    });
                });
            }
            // 6. Best Fit envelope (on top)
            traces.push({
                x: fitX, y: fit.best_fit.map((p: any) => p.y),
                mode: 'lines', name: 'Best Fit',
                line: { color: '#ef4444', width: 2.5 }
            });
            // 7. Residuals — offset downward so they sit below the spectrum baseline
            const residY: number[] = fit.residuals ? fit.residuals.map((p: any) => p.y) : [];
            if (residY.length) {
                const offset = -(maxCorrY * 0.12);
                traces.push({
                    x: fitX,
                    y: residY.map(v => v + offset),
                    mode: 'lines',
                    name: 'Residuals',
                    line: { color: '#10b981', width: 1 }
                });
            }
        } else {
            // Pre-fit: just plot preprocessed spectrum
            const rawX = rep.wavenumbers;
            const maxRepY = Math.max(...(rep.intensity_corr || rep.intensity_raw || [1]), 1.0);

            // Seed indicator dashes
            peaksList.forEach((pk, idx) => {
                if (!pk.active) return;
                const color = PEAK_COLORS[idx % PEAK_COLORS.length];
                traces.push({
                    x: [pk.center, pk.center],
                    y: [0, pk.amplitude > 0 ? pk.amplitude : maxRepY * 0.85],
                    mode: 'lines+markers',
                    name: `${pk.name} Seed`,
                    line: { color, width: 1.5, dash: 'dash' },
                    marker: { color, size: 5, symbol: 'diamond' }
                });
            });

            if (showRawSpectrum) {
                traces.push({
                    x: rawX, y: rep.intensity_raw,
                    mode: 'lines', name: 'Raw',
                    line: { color: '#475569', width: 1.2, dash: 'dot' }
                });
            }
            if (showBaseline) {
                traces.push({
                    x: rawX, y: rep.baseline,
                    mode: 'lines', name: 'Estimated Baseline',
                    line: { color: '#f97316', width: 1 }
                });
            }
            traces.push({
                x: rawX, y: rep.intensity_corr,
                mode: 'lines', name: 'Baseline Subtracted',
                line: { color: '#10b981', width: 2 }
            });
        }

        return traces;
    }, [activeCluster, clusterFitData, segmentationData, showRawSpectrum, showBaseline, showComponents, clusterPeaks]);

    const scientificMapSeries = useMemo(() => {
        if (!mapFitResult?.scientific_maps) return {};
        return mapFitResult.scientific_maps as Record<string, { label: string; values: Array<number | null> }>;
    }, [mapFitResult]);

    const scientificMetricOptions = useMemo(() => {
        return Object.entries(scientificMapSeries).map(([key, payload]) => ({
            key,
            label: payload.label || key.replace(/_/g, ' ')
        }));
    }, [scientificMapSeries]);

    const histogramOptions = useMemo(() => {
        if (!mapFitResult?.histograms) return [];
        return Object.entries(mapFitResult.histograms).map(([key, payload]: [string, any]) => ({
            key,
            label: payload.label || key.replace(/_/g, ' ')
        }));
    }, [mapFitResult]);

    const relationshipMetricOptions = useMemo(() => {
        const corrMetrics = mapFitResult?.correlations?.metrics || [];
        const corrLabels = mapFitResult?.correlations?.labels || [];
        if (corrMetrics.length > 0) {
            return corrMetrics.map((key: string, idx: number) => ({
                key,
                label: corrLabels[idx] || scientificMapSeries[key]?.label || key.replace(/_/g, ' ')
            }));
        }
        return scientificMetricOptions;
    }, [mapFitResult, scientificMapSeries, scientificMetricOptions]);

    // Spatial Map render for Step 3
    const mapTrace = useMemo(() => {
        if (!mapFitResult) return [];
        const z: number[][] = [];
        const text: string[][] = [];

        for (let y = 0; y < mapHeight; y++) {
            const row: number[] = [];
            const textRow: string[] = [];
            for (let x = 0; x < mapWidth; x++) {
                const idx = y * mapWidth + x;
                if (idx >= nSpectra) {
                    row.push(NaN);
                    textRow.push("Empty Píxel");
                    continue;
                }

                if (selectedMapKey === 'graphene_quality_class') {
                    const c = mapFitResult.quality_classes[idx];
                    row.push(c);
                    textRow.push(`Pixel #${idx} (X:${x} Y:${y})\nClass: ${QUALITY_CLASS_LABELS[c]?.label || 'Unknown'}`);
                } else {
                    const val =
                        selectedMapKey === 'r2'
                            ? mapFitResult.r2?.[idx]
                            : selectedMapKey === 'snr'
                                ? mapFitResult.snr?.[idx]
                                : selectedMapKey === 'rmse'
                                    ? mapFitResult.rmse?.[idx]
                                    : scientificMapSeries[selectedMapKey]?.values?.[idx] ?? mapFitResult.results[selectedMapKey]?.[idx];
                    row.push(val !== undefined && val !== null ? val : NaN);
                    textRow.push(`Pixel #${idx} (X:${x} Y:${y})\nValue: ${val !== undefined && val !== null ? val.toFixed(3) : 'NaN'}`);
                }
            }
            z.push(row);
            text.push(textRow);
        }

        // Return Plotly heatmap trace
        if (selectedMapKey === 'graphene_quality_class') {
            return [{
                z,
                text,
                type: 'heatmap' as const,
                hoverinfo: 'text',
                colorscale: [
                    [0, '#334155'], // Background (Slate 700)
                    [0.25, '#d97706'], // Defective (Amber 600)
                    [0.5, '#4f46e5'], // Monolayer (Indigo 600)
                    [0.75, '#7c3aed'], // Multilayer (Violet 600)
                    [1, '#dc2626'], // Low Confidence (Red 600)
                ],
                showscale: false
            } as any];
        } else {
            return [{
                z,
                text,
                type: 'heatmap' as const,
                hoverinfo: 'text',
                colorscale: 'Viridis',
                showscale: true,
                colorbar: {
                    tickfont: { color: '#94a3b8', size: 9 },
                    title: { text: selectedMapKey.replace(/_/g, ' '), font: { color: '#94a3b8', size: 9 } }
                }
            } as any];
        }
    }, [mapFitResult, selectedMapKey, mapWidth, mapHeight, nSpectra, scientificMapSeries]);

    // Statistics for Quality Dashboard (Step 3)
    const stats = useMemo(() => {
        if (!mapFitResult) return { converged: 0, reliable: 0, interpretable: 0, lowConfidence: 0, invalid: 0, monolayer: 0, defective: 0, multilayer: 0, bg: 0 };
        const total = nSpectra;
        const converged = mapFitResult.success_count;
        const classes = mapFitResult.quality_classes;
        
        const bg = classes.filter((c: number) => c === 0).length;
        const defective = classes.filter((c: number) => c === 1).length;
        const monolayer = classes.filter((c: number) => c === 2).length;
        const multilayer = classes.filter((c: number) => c === 3).length;
        const lowConf = classes.filter((c: number) => c === 4).length;
        const invalid = Math.max(total - converged, 0);
        const reliable = typeof mapFitResult.fit_reliable_count === 'number' ? mapFitResult.fit_reliable_count : Math.max(converged - lowConf, 0);
        const interpretable = typeof mapFitResult.interpretable_count === 'number' ? mapFitResult.interpretable_count : defective + monolayer + multilayer;
        const pct = (value: number) => total > 0 ? Math.round((value / total) * 1000) / 10 : 0;

        return {
            converged: pct(converged),
            reliable: pct(reliable),
            interpretable: pct(interpretable),
            lowConfidence: pct(lowConf),
            invalid: pct(invalid),
            monolayer: pct(monolayer),
            defective: pct(defective),
            multilayer: pct(multilayer),
            bg: pct(bg)
        };
    }, [mapFitResult, nSpectra]);

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
            marker: {
                color: histogram.bin_centers.map(() => '#10b981'),
                opacity: 0.75,
                line: { color: '#059669', width: 0.5 }
            },
            name: histogram.label || key,
            hovertemplate: '%{x:.3f}<br>Count: %{y}<extra></extra>',
        }];

        // Overlay fitted Gaussian curve if stats are available
        const stats = mapFitResult?.statistics?.[key];
        if (stats?.mean != null && stats?.std != null && stats.std > 0 && histogram.bin_edges?.length > 1) {
            const mean = stats.mean as number;
            const std = stats.std as number;
            const totalCount = (histogram.counts as number[]).reduce((a: number, b: number) => a + b, 0);
            const binWidth = (histogram.bin_edges[histogram.bin_edges.length - 1] - histogram.bin_edges[0]) / (histogram.bin_edges.length - 1);
            // Generate smooth curve
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
            traces.push({
                type: 'scatter' as const,
                mode: 'lines',
                x: xCurve,
                y: yCurve,
                line: { color: '#f59e0b', width: 2, dash: 'solid' },
                name: 'Normal fit',
                hovertemplate: '%{x:.3f}<br>Normal: %{y:.1f}<extra></extra>',
            });
            // Mean vertical line
            const maxCount = Math.max(...(histogram.counts as number[]));
            traces.push({
                type: 'scatter' as const,
                mode: 'lines',
                x: [mean, mean],
                y: [0, maxCount * 1.05],
                line: { color: '#f59e0b', width: 1.5, dash: 'dash' },
                name: `Mean: ${mean.toFixed(3)}`,
                hoverinfo: 'skip',
            });
        }

        return traces;
    }, [mapFitResult, selectedHistogramKey, histogramOptions]);

    const relationshipTrace = useMemo(() => {
        const xSeries = scientificMapSeries[scatterXKey]?.values || [];
        const ySeries = scientificMapSeries[scatterYKey]?.values || [];
        const reliableMask = mapFitResult?.analysis_mask || mapFitResult?.interpretable_mask || mapFitResult?.reliable_mask || [];
        const x: number[] = [];
        const y: number[] = [];
        const text: string[] = [];

        for (let i = 0; i < Math.min(xSeries.length, ySeries.length); i++) {
            const xv = xSeries[i];
            const yv = ySeries[i];
            const reliable = reliableMask.length === 0 ? true : reliableMask[i];
            if (reliable && typeof xv === 'number' && typeof yv === 'number' && Number.isFinite(xv) && Number.isFinite(yv)) {
                x.push(xv);
                y.push(yv);
                text.push(`Pixel #${i}`);
            }
        }

        return [{
            type: 'scattergl' as const,
            mode: 'markers',
            x,
            y,
            text,
            hoverinfo: 'text+x+y',
            marker: {
                color: '#38bdf8',
                size: 7,
                opacity: 0.72,
                line: { color: '#0f172a', width: 0.5 }
            },
            name: 'Analysis pixels',
        } as any];
    }, [mapFitResult, scientificMapSeries, scatterXKey, scatterYKey]);

    const correlationTrace = useMemo(() => {
        const corr = mapFitResult?.correlations;
        if (!corr?.pearson) return [];
        return [{
            type: 'heatmap' as const,
            z: corr.pearson,
            x: corr.labels,
            y: corr.labels,
            zmin: -1,
            zmax: 1,
            colorscale: 'RdBu',
            reversescale: true,
            hovertemplate: '%{y} vs %{x}<br>Pearson: %{z:.3f}<extra></extra>',
            colorbar: {
                tickfont: { color: '#94a3b8', size: 9 },
                title: { text: 'r', font: { color: '#94a3b8', size: 9 } }
            }
        } as any];
    }, [mapFitResult]);

    const currentStage = WORKFLOW_STAGES[step - 1];
    const fittedClusterCount = Object.keys(clusterFitData).length;
    const pcaVarianceTotal = segmentationData?.pca_explained_variance
        ? segmentationData.pca_explained_variance.reduce((sum: number, value: number) => sum + value, 0)
        : 0;

    return (
        <div className="flex-1 flex flex-col h-full bg-[#080d16] text-slate-200 overflow-hidden font-sans">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-emerald-950/40 to-indigo-950/40 border-b border-slate-800/80 px-8 py-3 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-600/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                        <Cpu size={18} className="animate-pulse" />
                    </div>
                    <div>
                        <h1 className="text-sm font-black text-white tracking-wider uppercase">Raman Global Intelligence (RGI)</h1>
                        <p className="text-[10px] text-slate-400 font-medium">Chemometric-Assisted Hyperspectral Fitting & Quality Classing</p>
                    </div>
                </div>

                {/* Workflow Stepper */}
                <div className="flex items-center gap-2">
                    <StepIndicator active={step === 1} completed={step > 1} number={1} label="Segmentation" onClick={() => setStep(1)} />
                    <ChevronRight size={12} className="text-slate-700" />
                    <StepIndicator active={step === 2} completed={step > 2} number={2} label="Fit Clusters" onClick={() => segmentationData && setStep(2)} />
                    <ChevronRight size={12} className="text-slate-700" />
                    <StepIndicator active={step === 3} completed={step > 3} number={3} label="Map Model" onClick={() => mapFitResult && setStep(3)} />
                    
                    <div className="w-[1px] h-6 bg-slate-800 mx-2" />
                    <button
                        onClick={() => setShowStageDetails(!showStageDetails)}
                        className="p-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 text-[10px] uppercase font-bold"
                        title={showStageDetails ? "Hide Stage Details" : "Show Stage Details"}
                    >
                        {showStageDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        <span>Info</span>
                    </button>
                </div>
            </div>

            {showStageDetails && (
                <div className="border-b border-slate-900/90 bg-slate-950/40 px-6 py-3 shrink-0">
                    <div className="grid grid-cols-3 gap-3">
                        {WORKFLOW_STAGES.map(stage => (
                            <WorkflowStageCard
                                key={stage.number}
                                active={currentStage.number === stage.number}
                                completed={stage.number < step}
                                number={stage.number}
                                label={stage.label}
                                goal={stage.goal}
                                visual={stage.visual}
                                result={stage.result}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Step 1: Map Segmentation */}
            {step === 1 && (
                <div className="flex-1 flex min-h-0 overflow-hidden p-6 gap-6">
                    {/* Controls */}
                    <div className="w-80 flex flex-col gap-4 bg-slate-950/40 border border-slate-850 rounded-2xl p-4 shrink-0 overflow-y-auto">
                        <div className="flex items-center gap-2 mb-2">
                            <SlidersHorizontal size={14} className="text-emerald-400" />
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Segmentation Parameters</span>
                        </div>

                        {/* Baseline */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-400">Baseline Method</label>
                            <select
                                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-emerald-500 transition-colors"
                                value={baselineMethod}
                                onChange={e => setBaselineMethod(e.target.value)}
                            >
                                {BASELINE_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        {/* Crop Range */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-slate-400">Crop Min (cm⁻¹)</label>
                                <input
                                    type="number"
                                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-300 outline-none focus:border-emerald-500"
                                    value={cropMin}
                                    onChange={e => setCropMin(parseFloat(e.target.value) || 0)}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-slate-400">Crop Max (cm⁻¹)</label>
                                <input
                                    type="number"
                                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-300 outline-none focus:border-emerald-500"
                                    value={cropMax}
                                    onChange={e => setCropMax(parseFloat(e.target.value) || 0)}
                                />
                            </div>
                        </div>

                        {/* Normalization */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-400">ML Normalization</label>
                            <select
                                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-emerald-500 transition-colors"
                                value={normalization}
                                onChange={e => setNormalization(e.target.value)}
                            >
                                {NORMALIZATION_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        {/* Machine Learning Clustering Settings */}
                        <div className="border-t border-slate-900/60 pt-4 flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-slate-400 flex justify-between">
                                    <span>PCA Components</span>
                                    <span className="text-emerald-400 font-black">{nPCAComponents}</span>
                                </label>
                                <input
                                    type="range" min={2} max={10} step={1}
                                    value={nPCAComponents}
                                    onChange={e => setNPCAComponents(parseInt(e.target.value))}
                                    className="accent-emerald-500 bg-slate-900 h-1 rounded"
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-slate-400 flex justify-between">
                                    <span>NMF Abundance Components</span>
                                    <span className="text-emerald-400 font-black">{nNMFComponents}</span>
                                </label>
                                <input
                                    type="range" min={2} max={8} step={1}
                                    value={nNMFComponents}
                                    onChange={e => setNNMFComponents(parseInt(e.target.value))}
                                    className="accent-emerald-500 bg-slate-900 h-1 rounded"
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-slate-400 flex justify-between">
                                    <span>Number of Clusters (Families)</span>
                                    <span className="text-emerald-400 font-black">{nClusters}</span>
                                </label>
                                <input
                                    type="range" min={2} max={10} step={1}
                                    value={nClusters}
                                    onChange={e => setNClusters(parseInt(e.target.value))}
                                    className="accent-emerald-500 bg-slate-900 h-1 rounded"
                                />
                            </div>
                        </div>

                        {/* Run Button */}
                        <button
                            onClick={handleRunSegmentation}
                            disabled={status === 'segmenting'}
                            className="mt-auto py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white text-xs font-black uppercase rounded-xl transition-all shadow-lg shadow-emerald-950/30 flex items-center justify-center gap-2"
                        >
                            {status === 'segmenting' ? (
                                <>
                                    <Loader2 size={13} className="animate-spin" />
                                    Segmenting map...
                                </>
                            ) : (
                                <>
                                    <Wand2 size={13} />
                                    Run Map Segmentation
                                </>
                            )}
                        </button>
                    </div>

                    {/* Plots / Display */}
                    <div className="flex-1 flex flex-col gap-4 min-w-0">
                        {segmentationData ? (
                            <>
                            <div className="grid grid-cols-4 gap-3 shrink-0">
                                <ResultMetric label="Spectra" value={segmentationData.n_spectra} detail={`${mapWidth} x ${mapHeight} map`} tone="emerald" />
                                <ResultMetric label="Families" value={segmentationData.n_clusters} detail="Cluster-guided models" tone="indigo" />
                                <ResultMetric label="PCA Coverage" value={`${Math.round(pcaVarianceTotal * 1000) / 10}%`} detail="Explained variance" tone="cyan" />
                                <ResultMetric label="Representatives" value={segmentationData.representatives.length} detail="Pixels ready for review" tone="amber" />
                            </div>

                            <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
                                {/* PCA Components Plot */}
                                <div className="border border-slate-850 rounded-2xl p-4 flex flex-col bg-slate-950/20">
                                    <h3 className="text-xs font-black text-slate-300 mb-2 uppercase tracking-wide flex items-center gap-2">
                                        <BarChart3 size={12} className="text-emerald-400" />
                                        PCA Variance Explanation
                                    </h3>
                                    <div className="flex-1 min-h-0">
                                        <Plot
                                            data={[{
                                                type: 'bar',
                                                x: segmentationData.pca_explained_variance.map((_: any, i: number) => `PC${i+1}`),
                                                y: segmentationData.pca_explained_variance,
                                                marker: { color: '#10b981' }
                                            }]}
                                            layout={{
                                                ...LAYOUT_BASE,
                                                margin: { l: 40, r: 10, t: 10, b: 30 },
                                                xaxis: { ...AXIS },
                                                yaxis: { ...AXIS, title: { text: 'Variance Ratio', font: { size: 9 } } }
                                            }}
                                            config={{ displayModeBar: false, responsive: true }}
                                            useResizeHandler={true}
                                            style={{ width: '100%', height: '100%' }}
                                        />
                                    </div>
                                </div>

                                {/* Clusters Map Preview */}
                                <div className="border border-slate-850 rounded-2xl p-4 flex flex-col bg-slate-950/20">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-xs font-black text-slate-300 uppercase tracking-wide flex items-center gap-2">
                                            <LayoutGrid size={12} className="text-emerald-400" />
                                            Map Spectral Families
                                        </h3>
                                        <button
                                            onClick={() => setStep(2)}
                                            className="px-3 py-1 bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase transition-all shadow-md"
                                        >
                                            Next Step: Fit →
                                        </button>
                                    </div>
                                    {segmentationData.n_spectra > 1 ? (
                                        <div className="flex-1 flex flex-col min-h-0">
                                            <div className="flex-1 min-h-0 relative border border-slate-900 rounded-xl overflow-hidden bg-[#050910] mb-3">
                                                <Plot
                                                    data={clusterMapTrace}
                                                    layout={{
                                                        ...LAYOUT_BASE,
                                                        margin: { l: 40, r: 10, t: 20, b: 30 },
                                                        xaxis: { ...AXIS, showgrid: false },
                                                        yaxis: { ...AXIS, showgrid: false, scaleanchor: 'x' }
                                                    }}
                                                    config={{ displayModeBar: false, responsive: true }}
                                                    useResizeHandler={true}
                                                    style={{ width: '100%', height: '100%' }}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 shrink-0">
                                                {segmentationData.cluster_sizes.map((size: number, idx: number) => {
                                                    const colors = ['#6366f1', '#10b981', '#ec4899', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6', '#3b82f6', '#ef4444'];
                                                    const color = colors[idx % colors.length];
                                                    return (
                                                        <div key={idx} className="bg-slate-900/60 border border-slate-850 p-2 rounded-xl flex items-center justify-between text-[10px]">
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                                                <span className="font-black text-slate-400">Cluster #{idx}</span>
                                                            </div>
                                                            <span className="font-mono text-emerald-400 font-bold">{size} px ({Math.round(size/nSpectra*100)}%)</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                                            Single spectrum loaded. Click "Next Step: Fit".
                                        </div>
                                    )}
                                </div>
                            </div>
                            </>
                        ) : (
                            <div className="flex-1 border border-slate-850 border-dashed rounded-2xl flex flex-col items-center justify-center text-slate-500 p-8">
                                <Sparkles size={28} className="text-slate-700 mb-2 animate-bounce" />
                                <span className="text-xs font-bold text-slate-400 mb-1">Raman Map Model is Empty</span>
                                <span className="text-[10px] text-slate-500 max-w-xs text-center">
                                    Select the baseline method and cluster count, and click "Run Map Segmentation" to analyze spectral structures.
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Step 2: Fit Representatives */}
            {step === 2 && segmentationData && (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-4 gap-4">
                    {/* Upper Area: Full-Width Plot Card */}
                    <div 
                        className="border border-slate-850 rounded-2xl p-4 flex flex-col bg-slate-950/20 min-h-[380px] shadow-xl"
                        style={{ flex: '5.5 5.5 0%' }}
                    >
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <div>
                                <h3 className="text-xs font-black text-slate-300 uppercase tracking-wide">
                                    Representative Spectrum Fit: Cluster #{activeCluster}
                                </h3>
                                <p className="text-[9px] font-bold text-slate-500">
                                    Pixel index: {segmentationData.representatives[activeCluster]} | Size: {segmentationData.cluster_sizes[activeCluster]} spectra
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-850 px-3 py-1 rounded-xl">
                                    <label className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-400 font-bold cursor-pointer select-none">
                                        <input 
                                            type="checkbox" 
                                            checked={showRawSpectrum} 
                                            onChange={e => setShowRawSpectrum(e.target.checked)}
                                            className="rounded border-slate-850 bg-slate-900 accent-indigo-500 w-3 h-3 cursor-pointer"
                                        />
                                        <span>Raw</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-400 font-bold cursor-pointer select-none">
                                        <input 
                                            type="checkbox" 
                                            checked={showBaseline} 
                                            onChange={e => setShowBaseline(e.target.checked)}
                                            className="rounded border-slate-850 bg-slate-900 accent-orange-500 w-3 h-3 cursor-pointer"
                                        />
                                        <span>Baseline</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-400 font-bold cursor-pointer select-none">
                                        <input 
                                            type="checkbox" 
                                            checked={showComponents} 
                                            onChange={e => setShowComponents(e.target.checked)}
                                            className="rounded border-slate-850 bg-slate-900 accent-indigo-500 w-3 h-3 cursor-pointer"
                                        />
                                        <span>Components</span>
                                    </label>
                                </div>
                                {clusterFitData[activeCluster] && (
                                    <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-900/60 px-2 py-0.5 rounded-md">
                                        R²: {clusterFitData[activeCluster].metrics.r_squared.toFixed(5)}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 relative border border-slate-900 rounded-xl overflow-hidden bg-slate-950/40">
                            <Plot
                                data={repPlotlyTraces}
                                layout={{
                                    ...LAYOUT_BASE,
                                    margin: { l: 45, r: 10, t: 10, b: 30 },
                                    datarevision: plotRevision,
                                    xaxis: {
                                        ...LAYOUT_BASE.xaxis,
                                        autorange: true
                                    },
                                    yaxis: {
                                        ...LAYOUT_BASE.yaxis,
                                        autorange: true
                                    }
                                }}
                                revision={plotRevision}
                                onClick={handleChartClick}
                                config={{ displayModeBar: false, responsive: true }}
                                useResizeHandler={true}
                                style={{ width: '100%', height: '100%' }}
                            />
                        </div>

                        <div className="flex items-center justify-between text-[9px] text-slate-500 mt-2 px-1">
                            <span className="flex items-center gap-1">
                                💡 <span className="font-bold text-slate-400">Pro Tip:</span> Click on the spectrum graph to place a peak seed for the active cluster.
                            </span>
                        </div>
                    </div>

                    {/* Lower Area: Split layout mirroring Fitting SV */}
                    <div 
                        className="flex gap-4 min-h-0 overflow-hidden"
                        style={{ flex: '4.5 4.5 0%' }}
                    >
                        {/* Left sidebar: Cluster selector + buttons */}
                        <div className="w-[400px] flex flex-col bg-slate-950/40 border border-slate-850 rounded-2xl overflow-hidden shrink-0 shadow-lg">
                            <div className="bg-slate-950/60 p-2 border-b border-slate-850 shrink-0 overflow-x-auto flex gap-1.5">
                                {segmentationData.cluster_sizes.map((_: any, idx: number) => (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            setActiveCluster(idx);
                                            setPlotRevision(prev => prev + 1);
                                        }}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shrink-0 border",
                                            activeCluster === idx 
                                                ? "bg-indigo-600 border-indigo-500 text-white" 
                                                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                                        )}
                                    >
                                        Cluster #{idx}
                                    </button>
                                ))}
                            </div>

                            <div className="p-4 border-b border-slate-900 bg-slate-950/30 grid grid-cols-2 gap-2 shrink-0">
                                <ResultMetric
                                    label="Active Family"
                                    value={`#${activeCluster}`}
                                    detail={`${segmentationData.cluster_sizes[activeCluster]} spectra`}
                                    tone="indigo"
                                />
                                <ResultMetric
                                    label="Models Ready"
                                    value={`${fittedClusterCount}/${segmentationData.n_clusters}`}
                                    detail="Reviewed cluster priors"
                                    tone={fittedClusterCount === segmentationData.n_clusters ? "emerald" : "amber"}
                                />
                            </div>

                            <div className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
                                <div className="border border-slate-850 bg-slate-950/50 rounded-xl p-3 shrink-0">
                                    <label className="text-[10px] font-bold text-slate-400 flex justify-between">
                                        <span>SNR Fit Threshold</span>
                                        <span className="text-emerald-400 font-black">{thresholdSNR.toFixed(1)}</span>
                                    </label>
                                    <input
                                        type="range"
                                        min={0}
                                        max={10}
                                        step={0.5}
                                        value={thresholdSNR}
                                        onChange={e => setThresholdSNR(parseFloat(e.target.value))}
                                        className="w-full accent-emerald-500 bg-slate-900 h-1 rounded mt-2 cursor-pointer"
                                    />
                                    <p className="text-[8.5px] text-slate-500 mt-2 leading-3">
                                        Skip pixels below this threshold.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2 mt-auto">
                                    <button
                                        onClick={handleFitRepresentative}
                                        disabled={isLoadingRepFit}
                                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-black uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                                    >
                                        {isLoadingRepFit ? (
                                            <>
                                                <Loader2 size={12} className="animate-spin" />
                                                Fitting Spectrum...
                                            </>
                                        ) : (
                                            <>
                                                <Play size={12} />
                                                Fit Cluster spectrum
                                            </>
                                        )}
                                    </button>

                                    <button
                                        onClick={handleRunMapFit}
                                        disabled={status === 'mapping'}
                                        className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white text-xs font-black uppercase rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                                    >
                                        {status === 'mapping' ? (
                                            <>
                                                <Loader2 size={13} className="animate-spin" />
                                                Running Batch Fit...
                                            </>
                                        ) : (
                                            <>
                                                <Activity size={13} />
                                                Run Constrained Map Fit
                                            </>
                                        )}
                                    </button>

                                    {/* Progress Bar when mapping */}
                                    {status === 'mapping' && fitProgress && (
                                        <div className="mt-1 bg-slate-955/80 border border-slate-900/60 rounded-xl p-2.5 shadow-md">
                                            <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1.5">
                                                <span>Fitting Progress</span>
                                                <span className="font-mono text-emerald-400 font-black">
                                                    {fitProgress.completed}/{fitProgress.total} ({fitProgress.total > 0 ? Math.round(fitProgress.completed / fitProgress.total * 100) : 0}%)
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                                                <div 
                                                    className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-200" 
                                                    style={{ width: `${fitProgress.total > 0 ? (fitProgress.completed / fitProgress.total * 100) : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {clusterFitData[activeCluster] && (
                                        <button
                                            onClick={handleDownloadFitTxt}
                                            className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-indigo-400 text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2"
                                        >
                                            <FileText size={12} /> Download Fit (.txt)
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Middle workspace: Interactive Peak Table taking remaining width */}
                        <div className="flex-1 flex flex-col overflow-hidden bg-transparent gap-4">
                            <div className="flex-1 min-h-[180px] overflow-hidden flex flex-col">
                                {clusterPeaks[activeCluster] && (
                                    <FittingPeakTable 
                                        peaks={clusterPeaks[activeCluster]}
                                        onChange={(newPeaks) => setClusterPeaks(prev => ({ ...prev, [activeCluster]: newPeaks }))}
                                        showLimits={showLimits}
                                        showExpr={showExpr}
                                    />
                                )}
                            </div>

                            {/* Grid constraints toggles */}
                            <div className="bg-[#0b101d] border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3 shadow-xl shrink-0">
                                <span className="text-[9px] uppercase font-bold text-slate-500">Grid Options:</span>
                                <button
                                    onClick={() => setShowLimits(!showLimits)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-xl border text-[9px] font-black transition-all uppercase tracking-wider",
                                        showLimits 
                                            ? "bg-emerald-950 border-emerald-800 text-emerald-400" 
                                            : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700"
                                    )}
                                >
                                    Constraints Limits
                                </button>
                                <button
                                    onClick={() => setShowExpr(!showExpr)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-xl border text-[9px] font-black transition-all uppercase tracking-wider",
                                        showExpr 
                                            ? "bg-purple-950 border-purple-800 text-purple-400" 
                                            : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700"
                                    )}
                                >
                                    LMfit Expressions
                                </button>
                            </div>
                        </div>

                        {/* Rightmost Panel: Cluster Fit Output summary */}
                        {clusterFitData[activeCluster] && (
                            <ClusterFitResults
                                fit={clusterFitData[activeCluster]}
                                peaks={clusterPeaks[activeCluster] || []}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Step 3: Constrained Map Fit & Dashboard */}
            {step === 3 && mapFitResult && (
                <div className="flex-1 flex min-h-0 overflow-hidden p-6 gap-6">
                    {/* Left Panel: Map Controls & Stats */}
                    <div className="w-80 flex flex-col gap-4 shrink-0 overflow-y-auto">
                        {/* Save RGI Results Card */}
                        <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 flex flex-col gap-3">
                            <div className="flex items-center gap-2 mb-1">
                                <Save size={14} className="text-emerald-400" />
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Save Analysis</span>
                            </div>
                            <p className="text-[9px] text-slate-400 leading-normal">
                                Save the full multi-stage fit parameters, map model, and results to a self-contained HDF5 file.
                            </p>
                            <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase">File Suffix / Label</label>
                                <input
                                    type="text"
                                    value={saveSuffix}
                                    onChange={e => setSaveSuffix(e.target.value)}
                                    placeholder="e.g. rgi_260608"
                                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-emerald-500 transition-colors"
                                />
                            </div>
                            <button
                                onClick={handleSaveRgiResults}
                                disabled={isSavingResults}
                                className={cn(
                                    "w-full py-2 px-3 rounded-xl border text-[10px] font-black transition-all flex items-center justify-center gap-2 uppercase tracking-wider",
                                    isSavingResults
                                        ? "bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed"
                                        : "bg-emerald-950/40 border-emerald-800/80 hover:bg-emerald-900/40 hover:border-emerald-600 text-emerald-400 hover:text-emerald-300"
                                )}
                            >
                                {isSavingResults ? (
                                    <>
                                        <Loader2 size={12} className="animate-spin" />
                                        <span>Saving Results...</span>
                                    </>
                                ) : (
                                    <>
                                        <Save size={12} />
                                        <span>Save Results (.h5)</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Selected Parameter Map */}
                        <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 flex flex-col gap-3">
                            <div className="flex items-center gap-2 mb-1">
                                <LayoutGrid size={14} className="text-emerald-400" />
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Spatial Parameter Map</span>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-slate-400">Parameter Map Key</label>
                                <select
                                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-emerald-500 transition-colors"
                                    value={selectedMapKey}
                                    onChange={e => setSelectedMapKey(e.target.value)}
                                >
                                    <option value="graphene_quality_class">Graphene Quality Class</option>
                                    <option value="r2">R² Fit Quality</option>
                                    <option value="snr">SNR Map</option>
                                    <option value="rmse">RMSE Map</option>
                                    {scientificMetricOptions.length > 0 && (
                                        <optgroup label="Scientific Metrics">
                                            {scientificMetricOptions.map(option => (
                                                <option key={option.key} value={option.key}>{option.label}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                    {Object.keys(mapFitResult.results).filter(k => !k.endsWith('_stderr')).map(k => (
                                        <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Scientific Quality Dashboard */}
                        <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 flex flex-col gap-3">
                            <div className="flex items-center gap-2 mb-1">
                                <Activity size={14} className="text-emerald-400" />
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Quality Dashboard</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-center">
                                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase">Solver Converged</div>
                                    <div className="text-sm font-black text-emerald-400 mt-0.5">{stats.converged}%</div>
                                </div>
                                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase">Reliable Fits</div>
                                    <div className="text-sm font-black text-indigo-400 mt-0.5">{stats.reliable}%</div>
                                </div>
                                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase">Interpretable</div>
                                    <div className="text-sm font-black text-cyan-400 mt-0.5">{stats.interpretable}%</div>
                                </div>
                                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase">Low Confidence</div>
                                    <div className="text-sm font-black text-amber-400 mt-0.5">{stats.lowConfidence}%</div>
                                </div>
                                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase">Invalid</div>
                                    <div className="text-sm font-black text-red-400 mt-0.5">{stats.invalid}%</div>
                                </div>
                            </div>

                            <InterpretationSummary summary={mapFitResult.interpretation_summary} result={mapFitResult} />

                            <ReasonSummary summary={mapFitResult.reason_summary} messages={mapFitResult.reason_messages} total={nSpectra} />

                            <div className="border-t border-slate-900/80 pt-3 flex flex-col gap-2 text-xs">
                                <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1">Material Composition</div>
                                <CompositionRow label="Monolayer Graphene" value={stats.monolayer} color="bg-indigo-500" />
                                <CompositionRow label="Multilayer Graphene" value={stats.multilayer} color="bg-violet-500" />
                                <CompositionRow label="Defective Graphene" value={stats.defective} color="bg-amber-500" />
                                <CompositionRow label="Background/Substrate" value={stats.bg} color="bg-slate-500" />
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Scientific Results */}
                    <div className="flex-1 border border-slate-850 rounded-2xl p-4 flex flex-col bg-slate-950/20">
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <div>
                                <h3 className="text-xs font-black text-slate-300 uppercase tracking-wide">
                                    RGI Scientific Results
                                </h3>
                                <p className="text-[9px] font-bold text-slate-500">
                                    Dimensions: {mapWidth} x {mapHeight} ({nSpectra} spectra) | Mean R2: {mapFitResult.r2_mean.toFixed(5)} | Scope: {getAnalysisScopeLabel(mapFitResult)}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 bg-slate-950/70 border border-slate-850 rounded-lg p-1">
                                {RESULT_VIEWS.map(view => (
                                    <button
                                        key={view.value}
                                        onClick={() => setResultsView(view.value)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-colors",
                                            resultsView === view.value
                                                ? "bg-emerald-600 text-white"
                                                : "text-slate-500 hover:text-slate-200"
                                        )}
                                    >
                                        {view.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {resultsView === 'map' && selectedMapKey === 'graphene_quality_class' && (
                            <div className="mb-4 bg-slate-900/40 border border-slate-850 rounded-xl p-3 flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold text-slate-400 select-none">
                                {Object.entries(QUALITY_CLASS_LABELS).map(([cKey, data]) => (
                                    <div key={cKey} className="flex items-center gap-1.5" title={data.desc}>
                                        <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: data.color }} />
                                        <span>{data.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {resultsView === 'map' && (
                        <div className="flex-1 min-h-0 relative border border-slate-900 rounded-xl overflow-hidden bg-[#050910]">
                            <Plot
                                data={mapTrace}
                                layout={{
                                    ...LAYOUT_BASE,
                                    margin: { l: 40, r: 10, t: 20, b: 30 },
                                    xaxis: { ...AXIS, showgrid: false },
                                    yaxis: { ...AXIS, showgrid: false, scaleanchor: 'x' }
                                }}
                                config={{ displayModeBar: false, responsive: true }}
                                useResizeHandler={true}
                                style={{ width: '100%', height: '100%' }}
                            />
                        </div>
                        )}

                        {resultsView === 'metrics' && (
                            <ScientificMetricsPanel result={mapFitResult} />
                        )}

                        {resultsView === 'histograms' && (
                            <div className="flex-1 min-h-0 flex flex-col gap-3">
                                {/* Header row */}
                                <div className="flex items-center justify-between gap-3 shrink-0">
                                    <div>
                                        <h4 className="text-[11px] font-black text-slate-300 uppercase">Metric Distribution</h4>
                                        <p className="text-[9px] font-bold text-slate-500">{getAnalysisScopeDescription(mapFitResult)}</p>
                                    </div>
                                    <select
                                        className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-emerald-500"
                                        value={selectedHistogramKey}
                                        onChange={e => setSelectedHistogramKey(e.target.value)}
                                    >
                                        {histogramOptions.map(option => (
                                            <option key={option.key} value={option.key}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Content area: chart + stats side-by-side */}
                                {histogramTrace.length > 0 && (histogramTrace[0] as any).x?.length > 0 ? (
                                    <div className="flex-1 min-h-0 flex gap-3">
                                        {/* Chart */}
                                        <div className="flex-1 min-h-0 border border-slate-900 rounded-xl overflow-hidden bg-[#050910]">
                                            <Plot
                                                data={histogramTrace}
                                                layout={{
                                                    ...LAYOUT_BASE,
                                                    margin: { l: 55, r: 16, t: 20, b: 45 },
                                                    xaxis: { ...AXIS, title: { text: getHistogramLabel(mapFitResult, selectedHistogramKey), font: { size: 10 } } },
                                                    yaxis: { ...AXIS, title: { text: 'Analysis pixels', font: { size: 10 } } },
                                                    showlegend: true,
                                                    legend: { x: 0.98, xanchor: 'right', y: 0.98, yanchor: 'top', bgcolor: 'rgba(8,13,22,0.85)', bordercolor: '#1e293b', borderwidth: 1, font: { size: 9, color: '#94a3b8' } },
                                                    bargap: 0.04,
                                                }}
                                                config={{ displayModeBar: false, responsive: true }}
                                                useResizeHandler={true}
                                                style={{ width: '100%', height: '100%' }}
                                            />
                                        </div>

                                        {/* Stats sidebar */}
                                        {histogramStats && (
                                            <div className="w-44 shrink-0 flex flex-col gap-2">
                                                <div className="text-[9px] font-black uppercase tracking-wider text-slate-500 px-1">Distribution Stats</div>
                                                <div className="text-[9px] font-bold text-emerald-400/70 px-1">{histogramStats.analysis_mask === 'reliable_fits_fallback' ? 'Reliable fits scope' : 'Graphene scope'}</div>
                                                <HistStatCard label="N Analysis Pixels" value={histogramStats.reliable_count ?? histogramStats.valid_count ?? '--'} />
                                                <HistStatCard label="Mean" value={formatNumber(histogramStats.mean)} highlight />
                                                <HistStatCard label="Median" value={formatNumber(histogramStats.median)} />
                                                <HistStatCard label="Std Dev" value={formatNumber(histogramStats.std)} />
                                                <HistStatCard label="P10 — P90" value={histogramStats.p10 != null && histogramStats.p90 != null ? `${formatNumber(histogramStats.p10)} — ${formatNumber(histogramStats.p90)}` : '--'} />
                                                <HistStatCard label="Min — Max" value={histogramStats.min != null && histogramStats.max != null ? `${formatNumber(histogramStats.min)} — ${formatNumber(histogramStats.max)}` : '--'} />
                                                <HistStatCard label="NaN / Total" value={`${histogramStats.nan_count ?? '--'} / ${histogramStats.count ?? '--'}`} tone="muted" />
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <EmptyScientificState
                                        title="No analysis values for this histogram"
                                        body="The selected metric has no valid pixels in the current analysis scope. Check Fit Reason Summary, lower the SNR threshold if appropriate, or inspect representative cluster fits."
                                    />
                                )}
                            </div>
                        )}

                        {resultsView === 'relationships' && (
                            <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] gap-4">
                                <div className="min-h-0 flex flex-col gap-3">
                                    <div className="grid grid-cols-2 gap-3 shrink-0">
                                        <MetricSelect label="X Metric" value={scatterXKey} options={relationshipMetricOptions} onChange={setScatterXKey} />
                                        <MetricSelect label="Y Metric" value={scatterYKey} options={relationshipMetricOptions} onChange={setScatterYKey} />
                                    </div>
                                    {relationshipTrace.length > 0 && (relationshipTrace[0] as any).x?.length > 0 ? (
                                        <div className="flex-1 min-h-0 border border-slate-900 rounded-xl overflow-hidden bg-[#050910]">
                                            <Plot
                                                data={relationshipTrace}
                                                layout={{
                                                    ...LAYOUT_BASE,
                                                    margin: { l: 55, r: 20, t: 20, b: 45 },
                                                    xaxis: { ...AXIS, title: { text: getMetricLabel(scatterXKey, scientificMapSeries), font: { size: 10 } } },
                                                    yaxis: { ...AXIS, title: { text: getMetricLabel(scatterYKey, scientificMapSeries), font: { size: 10 } } }
                                                }}
                                                config={{ displayModeBar: false, responsive: true }}
                                                useResizeHandler={true}
                                                style={{ width: '100%', height: '100%' }}
                                            />
                                        </div>
                                    ) : (
                                        <EmptyScientificState
                                            title="Not enough paired analysis pixels"
                                            body="Relationships need both selected metrics to be valid in the same analysis pixels. Check the metric table and fit reasons before interpreting correlations."
                                        />
                                    )}
                                </div>
                                <div className="min-h-0 flex flex-col">
                                    <div className="mb-3 shrink-0">
                                        <h4 className="text-[11px] font-black text-slate-300 uppercase">Pearson Correlation Matrix</h4>
                                        <p className="text-[9px] font-bold text-slate-500">{getAnalysisScopeDescription(mapFitResult)}</p>
                                    </div>
                                    <div className="flex-1 min-h-0 border border-slate-900 rounded-xl overflow-hidden bg-[#050910]">
                                        <Plot
                                            data={correlationTrace}
                                            layout={{
                                                ...LAYOUT_BASE,
                                                margin: { l: 90, r: 15, t: 15, b: 80 },
                                                xaxis: { ...AXIS, tickangle: -35 },
                                                yaxis: { ...AXIS }
                                            }}
                                            config={{ displayModeBar: false, responsive: true }}
                                            useResizeHandler={true}
                                            style={{ width: '100%', height: '100%' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function getMetricLabel(key: string, scientificMapSeries: Record<string, { label: string; values: Array<number | null> }>) {
    return scientificMapSeries[key]?.label || key.replace(/_/g, ' ');
}

function getHistogramLabel(result: any, key: string) {
    return result?.histograms?.[key]?.label || key.replace(/_/g, ' ');
}

function getAnalysisScopeLabel(result: any) {
    if (result?.analysis_mask_type === 'reliable_fits_fallback') {
        return `Reliable fits fallback (${result.analysis_count ?? 0} px)`;
    }
    return `Interpretable graphene (${result?.analysis_count ?? result?.interpretable_count ?? 0} px)`;
}

function getAnalysisScopeDescription(result: any) {
    if (result?.analysis_mask_type === 'reliable_fits_fallback') {
        return 'No strict graphene pixels passed classification, so statistics use reliable converged fits as a descriptive fallback.';
    }
    return 'Statistics use reliable pixels classified as interpretable graphene.';
}

function getQualityThresholdLabel(result: any) {
    const thresholds = result?.quality_thresholds || result?.interpretation_summary?.quality_thresholds;
    const r2 = typeof thresholds?.r2_reliable_min === 'number' ? thresholds.r2_reliable_min : 0.85;
    const snr = typeof thresholds?.snr_reliable_min === 'number' ? thresholds.snr_reliable_min : 3;
    return `R2 >= ${formatNumber(r2, 2)} | SNR >= ${formatNumber(snr, 1)}`;
}

function formatNumber(value: any, digits = 3) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
    return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatPercent(value: any) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
    return (value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatMeanStd(stat: any) {
    if (!stat || typeof stat.mean !== 'number') return '--';
    return `${formatNumber(stat.mean)} +/- ${formatNumber(stat.std)}`;
}

function formatMedian(stat: any) {
    if (!stat || typeof stat.median !== 'number') return 'median --';
    return `median ${formatNumber(stat.median)}`;
}

function ScientificMetricsPanel({ result }: { result: any }) {
    const stats = result?.statistics || {};
    const ratioKeys = ['ID_IG_height', 'AD_AG_area', 'I2D_IG_height', 'A2D_AG_area', 'FWHM_2D_FWHM_G'];
    const detailKeys = ['pos_G', 'fwhm_G', 'area_G', 'height_G', 'pos_2D', 'fwhm_2D', 'area_2D', 'height_2D', 'ID_IG_height', 'I2D_IG_height'];

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto pr-1">
            <div>
                <h4 className="text-[11px] font-black text-slate-300 uppercase">Band Metrics</h4>
                <p className="text-[9px] font-bold text-slate-500">{getAnalysisScopeDescription(result)}</p>
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
                            <th className="text-right px-3 py-2 font-black">Analysis Pixels</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(['D', 'G', '2D'] as const).map(band => {
                            const suffix = band;
                            const pos = stats[`pos_${suffix}`];
                            const fwhm = stats[`fwhm_${suffix}`];
                            const area = stats[`area_${suffix}`];
                            const height = stats[`height_${suffix}`];
                            const analysisCount = Math.max(pos?.reliable_count || 0, fwhm?.reliable_count || 0, area?.reliable_count || 0, height?.reliable_count || 0);

                            return (
                                <tr key={band} className="border-t border-slate-900/80">
                                    <td className="px-3 py-3 font-black text-emerald-400">{band}</td>
                                    <MetricStatCell stat={pos} unit="cm^-1" />
                                    <MetricStatCell stat={fwhm} unit="cm^-1" />
                                    <MetricStatCell stat={area} />
                                    <MetricStatCell stat={height} />
                                    <td className="px-3 py-3 text-right font-mono text-slate-300">{analysisCount}</td>
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
                        <div className="text-xs font-black text-cyan-400 mt-1">{formatMeanStd(stats[key])}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">{formatMedian(stats[key])}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
                {detailKeys.map(key => (
                    <div key={key} className="border border-slate-850 rounded-lg bg-slate-950/30 p-3">
                        <div className="flex justify-between gap-3">
                            <div className="text-[10px] font-black uppercase text-slate-400">{stats[key]?.label || key}</div>
                            <div className="text-[9px] font-mono text-emerald-400">{stats[key]?.reliable_count || 0} analysis px</div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-[9px]">
                            <MiniStat label="Mean" value={formatNumber(stats[key]?.mean)} />
                            <MiniStat label="Median" value={formatNumber(stats[key]?.median)} />
                            <MiniStat label="Std" value={formatNumber(stats[key]?.std)} />
                            <MiniStat label="P10" value={formatNumber(stats[key]?.p10)} />
                            <MiniStat label="P90" value={formatNumber(stats[key]?.p90)} />
                            <MiniStat label="NaN" value={stats[key]?.nan_count ?? '--'} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MetricStatCell({ stat, unit }: { stat: any; unit?: string }) {
    return (
        <td className="px-3 py-3 align-top">
            <div className="font-mono text-slate-200">{formatMeanStd(stat)}</div>
            <div className="text-[9px] text-slate-500">{formatMedian(stat)}{unit ? ` | ${unit}` : ''}</div>
        </td>
    );
}

function HistStatCard({ label, value, highlight = false, tone = 'normal' }: { label: string; value: string | number; highlight?: boolean; tone?: 'normal' | 'muted' }) {
    return (
        <div className="border border-slate-850 rounded-lg bg-slate-950/50 px-3 py-2">
            <div className="text-[8px] font-black uppercase tracking-wider text-slate-600 mb-0.5">{label}</div>
            <div className={cn(
                'font-mono text-[11px] font-black',
                highlight ? 'text-emerald-400' : tone === 'muted' ? 'text-slate-500' : 'text-slate-200'
            )}>{value}</div>
        </div>
    );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="bg-slate-950/50 border border-slate-900 rounded-md p-2">
            <div className="font-black uppercase text-slate-600">{label}</div>
            <div className="font-mono text-slate-300 mt-0.5">{value}</div>
        </div>
    );
}

function ClusterFitResults({
    fit,
    peaks,
}: {
    fit: any;
    peaks: FittingPeakConfig[];
}) {
    const rows = buildClusterFitRows(fit, peaks);
    const parameters = Array.isArray(fit.parameters) ? fit.parameters : [];

    // Compute noise metrics from residuals array (engine returns raw residuals)
    const noiseMetrics = useMemo(() => {
        const residuals: number[] = Array.isArray(fit.residuals)
            ? fit.residuals.map((p: any) => (typeof p === 'object' ? p.y : p))
            : [];
        if (residuals.length === 0) return { rmse: null, std: null, maxAbs: null, noiseSignalPct: null };
        const correctedY: number[] = Array.isArray(fit.corrected)
            ? fit.corrected.map((p: any) => (typeof p === 'object' ? p.y : p))
            : [];
        const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
        const mean = residuals.reduce((s, r) => s + r, 0) / residuals.length;
        const std = Math.sqrt(residuals.reduce((s, r) => s + (r - mean) ** 2, 0) / residuals.length);
        const maxAbs = Math.max(...residuals.map(Math.abs));
        const signalMax = correctedY.length > 0 ? Math.max(...correctedY) : 1;
        const noiseSignalPct = signalMax > 0 ? (rmse / signalMax) * 100 : null;
        return { rmse, std, maxAbs, noiseSignalPct };
    }, [fit]);

    return (
        <div className="w-[580px] border border-slate-850 rounded-2xl p-4 flex flex-col gap-3 bg-slate-950/20 shrink-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 shrink-0">
                <h3 className="text-xs font-black text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    Cluster Fit Output
                </h3>
                <span className="text-[9px] font-mono text-indigo-400 bg-indigo-950/50 border border-indigo-900/60 px-2 py-0.5 rounded-md">
                    R² {formatNumber(fit.metrics?.r_squared, 5)}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-2 shrink-0">
                <NoiseMetric label="RMSE" value={noiseMetrics.rmse} />
                <NoiseMetric label="Residual Std" value={noiseMetrics.std} />
                <NoiseMetric label="Max |Residual|" value={noiseMetrics.maxAbs} />
                <NoiseMetric label="Noise/Signal" value={noiseMetrics.noiseSignalPct} suffix="%" />
            </div>


            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Band Values From Cluster Fit</div>
                <div className="overflow-x-auto border border-slate-850 rounded-xl bg-slate-950/40">
                    <table className="w-full text-[10px]">
                        <thead className="bg-slate-950 text-slate-500 uppercase">
                            <tr>
                                <th className="text-left px-2 py-2 font-black">Band</th>
                                <th className="text-right px-2 py-2 font-black">Center</th>
                                <th className="text-right px-2 py-2 font-black">FWHM</th>
                                <th className="text-right px-2 py-2 font-black">Area</th>
                                <th className="text-right px-2 py-2 font-black">Height</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIdx) => (
                                <tr key={row.label} className="border-t border-slate-900/80">
                                    <td className="px-2 py-2">
                                        <div className="font-black" style={{ color: PEAK_COLORS[rowIdx % PEAK_COLORS.length] }}>{row.label}</div>
                                        <div className="text-[8px] text-slate-600 uppercase">{row.model}</div>
                                    </td>
                                    <ClusterValueCell value={row.center?.value} stderr={row.center?.stderr} />
                                    <ClusterValueCell value={row.fwhm?.value} stderr={row.fwhm?.stderr} />
                                    <ClusterValueCell value={row.area?.value} stderr={row.area?.stderr} />
                                    <ClusterValueCell value={row.height?.value} detail={row.height?.source} />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mt-3 mb-2">Raw Solver Parameters</div>
                <div className="border border-slate-850 rounded-xl bg-slate-950/30 overflow-hidden">
                    <table className="w-full text-[10px]">
                        <tbody className="divide-y divide-slate-900/80">
                            {parameters.map((param: any) => (
                                <tr key={param.name}>
                                    <td className="px-2 py-1.5 text-slate-500 truncate max-w-[170px]" title={param.name}>{param.name.replace(/_/g, ' ')}</td>
                                    <td className="px-2 py-1.5 text-right font-mono text-slate-200">{formatNumber(param.value)}</td>
                                    <td className="px-2 py-1.5 text-right font-mono text-slate-600">{formatStderr(param.stderr)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function NoiseMetric({ label, value, suffix = '' }: { label: string; value: any; suffix?: string }) {
    return (
        <div className="border border-slate-850 rounded-lg bg-slate-950/50 p-2">
            <div className="text-[8px] font-black uppercase text-slate-600 tracking-wider">{label}</div>
            <div className="font-mono text-[11px] font-black text-amber-300 mt-0.5">{formatNumber(value, suffix ? 2 : 3)}{suffix}</div>
        </div>
    );
}

function ClusterValueCell({ value, stderr, detail }: { value: any; stderr?: any; detail?: string }) {
    return (
        <td className="px-2 py-2 text-right align-top">
            <div className="font-mono text-slate-200">{formatNumber(value)}</div>
            <div className="text-[8px] text-slate-600">{detail || formatStderr(stderr)}</div>
        </td>
    );
}

function buildClusterFitRows(fit: any, peaks: FittingPeakConfig[]) {
    const parameters = Array.isArray(fit?.parameters) ? fit.parameters : [];
    const byName = new Map(parameters.map((param: any) => [param.name, param]));

    return peaks
        .filter(peak => peak.active)
        .map(peak => {
            const safeName = sanitizePrefix(peak.name);
            const center = byName.get(`${safeName}_center`) as any;
            const sigma = byName.get(`${safeName}_sigma`) as any;
            const fwhm = (byName.get(`${safeName}_fwhm`) as any) || (
                sigma ? { value: sigma.value * 2, stderr: typeof sigma.stderr === 'number' ? sigma.stderr * 2 : null } : null
            );
            const area = byName.get(`${safeName}_amplitude`) as any;
            const fittedHeight = byName.get(`${safeName}_height`) as any;
            const estimatedHeight = area && fwhm?.value > 0
                ? { value: (2 * area.value) / (Math.PI * fwhm.value), source: 'estimated' }
                : null;

            return {
                label: peak.name,
                model: peak.model,
                center,
                fwhm,
                area,
                height: fittedHeight || estimatedHeight,
            };
        });
}

function formatStderr(value: any) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '+/- --';
    return `+/- ${formatNumber(value)}`;
}

function ReasonSummary({
    summary,
    messages,
    total
}: {
    summary?: Record<string, number>;
    messages?: Record<string, string>;
    total: number;
}) {
    const entries = Object.entries(summary || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

    if (entries.length === 0) {
        return null;
    }

    return (
        <div className="border-t border-slate-900/80 pt-3">
            <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-2">Fit Reason Summary</div>
            <div className="flex flex-col gap-1.5">
                {entries.map(([reason, count]) => {
                    const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
                    const isOk = reason === 'OK';
                    return (
                        <div key={reason} className="flex items-center justify-between gap-2 text-[10px]">
                            <span className={cn("font-mono", isOk ? "text-emerald-400" : "text-amber-300")}>{reason}</span>
                            <span className="text-slate-500">{count} px ({pct}%)</span>
                        </div>
                    );
                })}
            </div>
            {messages && entries.some(([reason]) => messages[reason]) && (
                <div className="mt-2 rounded-md border border-slate-900 bg-slate-950/50 p-2 text-[9px] leading-3 text-slate-500">
                    {entries.map(([reason]) => messages[reason] ? (
                        <div key={reason} className="mb-1 last:mb-0">
                            <span className="font-mono text-amber-300">{reason}:</span> {messages[reason]}
                        </div>
                    ) : null)}
                </div>
            )}
        </div>
    );
}

function InterpretationSummary({ summary, result }: { summary?: any; result?: any }) {
    if (!summary) {
        return null;
    }

    const readiness = (['ready', 'review', 'not_ready'].includes(summary.readiness) ? summary.readiness : 'review') as 'ready' | 'review' | 'not_ready';
    const readinessStyle: Record<'ready' | 'review' | 'not_ready', string> = {
        ready: 'text-emerald-400 border-emerald-900/60 bg-emerald-950/20',
        review: 'text-amber-300 border-amber-900/60 bg-amber-950/20',
        not_ready: 'text-red-300 border-red-900/60 bg-red-950/20',
    };
    const readableLabels: Record<'ready' | 'review' | 'not_ready', string> = {
        ready: 'Ready',
        review: 'Review',
        not_ready: 'Not Ready',
    };

    return (
        <div className={cn("border rounded-xl p-3", readinessStyle[readiness])}>
            <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-black uppercase tracking-wider">Scientific Readiness</div>
                <div className="text-[10px] font-black uppercase">{readableLabels[readiness]}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
                <MiniStat label="Graphene" value={`${formatPercent(summary.interpretable_fraction)}%`} />
                <MiniStat label="Invalid" value={`${formatPercent(summary.invalid_fraction)}%`} />
                <MiniStat label="Analysis" value={`${formatPercent(summary.analysis_fraction)}%`} />
                <MiniStat label="Reliable" value={`${formatPercent(summary.fit_reliable_fraction)}%`} />
            </div>
            <div className="mt-2 text-[9px] font-mono text-slate-400">
                scope: {getAnalysisScopeLabel(result || summary)}
            </div>
            <div className="mt-1 text-[9px] font-mono text-slate-500">
                thresholds: {getQualityThresholdLabel(result || summary)}
            </div>
            {summary.dominant_fit_reason && (
                <div className="mt-2 text-[9px] font-mono text-slate-400">
                    dominant reason: {summary.dominant_fit_reason}
                </div>
            )}
            {Array.isArray(summary.notes) && summary.notes.length > 0 && (
                <div className="mt-2 text-[9px] leading-4 text-slate-400">
                    {summary.notes[0]}
                </div>
            )}
        </div>
    );
}

function EmptyScientificState({ title, body }: { title: string; body: string }) {
    return (
        <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center border border-slate-900 rounded-xl bg-slate-950/40 p-8">
            <AlertCircle size={22} className="text-amber-400 mb-3" />
            <div className="text-xs font-black uppercase text-slate-300">{title}</div>
            <p className="text-[10px] text-slate-500 max-w-md mt-2 leading-4">{body}</p>
        </div>
    );
}

function MetricSelect({
    label,
    value,
    options,
    onChange
}: {
    label: string;
    value: string;
    options: Array<{ key: string; label: string }>;
    onChange: (value: string) => void;
}) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400">{label}</label>
            <select
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-emerald-500"
                value={value}
                onChange={e => onChange(e.target.value)}
            >
                {options.map(option => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                ))}
            </select>
        </div>
    );
}

function WorkflowStageCard({
    active,
    completed,
    number,
    label,
    goal,
    visual,
    result
}: {
    active: boolean;
    completed: boolean;
    number: number;
    label: string;
    goal: string;
    visual: string;
    result: string;
}) {
    return (
        <div
            className={cn(
                "border rounded-lg p-3 min-h-[112px] transition-colors",
                active
                    ? "bg-emerald-950/20 border-emerald-500/40"
                    : completed
                        ? "bg-slate-900/60 border-slate-800"
                        : "bg-slate-950/30 border-slate-900"
            )}
        >
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span
                        className={cn(
                            "w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0",
                            active ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-400"
                        )}
                    >
                        {number}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 truncate">{label}</span>
                </div>
                {completed && <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />}
            </div>
            <p className="text-[10px] leading-4 text-slate-400">{goal}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] leading-3">
                <div className="border border-slate-850 bg-slate-950/50 rounded-md p-2">
                    <div className="font-black uppercase text-slate-500 mb-1">Visual</div>
                    <div className="text-slate-400">{visual}</div>
                </div>
                <div className="border border-slate-850 bg-slate-950/50 rounded-md p-2">
                    <div className="font-black uppercase text-slate-500 mb-1">Result</div>
                    <div className="text-slate-400">{result}</div>
                </div>
            </div>
        </div>
    );
}

function StepIndicator({ active, completed, number, label, onClick }: { active: boolean; completed: boolean; number: number; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            disabled={!completed && !active}
            className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                active 
                    ? "bg-emerald-600/10 border-emerald-500/30 text-emerald-400" 
                    : completed 
                        ? "bg-slate-900 border-slate-800 text-slate-300 hover:text-white" 
                        : "bg-slate-950/20 border-slate-900 text-slate-600 cursor-not-allowed"
            )}
        >
            <div className={cn(
                "w-4 h-4 rounded-full flex items-center justify-center font-mono text-[9px] font-black shrink-0",
                active 
                    ? "bg-emerald-500 text-slate-950" 
                    : completed 
                        ? "bg-slate-800 text-emerald-400" 
                        : "bg-slate-950 text-slate-700"
            )}>
                {completed ? <Check size={8} strokeWidth={4} /> : number}
            </div>
            <span>{label}</span>
        </button>
    );
}

function CompositionRow({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-[10px] font-medium text-slate-400 select-none">
                <span>{label}</span>
                <span className="font-bold font-mono">{value}%</span>
            </div>
            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800/60">
                <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
            </div>
        </div>
    );
}

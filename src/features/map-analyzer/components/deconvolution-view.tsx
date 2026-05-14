'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Wand2, Play, Layers, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Loader2, Info, Save, FolderOpen, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DeconvolutionPeakTable, PeakConfig, PEAK_COLORS } from './deconvolution-peak-table';
import { DeconvolutionResultsPanel, MapFitResult } from './deconvolution-results-panel';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

const ENGINE = 'http://127.0.0.1:8888';

type FitStatus = 'idle' | 'fitting' | 'fit_done' | 'applying' | 'done' | 'error';

const BASELINE_METHODS = [
  { value: 'asls',     label: 'AsLS',    desc: 'Asymmetric Least Squares (smooth, general)' },
  { value: 'airpls',   label: 'airPLS',  desc: 'Adaptive iterative (good for broad BL)' },
  { value: 'snip',     label: 'SNIP',    desc: 'Statistics-sensitive (sharp peaks)' },
  { value: 'modpoly',  label: 'ModPoly', desc: 'Modified polynomial' },
  { value: 'none',     label: 'None',    desc: 'No baseline correction' },
];

const AXIS = {
  gridcolor: '#1e293b', zerolinecolor: '#334155', color: '#94a3b8',
  tickfont: { size: 10, color: '#94a3b8' },
};
const LAYOUT_BASE = {
  paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#0f172a',
  font: { family: 'Inter, sans-serif', size: 10, color: '#94a3b8' },
  margin: { l: 55, r: 20, t: 10, b: 40 },
  xaxis: { ...AXIS, title: { text: 'Raman Shift (cm⁻¹)', font: { size: 10 } } },
  yaxis: { ...AXIS, title: { text: 'Intensity', font: { size: 10 } } },
};

interface FitData {
  original: { x: number; y: number }[];
  corrected: { x: number; y: number }[];
  baseline: { x: number; y: number }[];
  best_fit: { x: number; y: number }[];
  residuals: { x: number; y: number }[];
  components: Record<string, { x: number; y: number }[]>;
  parameters: any[];
  metrics: { r_squared: number; chi2_reduced: number; aic: number; bic: number };
}

interface Props {
  vaultRoot: string;
  h5Path: string;
  mapWidth: number;
  mapHeight: number;
  nSpectra: number;
}

export function DeconvolutionView({ vaultRoot, h5Path, mapWidth, mapHeight, nSpectra }: Props) {
  const [peaks, setPeaks] = useState<PeakConfig[]>([]);
  const [templates, setTemplates] = useState<Record<string, any>>({});
  const [selectedTemplate, setSelectedTemplate] = useState('generic');
  const [baselineMethod, setBaselineMethod] = useState('asls');
  const [isBaselineEnabled, setIsBaselineEnabled] = useState(true);
  const [baselineParams, setBaselineParams] = useState<Record<string, number>>({ lam: 1000000, p: 0.01 });
  const [status, setStatus] = useState<FitStatus>('idle');
  const [fitData, setFitData] = useState<FitData | null>(null);
  const [lastPeakAddRef] = useState({ time: 0 }); // To prevent relayout interference

  const [mapResult, setMapResult] = useState<MapFitResult | null>(null);
  const [rawSpectrum, setRawSpectrum] = useState<{ x: number[]; y: number[] } | null>(null);
  const [previewBaseline, setPreviewBaseline] = useState<{ baseline: {x:number, y:number}[], corrected: {x:number, y:number}[] } | null>(null);
  const [detectThreshold, setDetectThreshold] = useState(0.05);
  const [showBaseline, setShowBaseline] = useState(true);
  const [showResiduals, setShowResiduals] = useState(true);
  const [residualViewMode, setResidualViewMode] = useState<'offset'|'zero'|'normalized'>('offset');
  const [maskPeaks, setMaskPeaks] = useState(false);
  
  // Advanced Map Options
  const [thresholdSNR, setThresholdSNR] = useState(5.0);
  const [useWarmStart, setUseWarmStart] = useState(false);

  const [viewCorrectedOnly, setViewCorrectedOnly] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState('');
  const [localTemplates, setLocalTemplates] = useState<Record<string, any>>({});
  const [showTemplates, setShowTemplates] = useState(false);

  // Load templates on mount
  useEffect(() => {
    // Backend templates
    fetch(`${ENGINE}/api/deconvolution/templates`)
      .then(r => r.json())
      .then(d => { 
        if (d.success) setTemplates(prev => ({ ...prev, ...d.templates })); 
      })
      .catch(() => {});
    
    // Local templates
    const stored = localStorage.getItem('phdnexus_decon_templates');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setLocalTemplates(parsed);
      } catch(e) {}
    }
  }, []);

  // Load representative spectrum whenever the file changes
  useEffect(() => {
    if (!h5Path || !vaultRoot) return;
    setRawSpectrum(null);
    setFitData(null);
    setMapResult(null);
    setStatus('idle');
    fetch(`${ENGINE}/api/map/representative-spectrum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault_root: vaultRoot, h5_relative_path: h5Path }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.data) && d.data.length > 0) {
          setRawSpectrum({ x: d.data.map((p: any) => p.x), y: d.data.map((p: any) => p.y) });
          // After loading spectrum, try to load saved config from file
          handleLoadConfigFile();
        }
      })
      .catch(() => {});
  }, [h5Path, vaultRoot]);

  const handleLoadConfigFile = async () => {
    try {
      const res = await fetch(`${ENGINE}/api/deconvolution/load-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault_root: vaultRoot, h5_relative_path: h5Path }),
      });
      const d = await res.json();
      if (d.success && d.config) {
        setPeaks(d.config.peaks || []);
        setBaselineMethod(d.config.baseline_method || 'asls');
        setIsBaselineEnabled(d.config.is_baseline_enabled !== false);
        setBaselineParams(d.config.baseline_params || { lam: 1000000, p: 0.01 });
        toast.info("Loaded parameters from file");
      }
    } catch (e) {}
  };

  const handleSaveConfigFile = async () => {
    try {
      const res = await fetch(`${ENGINE}/api/deconvolution/save-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vault_root: vaultRoot,
          h5_relative_path: h5Path,
          peaks,
          baseline_method: baselineMethod,
          is_baseline_enabled: isBaselineEnabled,
          baseline_params: baselineParams,
        }),
      });
      const d = await res.json();
      if (d.success) {
        toast.success("Parameters saved to HDF5 file");
      } else {
        toast.error(d.message || "Failed to save to file");
      }
    } catch (e) {
      toast.error("Engine connection failed");
    }
  };

  const handleSaveTemplate = () => {
    const name = saveNameInput.trim();
    if (!name) return;
    const newTemplates = { 
      ...localTemplates, 
      [name]: { 
        peaks, 
        baseline_method: baselineMethod, 
        is_baseline_enabled: isBaselineEnabled,
        baseline_params: baselineParams 
      } 
    };
    setLocalTemplates(newTemplates);
    localStorage.setItem('phdnexus_decon_templates', JSON.stringify(newTemplates));
    setShowSaveInput(false);
    toast.success(`Template "${name}" saved`);
  };

  const applyTemplate = (key: string, isLocal = false) => {
    const tmpl = isLocal ? localTemplates[key] : templates[key];
    if (!tmpl) return;
    setSelectedTemplate(key);
    const newPeaks = (tmpl.peaks || []).map((p: any, i: number) => ({
      ...p,
      id: `${p.name}_${Date.now()}_${i}`,
    }));
    setPeaks(newPeaks);
    if (tmpl.baseline_method) setBaselineMethod(tmpl.baseline_method);
    setIsBaselineEnabled(tmpl.is_baseline_enabled !== false);
    if (tmpl.baseline_params) setBaselineParams(tmpl.baseline_params);
    setFitData(null);
    setMapResult(null);
    setStatus('idle');
    setShowTemplates(false);
  };

  // Auto-detect peaks
  const handleAutoDetect = async () => {
    if (!h5Path) return;
    setStatus('fitting');
    try {
        const res = await fetch(`${ENGINE}/api/deconvolution/auto-detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          vault_root: vaultRoot, h5_relative_path: h5Path, 
          baseline_method: isBaselineEnabled ? baselineMethod : 'none', 
          baseline_params: baselineParams,
          threshold: detectThreshold
        }),
      });
      const d = await res.json();
      if (d.success) {
        const newPeaks = d.peaks.map((p: any, i: number) => ({ ...p, id: `auto_${Date.now()}_${i}` }));
        setPeaks(newPeaks);
        toast.success(`Detected ${newPeaks.length} peaks`);
      } else {
        toast.error('Auto-detect failed');
      }
    } catch { toast.error('Engine connection failed'); }
    setStatus('idle');
  };
  // Auto-Preview Baseline when params change
  useEffect(() => {
    if (!h5Path || !rawSpectrum || baselineMethod === 'none' || !isBaselineEnabled || fitData) {
      if (baselineMethod === 'none' || !isBaselineEnabled) setPreviewBaseline(null);
      return;
    }
    
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${ENGINE}/api/deconvolution/preview-baseline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            vault_root: vaultRoot, h5_relative_path: h5Path, 
            baseline_method: isBaselineEnabled ? baselineMethod : 'none', 
            baseline_params: baselineParams 
          }),
        });
        const d = await res.json();
        if (d.success) {
          setPreviewBaseline({ baseline: d.baseline, corrected: d.corrected });
        }
      } catch (e) {
        // Silent catch for auto-preview
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(timer);
  }, [h5Path, vaultRoot, baselineMethod, baselineParams, rawSpectrum, fitData, isBaselineEnabled]);

  // Run fit on representative spectrum
  const handleRunFit = async () => {
    if (!h5Path || peaks.filter(p => p.active).length === 0) {
      toast.error('Add at least one active peak');
      return;
    }
    setStatus('fitting');
    try {
      const res = await fetch(`${ENGINE}/api/deconvolution/fit-representative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vault_root: vaultRoot,
          h5_relative_path: h5Path,
          peaks: peaks.map(p => ({ ...p })),
          baseline_method: isBaselineEnabled ? baselineMethod : 'none',
          baseline_params: baselineParams,
          threshold_snr: thresholdSNR,
          warm_start: useWarmStart,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setFitData(d);
        setStatus('fit_done');
        toast.success(`Fit done — R² = ${d.metrics.r_squared.toFixed(4)}`);
      } else {
        toast.error(d.message || 'Fit failed');
        setStatus('error');
      }
    } catch { toast.error('Engine connection failed'); setStatus('error'); }
  };

  // Apply fit to entire map
  const handleApplyToMap = async () => {
    if (!fitData || status !== 'fit_done') return;
    setStatus('applying');
    toast.info(`Processing ${nSpectra} spectra…`);
    try {
      const res = await fetch(`${ENGINE}/api/deconvolution/apply-to-map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vault_root: vaultRoot,
          h5_relative_path: h5Path,
          peaks: peaks.map(p => ({ ...p })),
          baseline_method: isBaselineEnabled ? baselineMethod : 'none',
          baseline_params: baselineParams,
          threshold_snr: thresholdSNR,
          warm_start: useWarmStart,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setMapResult(d);
        setStatus('done');
        toast.success(`Map fit complete — R² mean: ${d.global_metrics.r2_mean.toFixed(4)}`);
      } else {
        toast.error('Map fit failed');
        setStatus('fit_done');
      }
    } catch { toast.error('Engine connection failed'); setStatus('fit_done'); }
  };

  // Click on plot to add or remove peak
  const handlePlotClick = useCallback((event: any) => {
    if (!event?.points?.length) return;
    const x = event.points[0].x as number;
    
    // Check if clicked close to an existing peak to remove it
    const clickThreshold = 15; // cm-1 tolerance for clicking
    const closePeakIdx = peaks.findIndex(p => Math.abs(p.center - x) < clickThreshold);
    
    if (closePeakIdx !== -1) {
      const removedName = peaks[closePeakIdx].name;
      setPeaks(prev => prev.filter((_, i) => i !== closePeakIdx));
      toast.info(`Removed peak ${removedName}`);
      return;
    }

    // Otherwise add a new peak
    lastPeakAddRef.time = Date.now(); // Set cooldown
    
    // Find next available P# name
    const existingNums = peaks.map(p => {
      const match = p.name.match(/(?:P|Peak_?)(\d+)/i);
      return match ? parseInt(match[1]) : 0;
    });
    const nextNum = Math.max(0, ...existingNums) + 1;

    const newPeak: PeakConfig = {
      id: `peak_click_${Date.now()}`,
      name: `Peak_${nextNum}`,
      model: 'Lorentzian',
      center: Math.round(x),
      center_min: Math.round(x) - 40,
      center_max: Math.round(x) + 40,
      fwhm_init: 30,
      active: true,
    };
    setPeaks(prev => [...prev, newPeak]);
    toast.info(`Added peak ${newPeak.name} at ${Math.round(x)} cm-1`);
  }, [peaks, lastPeakAddRef]);

  // Drag marker on plot: uses plotly_relayout to detect shape moves
  const handlePeakDrag = useCallback((event: any) => {
    if (!event) return;
    
    // Guard: ignore relayout if we just added a peak (avoids "sticking" issue)
    // Increased to 800ms to be safer
    if (Date.now() - lastPeakAddRef.time < 800) return;

    const keys = Object.keys(event);
    keys.forEach(key => {
      const m = key.match(/^shapes\[(\d+)\]\.x0$/);
      if (m) {
        const shapeIdx = parseInt(m[1]);
        const newX = event[key] as number;
        if (isNaN(newX)) return;

        setPeaks(prev => {
          const activePeaks = prev.filter(p => p.active);
          if (shapeIdx < activePeaks.length) {
            const targetId = activePeaks[shapeIdx].id;
            const roundedX = Math.round(newX);
            
            // Check if it's a real move
            const currentPeak = prev.find(p => p.id === targetId);
            if (currentPeak && Math.abs(currentPeak.center - roundedX) < 1) return prev;

            return prev.map(p => p.id === targetId ? { 
              ...p, 
              center: roundedX,
              // Update bounds to follow the peak with a slightly wider margin
              center_min: roundedX - 50,
              center_max: roundedX + 50
            } : p);
          }
          return prev;
        });
      }
    });
  }, [lastPeakAddRef]);

  // Build Plotly traces
  const traces: any[] = [];

  // Always show the raw spectrum (loaded on mount)
  if (rawSpectrum && !viewCorrectedOnly) {
    traces.push({
      type: 'scattergl', mode: 'lines', name: 'Spectrum',
      x: rawSpectrum.x, y: rawSpectrum.y,
      line: { color: '#64748b', width: 1.5 },
      hovertemplate: '%{x:.1f} cm-1<br>%{y:.0f}<extra></extra>',
    });
  }

  // Preview Baseline overlay (only if no full fit data exists)
  if (!fitData && previewBaseline) {
    if (showBaseline && !viewCorrectedOnly) {
      traces.push({
        type: 'scattergl', mode: 'lines', name: 'Preview BL',
        x: previewBaseline.baseline.map(p => p.x), 
        y: previewBaseline.baseline.map(p => p.y),
        line: { color: '#f59e0b', width: 1.5, dash: 'dash' },
        hovertemplate: '%{x:.1f} cm-1<br>%{y:.0f}<extra></extra>',
      });
    }
    traces.push({
      type: 'scattergl', mode: 'lines', name: 'Preview Corr',
      x: previewBaseline.corrected.map(p => p.x), 
      y: previewBaseline.corrected.map(p => p.y),
      line: { color: '#93c5fd', width: 1.5 },
      hovertemplate: '%{x:.1f} cm-1<br>%{y:.0f}<extra></extra>',
    });
  }

  if (fitData) {
    const xs = fitData.original.map(p => p.x);

    // Baseline
    if (showBaseline && baselineMethod !== 'none' && !viewCorrectedOnly) {
      traces.push({
        type: 'scatter', mode: 'lines', name: 'Baseline',
        x: xs, y: fitData.baseline.map(p => p.y),
        line: { color: '#f59e0b', width: 1, dash: 'dot' },
      });
    }

    // Corrected spectrum
    traces.push({
      type: 'scatter', mode: 'lines', name: 'Corrected',
      x: xs, y: fitData.corrected.map(p => p.y),
      line: { color: '#93c5fd', width: 1.5 },
    });

    // Individual peak components
    Object.entries(fitData.components).forEach(([name, pts], idx) => {
      traces.push({
        type: 'scatter', mode: 'lines', name,
        x: xs, y: pts.map(p => p.y),
        line: { color: PEAK_COLORS[idx % PEAK_COLORS.length], width: 1.5, dash: 'dash' },
        fill: 'tozeroy',
        fillcolor: PEAK_COLORS[idx % PEAK_COLORS.length] + '22',
      });
    });

    // Best fit envelope
    traces.push({
      type: 'scatter', mode: 'lines', name: 'Best Fit',
      x: xs, y: fitData.best_fit.map(p => p.y),
      line: { color: '#ef4444', width: 2 },
    });

    // Residuals
    if (showResiduals) {
      const res = fitData.residuals.map(p => p.y);
      let yVals = res;
      let nameStr = 'Residuals';

      if (residualViewMode === 'offset') {
        const yMin = Math.min(...fitData.corrected.map(p => p.y));
        const resRange = Math.max(...res.map(Math.abs)) || 1;
        yVals = res.map(v => yMin - resRange * 1.2 + v);
      } else if (residualViewMode === 'normalized') {
        const yMax = Math.max(...fitData.corrected.map(p => p.y)) || 1;
        yVals = res.map(v => v / yMax);
        nameStr = 'Res (Norm)';
      }

      traces.push({
        type: 'scatter', mode: 'lines', name: nameStr,
        x: xs,
        y: yVals,
        line: { color: '#94a3b8', width: 1 },
      });

      if (residualViewMode !== 'offset') {
        traces.push({
          type: 'scatter', mode: 'lines', name: 'Zero',
          x: [xs[0], xs[xs.length-1]], y: [0, 0],
          line: { color: '#ef4444', width: 1, dash: 'dot' },
          hoverinfo: 'skip',
        });
      }
    }
  }

  // Draggable shapes for peak centers
  const activePeaks = peaks.filter(p => p.active);
  const shapes: any[] = activePeaks.map((pk, idx) => ({
    type: 'line',
    x0: pk.center, x1: pk.center, y0: 0, y1: 1, yref: 'paper',
    line: { color: PEAK_COLORS[idx % PEAK_COLORS.length], width: 2, dash: 'longdash' },
    editable: true,
    label: { text: pk.name, font: { size: 9, color: PEAK_COLORS[idx % PEAK_COLORS.length] } },
  }));

  const templateInfo = templates[selectedTemplate];

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-900">
      {/* LEFT SIDEBAR */}
      <div className={cn(
        "shrink-0 flex flex-col border-r border-slate-800 bg-slate-950 transition-all overflow-hidden relative",
        sidebarOpen ? "w-80" : "w-0"
      )}>
        {/* Sidebar Header Toolbar */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50 backdrop-blur-md sticky top-0 z-10">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Analysis Engine</h2>
          <div className="flex gap-1">
            <button onClick={() => setShowTemplates(!showTemplates)} className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-400" title="Cargar Template">
              <FolderOpen className="w-4 h-4" />
            </button>
            <button onClick={() => { setSaveNameInput(''); setShowSaveInput(!showSaveInput); }} className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-400" title="Guardar como Template">
              <Plus className="w-4 h-4" />
            </button>
            <button onClick={handleSaveConfigFile} className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-indigo-400" title="Guardar en archivo HDF5">
              <Save className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showSaveInput && (
          <div className="p-3 bg-indigo-500/10 border-b border-indigo-500/20 flex gap-2 animate-in slide-in-from-top duration-200">
            <input 
              autoFocus
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-700"
              placeholder="Nombre del template..."
              value={saveNameInput}
              onChange={e => setSaveNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveTemplate()}
            />
            <button onClick={handleSaveTemplate} className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-lg hover:bg-indigo-700 transition-colors">
              OK
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-8">

          {/* STEP 1: BASELINE */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-slate-900 text-[10px] font-bold shrink-0">1</div>
              <span className="text-[11px] font-bold text-slate-200 uppercase tracking-widest">Baseline Subtraction</span>
              <div className="flex-1" />
              <input 
                type="checkbox" 
                checked={isBaselineEnabled} 
                onChange={e => setIsBaselineEnabled(e.target.checked)}
                className="accent-amber-500 rounded border-slate-700 bg-slate-900 w-3.5 h-3.5"
              />
            </div>
            <div className={cn("pl-7 space-y-1.5 transition-opacity", !isBaselineEnabled && "opacity-30 pointer-events-none")}>
              <div className="space-y-1">
                {BASELINE_METHODS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setBaselineMethod(m.value)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border",
                      baselineMethod === m.value
                        ? "bg-amber-900/30 border-amber-700 text-amber-300"
                        : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700"
                    )}
                  >
                    <span className="font-bold">{m.label}</span>
                    <span className="ml-2 text-[9px] opacity-70">{m.desc}</span>
                  </button>
                ))}
              </div>
              {baselineMethod === 'asls' && (
                <div className="mt-2 space-y-1.5 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <BaselineSlider label="λ (smoothness)" value={baselineParams.lam ?? 1e6}
                    min={1e3} max={1e8} step={1e3} scale="log"
                    onChange={v => setBaselineParams(p => ({ ...p, lam: v }))} />
                  <BaselineSlider label="p (asymmetry)" value={baselineParams.p ?? 0.01}
                    min={0.001} max={0.1} step={0.001}
                    onChange={v => setBaselineParams(p => ({ ...p, p: v }))} />
                </div>
              )}
              {baselineMethod !== 'none' && (
                <label className="flex items-center gap-2 mt-3 cursor-pointer select-none px-2">
                  <input 
                    type="checkbox" 
                    checked={viewCorrectedOnly} 
                    onChange={e => setViewCorrectedOnly(e.target.checked)}
                    className="accent-amber-500 rounded border-slate-700 bg-slate-900"
                  />
                  <span className="text-[10px] font-bold text-slate-400">Lock Baseline & Hide Original</span>
                </label>
              )}
            </div>
          </div>

          {/* STEP 2: PEAKS */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500 text-slate-900 text-[10px] font-bold shrink-0">2</div>
              <span className="text-[11px] font-bold text-slate-200 uppercase tracking-widest">Identify Peaks</span>
            </div>
            
            <div className="pl-7 space-y-4">
              {/* Quick Access Presets */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Presets del Sistema</span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(templates).map(([key, tmpl]) => (
                    <button
                      key={key}
                      onClick={() => applyTemplate(key)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border",
                        selectedTemplate === key
                          ? "bg-indigo-500 text-white border-indigo-400"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                      )}
                    >
                      {(tmpl as any).label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Current Template Info */}
              {templateInfo && (
                <div className="p-2.5 bg-indigo-900/10 border border-indigo-900/20 rounded-xl">
                  <div className="text-[8px] font-bold text-indigo-500 uppercase mb-1">Activo: {templateInfo.label}</div>
                  <p className="text-[10px] text-slate-500 leading-relaxed italic">"{templateInfo.description}"</p>
                </div>
              )}

              {/* Auto-detect */}
              <div className="flex flex-col gap-2 p-2.5 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Detection Threshold</span>
                  <span className="text-[10px] font-mono text-indigo-400">{detectThreshold.toFixed(3)}</span>
                </div>
                <input 
                  type="range" min="0.01" max="0.3" step="0.01" 
                  value={detectThreshold} 
                  onChange={e => setDetectThreshold(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500" 
                />
                <button
                  onClick={handleAutoDetect}
                  disabled={!h5Path || status === 'fitting' || status === 'applying'}
                  className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg border border-slate-700 transition-all disabled:opacity-40"
                >
                  <Wand2 size={12} /> Auto-detect Peaks
                </button>
              </div>

              {/* Peak Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <DeconvolutionPeakTable
                  peaks={peaks}
                  onChange={setPeaks}
                  disabled={status === 'fitting' || status === 'applying'}
                />
              </div>
            </div>
          </div>

          {/* STEP 3: PROCESS */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-slate-900 text-[10px] font-bold shrink-0">3</div>
              <span className="text-[11px] font-bold text-slate-200 uppercase tracking-widest">Fit & Apply</span>
            </div>
            <div className="pl-7 space-y-3 pb-4">
              <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={maskPeaks} 
                  onChange={e => setMaskPeaks(e.target.checked)}
                  className="accent-emerald-500 rounded border-slate-700 bg-slate-900"
                />
                <span className="text-[10px] font-bold text-slate-400">Mask Peak Regions in Baseline</span>
              </label>

              {/* Advanced Map Processing Options */}
              <div className="flex flex-col gap-1.5 p-2 bg-slate-800/40 rounded-lg border border-slate-800/60 mb-2 mt-1">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5">Map Processing Opts</div>
                
                <label className="flex items-center gap-2 text-[10px] text-slate-300 cursor-pointer" title="Uses previous pixel results as seeds to accelerate fitting">
                  <input type="checkbox" checked={useWarmStart} onChange={e => setUseWarmStart(e.target.checked)} className="rounded border-slate-700 bg-slate-800 accent-emerald-500" />
                  Neighbor Warm-Start <span className="text-emerald-400/80 ml-auto font-mono text-[9px] px-1 bg-emerald-900/30 rounded">Fast</span>
                </label>
                
                <div className="flex items-center gap-2 text-[10px] text-slate-300" title="Skips pixels where max-min intensity is below this value">
                  <span>Skip noise threshold (SNR):</span>
                  <input 
                    type="number" 
                    value={thresholdSNR} 
                    onChange={e => setThresholdSNR(Number(e.target.value))} 
                    className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-right ml-auto" 
                    min="0" step="0.5" 
                  />
                </div>
              </div>

              <button
                onClick={handleRunFit}
                disabled={!h5Path || status === 'fitting' || status === 'applying' || peaks.filter(p => p.active).length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-900/40 transition-all disabled:opacity-40"
              >
                {status === 'fitting' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                Run Fit (Preview)
              </button>
              <button
                onClick={handleApplyToMap}
                disabled={status !== 'fit_done'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-900/40 transition-all disabled:opacity-40"
              >
                {status === 'applying' ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />}
                Apply to Full Map ({nSpectra} spectra)
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="h-10 px-4 border-b border-slate-800 flex items-center gap-3 shrink-0 bg-slate-900">
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            {sidebarOpen ? <ChevronDown size={16} className="rotate-90" /> : <ChevronUp size={16} className="rotate-90" />}
          </button>
          <StatusBadge status={status} />
          {fitData && (
            <div className="flex gap-3 ml-auto">
              <MetricChip label="R²"  value={fitData.metrics.r_squared.toFixed(4)} ok={fitData.metrics.r_squared > 0.98} />
              <MetricChip label="χ²r" value={fitData.metrics.chi2_reduced.toFixed(3)} ok={fitData.metrics.chi2_reduced < 2} />
              <MetricChip label="AIC" value={fitData.metrics.aic.toFixed(1)} />
              <button onClick={() => setShowBaseline(s => !s)} className={cn("text-[10px] px-2 py-1 rounded-lg border font-bold transition-all", showBaseline ? "bg-amber-900/30 border-amber-700 text-amber-400" : "border-slate-700 text-slate-500")}>BL</button>
              
              <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                <button onClick={() => {setShowResiduals(true); setResidualViewMode('offset')}} className={cn("text-[9px] px-2 py-0.5 rounded transition-all", showResiduals && residualViewMode === 'offset' ? "bg-slate-600 text-white font-bold" : "text-slate-400")}>Offset</button>
                <button onClick={() => {setShowResiduals(true); setResidualViewMode('zero')}} className={cn("text-[9px] px-2 py-0.5 rounded transition-all", showResiduals && residualViewMode === 'zero' ? "bg-slate-600 text-white font-bold" : "text-slate-400")}>Zero</button>
                <button onClick={() => {setShowResiduals(true); setResidualViewMode('normalized')}} className={cn("text-[9px] px-2 py-0.5 rounded transition-all", showResiduals && residualViewMode === 'normalized' ? "bg-slate-600 text-white font-bold" : "text-slate-400")}>Norm</button>
                <button onClick={() => setShowResiduals(false)} className={cn("text-[9px] px-2 py-0.5 rounded transition-all ml-1", !showResiduals ? "bg-red-900/40 text-red-400 font-bold" : "text-slate-400")}>Hide</button>
              </div>
            </div>
          )}
          {!fitData && (
            <p className="text-[11px] text-slate-500 ml-2">
              {peaks.length === 0
                ? 'Select a template or click on the spectrum to add peaks, then Run Fit'
                : `${peaks.filter(p => p.active).length} active peak(s) — click Run Fit or drag the markers`}
            </p>
          )}
        </div>

        {/* Plot area */}
        <div className={cn("shrink-0 overflow-hidden", status === 'done' ? "h-[45%]" : "flex-1")}>
          <Plot
            data={traces}
            layout={{
              ...LAYOUT_BASE,
              shapes,
              showlegend: true,
              legend: { orientation: 'h', x: 0, y: 1.0, bgcolor: 'rgba(0,0,0,0)', font: { size: 10 } },
              height: undefined,
              autosize: true,
            } as any}
            config={{
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: ['select2d', 'lasso2d', 'resetScale2d'],
              responsive: true,
              editable: true,
            }}
            style={{ width: '100%', height: '100%' }}
            onClick={handlePlotClick}
            onRelayout={handlePeakDrag}
          />
        </div>

        {/* Parameters table (after fit) */}
        {fitData && status !== 'done' && (
          <div className="shrink-0 border-t border-slate-800 overflow-x-auto flex flex-col">
            {(fitData as any).local_metrics && Object.keys((fitData as any).local_metrics).length > 0 && (
              <div className="flex gap-4 p-2 bg-slate-900 border-b border-slate-800 overflow-x-auto">
                {Object.entries((fitData as any).local_metrics).map(([k, v]) => (
                  <span key={k} className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                    <strong className="text-slate-300">{k.toUpperCase()}:</strong> {v as number}
                  </span>
                ))}
              </div>
            )}
            <ParametersTable parameters={fitData.parameters} />
          </div>
        )}

        {/* Results panel (after apply to map) */}
        {status === 'done' && mapResult && (
          <div className="flex-1 overflow-hidden border-t border-slate-800">
            <DeconvolutionResultsPanel
              result={mapResult}
              mapWidth={mapWidth}
              mapHeight={mapHeight}
              peakNames={peaks.filter(p => p.active).map(p => p.name)}
            />
          </div>
        )}
      </div>

      {/* TEMPLATE LOADER MODAL */}
      {showTemplates && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-6" onClick={() => setShowTemplates(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-2">
                <FolderOpen size={16} className="text-indigo-400" />
                <h4 className="text-sm font-bold text-slate-200">Deconvolution Templates</h4>
              </div>
              <button onClick={() => setShowTemplates(false)} className="text-slate-500 hover:text-slate-300 transition-colors text-xl">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 max-h-[60vh]">
              {/* System Templates */}
              <div className="mb-6">
                <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-[2px] mb-3">System Presets</h5>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(templates).map(([key, tmpl]) => (
                    <button key={key} onClick={() => applyTemplate(key)} className="group p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-indigo-500 hover:bg-indigo-950/20 transition-all text-left">
                      <div className="text-xs font-bold text-slate-300 group-hover:text-indigo-400 mb-1">{(tmpl as any).label}</div>
                      <div className="text-[9px] text-slate-600 line-clamp-2">{(tmpl as any).description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Local Templates */}
              <div>
                <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-[2px] mb-3">Your Templates (Local)</h5>
                {Object.keys(localTemplates).length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-slate-800 rounded-xl">
                    <p className="text-[10px] text-slate-600 uppercase tracking-widest">No local templates saved yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(localTemplates).map(([name, tmpl]) => (
                      <div key={name} className="relative group">
                        <button 
                          onClick={() => applyTemplate(name, true)} 
                          className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-emerald-500 hover:bg-emerald-950/20 transition-all text-left"
                        >
                          <div className="text-xs font-bold text-slate-300 group-hover:text-emerald-400 mb-1">{name}</div>
                          <div className="text-[9px] text-slate-600">{(tmpl.peaks || []).length} peaks identified</div>
                        </button>
                        <button 
                          onClick={() => {
                            const next = { ...localTemplates };
                            delete next[name];
                            setLocalTemplates(next);
                            localStorage.setItem('phdnexus_decon_templates', JSON.stringify(next));
                          }}
                          className="absolute top-2 right-2 p-1 text-slate-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 bg-slate-950/50 border-t border-slate-800 text-[9px] text-slate-600 text-center italic">
              System presets are defined in the Python engine. Local templates are stored in your browser.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FitStatus }) {
  const map: Record<FitStatus, { label: string; color: string; icon?: React.ReactNode }> = {
    idle:      { label: 'Ready',         color: 'text-slate-400' },
    fitting:   { label: 'Fitting…',      color: 'text-indigo-400', icon: <Loader2 size={11} className="animate-spin" /> },
    fit_done:  { label: 'Fit complete',  color: 'text-emerald-400', icon: <CheckCircle2 size={11} /> },
    applying:  { label: 'Applying to map…', color: 'text-amber-400', icon: <Loader2 size={11} className="animate-spin" /> },
    done:      { label: 'Map fit done',  color: 'text-emerald-400', icon: <CheckCircle2 size={11} /> },
    error:     { label: 'Error',         color: 'text-red-400', icon: <AlertCircle size={11} /> },
  };
  const s = map[status];
  return (
    <div className={cn("flex items-center gap-1.5 text-[11px] font-bold", s.color)}>
      {s.icon}{s.label}
    </div>
  );
}

function MetricChip({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold",
      ok === true  ? "bg-emerald-900/30 border-emerald-800 text-emerald-400" :
      ok === false ? "bg-amber-900/30 border-amber-800 text-amber-400" :
                     "bg-slate-800 border-slate-700 text-slate-400"
    )}>
      <span className="opacity-60">{label}</span> {value}
    </div>
  );
}

function ParametersTable({ parameters }: { parameters: any[] }) {
  if (!parameters.length) return null;
  return (
    <table className="w-full text-[10px] font-mono">
      <thead>
        <tr className="bg-slate-900 text-slate-500">
          {['Peak','Model','Center','±','FWHM','±','Area','Amplitude','Health'].map((h, i) => (
            <th key={i} className="px-3 py-1.5 text-left font-semibold">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {parameters.map((p, i) => (
          <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/50 transition-colors">
            <td className="px-3 py-1.5 font-bold flex items-center gap-1.5" style={{ color: PEAK_COLORS[i % PEAK_COLORS.length] }}>
              {p.name}
              {p.description && (
                <Info size={12} className="text-slate-500 cursor-help opacity-70 hover:opacity-100" title={p.description} />
              )}
            </td>
            <td className="px-3 py-1.5 text-slate-400">{p.model}</td>
            <td className="px-3 py-1.5 text-slate-200">{p.center.toFixed(2)}</td>
            <td className="px-3 py-1.5 text-slate-500">±{p.center_err.toFixed(3)}</td>
            <td className="px-3 py-1.5 text-slate-200">{p.fwhm.toFixed(2)}</td>
            <td className="px-3 py-1.5 text-slate-500">±{p.fwhm_err.toFixed(3)}</td>
            <td className="px-3 py-1.5 text-slate-200">{p.area.toFixed(1)}</td>
            <td className="px-3 py-1.5 text-slate-200">{p.amplitude.toFixed(1)}</td>
            <td className="px-3 py-1.5 font-bold">
              {p.health === 'OK' ? <span className="text-emerald-400">OK</span> : <span className="text-red-400">{p.health}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BaselineSlider({ label, value, min, max, step, scale, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  scale?: 'log'; onChange: (v: number) => void;
}) {
  const display = scale === 'log' ? value.toExponential(0) : value.toFixed(3);
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between">
        <span className="text-[9px] text-slate-500">{label}</span>
        <span className="text-[9px] text-slate-400 font-mono">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber-500 h-1"
      />
    </div>
  );
}

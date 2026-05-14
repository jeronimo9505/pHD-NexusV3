'use client';

import { useState, useEffect, useMemo } from 'react';
import { Play, Save, FolderOpen, Trash2, Plus, ChevronRight, Settings2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SCIENCE_ENGINE_URL } from '@/lib/desktop';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

const AXIS_STYLE = {
    gridcolor: '#1e293b',
    zerolinecolor: '#334155',
    color: '#94a3b8',
    tickfont: { size: 10, color: '#94a3b8' },
};

const LAYOUT_BASE = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, sans-serif', size: 10, color: '#94a3b8' },
    margin: { l: 55, r: 20, t: 20, b: 40 },
    xaxis: { ...AXIS_STYLE, title: { text: 'Raman Shift (cm-1)', font: { size: 10 } } },
    yaxis: { ...AXIS_STYLE, title: { text: 'Intensity', font: { size: 10 } } },
    showlegend: true,
    legend: { orientation: 'h', x: 0, y: 1.05, bgcolor: 'rgba(0,0,0,0)', font: { size: 10, color: '#f8fafc' } },
};

interface PipelineEditorProps {
    vaultRoot: string;
    h5Path: string;
    onFileCreated?: (file: any) => void;
}

export function PipelineEditor({ vaultRoot, h5Path, onFileCreated }: PipelineEditorProps) {
    const [steps, setSteps] = useState<any[]>([]);
    const [originalData, setOriginalData] = useState<any[]>([]);
    const [processedData, setProcessedData] = useState<any[]>([]);
    const [baselineData, setBaselineData] = useState<any[]>([]);
    const [stageInputData, setStageInputData] = useState<any[]>([]);
    const [spikePositions, setSpikePositions] = useState<number[]>([]);
    const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedTemplates, setSavedTemplates] = useState<Record<string, any[]>>({});
    const [showTemplates, setShowTemplates] = useState(false);
    const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null);
    const [saveNameInput, setSaveNameInput] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    
    useEffect(() => {
        const t = localStorage.getItem('phdnexus_pipeline_templates');
        if (t) {
            try { setSavedTemplates(JSON.parse(t)); } catch(e){}
        }
    }, []);
    
    useEffect(() => {
        setOriginalData([]);
        setProcessedData([]);
        setBaselineData([]);
        setStageInputData([]);
        setActiveStepIndex(null);
    }, [vaultRoot, h5Path]);

    useEffect(() => {
        const controller = new AbortController();
        async function updatePreview(signal: AbortSignal) {
            if (!vaultRoot || !h5Path) return;
            setIsProcessing(true);
            setError(null);
            try {
                const res = await fetch(`${SCIENCE_ENGINE_URL}/api/pipeline/preview`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        vault_root: vaultRoot, 
                        h5_relative_path: h5Path, 
                        steps,
                        focus_index: activeStepIndex ?? -1
                    }),
                    signal
                });
                
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.detail || "Backend error");
                }

                const data = await res.json();
                if (data.success) {
                    if (data.original) setOriginalData(data.original);
                    if (data.processed) setProcessedData(data.processed);
                    if (data.baseline) setBaselineData(data.baseline);
                    else setBaselineData([]);
                    if (data.stage_input) setStageInputData(data.stage_input);
                    else setStageInputData([]);
                    setSpikePositions(data.spike_positions ?? []);
                }
            } catch (err: any) {
                if (err.name === 'AbortError') return;
                console.error("Preview failed", err);
                setError(err.message);
            } finally {
                setIsProcessing(false);
            }
        }
        
        const timer = setTimeout(() => updatePreview(controller.signal), 800);
        return () => { controller.abort(); clearTimeout(timer); };
    }, [steps, vaultRoot, h5Path, activeStepIndex]);

    const handleAddStep = (type: string) => {
        const minX = originalData.length > 0 ? Math.min(...originalData.map(d => d.x)) : 0;
        const maxX = originalData.length > 0 ? Math.max(...originalData.map(d => d.x)) : 3000;
        const newStep = {
            id: crypto.randomUUID(),
            type,
            enabled: true,
            params: type === 'crop' ? { start: Math.floor(minX), end: Math.ceil(maxX) } :
                    type === 'baseline' ? { method: 'asls', lam: 100000, p: 0.001, eta: 0.5, lam_1: 0.0001, k: 2.0, poly_order: 5, tol: 0.001, max_half_window: 40, decreasing: false, peak_regions: [] } :
                    type === 'despike' ? { method: 'whitaker_hayes', threshold: 7.0, window: 7, iterations: 1, show_spikes: false } :
                    type === 'normalize' ? { method: 'vector' } : {}
        };
        setSteps([...steps, newStep]);
        setActiveStepIndex(steps.length);
    };

    const handleUpdateStep = (index: number, newParams: any) => {
        const newSteps = [...steps];
        newSteps[index].params = { ...newSteps[index].params, ...newParams };
        setSteps(newSteps);
    };
    
    const handleToggleStep = (index: number) => {
        const newSteps = [...steps];
        newSteps[index].enabled = !newSteps[index].enabled;
        setSteps(newSteps);
    };

    const handleRemoveStep = (index: number) => {
        const newSteps = [...steps];
        newSteps.splice(index, 1);
        setSteps(newSteps);
        if (activeStepIndex === index) setActiveStepIndex(null);
    };

    const handleRunFullMap = async () => {
        // Use activeTemplateName if it perfectly matches the current steps
        let pipelineName = activeTemplateName;
        
        if (!pipelineName || JSON.stringify(savedTemplates[pipelineName]) !== JSON.stringify(steps)) {
            // Fallback: Find if current steps exactly match ANY saved template
            const activeTemplateEntry = Object.entries(savedTemplates).find(
                ([_, templateSteps]) => JSON.stringify(templateSteps) === JSON.stringify(steps)
            );
            
            if (activeTemplateEntry) {
                pipelineName = activeTemplateEntry[0];
            } else {
                // No matching template — ask to save first by showing save input
                setShowSaveInput(true);
                return;
            }
        }
        
        if (!confirm(`Apply the "${pipelineName}" pipeline to the entire map? This will create a new file.`)) return;
        
        setIsProcessing(true);
        try {
            const res = await fetch(`${SCIENCE_ENGINE_URL}/api/pipeline/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    vault_root: vaultRoot, 
                    h5_relative_path: h5Path, 
                    steps,
                    pipeline_name: pipelineName
                })
            });
            const data = await res.json();
            if (data.success) {
                if (onFileCreated && data.file) {
                    onFileCreated(data.file);
                }
            } else {
                throw new Error(data.message || "Failed to apply pipeline");
            }
        } catch (err: any) {
            alert("Error: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const saveTemplate = (name?: string) => {
        const finalName = name || saveNameInput.trim();
        if (!finalName) return;
        const newTemplates = { ...savedTemplates, [finalName]: steps };
        setSavedTemplates(newTemplates);
        localStorage.setItem('phdnexus_pipeline_templates', JSON.stringify(newTemplates));
        setActiveTemplateName(finalName);
        setSaveNameInput('');
        setShowSaveInput(false);
    };

    const saveTemplateChanges = () => {
        if (!activeTemplateName) return;
        saveTemplate(activeTemplateName);
    };

    const loadTemplate = (name: string) => {
        setSteps(savedTemplates[name]);
        setActiveTemplateName(name);
        setShowTemplates(false);
    };

    // Transform data for Plotly
    const traces = useMemo(() => {
        const t: any[] = [];
        if (originalData.length > 0) {
            t.push({
                type: 'scattergl', mode: 'lines', name: 'Original',
                x: originalData.map(d => d.x), y: originalData.map(d => d.y),
                line: { color: '#475569', width: 1.5 },
                hovertemplate: '%{x:.1f} cm-1<br>Original: %{y:.0f}<extra></extra>',
            });
        }
        
        if (baselineData.length > 0) {
            t.push({
                type: 'scattergl', mode: 'lines', name: 'Baseline',
                x: baselineData.map(d => d.x), y: baselineData.map(d => d.y),
                line: { color: '#f59e0b', width: 1.5, dash: 'dash' },
                hovertemplate: '%{x:.1f} cm-1<br>Baseline: %{y:.0f}<extra></extra>',
            });
        }
        
        if (activeStepIndex !== null && stageInputData.length > 0) {
            t.push({
                type: 'scattergl', mode: 'lines', name: 'Input',
                x: stageInputData.map(d => d.x), y: stageInputData.map(d => d.y),
                line: { color: '#94a3b8', width: 1.5, dash: 'dot' },
                hovertemplate: '%{x:.1f} cm-1<br>Input: %{y:.0f}<extra></extra>',
            });
        }

        if (processedData.length > 0) {
            t.push({
                type: 'scattergl', mode: 'lines', name: 'Processed',
                x: processedData.map(d => d.x), y: processedData.map(d => d.y),
                line: { color: '#4ade80', width: 2 },
                hovertemplate: '%{x:.1f} cm-1<br>Processed: %{y:.0f}<extra></extra>',
            });
        }

        return t;
    }, [originalData, processedData, baselineData, stageInputData, activeStepIndex]);

    // Plotly Shapes for Spikes and Peak Regions
    const shapes = useMemo(() => {
        const s: any[] = [];
        const activeStep = activeStepIndex !== null ? steps[activeStepIndex] : null;

        // Spikes
        if (activeStep?.type === 'despike' && activeStep?.params?.show_spikes) {
            spikePositions.forEach(spx => {
                s.push({
                    type: 'line',
                    x0: spx, x1: spx, y0: 0, y1: 1, yref: 'paper',
                    line: { color: '#ef4444', width: 1.5, dash: 'dot' },
                });
            });
        }

        // Peak Protection Regions
        if (activeStep?.type === 'baseline') {
            (activeStep.params.peak_regions || []).forEach((region: number[]) => {
                s.push({
                    type: 'rect',
                    x0: region[0], x1: region[1], y0: 0, y1: 1, yref: 'paper',
                    fillcolor: '#6366f1', opacity: 0.15,
                    line: { width: 0 },
                });
            });
        }
        return s;
    }, [activeStepIndex, steps, spikePositions]);

    return (
        <div className="flex h-full w-full bg-slate-50">
            {/* Sidebar Controls */}
            <div className="w-96 border-r bg-white flex flex-col shadow-sm">
                <div className="p-4 border-b bg-slate-50/50 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                            <Settings2 className="w-4 h-4 text-indigo-500" />
                            Pipeline Steps
                        </h3>
                        <div className="flex gap-1">
                            <button onClick={() => setShowTemplates(!showTemplates)} className="p-1.5 hover:bg-slate-200 rounded-md transition-colors" title="Cargar Template">
                                <FolderOpen className="w-4 h-4 text-slate-600" />
                            </button>
                            <button onClick={() => { setSaveNameInput(activeTemplateName || ''); setShowSaveInput(v => !v); }} className="p-1.5 hover:bg-slate-200 rounded-md transition-colors" title="Guardar como nuevo template">
                                <Save className="w-4 h-4 text-slate-600" />
                            </button>
                        </div>
                    </div>
                    {/* Active template badge */}
                    {activeTemplateName && (
                        <div className="flex items-center justify-between gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">
                            <div>
                                <div className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Template activo</div>
                                <div className="text-xs font-bold text-indigo-700">{activeTemplateName}</div>
                            </div>
                            {JSON.stringify(savedTemplates[activeTemplateName]) !== JSON.stringify(steps) && (
                                <button onClick={saveTemplateChanges} className="text-[9px] font-bold bg-indigo-600 text-white px-2 py-1 rounded-md hover:bg-indigo-700 transition-colors whitespace-nowrap">
                                    Guardar Cambios
                                </button>
                            )}
                        </div>
                    )}
                    {/* Save new template input */}
                    {showSaveInput && (
                        <div className="flex gap-1">
                            <input
                                autoFocus
                                value={saveNameInput}
                                onChange={e => setSaveNameInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveTemplate(); if (e.key === 'Escape') setShowSaveInput(false); }}
                                placeholder="Nombre del template..."
                                className="flex-1 text-xs border border-slate-300 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                            <button onClick={() => saveTemplate()} className="px-2 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors">
                                OK
                            </button>
                        </div>
                    )}
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {steps.map((step, i) => (
                        <div 
                            key={i} 
                            onClick={() => setActiveStepIndex(i)}
                            className={cn(
                                "border rounded-lg p-3 bg-white transition-all cursor-pointer group", 
                                !step.enabled && "opacity-50",
                                activeStepIndex === i ? "border-indigo-500 ring-2 ring-indigo-500/20 shadow-md" : "border-slate-200 hover:border-slate-300"
                            )}
                        >
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                                        activeStepIndex === i ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-500"
                                    )}>
                                        {i + 1}
                                    </div>
                                    <span className="font-bold text-xs uppercase tracking-wider text-slate-600">{step.type}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" checked={step.enabled || false} onClick={(e) => e.stopPropagation()} onChange={() => handleToggleStep(i)} className="rounded border-slate-300" />
                                    <button onClick={(e) => { e.stopPropagation(); handleRemoveStep(i); }} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            
                            {step.type === 'crop' && (
                                <div className="grid grid-cols-2 gap-3 mt-2">
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-400 uppercase">Min cm⁻¹</label>
                                        <input type="number" value={step.params.start ?? ''} onChange={(e) => handleUpdateStep(i, { start: e.target.value === '' ? undefined : parseFloat(e.target.value) })} className="w-full text-sm border border-slate-200 rounded-md p-1.5 outline-none focus:ring-1 focus:ring-indigo-400" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-semibold text-slate-400 uppercase">Max cm⁻¹</label>
                                        <input type="number" value={step.params.end ?? ''} onChange={(e) => handleUpdateStep(i, { end: e.target.value === '' ? undefined : parseFloat(e.target.value) })} className="w-full text-sm border border-slate-200 rounded-md p-1.5 outline-none focus:ring-1 focus:ring-indigo-400" />
                                    </div>
                                </div>
                            )}

                            {step.type === 'despike' && <DespikePanel step={step} index={i} onUpdate={handleUpdateStep} spikeCount={activeStepIndex === i ? spikePositions.length : 0} />}
                            {step.type === 'baseline' && <BaselinePanel step={step} index={i} onUpdate={handleUpdateStep} />}
                        </div>
                    ))}

                    <div className="grid grid-cols-2 gap-2 pt-2">
                        <button onClick={() => handleAddStep('crop')} className="text-[10px] font-bold py-2 border border-dashed border-slate-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-all text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1">
                            <Plus className="w-3 h-3" /> CROP
                        </button>
                        <button onClick={() => handleAddStep('despike')} className="text-[10px] font-bold py-2 border border-dashed border-slate-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-all text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1">
                            <Plus className="w-3 h-3" /> DESPIKE
                        </button>
                        <button onClick={() => handleAddStep('baseline')} className="text-[10px] font-bold py-2 border border-dashed border-slate-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-all text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1">
                            <Plus className="w-3 h-3" /> BASELINE
                        </button>
                        <button onClick={() => handleAddStep('normalize')} className="text-[10px] font-bold py-2 border border-dashed border-slate-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-all text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1">
                            <Plus className="w-3 h-3" /> NORMALIZE
                        </button>
                    </div>
                </div>

                <div className="p-4 border-t bg-slate-50 space-y-2">
                    <button 
                        onClick={handleRunFullMap}
                        disabled={isProcessing}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                        {isProcessing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                        Run on Full Map
                    </button>
                </div>
            </div>

            {/* Main Preview Area */}
            <div className="flex-1 flex flex-col relative bg-slate-900 overflow-hidden">
                {/* Status Overlay */}
                <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
                    <div className={cn(
                        "px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase flex items-center gap-2",
                        isProcessing ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                    )}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", isProcessing ? "bg-amber-500 animate-pulse" : "bg-emerald-500")} />
                        {isProcessing ? "Processing..." : "Engine Ready"}
                    </div>
                </div>

                {/* Chart */}
                <div className="flex-1 w-full relative">
                    <Plot
                        data={traces}
                        layout={{
                            ...LAYOUT_BASE,
                            shapes,
                            autosize: true,
                        } as any}
                        config={{
                            displayModeBar: true,
                            displaylogo: false,
                            modeBarButtonsToRemove: ['select2d', 'lasso2d'],
                            responsive: true,
                        }}
                        style={{ width: '100%', height: '100%' }}
                        useResizeHandler={true}
                    />
                </div>

                {/* Debug Info Overlay */}
                <div className="absolute bottom-4 right-4 p-3 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 pointer-events-none">
                    <div className="text-[9px] font-mono text-slate-400 space-y-1">
                        <div className="flex justify-between gap-4"><span>ORIG:</span> <span className="text-slate-200">{originalData.length} pts</span></div>
                        <div className="flex justify-between gap-4"><span>PROC:</span> <span className="text-emerald-400">{processedData.length} pts</span></div>
                        <div className="flex justify-between gap-4"><span>BASE:</span> <span className="text-amber-400">{baselineData.length} pts</span></div>
                        {error && <div className="text-red-400 mt-2 border-t border-red-400/20 pt-1">ERR: {error}</div>}
                    </div>
                </div>

                {/* Template Modal */}
                {showTemplates && (
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-8">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                                <h4 className="font-bold text-slate-800">Pipeline Templates</h4>
                                <button onClick={() => setShowTemplates(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                            </div>
                            <div className="p-2 max-h-96 overflow-y-auto">
                                {Object.keys(savedTemplates).length === 0 ? (
                                    <div className="p-8 text-center text-slate-400 text-sm">No saved templates yet</div>
                                ) : (
                                    Object.keys(savedTemplates).map(name => (
                                        <button key={name} onClick={() => loadTemplate(name)} className="w-full text-left p-3 hover:bg-slate-50 rounded-xl flex items-center justify-between group">
                                            <span className="font-medium text-slate-700">{name}</span>
                                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// SliderRow — only propagates onChange on pointer release to avoid hammering the API
function SliderRow({ label, value, min, max, step, onChange, inputCls }: {
    label: string; value: number; min: number; max: number; step: number;
    onChange: (v: number) => void; inputCls: string;
}) {
    const [local, setLocal] = useState(value);
    // Keep in sync if parent updates externally
    useEffect(() => { setLocal(value); }, [value]);
    const commit = (raw: string) => { const v = parseFloat(raw); if (!isNaN(v)) onChange(v); };
    return (
        <div className="flex items-center gap-2">
            <label className="text-[10px] font-semibold text-slate-400 w-28 shrink-0">{label}</label>
            <input
                type="range" min={min} max={max} step={step} value={local}
                onChange={e => setLocal(parseFloat(e.target.value))}
                onPointerUp={e => commit((e.target as HTMLInputElement).value)}
                onMouseUp={e => commit((e.target as HTMLInputElement).value)}
                className="flex-1 accent-indigo-500 cursor-pointer"
            />
            <input
                type="number" value={local} min={min} max={max} step={step}
                onChange={e => setLocal(parseFloat(e.target.value) || 0)}
                onBlur={e => commit(e.target.value)}
                className={inputCls}
            />
        </div>
    );
}

const DESPIKE_METHODS = [
    { value: 'whitaker_hayes', label: 'Whitaker-Hayes', desc: 'Z-score on 1st derivative. Industry standard for cosmic ray removal in Raman.' },
    { value: 'modified_z',    label: 'Modified Z-Score', desc: 'MAD-based Z-score on raw signal. Good general purpose despiking.' },
    { value: 'iqr',           label: 'IQR Method', desc: 'IQR-based detection. Robust with high-noise spectra.' },
];

function DespikePanel({ step, index, onUpdate, spikeCount }: {
    step: any; index: number; onUpdate: (i: number, p: any) => void; spikeCount: number;
}) {
    const p = step.params;
    const method = DESPIKE_METHODS.find(m => m.value === p.method) ?? DESPIKE_METHODS[0];
    const inputCls = 'w-16 text-xs border border-slate-200 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-400 font-mono bg-white';
    return (
        <div className="space-y-3 mt-2">
            <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Algorithm</label>
                <select value={p.method ?? 'whitaker_hayes'} onChange={e => onUpdate(index, { method: e.target.value })}
                    className="w-full mt-0.5 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none bg-white">
                    {DESPIKE_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{method.desc}</p>
            </div>
            <div className="space-y-2">
                <SliderRow label="Threshold (z)" value={p.threshold ?? 5} min={1} max={20} step={0.5} onChange={v => onUpdate(index, { threshold: v })} inputCls={inputCls} />
                <SliderRow label="Window (pts)" value={p.window ?? 7} min={3} max={51} step={2} onChange={v => onUpdate(index, { window: v })} inputCls={inputCls} />
                <SliderRow label="Iterations" value={p.iterations ?? 1} min={1} max={5} step={1} onChange={v => onUpdate(index, { iterations: v })} inputCls={inputCls} />
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!p.show_spikes} onChange={e => onUpdate(index, { show_spikes: e.target.checked })}
                        className="rounded border-slate-300 accent-indigo-500" />
                    <span className="text-[11px] font-semibold text-slate-600">Highlight spikes on chart</span>
                </label>
                {spikeCount > 0 && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600">{spikeCount} spikes</span>
                )}
            </div>
        </div>
    );
}

const BASELINE_METHODS = [
    { value: 'asls',       label: 'AsLS',       category: 'Whittaker',  desc: 'Asymmetric Least Squares. Best general-purpose baseline for Raman.' },
    { value: 'iasls',      label: 'iAsLS',      category: 'Whittaker',  desc: 'Improved AsLS with 1st derivative constraint.' },
    { value: 'airpls',     label: 'airPLS',     category: 'Whittaker',  desc: 'Adaptive Iterative Reweighted PLS. Excellent for fluorescence removal.' },
    { value: 'arpls',      label: 'arPLS',      category: 'Whittaker',  desc: 'Asymmetrically Reweighted PLS. Handles baseline drift well.' },
    { value: 'drpls',      label: 'drPLS',      category: 'Whittaker',  desc: 'Doubly Reweighted PLS. Handles both peaks and noise very well.' },
    { value: 'psalsa',     label: 'PSALSA',     category: 'Whittaker',  desc: 'Peak-aware AsLS - designed to NOT flatten Raman peaks.' },
    { value: 'modpoly',    label: 'ModPoly',    category: 'Polynomial', desc: 'Modified polynomial fit. Fast and good for simple baselines.' },
    { value: 'imodpoly',   label: 'iModPoly',   category: 'Polynomial', desc: 'Iterative modified polynomial. More accurate than ModPoly.' },
    { value: 'snip',       label: 'SNIP',       category: 'Smoothing',  desc: 'Statistics-sensitive Non-linear Iterative Peak-clipping.' },
    { value: 'rubberband', label: 'Rubberband', category: 'Other',      desc: 'Convex hull rubberband. Parameter-free, good for linear baselines.' },
];
const BL_CATEGORIES = ['All', 'Whittaker', 'Polynomial', 'Smoothing', 'Other'];

function BaselinePanel({ step, index, onUpdate }: { step: any; index: number; onUpdate: (i: number, p: any) => void }) {
    const [category, setCategory] = useState('All');
    const [newStart, setNewStart] = useState('');
    const [newEnd, setNewEnd] = useState('');
    const p = step.params;
    const filteredMethods = BASELINE_METHODS.filter(m => category === 'All' || m.category === category);
    const methodInfo = BASELINE_METHODS.find(m => m.value === (p.method ?? 'asls'));
    const inputCls = 'w-16 text-xs border border-slate-200 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-400 font-mono bg-white';
    const peakRegions: number[][] = p.peak_regions ?? [];

    const addRegion = () => {
        const s = parseFloat(newStart), e = parseFloat(newEnd);
        if (!isNaN(s) && !isNaN(e) && s < e) {
            onUpdate(index, { peak_regions: [...peakRegions, [s, e]] });
            setNewStart(''); setNewEnd('');
        }
    };

    return (
        <div className="space-y-3 mt-2">
            <div className="flex flex-wrap gap-1">
                {BL_CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setCategory(cat)}
                        className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full transition-all',
                            category === cat ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                        {cat}
                    </button>
                ))}
            </div>
            <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Method</label>
                <select value={p.method ?? 'asls'} onChange={e => onUpdate(index, { method: e.target.value })}
                    className="w-full mt-0.5 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none bg-white">
                    {filteredMethods.map(m => <option key={m.value} value={m.value}>{m.label} - {m.category}</option>)}
                </select>
                {methodInfo && <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{methodInfo.desc}</p>}
            </div>
            {['asls','iasls','airpls','arpls','drpls','psalsa'].includes(p.method ?? 'asls') && (
                <div className="space-y-2">
                    <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Smoothing lambda</label>
                            <span className="text-[10px] font-mono text-indigo-400">{(p.lam ?? 1e5).toExponential(0)}</span>
                        </div>
                        <input type="range" min={2} max={10} step={0.25}
                            value={Math.log10(p.lam ?? 1e5)}
                            onChange={e => onUpdate(index, { lam: Math.pow(10, parseFloat(e.target.value)) })}
                            className="w-full accent-indigo-500" />
                        <div className="flex justify-between text-[9px] text-slate-300 font-mono mt-0.5">
                            <span>1e2</span><span>1e6</span><span>1e10</span>
                        </div>
                    </div>
                    {['asls','iasls','psalsa'].includes(p.method ?? 'asls') && (
                        <SliderRow label="Asymmetry p" value={p.p ?? 0.001} min={0.0001} max={0.1} step={0.0005} onChange={v => onUpdate(index, { p: v })} inputCls={inputCls} />
                    )}
                    {(p.method === 'drpls') && (
                        <SliderRow label="Eta" value={p.eta ?? 0.5} min={0} max={1} step={0.05} onChange={v => onUpdate(index, { eta: v })} inputCls={inputCls} />
                    )}
                    {(p.method === 'psalsa') && (
                        <SliderRow label="Scale k" value={p.k ?? 2.0} min={0.5} max={10} step={0.5} onChange={v => onUpdate(index, { k: v })} inputCls={inputCls} />
                    )}
                </div>
            )}
            {['modpoly','imodpoly'].includes(p.method ?? '') && (
                <SliderRow label="Poly Order" value={p.poly_order ?? 5} min={1} max={12} step={1} onChange={v => onUpdate(index, { poly_order: v })} inputCls={inputCls} />
            )}
            {(p.method === 'snip') && (
                <SliderRow label="Half Window" value={p.max_half_window ?? 40} min={5} max={100} step={5} onChange={v => onUpdate(index, { max_half_window: v })} inputCls={inputCls} />
            )}
            <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-1">Peak Protection</p>
                <p className="text-[9px] text-slate-400 mb-2">Mark regions with real peaks - baseline will not flatten them.</p>
                {peakRegions.map((region, ri) => (
                    <div key={ri} className="flex items-center gap-1.5 mb-1 bg-indigo-50 rounded-lg px-2 py-1">
                        <span className="text-[10px] font-mono text-indigo-700 flex-1">{region[0].toFixed(0)} to {region[1].toFixed(0)} cm-1</span>
                        <button onClick={() => onUpdate(index, { peak_regions: peakRegions.filter((_, j) => j !== ri) })}
                            className="text-slate-400 hover:text-red-500 transition-colors text-xs">x</button>
                    </div>
                ))}
                <div className="flex items-center gap-1 mt-1">
                    <input type="number" placeholder="Start" value={newStart} onChange={e => setNewStart(e.target.value)}
                        className="w-14 text-xs border border-slate-200 rounded px-1.5 py-1 outline-none" />
                    <span className="text-slate-400 text-xs">to</span>
                    <input type="number" placeholder="End" value={newEnd} onChange={e => setNewEnd(e.target.value)}
                        className="w-14 text-xs border border-slate-200 rounded px-1.5 py-1 outline-none" />
                    <span className="text-[9px] text-slate-400">cm-1</span>
                    <button onClick={addRegion}
                        className="ml-1 text-[10px] font-bold px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors">+ Add</button>
                </div>
            </div>
        </div>
    );
}

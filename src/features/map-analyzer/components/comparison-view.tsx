'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { SCIENCE_ENGINE_URL } from '@/lib/desktop';
import { ZoomOut, Info, Save, RefreshCw, History, ChevronDown, Clock, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

// Carga dinámica de Plotly para evitar errores de SSR en Next.js
const Plot = dynamic(() => import('react-plotly.js'), { 
    ssr: false,
    loading: () => <div className="w-full h-full flex items-center justify-center bg-white text-slate-400">Loading Plotly...</div>
});

interface VaultFile {
    id: string;
    h5_relative_path: string;
    name: string;
    sample_name: string;
    technique: string;
    n_spectra: number;
    pipeline_applied?: boolean;
}

export function ComparisonView({ 
    compareFiles,
    dbSamples = [],
    vaultRoot,
    onSaveWorkspace,
    isSaving,
    savedWorkspaces = [],
    onLoadWorkspace,
    onClear
}: { 
    compareFiles: VaultFile[];
    dbSamples?: any[];
    vaultRoot: string;
    onSaveWorkspace?: () => void;
    isSaving?: boolean;
    savedWorkspaces?: any[];
    onLoadWorkspace?: (ws: any) => void;
    onClear: () => void;
}) {
    const [spectra, setSpectra] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const colors = [
        "#2563eb", // blue-600
        "#dc2626", // red-600
        "#16a34a", // green-600
        "#9333ea", // purple-600
        "#ea580c", // orange-600
        "#0891b2", // cyan-600
        "#db2777", // pink-600
        "#ca8a04", // yellow-600
        "#4f46e5", // indigo-600
        "#059669", // emerald-600
        "#be123c", // rose-700
        "#475569"  // slate-600
    ];

    useEffect(() => {
        if (compareFiles.length === 0) {
            setSpectra({});
            return;
        }

        let isMounted = true;
        
        async function fetchSpectra() {
            setLoading(true);
            setError(null);
            
            try {
                const promises = compareFiles.map(async (file) => {
                    const res = await fetch(`${SCIENCE_ENGINE_URL}/api/map/representative-spectrum`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            vault_root: vaultRoot,
                            h5_relative_path: file.h5_relative_path
                        })
                    });
                    
                    if (!res.ok) throw new Error(`Failed to fetch ${file.name}`);
                    const data = await res.json();
                    if (data.success && data.data) {
                        return { id: file.id, data: data.data };
                    }
                    return null;
                });
                
                const results = await Promise.all(promises);
                
                if (isMounted) {
                    const newSpectra: Record<string, any[]> = {};
                    results.forEach(res => {
                        if (res) newSpectra[res.id] = res.data;
                    });
                    setSpectra(newSpectra);
                }
            } catch (err: any) {
                if (isMounted) setError(err.message || 'Error loading spectra');
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        
        fetchSpectra();
        
        return () => { isMounted = false; };
    }, [compareFiles, vaultRoot]);

    const getSampleMetadata = (file: VaultFile) => {
        const prefixCode = file.name.split('_')[0];
        let s = dbSamples?.find(s => s.sample_code === prefixCode);
        
        if (!s) {
            s = dbSamples?.find(s => 
                s.sample_code === file.sample_name || 
                s.name === file.sample_name
            );
        }
        
        const sampleCode = s?.sample_code || prefixCode || file.sample_name || 'Unknown';
        let compObj = s?.composition;
        let compositionStr = '';
        
        if (compObj) {
            if (typeof compObj === 'string') {
                try {
                    if (compObj.trim().startsWith('[') || compObj.trim().startsWith('{')) {
                        compObj = JSON.parse(compObj);
                    } else {
                        compositionStr = compObj;
                    }
                } catch (e) {
                    compositionStr = compObj;
                }
            }
            
            if (Array.isArray(compObj)) {
                compositionStr = compObj.map((c: any) => {
                    if (typeof c === 'object' && c !== null) {
                        return c.code || c.value || c.element || c.material || c.name || JSON.stringify(c);
                    }
                    return String(c);
                }).join(' + ');
            } else if (typeof compObj === 'object' && compObj !== null && !compositionStr) {
                compositionStr = compObj.code || compObj.value || compObj.element || compObj.material || compObj.name || JSON.stringify(compObj);
            }
        }
        
        return { sampleCode, composition: compositionStr };
    };

    const formatLegendText = (file: VaultFile) => {
        const meta = getSampleMetadata(file);
        
        let shortName = file.name;
        if (shortName.startsWith(meta.sampleCode)) {
            shortName = shortName.substring(meta.sampleCode.length);
            if (shortName.startsWith('_')) shortName = shortName.substring(1);
        }
        if (shortName.startsWith('RAMAN_')) {
            shortName = shortName.substring(6);
        }
        if (shortName.endsWith('.h5')) {
            shortName = shortName.substring(0, shortName.length - 3);
        }
        if (shortName.length > 20) {
            shortName = shortName.substring(0, 17) + '...';
        }
        
        return `${meta.sampleCode} [${shortName}]${meta.composition ? ` | ${meta.composition}` : ''}`;
    };

    const [hoverData, setHoverData] = useState<{ x: number; yPos: number; xPos: number; items: any[] } | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    // Archivos que realmente tienen datos cargados
    const activeFiles = useMemo(() => compareFiles.filter(file => spectra[file.id]), [compareFiles, spectra]);

    // Preparar los datos para Plotly
    const plotlyData = useMemo(() => {
        return activeFiles.map((file, i) => ({
            x: spectra[file.id].map(p => p.x),
            y: spectra[file.id].map(p => p.y),
            type: 'scatter' as const,
            mode: 'lines' as const,
            name: formatLegendText(file),
            line: {
                color: colors[i % colors.length],
                width: 2
            },
            hoverinfo: 'none' as const
        }));
    }, [activeFiles, spectra]);



    const containerRef = useRef<HTMLDivElement>(null);

    // Memoizar layout para estabilidad
    const plotlyLayout = useMemo(() => ({
        autosize: true,
        margin: { l: 90, r: 30, b: 100, t: 40, pad: 4 },
        xaxis: {
            title: {
                text: 'Raman Shift (cm⁻¹)',
                font: { family: 'Inter, sans-serif', size: 16, color: '#1e293b', weight: 'bold' }
            },
            gridcolor: '#f1f5f9',
            zerolinecolor: '#e2e8f0',
            tickfont: { size: 14, color: '#475569', family: 'JetBrains Mono, monospace' },
            showspikes: true,
            spikemode: 'across',
            spikethickness: 1,
            spikedash: 'solid',
            spikecolor: '#cbd5e1'
        },
        yaxis: {
            title: {
                text: 'Raman Intensity (a.u.)',
                font: { family: 'Inter, sans-serif', size: 16, color: '#1e293b', weight: 'bold' }
            },
            gridcolor: '#f1f5f9',
            zerolinecolor: '#e2e8f0',
            tickfont: { size: 14, color: '#475569', family: 'JetBrains Mono, monospace' }
        },
        legend: {
            orientation: 'h' as const,
            yanchor: 'bottom' as const,
            y: -0.4,
            xanchor: 'center' as const,
            x: 0.5,
            font: { size: 13, color: '#334155', weight: 'bold' },
            bgcolor: 'rgba(255,255,255,0.8)',
            bordercolor: '#e2e8f0',
            borderwidth: 1
        },
        hovermode: 'x' as const,
        plot_bgcolor: 'white',
        paper_bgcolor: 'white',
        showlegend: true,
        uirevision: 'true' 
    }) as any, []);

    const plotlyConfig = useMemo(() => ({
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['select2d', 'lasso2d'] as any[],
        displayModeBar: true,
        toImageButtonOptions: {
            format: 'png' as const,
            filename: 'raman_comparison',
            height: 900,
            width: 1600,
            scale: 2
        }
    }), []);

    if (compareFiles.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-white text-slate-400 space-y-4">
                <p>No files selected for comparison.</p>
                <p className="text-sm">Select files from the library to compare them here.</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full h-full flex flex-col bg-white overflow-hidden relative group">
            <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button 
                    onClick={() => {
                        const Plotly = (window as any).Plotly;
                        if (Plotly) {
                            Plotly.downloadImage('plotly-comparison-chart', {
                                format: 'png',
                                width: 1600,
                                height: 900,
                                filename: `Raman_Comparison_${new Date().toISOString().slice(0,10)}`
                            });
                        }
                    }}
                    className="px-4 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-2"
                >
                    <Info size={14} />
                    Save Image (PNG)
                </button>
                {onSaveWorkspace && (
                    <button 
                        onClick={onSaveWorkspace}
                        disabled={isSaving}
                        className="px-4 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-2"
                        title="Save this set of files as a named comparison"
                    >
                        {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Comparison
                    </button>
                )}
                
                {savedWorkspaces && savedWorkspaces.length > 0 && (
                    <div className="relative">
                        <button 
                            onClick={() => setShowHistory(!showHistory)}
                            className="px-4 py-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-2"
                        >
                            <History size={14} />
                            Saved Comparisons
                            <ChevronDown size={14} className={cn("transition-transform", showHistory && "rotate-180")} />
                        </button>
                        
                        {showHistory && (
                            <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2">
                                <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                                    <Clock size={12} className="text-slate-400" />
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Comparisons</span>
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    {savedWorkspaces
                                        .filter(ws => ws.settings?.type === 'comparison' || ws.files?.length <= 10)
                                        .slice(0, 10)
                                        .map((ws) => (
                                            <button 
                                                key={ws.id}
                                                onClick={() => {
                                                    onLoadWorkspace?.(ws);
                                                    setShowHistory(false);
                                                }}
                                                className="w-full p-3 hover:bg-indigo-50/50 text-left transition-all border-b border-slate-50 last:border-0 group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                                        <FileText size={14} />
                                                    </div>
                                                    <div className="flex-1 overflow-hidden">
                                                        <p className="text-xs font-bold text-slate-700 truncate group-hover:text-indigo-900 transition-colors">{ws.name}</p>
                                                        <p className="text-[9px] text-slate-400 font-medium">
                                                            {ws.files?.length || 0} files • {new Date(ws.updated_at).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    {savedWorkspaces.length === 0 && (
                                        <div className="p-8 text-center text-slate-400 italic text-xs">
                                            No saved comparisons yet.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <button 
                    onClick={onClear}
                    className="px-4 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-bold transition-colors shadow-sm"
                >
                    Clear Comparison
                </button>
            </div>
            
            {loading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-sm">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
            
            {error && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg shadow-sm font-medium">
                    {error}
                </div>
            )}

            {/* Custom Tooltip */}
            {hoverData && (
                <div 
                    className="absolute z-50 bg-white/95 backdrop-blur shadow-xl border border-slate-200 rounded-lg p-3 pointer-events-none min-w-[180px]"
                    style={{ 
                        left: Math.min(hoverData.xPos + 20, (containerRef.current?.clientWidth || 800) - 200), 
                        top: Math.max(100, Math.min(hoverData.yPos, (containerRef.current?.clientHeight || 600) - 100)),
                        transform: 'translateY(-50%)'
                    }}
                >
                    <div className="text-[10px] font-bold text-slate-400 mb-2 border-b border-slate-100 pb-1 flex justify-between">
                        <span>SHIFT: {hoverData.x.toFixed(1)} cm⁻¹</span>
                        <span className="text-indigo-500">Sorted by Int.</span>
                    </div>
                    <div className="space-y-1.5">
                        {hoverData.items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-xs font-bold text-slate-700">{item.id}</span>
                                </div>
                                <span className="text-xs font-mono text-slate-600">{Math.round(item.y).toLocaleString()} <span className="text-[9px] text-slate-400">a.u.</span></span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex-1 w-full h-full pt-12">
                <Plot
                    divId="plotly-comparison-chart"
                    data={plotlyData}
                    onHover={(data) => {
                        if (!data.points || data.points.length === 0 || !containerRef.current) return;
                        
                        const x = data.points[0].x;
                        const event = data.event as MouseEvent;
                        if (!event) return;
                        
                        const rect = containerRef.current.getBoundingClientRect();
                        
                        // Ordenar puntos por intensidad (Y) de mayor a menor
                        const items = data.points
                            .map(p => {
                                const file = activeFiles[p.curveNumber];
                                return {
                                    id: file?.name.split('_')[0] || '?',
                                    y: p.y as number,
                                    color: (p as any).fullData.line.color
                                };
                            })
                            .sort((a, b) => b.y - a.y);

                        setHoverData({
                            x: x as number,
                            xPos: event.clientX - rect.left,
                            yPos: event.clientY - rect.top,
                            items
                        });
                    }}
                    onUnhover={() => setHoverData(null)}
                    layout={plotlyLayout as any}
                    config={plotlyConfig}
                    style={{ width: '100%', height: '100%' }}
                    useResizeHandler={true}
                />
            </div>
            
            <div className="absolute bottom-2 left-6 text-[10px] text-slate-400 font-medium flex items-center gap-2">
                <Info size={12} />
                <span>Usa la barra de herramientas superior para hacer Zoom, Pan (Mano), o descargar como imagen. El cuadro de información muestra las intensidades en Raman Intensity (a.u.) ordenadas de mayor a menor.</span>
            </div>
        </div>
    );
}

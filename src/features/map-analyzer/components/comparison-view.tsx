'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { SCIENCE_ENGINE_URL } from '@/lib/desktop';
import { 
    ZoomOut, Info, Save, RefreshCw, History, ChevronDown, 
    Clock, FileText, Check, AlertCircle, Sparkles, X
} from 'lucide-react';
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

function cleanRgiFileName(name: string): string {
    // 1. Quitar extensión .h5
    let clean = name.replace(/\.h5$/i, '');
    
    // 2. Quitar sufijos comunes de RGI y agrupaciones
    clean = clean.replace(/_grouped_rgi2_.*$/i, '');
    clean = clean.replace(/_grouped_rgi_.*$/i, '');
    clean = clean.replace(/_rgi2_.*$/i, '');
    clean = clean.replace(/_rgi_.*$/i, '');
    clean = clean.replace(/_grouped.*$/i, '');
    clean = clean.replace(/_rgi2$/i, '');
    clean = clean.replace(/_rgi$/i, '');
    
    // 3. Quitar prefijo de celda (ej. F1C1_)
    clean = clean.replace(/^[A-Z]\d[A-Z]\d_/i, '');
    
    // 4. Reemplazar guiones y guiones bajos por espacios o '&' para legibilidad
    clean = clean.replace(/_/g, ' ');
    clean = clean.replace(/\+/g, ' & ');
    clean = clean.replace(/-/g, ' & ');
    
    // 5. Normalizar espacios
    clean = clean.replace(/\s+/g, ' ').trim();
    
    return clean || name;
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
    const [tab, setTab] = useState<'spectra' | 'vector'>('spectra');
    const [spectra, setSpectra] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Excitation laser reference lines visibility on G-2D plot
    const [visibleLasers, setVisibleLasers] = useState<Record<'532' | '632.8' | '785', boolean>>({
        '532': true,
        '632.8': false,
        '785': false
    });

    // RGI session scientific maps state
    const [rgiSessions, setRgiSessions] = useState<Record<string, any>>({});
    const [loadingRgi, setLoadingRgi] = useState(false);
    const [rgiError, setRgiError] = useState<string | null>(null);

    // Grouping selection & label customization
    const [selectedFiles, setSelectedFiles] = useState<Record<string, boolean>>({});
    const [customLabels, setCustomLabels] = useState<Record<string, string>>({});

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

    // Initialize/sync checkboxes and custom names when compareFiles list changes
    useEffect(() => {
        const newSelected: Record<string, boolean> = { ...selectedFiles };
        const newLabels: Record<string, string> = { ...customLabels };
        compareFiles.forEach(file => {
            if (newSelected[file.id] === undefined) {
                newSelected[file.id] = true;
            }
            
            const currentLabel = newLabels[file.id];
            if (!currentLabel || currentLabel === 'New Sample') {
                const meta = getSampleMetadata(file);
                const sampleName = file.sample_name && file.sample_name !== 'New Sample' ? file.sample_name : null;
                const fallbackName = cleanRgiFileName(file.name);
                
                newLabels[file.id] = sampleName || fallbackName || meta.sampleCode || file.name.split('_')[0];
            }
        });
        setSelectedFiles(newSelected);
        setCustomLabels(newLabels);
    }, [compareFiles]);

    // Load representative spectra for standard compare plot
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

    // Fetch RGI scientific results (G/2D positions & mask) for vector plot
    useEffect(() => {
        if (tab !== 'vector' || compareFiles.length === 0) return;

        let isMounted = true;
        async function loadRgiMaps() {
            setLoadingRgi(true);
            setRgiError(null);
            const sessions: Record<string, any> = {};
            
            try {
                await Promise.all(compareFiles.map(async (file) => {
                    try {
                        let res = await fetch(`${SCIENCE_ENGINE_URL}/api/rgi2/load-scientific-maps`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                vault_root: vaultRoot,
                                h5_relative_path: file.h5_relative_path
                            })
                        });
                        let data = res.ok ? await res.json() : null;
                        if (!data?.success) {
                            res = await fetch(`${SCIENCE_ENGINE_URL}/api/rgi/load-scientific-maps`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    vault_root: vaultRoot,
                                    h5_relative_path: file.h5_relative_path
                                })
                            });
                            data = res.ok ? await res.json() : null;
                        }
                        
                        if (data?.success) {
                            sessions[file.id] = data;
                        }
                    } catch (e) {
                        console.error(`Error loading RGI maps for ${file.name}:`, e);
                    }
                }));
                
                if (isMounted) {
                    setRgiSessions(sessions);
                }
            } catch (err: any) {
                if (isMounted) setRgiError(err.message || 'Error loading RGI results');
            } finally {
                if (isMounted) setLoadingRgi(false);
            }
        }
        
        loadRgiMaps();
        return () => { isMounted = false; };
    }, [compareFiles, tab, vaultRoot]);

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

    // Spectra traces selection
    const activeFiles = useMemo(() => compareFiles.filter(file => spectra[file.id]), [compareFiles, spectra]);

    // Plotly traces for standard spectra
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

    const referenceOrigins = {
        '532': { G0: 1581.6, twoD0: 2669.7 },
        '632.8': { G0: 1581.6, twoD0: 2637.25 },
        '785': { G0: 1581.6, twoD0: 2603.7 }
    };

    // Calculate mean, std and decoupled strain/doping vectors for each RGI file
    const stats = useMemo(() => {
        const list: any[] = [];
        compareFiles.forEach(file => {
            if (selectedFiles[file.id] === false) return;

            const session = rgiSessions[file.id];
            if (!session || !session.pos_G || !session.pos_2D) return;

            const rawG = session.pos_G;
            const raw2D = session.pos_2D;
            const mask = session.analysis_mask;

            const validG: number[] = [];
            const valid2D: number[] = [];

            for (let idx = 0; idx < rawG.length; idx++) {
                const gVal = rawG[idx];
                const twoDVal = raw2D[idx];
                const isMasked = mask ? mask[idx] === true : true;

                if (gVal != null && Number.isFinite(gVal) && twoDVal != null && Number.isFinite(twoDVal) && isMasked) {
                    validG.push(gVal);
                    valid2D.push(twoDVal);
                }
            }

            if (validG.length === 0 || valid2D.length === 0) return;

            const meanG = validG.reduce((sum, v) => sum + v, 0) / validG.length;
            const mean2D = valid2D.reduce((sum, v) => sum + v, 0) / valid2D.length;

            const stdG = Math.sqrt(validG.reduce((sum, v) => sum + Math.pow(v - meanG, 2), 0) / validG.length);
            const std2D = Math.sqrt(valid2D.reduce((sum, v) => sum + Math.pow(v - mean2D, 2), 0) / valid2D.length);

            const stderrG = stdG / Math.sqrt(validG.length);
            const stderr2D = std2D / Math.sqrt(valid2D.length);

            // Auto-detect laser wavelength based on 2D peak position
            let detectedLaser: '532' | '632.8' | '785' = '532';
            if (mean2D < 2620) {
                detectedLaser = '785';
            } else if (mean2D >= 2620 && mean2D < 2655) {
                detectedLaser = '632.8';
            }

            const { G0: fileG0, twoD0: fileTwoD0 } = referenceOrigins[detectedLaser];

            // G-2D Decoupling Equations:
            // dG = omega_G - G0
            // d2D = omega_2D - twoD0
            // strain (%) = (0.7 * dG - d2D) / 90
            // doping (10^12 cm^-2) = (dG + 60 * strain) / 4.5
            const dG = meanG - fileG0;
            const d2D = mean2D - fileTwoD0;
            const strain = (0.7 * dG - d2D) / 90.0;
            const doping = (dG + 60.0 * strain) / 4.5;

            list.push({
                fileId: file.id,
                fileName: file.name,
                sampleName: file.sample_name,
                displayName: customLabels[file.id] || file.sample_name || file.name.split('_')[0],
                count: validG.length,
                meanG,
                stdG,
                stderrG,
                mean2D,
                std2D,
                stderr2D,
                strain,
                doping,
                validG,
                valid2D,
                detectedLaser
            });
        });
        return list;
    }, [compareFiles, rgiSessions, selectedFiles, customLabels]);

    // Auto-detect and enable laser reference lines based on compared dataset bands
    useEffect(() => {
        if (stats.length > 0) {
            const detectedWavelengths = { '532': false, '632.8': false, '785': false };
            let hasAny = false;
            stats.forEach(s => {
                if (s.detectedLaser) {
                    detectedWavelengths[s.detectedLaser as '532' | '632.8' | '785'] = true;
                    hasAny = true;
                }
            });
            if (hasAny) {
                setVisibleLasers(detectedWavelengths);
            }
        }
    }, [stats]);

    // Construct non-orthogonal strain and doping isoline grid for G-2D Plot
    const plotlyVectorData = useMemo(() => {
        const traces: any[] = [];
        const G_min = 1580;
        const G_max = 1600;

        const referenceOrigins = {
            '532': { G0: 1581.6, twoD0: 2669.7, colorBlue: '#2563eb', colorGrey: '#475569', labelPrefix: '532 nm' },
            '632.8': { G0: 1581.6, twoD0: 2637.25, colorBlue: '#2563eb', colorGrey: '#475569', labelPrefix: '632.8 nm' },
            '785': { G0: 1581.6, twoD0: 2603.7, colorBlue: '#2563eb', colorGrey: '#475569', labelPrefix: '785 nm' }
        };

        // Draw references for each active laser
        (['532', '632.8', '785'] as const).forEach(wl => {
            if (!visibleLasers[wl]) return;

            const { G0: wlG0, twoD0: wlTwoD0, labelPrefix } = referenceOrigins[wl];

            // 1. Strain isolines (constant strain, varying doping). Slope = 0.7
            // Positive values represent tensile strain (tension), negative values represent compressive strain
            const strains = [0.2, 0.1, 0.0, -0.1, -0.2, -0.3, -0.4, -0.5, -0.6];
            strains.forEach(eps => {
                const xPoints = [G_min, G_max];
                const yPoints = xPoints.map(x => wlTwoD0 - 90.0 * eps + 0.7 * (x - wlG0));
                traces.push({
                    x: xPoints,
                    y: yPoints,
                    mode: 'lines',
                    line: { 
                        color: eps === 0.0 ? '#2563eb' : '#cbd5e1', 
                        width: eps === 0.0 ? 1.5 : 0.8, 
                        dash: eps === 0.0 ? 'solid' : 'dash' 
                    },
                    showlegend: false,
                    hoverinfo: 'none'
                });

                // Label at the end of the line
                const labelX = 1595;
                const labelY = wlTwoD0 - 90.0 * eps + 0.7 * (labelX - wlG0) + 0.8;
                traces.push({
                    x: [labelX],
                    y: [labelY],
                    mode: 'text',
                    text: `${eps > 0 ? '+' : ''}${eps.toFixed(1)}`,
                    textposition: 'top center',
                    textfont: { size: 8, color: eps === 0.0 ? '#1e3a8a' : '#94a3b8', family: 'Inter, sans-serif' },
                    showlegend: false,
                    hoverinfo: 'none'
                });
            });

            // 2. Doping isolines (constant doping, varying strain). Slope = 2.2
            const dopings = [0, 2, 4, 6, 8, 10, 12, 14, 16];
            dopings.forEach(dop => {
                const xPoints = [G_min, G_max];
                const yPoints = xPoints.map(x => wlTwoD0 - 6.75 * dop + 2.2 * (x - wlG0));
                
                traces.push({
                    x: xPoints,
                    y: yPoints,
                    mode: 'lines',
                    line: { 
                        color: dop === 0 ? '#475569' : '#f1f5f9', 
                        width: dop === 0 ? 1.2 : 0.6, 
                        dash: dop === 0 ? 'solid' : 'dot' 
                    },
                    showlegend: false,
                    hoverinfo: 'none'
                });

                // Label at crossing Y
                const targetY = wlTwoD0 - 9.0;
                const labelX = (targetY - wlTwoD0 + 6.75 * dop) / 2.2 + wlG0;
                if (labelX >= G_min && labelX <= G_max) {
                    traces.push({
                        x: [labelX],
                        y: [targetY - 1.2],
                        mode: 'text',
                        text: `${dop}`,
                        textposition: 'bottom center',
                        textfont: { size: 8, color: dop === 0 ? '#1e293b' : '#cbd5e1', family: 'Inter, sans-serif' },
                        showlegend: false,
                        hoverinfo: 'none'
                    });
                }
            });

            // Legend tags for Strain and Doping axes
            traces.push({
                x: [1594],
                y: [wlTwoD0 - 90.0 * (-0.6) + 0.7 * (1594 - wlG0) + 3.0],
                mode: 'text',
                text: `ε (${labelPrefix})`,
                textfont: { size: 9, color: '#1e3a8a', weight: 'bold', family: 'Inter, sans-serif' },
                showlegend: false,
                hoverinfo: 'none'
            });

            traces.push({
                x: [1597.5],
                y: [wlTwoD0 - 9.0 - 2.5],
                mode: 'text',
                text: `n (${labelPrefix})`,
                textfont: { size: 9, color: '#334155', weight: 'bold', family: 'Inter, sans-serif' },
                showlegend: false,
                hoverinfo: 'none'
            });
        });

        // 3. Individual Raman map scatter points (drawn in background with low opacity)
        stats.forEach((s, idx) => {
            if (s.validG && s.valid2D) {
                traces.push({
                    x: s.validG,
                    y: s.valid2D,
                    type: 'scatter',
                    mode: 'markers',
                    name: `${s.displayName} (points)`,
                    showlegend: false,
                    hoverinfo: 'none',
                    marker: {
                        color: colors[idx % colors.length],
                        size: 3,
                        opacity: 0.12
                    }
                });
            }
        });

        // 4. User sample groups mean points
        stats.forEach((s, idx) => {
            traces.push({
                x: [s.meanG],
                y: [s.mean2D],
                error_x: {
                    type: 'data',
                    array: [s.stdG],
                    visible: true,
                    color: colors[idx % colors.length],
                    thickness: 1.5,
                    width: 3
                },
                error_y: {
                    type: 'data',
                    array: [s.std2D],
                    visible: true,
                    color: colors[idx % colors.length],
                    thickness: 1.5,
                    width: 3
                },
                type: 'scatter',
                mode: 'markers+text',
                name: s.displayName,
                marker: {
                    color: colors[idx % colors.length],
                    size: 9,
                    symbol: 'circle',
                    line: { color: 'white', width: 1.5 }
                },
                text: [s.displayName],
                textposition: 'top right',
                textfont: { size: 10, color: '#1e293b', weight: 'bold', family: 'Inter, sans-serif' },
                hovertemplate: `<b>%{text}</b><br>` +
                    `Láser: ${s.detectedLaser} nm<br>` +
                    `Pos(G): %{x:.2f} ± ${s.stdG.toFixed(2)} cm⁻¹<br>` +
                    `Pos(2D): %{y:.2f} ± ${s.std2D.toFixed(2)} cm⁻¹<br>` +
                    `Est. Strain: ${(s.strain * 100).toFixed(3)}%<br>` +
                    `Est. Doping: ${s.doping.toFixed(2)} × 10¹² cm⁻²<br>` +
                    `<extra></extra>`
            });
        });

        return traces;
    }, [stats, visibleLasers]);

    const containerRef = useRef<HTMLDivElement>(null);

    // Standard spectra Plotly configuration
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

    // Vector Plotly Layout configuration
    const plotlyVectorLayout = useMemo(() => {
        const referenceOrigins = {
            '532': { G0: 1581.6, twoD0: 2669.7, name: '532 nm' },
            '632.8': { G0: 1581.6, twoD0: 2637.25, name: '632.8 nm' },
            '785': { G0: 1581.6, twoD0: 2603.7, name: '785 nm' }
        };

        const annotations: any[] = [];

        // Generate annotations for each visible laser
        (['532', '632.8', '785'] as const).forEach(wl => {
            if (!visibleLasers[wl]) return;

            const { G0, twoD0, name } = referenceOrigins[wl];

            annotations.push(
                {
                    x: G0,
                    y: twoD0,
                    xref: 'x',
                    yref: 'y',
                    text: `O (${name}): ${G0.toFixed(1)}, ${twoD0.toFixed(0)}`,
                    showarrow: true,
                    arrowhead: 2,
                    ax: -55,
                    ay: -35,
                    font: { size: 9, color: '#475569', family: 'Inter, sans-serif', weight: 'bold' },
                    bgcolor: 'rgba(255, 255, 255, 0.95)',
                    bordercolor: '#cbd5e1',
                    borderwidth: 1,
                    borderpad: 3
                },
                {
                    x: G0 + 13.0,
                    y: twoD0 + 0.7 * 13.0,
                    xref: 'x',
                    yref: 'y',
                    text: `n (${name}) ➔`,
                    showarrow: false,
                    textangle: 21,
                    font: { size: 9, color: '#2563eb', family: 'Inter, sans-serif', weight: 'bold' },
                    bgcolor: 'rgba(239, 246, 255, 0.85)',
                    bordercolor: '#bfdbfe',
                    borderwidth: 1,
                    borderpad: 2
                },
                {
                    x: G0 + 6.0,
                    y: twoD0 + 2.2 * 6.0,
                    xref: 'x',
                    yref: 'y',
                    text: `Comp. (${name}) ➔`,
                    showarrow: false,
                    textangle: 52,
                    font: { size: 9, color: '#475569', family: 'Inter, sans-serif', weight: 'bold' },
                    bgcolor: 'rgba(248, 250, 252, 0.85)',
                    bordercolor: '#cbd5e1',
                    borderwidth: 1,
                    borderpad: 2
                },
                {
                    x: G0 - 1.2,
                    y: twoD0 + 2.2 * (-1.2),
                    xref: 'x',
                    yref: 'y',
                    text: `➔ Tension (${name})`,
                    showarrow: false,
                    textangle: 52,
                    font: { size: 9, color: '#b91c1c', family: 'Inter, sans-serif', weight: 'bold' },
                    bgcolor: 'rgba(254, 242, 242, 0.85)',
                    bordercolor: '#fca5a5',
                    borderwidth: 1,
                    borderpad: 2
                }
            );
        });

        // Dynamically calculate the Y-axis range to fit all visible lasers
        const visibleTwoD0s = (['532', '632.8', '785'] as const)
            .filter(wl => visibleLasers[wl])
            .map(wl => referenceOrigins[wl].twoD0);
        
        const minY = visibleTwoD0s.length > 0 ? Math.min(...visibleTwoD0s) - 20 : 2660;
        const maxY = visibleTwoD0s.length > 0 ? Math.max(...visibleTwoD0s) + 30 : 2700;

        return {
            autosize: true,
            margin: { l: 70, r: 40, b: 60, t: 40, pad: 4 },
            xaxis: {
                title: {
                    text: 'G band (cm⁻¹)',
                    font: { family: 'Inter, sans-serif', size: 13, color: '#1e293b', weight: 'bold' }
                },
                range: [1580, 1600],
                gridcolor: '#f8fafc',
                zeroline: false,
                tickfont: { size: 11, color: '#475569', family: 'JetBrains Mono, monospace' }
            },
            yaxis: {
                title: {
                    text: '2D band (cm⁻¹)',
                    font: { family: 'Inter, sans-serif', size: 13, color: '#1e293b', weight: 'bold' }
                },
                range: [minY, maxY],
                gridcolor: '#f8fafc',
                zeroline: false,
                tickfont: { size: 11, color: '#475569', family: 'JetBrains Mono, monospace' }
            },
            legend: {
                orientation: 'h' as const,
                yanchor: 'bottom' as const,
                y: 1.02,
                xanchor: 'center' as const,
                x: 0.5,
                font: { size: 11, color: '#334155', weight: 'bold' },
                bgcolor: 'rgba(255,255,255,0.9)',
                bordercolor: '#e2e8f0',
                borderwidth: 1
            },
            hovermode: 'closest' as const,
            plot_bgcolor: 'white',
            paper_bgcolor: 'white',
            showlegend: true,
            uirevision: 'vector_plot',
            annotations
        } as any;
    }, [visibleLasers]);

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
            {/* Top Bar Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-2 shrink-0 select-none z-10">
                <div className="flex">
                    <button
                        onClick={() => setTab('spectra')}
                        className={cn(
                            "px-4 py-2 text-xs font-bold transition-all border-b-2 mr-4",
                            tab === 'spectra' ? "border-indigo-600 text-indigo-600 font-black" : "border-transparent text-slate-500 hover:text-slate-700"
                        )}
                    >
                        Spectra Comparison
                    </button>
                    <button
                        onClick={() => setTab('vector')}
                        className={cn(
                            "px-5 py-2 text-xs font-bold transition-all border-b-2",
                            tab === 'vector' ? "border-indigo-600 text-indigo-600 font-black" : "border-transparent text-slate-500 hover:text-slate-700"
                        )}
                    >
                        G-2D Vector Correlation Plot
                    </button>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => {
                            const Plotly = (window as any).Plotly;
                            if (Plotly) {
                                const activeChartId = tab === 'spectra' ? 'plotly-comparison-chart' : 'plotly-vector-chart';
                                Plotly.downloadImage(activeChartId, {
                                    format: 'png',
                                    width: 1600,
                                    height: 900,
                                    filename: `${tab === 'spectra' ? 'Raman_Comparison' : 'Raman_G-2D_Correlation'}_${new Date().toISOString().slice(0,10)}`
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
            </div>
            
            {loading && tab === 'spectra' && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-sm">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
            
            {error && tab === 'spectra' && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg shadow-sm font-medium">
                    {error}
                </div>
            )}

            {tab === 'spectra' ? (
                // Spectra comparison view
                <div className="flex-1 w-full h-full relative overflow-hidden">
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

                    <div className="w-full h-full pb-10">
                        <Plot
                            divId="plotly-comparison-chart"
                            data={plotlyData}
                            onHover={(data) => {
                                if (!data.points || data.points.length === 0 || !containerRef.current) return;
                                
                                const x = data.points[0].x;
                                const event = data.event as MouseEvent;
                                if (!event) return;
                                
                                const rect = containerRef.current.getBoundingClientRect();
                                
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
                    
                    <div className="absolute bottom-2 left-6 text-[10px] text-slate-400 font-medium flex items-center gap-2 select-none">
                        <Info size={12} />
                        <span>Usa la barra de herramientas superior para hacer Zoom, Pan (Mano), o descargar como imagen. El cuadro de información muestra las intensidades en Raman Intensity (a.u.) ordenadas de mayor a menor.</span>
                    </div>
                </div>
            ) : (
                // G-2D Vector Correlation View
                <div className="flex-1 flex overflow-hidden bg-slate-50/30">
                    {/* Left Chart Area */}
                    <div className="flex-1 h-full min-w-0 flex flex-col relative bg-white border-r border-slate-200">
                        {loadingRgi && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm gap-2">
                                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-xs text-slate-500 font-bold">Loading RGI calculated maps...</span>
                            </div>
                        )}
                        {rgiError && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg shadow-sm font-medium text-xs">
                                {rgiError}
                            </div>
                        )}
                        
                        <div className="flex-1 w-full h-full pb-8">
                            <Plot
                                divId="plotly-vector-chart"
                                data={plotlyVectorData}
                                layout={plotlyVectorLayout}
                                config={plotlyConfig}
                                style={{ width: '100%', height: '100%' }}
                                useResizeHandler={true}
                            />
                        </div>
                        
                        <div className="absolute bottom-2 left-6 text-[10px] text-slate-400 font-medium flex items-center gap-2 select-none">
                            <Info size={12} />
                            <span>This vector correlation plot separates Strain ε (solid blue is ε = 0) and Doping charge density n (solid grey is n = 0) from G & 2D peak centers.</span>
                        </div>
                    </div>

                    {/* Right Sidebar Control Area */}
                    <div className="w-80 bg-white flex flex-col overflow-hidden shrink-0 select-none">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
                            <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <Sparkles size={14} className="text-indigo-500 animate-pulse" />
                                Vector Correlation Groups
                            </h4>
                            <p className="text-[10px] text-slate-500 font-medium mt-1 leading-relaxed">
                                Rename legend labels, select RGI files, and see computed strain/doping decoupling metrics.
                            </p>
                            
                            {/* Laser wavelength selector (multi-select) */}
                            <div className="pt-2 border-t border-slate-200/60">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Líneas de Referencia del Láser (Origen O)</label>
                                <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/40">
                                    {(['532', '632.8', '785'] as const).map((wl) => {
                                        const isActive = visibleLasers[wl];
                                        return (
                                            <button
                                                key={wl}
                                                type="button"
                                                onClick={() => setVisibleLasers(prev => {
                                                    const next = { ...prev, [wl]: !prev[wl] };
                                                    // At least one reference system must remain active
                                                    if (!next['532'] && !next['632.8'] && !next['785']) return prev;
                                                    return next;
                                                })}
                                                className={cn(
                                                    "py-1 text-[10px] font-bold rounded-md transition-all",
                                                    isActive
                                                        ? "bg-white text-indigo-600 shadow-sm font-black"
                                                        : "text-slate-500 hover:text-slate-700 hover:bg-white/40"
                                                )}
                                            >
                                                {wl} nm
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                            {compareFiles.map((file, idx) => {
                                const session = rgiSessions[file.id];
                                const hasData = session && session.pos_G && session.pos_G.length > 0;
                                const isChecked = selectedFiles[file.id] !== false;
                                const fileColor = colors[idx % colors.length];
                                
                                return (
                                    <div 
                                        key={file.id} 
                                        className={cn(
                                            "border rounded-xl p-3 transition-all",
                                            isChecked && hasData ? "border-slate-200 bg-slate-50/30" : "border-slate-150 bg-slate-100/30 opacity-75"
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="checkbox"
                                                checked={isChecked}
                                                disabled={!hasData}
                                                onChange={(e) => setSelectedFiles(prev => ({ ...prev, [file.id]: e.target.checked }))}
                                                className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-300 accent-indigo-600 cursor-pointer disabled:opacity-40"
                                            />
                                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: fileColor }} />
                                            <div className="font-bold text-xs text-slate-750 truncate flex-1 leading-tight">
                                                {file.name.replace(/\.h5$/i, '')}
                                            </div>
                                        </div>
                                        
                                        {!hasData ? (
                                            <div className="mt-2.5 flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 text-[9px] text-amber-700 font-semibold select-none">
                                                <AlertCircle size={10} />
                                                <span>No RGI calculations found. Please run RGI fit.</span>
                                            </div>
                                        ) : (
                                            <div className="mt-2.5 space-y-2">
                                                {/* Group Name input */}
                                                <div>
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Group Label</label>
                                                    <input 
                                                        type="text"
                                                        value={customLabels[file.id] || ''}
                                                        onChange={(e) => setCustomLabels(prev => ({ ...prev, [file.id]: e.target.value }))}
                                                        className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-850 outline-none focus:border-indigo-500 shadow-sm"
                                                        placeholder="Group name"
                                                    />
                                                </div>
                                                
                                                {/* Metrics read-out */}
                                                {isChecked && (
                                                    <div className="bg-white border border-slate-100 rounded-lg p-2 space-y-1 text-[9px] font-mono text-slate-600 shadow-sm">
                                                        {(() => {
                                                            const item = stats.find(s => s.fileId === file.id);
                                                            if (!item) return <span className="text-[8px] italic text-slate-400">Not enough points</span>;
                                                            return (
                                                                <>
                                                                    <div className="flex justify-between">
                                                                        <span>Pos(G):</span>
                                                                        <span className="font-bold text-slate-800">{item.meanG.toFixed(1)} ± {item.stdG.toFixed(1)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span>Pos(2D):</span>
                                                                        <span className="font-bold text-slate-800">{item.mean2D.toFixed(1)} ± {item.std2D.toFixed(1)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between border-t border-slate-50 pt-1 mt-1 font-sans font-bold text-[10px]">
                                                                        <span className="text-blue-600">Strain ε:</span>
                                                                        <span className="text-slate-800">{(item.strain * 100).toFixed(3)}%</span>
                                                                    </div>
                                                                    <div className="flex justify-between font-sans font-bold text-[10px]">
                                                                        <span className="text-emerald-600">Doping n:</span>
                                                                        <span className="text-slate-800">{item.doping.toFixed(2)} ×10¹²</span>
                                                                    </div>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Physical Interpretation Guide */}
                        <div className="p-3.5 border-t border-slate-150 bg-slate-50/50 space-y-2.5 shrink-0">
                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 select-none">
                                <Info size={12} className="text-slate-400" />
                                Guía de Interpretación G-2D
                            </h5>
                            <div className="space-y-2 text-[10px] leading-relaxed text-slate-600">
                                <div className="flex items-start gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                                    <div>
                                        <span className="font-bold text-slate-700">Línea Azul (ε = 0, pendiente 0.7):</span>
                                        <p className="text-[9px] text-slate-500 mt-0.5">Dirección de dopaje puro. Desplazamientos hacia arriba/derecha indican mayor concentración de carga (dopaje n &gt; 0).</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-500 mt-1.5 shrink-0" />
                                    <div>
                                        <span className="font-bold text-slate-700">Línea Negra (n = 0, pendiente 2.2):</span>
                                        <p className="text-[9px] text-slate-500 mt-0.5">Dirección de deformación mecánica pura:</p>
                                        <ul className="list-disc list-inside mt-0.5 ml-1 text-[8.5px] text-slate-500 space-y-0.5">
                                            <li><span className="font-bold text-slate-600">Arriba-Derecha (ε &lt; 0):</span> Compresión mecánica residual.</li>
                                            <li><span className="font-bold text-slate-600">Abajo-Izquierda (ε &gt; 0):</span> Tensión mecánica (Tracción).</li>
                                        </ul>
                                    </div>
                                </div>
                                <div className="bg-white border border-slate-200/80 rounded-lg p-2 mt-2 shadow-sm text-[8.5px] italic text-slate-400 font-medium select-none">
                                    Punto de origen: grafeno suspendido prístino a (1582.0, 2676.9) cm⁻¹.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

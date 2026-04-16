'use client';

import { useState, useEffect } from 'react';
import { Search, ChevronRight, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isDesktop } from '@/lib/desktop';
import { VaultLibrary } from './vault-library';
import { HeatmapCanvas } from './heatmap-canvas';
import { SpectrumInspector } from './spectrum-inspector';
import { GrapheneCanvasGrid } from './graphene-canvas-grid';
import { GrapheneAnalyticsView } from './graphene-analytics-view';
import { VaultExplorerModal } from './vault-explorer-modal';
import { getLogbooksAction, getSamplesAction } from '@/features/samples/actions';
import { Logbook } from '@/features/samples/types';

export function DesktopMapAnalyzer({ groupId }: { groupId: string }) {
    const [mode, setMode] = useState<'standard' | 'graphene' | 'analytics'>('standard');
    const [selectedH5, setSelectedH5] = useState('');
    const [vaultRoot, setVaultRoot] = useState('');
    const [sessionFiles, setSessionFiles] = useState<any[]>([]);
    const [isExplorerOpen, setIsExplorerOpen] = useState(false);
    const [dbLogbooks, setDbLogbooks] = useState<Logbook[]>([]);
    const [dbSamples, setDbSamples] = useState<any[]>([]);
    const [mounted, setMounted] = useState(false);
    const [applySnv, setApplySnv] = useState(false);
    
    // Global dimension settings derived from metadata, but can be updated
    const [mapDim, setMapDim] = useState({ w: 0, h: 0 });
    const [stepSize, setStepSize] = useState(1.0); // Default 1.0 micron per spectrum
    const [nSpectra, setNSpectra] = useState(0);
    const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());

    // Spectrum integration window
    const [wavenumberRange, setWavenumberRange] = useState<[number, number] | undefined>(undefined);

    // Selection on canvas
    const [selectedPixelIndex, setSelectedPixelIndex] = useState(0);

    // Load configuration and session on mount
    useEffect(() => {
        setMounted(true);
        if (typeof window === 'undefined') return;
        
        const root = localStorage.getItem('phdnexus_vault_root');
        if (root) setVaultRoot(root);

        const savedSession = localStorage.getItem(`phdnexus_session_${groupId}`);
        if (savedSession) {
            try {
                setSessionFiles(JSON.parse(savedSession));
            } catch (e) {
                console.error("Failed to load saved session", e);
            }
        }

        // Fetch Logbooks from Supabase for naming mapping
        async function fetchInitialData() {
            try {
                const { data: lbs } = await getLogbooksAction(groupId);
                if (lbs) setDbLogbooks(lbs);

                // Fetch samples for the group to resolve names
                const { data: samples } = await getSamplesAction(groupId, '');
                if (samples) setDbSamples(samples);
            } catch (err) {
                console.error("Failed to fetch metadata", err);
            }
        }
        fetchInitialData();
    }, [groupId]);

    // Save session whenever it changes
    useEffect(() => {
        if (typeof window !== 'undefined' && vaultRoot) {
            localStorage.setItem(`phdnexus_session_${groupId}`, JSON.stringify(sessionFiles));
        }
    }, [sessionFiles, groupId, vaultRoot]);

    const handleImport = (newFiles: any[]) => {
        setSessionFiles(prev => {
            // Avoid duplicates
            const existingPaths = new Set(prev.map(f => f.h5_relative_path));
            const uniqueNew = newFiles.filter(f => !existingPaths.has(f.h5_relative_path));
            return [...prev, ...uniqueNew];
        });
    };

    const handleRemove = (path: string) => {
        setSessionFiles(prev => prev.filter(f => f.h5_relative_path !== path));
        if (selectedH5 === path) {
            setSelectedH5('');
        }
    };

    if (!mounted) return null;

    if (!isDesktop) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-8 text-center animate-in fade-in">
                <h2 className="text-xl font-bold text-slate-200 mb-2">Desktop Required</h2>
                <p className="max-w-md">
                    The Map Analyzer module requires direct access to your local files and science engine. 
                    Please open PhD Nexus using the Desktop Application.
                </p>
            </div>
        );
    }

    if (!vaultRoot) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-8 text-center animate-in fade-in">
                <h2 className="text-xl font-bold text-slate-200 mb-2">Vault Not Configured</h2>
                <p className="max-w-md">
                    Please configure your Data Vault root in Group Settings before using the analyzer.
                </p>
            </div>
        );
    }

    const handleUpdateDimensions = (w: number, h: number, step?: number) => {
        setMapDim({ w, h });
        if (step !== undefined) setStepSize(step);
        // also mark as dismissed for this path
        if (selectedH5) {
            setDismissedBanners(prev => new Set(prev).add(selectedH5));
        }
    };

    const handleDismissBanner = () => {
        if (selectedH5) {
            setDismissedBanners(prev => new Set(prev).add(selectedH5));
        }
    }

    return (
        <div className="flex h-full w-full bg-slate-50 text-slate-900 font-sans">
            {/* Sidebar Library (Light) */}
            <div className="w-80 border-r border-slate-200 flex flex-col bg-white relative z-50 shrink-0 shadow-sm">
                <VaultLibrary 
                    vaultRoot={vaultRoot} 
                    groupId={groupId}
                    selectedH5={selectedH5}
                    sessionFiles={sessionFiles}
                    dbSamples={dbSamples}
                    onOpenExplorer={() => setIsExplorerOpen(true)}
                    onRemove={handleRemove}
                    onSelect={(file) => {
                        setSelectedH5(file.h5_relative_path);
                        setMapDim({ w: file.map_width || 0, h: file.map_height || 0 });
                        setNSpectra(file.n_spectra || 0);
                        setSelectedPixelIndex(0);
                        setWavenumberRange(undefined);
                    }}
                />
            </div>

            {/* Main Visualizer Area */}
            <div className="flex-1 flex flex-col overflow-hidden relative bg-slate-100/30">
                {selectedH5 && (
                    <div className="h-16 px-8 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between shrink-0 relative z-30 shadow-sm">
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest leading-none mb-1">Active Context</span>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-bold text-slate-900 truncate max-w-[300px]">
                                        {(() => {
                                            const f = sessionFiles.find(f => f.h5_relative_path === selectedH5);
                                            const s = dbSamples.find(s => s.sample_code === f?.sample_name);
                                            return s?.name || f?.sample_name || 'Sample';
                                        })()}
                                    </h2>
                                    {(() => {
                                        const f = sessionFiles.find(f => f.h5_relative_path === selectedH5);
                                        const s = dbSamples.find(s => s.sample_code === f?.sample_name);
                                        return s?.sample_code ? (
                                            <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md shrink-0">{s.sample_code}</span>
                                        ) : null;
                                    })()}
                                    <ChevronRight size={14} className="text-slate-300" />
                                    <span className="text-xs font-medium text-slate-500 truncate max-w-[300px]">
                                        {dbLogbooks.find(l => dbSamples.find(s => s.sample_code === sessionFiles.find(f => f.h5_relative_path === selectedH5)?.sample_name)?.logbook_id === l.id)?.name || 'Project'}
                                    </span>
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200 mx-2 shrink-0" />
                                    <span className="text-xs font-bold text-indigo-600 truncate max-w-2xl">
                                        {sessionFiles.find(f => f.h5_relative_path === selectedH5)?.name}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                             {(mode === 'graphene' || mode === 'analytics') && (
                                 <button 
                                     onClick={() => setApplySnv(!applySnv)}
                                     className={cn(
                                         "px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2",
                                         applySnv ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                                     )}
                                 >
                                     <div className={cn("w-2 h-2 rounded-full", applySnv ? "bg-indigo-500 animate-pulse" : "bg-slate-300")} />
                                     SNV Norm
                                 </button>
                             )}
                             
                             <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                                <button 
                                    onClick={() => setMode('standard')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                        mode === 'standard' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    Standard
                                </button>
                                <button 
                                    onClick={() => setMode('graphene')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                        mode === 'graphene' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    Graphene
                                </button>
                                <button 
                                    onClick={() => setMode('analytics')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                        mode === 'analytics' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    Analytics
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {!selectedH5 ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center p-12 bg-white rounded-[40px] shadow-2xl shadow-slate-200/50 border border-slate-100 max-w-sm">
                            <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                <Search size={32} className="text-indigo-600" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">No measurement selected</h3>
                            <p className="text-sm text-slate-500 leading-relaxed mb-8">
                                Select a spectrum or map from your session sidebar to begin analysis.
                            </p>
                            <button 
                                onClick={() => setIsExplorerOpen(true)}
                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-2xl shadow-lg shadow-indigo-100 transition-all flex items-center gap-2 mx-auto"
                            >
                                <Layers size={18} />
                                Open Vault Explorer
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 relative border-b border-slate-200 bg-slate-900 overflow-hidden flex shadow-inner">
                            {/* We keep the canvas area dark for scientific contrast, but the UI around it is light */}
                            {mode === 'standard' ? (
                                <HeatmapCanvas 
                                    vaultRoot={vaultRoot}
                                    h5Path={selectedH5}
                                    mapWidth={mapDim.w}
                                    mapHeight={mapDim.h}
                                    stepSize={stepSize}
                                    nSpectra={nSpectra}
                                    wavenumberRange={wavenumberRange}
                                    selectedPixelIndex={selectedPixelIndex}
                                    onPixelSelect={setSelectedPixelIndex}
                                    onToggleGraphene={() => setMode('graphene')}
                                    onUpdateDimensions={handleUpdateDimensions}
                                    isDismissed={dismissedBanners.has(selectedH5)}
                                    onDismiss={handleDismissBanner}
                                />
                            ) : mode === 'graphene' ? (
                                <GrapheneCanvasGrid 
                                    vaultRoot={vaultRoot}
                                    h5Path={selectedH5}
                                    mapWidth={mapDim.w}
                                    mapHeight={mapDim.h}
                                    stepSize={stepSize}
                                    nSpectra={nSpectra}
                                    selectedPixelIndex={selectedPixelIndex}
                                    onPixelSelect={setSelectedPixelIndex}
                                    onToggleStandard={() => setMode('standard')}
                                    onUpdateDimensions={handleUpdateDimensions}
                                    isDismissed={dismissedBanners.has(selectedH5)}
                                    onDismiss={handleDismissBanner}
                                    applySnv={applySnv}
                                    wavenumberRange={wavenumberRange}
                                />
                            ) : (
                                <GrapheneAnalyticsView 
                                    vaultRoot={vaultRoot}
                                    h5Path={selectedH5}
                                    applySnv={applySnv}
                                />
                            )}
                        </div>
                        {mode !== 'analytics' && (
                            <div className="h-72 shrink-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20 overflow-hidden">
                                <SpectrumInspector 
                                    vaultRoot={vaultRoot}
                                    h5Path={selectedH5}
                                    pixelIndex={selectedPixelIndex}
                                    onRangeSelected={setWavenumberRange}
                                />
                            </div>
                        )}
                    </>
                )}
            </div>

            {isExplorerOpen && (
            <VaultExplorerModal 
                groupId={groupId}
                isOpen={isExplorerOpen} 
                onClose={() => setIsExplorerOpen(false)}
                vaultRoot={vaultRoot}
                onImport={handleImport}
                onLoadWorkspace={(files) => {
                    setSessionFiles(files);
                    setIsExplorerOpen(false);
                }}
                dbLogbooks={dbLogbooks}
                currentSessionFiles={sessionFiles}
            />
            )}
        </div>
    );
}

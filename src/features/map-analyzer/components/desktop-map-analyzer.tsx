'use client';

import { useState, useEffect } from 'react';
import { isDesktop } from '@/lib/desktop';
import { VaultLibrary } from './vault-library';
import { HeatmapCanvas } from './heatmap-canvas';
import { SpectrumInspector } from './spectrum-inspector';
import { GrapheneCanvasGrid } from './graphene-canvas-grid';

export function DesktopMapAnalyzer({ groupId }: { groupId: string }) {
    const [mode, setMode] = useState<'standard' | 'graphene'>('standard');
    const [selectedH5, setSelectedH5] = useState('');
    const [vaultRoot, setVaultRoot] = useState('');
    
    // Global dimension settings derived from metadata, but can be updated
    const [mapDim, setMapDim] = useState({ w: 0, h: 0 });
    const [nSpectra, setNSpectra] = useState(0);

    // Spectrum integration window
    const [wavenumberRange, setWavenumberRange] = useState<[number, number] | undefined>(undefined);

    // Selection on canvas
    const [selectedPixelIndex, setSelectedPixelIndex] = useState(0);

    useEffect(() => {
        const root = typeof window !== 'undefined' ? localStorage.getItem('phdnexus_vault_root') : null;
        if (root) setVaultRoot(root);
    }, []);

    if (!isDesktop) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-8 text-center">
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
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-8 text-center">
                <h2 className="text-xl font-bold text-slate-200 mb-2">Vault Not Configured</h2>
                <p className="max-w-md">
                    Please configure your Data Vault root in Group Settings before using the analyzer.
                </p>
            </div>
        );
    }

    return (
        <div className="flex h-full w-full bg-slate-950 text-slate-300 font-sans">
            {/* Sidebar Library */}
            <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/50 relative z-10 shrink-0">
                <VaultLibrary 
                    vaultRoot={vaultRoot} 
                    groupId={groupId}
                    selectedH5={selectedH5}
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
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {!selectedH5 ? (
                    <div className="flex-1 flex items-center justify-center text-slate-500">
                        Select a map file from the library to begin analysis.
                    </div>
                ) : (
                    <>
                        <div className="flex-1 relative border-b border-slate-800 bg-black overflow-hidden flex">
                            {mode === 'standard' ? (
                                <HeatmapCanvas 
                                    vaultRoot={vaultRoot}
                                    h5Path={selectedH5}
                                    mapWidth={mapDim.w}
                                    mapHeight={mapDim.h}
                                    nSpectra={nSpectra}
                                    wavenumberRange={wavenumberRange}
                                    selectedPixelIndex={selectedPixelIndex}
                                    onPixelSelect={setSelectedPixelIndex}
                                    onToggleGraphene={() => setMode('graphene')}
                                />
                            ) : (
                                <GrapheneCanvasGrid 
                                    vaultRoot={vaultRoot}
                                    h5Path={selectedH5}
                                    mapWidth={mapDim.w}
                                    mapHeight={mapDim.h}
                                    nSpectra={nSpectra}
                                    selectedPixelIndex={selectedPixelIndex}
                                    onPixelSelect={setSelectedPixelIndex}
                                    onToggleStandard={() => setMode('standard')}
                                />
                            )}
                        </div>
                        <div className="h-64 shrink-0 bg-slate-900">
                            <SpectrumInspector 
                                vaultRoot={vaultRoot}
                                h5Path={selectedH5}
                                pixelIndex={selectedPixelIndex}
                                onRangeSelected={mode === 'standard' ? setWavenumberRange : undefined}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

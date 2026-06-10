'use client';

import { useState, useEffect } from 'react';
import { Search, ChevronRight, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isDesktop, fetchVaultFiles } from '@/lib/desktop';
import { VaultLibrary } from './vault-library';
import { HeatmapCanvas } from './heatmap-canvas';
import { SpectrumInspector } from './spectrum-inspector';
import { GrapheneCanvasGrid } from './graphene-canvas-grid';
import { GrapheneAnalyticsView } from './graphene-analytics-view';
import { VaultExplorerModal } from './vault-explorer-modal';
import { PipelineEditor } from './pipeline-editor';
import { ComparisonView } from './comparison-view';
import { DeconvolutionView } from './deconvolution-view';
import { FittingView } from './fitting-view';
import { RgiView } from './rgi-view';
import { Rgi2View } from './rgi2-view';
import { getLogbooksAction, getSamplesAction, registerGroupedH5FileAction } from '@/features/samples/actions';
import { Logbook } from '@/features/samples/types';

export function DesktopMapAnalyzer({ groupId }: { groupId: string }) {
    const [mode, setMode] = useState<'standard' | 'graphene' | 'analytics' | 'pipeline' | 'compare' | 'deconvolution' | 'fitting' | 'rgi' | 'rgi2'>('standard');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [selectedH5, setSelectedH5] = useState('');
    const [vaultRoot, setVaultRoot] = useState('');
    const [sessionFiles, setSessionFiles] = useState<any[]>([]);
    const [compareFiles, setCompareFiles] = useState<any[]>([]);
    const [isExplorerOpen, setIsExplorerOpen] = useState(false);
    const [dbLogbooks, setDbLogbooks] = useState<Logbook[]>([]);
    const [dbSamples, setDbSamples] = useState<any[]>([]);
    const [mounted, setMounted] = useState(false);
    const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
    const [applySnv, setApplySnv] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [savedWorkspaces, setSavedWorkspaces] = useState<any[]>([]);

    // Global dimension settings derived from metadata, but can be updated
    const [mapDim, setMapDim] = useState({ w: 0, h: 0 });
    const [stepSize, setStepSize] = useState(1.0); // Default 1.0 micron per spectrum
    const [nSpectra, setNSpectra] = useState(0);
    const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());
    const [fileSettings, setFileSettings] = useState<Record<string, { w?: number, h?: number, stepSize?: number }>>({});

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
            setIsLoadingMetadata(true);
            try {
                const { data: lbs } = await getLogbooksAction(groupId);
                if (lbs) {
                    const mappedLbs: Logbook[] = lbs.map(l => ({
                        ...l,
                        description: l.description ?? undefined,
                        created_at: l.created_at ?? ''
                    }));
                    setDbLogbooks(mappedLbs);
                }

                // Fetch samples for the group to resolve names
                const { data: samples } = await getSamplesAction(groupId, '');
                if (samples) setDbSamples(samples);

                // Fetch saved workspaces/comparisons
                const { getRamanWorkspacesAction } = await import('../actions');
                const { data: ws } = await getRamanWorkspacesAction(groupId);
                if (ws) setSavedWorkspaces(ws);
            } catch (err) {
                console.error("Failed to fetch metadata", err);
            } finally {
                setIsLoadingMetadata(false);
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

    const handleImport = async (newFiles: any[]) => {
        let filesToImport = [...newFiles];

        try {
            if (vaultRoot && newFiles.length > 0) {
                // Helper to get subfolder segment from relative path
                const getSubfolder = (path: string) => {
                    if (!path) return undefined;
                    const parts = path.replace(/\\/g, '/').split('/');
                    return parts.length > 1 ? parts[0] : undefined;
                };

                const subfolders = Array.from(new Set(newFiles.map(f => getSubfolder(f.h5_relative_path)).filter(Boolean))) as string[];
                let allVaultFiles: any[] = [];

                if (subfolders.length > 0) {
                    for (const sub of subfolders) {
                        const res = await fetchVaultFiles(vaultRoot, sub);
                        if (res.success && res.files) {
                            allVaultFiles = [...allVaultFiles, ...res.files];
                        }
                    }
                } else {
                    const res = await fetchVaultFiles(vaultRoot);
                    if (res.success && res.files) {
                        allVaultFiles = res.files;
                    }
                }

                // Helper to get all ancestors of a file stem
                const getAncestors = (file: any, allFiles: any[]): string[] => {
                    const ancestors = [file.h5_relative_path];
                    let current = file;

                    while (true) {
                        // 1. Try metadata parent_file first
                        if (current.parent_file) {
                            const parent = allFiles.find(f => f.h5_relative_path === current.parent_file);
                            if (parent) {
                                ancestors.push(parent.h5_relative_path);
                                current = parent;
                                continue;
                            }
                        }

                        // 2. Fallback to name-based parent resolution
                        const currentStem = current.name.replace(/\.h5$/i, '');
                        const suffixRegex = /(_preprocessed(_\d+)?|_rgi2(_\w+)?|_rgi(_\w+)?|_deconvolution(_\d+)?|_fitting(_\d+)?)$/i;
                        const match = currentStem.match(suffixRegex);

                        if (match && match.index !== undefined && match.index > 0) {
                            const parentStem = currentStem.substring(0, match.index);
                            const parent = allFiles.find(f => f.name.replace(/\.h5$/i, '').toLowerCase() === parentStem.toLowerCase());
                            if (parent) {
                                ancestors.push(parent.h5_relative_path);
                                current = parent;
                                continue;
                            }
                        }

                        break;
                    }

                    return ancestors;
                };

                const isSameBranch = (fileA: any, fileB: any, allFiles: any[]) => {
                    const ancestorsA = getAncestors(fileA, allFiles);
                    const ancestorsB = getAncestors(fileB, allFiles);
                    return ancestorsA.includes(fileB.h5_relative_path) || ancestorsB.includes(fileA.h5_relative_path);
                };

                // Find other files in the vault that belong to the same direct branch
                const relatedFiles = allVaultFiles.filter(vf => {
                    return newFiles.some(f => isSameBranch(f, vf, allVaultFiles));
                });

                // Add related files avoiding duplicates in filesToImport
                const existingPaths = new Set(filesToImport.map(f => f.h5_relative_path));
                relatedFiles.forEach(rf => {
                    if (!existingPaths.has(rf.h5_relative_path)) {
                        filesToImport.push(rf);
                    }
                });
            }
        } catch (e) {
            console.error("Failed to fetch related vault files during import:", e);
        }

        setSessionFiles(prev => {
            // Avoid duplicates
            const existingPaths = new Set(prev.map(f => f.h5_relative_path));
            const uniqueNew = filesToImport.filter(f => !existingPaths.has(f.h5_relative_path));
            return [...prev, ...uniqueNew];
        });

        // Auto-select the newly generated/imported file for better UX
        if (newFiles.length === 1) {
            setSelectedH5(newFiles[0].h5_relative_path);
            toast.success(`Loaded ${newFiles[0].name}`);
        } else if (newFiles.length > 1) {
            toast.success(`Loaded ${newFiles.length} files`);
        }
    };

    const handleRemove = (path: string) => {
        setSessionFiles(prev => prev.filter(f => f.h5_relative_path !== path));
        setCompareFiles(prev => prev.filter(f => f.h5_relative_path !== path));
        if (selectedH5 === path) {
            setSelectedH5('');
        }
    };

    const handleDeleteFile = async (file: any) => {
        try {
            const res = await fetch('http://127.0.0.1:8888/api/map/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_path: file.h5_relative_path
                })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Deleted ${file.name}`);
                handleRemove(file.h5_relative_path);
            } else {
                toast.error(data.message || 'Failed to delete file');
            }
        } catch (e: any) {
            toast.error('Engine connection failed');
        }
    };

    const handleLoadWorkspace = (ws: any) => {
        if (!ws || !ws.files) return;

        // If it's a comparison, we might want to just add to compareFiles
        // but usually the user wants to load the whole state
        if (ws.settings?.type === 'comparison') {
            setCompareFiles(ws.files);
            setMode('compare');
            toast.success(`Loaded comparison: ${ws.name}`);
        } else {
            setSessionFiles(ws.files);
            toast.success(`Loaded workspace: ${ws.name}`);
        }
        setSaveName(ws.name);
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

        if (selectedH5) {
            setFileSettings(prev => ({
                ...prev,
                [selectedH5]: { w, h, stepSize: step ?? prev[selectedH5]?.stepSize ?? 1.0 }
            }));
            setDismissedBanners(prev => new Set(prev).add(selectedH5));
        }
    };

    const handleDismissBanner = () => {
        if (selectedH5) {
            setDismissedBanners(prev => new Set(prev).add(selectedH5));
        }
    }

    const handleToggleCompare = (file: any) => {
        setCompareFiles(prev => {
            const exists = prev.some(f => f.h5_relative_path === file.h5_relative_path);
            if (exists) return prev.filter(f => f.h5_relative_path !== file.h5_relative_path);
            return [...prev, file];
        });

        // Auto-switch to compare mode if we just selected the second file
        if (mode !== 'compare' && compareFiles.length === 1) {
            setMode('compare');
        }
    };

    const handleGroupFiles = async (files: any[]) => {
        if (!files || files.length < 2) return;

        const firstFile = files[0];
        const defaultName = firstFile.name
            ? firstFile.name.replace(/\.h5$/i, '') + '_grouped'
            : 'Grouped_Spectra';

        const groupName = prompt(
            `Enter a name for the grouped map file (will contain ${files.length} spectra):`,
            defaultName
        );
        if (groupName === null) return; // cancelled

        const cleanGroupName = groupName.trim() || defaultName;

        try {
            const res = await fetch('http://127.0.0.1:8888/api/map/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vault_root: vaultRoot,
                    h5_relative_paths: files.map(f => f.h5_relative_path),
                    group_name: cleanGroupName
                })
            });
            const data = await res.json();
            if (data.success && data.file) {
                toast.success(data.message || 'Grouped successfully');

                let updatedFile = { ...data.file };

                // Try to find a valid characterization ID from the files being grouped
                let charId: string | undefined = undefined;
                for (const f of files) {
                    if (f.id && f.id.includes('-')) {
                        const parts = f.id.split('-');
                        if (parts[0].length === 36) {
                            charId = parts[0];
                            break;
                        }
                    }
                }

                // Register file in Supabase so it's available in Vault Discovery
                try {
                    const regRes = await registerGroupedH5FileAction({
                        charId,
                        sampleName: firstFile.sample_name || 'Uncategorized',
                        h5Path: data.file.h5_relative_path,
                        originalFileName: data.file.name,
                        groupId
                    });
                    if (regRes.success && regRes.charId) {
                        updatedFile.id = `${regRes.charId}-${data.file.h5_relative_path}`;
                        updatedFile.sample_name = firstFile.sample_name;
                    }
                } catch (dbErr) {
                    console.error("Failed to register grouped file in Supabase:", dbErr);
                }

                // Add to workspace sessionFiles
                setSessionFiles(prev => {
                    const exists = prev.some(f => f.h5_relative_path === updatedFile.h5_relative_path);
                    if (exists) return prev;
                    return [updatedFile, ...prev];
                });

                // Clear checkboxes
                setCompareFiles([]);

                // Auto-select the newly created grouped map file
                setSelectedH5(data.file.h5_relative_path);

                // Auto-configure dimensions: 1D map of n_spectra x 1
                const n = data.file.n_spectra || files.length;
                setMapDim({ w: n, h: 1 });
                setStepSize(1.0);
                setNSpectra(n);
                setSelectedPixelIndex(0);
                setWavenumberRange(undefined);

                // Switch mode to standard to show the new map
                setMode('standard');
            } else {
                toast.error(data.message || data.detail || 'Failed to group files');
            }
        } catch (e) {
            toast.error('Engine connection failed');
        }
    };

    const handleSaveWorkspace = async (customName?: string, customFiles?: any[]) => {
        const name = customName || saveName;
        const targetFiles = customFiles || sessionFiles;

        if (!name.trim() || targetFiles.length === 0) {
            const promptName = prompt("Enter a name for this workspace/comparison set:", name);
            if (!promptName) return;
            setSaveName(promptName);
            saveInternal(promptName, targetFiles);
        } else {
            saveInternal(name, targetFiles);
        }
    };

    const saveInternal = async (name: string, files: any[]) => {
        setIsSaving(true);
        try {
            const { saveRamanWorkspaceAction } = await import('../actions');
            const res = await saveRamanWorkspaceAction({
                group_id: groupId,
                name: name,
                files: files,
                settings: {
                    type: files === compareFiles ? 'comparison' : 'workspace',
                    timestamp: new Date().toISOString()
                }
            });
            if (res.data) {
                toast.success('Saved successfully');
                setSaveName(name);
                // Actualizar la lista local inmediatamente
                setSavedWorkspaces(prev => [res.data, ...prev.filter(w => w.id !== res.data.id)]);
            } else {
                toast.error(res.error || 'Failed to save');
            }
        } catch (e) {
            toast.error('Error saving');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex h-full w-full bg-slate-50 text-slate-900 font-sans">
            {/* Sidebar Library (Light) */}
            <div className={cn(
                "border-r border-slate-200 flex flex-col bg-white relative z-50 shrink-0 shadow-sm transition-all duration-300 ease-in-out",
                isSidebarCollapsed ? "w-0 opacity-0 border-r-0 overflow-hidden" : "w-[500px]"
            )}>
                <VaultLibrary
                    vaultRoot={vaultRoot}
                    groupId={groupId}
                    selectedH5={selectedH5}
                    sessionFiles={sessionFiles}
                    dbSamples={dbSamples}
                    compareFiles={compareFiles}
                    onToggleCompare={handleToggleCompare}
                    onGroupFiles={handleGroupFiles}
                    onOpenExplorer={() => setIsExplorerOpen(true)}
                    onSaveWorkspace={() => handleSaveWorkspace()}
                    onSaveComparison={() => handleSaveWorkspace(undefined, compareFiles)}
                    isSaving={isSaving}
                    savedWorkspaces={savedWorkspaces}
                    onLoadWorkspace={handleLoadWorkspace}
                    onRemove={handleRemove}
                    onDeleteFile={handleDeleteFile}
                    isLoading={isLoadingMetadata}
                    onSelect={(file) => {
                        setSelectedH5(file.h5_relative_path);
                        const settings = fileSettings[file.h5_relative_path];

                        let w = settings?.w || file.map_width || 0;
                        let h = settings?.h || file.map_height || 0;
                        if ((w <= 0 || h <= 0) && file.n_spectra > 0) {
                            w = Math.ceil(Math.sqrt(file.n_spectra));
                            h = Math.ceil(file.n_spectra / w);
                        }

                        setMapDim({ w, h });
                        setStepSize(settings?.stepSize ?? 1.0);
                        setNSpectra(file.n_spectra || 0);
                        setSelectedPixelIndex(0);
                        setWavenumberRange(undefined);
                    }}
                />
            </div>

            {/* Main Visualizer Area */}
            <div className="flex-1 flex flex-col overflow-hidden relative bg-slate-100/30">
                {/* Collapsible Sidebar Toggle Handle */}
                <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className={cn(
                        "absolute top-1/2 -translate-y-1/2 z-50 w-5 h-14 bg-white hover:bg-slate-50 border border-slate-200 text-slate-400 hover:text-indigo-600 shadow-md flex items-center justify-center transition-all focus:outline-none cursor-pointer hover:scale-105",
                        isSidebarCollapsed
                            ? "left-0 rounded-r-xl border-l-0"
                            : "-left-[1px] rounded-r-xl border-l-0"
                    )}
                    title={isSidebarCollapsed ? "Expand active workspace" : "Collapse active workspace"}
                >
                    <ChevronRight size={14} className={cn("transition-transform duration-300", !isSidebarCollapsed && "rotate-180")} />
                </button>

                {(selectedH5 || mode === 'compare') && (
                    <div className="h-16 px-8 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between shrink-0 relative z-30 shadow-sm">
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest leading-none mb-1">Active Context</span>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-bold text-slate-900 truncate max-w-[300px]">
                                        {mode === 'compare' ? 'Comparison Mode' : (() => {
                                            const f = sessionFiles.find(f => f.h5_relative_path === selectedH5);
                                            const s = dbSamples.find(s =>
                                                s.sample_code === f?.sample_name ||
                                                s.name === f?.sample_name ||
                                                (f?.name && s.sample_code && f.name.includes(s.sample_code))
                                            );
                                            return s?.name || f?.sample_name || 'Sample';
                                        })()}
                                    </h2>
                                    {mode !== 'compare' && (() => {
                                        const f = sessionFiles.find(f => f.h5_relative_path === selectedH5);
                                        const s = dbSamples.find(s =>
                                            s.sample_code === f?.sample_name ||
                                            s.name === f?.sample_name ||
                                            (f?.name && s.sample_code && f.name.includes(s.sample_code))
                                        );
                                        return s?.sample_code ? (
                                            <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md shrink-0">{s.sample_code}</span>
                                        ) : null;
                                    })()}
                                    {mode !== 'compare' && <ChevronRight size={14} className="text-slate-300" />}
                                    {mode !== 'compare' && (
                                        <span className="text-xs font-medium text-slate-500 truncate max-w-[300px]">
                                            {dbLogbooks.find(l => {
                                                const f = sessionFiles.find(f => f.h5_relative_path === selectedH5);
                                                const sMatch = dbSamples.find(s =>
                                                    s.sample_code === f?.sample_name ||
                                                    s.name === f?.sample_name ||
                                                    (f?.name && s.sample_code && f.name.includes(s.sample_code))
                                                );
                                                return sMatch?.logbook_id === l.id;
                                            })?.name || 'Project'}
                                        </span>
                                    )}
                                    {mode !== 'compare' && <div className="w-1.5 h-1.5 rounded-full bg-slate-200 mx-2 shrink-0" />}
                                    {mode !== 'compare' && (
                                        <span className="text-xs font-bold text-indigo-600 truncate max-w-2xl">
                                            {sessionFiles.find(f => f.h5_relative_path === selectedH5)?.name}
                                        </span>
                                    )}
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
                                <button
                                    onClick={() => setMode('pipeline')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                        mode === 'pipeline' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    Pipeline
                                </button>
                                <button
                                    onClick={() => setMode('deconvolution')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                        mode === 'deconvolution' ? "bg-white text-violet-600 shadow-sm" : "text-slate-500 hover:text-violet-600"
                                    )}
                                >
                                    Deconvolution
                                </button>
                                <button
                                    onClick={() => setMode('fitting')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                        mode === 'fitting' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-indigo-600"
                                    )}
                                >
                                    Fitting (SV)
                                </button>
                                <button
                                    onClick={() => setMode('rgi')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                        mode === 'rgi' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-emerald-600"
                                    )}
                                >
                                    RGI Workspace
                                </button>
                                <button
                                    onClick={() => setMode('rgi2')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                        mode === 'rgi2' ? "bg-white text-teal-600 shadow-sm" : "text-slate-500 hover:text-teal-600"
                                    )}
                                >
                                    RGI2 Workspace
                                </button>
                                <button
                                    onClick={() => setMode('compare')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                                        mode === 'compare' ? "bg-white text-orange-600 shadow-sm" : "text-slate-500 hover:text-orange-600"
                                    )}
                                >
                                    Compare
                                    {compareFiles.length > 0 && (
                                        <span className={cn(
                                            "flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black",
                                            mode === 'compare' ? "bg-orange-100 text-orange-600" : "bg-slate-200 text-slate-500"
                                        )}>
                                            {compareFiles.length}
                                        </span>
                                    )}
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
                            ) : mode === 'compare' ? (
                                <ComparisonView
                                    vaultRoot={vaultRoot}
                                    compareFiles={compareFiles}
                                    dbSamples={dbSamples}
                                    onSaveWorkspace={() => handleSaveWorkspace(undefined, compareFiles)}
                                    isSaving={isSaving}
                                    savedWorkspaces={savedWorkspaces}
                                    onLoadWorkspace={handleLoadWorkspace}
                                    onClear={() => setCompareFiles([])}
                                />
                            ) : mode === 'pipeline' ? (
                                <PipelineEditor
                                    vaultRoot={vaultRoot}
                                    h5Path={selectedH5}
                                    onFileCreated={(file) => handleImport([file])}
                                />
                            ) : mode === 'deconvolution' ? (
                                <DeconvolutionView
                                    vaultRoot={vaultRoot}
                                    h5Path={selectedH5}
                                    mapWidth={mapDim.w}
                                    mapHeight={mapDim.h}
                                    nSpectra={nSpectra}
                                />
                            ) : mode === 'fitting' ? (
                                <FittingView
                                    vaultRoot={vaultRoot}
                                    h5Path={selectedH5}
                                    mapWidth={mapDim.w}
                                    mapHeight={mapDim.h}
                                    nSpectra={nSpectra}
                                />
                            ) : mode === 'rgi' ? (
                                <RgiView
                                    vaultRoot={vaultRoot}
                                    h5Path={selectedH5}
                                    mapWidth={mapDim.w}
                                    mapHeight={mapDim.h}
                                    stepSize={stepSize}
                                    nSpectra={nSpectra}
                                    onFileCreated={(file) => handleImport([file])}
                                />
                            ) : mode === 'rgi2' ? (
                                <Rgi2View
                                    vaultRoot={vaultRoot}
                                    h5Path={selectedH5}
                                    mapWidth={mapDim.w}
                                    mapHeight={mapDim.h}
                                    stepSize={stepSize}
                                    nSpectra={nSpectra}
                                    onFileCreated={(file) => handleImport([file])}
                                />
                            ) : (
                                <GrapheneAnalyticsView
                                    vaultRoot={vaultRoot}
                                    h5Path={selectedH5}
                                    applySnv={applySnv}
                                />
                            )}
                        </div>
                        {mode !== 'analytics' && mode !== 'pipeline' && mode !== 'compare' && mode !== 'deconvolution' && mode !== 'fitting' && mode !== 'rgi' && mode !== 'rgi2' && (
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

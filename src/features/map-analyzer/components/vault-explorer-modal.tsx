'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    X, Search, Database, ChevronRight, CheckCircle2, 
    Circle, Filter, Calendar, Zap, AlertCircle, RefreshCw,
    FlaskConical, Layers, ArrowLeft, Folder, Link as LinkIcon,
    History, Tag, Activity, Clock, Save, Trash2, Layout,
    ChevronDown, FolderOpen, ExternalLink
} from 'lucide-react';
import { fetchVaultLogbooks, fetchVaultFiles } from '@/lib/desktop';
import { getSamplesAction } from '@/features/samples/actions';
import { 
    getRamanWorkspacesAction, 
    saveRamanWorkspaceAction, 
    deleteRamanWorkspaceAction 
} from '../actions';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface VaultLogbookFolder {
    id: string;
    name: string;
    path: string;
}

interface VaultFile {
    id: string;
    h5_relative_path: string;
    name: string;
    sample_name: string;
    technique: string;
    measured_at: string;
    created_at: string;
    n_spectra: number;
    map_width: number;
    map_height: number;
    metadata?: {
        laser?: string;
        power?: string;
        analyte?: string;
        objective?: string;
        [key: string]: any;
    };
}

interface VaultExplorerModalProps {
    groupId: string;
    isOpen: boolean;
    onClose: () => void;
    vaultRoot: string;
    onImport: (files: VaultFile[]) => void;
    onLoadWorkspace?: (files: VaultFile[]) => void;
    dbLogbooks?: any[]; // From Supabase
    currentSessionFiles?: VaultFile[];
}

export function VaultExplorerModal({ 
    groupId,
    isOpen, 
    onClose, 
    vaultRoot, 
    onImport,
    onLoadWorkspace,
    dbLogbooks = [],
    currentSessionFiles = []
}: VaultExplorerModalProps) {
    // Navigation & Tab State
    const [activeTab, setActiveTab] = useState<'discovery' | 'saved'>('discovery');
    const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Logbook, 2: Sample, 3: Map
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    
    // Step 1 & 2: Lists
    const [vaultFolders, setVaultFolders] = useState<VaultLogbookFolder[]>([]);
    const [selectedDbLogbook, setSelectedDbLogbook] = useState<any | null>(null);
    const [dbSamples, setDbSamples] = useState<any[]>([]);
    
    // Step 3: Maps/Files
    const [selectedSample, setSelectedSample] = useState<any | null>(null);
    const [files, setFiles] = useState<VaultFile[]>([]);
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    
    // Saved Workspaces
    const [savedWorkspaces, setSavedWorkspaces] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveName, setSaveName] = useState('');

    // Legacy Mode
    const [isLegacyMode, setIsLegacyMode] = useState(false);
    const [techniqueFilter, setTechniqueFilter] = useState<string>('all');

    // Load initial data
    useEffect(() => {
        if (isOpen) {
            loadVaultFolders();
            loadSavedWorkspaces();
        }
    }, [isOpen, groupId]);

    const loadVaultFolders = async () => {
        try {
            const res = await fetchVaultLogbooks(vaultRoot);
            if (res.success) setVaultFolders(res.logbooks);
        } catch (err) {
            console.error('Failed to load local folders', err);
        }
    };

    const loadSavedWorkspaces = async () => {
        const res = await getRamanWorkspacesAction(groupId);
        if (res.data) setSavedWorkspaces(res.data);
    };

    const getLinkedFolder = (dbLb: any) => {
        return vaultFolders.find(vf => 
            vf.id === dbLb.id || 
            vf.name.includes(dbLb.id) || 
            vf.name.includes(dbLb.prefix) ||
            vf.name === dbLb.name
        );
    };

    const handleSelectLogbook = async (dbLb: any) => {
        setLoading(true);
        setSelectedDbLogbook(dbLb);
        setIsLegacyMode(false);
        try {
            const samplesRes = await getSamplesAction(dbLb.group_id, dbLb.id);
            if (samplesRes.data) {
                const ramanSamples = samplesRes.data.filter((s: any) => 
                    s.characterizations?.some((c: any) => 
                        c.type === 'Raman' && (c.data.local_h5_paths?.length > 0 || c.data.local_h5_path)
                    )
                );
                setDbSamples(ramanSamples);
                setStep(2);
                setSearch('');
            }
        } catch (err) {
            toast.error('Error fetching samples');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSample = (sample: any) => {
        setSelectedSample(sample);
        const ramanChars = sample.characterizations.filter((c: any) => 
            c.type === 'Raman' && (c.data.local_h5_paths?.length > 0 || c.data.local_h5_path)
        );

        const vaultFiles: VaultFile[] = [];
        ramanChars.forEach((c: any) => {
            const h5Paths = c.data.local_h5_paths || (c.data.local_h5_path ? [c.data.local_h5_path] : []);
            const meta = c.data.file_metadata || {};
            
            h5Paths.forEach((path: string) => {
                const fileName = path.split(/[/\\]/).pop() || 'Untitled';
                const fileMeta = meta[path] || {};
                const params = c.data || {};
                
                const findKey = (search: string) => {
                    const keys = Object.keys(params);
                    const found = keys.find(k => k.toLowerCase().includes(search.toLowerCase()));
                    return found ? params[found] : undefined;
                };

                vaultFiles.push({
                    id: `${c.id}-${path}`,
                    h5_relative_path: path,
                    name: fileName,
                    sample_name: sample.sample_code || sample.name,
                    technique: 'Raman',
                    measured_at: c.performed_at || c.created_at,
                    created_at: c.created_at,
                    n_spectra: fileMeta.spectra || 0,
                    map_width: fileMeta.range?.x || 0,
                    map_height: fileMeta.range?.y || 0,
                    metadata: {
                        laser: findKey('laser'),
                        power: findKey('power'),
                        analyte: findKey('analyte'),
                        objective: findKey('objective')
                    }
                });
            });
        });

        setFiles(vaultFiles);
        setStep(3);
        setSearch('');
    };

    const handleSaveWorkspace = async () => {
        if (!saveName.trim() || currentSessionFiles.length === 0) return;
        setIsSaving(true);
        try {
            const res = await saveRamanWorkspaceAction({
                group_id: groupId,
                name: saveName,
                files: currentSessionFiles,
                settings: {} // Potential for future extension
            });
            if (res.data) {
                toast.success('Workspace saved successfully');
                setSaveName('');
                loadSavedWorkspaces();
            } else {
                toast.error(res.error || 'Failed to save');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteWorkspace = async (id: string) => {
        if (!confirm('Are you sure you want to delete this comparison set?')) return;
        const res = await deleteRamanWorkspaceAction(id, groupId);
        if (res.success) {
            toast.success('Deleted');
            loadSavedWorkspaces();
        }
    };

    const handleLegacyMode = async (dbLb: any) => {
        const linked = getLinkedFolder(dbLb);
        if (!linked) {
            toast.error(`No local data folder found for "${dbLb.name}"`);
            return;
        }

        setLoading(true);
        setSelectedDbLogbook(dbLb);
        setIsLegacyMode(true);
        try {
            const filesRes = await fetchVaultFiles(vaultRoot, linked.id);
            if (filesRes.success) {
                setFiles(filesRes.files);
                setStep(3); // Go straight to file view
                setSearch('');
            } else {
                toast.error('Failed to read local files');
            }
        } catch (err) {
            toast.error('Error connecting to vault data');
        } finally {
            setLoading(false);
        }
    };

    const handleImport = () => {
        const toImport = files.filter(f => selectedPaths.has(f.h5_relative_path));
        onImport(toImport);
        onClose();
        setStep(1);
    };

    const filteredFiles = useMemo(() => {
        let result = files;
        if (search) {
            const lowSearch = search.toLowerCase();
            result = result.filter(f => 
                f.name.toLowerCase().includes(lowSearch) || 
                f.sample_name.toLowerCase().includes(lowSearch)
            );
        }
        if (techniqueFilter !== 'all') {
            result = result.filter(f => f.technique === techniqueFilter);
        }
        return [...result].sort((a, b) => 
            new Date(b.measured_at || b.created_at || 0).getTime() - 
            new Date(a.measured_at || a.created_at || 0).getTime()
        );
    }, [files, search, techniqueFilter]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-[95vw] h-[92vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-white/20 animate-in zoom-in-95 duration-300">
                
                {/* Header: Tab & Action Bar */}
                <div className="flex items-center justify-between px-10 py-6 border-b border-slate-100 bg-white shrink-0">
                    <div className="flex items-center gap-10">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                                <Database size={24} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none mb-1">Vault Discovery</h2>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Workspace Management & Import</p>
                            </div>
                        </div>

                        {/* Tab Switcher */}
                        <div className="flex bg-slate-100 p-1 rounded-2xl">
                            <button 
                                onClick={() => setActiveTab('discovery')}
                                className={cn(
                                    "px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                                    activeTab === 'discovery' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
                                )}
                            >
                                <Search size={14} />
                                Scientific Explorer
                            </button>
                            <button 
                                onClick={() => setActiveTab('saved')}
                                className={cn(
                                    "px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                                    activeTab === 'saved' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
                                )}
                            >
                                <History size={14} />
                                Saved Workspaces
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {currentSessionFiles.length > 0 && (
                            <div className="flex items-center gap-2 bg-indigo-50/50 p-1 pr-3 rounded-2xl border border-indigo-100">
                                <input 
                                    className="bg-transparent text-xs font-bold text-indigo-900 px-3 py-2 outline-none w-40 placeholder:text-indigo-300"
                                    placeholder="Comparison Name..."
                                    value={saveName}
                                    onChange={(e) => setSaveName(e.target.value)}
                                />
                                <button 
                                    onClick={handleSaveWorkspace}
                                    disabled={!saveName.trim() || isSaving}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50"
                                >
                                    {isSaving ? <RefreshCw size={14} className="animate-spin" /> : 'Save Current'}
                                </button>
                            </div>
                        )}
                        <button 
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center rounded-2xl text-slate-400 hover:bg-slate-50 transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden flex bg-slate-50/30">
                    {activeTab === 'discovery' ? (
                        /* DUAL PANE DISCOVERY */
                        <>
                            {/* Left Sidebar: Navigation Tree */}
                            <div className="w-80 border-r border-slate-100 flex flex-col bg-white">
                                <div className="p-6 border-b border-slate-50">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Select Context</h3>
                                    <div className="space-y-2 overflow-y-auto max-h-[65vh] custom-scrollbar pr-2">
                                        {dbLogbooks.map(lb => {
                                            const isSelected = selectedDbLogbook?.id === lb.id;
                                            return (
                                                <div key={lb.id} className="space-y-1">
                                                    <button 
                                                        onClick={() => handleSelectLogbook(lb)}
                                                        className={cn(
                                                            "w-full flex items-center gap-4 p-4 rounded-[1.25rem] transition-all group border",
                                                            isSelected 
                                                                ? "bg-indigo-50 border-indigo-200" 
                                                                : "bg-white border-transparent hover:border-slate-200"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs",
                                                            isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                                                        )}>
                                                            {lb.prefix}
                                                        </div>
                                                        <div className="flex-1 text-left min-w-0">
                                                            <div className={cn(
                                                                "text-sm font-extrabold truncate",
                                                                isSelected ? "text-indigo-900" : "text-slate-900"
                                                            )}>
                                                                {lb.name}
                                                            </div>
                                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Logbook</div>
                                                        </div>
                                                    </button>

                                                    {/* Legacy Fallback Link */}
                                                    {isSelected && (
                                                        <div className="pl-14 pr-4 pb-2">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleLegacyMode(lb); }}
                                                                className="w-full flex items-center gap-2 p-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all group/legacy"
                                                            >
                                                                <Folder size={14} className="group-hover/legacy:text-indigo-400" />
                                                                Manual Folder Browser
                                                            </button>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Sample List (Inline) */}
                                                    {isSelected && (
                                                        <div className="pl-6 space-y-1 mt-1 pb-4">
                                                            {dbSamples.map(sample => (
                                                                <button
                                                                    key={sample.id}
                                                                    onClick={() => handleSelectSample(sample)}
                                                                    className={cn(
                                                                        "w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-all group border",
                                                                        selectedSample?.id === sample.id 
                                                                            ? "bg-white border-indigo-300 shadow-md shadow-indigo-100" 
                                                                            : "hover:bg-indigo-50/50 border-transparent text-slate-500"
                                                                    )}
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <FlaskConical size={14} className={selectedSample?.id === sample.id ? "text-indigo-600" : "text-slate-300 group-hover:text-indigo-400"} />
                                                                        <span className="text-xs font-bold tracking-tight">{sample.sample_code}</span>
                                                                    </div>
                                                                    {sample.characterizations?.filter((c:any)=>c.type==='Raman').length > 0 && (
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                                                    )}
                                                                </button>
                                                            ))}
                                                            {dbSamples.length === 0 && !loading && (
                                                                <div className="text-[10px] font-bold text-slate-300 italic py-4">No linked samples</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="mt-auto p-6 bg-slate-50/50 border-t border-slate-100">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        <span className="text-[10px] font-black text-slate-400 uppercase">Vault Sync Active</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                        All discovered measurement files are verified against your local HDF5 repository.
                                    </p>
                                </div>
                            </div>

                            {/* Main Discovery Panel: File Listing */}
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="px-10 py-8 flex flex-col gap-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                                                {selectedSample ? `${selectedSample.sample_code} Measurements` : 'Available Measurements'}
                                            </h3>
                                            <p className="text-sm font-bold text-slate-400">
                                                {selectedSample ? `Scientific maps found for this specimen` : 'Select a project and sample on the left to browse maps'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="relative group">
                                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input 
                                                    value={search}
                                                    onChange={(e) => setSearch(e.target.value)}
                                                    placeholder="Search maps..."
                                                    className="w-64 bg-white border border-slate-200 rounded-2xl py-3 pl-12 pr-4 text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                                                />
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    const all = new Set(filteredFiles.map(f => f.h5_relative_path));
                                                    setSelectedPaths(prev => prev.size === all.size ? new Set() : all);
                                                }}
                                                className="px-6 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
                                            >
                                                Select All
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto px-10 pb-10 custom-scrollbar">
                                    {selectedSample ? (
                                        <div className="grid grid-cols-1 gap-3">
                                            {filteredFiles.map(file => {
                                                const isSelected = selectedPaths.has(file.h5_relative_path);
                                                const isInWorkspace = currentSessionFiles.some(f => f.h5_relative_path === file.h5_relative_path);
                                                
                                                return (
                                                    <div 
                                                        key={file.id}
                                                        onClick={() => {
                                                            const next = new Set(selectedPaths);
                                                            if (next.has(file.h5_relative_path)) next.delete(file.h5_relative_path);
                                                            else next.add(file.h5_relative_path);
                                                            setSelectedPaths(next);
                                                        }}
                                                        className={cn(
                                                            "group bg-white border rounded-3xl p-5 flex items-center gap-6 cursor-pointer transition-all",
                                                            isSelected ? "border-indigo-400 shadow-xl shadow-indigo-500/5 bg-indigo-50/20" : "border-slate-100 hover:border-indigo-300",
                                                            isInWorkspace && "opacity-70"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                                                            isSelected ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600"
                                                        )}>
                                                            <Layers size={20} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-3 mb-1">
                                                                <h4 className="font-black text-slate-900 tracking-tight truncate">{file.name}</h4>
                                                                {isInWorkspace && <span className="text-[9px] font-black uppercase tracking-widest bg-green-100 text-green-700 px-2 py-0.5 rounded-lg">Already Loaded</span>}
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                                                    <Activity size={12} className="text-indigo-400" />
                                                                    {file.metadata?.laser || 'Raman'}
                                                                </div>
                                                                <div className="w-1 h-1 rounded-full bg-slate-200" />
                                                                <div className="text-[10px] font-bold text-slate-400 uppercase">
                                                                    {file.map_width}x{file.map_height} Resol.
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4 shrink-0">
                                                            <div className="text-right">
                                                                <div className="text-[10px] font-black text-slate-900">{format(new Date(file.measured_at), 'MMM d, yyyy')}</div>
                                                                <div className="text-[10px] font-bold text-slate-400 uppercase">{file.metadata?.analyte || 'No Analyte'}</div>
                                                            </div>
                                                            <div className={cn(
                                                                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                                                isSelected ? "bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-100" : "border-slate-200"
                                                            )}>
                                                                {isSelected && <CheckCircle2 size={12} className="text-white" />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {filteredFiles.length === 0 && (
                                                <div className="py-20 text-center bg-white border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                                                    <Search size={40} className="text-slate-200 mx-auto mb-4" />
                                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No matching maps found</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-center">
                                            <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                                                <Database size={40} className="text-indigo-300" />
                                            </div>
                                            <h3 className="text-xl font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Discovery Waiting</h3>
                                            <p className="text-sm font-bold text-slate-400 max-w-sm mx-auto leading-relaxed">
                                                Choose a scientific project from the sidebar to list its Raman characterizations.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        /* SAVED WORKSPACES TAB */
                        <div className="flex-1 p-10 overflow-y-auto w-full">
                            <div className="max-w-6xl mx-auto">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {savedWorkspaces.map(ws => (
                                        <div key={ws.id} className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition-all group flex flex-col h-full border-transparent hover:border-indigo-300">
                                            <div className="flex items-start justify-between mb-6">
                                                <div className="w-14 h-14 bg-indigo-50 rounded-3xl flex items-center justify-center shadow-inner">
                                                    <Layers size={24} className="text-indigo-600" />
                                                </div>
                                                <button 
                                                    onClick={() => handleDeleteWorkspace(ws.id)}
                                                    className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                            <h4 className="text-lg font-black text-slate-900 tracking-tight mb-2 uppercase">{ws.name}</h4>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
                                                {ws.files?.length || 0} Maps • {format(new Date(ws.updated_at), 'MMM d, yyyy')}
                                            </p>
                                            
                                            <div className="flex-1 space-y-2 mb-8">
                                                {ws.files?.slice(0, 3).map((f: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-3 text-[10px] font-bold text-slate-500 bg-slate-50 px-3 py-2 rounded-xl">
                                                        <Circle size={8} className="text-indigo-400 fill-indigo-400" />
                                                        <span className="truncate">{f.name}</span>
                                                    </div>
                                                ))}
                                                {ws.files?.length > 3 && (
                                                    <div className="text-[9px] font-black text-indigo-400 uppercase py-1 pl-1">+ {ws.files.length - 3} more files</div>
                                                )}
                                            </div>

                                            <button 
                                                onClick={() => {
                                                    onLoadWorkspace?.(ws.files);
                                                    onClose();
                                                    toast.success(`Loaded Workspace: ${ws.name}`);
                                                }}
                                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-3"
                                            >
                                                <FolderOpen size={16} />
                                                Restore Workspace
                                            </button>
                                        </div>
                                    ))}
                                    {savedWorkspaces.length === 0 && (
                                        <div className="col-span-full py-40 text-center">
                                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                                <History size={32} className="text-slate-200" />
                                            </div>
                                            <h3 className="text-lg font-black text-slate-300 uppercase tracking-widest">No Saved Comparisons</h3>
                                            <p className="text-xs font-bold text-slate-400 mt-2 max-w-xs mx-auto italic">
                                                Save your current analysis using the "Save Current" button in the discovery header to see it here later.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Bar */}
                <div className="px-10 py-8 border-t border-slate-100 bg-white shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.5)]" />
                            <span className="text-xs font-black text-slate-900 uppercase tracking-widest">
                                {selectedPaths.size} Files Selected
                            </span>
                        </div>
                        <div className="h-4 w-px bg-slate-200" />
                        <span className="text-xs font-bold text-slate-400">
                            {activeTab === 'discovery' ? 'Choose specific maps to import into your analyzer' : 'Restore a previously saved session with all its files'}
                        </span>
                    </div>

                    <div className="flex items-center gap-6">
                        <button 
                            onClick={onClose}
                            className="text-xs font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest transition-colors"
                        >
                            Close Discovery
                        </button>
                        {activeTab === 'discovery' && (
                            <button 
                                onClick={handleImport}
                                disabled={selectedPaths.size === 0}
                                className={cn(
                                    "px-10 py-5 rounded-[1.75rem] text-xs font-black uppercase tracking-[0.3em] transition-all shadow-2xl flex items-center gap-3",
                                    selectedPaths.size > 0 
                                        ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 scale-105 active:scale-95" 
                                        : "bg-slate-200 text-slate-400 cursor-not-allowed"
                                )}
                            >
                                <Zap size={18} />
                                Import to Analyzer
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

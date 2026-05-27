'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
    X, Search, Database, ChevronRight, CheckCircle2, 
    Circle, Filter, Calendar, Zap, AlertCircle, RefreshCw,
    FlaskConical, Layers, ArrowLeft, Folder, Link as LinkIcon,
    History, Tag, Activity, Clock, Save, Trash2, Layout,
    ChevronDown, FolderOpen, ExternalLink, Info, Beaker, SlidersHorizontal
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

// --- Sample Overview Popover ---
function SampleOverviewPopover({ sample, onClose }: { sample: any; onClose: () => void }) {
    return (
        <div
            className="absolute left-full top-0 ml-3 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in slide-in-from-left-2 duration-200"
            onClick={e => e.stopPropagation()}
        >
            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Sample Overview</span>
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                        <X size={12} className="text-slate-400" />
                    </button>
                </div>
                <div className="font-black text-slate-900 text-sm leading-tight">{sample.name || sample.sample_code}</div>
                {sample.sample_code && (
                    <span className="mt-1 inline-block text-[10px] font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-lg">
                        {sample.sample_code}
                    </span>
                )}
            </div>
            <div className="p-4 space-y-4">
                {sample.composition?.length > 0 && (
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <Beaker size={11} className="text-indigo-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Composition</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {sample.composition.map((layer: any, i: number) => (
                                <div key={i} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1" title={layer.category}>
                                    <span className="text-[9px] font-black text-indigo-500 uppercase">{layer.code}</span>
                                    <span className="text-[10px] text-slate-600 font-medium">{layer.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {sample.description && (
                    <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <Tag size={11} className="text-slate-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Notes</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                            {sample.description}
                        </p>
                    </div>
                )}
                {sample.attributes && Object.keys(sample.attributes).some((k: string) => sample.attributes[k] !== null && sample.attributes[k] !== '') && (
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <SlidersHorizontal size={11} className="text-slate-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Attributes</span>
                        </div>
                        <div className="space-y-1">
                            {(Object.entries(sample.attributes) as [string, unknown][])
                                .filter(([, v]) => v !== null && v !== undefined && v !== '')
                                .slice(0, 6)
                                .map(([key, val]) => (
                                    <div key={key} className="flex items-center justify-between gap-2 text-[10px]">
                                        <span className="text-slate-400 font-medium capitalize truncate">{key.replace(/_/g, ' ')}</span>
                                        <span className="font-bold text-slate-700 truncate max-w-[120px]">{String(val)}</span>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}
                {!sample.composition?.length && !sample.description && !Object.keys(sample.attributes || {}).length && (
                    <p className="text-[11px] text-slate-400 italic text-center py-4">No additional metadata available.</p>
                )}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Raman Maps</span>
                    <span className="text-xs font-black text-indigo-600">
                        {sample.characterizations?.filter((c: any) => c.type === 'Raman').length || 0}
                    </span>
                </div>
            </div>
        </div>
    );
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
    const [isLegacyMode, setIsLegacyMode] = useState<boolean>(false);
    const [openSampleOverview, setOpenSampleOverview] = useState<string | null>(null);
    const overviewRef = useRef<HTMLDivElement>(null);

    // Filters — dynamic facet system
    const [facetFilters, setFacetFilters] = useState<Record<string, Set<string>>>({});
    const [statusFilter, setStatusFilter] = useState<'all' | 'loaded' | 'not_loaded'>('all');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);
    const [openFacet, setOpenFacet] = useState<string | null>(null);
    const facetRef = useRef<HTMLDivElement>(null);

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
        setSelectedSample(null);
        try {
            const samplesRes = await getSamplesAction(dbLb.group_id, dbLb.id);
            if (samplesRes.data) {
                const ramanSamples = samplesRes.data.filter((s: any) => 
                    s.characterizations?.some((c: any) => 
                        c.type === 'Raman' && (c.data.local_h5_paths?.length > 0 || c.data.local_h5_path)
                    )
                );
                setDbSamples(ramanSamples);

                const allVaultFiles: VaultFile[] = [];
                ramanSamples.forEach((sample: any) => {
                    const ramanChars = sample.characterizations.filter((c: any) => 
                        c.type === 'Raman' && (c.data.local_h5_paths?.length > 0 || c.data.local_h5_path)
                    );
                    ramanChars.forEach((c: any) => {
                        const h5Paths = c.data.local_h5_paths || (c.data.local_h5_path ? [c.data.local_h5_path] : []);
                        const meta = c.data.file_metadata || {};
                        
                        h5Paths.forEach((path: string) => {
                            const fileName = path.split(/[/\\]/).pop() || 'Untitled';
                            const fileMeta = meta[path] || {};
                            const params = c.data || {};
                            
                            const findKey = (searchStr: string) => {
                                const keys = Object.keys(params);
                                const found = keys.find(k => k.toLowerCase().includes(searchStr.toLowerCase()));
                                return found ? params[found] : undefined;
                            };

                            allVaultFiles.push({
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
                });

                setFiles(allVaultFiles);
                setStep(3);
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

    // Compute available facets from real metadata values in loaded files
    const availableFacets = useMemo(() => {
        const facets: Record<string, Map<string, number>> = {}; // key -> {value -> count}
        files.forEach(f => {
            const meta = f.metadata || {};
            Object.entries(meta).forEach(([k, v]) => {
                if (!v || typeof v !== 'string') return;
                const val = v.trim();
                if (!val || val.length > 40) return;
                // Skip system-like keys
                if (['notes', 'equipment', 'file_origin', 'local_h5_path', 'original_file'].includes(k)) return;
                if (!facets[k]) facets[k] = new Map();
                facets[k].set(val, (facets[k].get(val) || 0) + 1);
            });
            // Technique is always a facet
            if (f.technique) {
                if (!facets['technique']) facets['technique'] = new Map();
                facets['technique'].set(f.technique, (facets['technique'].get(f.technique) || 0) + 1);
            }
        });
        // Sort facets by number of unique values (fewer = more useful filter), max 6 facets
        return Object.entries(facets)
            .filter(([, m]) => m.size >= 1 && m.size <= 20)
            .sort((a, b) => a[1].size - b[1].size)
            .slice(0, 6)
            .map(([key, valMap]) => ({
                key,
                label: key.replace(/_/g, ' '),
                values: Array.from(valMap.entries()).sort((a, b) => b[1] - a[1]) // sort by count desc
            }));
    }, [files]);

    const filteredFiles = useMemo(() => {
        let result = files;

        // Full-text search
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(f => {
                const sample = dbSamples.find(s => (s.sample_code || s.name) === f.sample_name);
                const descText = (sample?.description || '').toLowerCase();
                const notesText = (sample?.characterizations || [])
                    .flatMap((c: any) => [c.data?.notes || '', c.data?.equipment || ''])
                    .join(' ').toLowerCase();
                const metaText = Object.values(f.metadata || {}).join(' ').toLowerCase();
                return (
                    f.name.toLowerCase().includes(q) ||
                    f.sample_name.toLowerCase().includes(q) ||
                    metaText.includes(q) ||
                    descText.includes(q) ||
                    notesText.includes(q)
                );
            });
        }

        // Dynamic facet filters — AND across facets, OR within each facet
        Object.entries(facetFilters).forEach(([key, selectedVals]) => {
            if (!selectedVals || selectedVals.size === 0) return;
            result = result.filter(f => {
                const val = key === 'technique'
                    ? (f.technique || '')
                    : ((f.metadata || {})[key] || '');
                return selectedVals.has(String(val).trim());
            });
        });

        // Status filter
        if (statusFilter === 'loaded') {
            result = result.filter(f => currentSessionFiles.some(cf => cf.h5_relative_path === f.h5_relative_path));
        } else if (statusFilter === 'not_loaded') {
            result = result.filter(f => !currentSessionFiles.some(cf => cf.h5_relative_path === f.h5_relative_path));
        }

        // Date range filter
        if (dateFrom) {
            const from = new Date(dateFrom).getTime();
            result = result.filter(f => new Date(f.measured_at || f.created_at || 0).getTime() >= from);
        }
        if (dateTo) {
            const to = new Date(dateTo).getTime() + 86400000;
            result = result.filter(f => new Date(f.measured_at || f.created_at || 0).getTime() <= to);
        }

        return [...result].sort((a, b) =>
            new Date(b.measured_at || b.created_at || 0).getTime() -
            new Date(a.measured_at || a.created_at || 0).getTime()
        );
    }, [files, search, facetFilters, statusFilter, dateFrom, dateTo, currentSessionFiles, dbSamples]);

    const groupedFiles = useMemo(() => {
        const groups: Record<string, VaultFile[]> = {};
        filteredFiles.forEach(file => {
            const sName = file.sample_name || 'Uncategorized';
            if (!groups[sName]) groups[sName] = [];
            groups[sName].push(file);
        });
        return groups;
    }, [filteredFiles]);

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
                            <div className="flex items-center gap-2 bg-slate-50 p-1.5 pr-3 rounded-2xl border border-slate-200 shadow-sm">
                                <div className="pl-3 pr-1 text-[9px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-200">Name</div>
                                <input 
                                    className="bg-transparent text-xs font-bold text-slate-900 px-3 py-1.5 outline-none w-48 placeholder:text-slate-300"
                                    placeholder="e.g. Analysis Batch A..."
                                    value={saveName}
                                    onChange={(e) => setSaveName(e.target.value)}
                                />
                                <button 
                                    onClick={handleSaveWorkspace}
                                    disabled={!saveName.trim() || isSaving}
                                    className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-md shadow-indigo-100"
                                >
                                    {isSaving ? <RefreshCw size={14} className="animate-spin" /> : 'Save Workspace'}
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
                                {/* Title + Search + Filter Bar */}
                                <div className="px-10 pt-6 pb-3 flex flex-col gap-3 border-b border-slate-100 shrink-0">
                                    {/* Row 1: title + search + select all */}
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <h3 className="text-xl font-black text-slate-900 tracking-tight leading-tight">
                                                {selectedDbLogbook ? selectedDbLogbook.name : 'Available Measurements'}
                                            </h3>
                                            <p className="text-xs font-bold text-slate-400">
                                                {selectedDbLogbook
                                                    ? `${filteredFiles.length} map${filteredFiles.length !== 1 ? 's' : ''} found`
                                                    : 'Select a project on the left to browse maps'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {/* Search */}
                                            <div className="relative">
                                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    value={search}
                                                    onChange={(e) => setSearch(e.target.value)}
                                                    placeholder="Search maps, notes..."
                                                    className="w-56 bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all placeholder:text-slate-300"
                                                />
                                                {search && (
                                                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
                                                        <X size={10} />
                                                    </button>
                                                )}
                                            </div>
                                            {/* Filter toggle */}
                                            <button
                                                onClick={() => setShowFilters(v => !v)}
                                                className={cn(
                                                    "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-all",
                                                    showFilters || Object.values(facetFilters).some(s => s.size > 0) || statusFilter !== 'all' || dateFrom || dateTo
                                                        ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                                        : "bg-white border-slate-200 text-slate-500 hover:border-indigo-400 hover:text-indigo-600"
                                                )}
                                            >
                                                <SlidersHorizontal size={12} />
                                                Filters
                                                {(Object.values(facetFilters).some(s => s.size > 0) || statusFilter !== 'all' || !!dateFrom || !!dateTo) && (
                                                    <span className="ml-0.5 bg-white/30 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] font-black">
                                                        {Object.values(facetFilters).filter(s => s.size > 0).length + (statusFilter !== 'all' ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
                                                    </span>
                                                )}
                                            </button>
                                            {/* Select All */}
                                            <button
                                                onClick={() => {
                                                    const all = new Set(filteredFiles.map(f => f.h5_relative_path));
                                                    setSelectedPaths(prev => prev.size === all.size ? new Set() : all);
                                                }}
                                                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
                                            >
                                                Select All
                                            </button>
                                        </div>
                                    </div>

                                    {/* Row 2: Dynamic facet filter bar */}
                                    {showFilters && (
                                        <div className="flex flex-wrap items-center gap-2 py-2" ref={facetRef}>

                                            {/* Dynamic facet dropdowns — values come from real file metadata */}
                                            {availableFacets.map(facet => {
                                                const active = facetFilters[facet.key];
                                                const hasActive = active && active.size > 0;
                                                const isOpen = openFacet === facet.key;
                                                return (
                                                    <div key={facet.key} className="relative">
                                                        <button
                                                            onClick={() => setOpenFacet(isOpen ? null : facet.key)}
                                                            className={cn(
                                                                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all",
                                                                hasActive
                                                                    ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                                                                    : "bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                                                            )}
                                                        >
                                                            <span className="capitalize">{facet.label}</span>
                                                            {hasActive && (
                                                                <span className="bg-indigo-600 text-white rounded-full px-1.5 text-[8px] font-black">
                                                                    {active.size}
                                                                </span>
                                                            )}
                                                            <ChevronDown size={9} className={cn("transition-transform", isOpen && "rotate-180")} />
                                                        </button>

                                                        {/* Dropdown: Excel-style checklist */}
                                                        {isOpen && (
                                                            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[160px] max-w-[220px] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                                                                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                                                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 capitalize">{facet.label}</span>
                                                                    {hasActive && (
                                                                        <button
                                                                            onClick={() => setFacetFilters(prev => { const n = {...prev}; delete n[facet.key]; return n; })}
                                                                            className="text-[9px] text-rose-400 hover:text-rose-600 font-black uppercase"
                                                                        >Clear</button>
                                                                    )}
                                                                </div>
                                                                <div className="max-h-48 overflow-y-auto py-1">
                                                                    {facet.values.map(([val, count]) => {
                                                                        const checked = active?.has(val) ?? false;
                                                                        return (
                                                                            <button
                                                                                key={val}
                                                                                onClick={() => {
                                                                                    setFacetFilters(prev => {
                                                                                        const cur = new Set(prev[facet.key] || []);
                                                                                        if (cur.has(val)) cur.delete(val); else cur.add(val);
                                                                                        return { ...prev, [facet.key]: cur };
                                                                                    });
                                                                                }}
                                                                                className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-indigo-50 transition-colors text-left group"
                                                                            >
                                                                                <div className={cn(
                                                                                    "w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                                                                                    checked ? "bg-indigo-600 border-indigo-600" : "border-slate-300 group-hover:border-indigo-400"
                                                                                )}>
                                                                                    {checked && <span className="text-white text-[7px] font-black">✓</span>}
                                                                                </div>
                                                                                <span className="flex-1 text-[11px] font-medium text-slate-700 truncate">{val}</span>
                                                                                <span className="text-[9px] text-slate-400 font-bold shrink-0">{count}</span>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {availableFacets.length > 0 && <div className="h-4 w-px bg-slate-200" />}

                                            {/* Status — always valid */}
                                            <div className="flex items-center gap-1">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mr-1">Status</span>
                                                {([['all', 'All'], ['loaded', 'Loaded'], ['not_loaded', 'Not Loaded']] as const).map(([val, label]) => (
                                                    <button key={val}
                                                        onClick={() => setStatusFilter(val)}
                                                        className={cn(
                                                            "text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border transition-all",
                                                            statusFilter === val
                                                                ? val === 'loaded' ? 'bg-green-600 border-green-600 text-white' : 'bg-slate-700 border-slate-700 text-white'
                                                                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
                                                        )}
                                                    >{label}</button>
                                                ))}
                                            </div>

                                            <div className="h-4 w-px bg-slate-200" />

                                            {/* Date range */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">From</span>
                                                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                                    className="text-[10px] font-bold border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-400 bg-white text-slate-600 transition-all" />
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">To</span>
                                                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                                    className="text-[10px] font-bold border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-400 bg-white text-slate-600 transition-all" />
                                            </div>

                                            {/* Clear all */}
                                            {(Object.values(facetFilters).some(s => s.size > 0) || statusFilter !== 'all' || dateFrom || dateTo) && (
                                                <button
                                                    onClick={() => { setFacetFilters({}); setStatusFilter('all'); setDateFrom(''); setDateTo(''); }}
                                                    className="ml-auto text-[9px] font-black uppercase tracking-wider text-rose-400 hover:text-rose-600 px-2 py-1 rounded-lg border border-rose-200 hover:border-rose-400 bg-white transition-all flex items-center gap-1"
                                                >
                                                    <X size={9} /> Clear all
                                                </button>
                                            )}

                                            {/* Active filter chips */}
                                            {Object.entries(facetFilters).some(([, s]) => s.size > 0) && (
                                                <div className="w-full flex flex-wrap gap-1 pt-1">
                                                    {Object.entries(facetFilters).flatMap(([key, vals]) =>
                                                        Array.from(vals).map(val => (
                                                            <span key={`${key}:${val}`}
                                                                className="inline-flex items-center gap-1 text-[9px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200"
                                                            >
                                                                <span className="capitalize opacity-60">{key}:</span> {val}
                                                                <button
                                                                    onClick={() => setFacetFilters(prev => {
                                                                        const cur = new Set(prev[key]);
                                                                        cur.delete(val);
                                                                        const n = { ...prev };
                                                                        if (cur.size === 0) delete n[key]; else n[key] = cur;
                                                                        return n;
                                                                    })}
                                                                    className="ml-0.5 hover:text-rose-600 transition-colors"
                                                                ><X size={8} /></button>
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 overflow-y-auto px-10 pb-10 custom-scrollbar">
                                    {selectedDbLogbook ? (
                                        <div className="flex flex-col gap-8">
                                            {Object.entries(groupedFiles).map(([sampleName, sFiles]) => {
                                                const sample = dbSamples.find(s => (s.sample_code || s.name) === sampleName);
                                                return (
                                                    <div key={sampleName} className="space-y-3">
                                                        <div className="flex items-center justify-between mb-4 bg-slate-100/80 p-3 rounded-2xl border border-slate-200/60 backdrop-blur-sm">
                                                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    <FlaskConical size={16} className="text-slate-500" />
                                                                    <h4 className="text-sm font-black text-slate-800 tracking-widest">{sampleName}</h4>
                                                                    <span className="text-[10px] font-bold text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded-lg">{sFiles.length} {sFiles.length === 1 ? 'map' : 'maps'}</span>
                                                                </div>

                                                                {/* Composition List */}
                                                                {sample?.composition && sample.composition.length > 0 && (
                                                                    <div className="flex flex-wrap items-center gap-1.5 shrink-0 border-l border-slate-200 pl-4">
                                                                        {sample.composition.map((layer: any, i: number) => (
                                                                            <div key={i} className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-0.5 shadow-sm" title={layer.category}>
                                                                                <span className="text-[9px] font-extrabold text-indigo-600 uppercase">{layer.code}</span>
                                                                                <span className="text-[10px] text-slate-500 font-medium">{layer.value}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* Comments / Description */}
                                                                {sample?.description && (
                                                                    <div className="flex-1 min-w-0 border-l border-slate-200 pl-4 flex items-center gap-1.5">
                                                                        <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider shrink-0">Notes:</span>
                                                                        <p className="text-[11px] text-slate-500 font-medium truncate" title={sample.description}>
                                                                            {sample.description}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {/* Compact Table Header */}
                                                        <div className="grid items-center gap-x-3 px-3 mb-1" style={{gridTemplateColumns: '20px 90px 60px 1fr 80px 80px 70px 80px 20px'}}>
                                                            <div />
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">ID</span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tech.</span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Parameters</span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Spot</span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Spectra</span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Status</span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Date</span>
                                                            <div />
                                                        </div>
                                                        <div className="flex flex-col gap-px">
                                                        {sFiles.map(file => {
                                                            const isSelected = selectedPaths.has(file.h5_relative_path);
                                                            const isInWorkspace = currentSessionFiles.some(f => f.h5_relative_path === file.h5_relative_path);
                                                            
                                                            // Parse filename tokens: SampleCode_TECHNIQUE_param1_param2..._SpotN.h5
                                                            const stem = file.name.replace(/\.h5$/i, '');
                                                            const parts = stem.split('_');
                                                            const spotIdx = parts.findLastIndex((p: string) => /^spot\d+$/i.test(p));
                                                            const spotToken = spotIdx >= 0 ? parts[spotIdx] : null;
                                                            const techIdx = parts.findIndex((p: string) => /^(raman|sers|tem|xrd|afm|sem|xps|ftir)$/i.test(p));
                                                            const techToken = techIdx >= 0 ? parts[techIdx] : file.technique;
                                                            const idToken = parts[0] || file.sample_name;
                                                            const paramTokens = parts.slice(
                                                                Math.max(1, techIdx >= 0 ? techIdx + 1 : 1),
                                                                spotIdx >= 0 ? spotIdx : undefined
                                                            ).filter((p: string) => p.length > 0);
                                                            
                                                            return (
                                                                <div 
                                                                    key={file.id}
                                                                    onClick={() => {
                                                                        const next = new Set(selectedPaths);
                                                                        if (next.has(file.h5_relative_path)) next.delete(file.h5_relative_path);
                                                                        else next.add(file.h5_relative_path);
                                                                        setSelectedPaths(next);
                                                                    }}
                                                                    title={file.name}
                                                                    className={cn(
                                                                        "group grid items-center gap-x-3 px-3 py-2 rounded-xl cursor-pointer transition-all duration-150",
                                                                        isSelected
                                                                            ? "bg-indigo-50 border border-indigo-200 shadow-sm"
                                                                            : "border border-transparent hover:bg-slate-50 hover:border-slate-200",
                                                                        isInWorkspace && "opacity-60"
                                                                    )}
                                                                    style={{gridTemplateColumns: '20px 90px 60px 1fr 80px 80px 70px 80px 20px'}}
                                                                >
                                                                    {/* Checkbox col */}
                                                                    <div className={cn(
                                                                        "w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0",
                                                                        isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-300 group-hover:border-indigo-400"
                                                                    )}>
                                                                        {isSelected && <CheckCircle2 size={9} className="text-white" />}
                                                                    </div>

                                                                    {/* Sample ID col */}
                                                                    <span className="text-[10px] font-black text-slate-800 truncate" title={idToken}>
                                                                        {idToken}
                                                                    </span>

                                                                    {/* Technique col */}
                                                                    <span className={cn(
                                                                        "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md w-fit",
                                                                        /sers/i.test(techToken || '')
                                                                            ? "bg-violet-100 text-violet-700"
                                                                            : "bg-indigo-100 text-indigo-700"
                                                                    )}>
                                                                        {techToken}
                                                                    </span>

                                                                    {/* Parameters col */}
                                                                    <div className="flex items-center gap-1 flex-wrap min-w-0">
                                                                        {paramTokens.slice(0, 6).map((p: string, i: number) => (
                                                                            <span
                                                                                key={i}
                                                                                className={cn(
                                                                                    "text-[9px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap",
                                                                                    // Color-code by token type
                                                                                    /^\d+nm$/i.test(p) ? "bg-amber-50 text-amber-700 border border-amber-200" :      // laser wavelength
                                                                                    /^\d+[uμm]W$/i.test(p) ? "bg-rose-50 text-rose-700 border border-rose-200" :      // power
                                                                                    /^\d+[sx]$/i.test(p) || /^\d+s$/i.test(p) ? "bg-sky-50 text-sky-700 border border-sky-200" :  // time
                                                                                    /^\d+ac$/i.test(p) ? "bg-sky-50 text-sky-700 border border-sky-200" :             // accumulations
                                                                                    /^\d+x\d+[uμ]m$/i.test(p) ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : // area
                                                                                    /^\d+x\d+[ij]$/i.test(p) ? "bg-teal-50 text-teal-700 border border-teal-200" :    // grid
                                                                                    /^RG?\d+/i.test(p) ? "bg-orange-50 text-orange-700 border border-orange-200" :    // grating
                                                                                    "bg-slate-100 text-slate-600 border border-slate-200"
                                                                                )}
                                                                            >
                                                                                {p}
                                                                            </span>
                                                                        ))}
                                                                        {paramTokens.length > 6 && (
                                                                            <span className="text-[9px] text-slate-400 font-bold">+{paramTokens.length - 6}</span>
                                                                        )}
                                                                    </div>

                                                                    {/* Spot col */}
                                                                    <span className={cn(
                                                                        "text-[10px] font-black truncate",
                                                                        spotToken ? "text-slate-700" : "text-slate-300"
                                                                    )}>
                                                                        {spotToken || '—'}
                                                                    </span>

                                                                    {/* Spectra col */}
                                                                    <span className="text-[10px] font-bold text-slate-500">
                                                                        {file.n_spectra > 0 ? `${file.n_spectra} sp.` : `${file.map_width}×${file.map_height}`}
                                                                    </span>

                                                                    {/* Status col */}
                                                                    {isInWorkspace ? (
                                                                        <span className="text-[8px] font-black uppercase tracking-wider bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md w-fit">
                                                                            Loaded
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[8px] font-black uppercase tracking-wider bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-md w-fit">
                                                                            .h5
                                                                        </span>
                                                                    )}

                                                                    {/* Date col */}
                                                                    <div className="text-right">
                                                                        <div className="text-[9px] font-black text-slate-500">
                                                                            {(() => { try { return format(new Date(file.measured_at), 'MMM d, yy'); } catch { return '—'; } })()}
                                                                        </div>
                                                                    </div>

                                                                    {/* End spacer */}
                                                                    <div />
                                                                </div>
                                                            );
                                                        })}
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

                            {/* Right Sidebar: Current Workspace */}
                            <div className="w-72 border-l border-slate-200 bg-white flex flex-col shrink-0">
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Layers size={16} className="text-indigo-600" />
                                        <h3 className="text-sm font-black text-slate-900">Current Workspace</h3>
                                    </div>
                                    {currentSessionFiles.length > 0 && (
                                        <button 
                                            onClick={() => {
                                                if (confirm('Are you sure you want to clear your workspace?')) {
                                                    // Fire an import of an empty array to clear it in parent
                                                    onLoadWorkspace?.([]);
                                                }
                                            }}
                                            className="text-[10px] font-bold text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                                        >
                                            <Trash2 size={12} /> Clear
                                        </button>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                    {currentSessionFiles.length === 0 ? (
                                        <div className="text-center py-10">
                                            <p className="text-xs font-bold text-slate-400">Workspace is empty</p>
                                        </div>
                                    ) : (
                                        currentSessionFiles.map((f, i) => (
                                            <div key={i} className="flex flex-col bg-slate-50 p-3 rounded-xl border border-slate-100 relative group">
                                                <span className="text-[10px] font-black text-indigo-500 truncate mb-1">{f.sample_name || 'Sample'}</span>
                                                <span className="text-xs font-bold text-slate-700 truncate">{f.name}</span>
                                            </div>
                                        ))
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
                                                {ws.files?.length || 0} Maps ÔÇó {format(new Date(ws.updated_at), 'MMM d, yyyy')}
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

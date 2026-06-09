'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { 
    RefreshCw, FileText, Database, Map, Search, 
    ChevronDown, ChevronRight, FlaskConical, 
    Calendar, Layers, X, Trash2, Zap, Info, Check,
    Tag, Beaker, SlidersHorizontal, Save,
    Bookmark, History
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface PipelineStep {
    type: string;
    params?: Record<string, any>;
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
    pipeline_applied?: boolean;
    pipeline_name?: string;
    pipeline_history?: string; // JSON string of steps
    parent_file?: string;
}

interface FileNode {
    file: VaultFile;
    children: VaultFile[];
}

interface SampleGroup {
    name: string;
    displayName: string;
    sampleCode?: string;
    composition?: { category: string; value: string; code: string }[];
    description?: string;
    status?: string;
    attributes?: Record<string, any>;
    latestDate: string;
    files: VaultFile[];
    fileNodes: FileNode[];
}

import { createPortal } from 'react-dom';

// --- Condensed Sample Overview Popover ---
function SampleOverviewPopover({ group, onClose, position }: { group: SampleGroup, onClose: () => void, position: { top: number, left: number } }) {
    const ref = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    const compositionLayers = group.composition?.length
        ? group.composition
        : [];

    const attributeEntries = group.attributes
        ? Object.entries(group.attributes).filter(([, v]) => v !== null && v !== undefined && v !== '')
        : [];

    if (!mounted) return null;

    return createPortal(
        <div
            ref={ref}
            style={{ 
                top: Math.min(position.top, typeof window !== 'undefined' ? window.innerHeight - 300 : position.top), 
                left: position.left 
            }}
            className="fixed z-[100] w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in slide-in-from-left-2 duration-200"
            onClick={e => e.stopPropagation()}
        >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Sample Overview</span>
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                        <X size={12} className="text-slate-400" />
                    </button>
                </div>
                <div className="font-black text-slate-900 text-sm leading-tight">{group.displayName}</div>
                {group.sampleCode && (
                    <span className="mt-1 inline-block text-[10px] font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-lg">
                        {group.sampleCode}
                    </span>
                )}
            </div>

            <div className="p-4 space-y-4">
                {/* Composition Stack */}
                {compositionLayers.length > 0 && (
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <Beaker size={11} className="text-indigo-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Composition</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {compositionLayers.map((layer, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1"
                                    title={layer.category}
                                >
                                    <span className="text-[9px] font-black text-indigo-500 uppercase">{layer.code}</span>
                                    <span className="text-[10px] text-slate-600 font-medium">{layer.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Description */}
                {group.description && (
                    <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <Tag size={11} className="text-slate-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Notes</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                            {group.description}
                        </p>
                    </div>
                )}

                {/* Key Attributes */}
                {attributeEntries.length > 0 && (
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <SlidersHorizontal size={11} className="text-slate-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Attributes</span>
                        </div>
                        <div className="space-y-1">
                            {attributeEntries.slice(0, 6).map(([key, val]) => (
                                <div key={key} className="flex items-center justify-between gap-2 text-[10px]">
                                    <span className="text-slate-400 font-medium capitalize truncate">{key.replace(/_/g, ' ')}</span>
                                    <span className="font-bold text-slate-700 truncate max-w-[120px]">{String(val)}</span>
                                </div>
                            ))}
                            {attributeEntries.length > 6 && (
                                <div className="text-[9px] text-indigo-400 font-bold pt-1">
                                    +{attributeEntries.length - 6} more attributes
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* No data fallback */}
                {compositionLayers.length === 0 && !group.description && attributeEntries.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic text-center py-4">No additional metadata available.</p>
                )}

                {/* Measurement count */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Loaded Maps</span>
                    <span className="text-xs font-black text-indigo-600">{group.files.length}</span>
                </div>
            </div>
        </div>,
        document.body
    );
}

// Match any derivative indicator: _preprocessed, _rgi, _deconvolution, _fitting (case insensitive)
const DERIVATIVE_REGEX = /(_preprocessed|_rgi|_deconvolution|_fitting)\b/i;

const isPipelineFile = (f: VaultFile) =>
    !!f.parent_file || f.pipeline_applied === true || DERIVATIVE_REGEX.test(f.name.replace(/\.h5$/i, ''));

const getAncestors = (file: VaultFile, allFiles: VaultFile[]): string[] => {
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
        const match = currentStem.match(DERIVATIVE_REGEX);
        
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

const getUltimateParentStem = (file: VaultFile, allFiles: VaultFile[]) => {
    const ancestors = getAncestors(file, allFiles);
    const ultimateParentPath = ancestors[ancestors.length - 1];
    const ultimateParent = allFiles.find(f => f.h5_relative_path === ultimateParentPath);
    return ultimateParent ? ultimateParent.name.replace(/\.h5$/i, '') : file.name.replace(/\.h5$/i, '');
};

export function VaultLibrary({ 
    vaultRoot, 
    groupId, 
    selectedH5,
    sessionFiles,
    dbSamples = [],
    compareFiles = [],
    onSelect,
    onOpenExplorer,
    onSaveWorkspace,
    onSaveComparison,
    isSaving,
    savedWorkspaces = [],
    onLoadWorkspace,
    onRemove,
    onDeleteFile,
    onToggleCompare,
    isLoading = false,
    onGroupFiles
}: { 
    vaultRoot: string;
    groupId: string;
    selectedH5: string;
    sessionFiles: VaultFile[];
    dbSamples?: any[];
    compareFiles?: VaultFile[];
    onSelect: (file: any) => void;
    onOpenExplorer: () => void;
    onSaveWorkspace?: () => void;
    onSaveComparison?: () => void;
    isSaving?: boolean;
    savedWorkspaces?: any[];
    onLoadWorkspace?: (ws: any) => void;
    onRemove: (path: string) => void;
    onDeleteFile?: (file: any) => void;
    onToggleCompare?: (file: any) => void;
    isLoading?: boolean;
    onGroupFiles?: (files: VaultFile[]) => void;
}) {
    const [search, setSearch] = useState('');
    const [expandedSamples, setExpandedSamples] = useState<Record<string, boolean>>({});
    const [openOverview, setOpenOverview] = useState<string | null>(null);
    const [overviewPosition, setOverviewPosition] = useState({ top: 0, left: 0 });

    const toggleSample = (name: string) => {
        setExpandedSamples(prev => ({
            ...prev,
            [name]: prev[name] !== false ? false : true
        }));
    };

    const groupedData = useMemo(() => {
        // ── helpers ──────────────────────────────────────────────────────────
        const getStem = (f: VaultFile) => f.name.replace(/\.h5$/i, '');

        // ── group by sample ──────────────────────────────────────────────────
        const groups = sessionFiles.reduce((acc, file) => {
            const rawSName = (file.sample_name || 'Uncategorized').trim();
            const dbMatch =
                dbSamples.find(s => s.sample_code === rawSName) ||
                dbSamples.find(s => file.name.includes(s.sample_code)) ||
                dbSamples.find(s => s.name === rawSName);
            const sName = dbMatch ? dbMatch.sample_code : rawSName;

            if (!acc[sName]) {
                acc[sName] = {
                    name: sName,
                    displayName: dbMatch?.name || sName,
                    sampleCode: dbMatch?.sample_code,
                    composition: dbMatch?.composition || [],
                    description: dbMatch?.description || '',
                    status: dbMatch?.status,
                    attributes: dbMatch?.attributes || {},
                    files: [],
                    fileNodes: [],
                    latestDate: file.measured_at || file.created_at || ''
                };
            }
            acc[sName].files.push(file);
            if (!isPipelineFile(file)) {
                const fileDate = file.measured_at || file.created_at || '';
                if (fileDate > acc[sName].latestDate) acc[sName].latestDate = fileDate;
            }
            return acc;
        }, {} as Record<string, SampleGroup>);

        // ── build parent → children tree per group ───────────────────────────
        Object.values(groups).forEach(group => {
            const originals = group.files.filter(f => !isPipelineFile(f));
            const pipelines  = group.files.filter(f =>  isPipelineFile(f));

            // Record: original stem → FileNode
            const nodeRecord: Record<string, FileNode> = {};
            originals.forEach(f => { nodeRecord[getStem(f)] = { file: f, children: [] }; });

            // Attach each pipeline to its parent; orphans become root nodes
            const orphanNodes: FileNode[] = [];
            pipelines.forEach(pf => {
                const parentStem = getUltimateParentStem(pf, group.files);
                const parentNode = nodeRecord[parentStem];
                if (parentNode) {
                    parentNode.children.push(pf);
                } else {
                    orphanNodes.push({ file: pf, children: [] });
                }
            });

            // Sort children by date (oldest first — preserves pipeline creation order)
            Object.values(nodeRecord).forEach((node: FileNode) =>
                node.children.sort((a: VaultFile, b: VaultFile) =>
                    (a.measured_at || a.created_at || '').localeCompare(
                        b.measured_at || b.created_at || '')
                )
            );

            // Root nodes: originals sorted by date desc, orphan pipelines at end
            const rootNodes: FileNode[] = [
                ...Object.values(nodeRecord).sort((a: FileNode, b: FileNode) =>
                    (b.file.measured_at || b.file.created_at || '').localeCompare(
                        a.file.measured_at || a.file.created_at || '')
                ),
                ...orphanNodes
            ];

            group.fileNodes = rootNodes;
        });

        // ── filter + sort groups ─────────────────────────────────────────────
        const searchLower = search.toLowerCase();
        const allGroups = Object.values(groups).sort((a, b) =>
            b.latestDate.localeCompare(a.latestDate));

        if (!searchLower) return allGroups;

        return allGroups.filter(group => {
            const groupMatch =
                group.name.toLowerCase().includes(searchLower) ||
                group.displayName.toLowerCase().includes(searchLower) ||
                (group.sampleCode && group.sampleCode.toLowerCase().includes(searchLower));
            if (groupMatch) return true;
            return group.files.some(f =>
                f.name.toLowerCase().includes(searchLower) ||
                (f.pipeline_name && f.pipeline_name.toLowerCase().includes(searchLower))
            );
        });
    }, [sessionFiles, search, dbSamples]);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white relative z-20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                        <Database size={18} className="text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-slate-900 tracking-tight">Active Workspace</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{sessionFiles.length} Maps Loaded</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {compareFiles.length > 1 && onGroupFiles && (
                        <button 
                            onClick={() => onGroupFiles(compareFiles)}
                            disabled={isSaving}
                            className="p-2.5 bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100 rounded-xl transition-all shadow-sm active:scale-95 group"
                            title="Group Selected Spectra into a Single Map file"
                        >
                            <Map size={16} className="group-hover:scale-110 transition-transform text-amber-700" />
                        </button>
                    )}
                    {compareFiles.length > 0 && onSaveComparison && (
                        <button 
                            onClick={onSaveComparison}
                            disabled={isSaving}
                            className="p-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100 rounded-xl transition-all shadow-sm active:scale-95 group"
                            title="Save Active Comparison"
                        >
                            {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} className="group-hover:scale-110 transition-transform" />}
                        </button>
                    )}
                    {sessionFiles.length > 0 && onSaveWorkspace && (
                        <button 
                            onClick={onSaveWorkspace}
                            disabled={isSaving}
                            className="p-2.5 bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 rounded-xl transition-all shadow-sm active:scale-95 group"
                            title="Save Entire Workspace"
                        >
                            {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} className="group-hover:scale-110 transition-transform" />}
                        </button>
                    )}
                    <button 
                        onClick={onOpenExplorer}
                        className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-lg shadow-indigo-100 active:scale-95 group"
                        title="Import Maps from Vault"
                    >
                        <Layers size={16} className="group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="p-4 bg-slate-50/50 border-b border-slate-100">
                <div className="relative group">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                    <input 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filter workspace..." 
                        className="w-full bg-white text-xs text-slate-900 border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all font-medium"
                    />
                </div>
            </div>

            {/* Library Content */}
            <div className="flex-1 overflow-y-auto bg-white custom-scrollbar px-2 py-2">
                {isLoading ? (
                    <div className="flex flex-col h-full overflow-hidden animate-pulse">
                        {/* Skeleton Header */}
                        <div className="flex items-center text-[10px] font-black text-slate-300 uppercase tracking-wider bg-slate-50/30 border-b border-slate-100 shrink-0">
                            <div className="w-10 border-r border-slate-100 py-2.5 flex items-center justify-center">
                                <div className="w-3.5 h-3.5 rounded border border-slate-200 bg-slate-100" />
                            </div>
                            <div className="w-24 border-r border-slate-100 px-3 py-2.5"><div className="h-2 bg-slate-200 rounded w-10" /></div>
                            <div className="flex-1 px-3 py-2.5"><div className="h-2 bg-slate-200 rounded w-16" /></div>
                            <div className="w-10 border-l border-slate-100 py-2.5"></div>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-4 pt-3 px-1">
                            {[1, 2, 3].map((gIdx) => (
                                <div key={gIdx} className="space-y-2.5 border border-slate-100/80 p-3 rounded-2xl bg-slate-50/30">
                                    {/* Group row skeleton */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded bg-slate-200" />
                                        <div className="h-3 bg-slate-300 rounded w-14" />
                                        <div className="h-3 bg-slate-200 rounded w-28" />
                                    </div>
                                    {/* File items skeleton */}
                                    <div className="pl-6 space-y-2 pt-1 border-l-2 border-slate-100 ml-1.5">
                                        {[1, 2].map((fIdx) => (
                                            <div key={fIdx} className="flex items-center justify-between py-1 text-slate-300 text-[10px]">
                                                <div className="flex items-center gap-2">
                                                    <span>└</span>
                                                    <div className="h-2 bg-slate-200 rounded w-20" />
                                                    <div className="h-4 bg-indigo-50/50 rounded-md border border-indigo-100/30 px-1.5 py-0.5 w-10 shrink-0" />
                                                </div>
                                                <div className="h-2 bg-slate-100 rounded w-8" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : sessionFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                        <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mb-6 border-2 border-dashed border-slate-200">
                            <Database size={32} className="text-slate-300" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-900">Workspace Empty</h4>
                        <p className="text-[11px] text-slate-500 mt-2 leading-relaxed max-w-[200px] mx-auto">
                            Import measurements from your vault folders to start analyzing spectra.
                        </p>
                        <button 
                            onClick={onOpenExplorer}
                            className="mt-8 px-6 py-2.5 bg-white border border-slate-200 text-slate-900 text-xs font-bold rounded-2xl shadow-sm hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center gap-2"
                        >
                            <Layers size={14} />
                            Launch Explorer
                        </button>
                    </div>
                ) : groupedData.length === 0 ? (
                    <div className="py-20 text-center text-slate-400 text-xs font-medium italic">No matches found</div>
                ) : (
                    <div className="flex flex-col h-full overflow-hidden">
                        {/* Table Headers */}
                        <div className="flex items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/80 border-b border-slate-200 shrink-0">
                             <div className="w-10 border-r border-slate-200 py-2.5 flex items-center justify-center">
                                 <div className="w-3.5 h-3.5 rounded border border-slate-300 bg-white" />
                             </div>
                             <div className="w-24 border-r border-slate-200 px-3 py-2.5">Code</div>
                             <div className="flex-1 px-3 py-2.5">Name</div>
                             <div className="w-10 border-l border-slate-200 py-2.5"></div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {groupedData.map((group, groupIdx) => (
                                <div
                                    key={group.name}
                                    className={cn(
                                        "flex flex-col",
                                        groupIdx > 0 && "border-t-2 border-indigo-300"
                                    )}
                                >
                                    {/* Sample Header Row */}
                                    <div
                                        className="flex items-center text-[11px] border-b border-slate-100 hover:bg-slate-50/50 group/row cursor-pointer"
                                        onClick={() => toggleSample(group.name)}
                                    >
                                        <div className="w-10 border-r border-slate-100 py-2.5 flex items-center justify-center shrink-0">
                                            <div className="w-3.5 h-3.5 rounded border border-slate-300 bg-white" />
                                        </div>
                                        <div className="w-24 border-r border-slate-100 px-3 py-2.5 font-black text-indigo-600 shrink-0">
                                            {group.sampleCode || group.name}
                                        </div>
                                        <div className="flex-1 px-3 py-2.5 flex items-center gap-2 min-w-0">
                                            <div className="p-0.5 hover:bg-slate-200 rounded transition-colors shrink-0">
                                                {expandedSamples[group.name] !== false ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                            </div>
                                            <span className="font-bold text-slate-700 truncate">{group.displayName || group.name}</span>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    setOverviewPosition({ top: rect.top, left: rect.right + 12 });
                                                    setOpenOverview(prev => prev === group.name ? null : group.name);
                                                }}
                                                className="p-1 text-slate-300 hover:text-indigo-500 opacity-0 group-hover/row:opacity-100 transition-all"
                                            >
                                                <Info size={12} />
                                            </button>

                                            {openOverview === group.name && (
                                                <SampleOverviewPopover group={group} position={overviewPosition} onClose={() => setOpenOverview(null)} />
                                            )}
                                        </div>

                                        <div className="w-10 border-l border-slate-100 py-2.5 shrink-0 text-center text-[9px] font-bold text-slate-300">
                                            {group.files.length}
                                        </div>
                                    </div>

                                    {/* Child File Rows: original + its pipeline children together */}
                                    {expandedSamples[group.name] !== false && group.fileNodes.map((node, nodeIdx) => (
                                        <div
                                            key={node.file.id}
                                            className={cn(nodeIdx > 0 && "border-t border-dashed border-slate-300")}
                                        >
                                            {/* Original file */}
                                            <FileItem
                                                file={node.file}
                                                isSelected={selectedH5 === node.file.h5_relative_path}
                                                isCompared={compareFiles?.some(f => f.id === node.file.id) || false}
                                                onToggleCompare={onToggleCompare}
                                                onSelect={onSelect}
                                                onRemove={onRemove}
                                                onDeleteFile={onDeleteFile}
                                                isNested={true}
                                                isChild={false}
                                                hasChildren={node.children.length > 0}
                                            />
                                            {/* Pipeline children — border-only separation, no background */}
                                            {node.children.map(child => (
                                                <FileItem
                                                    key={child.id}
                                                    file={child}
                                                    isSelected={selectedH5 === child.h5_relative_path}
                                                    isCompared={compareFiles?.some(f => f.id === child.id) || false}
                                                    onToggleCompare={onToggleCompare}
                                                    onSelect={onSelect}
                                                    onRemove={onRemove}
                                                    onDeleteFile={onDeleteFile}
                                                    isNested={true}
                                                    isChild={true}
                                                    hasChildren={false}
                                                />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Saved Sessions Section */}
            {savedWorkspaces.length > 0 && (
                <div className="shrink-0 border-t border-slate-100 bg-slate-50/50">
                    <div className="p-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <History size={14} className="text-slate-400" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saved Sessions</span>
                        </div>
                        <span className="bg-slate-200 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded-md">{savedWorkspaces.length}</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto px-2 pb-4 space-y-1 custom-scrollbar">
                        {savedWorkspaces.slice(0, 8).map((ws) => (
                            <button
                                key={ws.id}
                                onClick={() => onLoadWorkspace?.(ws)}
                                className="w-full flex items-center justify-between p-2.5 hover:bg-white hover:shadow-sm rounded-xl transition-all group border border-transparent hover:border-slate-200"
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className={cn(
                                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                                        ws.settings?.type === 'comparison' ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"
                                    )}>
                                        {ws.settings?.type === 'comparison' ? <Bookmark size={14} /> : <FileText size={14} />}
                                    </div>
                                    <div className="text-left overflow-hidden">
                                        <p className="text-xs font-bold text-slate-700 truncate">{ws.name}</p>
                                        <p className="text-[9px] text-slate-400 font-medium">
                                            {ws.files?.length || 0} files • {new Date(ws.updated_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <ChevronRight size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Sync Status Bar */}
            <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Local Engine Active</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Zap size={10} className="text-yellow-500" />
                    <span className="text-[9px] font-bold text-slate-400">v1.2.0</span>
                </div>
            </div>
        </div>
    );
}

// ─── Filename → parameter chips parser ─────────────────────────────────────
type ChipType = 'analyte' | 'laser' | 'power' | 'objective' | 'time' | 'acc' | 'map' | 'misc';
interface Chip { label: string; type: ChipType; }

function parseFileChips(name: string): { chips: Chip[]; spot: string | null } {
    // Strip .h5 and _preprocessed(_N)? suffix
    let stem = name.replace(/\.h5$/i, '').replace(/_preprocessed(_\d+)?$/, '');

    // Split into tokens
    const raw = stem.split('_').filter(Boolean);

    // Skip leading sample-code token(s): tokens that look like "A12-B2-B1" (letters+digits+hyphen, no units)
    // and skip technique tokens: RAMAN, SERS, TERS, FTIR...
    const TECHNIQUES = new Set(['RAMAN', 'SERS', 'TERS', 'FTIR', 'PL', 'XRD', 'XPS', 'AFM']);
    let i = 0;
    // skip sample code (first token)
    i = 1;
    // skip technique
    if (i < raw.length && TECHNIQUES.has(raw[i].toUpperCase())) i++;

    const paramTokens = raw.slice(i);

    // Extract spot (last token matching SpotN)
    const spotIdx = paramTokens.findLastIndex((t: string) => /^Spot\d+$/i.test(t));
    const spot = spotIdx >= 0 ? paramTokens[spotIdx] : null;
    const tokens = spotIdx >= 0 ? paramTokens.slice(0, spotIdx) : paramTokens;

    const chips: Chip[] = [];
    let usedIndices = new Set<number>();

    tokens.forEach((t: string, idx: number) => {
        if (usedIndices.has(idx)) return;
        if (/^\d+nm$/i.test(t))                                chips.push({ label: t, type: 'laser' });
        else if (/^\d+[µu]W$/i.test(t) || /^\d+mW$/i.test(t)) chips.push({ label: t, type: 'power' });
        else if (/^\d+x$/i.test(t) && parseInt(t) <= 200)     chips.push({ label: t, type: 'objective' });
        else if (/^\d+s$/i.test(t))                            chips.push({ label: t, type: 'time' });
        else if (/^\d+ac$/i.test(t))                           chips.push({ label: t, type: 'acc' });
        else if (/^\d+$/.test(t) && parseInt(t) <= 500)        chips.push({ label: t + 'ac', type: 'acc' });
        else if (/\d+x\d+/i.test(t) || /µm$/i.test(t))   { /* skip map size tokens */ }
        else if (t.length <= 30)                           chips.push({ label: t, type: 'analyte' });
    });

    return { chips, spot };
}

const CHIP_STYLES: Record<ChipType, string> = {
    analyte:   'bg-rose-50   text-rose-700   border border-rose-200',
    laser:     'bg-blue-50   text-blue-700   border border-blue-200',
    power:     'bg-amber-50  text-amber-700  border border-amber-200',
    objective: 'bg-violet-50 text-violet-700 border border-violet-200',
    time:      'bg-emerald-50 text-emerald-700 border border-emerald-200',
    acc:       'bg-slate-100 text-slate-600  border border-slate-200',
    map:       'bg-cyan-50   text-cyan-700   border border-cyan-200',
    misc:      'bg-slate-50  text-slate-500  border border-slate-200',
};

// Subcomponent for cleaner code
function PipelineStepsModal({ name, history, onClose }: { name: string, history: PipelineStep[], onClose: () => void }) {
    const STEP_LABELS: Record<string, string> = {
        crop: 'Crop', despike: 'Despike', baseline: 'Baseline',
        normalize: 'Normalize', smooth: 'Smooth', peak_protection: 'Peak Protection',
    };
    const PARAM_LABELS: Record<string, string> = {
        start: 'Min (cm\u207b\u00b9)', end: 'Max (cm\u207b\u00b9)', window_length: 'Window',
        threshold: 'Threshold', method: 'Method', smoothing_factor: 'Factor',
        order: 'Order', lam: 'Lambda', p: 'Asymmetry p',
        window: 'Window (pts)', iterations: 'Iterations', poly_order: 'Poly Order',
        eta: 'Eta', show_spikes: 'Show Spikes',
    };
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-orange-100">Pipeline Template</div>
                        <div className="text-lg font-black text-white">{name}</div>
                        <div className="text-xs text-orange-100 mt-0.5">{history.length} steps aplicados</div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                        <X size={16} className="text-white" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {history.map((step, i) => (
                        <div key={i} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100">
                                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shadow-sm">{i + 1}</div>
                                <span className="font-bold text-sm uppercase tracking-wider text-slate-700">{STEP_LABELS[step.type] || step.type}</span>
                            </div>
                            {step.params && Object.keys(step.params).length > 0 && (
                                <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
                                    {Object.entries(step.params)
                                        .filter(([k, v]) => v !== null && v !== undefined && v !== '' && k !== 'peak_regions' && k !== 'id')
                                        .map(([k, v]) => (
                                            <div key={k} className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] text-slate-400 font-medium">{PARAM_LABELS[k] || k}</span>
                                                <span className="text-[10px] font-bold text-slate-700">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    ))}
                    {history.length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                            <p className="text-sm">No hay pasos registrados en este pipeline</p>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

function FileItem({ 
    file, isSelected, isCompared, onToggleCompare, onSelect, onRemove, onDeleteFile, 
    isNested = false, isChild = false, hasChildren = false 
}: { 
    file: VaultFile, isSelected: boolean, isCompared?: boolean, 
    onToggleCompare?: (f: VaultFile) => void, 
    onSelect: (f: VaultFile) => void, 
    onRemove: (path: string) => void, 
    onDeleteFile?: (f: VaultFile) => void, 
    isNested?: boolean,
    isChild?: boolean,
    hasChildren?: boolean
}) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [showPipelineInfo, setShowPipelineInfo] = useState(false);

    const pipelineSteps: PipelineStep[] = (() => {
        if (!file.pipeline_history) return [];
        try { return JSON.parse(file.pipeline_history); } catch { return []; }
    })();

    // Parse filename into parameter chips
    const { chips, spot } = parseFileChips(file.name);
    const MAX_CHIPS = 8;
    const visibleChips = chips.slice(0, MAX_CHIPS);
    const hiddenCount = chips.length - MAX_CHIPS;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect(file)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(file); }}
            className={cn(
                "flex items-center text-[11px] border-b border-slate-50 transition-all cursor-pointer group/row min-h-[36px]",
                isSelected ? "bg-indigo-50/50" : "hover:bg-slate-50/80",
                isChild && "bg-slate-50/30"
            )}
        >
            {/* Col 1: Checkbox */}
            <div className="w-10 border-r border-slate-100 py-2 flex items-center justify-center shrink-0">
                <div
                    className={cn(
                        "w-3.5 h-3.5 rounded border flex items-center justify-center transition-all bg-white shadow-sm cursor-pointer",
                        isCompared ? "border-orange-500 text-orange-500 bg-orange-50/30" : "border-slate-300 text-transparent"
                    )}
                    onClick={(e) => { e.stopPropagation(); onToggleCompare?.(file); }}
                >
                    <Check size={10} strokeWidth={4} className={cn(!isCompared && "opacity-0 group-hover/row:opacity-20 text-slate-400")} />
                </div>
            </div>

            {/* Col 2: Tree connector only — no repeated sample code */}
            <div className={cn(
                "border-r border-slate-100 py-2 flex items-center justify-center shrink-0",
                isChild ? "w-8" : "w-6"
            )}>
                <span className={cn(
                    "text-[10px] font-light",
                    isChild ? "text-orange-200 ml-2" : "text-slate-300"
                )}>└</span>
            </div>

            {/* Col 3: Pipeline badge OR parameter chips + spot */}
            <div className={cn(
                "flex-1 px-2 py-1.5 flex items-center gap-1.5 min-w-0 overflow-hidden",
                isChild && "border-l-2 border-orange-100"
            )}>
                {file.pipeline_applied || isPipelineFile(file) ? (
                    // Pipeline file — show its name as a styled badge
                    <>
                        <span className="text-[10px] font-black text-indigo-600 italic truncate">
                            {file.pipeline_name || (file.name.toLowerCase().includes('_rgi') ? 'RGI' : 'Preprocessed')}
                        </span>
                        <div className="relative shrink-0">
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowPipelineInfo(v => !v); }}
                                className="w-4 h-4 rounded bg-orange-100 text-orange-600 flex items-center justify-center hover:bg-orange-200 transition-colors"
                            >
                                <Zap size={8} />
                            </button>
                            {showPipelineInfo && (
                                <PipelineStepsModal
                                    name={file.pipeline_name || 'Processed'}
                                    history={pipelineSteps}
                                    onClose={() => setShowPipelineInfo(false)}
                                />
                            )}
                        </div>
                        {spot && (
                            <span className="ml-auto shrink-0 text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                                {spot}
                            </span>
                        )}
                    </>
                ) : (
                    // Original file — show parameter chips
                    <>
                        <div className="flex items-center gap-1 flex-wrap">
                            {visibleChips.map((chip, i) => (
                                <span
                                    key={i}
                                    className={cn(
                                        "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0",
                                        CHIP_STYLES[chip.type]
                                    )}
                                >
                                    {chip.label}
                                </span>
                            ))}
                            {hiddenCount > 0 && (
                                <span className="text-[9px] font-bold text-slate-400">+{hiddenCount}</span>
                            )}
                        </div>
                        {spot && (
                            <span className="ml-auto shrink-0 text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100">
                                {spot}
                            </span>
                        )}
                        {file.n_spectra > 1 && (
                            <span className="shrink-0 text-[9px] text-slate-400 font-medium">
                                {file.n_spectra} sp.
                            </span>
                        )}
                    </>
                )}
            </div>

            {/* Col 4: Actions */}
            <div className="w-8 border-l border-slate-100 py-2 flex items-center justify-center shrink-0 opacity-0 group-hover/row:opacity-100 transition-all">
                {!confirmDelete ? (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(true);
                        }}
                        className={cn(
                            "p-1 transition-colors",
                            file.pipeline_applied ? "text-slate-300 hover:text-red-500" : "text-slate-300 hover:text-indigo-500"
                        )}
                        title={file.pipeline_applied ? "Eliminar ficha y archivo" : "Quitar del espacio de trabajo"}
                    >
                        {file.pipeline_applied ? <Trash2 size={11} /> : <X size={11} />}
                    </button>
                ) : (
                    <button
                        onMouseLeave={() => setConfirmDelete(false)}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (file.pipeline_applied) {
                                onDeleteFile?.(file);
                            } else {
                                onRemove(file.h5_relative_path);
                            }
                            setConfirmDelete(false);
                        }}
                        className="p-1 text-white bg-red-500 rounded-md shadow-sm active:scale-95 transition-all animate-in fade-in zoom-in duration-200"
                        title="Click para confirmar"
                    >
                        <Check size={10} strokeWidth={4} />
                    </button>
                )}
            </div>
        </div>
    );
}

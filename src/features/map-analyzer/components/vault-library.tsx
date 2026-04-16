'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { 
    RefreshCw, FileText, Database, Map, Search, 
    ChevronDown, ChevronRight, FlaskConical, 
    Calendar, Layers, X, Trash2, Zap, Info, 
    Tag, Beaker, SlidersHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

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

export function VaultLibrary({ 
    vaultRoot, 
    groupId, 
    selectedH5,
    sessionFiles,
    dbSamples = [],
    onSelect,
    onOpenExplorer,
    onRemove 
}: { 
    vaultRoot: string;
    groupId: string;
    selectedH5: string;
    sessionFiles: VaultFile[];
    dbSamples?: any[];
    onSelect: (file: any) => void;
    onOpenExplorer: () => void;
    onRemove: (path: string) => void;
}) {
    const [search, setSearch] = useState('');
    const [expandedSamples, setExpandedSamples] = useState<Record<string, boolean>>({});
    const [openOverview, setOpenOverview] = useState<string | null>(null);
    const [overviewPosition, setOverviewPosition] = useState({ top: 0, left: 0 });

    const toggleSample = (name: string) => {
        setExpandedSamples(prev => ({ ...prev, [name]: !prev[name] }));
    };

    const groupedData = useMemo(() => {
        const filtered = sessionFiles.filter(f => 
            f.name.toLowerCase().includes(search.toLowerCase()) || 
            f.sample_name.toLowerCase().includes(search.toLowerCase())
        );

        const groups = filtered.reduce((acc, file) => {
            const sName = file.sample_name || 'Uncategorized';
            
            if (!acc[sName]) {
                // Find matching sample in Supabase metadata
                const dbMatch = dbSamples.find(s => 
                    s.sample_code === sName || 
                    s.name === sName || 
                    file.name.includes(s.sample_code)
                );

                acc[sName] = { 
                    name: sName, 
                    displayName: dbMatch?.name || sName,
                    sampleCode: dbMatch?.sample_code,
                    composition: dbMatch?.composition || [],
                    description: dbMatch?.description || '',
                    status: dbMatch?.status,
                    attributes: dbMatch?.attributes || {},
                    files: [], 
                    latestDate: file.measured_at || file.created_at || '' 
                };
            }
            acc[sName].files.push(file);
            const fileDate = file.measured_at || file.created_at || '';
            if (fileDate > acc[sName].latestDate) {
                acc[sName].latestDate = fileDate;
            }
            return acc;
        }, {} as Record<string, SampleGroup>);

        return Object.values(groups).sort((a, b) => 
            b.latestDate.localeCompare(a.latestDate)
        );
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
                <button 
                    onClick={onOpenExplorer}
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-lg shadow-indigo-100 active:scale-95 group"
                    title="Import Maps from Vault"
                >
                    <Layers size={16} className="group-hover:scale-110 transition-transform" />
                </button>
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
                {sessionFiles.length === 0 ? (
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
                    <div className="space-y-1">
                        {groupedData.map(group => (
                            <div key={group.name} className="flex flex-col">
                                {/* Sample Header Row */}
                                <div 
                                    className="w-full flex items-center gap-2 p-3 hover:bg-slate-50 rounded-2xl transition-all group border border-transparent hover:border-slate-100 cursor-pointer"
                                    onClick={() => toggleSample(group.name)}
                                >
                                    <div className={cn(
                                        "p-1.5 rounded-lg transition-colors shrink-0",
                                        expandedSamples[group.name] ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                                    )}>
                                        <FlaskConical size={14} />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        {/* Primary: Composition Name */}
                                        <div className="text-xs font-bold text-slate-900 truncate leading-tight">
                                            {group.displayName}
                                        </div>
                                        {/* Secondary: Code badge + file count */}
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {group.sampleCode && (
                                                <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                                                    {group.sampleCode}
                                                </span>
                                            )}
                                            <span className="text-[9px] font-bold text-slate-400">
                                                {group.files.length} map{group.files.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* Info button (Quick Overview) */}
                                    <div className="relative shrink-0">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setOverviewPosition({ top: rect.top, left: rect.right + 12 });
                                                setOpenOverview(prev => prev === group.name ? null : group.name);
                                            }}
                                            className={cn(
                                                "p-1.5 rounded-lg transition-all",
                                                openOverview === group.name
                                                    ? "bg-indigo-100 text-indigo-600"
                                                    : "text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100"
                                            )}
                                            title="Quick Sample Overview"
                                        >
                                            <Info size={13} />
                                        </button>

                                        {/* Overview Popover */}
                                        {openOverview === group.name && (
                                            <SampleOverviewPopover
                                                group={group}
                                                position={overviewPosition}
                                                onClose={() => setOpenOverview(null)}
                                            />
                                        )}
                                    </div>

                                    {/* Expand arrow */}
                                    {expandedSamples[group.name] ? 
                                        <ChevronDown size={14} className="text-slate-400 shrink-0" /> : 
                                        <ChevronRight size={14} className="text-slate-400 shrink-0" />
                                    }
                                </div>

                                {expandedSamples[group.name] && (
                                    <div className="mt-1 mb-2 space-y-0.5 pl-4 ml-4 border-l-2 border-slate-100">
                                        {group.files.map(file => {
                                            const isSelected = selectedH5 === file.h5_relative_path;
                                            const isMap = file.n_spectra > 1;

                                            return (
                                                <div key={file.id} className="relative group pb-0.5">
                                                    <button
                                                        onClick={() => onSelect(file)}
                                                        className={cn(
                                                            "w-full text-left px-4 py-3 rounded-xl flex items-start gap-4 transition-all relative",
                                                            isSelected 
                                                                ? "bg-white border border-indigo-200 shadow-lg shadow-indigo-100/50" 
                                                                : "hover:bg-slate-50 border border-transparent"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "mt-0.5 p-1.5 rounded-lg shrink-0 transition-all",
                                                            isSelected 
                                                                ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" 
                                                                : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-600"
                                                        )}>
                                                            {isMap ? <Map size={13} /> : <FileText size={13} />}
                                                        </div>
                                                        <div className="flex-1 min-w-0 pr-6">
                                                            <div className={cn(
                                                                "text-xs font-bold tracking-tight mb-1 truncate",
                                                                isSelected ? "text-indigo-900" : "text-slate-600 group-hover:text-slate-900"
                                                            )}>
                                                                {file.name}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={cn(
                                                                    "text-[9px] font-extrabold px-1 rounded",
                                                                    isSelected ? "bg-indigo-50 text-indigo-500" : "bg-slate-100 text-slate-500"
                                                                )}>
                                                                    {file.technique}
                                                                </span>
                                                                {isMap && <span className="text-[9px] font-medium text-slate-400">{file.map_width}x{file.map_height}</span>}
                                                            </div>
                                                        </div>
                                                    </button>
                                                    
                                                    {/* Remove Button */}
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onRemove(file.h5_relative_path);
                                                        }}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-50"
                                                        title="Remove from Workspace"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
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

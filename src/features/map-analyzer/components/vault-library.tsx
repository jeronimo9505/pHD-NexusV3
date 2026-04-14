'use client';

import { useEffect, useState, useMemo } from 'react';
import { 
    RefreshCw, FileText, Database, Map, Search, 
    ChevronDown, ChevronRight, FlaskConical, 
    Calendar, Layers, X, Trash2, Zap
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
    latestDate: string;
    files: VaultFile[];
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
                    displayName: dbMatch ? dbMatch.name : sName,
                    sampleCode: dbMatch?.sample_code,
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
                                <button 
                                    onClick={() => toggleSample(group.name)}
                                    className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-2xl transition-all group border border-transparent hover:border-slate-100"
                                >
                                    <div className={cn(
                                        "p-1.5 rounded-lg transition-colors",
                                        expandedSamples[group.name] ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                                    )}>
                                        <FlaskConical size={14} />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="text-xs font-bold text-slate-900 truncate">
                                            {group.displayName}
                                        </div>
                                        {group.sampleCode && (
                                            <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-tighter">
                                                {group.sampleCode}
                                            </div>
                                        )}
                                    </div>
                                    {expandedSamples[group.name] ? 
                                        <ChevronDown size={14} className="text-slate-400" /> : 
                                        <ChevronRight size={14} className="text-slate-400" />
                                    }
                                </button>

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

'use client';

import { useEffect, useState } from 'react';
import { fetchVaultFiles } from '@/lib/desktop';
import { RefreshCw, FileText, Database, Map, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function VaultLibrary({ 
    vaultRoot, 
    groupId, 
    selectedH5,
    onSelect 
}: { 
    vaultRoot: string;
    groupId: string;
    selectedH5: string;
    onSelect: (file: any) => void;
}) {
    const [files, setFiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    const loadFiles = async () => {
        setLoading(true);
        try {
            const res = await fetchVaultFiles(vaultRoot, groupId);
            if (res.success) {
                setFiles(res.files);
            }
        } catch (err: any) {
            toast.error(err.message || 'Failed to list vault files');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFiles();
    }, [vaultRoot, groupId]);

    const filtered = files.filter(f => 
        f.name.toLowerCase().includes(search.toLowerCase()) || 
        f.sample_name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-slate-200">
                    <Database size={16} className="text-purple-400" />
                    Data Vault
                </h3>
                <button 
                    onClick={loadFiles} 
                    disabled={loading}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>
            <div className="p-3 border-b border-slate-800/60">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search maps..." 
                        className="w-full bg-slate-800 text-sm text-slate-300 placeholder:text-slate-500 rounded-md py-1.5 pl-9 pr-3 outline-none focus:ring-1 focus:ring-purple-500 transition-all border border-slate-700/50"
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {filtered.length === 0 && !loading && (
                    <div className="text-center text-xs text-slate-500 mt-10">No maps found.</div>
                )}
                {filtered.map(f => {
                    const isSelected = selectedH5 === f.h5_relative_path;
                    const isMap = f.n_spectra > 1;
                    return (
                        <button
                            key={f.id}
                            onClick={() => onSelect(f)}
                            className={cn(
                                "w-full text-left p-2 rounded-lg flex items-start gap-3 transition-colors group",
                                isSelected ? "bg-purple-500/20 shadow-inner" : "hover:bg-slate-800/80"
                            )}
                        >
                            <div className={cn(
                                "p-2 rounded-md shrink-0 transition-colors",
                                isSelected ? "bg-purple-500" : "bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-300"
                            )}>
                                {isMap ? <Map size={16} /> : <FileText size={16} />}
                            </div>
                            <div className="flex-1 min-w-0" title={f.h5_relative_path}>
                                <div className={cn(
                                    "text-sm font-medium truncate",
                                    isSelected ? "text-purple-300" : "text-slate-300"
                                )}>
                                    {f.name}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                                    <span className="bg-slate-800 px-1 rounded border border-slate-700">{f.technique}</span>
                                    {isMap ? (
                                        <span>Map: {f.map_width && f.map_height ? `${f.map_width}x${f.map_height}` : `${f.n_spectra} px`}</span>
                                    ) : (
                                        <span>1 Spectrum</span>
                                    )}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

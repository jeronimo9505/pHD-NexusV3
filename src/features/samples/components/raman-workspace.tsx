'use client';

import { useState, useMemo, useEffect } from 'react';
import { Sample, SampleCharacterization } from '../types';
import { MultiSpectrumGraph } from './multi-spectrum-graph';
import { Search, Loader2, ListFilter, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface RamanWorkspaceProps {
    samples: Sample[];
    driveSettings?: { clientId?: string; apiKey?: string; folderId?: string; sampleFolderId?: string };
}

export function RamanWorkspace({ samples, driveSettings }: RamanWorkspaceProps) {
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // 1. Extract all Raman characterizations that have spectral data
    const ramanData = useMemo(() => {
        const specs: { sample: Sample; char: SampleCharacterization }[] = [];
        samples.forEach(s => {
            const chars = s.characterizations || [];
            chars.forEach(c => {
                if (c.type === 'Raman' && c.data.raman_spectrum_file_id) {
                    specs.push({ sample: s, char: c });
                }
            });
        });
        // Sort by date descending
        return specs.sort((a, b) => new Date(b.char.created_at).getTime() - new Date(a.char.created_at).getTime());
    }, [samples]);

    // 2. Filter 
    const filteredData = useMemo(() => {
        if (!search.trim()) return ramanData;
        const q = search.toLowerCase();
        return ramanData.filter(({ sample, char }) => {
            const compositionString = sample.composition ? sample.composition.map(c => c.value).join(' ') : '';
            const charDataString = Object.values(char.data || {}).join(' ');

            return (
                sample.sample_code?.toLowerCase().includes(q) ||
                sample.display_id?.toLowerCase().includes(q) ||
                sample.name?.toLowerCase().includes(q) ||
                compositionString.toLowerCase().includes(q) ||
                charDataString.toLowerCase().includes(q)
            );
        });
    }, [ramanData, search]);

    // Handlers
    const toggleSelect = (charId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(charId)) next.delete(charId);
            else next.add(charId);
            return next;
        });
    };

    const clearSelection = () => setSelectedIds(new Set());

    const selectAll = () => {
        const allIds = filteredData.map(d => d.char.id);
        setSelectedIds(new Set(allIds));
    };

    // Helper for abbreviations
    const getAbbr = (data: any) => {
        const parts = [];
        if (data.laser_wavelength) parts.push(`${data.laser_wavelength}nm`);
        if (data.laser_power) parts.push(`${data.laser_power}`);
        if (data.analyte) parts.push(data.analyte);
        return parts.join(' | ');
    }

    return (
        <div className="flex h-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            {/* LEFT PANEL: Selection */}
            <div className="w-80 flex flex-col border-r border-slate-200 bg-slate-50 relative shrink-0">
                <div className="p-4 border-b border-slate-200 bg-white">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-3">
                        <Activity size={16} className="text-purple-600" /> Spectra Explorer
                    </h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Filter spectra..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 bg-slate-50"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                    {filteredData.length === 0 ? (
                        <div className="text-center p-6 text-slate-400 text-xs italic">
                            No Raman spectra found.
                        </div>
                    ) : (
                        filteredData.map(({ sample, char }) => {
                            const isSelected = selectedIds.has(char.id);
                            return (
                                <div
                                    key={char.id}
                                    onClick={() => toggleSelect(char.id)}
                                    className={cn(
                                        "p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm text-left group flex gap-3",
                                        isSelected
                                            ? "bg-purple-50 border-purple-300 ring-1 ring-purple-200"
                                            : "bg-white border-slate-200 hover:border-purple-300"
                                    )}
                                >
                                    <div className="flex items-center">
                                        <div className={cn(
                                            "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                                            isSelected ? "bg-purple-600 border-purple-600" : "border-slate-300 group-hover:border-purple-400"
                                        )}>
                                            {isSelected && <svg viewBox="0 0 14 14" fill="none" className="w-3 h-3 text-white"><path d="M3 8L6 11L11 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                        </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className="font-bold text-slate-800 text-xs truncate" title={sample.sample_code || sample.display_id}>
                                                {sample.sample_code || sample.display_id}
                                            </span>
                                            {char.performed_at && (
                                                <span className="text-[10px] text-slate-400 shrink-0">
                                                    {format(new Date(char.performed_at), 'dd/MM/yy')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-medium truncate mb-0.5" title={sample.name}>
                                            {sample.name}
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {getAbbr(char.data) && (
                                                <span className="text-[9px] inline-flex items-center px-1.5 py-0.5 rounded-sm bg-purple-100 text-purple-700 font-medium">
                                                    {getAbbr(char.data)}
                                                </span>
                                            )}
                                            {char.data.equipment && (
                                                <span className="text-[9px] inline-flex items-center px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600">
                                                    {char.data.equipment}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Selection Status */}
                <div className="p-3 bg-white border-t border-slate-200 text-xs flex items-center justify-between z-10">
                    {selectedIds.size > 0 ? (
                        <span className="font-medium text-purple-600">{selectedIds.size} selected</span>
                    ) : (
                        <span className="text-slate-400">{filteredData.length} available</span>
                    )}
                    <div className="flex gap-3">
                        {filteredData.length > 0 && selectedIds.size < filteredData.length && (
                            <button onClick={selectAll} className="text-slate-500 hover:text-purple-600 font-medium">
                                Select All
                            </button>
                        )}
                        {selectedIds.size > 0 && (
                            <button onClick={clearSelection} className="text-slate-500 hover:text-red-600 font-medium">
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL: Graph */}
            <div className="flex-1 bg-white relative flex flex-col">
                {selectedIds.size === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-slate-50">
                        <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                            <Activity size={32} className="text-slate-300" />
                        </div>
                        <h4 className="text-lg font-medium text-slate-600 mb-2">Select spectra to compare</h4>
                        <p className="text-sm max-w-sm">Choose one or more Raman measurements from the sidebar to visualize and compare them here.</p>
                    </div>
                ) : (
                    <div className="flex-1 p-4 flex flex-col">
                        <MultiSpectrumGraph
                            selectedConfigs={Array.from(selectedIds).map(id => {
                                const entry = ramanData.find(d => d.char.id === id);
                                const abbr = getAbbr(entry!.char.data);
                                const code = entry!.sample.sample_code || entry!.sample.display_id;
                                return {
                                    fileId: entry!.char.data.raman_spectrum_file_id,
                                    label: entry!.sample.name || code,
                                    subLabel: `${code}${abbr ? ` - ${abbr}` : ''}`,
                                    charId: id
                                };
                            })}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

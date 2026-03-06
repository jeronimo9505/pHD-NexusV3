'use client';

import { useState, useMemo } from 'react';
import { Sample, SampleCharacterization } from '../types';
import { Search, Filter, Calendar, ExternalLink, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '../utils';

interface CharacterizationSearchProps {
    samples: Sample[];
    onSelectSample: (sample: Sample, charId?: string) => void;
}

export function CharacterizationSearch({ samples, onSelectSample }: CharacterizationSearchProps) {
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');

    const flatChars = useMemo(() => {
        const chars: any[] = [];
        samples.forEach(s => {
            (s.characterizations || []).forEach(c => {
                chars.push({
                    ...c,
                    sample_code: s.sample_code,
                    sample_name: s.name,
                    sample_id: s.id,
                    sample_full: s
                });
            });
        });
        return chars.sort((a, b) => new Date(b.performed_at || b.created_at).getTime() - new Date(a.performed_at || a.created_at).getTime());
    }, [samples]);

    const types = useMemo(() => {
        const t = new Set<string>();
        flatChars.forEach(c => t.add(c.type));
        return Array.from(t).sort();
    }, [flatChars]);

    const filtered = useMemo(() => {
        const searchLower = search.toLowerCase();
        return flatChars.filter(c => {
            const matchesType = typeFilter === 'all' || c.type === typeFilter;
            const matchesSearch = !search || (
                c.type.toLowerCase().includes(searchLower) ||
                c.sample_code?.toLowerCase().includes(searchLower) ||
                c.sample_name?.toLowerCase().includes(searchLower) ||
                JSON.stringify(c.data).toLowerCase().includes(searchLower)
            );
            return matchesType && matchesSearch;
        });
    }, [flatChars, search, typeFilter]);

    const getSummary = (data: any) => {
        const ignore = new Set(['equipment', 'notes', '__order__', 'file_origin', 'drive_file_link', '__bulk_id__']);
        const entries = Object.entries(data)
            .filter(([k, v]) => !ignore.has(k) && v)
            .map(([k, v]) => {
                if (typeof v === 'object' && v !== null && 'value' in v) {
                    return `${k}: ${(v as any).value}${(v as any).unit || ''}`;
                }
                return `${k}: ${v}`;
            });
        return entries.slice(0, 3).join(' | ') + (entries.length > 3 ? '...' : '');
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/30">
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search measurements, types, samples..."
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Filter size={14} className="text-slate-400" />
                    <select
                        value={typeFilter}
                        onChange={e => setTypeFilter(e.target.value)}
                        className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                        <option value="all">All Types</option>
                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>

                <div className="ml-auto text-xs text-slate-400 font-medium">
                    Found {filtered.length} measurements
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-1 gap-3">
                    {filtered.map((char) => (
                        <div
                            key={char.id}
                            className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all cursor-pointer group"
                            onClick={() => onSelectSample(char.sample_full, char.id)}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                                            {char.type}
                                        </span>
                                        <span className="text-slate-400 text-xs">•</span>
                                        <span className="text-slate-900 font-semibold text-sm group-hover:text-blue-600 transition-colors">
                                            {char.sample_code}
                                        </span>
                                        <span className="text-slate-400 text-xs">—</span>
                                        <span className="text-slate-500 text-xs truncate max-w-[200px]">
                                            {char.sample_name}
                                        </span>
                                    </div>

                                    <div className="text-slate-600 text-xs font-medium bg-slate-50 p-2 rounded-lg border border-slate-100">
                                        {getSummary(char.data) || <span className="text-slate-300 italic">No details available</span>}
                                    </div>

                                    {char.data.notes && (
                                        <div className="mt-2 flex items-start gap-1.5 text-slate-400 italic text-[11px]">
                                            <span className="mt-0.5"><FlaskConical size={12} /></span>
                                            <p className="line-clamp-1">{char.data.notes}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col items-end gap-2 text-right shrink-0">
                                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                                        <Calendar size={12} />
                                        {formatDate(char.performed_at || char.created_at)}
                                    </div>
                                    <button className="text-blue-600 hover:text-blue-700 text-xs font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        View Details <ExternalLink size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {filtered.length === 0 && (
                        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
                            <Search className="mx-auto text-slate-200 mb-4" size={48} />
                            <h3 className="text-slate-900 font-medium">No results found</h3>
                            <p className="text-slate-500 text-sm">Try adjusting your search or filters</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

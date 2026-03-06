'use client';

import React, { useMemo } from 'react';
import { Sample } from '../types';
import { Calendar, ChevronRight, Hash, FlaskConical, ExternalLink, ClipboardList, Activity } from 'lucide-react';
import { formatDate } from '../utils';
import { cn } from '@/lib/utils';

interface CharacterizationSearchProps {
    samples: Sample[];
    search: string;
    typeFilter: string;
    onSelectSample: (sample: Sample, charId?: string) => void;
}

export function CharacterizationSearch({ samples, search, typeFilter, onSelectSample }: CharacterizationSearchProps) {
    // Summary generator for high density
    const getSentenceSummary = (data: any) => {
        const priority = ['analyte', 'laser', 'power', 'objective', 'acquisition_time', 'accumulation', 'acc'];
        const ignore = new Set(['equipment', 'notes', '__order__', 'file_origin', 'drive_file_link', '__bulk_id__', 'manual_date']);

        const parts: string[] = [];

        // Add priority items first
        priority.forEach(key => {
            const val = data[key];
            if (val !== undefined && val !== null && val !== '') {
                if (typeof val === 'object' && 'value' in val) {
                    parts.push(`${(val as any).value}${(val as any).unit || ''}`);
                } else {
                    parts.push(String(val));
                }
            }
        });

        // Add other items
        Object.entries(data).forEach(([key, val]) => {
            if (!priority.includes(key) && !ignore.has(key) && val) {
                if (typeof val === 'object' && 'value' in val && (val as any).value) {
                    parts.push(`${key}: ${(val as any).value}${(val as any).unit || ''}`);
                } else if (typeof val !== 'object') {
                    parts.push(`${key}: ${val}`);
                }
            }
        });

        return parts.join(' - ');
    };

    // Grouping and Filtering (Simplified to avoid duplicates and fix grouping bug)
    const groupedChars = useMemo(() => {
        const searchLower = search.toLowerCase();
        const groupMap = new Map<string, { sample: Sample; measurements: any[] }>();

        samples.forEach(s => {
            const charList = s.characterizations || [];
            const matches = charList.filter(c => {
                const matchesType = typeFilter === 'all' || c.type === typeFilter;
                const summary = getSentenceSummary(c.data);

                const matchesSearch = !search || (
                    c.type.toLowerCase().includes(searchLower) ||
                    s.sample_code?.toLowerCase().includes(searchLower) ||
                    s.name?.toLowerCase().includes(searchLower) ||
                    summary.toLowerCase().includes(searchLower)
                );

                return matchesType && matchesSearch;
            });

            if (matches.length > 0) {
                groupMap.set(s.id, {
                    sample: s,
                    measurements: matches.map(m => ({
                        ...m,
                        sentence_summary: getSentenceSummary(m.data)
                    }))
                });
            }
        });

        // Convert Map back to sorted array by latest measurement
        return Array.from(groupMap.values()).sort((a: any, b: any) => {
            const latestA = Math.max(...a.measurements.map((m: any) => new Date(m.performed_at || m.created_at).getTime()));
            const latestB = Math.max(...b.measurements.map((m: any) => new Date(m.performed_at || m.created_at).getTime()));
            return latestB - latestA;
        });
    }, [samples, search, typeFilter]);

    return (
        <div className="flex flex-col h-full bg-slate-50/30">
            {/* Compact Table */}
            <div className="flex-1 overflow-auto p-6 pt-2">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full border-collapse text-xs">
                        <thead className="bg-slate-50/80 sticky top-0 z-10 border-b border-slate-200">
                            <tr className="text-slate-400 text-[10px] uppercase font-bold text-left">
                                <th className="px-4 py-3 w-[100px]">Técnica</th>
                                <th className="px-4 py-3 w-[120px]">Fecha</th>
                                <th className="px-4 py-3">Resumen de Medición</th>
                                <th className="px-4 py-3 w-[140px]">Instrumento</th>
                                <th className="px-4 py-3 w-[40px]"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {groupedChars.map((group: any) => (
                                <React.Fragment key={group.sample.id}>
                                    {/* Group Header Row */}
                                    <tr className="bg-slate-50/40">
                                        <td colSpan={5} className="px-4 py-1.5 border-y border-slate-100/80">
                                            <div className="flex items-center gap-3">
                                                <div className="h-5 w-5 rounded bg-blue-600 flex items-center justify-center text-white text-[9px] shadow-sm">
                                                    <Hash size={12} />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => onSelectSample(group.sample)}
                                                        className="font-bold text-slate-900 text-[13px] hover:text-blue-600 hover:underline transition-colors"
                                                    >
                                                        {group.sample.sample_code}
                                                    </button>
                                                    <span className="text-slate-300">|</span>
                                                    <span className="font-semibold text-slate-600 truncate max-w-[500px] text-[12px]">{group.sample.name}</span>
                                                    {group.sample.composition?.length > 0 && (
                                                        <div className="flex items-center gap-1 ml-2">
                                                            {group.sample.composition.map((c: any) => (
                                                                <span key={c.code} className="text-[8px] bg-emerald-50 text-emerald-700 px-1 py-0.5 border border-emerald-100 rounded font-mono">
                                                                    {c.code}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => onSelectSample(group.sample)}
                                                    className="ml-auto text-slate-400 hover:text-blue-600 p-1 hover:bg-white rounded transition-all shadow-sm border border-transparent hover:border-slate-200"
                                                    title="Ver detalles de muestra"
                                                >
                                                    <ExternalLink size={12} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {/* Measurement Rows */}
                                    {group.measurements.map((char: any) => (
                                        <tr
                                            key={char.id}
                                            onClick={() => onSelectSample(group.sample, char.id)}
                                            className="hover:bg-blue-50/40 cursor-pointer group transition-colors"
                                        >
                                            <td className="px-4 py-1.5 font-bold">
                                                <span className={cn(
                                                    "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1",
                                                    char.type === 'Raman' ? "bg-purple-100 text-purple-700 border border-purple-200" : "bg-slate-100 text-slate-600 border border-slate-200"
                                                )}>
                                                    {char.type}
                                                    {char.data.raman_spectrum_file_id && <Activity size={10} className="text-purple-500 animate-pulse" />}
                                                </span>
                                            </td>
                                            <td className="px-4 py-1.5 text-slate-500 font-medium">
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={12} className="text-slate-300" />
                                                    {formatDate(char.performed_at || char.created_at)}
                                                </div>
                                            </td>
                                            <td className="px-4 py-1.5">
                                                <div className="text-slate-700 font-semibold text-[12px] group-hover:text-blue-700 transition-colors">
                                                    {char.sentence_summary}
                                                </div>
                                                {char.data.notes && (
                                                    <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-slate-400 italic">
                                                        <FlaskConical size={10} className="text-amber-500/60" />
                                                        <span className="truncate max-w-[600px]">{char.data.notes}</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-1.5 text-slate-500 italic font-medium">
                                                {char.equipment || '-'}
                                            </td>
                                            <td className="px-4 py-1.5 text-right">
                                                <div className="p-0.5 rounded-md group-hover:bg-blue-100/50 group-hover:text-blue-600 text-slate-200 transition-all inline-block">
                                                    <ChevronRight size={16} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>

                    {groupedChars.length === 0 && (
                        <div className="py-40 text-center bg-white">
                            <div className="bg-slate-50 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                                <FlaskConical className="text-slate-200" size={32} />
                            </div>
                            <h3 className="text-slate-900 font-bold text-lg">Sin resultados</h3>
                            <p className="text-slate-500 text-sm max-w-xs mx-auto">No encontramos mediciones que coincidan con los criterios actuales.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

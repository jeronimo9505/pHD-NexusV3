'use client';

import { useState, useEffect } from 'react';
import { Sample, SampleFieldConfig, SampleCharacterization } from '../types';
import { getCharacterizationsAction, deleteCharacterizationAction, updateSampleAction, updateCharacterizationAction, createCharacterizationAction, getBulkSamplesAction } from '../actions';
import { X, Calendar, User, FlaskConical, FileText, Plus, ExternalLink, Microscope, Settings, Edit, MessageSquareText, Trash2, Pencil, Check, StickyNote, ArrowLeft, Edit2, ChevronDown, ChevronUp, Loader2, Save, History, Clock, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatCellValue } from '../utils';
import { CharacterizationModal } from './characterization-modal';
import { format } from 'date-fns';
import { SampleCommentsSection } from './sample-comments-section';

interface SampleDetailSheetProps {
    sample: Sample | null;
    groupId: string;
    fields: SampleFieldConfig[];
    onClose: () => void;
    parameterUnits: Record<string, string[]>;
    setParameterUnits: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
    lastUnits: Record<string, string>;
    setLastUnits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    parameterOrder: Record<string, string[]>;
    setParameterOrder: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
    driveSettings?: { clientId?: string; apiKey?: string; folderId?: string; sampleFolderId?: string };
    initialCharId?: string;
    allSamples?: (Sample & { level: number })[];
    onSelectSample?: (sample: Sample) => void;
}

export function SampleDetailSheet({
    sample, groupId, fields, onClose,
    parameterUnits, setParameterUnits, lastUnits, setLastUnits,
    parameterOrder, setParameterOrder, driveSettings, initialCharId,
    allSamples = [], onSelectSample
}: SampleDetailSheetProps) {
    const [activeTab, setActiveTab] = useState<'overview' | 'characterization'>('overview');
    const [characterizations, setCharacterizations] = useState<SampleCharacterization[]>([]);
    const [isLoadingChars, setIsLoadingChars] = useState(false);
    const [isCharModalOpen, setIsCharModalOpen] = useState(false);
    const [selectedChar, setSelectedChar] = useState<SampleCharacterization | null>(null);

    // Expanded detail panel state
    const [expandedChar, setExpandedChar] = useState<SampleCharacterization | null>(null);
    const [charNotes, setCharNotes] = useState('');
    const [isSavingCharNotes, setIsSavingCharNotes] = useState(false);

    // Inline Editing State (overview tab)
    const [editingSection, setEditingSection] = useState<'description' | number | null>(null);
    const [editValue, setEditValue] = useState('');
    // Quick Navigation Sidebar State
    const [showNav, setShowNav] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Bulk Characterization State
    const [bulkSamples, setBulkSamples] = useState<{ id: string, sample_code: string, name: string }[]>([]);
    const [isLoadingBulk, setIsLoadingBulk] = useState(false);


    useEffect(() => {
        if (sample && activeTab === 'characterization') loadCharacterizations();
    }, [sample, activeTab]);

    // Reset expanded detail when switching samples
    useEffect(() => {
        setExpandedChar(null);
    }, [sample?.id]);

    // Auto-expand if initialCharId is provided
    useEffect(() => {
        if (initialCharId) {
            setActiveTab('characterization');
        }
    }, [initialCharId]);

    useEffect(() => {
        if (initialCharId && characterizations.length > 0 && activeTab === 'characterization') {
            const char = characterizations.find(c => c.id === initialCharId);
            if (char) setExpandedChar(char);
        }
    }, [initialCharId, characterizations, activeTab]);

    useEffect(() => {
        setCharNotes(expandedChar?.data?.notes || '');

        // Fetch bulk samples if part of a bulk operation
        const bulkId = expandedChar?.data?.__bulk_id__;
        if (bulkId) {
            loadBulkSamples(bulkId);
        } else {
            setBulkSamples([]);
        }
    }, [expandedChar]);

    const loadBulkSamples = async (bulkId: string) => {
        setIsLoadingBulk(true);
        const res = await getBulkSamplesAction(bulkId);
        if (res.error) console.error(res.error);
        else setBulkSamples(res.data || []);
        setIsLoadingBulk(false);
    };


    const loadCharacterizations = async () => {
        if (!sample) return;
        setIsLoadingChars(true);
        const res = await getCharacterizationsAction(sample.id);
        if (res.error) toast.error(res.error);
        else {
            const data = (res.data || []) as unknown as SampleCharacterization[];
            setCharacterizations(data);
            if (expandedChar) {
                const updated = data.find(c => c.id === expandedChar.id);
                if (updated) setExpandedChar(updated); else setExpandedChar(null);
            }
        }
        setIsLoadingChars(false);
    };

    const startEdit = (section: 'description' | number, currentValue: string) => {
        setEditingSection(section);
        setEditValue(currentValue || '');
    };

    const saveDescription = async () => {
        if (!sample) return;
        setIsSaving(true);
        const res = await updateSampleAction({ id: sample.id, description: editValue }, groupId);
        setIsSaving(false);
        if (res.error) toast.error(res.error);
        else { toast.success('Description updated'); setEditingSection(null); }
    };

    const saveCompositionNote = async (index: number) => {
        if (!sample) return;
        setIsSaving(true);
        const newComposition = [...sample.composition];
        newComposition[index] = { ...newComposition[index], notes: editValue };
        const res = await updateSampleAction({ id: sample.id, composition: newComposition }, groupId);
        setIsSaving(false);
        if (res.error) toast.error(res.error);
        else { toast.success('Note updated'); setEditingSection(null); }
    };

    const getSummaryString = (char: SampleCharacterization) => {
        const { type, data } = char;
        const ignoreKeys = new Set(['equipment', 'notes', '__order__', 'file_origin', 'drive_file_link']);
        let keys: string[] = [];
        if (data.__order__ && Array.isArray(data.__order__)) {
            keys = data.__order__;
        } else if (parameterOrder && parameterOrder[type]) {
            keys = parameterOrder[type].filter(k => data[k] !== undefined);
            const remaining = Object.keys(data).filter(k => !keys.includes(k) && !ignoreKeys.has(k));
            keys = [...keys, ...remaining];
        } else {
            keys = Object.keys(data).filter(k => !ignoreKeys.has(k));
        }
        return keys.filter(key => !ignoreKeys.has(key) && data[key]).map(key => String(data[key])).join(' - ') || '';
    };

    const getParameterRows = (char: SampleCharacterization) => {
        const { type, data } = char;
        const ignoreKeys = new Set(['equipment', 'notes', '__order__', 'file_origin', 'drive_file_link']);
        let keys: string[] = [];
        if (data.__order__ && Array.isArray(data.__order__)) {
            keys = data.__order__;
        } else if (parameterOrder && parameterOrder[type]) {
            keys = parameterOrder[type].filter(k => data[k] !== undefined);
            const remaining = Object.keys(data).filter(k => !keys.includes(k) && !ignoreKeys.has(k));
            keys = [...keys, ...remaining];
        } else {
            keys = Object.keys(data).filter(k => !ignoreKeys.has(k));
        }
        return keys.filter(k => !ignoreKeys.has(k)).map(key => {
            const raw = data[key];
            if (raw && typeof raw === 'object' && 'value' in raw) {
                return { name: key, value: raw.value ?? '', unit: raw.unit ?? '' };
            }
            return { name: key, value: String(raw ?? ''), unit: '' };
        });
    };

    const handleEditChar = (char: SampleCharacterization) => {
        setSelectedChar(char);
        setIsCharModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsCharModalOpen(false);
        setSelectedChar(null);
        loadCharacterizations();
    };

    const handleDeleteChar = async (charId: string) => {
        if (!confirm('Are you sure you want to delete this record?')) return;
        setIsLoadingChars(true);
        const res = await deleteCharacterizationAction(charId, groupId);
        if (res.error) toast.error(res.error);
        else { toast.success('Record deleted'); if (expandedChar?.id === charId) setExpandedChar(null); loadCharacterizations(); }
        setIsLoadingChars(false);
    };

    const handleExpandChar = (char: SampleCharacterization) => {
        if (expandedChar?.id === char.id) setExpandedChar(null);
        else setExpandedChar(char);
    };

    const saveCharNotes = async () => {
        if (!expandedChar) return;
        setIsSavingCharNotes(true);
        const updatedData = { ...expandedChar.data, notes: charNotes };
        const res = await updateCharacterizationAction({ id: expandedChar.id, group_id: groupId, data: updatedData });
        setIsSavingCharNotes(false);
        if (res.error) toast.error(res.error);
        else {
            toast.success('Notes saved');
            setExpandedChar({ ...expandedChar, data: updatedData });
            setCharacterizations(prev => prev.map(c => c.id === expandedChar.id ? { ...c, data: updatedData } : c));
        }
    };

    if (!sample) return null;

    const isExpanded = !!expandedChar && activeTab === 'characterization';

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="absolute inset-0" onClick={onClose} />

            {/* ──── LEFT: Detail Panel (expanded characterization) ──── */}
            {isExpanded && (
                <div
                    className="relative w-full max-w-lg bg-white shadow-2xl h-full flex flex-col border-r border-slate-200 animate-in slide-in-from-right-4 duration-300"
                    onClick={(e) => e.stopPropagation()}
                >
                    {(() => {
                        const params = getParameterRows(expandedChar!);
                        const notesChanged = charNotes !== (expandedChar!.data?.notes || '');
                        return (
                            <>
                                {/* Detail Header */}
                                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex flex-col gap-2">
                                            <button
                                                onClick={() => setExpandedChar(null)}
                                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                                            >
                                                <ArrowLeft size={14} /> Close Detail
                                            </button>

                                            {expandedChar!.data.__bulk_id__ && (
                                                <div className="animate-in fade-in slide-in-from-top-1 duration-300">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                                        <History size={10} className="text-blue-400" /> Characterized together with:
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {isLoadingBulk ? (
                                                            <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-100 animate-pulse">
                                                                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
                                                                <div className="w-12 h-2 bg-slate-200 rounded" />
                                                            </div>
                                                        ) : bulkSamples.filter(s => s.id !== sample.id).length > 0 ? (
                                                            bulkSamples.filter(s => s.id !== sample.id).map(s => (
                                                                <div
                                                                    key={s.id}
                                                                    onClick={() => onSelectSample?.(s as any)}
                                                                    className="group flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 cursor-pointer transition-all shadow-sm group/tag"
                                                                    title={`${s.sample_code}: ${s.name}`}
                                                                >
                                                                    <span className="text-[11px] font-bold truncate max-w-[120px]">{s.name}</span>
                                                                    <span className="text-[9px] opacity-60 font-mono tracking-tighter group-hover/tag:text-blue-100 transition-colors shrink-0">{s.sample_code}</span>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <span className="text-[10px] text-slate-400 italic">No other samples in this batch.</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleEditChar(expandedChar!)}
                                            className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors shadow-sm self-start"
                                        >
                                            <Edit size={12} /> Edit Record
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                            expandedChar!.type === 'Raman' ? "bg-purple-100 text-purple-700" :
                                                expandedChar!.type === 'AFM' ? "bg-blue-100 text-blue-700" :
                                                    "bg-slate-100 text-slate-600"
                                        )}>
                                            {expandedChar!.type}
                                        </span>
                                        {expandedChar!.data.equipment && (
                                            <span className="text-sm text-slate-700 font-medium">{expandedChar!.data.equipment}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                        <Calendar size={11} />
                                        <span>{new Date(expandedChar!.created_at).toLocaleString()}</span>
                                    </div>
                                </div>

                                {/* Scrollable Content */}
                                <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-slate-200">
                                    {/* Data Points Table */}
                                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 mb-6">
                                        <h3 className="text-xs font-bold text-slate-800 uppercase mb-2 flex items-center gap-2">
                                            <Microscope size={14} className="text-purple-500" />
                                            {expandedChar.type}
                                        </h3>
                                        {expandedChar.data.equipment && (
                                            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                                                <span className="font-medium">Equipment:</span>
                                                <span>{expandedChar.data.equipment}</span>
                                            </div>
                                        )}
                                        {expandedChar.performed_at && (
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <Calendar size={12} className="text-slate-400" />
                                                <span className="font-medium">Date:</span>
                                                <span>{format(new Date(expandedChar.performed_at), 'PPPP')}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                            <Microscope size={12} className="text-purple-500" /> Data Points
                                        </h4>
                                        {params.length > 0 ? (
                                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="bg-slate-50 text-slate-500 font-medium">
                                                            <th className="px-3 py-2 text-left border-b border-r border-slate-200 w-8">#</th>
                                                            <th className="px-3 py-2 text-left border-b border-r border-slate-200">Parameter</th>
                                                            <th className="px-3 py-2 text-left border-b border-r border-slate-200">Value</th>
                                                            <th className="px-3 py-2 text-left border-b border-slate-200 w-16">Unit</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {params.map((p, i) => (
                                                            <tr key={i} className="hover:bg-slate-50/50">
                                                                <td className="px-3 py-2 border-r border-slate-100 text-slate-400 font-mono">{i + 1}</td>
                                                                <td className="px-3 py-2 border-r border-slate-100 font-medium text-slate-700 capitalize">{p.name}</td>
                                                                <td className="px-3 py-2 border-r border-slate-100 text-slate-800 font-mono">{p.value || '-'}</td>
                                                                <td className="px-3 py-2 text-slate-500">{p.unit || '-'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-lg border border-slate-100">No data points recorded.</div>
                                        )}
                                    </div>

                                    {/* Raw Data */}
                                    {expandedChar!.data.file_origin && (
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                                <FileText size={12} className="text-slate-400" /> Raw Data
                                            </h4>
                                            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-xs text-slate-600 font-mono truncate" title={expandedChar!.data.file_origin}>
                                                {expandedChar!.data.file_origin}
                                            </div>
                                        </div>
                                    )}

                                    {/* Drive Link */}
                                    {expandedChar!.data.drive_file_link && (
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                                <ExternalLink size={12} className="text-blue-500" /> Google Drive
                                            </h4>
                                            <a
                                                href={expandedChar!.data.drive_file_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 px-3 py-2 rounded-lg border border-blue-100"
                                            >
                                                <ExternalLink size={12} /> Open File in Drive
                                            </a>
                                        </div>
                                    )}

                                    {/* Notes & Observations */}
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                            <StickyNote size={12} className="text-amber-500" /> Notes & Observations
                                        </h4>
                                        <textarea
                                            value={charNotes}
                                            onChange={(e) => setCharNotes(e.target.value)}
                                            placeholder="Enter notes for this measurement..."
                                            className="w-full min-h-[100px] text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none bg-white"
                                        />
                                        {notesChanged && (
                                            <div className="flex justify-end gap-2 mt-2 animate-in fade-in duration-200">
                                                <button
                                                    onClick={() => setCharNotes(expandedChar!.data?.notes || '')}
                                                    className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={saveCharNotes}
                                                    disabled={isSavingCharNotes}
                                                    className="px-3 py-1 text-xs bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    {isSavingCharNotes ? 'Saving...' : <><Check size={12} /> Save Notes</>}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </div>
            )}

            {/* ──── MIDDLE: Original Sidebar (Sample Detail) ──── */}
            <div
                className="relative w-full max-w-xl bg-white shadow-2xl h-full flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Compact Header */}
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-start justify-between mb-2">
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                                    sample.status === 'active' ? "bg-emerald-100 text-emerald-700" :
                                        sample.status === 'archived' ? "bg-slate-100 text-slate-600" :
                                            "bg-purple-100 text-purple-700"
                                )}>
                                    {sample.status}
                                </span>
                                <span className="text-slate-400 text-[10px] font-mono">{sample.sample_code}</span>
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 leading-tight">{sample.name}</h2>
                        </div>
                        <div className="flex items-center gap-1">
                            {allSamples.length > 0 && (
                                <button
                                    onClick={() => setShowNav(!showNav)}
                                    className={cn(
                                        "p-1.5 rounded-full transition-colors",
                                        showNav ? "bg-blue-100 text-blue-600" : "hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                                    )}
                                    title="Quick Navigation"
                                >
                                    <History size={18} />
                                </button>
                            )}
                            <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                            <Calendar size={12} />
                            <span>{new Date(sample.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <User size={12} />
                            <span>{sample.type === 'stock' ? 'Stock' : 'Derived'}</span>
                        </div>
                    </div>
                </div>

                {/* Compact Tabs */}
                <div className="flex border-b border-slate-100 px-5">
                    <button
                        onClick={() => { setActiveTab('overview'); setExpandedChar(null); }}
                        className={cn(
                            "px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5",
                            activeTab === 'overview' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <FlaskConical size={13} /> Overview
                    </button>
                    <button
                        onClick={() => setActiveTab('characterization')}
                        className={cn(
                            "px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5",
                            activeTab === 'characterization' ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Microscope size={13} /> Characterization
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 bg-white scrollbar-thin scrollbar-thumb-slate-200">
                    {activeTab === 'overview' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            {/* Description / Notes - Editable */}
                            <div className="space-y-1.5">
                                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                                    <StickyNote size={12} className="text-slate-400" /> General Notes
                                </h3>
                                {editingSection === 'description' ? (
                                    <div className="space-y-2">
                                        <textarea
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            className="w-full text-sm border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-h-[80px]"
                                            autoFocus
                                            placeholder="Add notes..."
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => setEditingSection(null)} className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                                            <button onClick={saveDescription} disabled={isSaving} className="px-3 py-1 text-xs bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1">
                                                {isSaving ? 'Saving...' : <><Check size={12} /> Save</>}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => startEdit('description', sample.description || '')}
                                        className="group relative bg-slate-50 rounded-lg p-3 border border-slate-100 hover:border-slate-300 transition-colors cursor-pointer min-h-[40px]"
                                    >
                                        {sample.description ? (
                                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{sample.description}</p>
                                        ) : (
                                            <p className="text-xs text-slate-400 italic">Click to add notes...</p>
                                        )}
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Pencil size={12} className="text-slate-400" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Composition */}
                            <div className="space-y-1.5">
                                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                                    <FlaskConical size={12} className="text-blue-500" /> Composition
                                </h3>
                                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                                    {sample.composition && sample.composition.length > 0 ? (
                                        sample.composition.map((c, i) => (
                                            <div key={i} className="group hover:bg-slate-50 transition-colors">
                                                <div className="px-3 py-2">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="w-5 h-5 rounded flex items-center justify-center bg-slate-100 text-[10px] font-bold text-slate-500 border border-slate-200">{i + 1}</div>
                                                            <div className="min-w-0">
                                                                <div className="flex items-baseline gap-2">
                                                                    <span className="text-xs font-semibold text-slate-700 truncate">{c.value}</span>
                                                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider hidden sm:inline-block">{c.category}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="text-[10px] font-mono bg-white border px-1.5 py-0.5 rounded text-slate-500">{c.code}</span>
                                                            <button onClick={() => startEdit(i, c.notes || '')} className="p-1 text-slate-300 hover:text-blue-600 rounded opacity-0 group-hover:opacity-100 transition-all" title="Edit Note">
                                                                <MessageSquareText size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {editingSection === i ? (
                                                        <div className="mt-2 pl-7 animate-in slide-in-from-top-1 duration-200">
                                                            <textarea value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full text-xs border-slate-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 min-h-[40px] mb-1" placeholder="Layer notes..." autoFocus />
                                                            <div className="flex justify-end gap-2">
                                                                <button onClick={() => setEditingSection(null)} className="text-[10px] text-slate-500 hover:text-slate-700 underline">Cancel</button>
                                                                <button onClick={() => saveCompositionNote(i)} disabled={isSaving} className="px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Save Note</button>
                                                            </div>
                                                        </div>
                                                    ) : c.notes && (
                                                        <div onClick={() => startEdit(i, c.notes || '')} className="mt-1 pl-7 text-xs text-slate-600 flex items-start gap-1.5 cursor-pointer hover:text-slate-900" title="Click to edit">
                                                            <FileText size={10} className="mt-0.5 text-slate-400 shrink-0" />
                                                            <span className="italic leading-tight">{c.notes}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-4 text-center text-xs text-slate-400 italic">No composition layers.</div>
                                    )}
                                </div>
                            </div>

                            {/* Attributes */}
                            {Object.keys(sample.attributes).length > 0 && (
                                <div className="space-y-1.5">
                                    <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                                        <Settings size={12} className="text-purple-500" /> Metadata
                                    </h3>
                                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 grid grid-cols-2 gap-x-4 gap-y-3">
                                        {fields.map(field => {
                                            const val = sample.attributes[field.name];
                                            if (val === undefined || val === null || val === '') return null;
                                            const isLink = typeof val === 'string' && (val.startsWith('http') || val.startsWith('www'));
                                            return (
                                                <div key={field.id} className="min-w-0">
                                                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5 truncate">{field.label}</label>
                                                    <div className="text-sm font-medium text-slate-800 truncate" title={String(val)}>
                                                        {isLink ? (
                                                            <a href={val} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                                                External Link <ExternalLink size={10} />
                                                            </a>
                                                        ) : formatCellValue(val, field.type)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Comments */}
                            <SampleCommentsSection sampleId={sample.id} groupId={groupId} />
                        </div>
                    )}

                    {activeTab === 'characterization' && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                <h3 className="text-sm font-bold text-slate-900">Experimental History</h3>
                                <button
                                    onClick={() => { setSelectedChar(null); setIsCharModalOpen(true); }}
                                    className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded hover:bg-slate-800 flex items-center gap-1.5 shadow-sm"
                                >
                                    <Plus size={12} /> Add Record
                                </button>
                            </div>

                            {isLoadingChars ? (
                                <div className="py-10 text-center flex justify-center"><div className="w-5 h-5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" /></div>
                            ) : characterizations.length === 0 ? (
                                <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg">
                                    <p className="text-xs text-slate-400">No data found.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {characterizations.map((char) => (
                                        <div
                                            key={char.id}
                                            onClick={() => handleExpandChar(char)}
                                            className={cn(
                                                "group border rounded p-2.5 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3",
                                                expandedChar?.id === char.id
                                                    ? "bg-blue-50 border-blue-400 ring-1 ring-blue-200"
                                                    : "bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50/50"
                                            )}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <span className={cn(
                                                    "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0",
                                                    char.type === 'Raman' ? "bg-purple-100 text-purple-700" :
                                                        char.type === 'AFM' ? "bg-blue-100 text-blue-700" :
                                                            "bg-slate-100 text-slate-600"
                                                )}>
                                                    {char.type}
                                                </span>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-xs font-medium text-slate-800 truncate group-hover:text-blue-700 transition-colors">{getSummaryString(char) || 'No params'}</span>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                            <Clock size={10} />
                                                            {new Date(char.created_at).toLocaleDateString()}
                                                        </span>
                                                        {char.performed_at && (
                                                            <span className="text-[10px] text-blue-500 bg-blue-50 px-1 rounded flex items-center gap-1">
                                                                <Calendar size={10} />
                                                                {format(new Date(char.performed_at), 'dd/MM/yy')}
                                                            </span>
                                                        )}
                                                        {char.data.equipment && (
                                                            <span className="text-[10px] text-slate-400 shrink-0">• {char.data.equipment}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // Duplicate: data without ID
                                                        setSelectedChar({ ...char, id: '' });
                                                        setIsCharModalOpen(true);
                                                    }}
                                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                                    title="Duplicate"
                                                >
                                                    <Copy size={13} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleEditChar(char); }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors">
                                                    <Edit size={13} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteChar(char.id); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded transition-colors">
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <CharacterizationModal
                groupId={groupId}
                isOpen={isCharModalOpen}
                onClose={handleCloseModal}
                sample={sample}
                initialData={selectedChar}
                key={selectedChar ? selectedChar.id : 'new'}
                parameterUnits={parameterUnits}
                setParameterUnits={setParameterUnits}
                lastUnits={lastUnits}
                setLastUnits={setLastUnits}
                parameterOrder={parameterOrder}
                setParameterOrder={setParameterOrder}
                driveSettings={driveSettings}
            />
            {/* ──── RIGHT: Quick Navigation Sidebar ──── */}
            {showNav && allSamples.length > 0 && (
                <div className="relative w-64 bg-slate-50 border-l border-slate-200 h-full flex flex-col animate-in slide-in-from-right duration-300">
                    <div className="p-4 border-b border-slate-200 bg-white">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <History size={14} /> Quick Nav
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                        {allSamples.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => onSelectSample?.(s)}
                                className={cn(
                                    "w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex flex-col gap-0.5 group",
                                    sample?.id === s.id
                                        ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                                        : "hover:bg-white hover:shadow-sm text-slate-600 hover:text-blue-600"
                                )}
                                style={{ marginLeft: `${s.level * 12}px`, width: `calc(100% - ${s.level * 12}px)` }}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-bold truncate">{s.sample_code || s.display_id}</span>
                                    <span className={cn(
                                        "text-[9px] uppercase px-1 rounded",
                                        sample?.id === s.id ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-500"
                                    )}>
                                        {s.status}
                                    </span>
                                </div>
                                <span className={cn(
                                    "truncate opacity-70",
                                    sample?.id === s.id ? "text-blue-50" : "text-slate-400"
                                )}>
                                    {s.name}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

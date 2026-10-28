'use client';

import dynamic from 'next/dynamic';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Sample, SampleFieldConfig, SampleNomenclature, SampleStatus } from '../types';
import { deleteSamples } from '../mutate-samples';
import { projectSampleRows, acknowledgeSampleRows, expandSampleSelection, type SampleChange } from '../sample-rows';
import { DeleteSamplesDialog } from './delete-samples-dialog';
import { updateSample, consumeSampleRefresh } from '../update-sample';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    ChevronRight,
    ChevronDown,
    Plus,
    Trash2,
    Edit,
    Search,
    Filter,
    Hash,
    FileText,
    Settings,
    MoreHorizontal,
    CopyPlus, // For derive icon? Or just Plus
    X,
    Clock,
    FlaskConical,
    ClipboardList,
    Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
const SampleForm = dynamic(() => import('./sample-form').then(module => module.SampleForm));
const ConfigModal = dynamic(() => import('./config-modal').then(module => module.ConfigModal));
const CharacterizationModal = dynamic(() => import('./characterization-modal').then(module => module.CharacterizationModal));
const BulkCharacterizationModal = dynamic(() => import('./bulk-characterization-modal').then(module => module.BulkCharacterizationModal));
import { formatCellValue, formatDate } from '../utils';

const SampleDetailSheet = dynamic(() => import('./sample-detail-sheet').then(module => module.SampleDetailSheet));
const ActivityLogDrawer = dynamic(() => import('./activity-log-drawer').then(module => module.ActivityLogDrawer));
import { CharacterizationSearch } from './characterization-search';
const RamanWorkspace = dynamic(() => import('./raman-workspace').then(module => module.RamanWorkspace));
import { hasNativeDrive } from '@/lib/google/desktop-drive';
const WipImportDialog = dynamic(() => import('./wip-import-dialog').then(module => module.WipImportDialog), {ssr:false});
import { ScientificText } from '@/components/ScientificText';
import { useLogbookMeasurements } from '../use-logbook-measurements';
import { createSampleIndex, selectSampleRows } from '../sample-index';

interface SampleGridProps {
    groupId: string;
    logbookId: string;
    logbookName: string;
    logbookPrefix: string;
    samples: Sample[];
    fields: SampleFieldConfig[];
    nomenclatures: SampleNomenclature[];
    userRole: string | null;
    driveSettings?: { clientId?: string; apiKey?: string; folderId?: string; sampleFolderId?: string };
}

const STATUS_OPTIONS: { value: SampleStatus; label: string; color: string }[] = [
    { value: 'active', label: 'Active', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    { value: 'in_progress', label: 'In Process', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { value: 'successful', label: 'Successful', color: 'bg-green-100 text-green-700 border-green-200' },
    { value: 'completed', label: 'Completed', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    { value: 'terminated', label: 'Terminated', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    { value: 'consumed', label: 'Consumed', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    { value: 'archived', label: 'Archived', color: 'bg-gray-100 text-gray-600 border-gray-200' },
];

export function SampleGrid({
    groupId,
    logbookId,
    logbookName,
    logbookPrefix,
    samples: serverSamples,
    fields,
    nomenclatures,
    userRole,
    driveSettings
}: SampleGridProps) {
    const router = useRouter();
    const [wipOpen,setWipOpen] = useState(false);
    const [nativeWip,setNativeWip] = useState(false);
    useEffect(()=>setNativeWip(hasNativeDrive()),[]);
    useEffect(() => {
        if (consumeSampleRefresh(groupId, logbookId)) router.refresh();
    }, [groupId, logbookId, router]);
    const pendingStatus = useRef(new Set<string>());
    const [savingStatus, setSavingStatus] = useState<Set<string>>(new Set());
    const [changes, setChanges] = useState<Record<string, SampleChange>>({});
    useEffect(() => { setChanges(previous => acknowledgeSampleRows(serverSamples, previous)); }, [serverSamples]);
    const [removed, setRemoved] = useState<Set<string>>(new Set());
    const [newSampleId, setNewSampleId] = useState<string | null>(null);
    const samples = useMemo(() => projectSampleRows(serverSamples, changes, removed), [serverSamples, changes, removed]);
    const applySampleUpdate = (row: Sample) => {
        setChanges(previous => ({ ...previous, [row.id]: { row, created: previous[row.id]?.created ?? false } }));
        setDetailSample(previous => previous?.id === row.id ? { ...previous, ...row } : previous);
    };
    const applySampleCreated = (row: Sample) => {
        setNewSampleId(row.id);
        setChanges(previous => ({ ...previous, [row.id]: { row, created: true } }));
        setSearch(''); setStatusFilter('all'); setView('samples');
        setCollapsed(previous => {
            const next = { ...previous };
            let parent = row.parent_id;
            const visited = new Set<string>();
            while (parent && !visited.has(parent)) {
                visited.add(parent); delete next[parent];
                parent = samples.find(sample => sample.id === parent)?.parent_id ?? null;
            }
            return next;
        });
    };
    const [deleteIds, setDeleteIds] = useState<string[]>([]);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string>();
    const deleteLock = useRef(false);
    const requestedDeletion = useMemo(() => new Set(deleteIds), [deleteIds]);
    const deleteRows = samples.filter(sample => requestedDeletion.has(sample.id));
    const blockedChildren = samples.filter(sample => sample.parent_id && requestedDeletion.has(sample.parent_id) && !requestedDeletion.has(sample.id)).length;
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<SampleStatus | 'all'>('all');
    const [view, setView] = useState<'samples' | 'characterizations' | 'raman'>('samples');
    const [typeFilter, setTypeFilter] = useState('all');
    const measurements = useLogbookMeasurements(serverSamples, groupId, logbookId, view !== 'samples');
    const measurementSamples = useMemo(() => {
        const current = new Map(samples.map(sample => [sample.id, sample]));
        return measurements.samples.filter(sample => current.has(sample.id)).map(sample => ({
            ...sample, ...current.get(sample.id), characterizations: sample.characterizations,
        }));
    }, [measurements.samples, samples]);
    // Collapsed tracks which parent IDs the user has manually collapsed.
    // Empty = everything expanded (default behavior).
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
        if (typeof window === 'undefined') return {};
        try {
            const saved = localStorage.getItem(`sample_collapsed_${groupId}`);
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });

    // Persist collapsed state
    useEffect(() => {
        localStorage.setItem(`sample_collapsed_${groupId}`, JSON.stringify(collapsed));
    }, [collapsed, groupId]);

    // Modals state
    const [formOpen, setFormOpen] = useState(false);
    const [configOpen, setConfigOpen] = useState(false);
    const [charModalOpen, setCharModalOpen] = useState(false);
    const [editingSample, setEditingSample] = useState<Sample | null>(null);
    const [detailSample, setDetailSample] = useState<Sample | null>(null);
    const [deriveFrom, setDeriveFrom] = useState<Sample | null>(null);
    const [initialCharData, setInitialCharData] = useState<any>(null);
    const [initialCharId, setInitialCharId] = useState<string | null>(null);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkCharOpen, setBulkCharOpen] = useState(false);
    const [activityLogOpen, setActivityLogOpen] = useState(false);

    // Lifted state for Unit History (Parameter-scoped) — persisted in localStorage
    // parameterUnits: { "Laser": ["nm"], "Power": ["%"] }
    const [parameterUnits, setParameterUnits] = useState<Record<string, string[]>>(() => {
        if (typeof window === 'undefined') return {};
        try {
            const saved = localStorage.getItem(`char_paramUnits_${groupId}`);
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });
    // lastUnits: { "Laser": "nm", "Power": "%" }
    const [lastUnits, setLastUnits] = useState<Record<string, string>>(() => {
        if (typeof window === 'undefined') return {};
        try {
            const saved = localStorage.getItem(`char_lastUnits_${groupId}`);
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });
    // Lifted state for Parameter Order
    // parameterOrder: { "Raman": ["Laser", "Power", "Objective", ...] }
    const [parameterOrder, setParameterOrder] = useState<Record<string, string[]>>(() => {
        if (typeof window === 'undefined') return {};
        try {
            const saved = localStorage.getItem(`char_paramOrder_${groupId}`);
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });

    // Sync to localStorage on change
    useEffect(() => {
        if (Object.keys(parameterUnits).length > 0)
            localStorage.setItem(`char_paramUnits_${groupId}`, JSON.stringify(parameterUnits));
    }, [parameterUnits, groupId]);
    useEffect(() => {
        if (Object.keys(lastUnits).length > 0)
            localStorage.setItem(`char_lastUnits_${groupId}`, JSON.stringify(lastUnits));
    }, [lastUnits, groupId]);
    useEffect(() => {
        if (Object.keys(parameterOrder).length > 0)
            localStorage.setItem(`char_paramOrder_${groupId}`, JSON.stringify(parameterOrder));
    }, [parameterOrder, groupId]);

    const isAdmin = userRole === 'owner' || userRole === 'labmanager' || userRole === 'supervisor';

    const sampleIndex = useMemo(() => createSampleIndex(samples), [samples]);
    const tree = useMemo(() => selectSampleRows(sampleIndex, search, statusFilter, collapsed),
        [sampleIndex, search, statusFilter, collapsed]);
    useEffect(() => {
        if (!newSampleId || !tree.some(row => row.id === newSampleId)) return;
        const frame = requestAnimationFrame(() => {
            document.getElementById(`sample-row-${newSampleId}`)?.scrollIntoView({ block: 'nearest' });
            setNewSampleId(null);
        });
        return () => cancelAnimationFrame(frame);
    }, [newSampleId, tree]);
    // Stats calculation for Characterization View
    const charStats = useMemo(() => {
        if (view !== 'characterizations') return { samples: 0, measurements: 0 };

        let sampleCount = 0;
        let measurementCount = 0;
        const searchLower = search.toLowerCase();

        measurementSamples.forEach(s => {
            const charList = s.characterizations || [];
            const matches = charList.filter(c => {
                const matchesType = typeFilter === 'all' || c.type === typeFilter;

                // Simplified search match logic for stats (matching CharacterizationSearch)
                const matchesSearch = !search || (
                    c.type.toLowerCase().includes(searchLower) ||
                    s.sample_code?.toLowerCase().includes(searchLower) ||
                    s.name?.toLowerCase().includes(searchLower)
                );

                return matchesType && matchesSearch;
            });

            if (matches.length > 0) {
                sampleCount++;
                measurementCount += matches.length;
            }
        });

        return { samples: sampleCount, measurements: measurementCount };
    }, [measurementSamples, search, typeFilter, view]);

    const handleToggleExpand = (id: string) => {
        setCollapsed(prev => {
            const next = { ...prev };
            if (next[id]) {
                delete next[id]; // uncollapse = expand
            } else {
                next[id] = true; // collapse
            }
            return next;
        });
    };

    const requestDeletion = (ids: string[]) => {
        if (deleteLock.current) return;
        setDeleteError(undefined);
        setDeleteIds([...new Set(ids)]);
    };
    const confirmDeletion = async () => {
        if (deleteLock.current || !deleteIds.length || blockedChildren) return;
        deleteLock.current = true;
        setDeleting(true); setDeleteError(undefined);
        try {
            const result = await deleteSamples(groupId, logbookId, deleteIds);
            if (result.error || !result.deletedIds) {
                setDeleteError(result.error || 'Deletion was not confirmed');
                return;
            }
            const deleted = new Set(result.deletedIds);
            setRemoved(previous => new Set([...previous, ...deleted]));
            setSelectedIds(previous => new Set([...previous].filter(id => !deleted.has(id))));
            setDetailSample(previous => previous && deleted.has(previous.id) ? null : previous);
            setDeleteIds([]);
            toast.success(`Deleted ${deleted.size} sample${deleted.size === 1 ? '' : 's'}`);
        } catch {
            setDeleteError('Deletion could not be confirmed. Refresh before retrying.');
        } finally {
            deleteLock.current = false;
            setDeleting(false);
        }
    };
    const handleStatusChange = async (id: string, newStatus: SampleStatus) => {
        if (pendingStatus.current.has(id)) return;
        pendingStatus.current.add(id);
        setSavingStatus(new Set(pendingStatus.current));
        try {
            const res = await updateSample({ id, status: newStatus }, groupId);
            if (res.error) toast.error(res.error);
            else if (res.data) { applySampleUpdate(res.data); toast.success('Status updated'); }
        } finally {
            pendingStatus.current.delete(id);
            setSavingStatus(new Set(pendingStatus.current));
        }
    };

    const handleDerive = (sample: Sample) => {
        setDeriveFrom(sample);
        setEditingSample(null);
        setFormOpen(true);
    };

    const allVisibleSelected = tree.length > 0 && tree.every(row => selectedIds.has(row.id));
    const toggleSelectAll = () => {
        setSelectedIds(previous => {
            const next = new Set(previous);
            const all = tree.length > 0 && tree.every(row => previous.has(row.id));
            for (const row of tree) { if (all) next.delete(row.id); else next.add(row.id); }
            return next;
        });
    };
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <>
            <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                    <button
                        onClick={() => setView('samples')}
                        className={cn(
                            "px-6 py-3 text-sm font-medium transition-colors border-b-2",
                            view === 'samples'
                                ? "border-blue-600 text-blue-600 bg-blue-50/30"
                                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        )}
                    >
                        Samples
                    </button>
                    <button
                        onClick={() => setView('characterizations')}
                        className={cn(
                            "px-6 py-3 text-sm font-medium transition-colors border-b-2",
                            view === 'characterizations'
                                ? "border-blue-600 text-blue-600 bg-blue-50/30"
                                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        )}
                    >
                        Characterizations
                    </button>
                    <button
                        onClick={() => setView('raman')}
                        className={cn(
                            "px-6 py-3 text-sm font-bold transition-colors border-b-2 flex items-center gap-1.5",
                            view === 'raman'
                                ? "border-purple-600 text-purple-600 bg-purple-50/50"
                                : "border-transparent text-slate-500 hover:text-purple-600 hover:bg-purple-50/30"
                        )}
                    >
                        <Activity size={16} /> Raman View
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50">
                    <div className="flex items-center gap-3 flex-1">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search samples..."
                                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                        </div>
                        {/* Status Filter */}
                        <div className="relative">
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value as any)}
                                className="pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:border-blue-500 cursor-pointer text-slate-600 font-medium"
                            >
                                <option value="all">All Status</option>
                                {STATUS_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                        </div>

                        {/* Technique Filter (Only for Characterizations) */}
                        {view === 'characterizations' && (
                            <div className="relative">
                                <select
                                    value={typeFilter}
                                    onChange={e => setTypeFilter(e.target.value)}
                                    className="pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:border-blue-500 cursor-pointer text-slate-600 font-medium"
                                >
                                    <option value="all">Todas las Técnicas</option>
                                    {Array.from(new Set(samples.flatMap(s => s.characterization_types || []))).sort().map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                                <FlaskConical className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                            </div>
                        )}

                        {/* Inline Stats */}
                        {view === 'characterizations' && charStats.measurements > 0 && (
                            <div className="flex items-center gap-2 ml-1">
                                <div className="flex items-center gap-1.5 text-blue-600 bg-blue-50/50 px-2.5 py-1 rounded-lg border border-blue-100 text-[11px] font-bold whitespace-nowrap">
                                    <Hash size={12} /> {charStats.samples} Muestras
                                </div>
                                <div className="flex items-center gap-1.5 text-purple-600 bg-purple-50/50 px-2.5 py-1 rounded-lg border border-purple-100 text-[11px] font-bold whitespace-nowrap">
                                    <ClipboardList size={12} /> {charStats.measurements} Mediciones
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {nativeWip && <button type="button" onClick={()=>setWipOpen(true)} className="border border-violet-200 bg-violet-50 text-violet-700 px-3 py-2 rounded-lg text-sm font-medium">Import .wip</button>}
                        {isAdmin && (
                            <button
                                onClick={() => setConfigOpen(true)}
                                className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors tooltip"
                                title="Configuration"
                            >
                                <Settings size={20} />
                            </button>
                        )}
                        <button
                            onClick={() => setActivityLogOpen(true)}
                            className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors tooltip"
                            title="Activity Log"
                        >
                            <Clock size={20} />
                        </button>
                        <button
                            onClick={() => { setEditingSample(null); setDeriveFrom(null); setFormOpen(true); }}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                        >
                            <Plus size={18} />
                            New Sample
                        </button>
                    </div>
                </div>

                {/* Grid Content */}
                <div className="flex-1 overflow-auto relative">
                    {view === 'samples' && (
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 border-b border-r border-slate-200 w-10 text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                            checked={allVisibleSelected}
                                            onChange={toggleSelectAll}
                                        />
                                    </th>
                                    <th className="px-4 py-3 border-b border-r border-slate-200 w-32 min-w-[120px]">Code</th>
                                    <th className="px-4 py-3 border-b border-r border-slate-200 w-64 min-w-[200px]">Name</th>
                                    <th className="px-4 py-3 border-b border-r border-slate-200 w-32">Created</th>

                                    {/* Replaced Composition with Description/Comments */}
                                    <th className="px-4 py-3 border-b border-r border-slate-200 min-w-[200px]">Comments</th>

                                    {/* Added Characterization */}
                                    <th className="px-4 py-3 border-b border-r border-slate-200 min-w-[150px]">Characterization</th>

                                    <th className="px-4 py-3 border-b border-r border-slate-200 w-32">Status</th>

                                    {/* Dynamic Headers (Metadata Only) */}
                                    {fields.map(field => (
                                        <th key={field.id} className="px-4 py-3 border-b border-r border-slate-200 min-w-[150px] whitespace-nowrap">
                                            {field.label}
                                        </th>
                                    ))}

                                    <th className="px-4 py-3 border-b border-slate-200 w-32 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {tree.length === 0 && (
                                    <tr>
                                        <td colSpan={7 + fields.length} className="px-4 py-12 text-center text-slate-400">
                                            No samples found. Create one to get started.
                                        </td>
                                    </tr>
                                )}
                                {tree.map(row => (
                                    <tr
                                        key={row.id}
                                        id={`sample-row-${row.id}`}
                                        className={cn(
                                            "hover:bg-blue-50/50 group transition-colors",
                                            selectedIds.has(row.id) && "bg-blue-50/30"
                                        )}
                                    >
                                        {/* Checkbox */}
                                        <td className="w-10 px-4 py-2 border-r border-slate-100 text-center">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                checked={selectedIds.has(row.id)}
                                                onChange={() => toggleSelect(row.id)}
                                            />
                                        </td>

                                        {/* Code (with tree connector for children) */}
                                        <td className="px-4 py-2 border-r border-slate-100 font-mono text-xs text-slate-500">
                                            <div className="flex items-center" style={{ paddingLeft: `${row.level * 16}px` }}>
                                                {row.level > 0 && (
                                                    <span className="text-slate-300 mr-1.5 select-none">└</span>
                                                )}
                                                <span className={cn(
                                                    row.level === 0 && "font-semibold text-slate-700"
                                                )}>
                                                    {row.sample_code || '-'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Name (Hierarchy) - Clickable for details */}
                                        <td className="px-4 py-2 border-r border-slate-100 font-medium text-slate-900 truncate">
                                            <div className="flex items-center" style={{ paddingLeft: `${row.level * 20}px` }}>
                                                {row.hasChildren && !search && statusFilter === 'all' ? (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleToggleExpand(row.id); }}
                                                        className="p-0.5 mr-1 text-slate-400 hover:text-blue-600 rounded"
                                                    >
                                                        {collapsed[row.id] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                                    </button>
                                                ) : (
                                                    <span className="w-4 mr-1" />
                                                )}
                                                <button
                                                    onClick={() => setDetailSample(row)}
                                                    className="truncate hover:text-blue-600 hover:underline text-left"
                                                    title="View Details"
                                                >
                                                    {row.name || row.display_id}
                                                </button>
                                            </div>
                                        </td>

                                        {/* Created At */}
                                        <td className="px-4 py-2 border-r border-slate-100 text-slate-500 text-xs whitespace-nowrap">
                                            {formatDate(row.created_at)}
                                        </td>

                                        <td className="px-4 py-2 border-r border-slate-100 max-w-[200px]">
                                            {row.description ? (
                                                <div className="line-clamp-2 text-xs text-slate-600" title={row.description}>
                                                    <ScientificText text={row.description} />
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 text-xs">-</span>
                                            )}
                                        </td>

                                        {/* Characterization Types */}
                                        <td className="px-4 py-2 border-r border-slate-100 max-w-[150px]">
                                            {row.characterization_types && row.characterization_types.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {row.characterization_types.map((type, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const char = row.characterization_refs?.find(c => c.type === type);
                                                                if (char) {
                                                                    setInitialCharId(char.id);
                                                                    setDetailSample(row);
                                                                } else {
                                                                    setInitialCharId(null);
                                                                    setDetailSample(row);
                                                                }
                                                            }}
                                                            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100 hover:bg-purple-100 hover:border-purple-300 transition-colors cursor-pointer"
                                                        >
                                                            {type}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 text-xs">-</span>
                                            )}
                                        </td>

                                        {/* Status (Dropdown) */}
                                        < td className="px-4 py-2 border-r border-slate-100" >
                                            <select
                                                value={row.status}
                                                disabled={savingStatus.has(row.id)}
                                                onChange={(e) => handleStatusChange(row.id, e.target.value as SampleStatus)}
                                                className={cn(
                                                    "block w-full text-xs font-medium rounded-md border-0 py-1 pl-2 pr-6 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600 sm:text-xs",
                                                    STATUS_OPTIONS.find(o => o.value === row.status)?.color || "bg-slate-50 text-slate-500"
                                                )}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {STATUS_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* Dynamic Fields */}
                                        {fields.map(field => {
                                            const val = row.attributes[field.name];
                                            const formatted = formatCellValue(val, field.type);

                                            if (field.type === 'boolean') {
                                                return (
                                                    <td key={field.id} className="px-4 py-2 border-r border-slate-100">
                                                        <span className={cn(
                                                            "px-2 py-0.5 rounded-md text-xs font-semibold",
                                                            val === true ? "bg-green-100 text-green-700" :
                                                                val === false ? "bg-purple-100 text-purple-700" : "text-slate-400"
                                                        )}>
                                                            {val === true ? 'Yes' : val === false ? 'No' : '-'}
                                                        </span>
                                                    </td>
                                                );
                                            }

                                            return (
                                                <td key={field.id} className="px-4 py-2 border-r border-slate-100 text-slate-600 truncate max-w-[200px] text-xs" title={String(val)}>
                                                    {formatted}
                                                </td>
                                            );
                                        })}

                                        {/* Actions */}
                                        <td className="px-4 py-2 text-center bg-white">
                                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleDerive(row)}
                                                    className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded"
                                                    title="Create Derived Sample"
                                                >
                                                    <Plus size={16} strokeWidth={2.5} />
                                                </button>
                                                <button
                                                    onClick={() => { setEditingSample(row); setDeriveFrom(null); setCharModalOpen(true); }}
                                                    className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded"
                                                    title="Characterize"
                                                >
                                                    <FileText size={14} />
                                                </button>
                                                <button
                                                    onClick={() => { setEditingSample(row); setDeriveFrom(null); setFormOpen(true); }}
                                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                    title="Edit"
                                                >
                                                    <Edit size={14} />
                                                </button>
                                                <button
                                                    disabled={deleting || savingStatus.has(row.id)}
                                                    onClick={() => requestDeletion([row.id])}
                                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {view !== 'samples' && measurements.loading && (
                        <div role="status" className="p-8 text-center text-sm text-slate-500">Loading measurements…</div>
                    )}
                    {view !== 'samples' && measurements.error && (
                        <div role="alert" className="p-8 text-center text-sm text-slate-600">
                            <p>{measurements.error}</p>
                            <button type="button" onClick={measurements.retry} className="mt-3 rounded border px-4 py-2">Try again</button>
                        </div>
                    )}
                    {view === 'characterizations' && !measurements.loading && !measurements.error && (
                        <CharacterizationSearch
                            samples={measurementSamples}
                            search={search}
                            typeFilter={typeFilter}
                            onSelectSample={(sample, charId) => {
                                setInitialCharId(charId || null);
                                setDetailSample(sample);
                            }}
                        />
                    )}

                    {view === 'raman' && !measurements.loading && !measurements.error && (
                        <div className="h-full flex flex-col p-4 bg-slate-50 min-h-[500px]">
                            <RamanWorkspace samples={measurementSamples} driveSettings={driveSettings} />
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            {configOpen && (<ConfigModal
                isOpen={configOpen}
                onClose={() => setConfigOpen(false)
                }
                groupId={groupId}
                logbookId={logbookId}
                nomenclatures={nomenclatures}
                fields={fields}
            />)}

            {formOpen && (
                <SampleForm
                    isOpen={formOpen}
                    onClose={() => { setFormOpen(false); setEditingSample(null); setDeriveFrom(null); }}
                    groupId={groupId}
                    logbookId={logbookId}
                    logbookPrefix={logbookPrefix}
                    fields={fields}
                    nomenclatures={nomenclatures}
                    existingSamples={samples}
                    initialData={editingSample}
                    onCreated={applySampleCreated}
                    onUpdated={applySampleUpdate}
                    initialType={deriveFrom ? 'derived' : 'stock'}
                    initialParentId={deriveFrom?.id}
                    initialComposition={deriveFrom?.composition}
                />
            )}

            {
                (editingSample || deriveFrom) && charModalOpen && (
                    <CharacterizationModal
                        isOpen={charModalOpen}
                        onClose={() => { setCharModalOpen(false); setEditingSample(null); setInitialCharData(null); }}
                        sample={editingSample!}
                        initialData={initialCharData}
                        groupId={groupId}
                        logbookName={logbookName}
                        parameterUnits={parameterUnits}
                        setParameterUnits={setParameterUnits}
                        lastUnits={lastUnits}
                        setLastUnits={setLastUnits}
                        parameterOrder={parameterOrder}
                        setParameterOrder={setParameterOrder}
                        driveSettings={driveSettings}
                    />
                )
            }

            {
                detailSample && (
                    <SampleDetailSheet
                        sample={detailSample}
                        onUpdated={applySampleUpdate}
                        allSamples={tree}
                        onSelectSample={setDetailSample}
                        groupId={groupId}
                        logbookName={logbookName}
                        fields={fields}
                        onClose={() => { setDetailSample(null); setInitialCharId(null); }}
                        initialCharId={initialCharId || undefined}
                        parameterUnits={parameterUnits}
                        setParameterUnits={setParameterUnits}
                        lastUnits={lastUnits}
                        setLastUnits={setLastUnits}
                        parameterOrder={parameterOrder}
                        setParameterOrder={setParameterOrder}
                        driveSettings={driveSettings}
                    />
                )
            }

            {/* ──── BATCH ACTIONS BAR ──── */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-4 duration-300 z-50">
                    <div className="flex items-center gap-3 border-r border-slate-700 pr-6">
                        <span className="bg-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{selectedIds.size}</span>
                        <span className="text-sm font-medium">Selected</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setBulkCharOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors text-sm"
                        >
                            <Settings size={16} className="text-purple-400" />
                            Bulk Characterize
                        </button>

                        <button
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors text-sm text-red-400"
                            disabled={deleting}
                            onClick={() => requestDeletion(Array.from(selectedIds))}
                        >
                            <Trash2 size={16} />
                            Delete Selective
                        </button>
                    </div>

                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="ml-4 p-1 hover:bg-slate-800 rounded-full text-slate-400"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {wipOpen&&<WipImportDialog groupId={groupId} folderId={driveSettings?.sampleFolderId||driveSettings?.folderId} onClose={()=>{setWipOpen(false);router.refresh();}}/>}
            {/* ──── BULK CHARACTERIZATION MODAL ──── */}
            {bulkCharOpen && (<BulkCharacterizationModal
                isOpen={bulkCharOpen}
                onClose={() => setBulkCharOpen(false)}
                sampleIds={Array.from(selectedIds)}
                groupId={groupId}
                onSuccess={() => {
                    setBulkCharOpen(false);
                    setSelectedIds(new Set());
                }}
                parameterUnits={parameterUnits}
                setParameterUnits={setParameterUnits}
                lastUnits={lastUnits}
                setLastUnits={setLastUnits}
                parameterOrder={parameterOrder}
                setParameterOrder={setParameterOrder}
            />)}

            {activityLogOpen && (<ActivityLogDrawer
                groupId={groupId}
                isOpen={activityLogOpen}
                onClose={() => setActivityLogOpen(false)}
                onSelectSample={(id) => {
                    const s = samples.find(samp => samp.id === id);
                    if (s) {
                        setDetailSample(s);
                        setActivityLogOpen(false);
                    } else {
                        toast.error("Sample not found in current view");
                    }
                }}
            />)}
            {deleteIds.length > 0 && <DeleteSamplesDialog samples={deleteRows} blockedChildren={blockedChildren}
                saving={deleting} error={deleteError}
                onIncludeChildren={() => { if (!deleteLock.current) { setDeleteError(undefined); setDeleteIds(expandSampleSelection(samples, deleteIds)); } }}
                onCancel={() => { if (!deleteLock.current) setDeleteIds([]); }}
                onConfirm={() => { void confirmDeletion(); }} />}        </>
    );
}

'use client';

import { useState, useMemo, useEffect } from 'react';
import { Sample, SampleFieldConfig, SampleNomenclature, SampleStatus } from '../types';
import { deleteSampleAction, updateSampleAction } from '../actions';
import { toast } from 'sonner';
import {
    ChevronRight,
    ChevronDown,
    Plus,
    Trash2,
    Edit,
    Search,
    Filter,
    FileText,
    Settings,
    MoreHorizontal,
    CopyPlus // For derive icon? Or just Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SampleForm } from './sample-form';
import { ConfigModal } from './config-modal';
import { CharacterizationModal } from './characterization-modal';
import { formatCellValue, formatDate } from '../utils';

import { SampleDetailSheet } from './sample-detail-sheet';

interface SampleGridProps {
    groupId: string;
    logbookId: string;
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
    logbookPrefix,
    samples,
    fields,
    nomenclatures,
    userRole,
    driveSettings
}: SampleGridProps) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<SampleStatus | 'all'>('all');
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

    // ... (Tree logic remains same)
    const tree = useMemo(() => {
        const map = new Map<string, Sample & { children: Sample[], level: number }>();
        const roots: (Sample & { children: Sample[], level: number })[] = [];

        samples.forEach(s => {
            map.set(s.id, { ...s, children: [], level: 0 });
        });

        samples.forEach(s => {
            const node = map.get(s.id)!;
            if (s.parent_id && map.has(s.parent_id)) {
                const parent = map.get(s.parent_id)!;
                parent.children.push(node);
                node.level = parent.level + 1;
            } else {
                roots.push(node);
            }
        });

        // Sort by created_at desc
        const sortNodes = (nodes: any[]) => {
            nodes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            nodes.forEach(n => sortNodes(n.children));
        };
        sortNodes(roots);

        const flat: (Sample & { level: number, hasChildren: boolean })[] = [];

        const traverse = (nodes: any[], level: number) => {
            for (const node of nodes) {
                const matchesSearch = search ?
                    (node.display_id.toLowerCase().includes(search.toLowerCase()) ||
                        JSON.stringify(node.attributes).toLowerCase().includes(search.toLowerCase()))
                    : true;

                const matchesStatus = statusFilter === 'all' || node.status === statusFilter;

                if (matchesSearch && matchesStatus) {
                    flat.push({ ...node, level, hasChildren: node.children.length > 0 });
                }

                if ((search || !collapsed[node.id]) && node.children.length > 0) {
                    traverse(node.children, search ? level : level + 1);
                }
            }
        };

        if (search || statusFilter !== 'all') {
            return samples.filter(s =>
                (s.display_id.toLowerCase().includes(search.toLowerCase()) ||
                    JSON.stringify(s.attributes).toLowerCase().includes(search.toLowerCase())) &&
                (statusFilter === 'all' || s.status === statusFilter)
            ).map(s => ({ ...s, level: 0, hasChildren: false }));
        }

        traverse(roots, 0);
        return flat;

    }, [samples, search, statusFilter, collapsed]);

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

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this sample?')) return;
        const res = await deleteSampleAction(id, groupId);
        if (res.error) toast.error(res.error);
        else toast.success('Deleted');
    };

    const handleStatusChange = async (id: string, newStatus: SampleStatus) => {
        const res = await updateSampleAction({ id, status: newStatus }, groupId);
        if (res.error) toast.error(res.error);
        else toast.success('Status updated');
    };

    const handleDerive = (sample: Sample) => {
        setDeriveFrom(sample);
        setEditingSample(null);
        setFormOpen(true);
    };

    return (
        <>
            <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
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
                                className="pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:border-blue-500 cursor-pointer"
                            >
                                <option value="all">All Status</option>
                                {STATUS_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
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
                            onClick={() => { setEditingSample(null); setDeriveFrom(null); setFormOpen(true); }}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                        >
                            <Plus size={18} />
                            New Sample
                        </button>
                    </div>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 z-10 shadow-sm">
                            <tr>
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
                                <tr key={row.id} className="hover:bg-blue-50/50 group transition-colors">
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

                                    {/* Description / Comments */}
                                    <td className="px-4 py-2 border-r border-slate-100 max-w-[200px]">
                                        {row.description ? (
                                            <div className="truncate text-xs text-slate-600" title={row.description}>
                                                {row.description}
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
                                                            // Find the latest characterization of this type
                                                            const char = row.characterizations?.find((c: any) => c.type === type);
                                                            setEditingSample(row);
                                                            setDeriveFrom(null); // Ensure we are not deriving
                                                            // We need a way to pass initialData to the modal. 
                                                            // The modal accesses `initialData` from props.
                                                            // Currently SampleGrid doesn't have a state for `initialCharData`.
                                                            // We need to add that state or pass it through.
                                                            if (char) setInitialCharData(char);
                                                            setCharModalOpen(true);
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
                                    <td className="px-4 py-2 border-r border-slate-100">
                                        <select
                                            value={row.status}
                                            onChange={(e) => handleStatusChange(row.id, e.target.value as SampleStatus)}
                                            className={cn(
                                                "block w-full text-xs font-medium rounded-md border-0 py-1 pl-2 pr-6 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600 sm:text-xs",
                                                // Dynamic color based on current value matching our options
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
                                                onClick={() => handleDelete(row.id)}
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
                </div>
            </div>

            {/* Modals */}
            <ConfigModal
                isOpen={configOpen}
                onClose={() => setConfigOpen(false)}
                groupId={groupId}
                logbookId={logbookId}
                nomenclatures={nomenclatures}
                fields={fields}
            />

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
                    initialType={deriveFrom ? 'derived' : 'stock'}
                    initialParentId={deriveFrom?.id}
                    initialComposition={deriveFrom?.composition}
                />
            )}

            {(editingSample || deriveFrom) && charModalOpen && (
                <CharacterizationModal
                    isOpen={charModalOpen}
                    onClose={() => { setCharModalOpen(false); setEditingSample(null); setInitialCharData(null); }}
                    sample={editingSample!}
                    initialData={initialCharData}
                    groupId={groupId}
                    parameterUnits={parameterUnits}
                    setParameterUnits={setParameterUnits}
                    lastUnits={lastUnits}
                    setLastUnits={setLastUnits}
                    parameterOrder={parameterOrder}
                    setParameterOrder={setParameterOrder}
                    driveSettings={driveSettings}
                />
            )}

            {detailSample && (
                <SampleDetailSheet
                    sample={detailSample}
                    groupId={groupId}
                    fields={fields}
                    onClose={() => setDetailSample(null)}
                    parameterUnits={parameterUnits}
                    setParameterUnits={setParameterUnits}
                    lastUnits={lastUnits}
                    setLastUnits={setLastUnits}
                    parameterOrder={parameterOrder}
                    setParameterOrder={setParameterOrder}
                    driveSettings={driveSettings}
                />
            )}
        </>
    );
}

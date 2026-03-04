'use client';

import { useState } from 'react';
import { Logbook } from '../types';
import { createLogbookAction } from '../actions';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import {
    Book,
    Plus,
    Loader2,
    Copy,
    Edit,
    Trash2,
    AlertTriangle,
    ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';


interface LogbookSwitcherProps {
    groupId: string;
    logbooks: Logbook[];
    currentLogbookId: string;
}

export function LogbookSwitcher({ groupId, logbooks, currentLogbookId }: LogbookSwitcherProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingLogbook, setEditingLogbook] = useState<Logbook | null>(null);
    const [deletingLogbook, setDeletingLogbook] = useState<Logbook | null>(null);
    const [duplicatingLogbook, setDuplicatingLogbook] = useState<Logbook | null>(null);

    const handleSwitch = (logbookId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('logbook', logbookId);
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <>
            <div className="flex items-center gap-1 flex-wrap">
                {logbooks.map(logbook => {
                    const isActive = currentLogbookId === logbook.id;
                    return (
                        <div key={logbook.id} className="relative group/tab">
                            <button
                                onClick={() => handleSwitch(logbook.id)}
                                className={cn(
                                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                                    isActive
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'
                                )}
                            >
                                <span className={cn(
                                    'w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                                )}>
                                    {logbook.prefix}
                                </span>
                                {logbook.name}
                            </button>
                            {/* Edit / Delete on hover */}
                            <div className="absolute -top-1.5 -right-1.5 hidden group-hover/tab:flex items-center gap-0.5 bg-white border border-slate-200 rounded-md shadow-sm px-0.5 py-0.5 z-10">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setEditingLogbook(logbook); }}
                                    className="p-0.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                    title="Edit"
                                >
                                    <Edit size={11} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setDuplicatingLogbook(logbook); }}
                                    className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="Duplicate"
                                >
                                    <Copy size={11} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setDeletingLogbook(logbook); }}
                                    className="p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                    title="Delete"
                                >
                                    <Trash2 size={11} />
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* New Logbook button */}
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                    title="New Logbook"
                >
                    <Plus size={14} />
                    New
                </button>
            </div>

            {(showCreateModal || duplicatingLogbook) && (
                <CreateLogbookModal
                    groupId={groupId}
                    onClose={() => { setShowCreateModal(false); setDuplicatingLogbook(null); }}
                    logbooks={logbooks}
                    initialData={duplicatingLogbook ? {
                        name: `Copy of ${duplicatingLogbook.name}`,
                        prefix: duplicatingLogbook.prefix.length < 4 ? `${duplicatingLogbook.prefix}C` : duplicatingLogbook.prefix,
                        templateId: duplicatingLogbook.id
                    } : undefined}
                />
            )}

            {editingLogbook && (
                <EditLogbookModal
                    groupId={groupId}
                    logbook={editingLogbook}
                    onClose={() => setEditingLogbook(null)}
                />
            )}

            {deletingLogbook && (
                <DeleteLogbookDialog
                    groupId={groupId}
                    logbook={deletingLogbook}
                    onClose={() => setDeletingLogbook(null)}
                />
            )}
        </>
    );
}

function CreateLogbookModal({
    groupId,
    onClose,
    logbooks,
    initialData
}: {
    groupId: string;
    onClose: () => void;
    logbooks: Logbook[];
    initialData?: { name: string; prefix: string; templateId: string };
}) {
    const [name, setName] = useState(initialData?.name || '');
    const [prefix, setPrefix] = useState(initialData?.prefix || '');
    const [description, setDescription] = useState('');
    const [templateId, setTemplateId] = useState<string>(initialData?.templateId || ''); // Default to none? Or first?
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !prefix) return;

        setLoading(true);
        try {
            const result = await createLogbookAction({
                group_id: groupId,
                name,
                prefix,
                description,
                template_logbook_id: templateId || undefined
            });

            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success('Logbook created successfully');
                onClose();
                // Optionally switch to new logbook? Action revalidates, but we might want to push url
                // If result.data is returned we log it
            }
        } catch (err) {
            toast.error('Failed to create logbook');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                        <Book className="w-5 h-5 text-indigo-600" />
                        Create New Logbook
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <Plus className="w-5 h-5 rotate-45" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Logbook Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Polymer Synthesis"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Prefix</label>
                            <input
                                type="text"
                                value={prefix}
                                onChange={e => setPrefix(e.target.value.toUpperCase())}
                                placeholder="e.g. P"
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono uppercase"
                                maxLength={4}
                                required
                            />
                            <p className="text-[10px] text-slate-500">
                                Samples will be named {prefix ? `${prefix}-1, ${prefix}-2` : '?-1, ?-2'}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Template</label>
                            <div className="relative">
                                <select
                                    value={templateId}
                                    onChange={e => setTemplateId(e.target.value)}
                                    className="w-full px-3 py-2 pl-9 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none bg-white text-sm"
                                >
                                    <option value="">Empty (No template)</option>
                                    {logbooks.map(l => (
                                        <option key={l.id} value={l.id}>
                                            Copy from {l.name}
                                        </option>
                                    ))}
                                </select>
                                <Copy className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                                <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Description</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Optional description..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[80px] resize-none"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Logbook'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

import { updateLogbookAction, deleteLogbookAction } from '../actions';

function EditLogbookModal({ groupId, logbook, onClose }: { groupId: string; logbook: Logbook; onClose: () => void; }) {
    const [name, setName] = useState(logbook.name);
    const [description, setDescription] = useState(logbook.description || '');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const result = await updateLogbookAction({
                id: logbook.id,
                group_id: groupId,
                name,
                description
            });

            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success('Logbook updated');
                onClose();
            }
        } catch (err) {
            toast.error('Failed to update logbook');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                        <Book className="w-5 h-5 text-indigo-600" />
                        Edit Logbook
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <Plus className="w-5 h-5 rotate-45" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Logbook Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-sm"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Prefix (Immutable)</label>
                        <div className="w-full px-3 py-2 border border-slate-100 bg-slate-50 rounded-lg text-slate-500 font-mono text-sm">
                            {logbook.prefix}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Description</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[80px] resize-none text-sm"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function DeleteLogbookDialog({ groupId, logbook, onClose }: { groupId: string; logbook: Logbook; onClose: () => void; }) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleDelete = async () => {
        setLoading(true);
        try {
            const result = await deleteLogbookAction(logbook.id, groupId);
            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success('Logbook deleted');
                onClose();
                // If we were on this logbook, router push to something else or let UI handle?
                // For safety, push to default (without logbook param -> might auto-select first)
                // or reload page
                router.push(window.location.pathname);
            }
        } catch (err) {
            toast.error('Failed to delete logbook');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 border-2 border-red-100">
                <div className="p-6 text-center">
                    <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">
                        Delete Logbook?
                    </h3>
                    <p className="text-slate-600 text-sm mb-6">
                        Are you sure you want to delete <span className="font-semibold text-slate-900">{logbook.name}</span>?
                        <br /><br />
                        <span className="text-red-600 font-medium">Warning:</span> All samples, nomenclatures, and configurations within this logbook will be permanently deleted. This action cannot be undone.
                    </p>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Logbook'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}


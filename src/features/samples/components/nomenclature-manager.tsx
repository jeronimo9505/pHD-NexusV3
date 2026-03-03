import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SampleNomenclature } from '../types';
import { upsertNomenclatureAction, deleteNomenclatureAction } from '../actions';
import { toast } from 'sonner';
import { Trash2, Plus, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NomenclatureImportDialog } from './nomenclature-import-dialog';

export function NomenclatureManager({
    groupId,
    logbookId,
    nomenclatures
}: {
    groupId: string,
    logbookId: string,
    nomenclatures: SampleNomenclature[]
}) {
    const router = useRouter();
    const [editing, setEditing] = useState<SampleNomenclature | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);

    // Import State
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [importCandidates, setImportCandidates] = useState<any[]>([]);

    // Group by category
    const grouped = nomenclatures.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
    }, {} as Record<string, SampleNomenclature[]>);

    const categories = Object.keys(grouped).sort();

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const item = editing!;
        const res = await upsertNomenclatureAction(item);
        if (res.error) toast.error(res.error);
        else {
            toast.success('Saved');
            setEditing(null);
            setIsCreating(false);
            setIsCreatingCategory(false);
            router.refresh(); // Update UI
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        const res = await deleteNomenclatureAction(id, groupId);
        if (res.error) toast.error(res.error);
        else {
            toast.success('Deleted');
            router.refresh(); // Update UI
        }
    };

    const handleExport = () => {
        const dataStr = JSON.stringify(nomenclatures, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `nomenclature_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("Nomenclature exported!");
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (!Array.isArray(json)) throw new Error("Invalid format: expected an array");

                setImportCandidates(json);
                setImportDialogOpen(true);
            } catch (err) {
                console.error(err);
                toast.error("Failed to parse JSON file");
            } finally {
                e.target.value = ''; // Reset input
            }
        };
        reader.readAsText(file);
    };

    const handleConfirmImport = async (items: any[]) => {
        let successCount = 0;
        let failCount = 0;
        let lastError = "";

        for (const item of items) {
            const newItem: SampleNomenclature = {
                id: '', // Let DB generate
                group_id: groupId,
                logbook_id: logbookId,
                category: item.category,
                code: item.code,
                name: item.name
            };
            const res = await upsertNomenclatureAction(newItem);
            if (res.success) successCount++;
            else {
                failCount++;
                lastError = res.error || "Unknown error";
                console.error("Import error for item:", item, res.error);
            }
        }

        if (successCount > 0) toast.success(`Successfully imported ${successCount} items`);
        if (failCount > 0) toast.error(`Failed to import ${failCount} items. Last error: ${lastError}`);

        router.refresh();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Nomenclature Dictionary</h3>
                <div className="flex gap-2">
                    <label className="cursor-pointer flex items-center gap-2 text-sm bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 border border-slate-200">
                        <input type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
                        <span>Import</span>
                    </label>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 text-sm bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 border border-slate-200"
                    >
                        Export
                    </button>
                    <button
                        onClick={() => {
                            setEditing({ id: '', group_id: groupId, logbook_id: logbookId, category: '', code: '', name: '' });
                            setIsCreating(true);
                            setIsCreatingCategory(false);
                        }}
                        className="flex items-center gap-2 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 ml-2"
                    >
                        <Plus size={16} /> Add Item
                    </button>
                </div>
            </div>

            {/* Editor Form */}
            {editing && (
                <form onSubmit={handleSave} className="bg-slate-50 p-4 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-2">
                    <div className="grid grid-cols-12 gap-3 mb-3">
                        <div className="col-span-4">
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Category</label>
                            {isCreatingCategory ? (
                                <div className="flex gap-2">
                                    <input
                                        required
                                        autoFocus
                                        placeholder="New Category Name"
                                        className="w-full text-sm border rounded px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editing.category}
                                        onChange={e => setEditing({ ...editing, category: e.target.value })}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => { setIsCreatingCategory(false); setEditing({ ...editing, category: '' }); }}
                                        className="p-1.5 text-slate-500 hover:bg-slate-200 rounded"
                                        title="Cancel custom category"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <select
                                    required
                                    className="w-full text-sm border rounded px-2 py-1.5 bg-white"
                                    value={categories.includes(editing.category) ? editing.category : (editing.category ? '__NEW__' : '')}
                                    onChange={e => {
                                        if (e.target.value === '__NEW__') {
                                            setIsCreatingCategory(true);
                                            setEditing({ ...editing, category: '' });
                                        } else {
                                            setEditing({ ...editing, category: e.target.value });
                                        }
                                    }}
                                >
                                    <option value="" disabled>Select Category...</option>
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    <option value="__NEW__" className="text-blue-600 font-semibold">+ Create New Category</option>
                                </select>
                            )}
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Code</label>
                            <input
                                required
                                placeholder="e.g. Si"
                                className="w-full text-sm border rounded px-2 py-1.5"
                                value={editing.code}
                                onChange={e => setEditing({ ...editing, code: e.target.value })}
                            />
                        </div>
                        <div className="col-span-6">
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Name</label>
                            <input
                                required
                                placeholder="e.g. Silicon"
                                className="w-full text-sm border rounded px-2 py-1.5"
                                value={editing.name}
                                onChange={e => setEditing({ ...editing, name: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => { setEditing(null); setIsCreating(false); }}
                            className="text-sm text-slate-500 px-3 py-1.5"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="text-sm bg-slate-900 text-white px-3 py-1.5 rounded hover:bg-slate-800 flex items-center gap-2"
                        >
                            <Save size={14} /> Save
                        </button>
                    </div>
                </form>
            )}

            {/* List */}
            <div className="space-y-4">
                {categories.length === 0 && !isCreating && (
                    <div className="text-center text-slate-500 text-sm py-8">No nomenclature defined yet.</div>
                )}

                {categories.map(category => (
                    <div key={category} className="border rounded-lg overflow-hidden">
                        <div className="bg-slate-100 px-4 py-2 font-medium text-sm text-slate-700">
                            {category}
                        </div>
                        <div className="divide-y divide-slate-100">
                            {grouped[category].map(item => (
                                <div key={item.id} className="flex items-center justify-between px-4 py-2 hover:bg-slate-50 text-sm group">
                                    <div className="flex items-center gap-4">
                                        <span className="font-mono font-semibold text-blue-600 w-12">{item.code}</span>
                                        <span className="text-slate-700">{item.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => setEditing(item)}
                                            className="p-1 text-slate-400 hover:text-blue-600"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(item.id)}
                                            className="p-1 text-slate-400 hover:text-red-600"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <NomenclatureImportDialog
                isOpen={importDialogOpen}
                onClose={() => setImportDialogOpen(false)}
                candidates={importCandidates}
                existingItems={nomenclatures}
                onConfirm={handleConfirmImport}
            />
        </div>
    );
}

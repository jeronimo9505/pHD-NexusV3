'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SampleFieldConfig, SampleNomenclature, SampleFieldType } from '../types';
import { upsertFieldConfigAction, deleteFieldConfigAction } from '../actions';
import { toast } from 'sonner';
import { Trash2, Plus, GripVertical, Settings } from 'lucide-react';

export function FieldManager({
    groupId,
    logbookId,
    fields,
    nomenclatures
}: {
    groupId: string,
    logbookId: string,
    fields: SampleFieldConfig[],
    nomenclatures: SampleNomenclature[]
}) {
    const router = useRouter();
    const [editing, setEditing] = useState<SampleFieldConfig | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Get unique nomenclature categories for the dropdown
    const nomenclatureCategories = Array.from(new Set(nomenclatures.map(n => n.category))).sort();

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const item = editing!;

        // Auto-generate name from label if creating and name is empty
        if (!item.name && item.label) {
            item.name = item.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
        }

        const res = await upsertFieldConfigAction(item);
        if (res.error) toast.error(res.error);
        else {
            toast.success('Field saved');
            setEditing(null);
            setIsCreating(false);
            router.refresh(); // Refresh data
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this field? Existing data in this column will be hidden.')) return;
        const res = await deleteFieldConfigAction(id, groupId);
        if (res.error) toast.error(res.error);
        else {
            toast.success('Deleted');
            router.refresh(); // Refresh data
        }
    };

    const types: { value: SampleFieldType; label: string }[] = [
        { value: 'text', label: 'Text' },
        { value: 'number', label: 'Number' },
        { value: 'select', label: 'Select (Dropdown)' },
        { value: 'nomenclature', label: 'Nomenclature' },
        { value: 'date', label: 'Date' },
        { value: 'boolean', label: 'Checkbox (Yes/No)' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Data Columns (Fields)</h3>
                <button
                    onClick={() => {
                        setEditing({
                            id: '',
                            group_id: groupId,
                            logbook_id: logbookId,
                            name: '',
                            label: '',
                            type: 'text',
                            options: null,
                            required: false,
                            order: fields.length + 1
                        });
                        setIsCreating(true);
                    }}
                    className="flex items-center gap-2 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
                >
                    <Plus size={16} /> Add Column
                </button>
            </div>

            {/* Editor */}
            {editing && (
                <form onSubmit={handleSave} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Label (Header)</label>
                            <input
                                required
                                value={editing.label}
                                onChange={e => setEditing({ ...editing, label: e.target.value })}
                                className="w-full text-sm border rounded px-3 py-2"
                                placeholder="e.g. Temperature"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Field Type</label>
                            <select
                                value={editing.type}
                                onChange={e => setEditing({ ...editing, type: e.target.value as SampleFieldType })}
                                className="w-full text-sm border rounded px-3 py-2 bg-white"
                            >
                                {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Type-specific options */}
                    {editing.type === 'nomenclature' && (
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Nomenclature Category</label>
                            <select
                                required
                                value={editing.options?.category || ''}
                                onChange={e => setEditing({
                                    ...editing,
                                    options: { ...editing.options, category: e.target.value }
                                })}
                                className="w-full text-sm border rounded px-3 py-2 bg-white"
                            >
                                <option value="">Select a category...</option>
                                {nomenclatureCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <p className="text-xs text-slate-400 mt-1">
                                Determines which codes are available in the dropdown.
                            </p>
                        </div>
                    )}

                    {editing.type === 'select' && (
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Options (comma separated)</label>
                            <input
                                value={editing.options?.values?.join(', ') || ''}
                                onChange={e => setEditing({
                                    ...editing,
                                    options: { ...editing.options, values: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }
                                })}
                                className="w-full text-sm border rounded px-3 py-2"
                                placeholder="Option 1, Option 2, ..."
                            />
                        </div>
                    )}

                    <div className="flex items-center gap-2 mb-4">
                        <input
                            type="checkbox"
                            id="required_check"
                            checked={editing.required}
                            onChange={e => setEditing({ ...editing, required: e.target.checked })}
                            className="rounded border-slate-300"
                        />
                        <label htmlFor="required_check" className="text-sm text-slate-700">Required field</label>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => { setEditing(null); setIsCreating(false); }}
                            className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm bg-slate-900 text-white rounded hover:bg-slate-800"
                        >
                            Save Column
                        </button>
                    </div>
                </form>
            )}

            {/* Field List */}
            <div className="border rounded-lg overflow-hidden bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-medium">
                        <tr>
                            <th className="px-4 py-2 w-10"></th>
                            <th className="px-4 py-2">Label</th>
                            <th className="px-4 py-2">Type</th>
                            <th className="px-4 py-2">Details</th>
                            <th className="px-4 py-2 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {fields.map((field) => (
                            <tr key={field.id} className="hover:bg-slate-50 group">
                                <td className="px-4 py-2 text-slate-300 cursor-move">
                                    <GripVertical size={16} />
                                </td>
                                <td className="px-4 py-2 font-medium text-slate-900">{field.label}</td>
                                <td className="px-4 py-2 text-slate-500 capitalize">{field.type}</td>
                                <td className="px-4 py-2 text-slate-400 text-xs text-ellipsis overflow-hidden whitespace-nowrap max-w-[200px]">
                                    {field.type === 'nomenclature' && `Ref: ${field.options?.category}`}
                                    {field.type === 'select' && `Opts: ${field.options?.values?.join(', ')}`}
                                    {field.required && <span className="text-red-500 ml-2 font-bold">*Req</span>}
                                </td>
                                <td className="px-4 py-2 text-right">
                                    <button
                                        onClick={() => setEditing(field)}
                                        className="p-1 text-slate-400 hover:text-blue-600 mr-1"
                                    >
                                        <Settings size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(field.id)}
                                        className="p-1 text-slate-400 hover:text-red-600"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {fields.length === 0 && !isCreating && (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-slate-500">
                                    No custom columns defined. Add one to start tracking data.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

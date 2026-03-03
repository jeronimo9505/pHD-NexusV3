import { useState, useMemo, useEffect } from 'react';
import { SampleNomenclature } from '../types';
import { X, Check, AlertCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NomenclatureImportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    candidates: any[]; // Raw JSON data
    existingItems: SampleNomenclature[];
    onConfirm: (items: any[]) => Promise<void>;
}

export function NomenclatureImportDialog({
    isOpen,
    onClose,
    candidates,
    existingItems,
    onConfirm
}: NomenclatureImportDialogProps) {
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Analyze candidates
    const analyzed = useMemo(() => {
        return candidates.map((item, index) => {
            // Basic validation
            if (!item.category || !item.code || !item.name) {
                return { ...item, status: 'invalid', originalIndex: index };
            }

            // Check duplicate
            const exists = existingItems.some(
                e => e.category === item.category && e.code === item.code
            );

            return {
                ...item,
                status: exists ? 'duplicate' : 'new',
                originalIndex: index
            };
        });
    }, [candidates, existingItems]);

    // Pre-select all new items on open
    useEffect(() => {
        if (isOpen) {
            const newIndices = new Set<number>();
            analyzed.forEach((item, idx) => {
                if (item.status === 'new') newIndices.add(idx);
            });
            setSelectedIndices(newIndices);
        }
    }, [isOpen, analyzed]);

    const handleToggle = (index: number) => {
        const next = new Set(selectedIndices);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        setSelectedIndices(next);
    };

    const handleConfirm = async () => {
        setIsSubmitting(true);
        const toImport = analyzed
            .filter((_, idx) => selectedIndices.has(idx))
            .map(item => ({
                category: item.category,
                code: item.code,
                name: item.name
                // remove status/index info
            }));

        await onConfirm(toImport);
        setIsSubmitting(false);
        onClose();
    };

    if (!isOpen) return null;

    const newCount = analyzed.filter(i => i.status === 'new').length;
    const duplicateCount = analyzed.filter(i => i.status === 'duplicate').length;
    const invalidCount = analyzed.filter(i => i.status === 'invalid').length;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-slate-800">Import Nomenclature</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex gap-6 text-sm">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="font-medium text-slate-700">{newCount} New</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-300" />
                        <span className="font-medium text-slate-500">{duplicateCount} Duplicate (Skipped)</span>
                    </div>
                    {invalidCount > 0 && (
                        <div className="flex items-center gap-2 text-red-600">
                            <AlertCircle size={14} />
                            <span className="font-medium">{invalidCount} Invalid</span>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-white text-slate-500 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-2 w-10">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300"
                                        checked={newCount > 0 && selectedIndices.size === newCount}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                const allNew = new Set<number>();
                                                analyzed.forEach((item, idx) => {
                                                    if (item.status === 'new') allNew.add(idx);
                                                });
                                                setSelectedIndices(allNew);
                                            } else {
                                                setSelectedIndices(new Set());
                                            }
                                        }}
                                        disabled={newCount === 0}
                                    />
                                </th>
                                <th className="px-4 py-2">Category</th>
                                <th className="px-4 py-2">Code</th>
                                <th className="px-4 py-2">Name</th>
                                <th className="px-4 py-2 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {analyzed.map((item, idx) => (
                                <tr
                                    key={idx}
                                    className={cn(
                                        "hover:bg-slate-50 transition-colors",
                                        item.status === 'duplicate' && "opacity-60 bg-slate-50/50 grayscale"
                                    )}
                                    onClick={() => item.status === 'new' && handleToggle(idx)}
                                >
                                    <td className="px-4 py-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedIndices.has(idx)}
                                            onChange={() => handleToggle(idx)}
                                            disabled={item.status !== 'new'}
                                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                        />
                                    </td>
                                    <td className="px-4 py-2 font-medium text-slate-700">{item.category}</td>
                                    <td className="px-4 py-2 font-mono text-blue-600">{item.code}</td>
                                    <td className="px-4 py-2 text-slate-600">{item.name}</td>
                                    <td className="px-4 py-2 text-right">
                                        {item.status === 'new' && (
                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                                                New
                                            </span>
                                        )}
                                        {item.status === 'duplicate' && (
                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-500">
                                                Exists
                                            </span>
                                        )}
                                        {item.status === 'invalid' && (
                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">
                                                Invalid
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedIndices.size === 0 || isSubmitting}
                        className="px-4 py-2 text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSubmitting ? 'Importing...' : `Import ${selectedIndices.size} Items`}
                    </button>
                </div>
            </div>
        </div>
    );
}

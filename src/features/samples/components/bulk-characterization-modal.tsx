'use client';

import { useState, useEffect } from 'react';
import { createBulkCharacterizationAction } from '../actions';
import { toast } from 'sonner';
import { X, Save, Plus, Trash2, Microscope, ChevronUp, ChevronDown, Loader2, GripVertical, List } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkCharacterizationModalProps {
    groupId: string;
    isOpen: boolean;
    onClose: () => void;
    sampleIds: string[];
    onSuccess: () => void;
    // Unit history props
    parameterUnits: Record<string, string[]>;
    setParameterUnits: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
    lastUnits: Record<string, string>;
    setLastUnits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    // Parameter Order Props
    parameterOrder: Record<string, string[]>;
    setParameterOrder: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

const CHAR_TYPES = ['Raman', 'AFM', 'SEM', 'UV-Vis', 'X-Ray', 'Other'];

export function BulkCharacterizationModal({
    groupId,
    isOpen,
    onClose,
    sampleIds,
    onSuccess,
    parameterUnits,
    setParameterUnits,
    lastUnits,
    setLastUnits,
    parameterOrder,
    setParameterOrder
}: BulkCharacterizationModalProps) {
    const [type, setType] = useState(CHAR_TYPES[0]);
    const [equipment, setEquipment] = useState('');
    const [dataFields, setDataFields] = useState<{ key: string; value: string; unit: string }[]>([{ key: '', value: '', unit: '' }]);
    const [notes, setNotes] = useState('');
    const [performedAt, setPerformedAt] = useState(new Date().toISOString().split('T')[0]);

    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            handleTypeSelection(CHAR_TYPES[0]);
            setEquipment('');
            setNotes('');
            setPerformedAt(new Date().toISOString().split('T')[0]);
        }
    }, [isOpen]);

    const handleTypeSelection = (newType: string) => {
        setType(newType);
        const defaults: Record<string, string[]> = {
            'Raman': ['Laser', 'Objective', 'Acquisition Time', 'Measurement Type', 'Power']
        };
        const defaultKeys = defaults[newType] || [];
        const savedOrder = parameterOrder[newType];
        let finalKeys = [...defaultKeys];

        if (savedOrder && savedOrder.length > 0) {
            const uniqueSaved = Array.from(new Set(savedOrder));
            const missingStandard = defaultKeys.filter(k => !uniqueSaved.includes(k));
            finalKeys = [...uniqueSaved, ...missingStandard];
        }

        const newFields = finalKeys.map(key => ({
            key,
            value: '',
            unit: lastUnits[key] || ''
        }));

        setDataFields(newFields.length > 0 ? newFields : [{ key: '', value: '', unit: '' }]);
    };

    const handleFieldChange = (index: number, field: 'key' | 'value' | 'unit', val: string) => {
        const newFields = [...dataFields];
        newFields[index][field] = val;
        setDataFields(newFields);
        if (field === 'key' && val && lastUnits[val] && !newFields[index].unit) {
            newFields[index].unit = lastUnits[val];
        }
    };

    const handleAddField = () => setDataFields([...dataFields, { key: '', value: '', unit: '' }]);
    const handleRemoveField = (index: number) => {
        if (dataFields.length === 1) setDataFields([{ key: '', value: '', unit: '' }]);
        else setDataFields(dataFields.filter((_, i) => i !== index));
    };

    const handleMoveField = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === dataFields.length - 1) return;
        const newFields = [...dataFields];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
        setDataFields(newFields);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const cleanData: Record<string, any> = {};
        const orderedKeys: string[] = [];

        dataFields.forEach(field => {
            if (field.key.trim()) {
                const k = field.key.trim();
                const v = field.value.trim();
                const u = field.unit.trim();
                if (v || u) {
                    cleanData[k] = u ? `${v} ${u}` : v;
                    orderedKeys.push(k);
                    if (u) {
                        setLastUnits(prev => ({ ...prev, [k]: u }));
                        setParameterUnits(prev => {
                            const existing = prev[k] || [];
                            return existing.includes(u) ? prev : { ...prev, [k]: [...existing, u] };
                        });
                    }
                }
            }
        });

        if (notes.trim()) cleanData['notes'] = notes.trim();
        if (equipment.trim()) cleanData['equipment'] = equipment.trim();
        cleanData['__order__'] = orderedKeys;

        const res = await createBulkCharacterizationAction({
            group_id: groupId,
            sample_ids: sampleIds,
            type,
            data: cleanData,
            performed_at: performedAt ? new Date(performedAt).toISOString() : undefined
        });

        setIsSubmitting(false);

        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success(`Characterization added to ${sampleIds.length} samples`);
            onSuccess();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-100 text-blue-600 rounded-lg">
                            <Microscope size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 leading-tight">Bulk Characterization</h2>
                            <div className="text-xs text-slate-500">Applying to <span className="font-bold text-blue-600">{sampleIds.length}</span> samples</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-4 space-y-6">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Technique</label>
                                <select value={type} onChange={e => handleTypeSelection(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-medium text-slate-700 shadow-sm">
                                    {CHAR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <input value={equipment} onChange={e => setEquipment(e.target.value)} placeholder="Equipment Name" className="w-full mt-3 text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400" />
                                <div className="pt-2">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</label>
                                    <input type="date" value={performedAt} onChange={e => setPerformedAt(e.target.value)} className="w-full mt-1.5 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-medium text-slate-700" />
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-8 space-y-6">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><List size={16} className="text-blue-500" /> Data Points</h3>
                                <button type="button" onClick={handleAddField} className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md font-medium hover:bg-blue-100 transition-colors"><Plus size={14} /> Add Parameter</button>
                            </div>

                            <div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm">
                                <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider gap-4">
                                    <div className="col-span-1 text-center">#</div>
                                    <div className="col-span-4">Parameter</div>
                                    <div className="col-span-4">Value</div>
                                    <div className="col-span-2">Unit</div>
                                    <div className="col-span-1"></div>
                                </div>
                                <div className="divide-y divide-slate-100 overflow-y-auto max-h-[350px]">
                                    {dataFields.map((field, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-4 items-center px-4 py-2 hover:bg-slate-50/50 group transition-colors">
                                            <div className="col-span-1 flex flex-col items-center justify-center gap-0.5">
                                                <button onClick={() => handleMoveField(idx, 'up')} className="p-0.5 text-slate-400 hover:text-blue-600 disabled:opacity-20" disabled={idx === 0}><ChevronUp size={12} /></button>
                                                <GripVertical size={12} className="text-slate-300" />
                                                <button onClick={() => handleMoveField(idx, 'down')} className="p-0.5 text-slate-400 hover:text-blue-600 disabled:opacity-20" disabled={idx === dataFields.length - 1}><ChevronDown size={12} /></button>
                                            </div>
                                            <div className="col-span-4 self-center">
                                                <input value={field.key} onChange={e => handleFieldChange(idx, 'key', e.target.value)} placeholder="Parameter" className="w-full text-sm font-medium bg-transparent border-none p-0 focus:ring-0 placeholder:text-slate-300 text-slate-800" />
                                            </div>
                                            <div className="col-span-4">
                                                <input value={field.value} onChange={e => handleFieldChange(idx, 'value', e.target.value)} placeholder="Value" className="w-full text-sm font-mono bg-slate-50 border border-transparent focus:bg-white focus:border-blue-200 rounded px-2 py-1 focus:ring-0 text-slate-700 placeholder:text-slate-300 transition-colors" />
                                            </div>
                                            <div className="col-span-2 relative">
                                                <input value={field.unit} onChange={e => handleFieldChange(idx, 'unit', e.target.value)} placeholder="Unit" className="w-full text-xs bg-transparent border-b border-transparent focus:border-blue-300 p-1 focus:ring-0 text-slate-500 placeholder:text-slate-300 text-right" />
                                            </div>
                                            <div className="col-span-1 flex justify-end">
                                                <button onClick={() => handleRemoveField(idx)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes apply to all selected samples..." className="w-full h-24 text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none bg-slate-50/30" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-lg disabled:opacity-70 disabled:cursor-not-allowed">
                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Apply to {sampleIds.length} Samples
                    </button>
                </div>
            </div>
        </div>
    );
}

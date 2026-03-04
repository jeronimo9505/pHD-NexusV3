'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Sample, SampleCharacterization } from '../types';
import { createCharacterizationAction, updateCharacterizationAction } from '../actions';
import { toast } from 'sonner';
import { X, Save, FileText, Plus, Trash2, Microscope, FileJson, ChevronUp, ChevronDown, Loader2, ExternalLink, FolderOpen, GripVertical, List } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CharacterizationModalProps {
    groupId: string;
    isOpen: boolean;
    onClose: () => void;
    sample: Sample;
    initialData?: SampleCharacterization | null;
    // Unit history props
    parameterUnits: Record<string, string[]>;
    setParameterUnits: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
    lastUnits: Record<string, string>;
    setLastUnits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    // Parameter Order Props
    parameterOrder: Record<string, string[]>;
    setParameterOrder: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
    // Drive settings
    driveSettings?: { clientId?: string; apiKey?: string; folderId?: string; sampleFolderId?: string };
}

const CHAR_TYPES = ['Raman', 'AFM', 'SEM', 'UV-Vis', 'X-Ray', 'Other'];

export function CharacterizationModal({
    groupId,
    isOpen,
    onClose,
    sample,
    initialData,
    parameterUnits,
    setParameterUnits,
    lastUnits,
    setLastUnits,
    parameterOrder,
    setParameterOrder,
    driveSettings
}: CharacterizationModalProps) {
    const [type, setType] = useState(CHAR_TYPES[0]);
    const [equipment, setEquipment] = useState('');
    const [dataFields, setDataFields] = useState<{ key: string; value: string; unit: string }[]>([{ key: '', value: '', unit: '' }]);
    const [notes, setNotes] = useState('');
    const [fileOrigin, setFileOrigin] = useState('');
    const [driveFileLink, setDriveFileLink] = useState('');
    const [performedAt, setPerformedAt] = useState(new Date().toISOString().split('T')[0]);

    // UI States
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
    const [scriptsLoaded, setScriptsLoaded] = useState(false);
    const [updateBatch, setUpdateBatch] = useState(false);
    const [hasBulkId, setHasBulkId] = useState(false);

    // Initialize Google Scripts
    useEffect(() => {
        if (isOpen && driveSettings?.apiKey && driveSettings?.clientId && !scriptsLoaded) {
            import('@/lib/google/auth').then(({ initGoogleClient }) => {
                initGoogleClient(driveSettings.apiKey!, driveSettings.clientId!)
                    .then(() => setScriptsLoaded(true))
                    .catch((e) => console.warn('Google init failed:', e));
            });
        }
    }, [isOpen, driveSettings, scriptsLoaded]);

    // Load Initial Data
    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                // Edit Mode
                setType(initialData.type);
                setEquipment(initialData.data.equipment || '');
                setNotes(initialData.data.notes || '');
                setFileOrigin(initialData.data.file_origin || '');
                setDriveFileLink(initialData.data.drive_file_link || '');
                setPerformedAt(initialData.performed_at ? initialData.performed_at.split('T')[0] : new Date().toISOString().split('T')[0]);
                setHasBulkId(!!initialData.data?.__bulk_id__);

                const fields: { key: string; value: string; unit: string }[] = [];
                const data = initialData.data;
                const order = data.__order__ as string[] || []; // Prefer saved order in record

                const separateUnit = (val: string): { v: string; u: string } => {
                    const match = val.match(/^([\d\.]+)\s*([a-zA-Z%μµ°Ω]+)$/);
                    if (match) return { v: match[1], u: match[2] };
                    if (val.match(/^x\d+$/)) return { v: val.replace('x', ''), u: 'x' };
                    if (val.match(/^\d+x$/)) return { v: val.replace('x', ''), u: 'x' };
                    return { v: val, u: '' };
                };

                const processedKeys = new Set<string>();

                // 1. Process Ordered Keys
                order.forEach(k => {
                    if (data[k] !== undefined) {
                        const { v, u } = separateUnit(String(data[k]));
                        fields.push({ key: k, value: v, unit: u });
                        processedKeys.add(k);
                    }
                });

                // 2. Process Remaining Keys
                Object.entries(data).forEach(([k, v]) => {
                    if (!processedKeys.has(k) && !['equipment', 'notes', '__order__', 'file_origin', 'drive_file_link'].includes(k)) {
                        const { v: val, u: unit } = separateUnit(String(v));
                        fields.push({ key: k, value: val, unit: unit });
                    }
                });

                setDataFields(fields.length > 0 ? fields : [{ key: '', value: '', unit: '' }]);

            } else {
                // New Mode
                // Reset basic fields
                setEquipment('');
                setNotes('');
                setFileOrigin('');
                setDriveFileLink('');
                setPerformedAt(new Date().toISOString().split('T')[0]);
                setHasBulkId(false);
                setUpdateBatch(false);

                // Set type (default Raman or keep last? typically default to first)
                // Actually if we just opened, we can default to Raman.
                // But let's check if we should trigger the type change logic manually to load defaults.
                handleTypeSelection(CHAR_TYPES[0]);
            }
        }
    }, [isOpen, initialData]);

    const handleTypeSelection = (newType: string) => {
        setType(newType);

        // Load defaults for this type if creating new
        if (!initialData) {
            const defaults: Record<string, string[]> = {
                'Raman': ['Laser', 'Objective', 'Acquisition Time', 'Measurement Type', 'Power']
            };

            const defaultKeys = defaults[newType] || [];

            // Check global order preference
            const savedOrder = parameterOrder[newType];
            let finalKeys = [...defaultKeys];

            if (savedOrder && savedOrder.length > 0) {
                // Merge stored order with defaults to ensure we don't lose standard fields but respect user sort
                const uniqueSaved = Array.from(new Set(savedOrder));
                const standardSet = new Set(defaultKeys);

                // Items in saved order (whether standard or custom)
                const savedExisting = uniqueSaved;

                // Standard items completely missing from saved order (new features?)
                const missingStandard = defaultKeys.filter(k => !uniqueSaved.includes(k));

                finalKeys = [...savedExisting, ...missingStandard];
            }

            const newFields = finalKeys.map(key => ({
                key,
                value: '',
                unit: lastUnits[key] || ''
            }));

            setDataFields(newFields.length > 0 ? newFields : [{ key: '', value: '', unit: '' }]);
        }
    };

    const handleFieldChange = (index: number, field: 'key' | 'value' | 'unit', val: string) => {
        const newFields = [...dataFields];
        newFields[index][field] = val;
        setDataFields(newFields);

        // Unit history update on change/blur is better, but let's do it here for responsiveness
        // We only commit to history on save or blur usually, but keeping text correct is key.

        // If updating key, try to auto-fill unit from history
        if (field === 'key' && val && lastUnits[val] && !newFields[index].unit) {
            newFields[index].unit = lastUnits[val];
        }
    };

    const handleAddField = () => {
        setDataFields([...dataFields, { key: '', value: '', unit: '' }]);
    };

    const handleRemoveField = (index: number) => {
        if (dataFields.length === 1) {
            setDataFields([{ key: '', value: '', unit: '' }]);
        } else {
            setDataFields(dataFields.filter((_, i) => i !== index));
        }
    };

    const handleMoveField = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === dataFields.length - 1) return;

        const newFields = [...dataFields];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
        setDataFields(newFields);

        // Persist Global Order Preference
        const orderToSave = newFields.map(f => f.key.trim()).filter(Boolean);
        if (type && orderToSave.length > 0) {
            setParameterOrder(prev => ({
                ...prev,
                [type]: orderToSave
            }));
        }
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

                if (v || u) { // Only save if there is a value or unit (or should we strictly require value?)
                    cleanData[k] = u ? `${v} ${u}` : v;
                    orderedKeys.push(k);

                    // Update History
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
        if (fileOrigin.trim()) cleanData['file_origin'] = fileOrigin.trim();
        if (driveFileLink.trim()) cleanData['drive_file_link'] = driveFileLink.trim();

        // Critical: Save the order
        cleanData['__order__'] = orderedKeys;

        // Also update global preference if we have valid keys
        if (orderedKeys.length > 0) {
            setParameterOrder(prev => ({ ...prev, [type]: orderedKeys }));
        }

        let res;
        if (initialData) {
            res = await updateCharacterizationAction({
                id: initialData.id,
                group_id: groupId,
                type,
                data: cleanData,
                performed_at: performedAt ? new Date(performedAt).toISOString() : undefined,
                updateBatch: updateBatch
            });
        } else {
            res = await createCharacterizationAction({
                group_id: groupId,
                sample_id: sample.id,
                type,
                data: cleanData,
                performed_at: performedAt ? new Date(performedAt).toISOString() : undefined
            });
        }

        setIsSubmitting(false);

        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success(initialData ? 'Updated' : 'Created');
            onClose();
        }
    };

    // Google Doc Generation Helper
    const handleGenerateDoc = async () => {
        setIsGeneratingDoc(true);
        try {
            const { ensureAuth } = await import('@/lib/google/auth');
            await ensureAuth();
            const gapi = (window as any).gapi;

            // Build doc name: Code_Name_Type_Conditions
            const conditionParts = dataFields
                .filter(f => f.key.trim() && f.value.trim())
                .map(f => f.unit ? `${f.value}${f.unit}` : f.value);
            const conditionStr = conditionParts.join('-');
            const docName = [
                sample.sample_code || sample.display_id,
                sample.name || '',
                type,
                conditionStr
            ].filter(Boolean).join('_');

            // Create the Google Doc
            const fileMeta: any = {
                name: docName,
                mimeType: 'application/vnd.google-apps.document'
            };
            // Use sampleFolderId if configured, otherwise fall back to root folderId
            const targetFolderId = driveSettings?.sampleFolderId || driveSettings?.folderId;
            if (targetFolderId) {
                fileMeta.parents = [targetFolderId];
            }
            const createRes = await gapi.client.drive.files.create({
                resource: fileMeta,
                fields: 'id, webViewLink'
            });
            const fileId = createRes.result.id;

            // Build rich document content
            const text = `CHARACTERIZATION REPORT\n${'='.repeat(40)}\n\n` +
                `Sample: ${sample.name}\nCode: ${sample.sample_code || '-'}\nType: ${type}\nEquipment: ${equipment}\n\n` +
                `PARAMETERS:\n${dataFields.map(f => f.key ? `- ${f.key}: ${f.value} ${f.unit}` : '').join('\n')}\n` +
                (notes ? `\nNOTES:\n${notes}\n` : '') +
                (fileOrigin ? `\nFILE ORIGIN: ${fileOrigin}` : '');

            await gapi.client.docs.documents.batchUpdate({
                documentId: fileId,
                resource: {
                    requests: [{
                        insertText: { location: { index: 1 }, text }
                    }]
                }
            });

            const link = createRes.result.webViewLink || `https://docs.google.com/document/d/${fileId}/edit`;
            setDriveFileLink(link);
            toast.success('Doc created');
            window.open(link, '_blank');
        } catch (err: any) {
            console.error('Doc Gen Error', err);
            toast.error(err.message || 'Error generating doc');
        } finally {
            setIsGeneratingDoc(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-purple-100 text-purple-600 rounded-lg">
                            <Microscope size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 leading-tight">
                                {initialData ? 'Edit Characterization' : 'New Characterization'}
                            </h2>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{sample.name}</span>
                                <span>•</span>
                                <span>{type}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                        {/* Left Column: Metadata */}
                        <div className="lg:col-span-4 space-y-6">

                            {/* Technique Selection */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Technique</label>
                                <div className="space-y-3">
                                    <div className="relative">
                                        <select
                                            value={type}
                                            onChange={e => handleTypeSelection(e.target.value)}
                                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none appearance-none font-medium text-slate-700 shadow-sm"
                                        >
                                            {CHAR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                                    </div>

                                    <div className="relative">
                                        <input
                                            value={equipment}
                                            onChange={e => setEquipment(e.target.value)}
                                            placeholder="Equipment Name (e.g. Horiba)"
                                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all placeholder:text-slate-400"
                                        />
                                    </div>

                                    <div className="space-y-1.5 pt-2">
                                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Experiment Date</label>
                                        <input
                                            type="date"
                                            value={performedAt}
                                            onChange={e => setPerformedAt(e.target.value)}
                                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none font-medium text-slate-700"
                                        />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-slate-100" />

                            {/* External Links */}
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <FolderOpen size={13} /> Raw Data
                                    </label>
                                    <input
                                        value={fileOrigin}
                                        onChange={e => setFileOrigin(e.target.value)}
                                        placeholder="Path to raw files..."
                                        className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition-all text-slate-600 bg-slate-50/50"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <FileText size={13} /> Documentation
                                    </label>

                                    {driveFileLink ? (
                                        <div className="flex items-center gap-2 p-1 border border-blue-100 bg-blue-50 rounded-lg">
                                            <a href={driveFileLink} target="_blank" className="flex-1 flex items-center gap-2 px-2 py-1.5 text-xs text-blue-700 hover:underline truncate">
                                                <ExternalLink size={12} />
                                                <span className="truncate">Open Google Doc</span>
                                            </a>
                                            <button onClick={() => setDriveFileLink('')} className="p-1.5 hover:bg-white rounded text-blue-400 hover:text-red-500 transition-colors">
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleGenerateDoc}
                                            disabled={!scriptsLoaded || isGeneratingDoc}
                                            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {isGeneratingDoc ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                            Generate Report
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Parameters & Notes */}
                        <div className="lg:col-span-8 flex flex-col h-full space-y-6">

                            {/* Parameters Grid */}
                            <div className="flex-1 flex flex-col min-h-[300px]">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                            <List size={16} className="text-blue-500" />
                                            Data Points
                                        </h3>
                                        <p className="text-xs text-slate-400">Define experimental conditions and results</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddField}
                                        className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md font-medium hover:bg-blue-100 transition-colors"
                                    >
                                        <Plus size={14} /> Add Parameter
                                    </button>
                                </div>

                                <div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm flex flex-col">
                                    {/* Table Header */}
                                    <div className="grid grid-cols-12 bg-slate-50/80 border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider gap-4">
                                        <div className="col-span-1 text-center">#</div>
                                        <div className="col-span-4">Parameter Name</div>
                                        <div className="col-span-4">Value</div>
                                        <div className="col-span-2">Unit</div>
                                        <div className="col-span-1"></div>
                                    </div>

                                    {/* Table Rows */}
                                    <div className="divide-y divide-slate-100 overflow-y-auto max-h-[350px]">
                                        {dataFields.map((field, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-4 items-center px-4 py-2 hover:bg-slate-50/50 group transition-colors">

                                                {/* Reorder Controls */}
                                                <div className="col-span-1 flex flex-col items-center justify-center gap-0.5">
                                                    <button
                                                        onClick={() => handleMoveField(idx, 'up')}
                                                        className="p-0.5 text-slate-400 hover:text-blue-600 disabled:opacity-20"
                                                        disabled={idx === 0}
                                                    >
                                                        <ChevronUp size={12} />
                                                    </button>
                                                    <GripVertical size={12} className="text-slate-300" />
                                                    <button
                                                        onClick={() => handleMoveField(idx, 'down')}
                                                        className="p-0.5 text-slate-400 hover:text-blue-600 disabled:opacity-20"
                                                        disabled={idx === dataFields.length - 1}
                                                    >
                                                        <ChevronDown size={12} />
                                                    </button>
                                                </div>

                                                <div className="col-span-4">
                                                    <input
                                                        value={field.key}
                                                        onChange={e => handleFieldChange(idx, 'key', e.target.value)}
                                                        placeholder="Parameter"
                                                        className="w-full text-sm font-medium bg-transparent border-none p-0 focus:ring-0 placeholder:text-slate-300 text-slate-800"
                                                    />
                                                </div>

                                                <div className="col-span-4">
                                                    <input
                                                        value={field.value}
                                                        onChange={e => handleFieldChange(idx, 'value', e.target.value)}
                                                        placeholder="Value"
                                                        className="w-full text-sm font-mono bg-slate-50 border border-transparent focus:bg-white focus:border-blue-200 rounded px-2 py-1 focus:ring-0 text-slate-700 placeholder:text-slate-300 transition-colors"
                                                    />
                                                </div>

                                                <div className="col-span-2 relative">
                                                    <input
                                                        list={`units-list-${idx}`}
                                                        value={field.unit}
                                                        onChange={e => handleFieldChange(idx, 'unit', e.target.value)}
                                                        placeholder="Unit"
                                                        className="w-full text-xs bg-transparent border-b border-transparent focus:border-purple-300 p-1 focus:ring-0 text-slate-500 placeholder:text-slate-300 text-right"
                                                    />
                                                    <datalist id={`units-list-${idx}`}>
                                                        {field.key && parameterUnits[field.key] ?
                                                            parameterUnits[field.key].map(u => <option key={u} value={u} />) :
                                                            ['nm', 'µm', '%', 's', 'min', 'Hz', 'V', 'mW'].map(u => <option key={u} value={u} />)
                                                        }
                                                    </datalist>
                                                </div>

                                                <div className="col-span-1 flex justify-end">
                                                    <button
                                                        onClick={() => handleRemoveField(idx)}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Empty State / Footer */}
                                    {dataFields.length === 0 && (
                                        <div className="p-8 text-center text-slate-400 bg-slate-50">
                                            No parameters defined yet.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Notes Area */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes & Observations</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Enter additional details..." className="w-full h-24 text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none bg-slate-50/30" />
                            </div>

                            {hasBulkId && (
                                <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="updateBatch"
                                        checked={updateBatch}
                                        onChange={e => setUpdateBatch(e.target.checked)}
                                        className="h-4 w-4 rounded border-orange-300 text-orange-600 focus:ring-orange-500"
                                    />
                                    <label htmlFor="updateBatch" className="text-sm font-medium text-orange-800 cursor-pointer">
                                        Update all samples in this batch <span className="text-xs font-normal opacity-70">(Apply changes to grouped records)</span>
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-lg shadow-purple-900/10 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {initialData ? 'Update Record' : 'Save Record'}
                    </button>
                </div>
            </div>
        </div>
    );
}

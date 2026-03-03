'use client';

import { useState, useEffect } from 'react';
import { CreateSampleInput, Sample, SampleFieldConfig, SampleNomenclature, SampleType, SampleCompositionItem } from '../types';
import { createSampleAction, updateSampleAction } from '../actions';
import { toast } from 'sonner';
import { X, Save, Plus, Trash2, GripVertical, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable helper component
function SortableCompositionItem({
    item,
    idx,
    removeBlock,
    updateItem
}: {
    item: SampleCompositionItem & { id: string };
    idx: number;
    removeBlock: (index: number) => void;
    updateItem: (index: number, newItem: SampleCompositionItem & { id: string }) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: item.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.8 : 1,
        position: 'relative' as const
    };

    return (
        <div ref={setNodeRef} style={style} className={cn(
            "bg-white rounded border border-slate-200 shadow-sm transition-all group hover:border-blue-300",
            isDragging && "shadow-lg ring-2 ring-blue-500/20"
        )}>
            {/* Item Header */}
            <div className="flex items-center gap-2 p-1.5 pl-2">
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing p-1 -ml-1 focus:outline-none"
                    style={{ touchAction: 'none' }}
                >
                    <GripVertical size={12} />
                </div>
                <div className="w-5 h-5 bg-slate-100 rounded flex items-center justify-center text-[10px] font-bold text-slate-500 border border-slate-200 select-none">
                    {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium text-slate-800 truncate select-none">{item.value}</span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide truncate select-none">{item.category}</span>
                    </div>
                </div>
                <div className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-mono font-medium rounded border border-blue-100 select-none">
                    {item.code}
                </div>

                {/* Note Toggle */}
                <button
                    type="button"
                    onClick={() => {
                        if (item.notes !== undefined) {
                            const { notes, ...rest } = item;
                            updateItem(idx, rest as any);
                        } else {
                            updateItem(idx, { ...item, notes: '' });
                        }
                    }}
                    className={cn(
                        "p-1 rounded transition-colors",
                        item.notes !== undefined ? "text-blue-600 bg-blue-50 hover:bg-blue-100" : "text-slate-300 hover:text-slate-500 hover:bg-slate-50"
                    )}
                    title={item.notes !== undefined ? "Remove Note" : "Add Note / Details"}
                >
                    <FileText size={12} />
                </button>

                <button
                    type="button"
                    onClick={() => removeBlock(idx)}
                    className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                >
                    <Trash2 size={12} />
                </button>
            </div>

            {/* Note Input */}
            {item.notes !== undefined && (
                <div className="px-8 pb-2 animate-in slide-in-from-top-1 duration-200">
                    <textarea
                        value={item.notes}
                        onChange={(e) => updateItem(idx, { ...item, notes: e.target.value })}
                        placeholder="Add conditions, criteria, date, etc..."
                        className="w-full text-xs border-slate-200 rounded bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-h-[40px] resize-y placeholder:text-slate-400"
                        autoFocus={item.notes === ''}
                        onKeyDown={(e) => e.stopPropagation()} // Prevent DnD interference
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}

interface SampleFormProps {
    groupId: string;
    logbookId: string;
    logbookPrefix: string;
    isOpen: boolean;
    onClose: () => void;
    fields: SampleFieldConfig[];
    nomenclatures: SampleNomenclature[];
    existingSamples: Sample[];
    initialData?: Sample | null;
    initialType?: SampleType;
    initialParentId?: string;
    initialComposition?: SampleCompositionItem[];
}

export function SampleForm({
    groupId,
    logbookId,
    logbookPrefix,
    isOpen,
    onClose,
    fields,
    nomenclatures,
    existingSamples,
    initialData,
    initialType = 'stock',
    initialParentId = '',
    initialComposition = []
}: SampleFormProps) {
    const isEdit = !!initialData;

    // State
    const [namePreview, setNamePreview] = useState(initialData?.name || '');
    const [sampleCode, setSampleCode] = useState(initialData?.sample_code || '');
    const [type, setType] = useState<SampleType>(initialData?.type || initialType);
    const [parentId, setParentId] = useState<string>(initialData?.parent_id || initialParentId);
    const [attributes, setAttributes] = useState<Record<string, any>>(initialData?.attributes || {});
    // Initialize composition with IDs for DnD
    const [composition, setComposition] = useState<(SampleCompositionItem & { id: string })[]>(() => {
        const base = initialData?.composition || initialComposition || [];
        return base.map(c => ({
            ...c,
            id: Math.random().toString(36).substring(7)
        }));
    });
    const [description, setDescription] = useState(initialData?.description || '');

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setComposition((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const updateItem = (index: number, newItem: SampleCompositionItem & { id: string }) => {
        const newComp = [...composition];
        newComp[index] = newItem;
        setComposition(newComp);
    };

    // Auto-generate Name Preview
    useEffect(() => {
        if (composition.length > 0) {
            setNamePreview(composition.map(c => c.code).join('-'));
        } else {
            setNamePreview(isEdit ? initialData?.name || '' : 'New Sample');
        }
    }, [composition, isEdit, initialData]);

    // Handle Derivation: Copy Parent Composition
    // Only if user manually changes type/parent in the form functionality (existing feature)
    useEffect(() => {
        if (!isEdit && type === 'derived' && parentId && composition.length === 0) {
            // Check if we already initialized with it to avoid double-toast or logic conflict
            // If initialParentId was passed, we likely already have initialComposition set via prop.
            // So we only do this if composition is empty (user switched to derived manually).
            const parent = existingSamples.find(s => s.id === parentId);
            if (parent && parent.composition.length > 0) {
                setComposition(parent.composition.map(c => ({
                    ...c,
                    id: Math.random().toString(36).substring(7)
                })));
                toast.info(`Copied base composition from ${parent.name}`);
            }
        }
    }, [type, parentId, isEdit, existingSamples]); // Removed composition dependency to avoid loop if needed, but length check protects it.

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Strip IDs for submission
        const cleanComposition = composition.map(({ id, ...rest }) => rest);

        if (isEdit && initialData) {
            const res = await updateSampleAction({
                id: initialData.id,
                attributes,
                composition: cleanComposition,
                sample_code: sampleCode,
                name: namePreview, // Optional override
                description
            }, groupId);
            if (res.error) toast.error(res.error);
            else {
                toast.success('Sample updated');
                onClose();
            }
        } else {
            const res = await createSampleAction({
                group_id: groupId,
                parent_id: parentId || null,
                type,
                attributes,
                composition: cleanComposition,
                description
            }, logbookId);
            if (res.error) toast.error(res.error);
            else {
                toast.success('Sample created');
                onClose();
            }
        }
    };

    const handleAttributeChange = (fieldName: string, value: any) => {
        setAttributes(prev => ({ ...prev, [fieldName]: value }));
    };

    const addBlock = (item: SampleNomenclature) => {
        setComposition(prev => [...prev, {
            category: item.category,
            value: item.name,
            code: item.code,
            id: Math.random().toString(36).substring(7)
        }]);
    };

    const removeBlock = (index: number) => {
        setComposition(prev => prev.filter((_, i) => i !== index));
    };

    // Group nomenclatures for the "Add Block" dropdown
    const nomenclatureGroups = nomenclatures.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
    }, {} as Record<string, SampleNomenclature[]>);

    const categories = Object.keys(nomenclatureGroups).sort();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/50">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                            {isEdit ? 'Edit Sample' : 'New Sample'}
                        </h2>
                        <div className="text-xs font-mono text-blue-600 font-semibold mt-0.5">
                            {namePreview}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200/80 rounded-full transition-colors text-slate-500 hover:text-slate-700">
                        <X size={18} />
                    </button>
                </div>

                {/* Form Content */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-6">

                    {/* 1. Basic Setup */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2 pb-1 border-b border-slate-100">
                            <span className="bg-slate-100 text-slate-600 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">1</span>
                            Sample Details
                        </h3>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Code</label>
                                <input
                                    value={sampleCode}
                                    onChange={e => setSampleCode(e.target.value)}
                                    placeholder="(Auto-generated)"
                                    className="w-full text-sm border-slate-300 rounded-md px-3 py-1.5 bg-slate-50 text-slate-500 shadow-sm focus:ring-0 focus:border-slate-300 cursor-not-allowed"
                                    disabled={!isEdit}
                                />
                            </div>

                            {!isEdit && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                                    <select
                                        value={type}
                                        onChange={e => setType(e.target.value as SampleType)}
                                        className="w-full text-sm border-slate-300 rounded-md px-3 py-1.5 bg-white shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="stock">Stock / Base</option>
                                        <option value="derived">Derived (From Parent)</option>
                                    </select>
                                </div>
                            )}

                            {(!isEdit && type === 'derived') && (
                                <div className="col-span-2">
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Parent Sample</label>
                                    <select
                                        required
                                        value={parentId}
                                        onChange={e => setParentId(e.target.value)}
                                        className="w-full text-sm border-slate-300 rounded-md px-3 py-1.5 bg-white shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="">Select Base Sample...</option>
                                        {existingSamples.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} ({s.sample_code})</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-slate-400 mt-1 ml-1">Composition will be copied from parent.</p>
                                </div>
                            )}

                            <div className="col-span-2">
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Add optional notes..."
                                    className="w-full text-sm border-slate-300 rounded-md px-3 py-2 bg-white shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-h-[60px] resize-y"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 2. Composition Builder */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2 pb-1 border-b border-slate-100">
                            <span className="bg-slate-100 text-slate-600 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
                            Composition
                        </h3>

                        <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-200 shadow-inner">
                            {composition.length === 0 ? (
                                <div className="text-center py-6 text-slate-400 text-xs border border-dashed border-slate-300 rounded bg-white">
                                    No layers added.
                                </div>
                            ) : (
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEnd}
                                >
                                    <SortableContext
                                        items={composition}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <div className="space-y-1.5 mb-3">
                                            {composition.map((item, idx) => (
                                                <SortableCompositionItem
                                                    key={item.id}
                                                    item={item}
                                                    idx={idx}
                                                    removeBlock={removeBlock}
                                                    updateItem={updateItem}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            )}

                            {/* Add Block Dropdown */}
                            <div className="mt-2.5">
                                <label className="text-[10px] font-semibold text-slate-500 mb-1 flex items-center gap-1 uppercase tracking-wide">
                                    <Plus size={10} /> Add Layer
                                </label>
                                <select
                                    className="w-full text-sm border-slate-300 rounded-md px-2 py-1.5 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-sm cursor-pointer"
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            const item = nomenclatures.find(n => n.id === e.target.value);
                                            if (item) addBlock(item);
                                            e.target.value = ""; // Reset
                                        }
                                    }}
                                    defaultValue=""
                                >
                                    <option value="" disabled>Select component...</option>
                                    {categories.map(cat => (
                                        <optgroup label={cat} key={cat}>
                                            {nomenclatureGroups[cat].map(item => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name} ({item.code})
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* 3. Metadata Attributes */}
                    <div className="space-y-3 pb-16">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2 pb-1 border-b border-slate-100">
                            <span className="bg-slate-100 text-slate-600 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">3</span>
                            Attributes
                        </h3>
                        {fields.length === 0 ? (
                            <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded border border-dashed border-slate-200">
                                No additional attributes configured.
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {fields.map(field => (
                                    <div key={field.id} className="space-y-1 animate-in fade-in duration-300">
                                        <label className="block text-xs font-semibold text-slate-700 truncate" title={field.label}>
                                            {field.label} {field.required && <span className="text-red-500 text-[10px]">*</span>}
                                        </label>
                                        {field.type === 'select' ? (
                                            <select
                                                required={field.required}
                                                value={attributes[field.name] || ''}
                                                onChange={e => handleAttributeChange(field.name, e.target.value)}
                                                className="w-full text-sm border-slate-300 rounded-md px-2 py-1.5 bg-white shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                <option value="">Select...</option>
                                                {field.options?.map((opt: any) => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        ) : field.type === 'boolean' ? (
                                            <select
                                                required={field.required}
                                                value={attributes[field.name] === undefined ? '' : String(attributes[field.name])}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    handleAttributeChange(field.name, val === '' ? null : val === 'true');
                                                }}
                                                className="w-full text-sm border-slate-300 rounded-md px-2 py-1.5 bg-white shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                <option value="">Select...</option>
                                                <option value="true">Yes</option>
                                                <option value="false">No</option>
                                            </select>
                                        ) : (
                                            <input
                                                required={field.required}
                                                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                                value={attributes[field.name] || ''}
                                                onChange={e => handleAttributeChange(field.name, e.target.value)}
                                                className="w-full text-sm border-slate-300 rounded-md px-2 py-1.5 bg-white shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 flex justify-end gap-3 shadow-lg z-10">
                        <button onClick={onClose} type="button" className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition-colors">Cancel</button>
                        <button type="submit" className="px-6 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 shadow-md hover:shadow-lg transition-all flex items-center gap-2 transform active:scale-95">
                            <Save size={16} /> Save Sample
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

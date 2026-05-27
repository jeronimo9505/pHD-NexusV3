'use client';

import { useState } from 'react';
import { X, Database, List } from 'lucide-react';
import { NomenclatureManager } from './nomenclature-manager';
import { FieldManager } from './field-manager';
import { SampleNomenclature, SampleFieldConfig } from '../types';
import { cn } from '@/lib/utils'; // Assuming this exists as seen in sidebar.tsx

export function ConfigModal({
    isOpen,
    onClose,
    groupId,
    logbookId,
    nomenclatures,
    fields
}: {
    isOpen: boolean;
    onClose: () => void;
    groupId: string;
    logbookId: string;
    nomenclatures: SampleNomenclature[];
    fields: SampleFieldConfig[];
}) {
    const [activeTab, setActiveTab] = useState<'nomenclature' | 'fields'>('nomenclature');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-xl font-semibold text-slate-800">Sample Configuration</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                {/* Tabs & Content */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar Tabs */}
                    <div className="w-64 bg-slate-50 border-r border-slate-100 p-4 space-y-2">
                        <button
                            onClick={() => setActiveTab('nomenclature')}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-left",
                                activeTab === 'nomenclature'
                                    ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"
                                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            )}
                        >
                            <Database size={18} />
                            Nomenclature
                        </button>
                        <button
                            onClick={() => setActiveTab('fields')}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-left",
                                activeTab === 'fields'
                                    ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"
                                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            )}
                        >
                            <List size={18} />
                            Data Fields
                        </button>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 overflow-y-auto p-6 bg-white">
                        {activeTab === 'nomenclature' && (
                            <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
                                <p className="text-slate-500 mb-6">
                                    Manage abbreviations and codes used in your samples. These are used to generate smart IDs.
                                </p>
                                <NomenclatureManager
                                    groupId={groupId}
                                    logbookId={logbookId}
                                    nomenclatures={nomenclatures}
                                />
                            </div>
                        )}
                        {activeTab === 'fields' && (
                            <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
                                <p className="text-slate-500 mb-6">
                                    Define the structure of your sample logbook. Add columns to track specific data points.
                                </p>
                                <FieldManager
                                    groupId={groupId}
                                    logbookId={logbookId}
                                    fields={fields}
                                    nomenclatures={nomenclatures}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

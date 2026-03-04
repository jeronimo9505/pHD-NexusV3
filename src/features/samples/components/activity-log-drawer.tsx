'use client';

import { useState, useEffect } from 'react';
import { getActivityLogAction } from '../actions';
import { X, Clock, User, Microscope, Plus, Trash2, Edit, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '../utils';

interface ActivityLogDrawerProps {
    groupId: string;
    isOpen: boolean;
    onClose: () => void;
    onSelectSample: (sampleId: string) => void;
}

export function ActivityLogDrawer({ groupId, isOpen, onClose, onSelectSample }: ActivityLogDrawerProps) {
    const [activities, setActivities] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchActivities();
        }
    }, [isOpen, groupId]);

    const fetchActivities = async () => {
        setIsLoading(true);
        try {
            const res = await getActivityLogAction(groupId);
            if (res.data) {
                setActivities(res.data);
            }
        } catch (error) {
            console.error('Failed to fetch activities:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex justify-end">
            <div
                className="absolute inset-0 bg-black/20 backdrop-blur-[2px] animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 text-white rounded-lg shadow-blue-200 shadow-lg">
                            <Clock size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Activity Log</h2>
                            <p className="text-xs text-slate-500">Recent laboratory updates</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                    {isLoading ? (
                        <div className="h-full flex items-center justify-center">
                            <Loader2 className="animate-spin text-blue-600" size={32} />
                        </div>
                    ) : activities.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                            <Clock size={48} className="opacity-20" />
                            <p>No recent activity found</p>
                        </div>
                    ) : (
                        <div className="space-y-8 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                            {activities.map((item, idx) => (
                                <div key={item.id} className="relative pl-10 group">
                                    {/* Timeline Dot/Icon */}
                                    <div className={cn(
                                        "absolute left-0 top-1 w-8 h-8 rounded-full border-4 border-white shadow-sm flex items-center justify-center z-10 transition-transform group-hover:scale-110",
                                        item.type === 'characterization' ? "bg-purple-100 text-purple-600" :
                                            item.action === 'create' ? "bg-green-100 text-green-600" :
                                                item.action === 'delete' ? "bg-red-100 text-red-600" :
                                                    "bg-blue-100 text-blue-600"
                                    )}>
                                        {item.type === 'characterization' ? <Microscope size={14} /> :
                                            item.action === 'create' ? <Plus size={14} /> :
                                                item.action === 'delete' ? <Trash2 size={14} /> :
                                                    <Edit size={14} />}
                                    </div>

                                    {/* Entry Details */}
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-bold text-slate-800">
                                                {item.isBulk ? "Bulk " : ""}
                                                {item.type === 'characterization' ? `${item.action} Characterization` :
                                                    item.action === 'create' ? 'Sample Created' :
                                                        item.action === 'update' ? 'Sample Updated' :
                                                            'Sample Deleted'}
                                            </span>
                                            <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                                {formatDate(item.created_at)}
                                            </span>
                                        </div>

                                        {item.isBulk ? (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {item.samples?.map((s: any) => (
                                                    <button
                                                        key={s.id}
                                                        onClick={() => onSelectSample(s.id)}
                                                        className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] hover:bg-blue-100 transition-colors border border-blue-100/50"
                                                    >
                                                        <span className="font-bold">{s.code}</span>
                                                        <span className="opacity-60 truncate max-w-[60px]">{s.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => onSelectSample(item.sample_id)}
                                                className="flex items-center gap-1.5 text-xs text-left group/link"
                                            >
                                                <span className="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] group-hover/link:bg-blue-100 group-hover/link:text-blue-700 transition-colors font-bold">
                                                    {item.sample_code || '???'}
                                                </span>
                                                <span className="text-slate-500 truncate max-w-[150px] group-hover/link:text-blue-600 transition-colors">
                                                    {item.sample_name}
                                                </span>
                                            </button>
                                        )}

                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                                            <User size={10} />
                                            <span>{item.user_name}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

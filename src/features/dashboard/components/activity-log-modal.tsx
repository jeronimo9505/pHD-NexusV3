'use client';

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow, format } from "date-fns";
import { 
    MessageSquare, 
    PlusCircle, 
    RefreshCw, 
    CheckCircle2, 
    LogIn, 
    Activity,
    Clock,
    X
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    groupId: string;
}

interface LogEntry {
    id: string;
    action: string;
    entity_type: string;
    metadata: any;
    created_at: string;
    profiles: {
        full_name: string;
        avatar_url: string;
    };
    role?: string;
}

export function ActivityLogModal({ isOpen, onClose, groupId }: ActivityLogModalProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        if (isOpen) {
            fetchLogs();
            // Prevent body scroll
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = 'unset';
            };
        }
    }, [isOpen, groupId]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('activity_log')
                .select(`
                    *,
                    profiles:user_id(full_name, avatar_url)
                `)
                .eq('group_id', groupId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            const { data: members } = await supabase
                .from('group_members')
                .select('user_id, role')
                .eq('group_id', groupId);

            const roleMap = new Map(members?.map(m => [m.user_id, m.role]));

            const enrichedLogs = (data || []).map((log: any) => ({
                ...log,
                role: roleMap.get(log.user_id)
            }));

            setLogs(enrichedLogs as any);
        } catch (err) {
            console.error("Error fetching logs:", err);
        } finally {
            setLoading(false);
        }
    };

    const getActionIcon = (action: string) => {
        if (action === 'commented') return <MessageSquare className="text-blue-500" size={16} />;
        if (action === 'created') return <PlusCircle className="text-emerald-500" size={16} />;
        if (action === 'updated') return <RefreshCw className="text-purple-500" size={16} />;
        if (action === 'submitted' || action === 'reviewed') return <CheckCircle2 className="text-amber-500" size={16} />;
        if (action === 'visit' || action === 'login') return <LogIn className="text-slate-500" size={16} />;
        return <Activity className="text-slate-400" size={16} />;
    };

    const formatAction = (log: LogEntry) => {
        const { action, entity_type, metadata } = log;
        let text = "";
        let detail = "";

        switch (action) {
            case 'commented':
                text = `commented on ${entity_type}`;
                detail = metadata?.preview || "";
                break;
            case 'created':
                text = `created a new ${entity_type}`;
                detail = metadata?.title || metadata?.name || "";
                break;
            case 'updated':
                text = `updated ${entity_type}`;
                detail = metadata?.new_status ? `Status changed to ${metadata.new_status}` : "";
                break;
            case 'visit':
            case 'login':
                text = `accessed the workspace`;
                break;
            case 'submitted':
                text = `submitted a ${entity_type}`;
                detail = metadata?.week_start ? `Week starting ${metadata.week_start}` : "";
                break;
            case 'reviewed':
                text = `reviewed a ${entity_type}`;
                break;
            default:
                text = `${action} ${entity_type}`;
        }

        return { text, detail };
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
            
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative z-10 animate-in zoom-in-95 slide-in-from-bottom-4 duration-200 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                            <Clock size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Group Activity History</h3>
                            <p className="text-xs text-slate-500 font-medium">Monitoring member actions and sessions</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4 text-slate-400">
                            <RefreshCw className="animate-spin" size={28} />
                            <p className="text-sm font-medium">Loading activity logs...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-20 text-slate-400 italic">
                            No activity has been recorded yet.
                        </div>
                    ) : (
                        <div className="space-y-8 relative before:absolute before:left-5 before:top-2 before:bottom-0 before:w-px before:bg-slate-100">
                            {logs.map((log) => {
                                const { text, detail } = formatAction(log);
                                const isResearcher = log.role === 'researcher';
                                const isSupervisor = log.role === 'supervisor';
                                const isOwner = log.role === 'owner';

                                return (
                                    <div key={log.id} className="relative flex items-start gap-4 group">
                                        <div className="absolute left-5 -translate-x-1/2 mt-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-200 z-10 group-hover:border-indigo-400 transition-colors" />
                                        
                                        <div className="flex-1 ml-4 bg-slate-50/50 hover:bg-indigo-50/30 p-4 rounded-xl border border-transparent hover:border-indigo-100/50 transition-all">
                                            <div className="flex items-center justify-between gap-4 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-slate-200 overflow-hidden border border-white shadow-sm flex-shrink-0">
                                                        {log.profiles?.avatar_url ? (
                                                            <img src={log.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-slate-300 text-[10px] font-bold text-slate-600">
                                                                {log.profiles?.full_name?.charAt(0) || '?'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-sm font-bold text-slate-800">{log.profiles?.full_name}</span>
                                                    <span className={cn(
                                                        "text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider",
                                                        isResearcher && "bg-emerald-100 text-emerald-700",
                                                        isSupervisor && "bg-purple-100 text-purple-700",
                                                        isOwner && "bg-amber-100 text-amber-700",
                                                        !isResearcher && !isSupervisor && !isOwner && "bg-slate-100 text-slate-600"
                                                    )}>
                                                        {log.role || 'Member'}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col items-end gap-0.5 text-right min-w-[100px]">
                                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium uppercase tracking-tight">
                                                        {getActionIcon(log.action)}
                                                        <span>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-300 font-mono">
                                                        {format(new Date(log.created_at), "HH:mm:ss · dd/MM/yyyy")}
                                                    </div>
                                                </div>
                                            </div>

                                            <p className="text-sm text-slate-600">
                                                <span className="font-medium">{text}</span>
                                            </p>
                                            {detail && (
                                                <div className="mt-2 text-xs text-slate-500 bg-white border border-slate-100 rounded-lg p-2.5 italic">
                                                    "{detail}"
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/30 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-5 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
            
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #cbd5e1;
                }
            `}</style>
        </div>
    );
}

'use client';

import { useState } from "react";
import { Users, History } from "lucide-react";
import { ActivityLogModal } from "./activity-log-modal";

interface DashboardActionsProps {
    groupId: string;
    memberCount: number;
}

export function DashboardActions({ groupId, memberCount }: DashboardActionsProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <div className="flex items-center gap-3">
            {/* Log History Button */}
            <div className="group relative">
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-100 hover:bg-indigo-50/50 transition-all shadow-sm"
                    title="View Activity History"
                >
                    <History size={20} />
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                    View Activity History
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                </div>
            </div>

            {/* Active Members pill */}
            <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <Users size={16} className="text-emerald-600" />
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Active Members</p>
                    <p className="text-xl font-black text-slate-900 leading-none">{memberCount}</p>
                </div>
            </div>

            <ActivityLogModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                groupId={groupId} 
            />
        </div>
    );
}

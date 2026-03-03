'use client';

import { useState } from 'react';
import { approveJoinRequestAction, rejectJoinRequestAction } from '@/features/groups/actions';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X, Loader2, Clock, UserCheck } from 'lucide-react';

interface PendingMember {
    id: string;
    user_id: string;
    role: string;
    created_at: string;
    profiles: { full_name: string | null; email: string | null } | null;
}

interface PendingRequestsProps {
    groupId: string;
    pending: PendingMember[];
}

export function PendingRequests({ groupId, pending }: PendingRequestsProps) {
    const router = useRouter();
    const [loadingId, setLoadingId] = useState<string | null>(null);

    if (pending.length === 0) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-50 rounded-lg px-4 py-3">
                <UserCheck size={15} /> No pending join requests.
            </div>
        );
    }

    const handleApprove = async (memberId: string) => {
        setLoadingId(`approve-${memberId}`);
        const res = await approveJoinRequestAction(memberId, groupId);
        if (res?.error) toast.error(res.error);
        else { toast.success('Member approved!'); router.refresh(); }
        setLoadingId(null);
    };

    const handleReject = async (memberId: string) => {
        setLoadingId(`reject-${memberId}`);
        const res = await rejectJoinRequestAction(memberId, groupId);
        if (res?.error) toast.error(res.error);
        else { toast.success('Request rejected.'); router.refresh(); }
        setLoadingId(null);
    };

    return (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
            <div className="bg-amber-50 px-4 py-3 flex items-center gap-2 border-b border-amber-100">
                <Clock size={14} className="text-amber-500" />
                <span className="text-sm font-semibold text-amber-700">{pending.length} pending request{pending.length > 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-slate-100">
                {pending.map(m => {
                    const name = m.profiles?.full_name || m.profiles?.email || 'Unknown User';
                    const email = m.profiles?.email;
                    const isApproving = loadingId === `approve-${m.id}`;
                    const isRejecting = loadingId === `reject-${m.id}`;
                    return (
                        <div key={m.id} className="flex items-center justify-between px-4 py-3">
                            <div>
                                <p className="text-sm font-medium text-slate-900">{name}</p>
                                {email && <p className="text-xs text-slate-400">{email}</p>}
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Requested: {new Date(m.created_at).toLocaleDateString()}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleApprove(m.id)}
                                    disabled={!!loadingId}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium rounded-lg border border-emerald-200 transition-colors disabled:opacity-50"
                                >
                                    {isApproving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Approve
                                </button>
                                <button
                                    onClick={() => handleReject(m.id)}
                                    disabled={!!loadingId}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg border border-red-200 transition-colors disabled:opacity-50"
                                >
                                    {isRejecting ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />} Reject
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

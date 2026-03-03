'use client';

import { useState, useTransition } from 'react';
import { Clock, CheckCircle, Eye, ChevronRight, ChevronDown, User, Loader2, MessageSquare, FileText } from 'lucide-react';
import { updateReportStatusAction } from '@/features/regular-reports/actions';
import { toast } from 'sonner';
import Link from 'next/link';

interface PendingReport {
    id: string;
    group_id: string;
    week_start: string;
    week_end: string;
    status: string;
    submitted_at: string | null;
    reviewed_at: string | null;
    author: { full_name: string | null; email: string | null } | null;
}

interface UnseenDriveReport {
    id: string;
    group_id: string;
    name: string;
    title: string | null;
    type: string | null;
    created_at: string;
    author_name: string | null;
    author: { full_name: string | null } | null;
}

interface PendingReviewCardProps {
    count: number;
    pendingReports: PendingReport[];
    canReview: boolean;
    unseenDriveReports?: UnseenDriveReport[];
    groupId?: string;
}

export function PendingReviewCard({ count, pendingReports, canReview, unseenDriveReports = [], groupId }: PendingReviewCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [feedbackId, setFeedbackId] = useState<string | null>(null);
    const [feedback, setFeedback] = useState('');
    const [localReviewed, setLocalReviewed] = useState<Set<string>>(new Set());
    const [isPending, startTransition] = useTransition();

    const pendingCount = count - localReviewed.size;
    const unseenCount = unseenDriveReports.length;
    const totalCount = pendingCount + unseenCount;

    const handleMarkReviewed = (reportId: string, groupId: string) => {
        startTransition(async () => {
            setReviewingId(reportId);
            const res = await updateReportStatusAction(reportId, 'reviewed', groupId);
            if (res?.error) {
                toast.error(res.error);
            } else {
                toast.success('Report marked as reviewed');
                setLocalReviewed(prev => new Set(prev).add(reportId));
                setFeedbackId(null);
                setFeedback('');
            }
            setReviewingId(null);
        });
    };

    return (
        <div className={`rounded-2xl border bg-white shadow-sm transition-all ${expanded ? 'border-purple-200 shadow-purple-50' : 'border-slate-200'}`}>
            {/* Main stat row */}
            <button
                className="w-full flex items-center justify-between p-6 text-left"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${totalCount > 0 ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                        {totalCount > 0
                            ? <Clock size={22} className="text-amber-500" />
                            : <CheckCircle size={22} className="text-emerald-500" />
                        }
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">Pending Review</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-3xl font-bold text-slate-900">{totalCount}</p>
                            {unseenCount > 0 && (
                                <p className="text-xs text-slate-400">
                                    ({pendingCount} reports · {unseenCount} unread)
                                </p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                    {totalCount > 0 && (
                        <span className="text-xs bg-amber-100 text-amber-600 font-medium px-2 py-1 rounded-full">
                            Needs attention
                        </span>
                    )}
                    {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
            </button>

            {/* Expanded list */}
            {expanded && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {/* ── Weekly Reports section ── */}
                    {pendingReports.filter(r => !localReviewed.has(r.id)).length > 0 && (
                        <div>
                            <p className="px-5 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                Weekly Reports
                            </p>
                            {pendingReports
                                .filter(r => !localReviewed.has(r.id))
                                .map(report => {
                                    const authorName = report.author?.full_name || report.author?.email || 'Unknown';
                                    const isReviewing = reviewingId === report.id;
                                    const showFeedback = feedbackId === report.id;

                                    return (
                                        <div key={report.id} className="px-5 py-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-start gap-3 min-w-0">
                                                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                                        <User size={14} className="text-slate-500" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-slate-800 truncate">{authorName}</p>
                                                        <p className="text-xs text-slate-400">
                                                            Week of {new Date(report.week_start).toLocaleDateString()} – {new Date(report.week_end).toLocaleDateString()}
                                                        </p>
                                                        {report.submitted_at && (
                                                            <p className="text-xs text-slate-400">
                                                                Submitted {new Date(report.submitted_at).toLocaleDateString()}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    <Link
                                                        href={`/${report.group_id}/reports/${report.id}`}
                                                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                        title="View report"
                                                    >
                                                        <Eye size={14} />
                                                    </Link>

                                                    {canReview && (
                                                        <>
                                                            <button
                                                                onClick={() => {
                                                                    setFeedbackId(showFeedback ? null : report.id);
                                                                    setFeedback('');
                                                                }}
                                                                className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                                                title="Add feedback"
                                                            >
                                                                <MessageSquare size={14} />
                                                            </button>

                                                            <button
                                                                onClick={() => handleMarkReviewed(report.id, report.group_id)}
                                                                disabled={isReviewing}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium rounded-lg border border-emerald-200 transition-colors disabled:opacity-50"
                                                            >
                                                                {isReviewing ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                                                                Mark Reviewed
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {showFeedback && (
                                                <div className="mt-3 pl-11">
                                                    <textarea
                                                        value={feedback}
                                                        onChange={e => setFeedback(e.target.value)}
                                                        placeholder="Add supervisor feedback (optional)..."
                                                        rows={2}
                                                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-200"
                                                    />
                                                    <button
                                                        onClick={() => handleMarkReviewed(report.id, report.group_id)}
                                                        disabled={isReviewing}
                                                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        {isReviewing ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                                                        Submit & Mark Reviewed
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            }
                        </div>
                    )}

                    {/* ── Unseen Drive Reports section ── */}
                    {unseenDriveReports.length > 0 && (
                        <div>
                            <p className="px-5 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                Unread Drive Reports
                            </p>
                            {unseenDriveReports.map(report => (
                                <div key={report.id} className="px-5 py-3 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center shrink-0">
                                            <FileText size={14} className="text-blue-500" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 truncate">
                                                {report.title || report.name}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {(report.author as any)?.full_name || report.author_name || 'Unknown'} · {new Date(report.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <Link
                                        href={`/${report.group_id || groupId}/drive-reports`}
                                        className="shrink-0 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                    >
                                        <Eye size={11} /> Open
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Empty state ── */}
                    {totalCount === 0 && (
                        <div className="px-6 py-8 text-center text-slate-400 text-sm">
                            <CheckCircle size={24} className="mx-auto mb-2 text-emerald-400" />
                            Everything is up to date!
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

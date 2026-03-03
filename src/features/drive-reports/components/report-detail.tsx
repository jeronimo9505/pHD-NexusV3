'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteDriveReportAction, markAsSeenAction } from '../actions';
import { toast } from 'sonner';
import {
    FileText,
    Presentation,
    StickyNote,
    Trash2,
    CheckCircle2,
    ExternalLink,
    Calendar,
    User,
    ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import { Database } from '@/types/supabase';

type DriveReport = Database['public']['Tables']['drive_reports']['Row'];

interface ReportDetailProps {
    report: DriveReport;
    currentUserId: string;
    groupId: string;
}

export function ReportDetail({ report, currentUserId, groupId }: ReportDetailProps) {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isMarkingSeen, setIsMarkingSeen] = useState(false);

    const isSeen = report.seen_by?.includes(currentUserId);

    // Icon mapping
    const Icon = {
        'report': FileText,
        'ppt': Presentation,
        'meeting_note': StickyNote
    }[report.type] || FileText;

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this report? This action cannot be undone.')) return;

        setIsDeleting(true);
        try {
            const result = await deleteDriveReportAction(report.id, groupId);
            if (result?.error) {
                toast.error(result.error);
                setIsDeleting(false);
            } else {
                toast.success('Report deleted');
                router.push(`/${groupId}/drive-reports`);
                router.refresh();
            }
        } catch (err) {
            toast.error('Failed to delete report');
            setIsDeleting(false);
            console.error(err);
        }
    };

    const handleMarkSeen = async () => {
        if (isSeen) return;

        setIsMarkingSeen(true);
        try {
            const result = await markAsSeenAction(report.id, groupId);
            if (result?.error) {
                toast.error(result.error);
            } else {
                toast.success('Marked as seen');
                router.refresh();
            }
        } catch (err) {
            toast.error('Failed to update status');
            console.error(err);
        } finally {
            setIsMarkingSeen(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <Link
                href={`/${groupId}/drive-reports`}
                className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
            >
                <ArrowLeft size={16} className="mr-1" />
                Back to Reports
            </Link>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm text-slate-700">
                                <Icon size={32} strokeWidth={1.5} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900 mb-2">{report.title}</h1>
                                <div className="flex items-center gap-4 text-sm text-slate-500">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar size={14} />
                                        <span>{new Date(report.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <User size={14} />
                                        <span className="capitalize">{report.status}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Future: Edit button */}
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Delete Report"
                            >
                                <Trash2 size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content & Actions */}
                <div className="p-8">
                    <div className="flex flex-col md:flex-row gap-8">
                        {/* Main Content Area (Placeholder for metadata or preview) */}
                        <div className="flex-1 space-y-6">
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600">
                                    This report is linked to a Google Drive file.
                                    Click the button below to open it directly in Google Drive.
                                </p>
                            </div>

                            <a
                                href={report.drive_file_id ? `https://docs.google.com/open?id=${report.drive_file_id}` : '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center font-medium text-slate-900 hover:underline decoration-slate-900/30 underline-offset-4"
                            >
                                <ExternalLink size={16} className="mr-2" />
                                Open in Google Drive
                            </a>
                        </div>

                        {/* Sidebar / Status Card */}
                        <div className="w-full md:w-72 space-y-4">
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                <h3 className="text-sm font-semibold text-slate-900 mb-4">Review Status</h3>

                                {isSeen ? (
                                    <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-md border border-green-100">
                                        <CheckCircle2 size={18} />
                                        <span className="text-sm font-medium">You reviewed this</span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleMarkSeen}
                                        disabled={isMarkingSeen}
                                        className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-lg hover:bg-slate-800 transition disabled:opacity-70 text-sm font-medium shadow-sm"
                                    >
                                        {isMarkingSeen ? (
                                            'Updating...'
                                        ) : (
                                            <>
                                                <CheckCircle2 size={16} />
                                                Mark as Seen
                                            </>
                                        )}
                                    </button>
                                )}

                                <div className="mt-4 pt-4 border-t border-slate-200">
                                    <p className="text-xs text-slate-500 mb-2">Seen by:</p>
                                    <div className="flex -space-x-2">
                                        {/* Placeholder for avatars of people who have seen it */}
                                        {(report.seen_by || []).length > 0 ? (
                                            <span className="text-xs text-slate-600 font-medium pl-1">
                                                {(report.seen_by?.length || 0)} user(s)
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">No reviews yet</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

'use client';

import { DriveReport } from '../types';
import { deleteDriveReportAction, markAsSeenAction } from '../actions';
import { toast } from 'sonner';
import {
    FileText, Trash2, Eye, EyeOff, ExternalLink, Clock,
    Presentation, StickyNote, MessageSquare, CheckSquare, Edit3, FileCheck
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ReportCardExpanded } from './report-card-expanded';
import { DraftEditorModal } from './draft-editor-modal';
import { EditReportDialog } from './edit-report-dialog';


interface ReportCardProps {
    report: DriveReport;
    currentUserId: string;
    groupId: string;
    driveSettings?: { clientId?: string; apiKey?: string; folderId?: string };
}

export function ReportCard({ report, currentUserId, groupId, driveSettings }: ReportCardProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [expandedSection, setExpandedSection] = useState<'seen' | 'tasks' | 'comments' | null>(null);
    const [showDraftEditor, setShowDraftEditor] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);

    const isSeen = report.seen_by?.includes(currentUserId);
    const seenCount = report.seen_by?.length || 0;
    const isDraft = report.status === 'draft';

    const handleMarkSeen = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            await markAsSeenAction(report.id, groupId);
            toast.success(isSeen ? "Marked as unseen" : "Marked as seen");
        } catch (error) {
            toast.error("Error updating status");
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this report?")) return;

        setIsDeleting(true);
        try {
            await deleteDriveReportAction(report.id, groupId);
            toast.success("Report deleted");
        } catch (error) {
            toast.error("Error deleting report");
            setIsDeleting(false);
        }
    };

    // Get type-specific styling
    const getTypeStyle = () => {
        switch (report.type) {
            case 'ppt':
                return {
                    bg: 'bg-orange-100',
                    text: 'text-orange-600',
                    icon: Presentation
                };
            case 'meeting_note':
                return {
                    bg: 'bg-emerald-100',
                    text: 'text-emerald-600',
                    icon: StickyNote
                };
            default:
                return {
                    bg: 'bg-indigo-100',
                    text: 'text-indigo-600',
                    icon: FileText
                };
        }
    };

    const typeStyle = getTypeStyle();
    const TypeIcon = typeStyle.icon;

    // Format date
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div
            className={cn(
                "bg-white rounded-xl border p-4 transition-all hover:shadow-md relative group",
                isSeen ? "border-slate-200" : "border-indigo-200 shadow-sm bg-indigo-50/10",
                isDeleting && "opacity-50"
            )}
        >
            {/* Delete Button (Top Right) */}
            <button
                onClick={handleDelete}
                className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Delete report"
            >
                <Trash2 className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-4">
                {/* Icon Box */}
                {isDraft ? (
                    <button
                        onClick={() => setShowDraftEditor(true)}
                        className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-95",
                            typeStyle.bg,
                            typeStyle.text
                        )}
                    >
                        <TypeIcon className="w-6 h-6" />
                    </button>
                ) : (
                    <Link
                        href={`/${groupId}/drive-reports/${report.id}`}
                        className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-95",
                            typeStyle.bg,
                            typeStyle.text
                        )}
                    >
                        <TypeIcon className="w-6 h-6" />
                    </Link>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-start justify-between gap-4 mb-1">
                        <div>
                            {isDraft ? (
                                <button
                                    onClick={() => setShowDraftEditor(true)}
                                    className="font-bold text-slate-800 text-sm hover:text-indigo-600 cursor-pointer transition-colors line-clamp-1 block text-left"
                                >
                                    {report.title}
                                </button>
                            ) : (
                                <Link
                                    href={`/${groupId}/drive-reports/${report.id}`}
                                    className="font-bold text-slate-800 text-sm hover:text-indigo-600 cursor-pointer transition-colors line-clamp-1 block"
                                >
                                    {report.title}
                                </Link>
                            )}

                            {/* Draft Badge */}
                            {isDraft && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-100 text-amber-700 border border-amber-200 mt-1">
                                    <Edit3 className="w-3 h-3" />
                                    Draft
                                </span>
                            )}

                            {/* Metadata Line: Date - Author */}
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                <span className={cn("font-medium", !isSeen && "text-indigo-500 font-bold")}>
                                    {formatDate(report.created_at)}
                                </span>
                                <span>•</span>
                                <span className="truncate max-w-[120px]" title={report.author_name || 'Unknown'}>
                                    {report.author_name || 'Unknown'}
                                </span>
                            </div>
                        </div>

                        {/* Top Actions */}
                        <div className="flex items-center gap-2">
                            {/* Draft: Edit Button */}
                            {isDraft ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowDraftEditor(true);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-indigo-500 text-white hover:bg-indigo-600 transition-colors shadow-sm shadow-indigo-200"
                                >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>Edit</span>
                                </button>
                            ) : (
                                /* Generated: Open Drive Button & Edit Button */
                                <div className="flex items-center gap-1">
                                    {report.web_view_link && (
                                        <a
                                            href={report.web_view_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm shadow-amber-200"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            <span>Open</span>
                                        </a>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowEditDialog(true);
                                        }}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                        title="Edit title and type"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            {/* Seen Toggle */}
                            <button
                                onClick={handleMarkSeen}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors border",
                                    isSeen
                                        ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                                        : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                                )}
                            >
                                {isSeen ? (
                                    <>
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>Seen</span>
                                    </>
                                ) : (
                                    <>
                                        <EyeOff className="w-3.5 h-3.5" />
                                        <span>Unseen</span>
                                    </>
                                )}
                            </button>

                            {/* Comment Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedSection(expandedSection === 'comments' ? null : 'comments');
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors border bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-200 border-transparent"
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Comment</span>
                            </button>
                        </div>
                    </div>

                    {/* Bottom Info Bar */}
                    <div className="flex items-center gap-4 pt-3 border-t border-slate-50 mt-1">
                        {/* Seen Count */}
                        <div
                            className={cn(
                                "flex items-center gap-1 text-[10px] font-medium cursor-pointer transition-colors p-1 rounded hover:bg-slate-100",
                                expandedSection === 'seen' ? "text-indigo-600 bg-indigo-50" : "text-slate-400"
                            )}
                            onClick={(e) => {
                                e.stopPropagation();
                                setExpandedSection(expandedSection === 'seen' ? null : 'seen');
                            }}
                            title={`Seen by ${seenCount} people`}
                        >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Seen by {seenCount}</span>
                        </div>

                        {/* Tasks Count */}
                        <div
                            className={cn(
                                "flex items-center gap-1 text-[10px] font-medium transition-colors cursor-pointer p-1 rounded hover:bg-slate-100",
                                expandedSection === 'tasks' ? "bg-indigo-50 text-indigo-600" : "text-slate-400"
                            )}
                            onClick={(e) => {
                                e.stopPropagation();
                                setExpandedSection(expandedSection === 'tasks' ? null : 'tasks');
                            }}
                        >
                            <CheckSquare className="w-3.5 h-3.5" />
                            <span>Tasks ({report.task_count || 0})</span>
                        </div>

                        {/* Comments Count */}
                        <div
                            className={cn(
                                "flex items-center gap-1 text-[10px] font-medium transition-colors cursor-pointer p-1 rounded hover:bg-slate-100",
                                expandedSection === 'comments' ? "bg-indigo-50 text-indigo-600" : "text-slate-400"
                            )}
                            onClick={(e) => {
                                e.stopPropagation();
                                setExpandedSection(expandedSection === 'comments' ? null : 'comments');
                            }}
                        >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Comments ({report.comment_count || 0})</span>
                        </div>

                        <div className="flex-1" />

                        {/* Timestamp */}
                        <div className="flex items-center gap-1 text-[10px] text-slate-300">
                            <Clock className="w-3 h-3" />
                            {new Date(report.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Expandable Sections */}
            <ReportCardExpanded
                report={report}
                expandedSection={expandedSection}
                onToggleSection={(section) => setExpandedSection(expandedSection === section ? null : section)}
                currentUserId={currentUserId}
            />

            {/* Draft Editor Modal */}
            {isDraft && showDraftEditor && (
                <DraftEditorModal
                    isOpen={showDraftEditor}
                    onClose={() => setShowDraftEditor(false)}
                    initialData={{
                        title: report.title,
                        type: report.type,
                        startDate: report.start_date || undefined,
                        endDate: report.end_date || undefined,
                        sections: report.sections || undefined,
                    }}
                    groupId={groupId}
                    draftId={report.id}
                    driveSettings={driveSettings}
                />
            )}
            {/* Edit Report Dialog (Metadata) */}
            {showEditDialog && (
                <EditReportDialog
                    isOpen={showEditDialog}
                    onClose={() => setShowEditDialog(false)}
                    report={{
                        id: report.id,
                        title: report.title,
                        type: report.type as any
                    }}
                    groupId={groupId}
                />
            )}
        </div>
    );
}

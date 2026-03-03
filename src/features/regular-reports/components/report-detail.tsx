'use client';

import { updateReportStatusAction, updateReportSectionAction } from '../actions';
import { RegularReport } from '../types';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { Save, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ReportDetailProps {
    report: RegularReport;
    currentUserId: string;
}

const SECTION_TITLES: Record<string, string> = {
    context: 'Context & Objectives',
    experimental: 'Experimental Methods',
    findings: 'Results & Findings',
    difficulties: 'Difficulties & Blockers',
    nextSteps: 'Next Steps'
};

export function ReportDetail({ report, currentUserId }: ReportDetailProps) {
    const router = useRouter();
    const isAuthor = report.author_id === currentUserId;
    const isEditable = report.status === 'draft' && isAuthor;

    const handleStatusChange = async (newStatus: 'draft' | 'submitted') => {
        if (!confirm(`Are you sure you want to ${newStatus === 'submitted' ? 'submit' : 'change status of'} this report?`)) return;

        const res = await updateReportStatusAction(report.id, newStatus, report.group_id);
        if (res.error) toast.error(res.error);
        else toast.success(`Report ${newStatus}`);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Link href={`/${report.group_id}/reports`} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeft size={20} className="text-slate-500" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            Weekly Report
                        </h1>
                        <p className="text-slate-500">
                            {new Date(report.week_start).toLocaleDateString()} - {new Date(report.week_end).toLocaleDateString()}
                        </p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <span className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize 
                        ${report.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                            report.status === 'reviewed' ? 'bg-emerald-100 text-emerald-700' :
                                'bg-slate-100 text-slate-700'}`}>
                        {report.status}
                    </span>

                    {isEditable && (
                        <button
                            onClick={() => handleStatusChange('submitted')}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 text-sm font-medium"
                        >
                            <CheckCircle size={16} /> Submit Report
                        </button>
                    )}
                </div>
            </div>

            {/* Sections */}
            <div className="space-y-6">
                {report.sections?.map((section) => (
                    <ReportSectionEditor
                        key={section.key}
                        section={section}
                        reportId={report.id}
                        groupId={report.group_id}
                        editable={isEditable}
                    />
                ))}
            </div>
        </div>
    );
}

function ReportSectionEditor({ section, reportId, groupId, editable }: { section: { key: string, content: string }, reportId: string, groupId: string, editable: boolean }) {
    const [content, setContent] = useState(section.content);
    const [isSaving, setIsSaving] = useState(false);

    // Debounce save or save on blur? Save on blur for simplicity here.
    const handleBlur = async () => {
        if (content === section.content) return; // No change

        setIsSaving(true);
        const res = await updateReportSectionAction(reportId, section.key, content, groupId);
        setIsSaving(false);

        if (res.error) toast.error("Failed to save");
        // else toast.success("Saved"); // Too noisy
    };

    return (
        <div className="bg-white rounded-xl border p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-lg text-slate-800">{SECTION_TITLES[section.key] || section.key}</h3>
                {isSaving && <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Saving...</span>}
            </div>

            {editable ? (
                <textarea
                    className="w-full min-h-[150px] p-4 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-y text-slate-700 leading-relaxed"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onBlur={handleBlur}
                    placeholder={`Write your ${SECTION_TITLES[section.key]?.toLowerCase()} here...`}
                />
            ) : (
                <div className="prose max-w-none text-slate-600 whitespace-pre-wrap">
                    {section.content || <span className="italic text-slate-400">No content provided.</span>}
                </div>
            )}
        </div>
    );
}



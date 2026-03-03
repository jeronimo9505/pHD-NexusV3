'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { X, Loader2, Save, FileText, Target, FlaskConical, Lightbulb, AlertTriangle, ArrowRight } from 'lucide-react';
import { saveDraftAction, updateDraftAction, updateDraftWithDocAction } from '../actions';

interface DraftEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    groupId: string;
    draftId?: string;
    initialData?: {
        title: string;
        startDate: string;
        endDate: string;
        type: 'report' | 'meeting_note' | 'ppt';
        sections?: {
            // Report fields
            context?: string;
            experimental?: string;
            findings?: string;
            difficulties?: string;
            nextSteps?: string;
            // Meeting Note fields
            attendees?: string;
            notes?: string;
            agreements?: string;
        };
    };
    driveSettings?: {
        clientId?: string;
        apiKey?: string;
        folderId?: string;
        reportFolderId?: string;
        meetingFolderId?: string;
        pptFolderId?: string;
    };
}

export function DraftEditorModal({ isOpen, onClose, groupId, draftId, initialData, driveSettings }: DraftEditorModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [sections, setSections] = useState({
        // Report fields
        context: initialData?.sections?.context || '',
        experimental: initialData?.sections?.experimental || '',
        findings: initialData?.sections?.findings || '',
        nextSteps: initialData?.sections?.nextSteps || '',
        difficulties: initialData?.sections?.difficulties || '',
        // Meeting Note fields
        attendees: initialData?.sections?.attendees || '',
        notes: initialData?.sections?.notes || '',
        agreements: initialData?.sections?.agreements || '',
    });

    if (!isOpen) return null;

    const handleSaveDraft = async () => {
        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('group_id', groupId);
            formData.append('title', initialData?.title || 'Untitled Draft');
            formData.append('type', initialData?.type || 'report');
            formData.append('start_date', initialData?.startDate || '');
            formData.append('end_date', initialData?.endDate || '');
            formData.append('sections', JSON.stringify(sections));

            let result;
            if (draftId) {
                formData.append('draft_id', draftId);
                result = await updateDraftAction(formData);
            } else {
                result = await saveDraftAction(formData);
            }

            if (result?.error) {
                toast.error(result.error);
            } else {
                toast.success('Draft saved successfully');
                onClose();
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to save draft');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateDocument = async () => {
        setIsLoading(true);
        try {
            let currentDraftId = draftId;

            // Save/update draft first
            const formData = new FormData();
            formData.append('group_id', groupId);
            formData.append('title', initialData?.title || 'Untitled Draft');
            formData.append('type', initialData?.type || 'report');
            formData.append('start_date', initialData?.startDate || '');
            formData.append('end_date', initialData?.endDate || '');
            formData.append('sections', JSON.stringify(sections));

            if (draftId) {
                formData.append('draft_id', draftId);
                const updateResult = await updateDraftAction(formData);
                if (updateResult?.error) {
                    toast.error(updateResult.error);
                    return;
                }
            } else {
                const saveResult = await saveDraftAction(formData);
                if (saveResult?.error) {
                    toast.error(saveResult.error);
                    return;
                }
                if (!saveResult?.draftId) {
                    toast.error('Failed to create draft');
                    return;
                }
                currentDraftId = saveResult.draftId;
            }

            // Generate Google Doc with pre-filled content
            const { generateReportWithSections, loadGoogleGenerator, initGapiClient } = await import('@/lib/google/generator');

            await loadGoogleGenerator();
            if (driveSettings?.apiKey && driveSettings?.clientId) {
                await initGapiClient(driveSettings.apiKey.trim(), driveSettings.clientId.trim());
            }

            // Determine folder ID based on type
            let targetFolderId = driveSettings?.folderId;
            if (initialData?.type === 'report' && driveSettings?.reportFolderId) targetFolderId = driveSettings.reportFolderId;
            if (initialData?.type === 'meeting_note' && driveSettings?.meetingFolderId) targetFolderId = driveSettings.meetingFolderId;
            if (initialData?.type === 'ppt' && driveSettings?.pptFolderId) targetFolderId = driveSettings.pptFolderId;

            const fileResult = await generateReportWithSections(
                initialData?.title || 'Untitled Draft',
                {
                    authorName: "User",
                    startDate: initialData?.startDate || '',
                    endDate: initialData?.endDate || '',
                },
                sections,
                targetFolderId,
                initialData?.type // Pass type to generator
            );

            if (!fileResult?.id) {
                throw new Error('Failed to generate document');
            }

            // Update draft with Google Doc info
            const updateDocFormData = new FormData();
            updateDocFormData.append('draft_id', currentDraftId);
            updateDocFormData.append('drive_file_id', fileResult.id);
            updateDocFormData.append('web_view_link', fileResult.webViewLink);

            const updateResult = await updateDraftWithDocAction(updateDocFormData);

            if (updateResult?.error) {
                toast.error(updateResult.error);
            } else {
                toast.success('Document generated successfully');
                window.open(fileResult.webViewLink, '_blank');
                onClose();
            }
        } catch (error: any) {
            console.error('Generate document error:', error);
            toast.error(error.message || 'Failed to generate document');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in-0">
            <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-indigo-600" />
                            {draftId ? 'Edit Draft' : 'Create Draft'}
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">{initialData?.title}</p>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                        <X size={20} />
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {initialData?.type === 'meeting_note' ? (
                        <>
                            {/* Attendees */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 bg-blue-50">
                                    <div className="p-1.5 rounded-lg bg-blue-500 text-white shadow-sm">
                                        <Target className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Attendees</h3>
                                </div>
                                <div className="p-4">
                                    <textarea
                                        value={sections.attendees || ''}
                                        onChange={(e) => setSections({ ...sections, attendees: e.target.value })}
                                        placeholder="List of attendees..."
                                        className="w-full min-h-[100px] px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                    />
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 bg-purple-50">
                                    <div className="p-1.5 rounded-lg bg-purple-500 text-white shadow-sm">
                                        <FileText className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Notes / Minutes</h3>
                                </div>
                                <div className="p-4">
                                    <textarea
                                        value={sections.notes || ''}
                                        onChange={(e) => setSections({ ...sections, notes: e.target.value })}
                                        placeholder="Meeting details..."
                                        className="w-full min-h-[300px] px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                                    />
                                </div>
                            </div>

                            {/* Agreements */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 bg-green-50">
                                    <div className="p-1.5 rounded-lg bg-green-500 text-white shadow-sm">
                                        <Target className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Agreements / Action Items</h3>
                                </div>
                                <div className="p-4">
                                    <textarea
                                        value={sections.agreements || ''}
                                        onChange={(e) => setSections({ ...sections, agreements: e.target.value })}
                                        placeholder="Agreements and pending tasks..."
                                        className="w-full min-h-[150px] px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Context / Objective */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 bg-blue-50">
                                    <div className="p-1.5 rounded-lg bg-blue-500 text-white shadow-sm">
                                        <Target className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Context / Objective</h3>
                                </div>
                                <div className="p-4">
                                    <textarea
                                        value={sections.context}
                                        onChange={(e) => setSections({ ...sections, context: e.target.value })}
                                        placeholder="What is the context and objective of this work?"
                                        className="w-full min-h-[100px] px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                    />
                                </div>
                            </div>

                            {/* Experimental Work */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 bg-purple-50">
                                    <div className="p-1.5 rounded-lg bg-purple-500 text-white shadow-sm">
                                        <FlaskConical className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Experimental Work</h3>
                                </div>
                                <div className="p-4">
                                    <textarea
                                        value={sections.experimental}
                                        onChange={(e) => setSections({ ...sections, experimental: e.target.value })}
                                        placeholder="What experiments or work did you perform?"
                                        className="w-full min-h-[100px] px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                                    />
                                </div>
                            </div>

                            {/* Findings */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 bg-green-50">
                                    <div className="p-1.5 rounded-lg bg-green-500 text-white shadow-sm">
                                        <Lightbulb className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Findings</h3>
                                </div>
                                <div className="p-4">
                                    <textarea
                                        value={sections.findings}
                                        onChange={(e) => setSections({ ...sections, findings: e.target.value })}
                                        placeholder="What did you discover or learn?"
                                        className="w-full min-h-[100px] px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                                    />
                                </div>
                            </div>

                            {/* Difficulties */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 bg-orange-50">
                                    <div className="p-1.5 rounded-lg bg-orange-500 text-white shadow-sm">
                                        <AlertTriangle className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Difficulties</h3>
                                </div>
                                <div className="p-4">
                                    <textarea
                                        value={sections.difficulties}
                                        onChange={(e) => setSections({ ...sections, difficulties: e.target.value })}
                                        placeholder="What challenges or obstacles did you face?"
                                        className="w-full min-h-[100px] px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                                    />
                                </div>
                            </div>

                            {/* Next Steps */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 bg-indigo-50">
                                    <div className="p-1.5 rounded-lg bg-indigo-500 text-white shadow-sm">
                                        <ArrowRight className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Next Steps</h3>
                                </div>
                                <div className="p-4">
                                    <textarea
                                        value={sections.nextSteps}
                                        onChange={(e) => setSections({ ...sections, nextSteps: e.target.value })}
                                        placeholder="What are the next steps or future work?"
                                        className="w-full min-h-[100px] px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer - Fixed */}
                <div className="flex justify-between items-center gap-3 p-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                        disabled={isLoading}
                    >
                        Cancel
                    </button>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleSaveDraft}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
                        >
                            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            Save Draft
                        </button>
                        <button
                            type="button"
                            onClick={handleGenerateDocument}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
                        >
                            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                            Generate Document
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

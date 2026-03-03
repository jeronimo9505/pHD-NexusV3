import React, { useEffect, useState } from 'react';
import { useReportDetails } from '../hooks/useReports';
import { useTasks } from '../../../modules/Tasks/hooks/useTasks';
import { useReviewSession } from '../hooks/useReviewSession';
import { useApp } from '@/context/AppContext';

import { downloadPdfFromElement } from '../lib/pdf';
import { downloadReportPdfText } from '../lib/pdfText';

// Components
import ReviewHeader from './ReviewMode/ReviewHeader';
import ReportPaper from './ReviewMode/ReportPaper';
import FloatingToolbar from './ReviewMode/FloatingToolbar';
import CommentMargin from './ReviewMode/CommentMargin';
import TaskModal from './TaskModal';

export default function ReportReadView({ reportId, onBack }) {
    const { currentUser, userRole, groupMembers } = useApp();
    const {
        reportMeta,
        sections,
        comments,
        annotations,
        linkedTasks,
        completedTasks,
        linkedResources,
        addAnnotation,
        deleteAnnotation,
        updateReportStatus,
        markAsSeen,
        refetch: refetchDetails
    } = useReportDetails(reportId);

    const { createTask } = useTasks();

    // State Hook
    const {
        selection,
        viewMode,
        showSidenotes,
        draftAnnotation,
        setViewMode,
        setShowSidenotes,
        handleSelection,
        startDraft,
        cancelDraft,
        setSelection
    } = useReviewSession();

    // Modal State
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

    // Interactive State (Hover/Focus)
    const [activeAnnotationId, setActiveAnnotationId] = useState(null);

    // Effect: Mark as Seen Logic
    useEffect(() => {
        if (!reportMeta || !currentUser) return;

        // Logic: If I am NOT the author, and the report is submitted, and I haven't seen it yet -> Mark as seen.
        const isAuthor = reportMeta.authorId === currentUser.id;
        const isSubmitted = reportMeta.status === 'submitted';

        if (!isAuthor && isSubmitted) {
            // Check if I am already in the 'seenBy' list
            const amISeen = reportMeta.seenBy?.some(u => u.id === currentUser.id);

            if (!amISeen) {
                markAsSeen();
            }
        }
    }, [reportMeta, currentUser, markAsSeen]);

    // Handlers
    const handleComment = () => {
        startDraft('comment');
    };

    const handleTask = () => {
        setIsTaskModalOpen(true);
        // Note: Task doesn't use draft card, it uses Modal, but we keep selection active to grab quote
    };

    const handleHighlight = async () => {
        if (!selection) return;
        // Direct save for highlight
        await addAnnotation({
            report_id: reportId,
            author_id: currentUser?.id,
            type: 'highlight',
            section_key: selection.sectionKey,
            quote: selection.text,
            range_start: 0, // Mock, needs real offset logic if we want persistence
            range_end: 0
        });
        setSelection(null);
    };

    const handleSaveDraftComment = async (content) => {
        if (!draftAnnotation) return;
        await addAnnotation({
            report_id: reportId,
            author_id: currentUser?.id,
            type: 'comment',
            section_key: draftAnnotation.sectionKey,
            quote: draftAnnotation.text,
            content: content
        });
        cancelDraft();
    };

    const handleReply = async (originalComment, replyText) => {
        await addAnnotation({
            report_id: reportId,
            author_id: currentUser?.id,
            type: 'comment',
            section_key: originalComment.section_key,
            quote: originalComment.quote,
            // Threading (Word-like): store relationship so UI can nest replies.
            parent_id: originalComment.parent_id || originalComment.id,
            thread_id: originalComment.thread_id || originalComment.id,
            content: replyText
        });
    };

    const handleDeleteComment = async (commentId) => {
        if (!commentId) return;

        const all = (annotations || []).filter((a) => a?.type === 'comment');
        const toDelete = new Set([commentId]);

        // Also delete replies (1-level deep + transitive, in case we ever allow deeper threads)
        let changed = true;
        while (changed) {
            changed = false;
            for (const c of all) {
                if (!c?.id) continue;
                if (c.parent_id && toDelete.has(c.parent_id) && !toDelete.has(c.id)) {
                    toDelete.add(c.id);
                    changed = true;
                }
            }
        }

        if (!window.confirm('¿Eliminar este comentario y sus respuestas?')) return;

        for (const id of toDelete) {
            // sequential keeps mockDB/localStorage consistent
            // eslint-disable-next-line no-await-in-loop
            await deleteAnnotation(id);
        }
    };

    const handleSaveTask = async (taskData) => {
        const { error } = await createTask({
            ...taskData,
            sourceReportId: reportId,
            description: selection ? `Contexto del reporte:\n"${selection.text}"\n\n${taskData.description || ''}` : taskData.description
        });

        if (error) {
            alert("Error al crear tarea: " + error);
        } else {
            refetchDetails();
            setIsTaskModalOpen(false);
            setSelection(null);
        }
    };

    const handlePrint = () => window.print();

    useEffect(() => {
        const rasterHandler = async () => {
            try {
                const el = document.getElementById('printable-paper');
                if (!el) return;

                const safeName = (reportMeta?.authorName || 'report')
                    .toString()
                    .trim()
                    .replaceAll(' ', '_')
                    .replaceAll('/', '-')
                    .slice(0, 80);

                await downloadPdfFromElement(el, {
                    filename: `${safeName}.pdf`
                });
            } catch (err) {
                console.error(err);
                alert(`No se pudo generar el PDF: ${err?.message || err}`);
            }
        };

        const textHandler = () => {
            try {
                const safeName = (reportMeta?.authorName || 'report')
                    .toString()
                    .trim()
                    .replaceAll(' ', '_')
                    .replaceAll('/', '-')
                    .slice(0, 80);

                const commentAnnotations = (annotations || []).filter((a) => a?.type === 'comment');

                downloadReportPdfText({
                    reportMeta,
                    sections,
                    tasks: linkedTasks,
                    completedTasks,
                    comments: commentAnnotations,
                    resources: linkedResources,
                    filename: `${safeName}.pdf`
                });
            } catch (err) {
                console.error(err);
                alert(`No se pudo generar el PDF con texto: ${err?.message || err}`);
            }
        };

        // Old raster export (kept for debugging / fallback)
        window.addEventListener('reports:download-pdf', rasterHandler);
        // New vector-text export
        window.addEventListener('reports:download-pdf-text', textHandler);

        return () => {
            window.removeEventListener('reports:download-pdf', rasterHandler);
            window.removeEventListener('reports:download-pdf-text', textHandler);
        };
    }, [reportMeta, sections, linkedTasks, completedTasks, annotations, linkedResources]);

    const handleStatusChange = async (newStatus) => {
        if (window.confirm(`¿Cambiar estado a ${newStatus}?`)) {
            await updateReportStatus(newStatus);
        }
    };

    if (!reportMeta) return <div className="p-10 flex justify-center">Cargando modo revisión...</div>;

    return (
        <div className="flex h-full bg-slate-100/50 relative font-sans overflow-hidden">
            {/* 1. Header (Hidden in Print) */}
            <div className="print-hidden">
                <ReviewHeader
                    reportMeta={reportMeta}
                    onBack={onBack}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    showSidenotes={showSidenotes}
                    setShowSidenotes={setShowSidenotes}
                    onPrint={handlePrint}
                    onApprove={() => handleStatusChange('approved')}
                    onRequestChanges={() => handleStatusChange('changes_requested')}
                />
            </div>

            {/* 2. Main Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col items-start pt-12 pb-20 scroll-smooth bg-[#F8F9FA]" id="report-container">

                {/* Scrollable Container covering pure center */}
                <div className="w-full flex justify-center min-w-min px-8">

                    {/* 3. Wrapper for Paper + Margin */}
                    <div id="printable-wrapper" className="flex items-start gap-8 max-w-[1400px] relative">

                        {/* The Paper */}
                        <div className="relative shrink-0">
                            <ReportPaper
                                sections={sections}
                                completedTasks={completedTasks}
                                reportMeta={reportMeta}
                                onSelection={handleSelection}
                                annotations={annotations}
                                activeAnnotationId={activeAnnotationId}
                                onAnnotationHover={setActiveAnnotationId}
                            />

                            {/* 4. Floating Toolbar (Attached to Paper/Selection) - Hidden in Print */}
                            <div className="print-hidden">
                                <FloatingToolbar
                                    selection={selection}
                                    onComment={handleComment}
                                    onTask={handleTask}
                                    onHighlight={handleHighlight}
                                />
                            </div>
                        </div>

                        {/* 5. Comment Margin (Integrated Right Column) */}
                        {showSidenotes && viewMode === 'review' && (
                            <div className="shrink-0 pt-0 print:hidden">
                                <CommentMargin
                                    comments={annotations.filter(a => a.type === 'comment')}
                                    tasks={linkedTasks}
                                    resources={linkedResources}
                                    draftAnnotation={draftAnnotation}
                                    onSaveDraft={handleSaveDraftComment}
                                    onCancelDraft={cancelDraft}
                                    onDeleteComment={handleDeleteComment}
                                    activeAnnotationId={activeAnnotationId}
                                    onHover={setActiveAnnotationId}
                                    onReply={handleReply}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 7. Modals - Hidden in Print */}
            {isTaskModalOpen && (
                <div className="print-hidden">
                    <TaskModal
                        isOpen={isTaskModalOpen}
                        onClose={() => setIsTaskModalOpen(false)}
                        onSave={handleSaveTask}
                        currentUser={currentUser}
                        groupMembers={groupMembers}
                    />
                </div>
            )}
        </div>
    );
}

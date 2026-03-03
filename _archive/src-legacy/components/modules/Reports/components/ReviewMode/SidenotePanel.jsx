import React, { useMemo } from 'react';

import { MessageSquare } from 'lucide-react';

import TaskList from './_shared/TaskList';
import CommentCard from './_shared/CommentCard';
import DraftCommentCard from './_shared/DraftCommentCard';

export default function SidenotePanel({
    tasks = [], // New prop
    resources = [],
    comments = [],
    draftAnnotation,
    onSaveDraft,
    onCancelDraft,
    onDeleteComment,

    // optional (used by other UIs)
    activeAnnotationId,
    onHover,
    onReply
}) {
    const normalizedComments = useMemo(() => {
        return (comments || []).map((c) => {
            const createdAt = c.created_at || c.date || c.createdAt;
            return {
                ...c,
                author: c.author || 'Unknown',
                created_at: createdAt,
                text: c.text ?? c.content ?? ''
            };
        });
    }, [comments]);

    return (
    <div className="w-[350px] flex-shrink-0 flex flex-col h-full bg-slate-50 border-l border-gray-200 z-20 pt-20 px-4 custom-scrollbar overflow-y-auto pb-40 print:hidden">

            {/* Header */}
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <MessageSquare className="w-3 h-3" /> Comentarios
            </h3>

            {/* Empty State */}
            {comments.length === 0 && !draftAnnotation && (
                <div className="text-center py-20 opacity-50">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm text-slate-400">Sin comentarios aún</p>
                </div>
            )}

            {/* Next Steps / Tasks */}
            <TaskList tasks={tasks} variant="panel" title="Próximos pasos" mode="nextSteps" initialVisible={3} />

            {/* Resources */}
            {resources?.length > 0 && (
                <div className="mb-6 space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-slate-400">
                        Recursos
                    </div>
                    <div className="space-y-2">
                        {resources.map((r) => (
                            <a
                                key={r.linkId || r.id || r.title}
                                href={r.url || r.link || '#'}
                                target={r.url || r.link ? '_blank' : undefined}
                                rel={r.url || r.link ? 'noreferrer' : undefined}
                                className="block bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                                aria-label={r.url || r.link ? `Abrir recurso: ${r.title || 'Recurso'}` : undefined}
                            >
                                <div className="text-sm font-medium truncate text-blue-700 hover:text-blue-800 underline underline-offset-2 decoration-blue-200">
                                    {r.title || r.name || 'Recurso'}
                                </div>
                                {(r.summary || r.description) && (
                                    <div className="mt-1 text-xs text-slate-500 line-clamp-2">
                                        {r.summary || r.description}
                                    </div>
                                )}
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* List */}
            <div className="space-y-4">
                {/* Draft Card */}
                <DraftCommentCard
                    draftAnnotation={draftAnnotation}
                    onSave={onSaveDraft}
                    onCancel={onCancelDraft}
                    variant="panel"
                />

                {/* Existing Comments */}
                {normalizedComments.map((comment, index) => (
                    <CommentCard
                        key={comment.id || index}
                        comment={comment}
                        active={activeAnnotationId === comment.id}
                        onHover={onHover}
                        onReply={onReply}
                        onDelete={onDeleteComment}
                        avatarVariant="slate"
                    />
                ))}
            </div>
        </div>
    );
}

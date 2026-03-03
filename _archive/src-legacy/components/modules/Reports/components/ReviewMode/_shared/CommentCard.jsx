import React, { useState } from 'react';
import clsx from 'clsx';
import { Reply } from 'lucide-react';
import { formatMonthDay, normalizeComment } from './reviewModeFormatters';

export default function CommentCard({
    comment,
    active,
    onHover,
    onReply,
    onDelete,
    replies = [],
    repliesExpanded,
    onToggleReplies,
    showReply = true,
    avatarVariant = 'indigo' // 'indigo' | 'slate'
}) {
    const c = normalizeComment(comment);
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [showContext, setShowContext] = useState(false);

    const initials = (c.author || 'AN').substring(0, 2).toUpperCase();

    const submitReply = async () => {
        if (!onReply) return;
        const content = replyText.trim();
        if (!content) return;
        await onReply(c, content);
        setIsReplying(false);
        setReplyText('');
    };

    return (
        <div
            id={c.id ? `annotation-${c.id}` : undefined}
            className={clsx(
                'group relative bg-white rounded-xl p-3 shadow-sm border transition-all hover:shadow-md',
                active ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-100 hover:border-indigo-100'
            )}
            onMouseEnter={() => onHover && c.id && onHover(c.id)}
            onMouseLeave={() => onHover && onHover(null)}
        >
            <div className="flex justify-between items-start mb-1.5">
                <div className="flex items-center gap-2">
                    <div
                        className={clsx(
                            'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold',
                            avatarVariant === 'indigo' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'
                        )}
                    >
                        {initials}
                    </div>
                    <span className="text-xs font-bold text-slate-900">{c.author}</span>
                </div>
                <span className="text-[10px] text-slate-400">{formatMonthDay(c.created_at)}</span>
            </div>

            {c.quote && (
                <div className="mb-1.5">
                    <div className="flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowContext((v) => !v);
                            }}
                            className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md px-2 py-1"
                        >
                            {showContext ? 'Ocultar contexto' : 'Ver contexto'}
                        </button>

                        {c.id && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const el = document.getElementById(`highlight-${c.id}`);
                                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });

                                    if (el) {
                                        el.classList.remove('comment-highlight-flash');
                                        // eslint-disable-next-line no-unused-expressions
                                        el.offsetHeight;
                                        el.classList.add('comment-highlight-flash');
                                        window.setTimeout(() => el.classList.remove('comment-highlight-flash'), 1200);
                                    }
                                }}
                                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md px-2 py-1"
                            >
                                Ir al texto
                            </button>
                        )}
                    </div>

                    {showContext && (
                        <div className="mt-1.5 pl-2 border-l-2 border-slate-200 text-xs text-slate-500 italic">
                            "{c.quote}"
                        </div>
                    )}
                </div>
            )}

            <div className="text-[13px] text-slate-700 leading-snug">{c.text}</div>

            {replies?.length > 0 && (
                <div className="mt-2">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onToggleReplies && c.id) onToggleReplies(c.id);
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md px-2 py-1"
                    >
                        {repliesExpanded ? 'Ocultar respuestas' : `${replies.length} more repl${replies.length === 1 ? 'y' : 'ies'}`}
                    </button>

                    {repliesExpanded && (
                        <div className="mt-1.5 pl-3 border-l border-slate-200 space-y-1.5">
                            {replies.map((r) => {
                                const rid = r?.id;
                                const author = r?.author || 'Unknown';
                                const initialsR = (author || 'AN').substring(0, 2).toUpperCase();
                                const body = r?.text ?? r?.content ?? '';
                                return (
                                    <div key={rid} className="text-[13px] text-slate-700">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-[8px] font-bold bg-slate-200 text-slate-600">
                                                    {initialsR}
                                                </div>
                                                <span className="text-xs font-bold text-slate-900">{author}</span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-400">{formatMonthDay(r?.created_at)}</span>
                                                {onDelete && rid && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDelete(rid);
                                                        }}
                                                        className="px-1.5 py-0.5 text-[11px] font-bold text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                                                    >
                                                        Eliminar
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-1 text-[13px] text-slate-700 leading-snug">{body}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <div className="mt-2 flex items-center justify-end gap-2">
                {showReply && onReply && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsReplying(true);
                            setReplyText('');
                        }}
                        className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors flex items-center gap-1"
                        aria-label="Responder comentario"
                        title="Responder"
                    >
                        <Reply className="w-3.5 h-3.5" /> Responder
                    </button>
                )}

                {onDelete && c.id && (
                    <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        className="px-2 py-1 text-[11px] font-bold text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                        aria-label="Eliminar comentario"
                        title="Eliminar"
                    >
                        Eliminar
                    </button>
                )}
            </div>

            {isReplying && onReply && (
                <div className="mt-2 bg-transparent rounded-lg">
                    <textarea
                        className="w-full text-[13px] p-2 bg-white rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none resize-none"
                        rows={2}
                        placeholder="Escribe una respuesta…"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                submitReply();
                            }
                            if (e.key === 'Escape') {
                                setIsReplying(false);
                                setReplyText('');
                            }
                        }}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setIsReplying(false);
                                setReplyText('');
                            }}
                            className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 rounded-md"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={submitReply}
                            disabled={!replyText.trim()}
                            className="px-2.5 py-1 text-[11px] font-bold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Enviar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

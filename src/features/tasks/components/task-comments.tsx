'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Send, Trash2, Loader2 } from 'lucide-react';
import { getTaskCommentsAction, createTaskCommentAction, deleteTaskCommentAction, TaskComment } from '../actions/comments';
import { toast } from 'sonner';

interface TaskCommentsProps {
    taskId: string;
    groupId: string;
}

export function TaskComments({ taskId, groupId }: TaskCommentsProps) {
    const [comments, setComments] = useState<TaskComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadComments();
    }, [taskId]);

    const loadComments = async () => {
        setLoading(true);
        const res = await getTaskCommentsAction(taskId);
        if (res.data) {
            setComments(res.data);
        }
        setLoading(false);
    };

    const handleSubmit = async () => {
        if (!newComment.trim()) return;

        setSubmitting(true);
        const res = await createTaskCommentAction(taskId, groupId, newComment);

        if (res.error) {
            toast.error("Failed to post comment");
        } else if (res.data) {
            setComments([...comments, res.data]);
            setNewComment('');
            toast.success("Comment posted");
        }
        setSubmitting(false);
    };

    const handleDelete = async (commentId: string) => {
        const res = await deleteTaskCommentAction(commentId, groupId);
        if (res.error) {
            toast.error("Failed to delete comment");
        } else {
            setComments(comments.filter(c => c.id !== commentId));
            toast.success("Comment deleted");
        }
    };

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <MessageSquare size={16} className="text-indigo-400" />
                Comments ({comments.length})
            </h3>

            {/* Comments List */}
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center py-8 text-slate-400">
                        <Loader2 size={20} className="animate-spin" />
                    </div>
                ) : comments.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                        💬 No comments yet. Be the first to comment!
                    </div>
                ) : (
                    comments.map(comment => (
                        <div key={comment.id} className="group flex gap-3 p-3 bg-slate-800 rounded-lg hover:bg-slate-700 transition-all border border-slate-700">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0 shadow-lg">
                                {comment.profile.avatar_url ? (
                                    <img src={comment.profile.avatar_url} className="w-full h-full rounded-full object-cover" alt={comment.profile.full_name} />
                                ) : (
                                    comment.profile.full_name.charAt(0).toUpperCase()
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-sm font-bold text-slate-100">{comment.profile.full_name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">
                                            {new Date(comment.created_at).toLocaleString('es-ES', {
                                                day: '2-digit',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                        <button
                                            onClick={() => handleDelete(comment.id)}
                                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-all p-1 hover:bg-slate-600 rounded"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words">{comment.body}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* New Comment Input */}
            <div className="flex gap-2 pt-2">
                <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                            handleSubmit();
                        }
                    }}
                    placeholder="Write a comment... (Ctrl+Enter to send)"
                    className="flex-1 p-3 text-sm bg-slate-800 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none transition-all"
                    rows={2}
                />
                <button
                    onClick={handleSubmit}
                    disabled={submitting || !newComment.trim()}
                    className="px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-medium shadow-lg hover:shadow-indigo-500/50"
                >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgb(51 65 85 / 0.3);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgb(100 116 139 / 0.5);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgb(100 116 139 / 0.7);
                }
            `}</style>
        </div>
    );
}

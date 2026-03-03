import { useState, useOptimistic, useTransition, useEffect } from "react";
import { DriveReportComment } from "../types";
import { addCommentAction, deleteCommentAction } from "../actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MessageSquare, Send, Trash2, User as UserIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface CommentsSectionProps {
    reportId: string;
    groupId: string;
    currentUserId: string;
    initialComments?: DriveReportComment[];
}

function formatTimeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}

export function CommentsSection({ reportId, groupId, currentUserId, initialComments }: CommentsSectionProps) {
    const [comments, setComments] = useState<DriveReportComment[]>(initialComments || []);
    const [newComment, setNewComment] = useState("");
    const [isPending, startTransition] = useTransition();
    const supabase = createClient();

    // Fetch comments on mount if not provided (or to refresh)
    useEffect(() => {
        const fetchComments = async () => {
            const { data, error } = await supabase
                .from('drive_report_comments')
                .select(`
                    *,
                    author:author_id (
                        full_name,
                        avatar_url
                    )
                `)
                .eq('report_id', reportId)
                .order('created_at', { ascending: true });

            if (data) {
                setComments(data as unknown as DriveReportComment[]);
            }
        };

        fetchComments();

        // Subscribe to realtime changes
        const channel = supabase
            .channel(`comments-${reportId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'drive_report_comments',
                filter: `report_id=eq.${reportId}`
            }, () => {
                fetchComments();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [reportId, supabase]);


    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;

        const content = newComment;
        setNewComment(""); // Optimistic clear

        // Optimistic add (temporary)
        const tempId = crypto.randomUUID();
        const optimisticComment: any = {
            id: tempId,
            report_id: reportId,
            author_id: currentUserId,
            content: content,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            author: {
                full_name: 'You',
                avatar_url: null
            }
        };

        setComments(prev => [...prev, optimisticComment]);

        startTransition(async () => {
            const result = await addCommentAction(reportId, content, groupId);
            if (result.error) {
                toast.error(result.error);
                setNewComment(content); // Revert input
                setComments(prev => prev.filter(c => c.id !== tempId)); // Revert list
            }
            // If success, the revalidatePath or Realtime will update the list with the real data
        });
    };

    const handleDeleteComment = async (commentId: string) => {
        // Optimistic delete
        const previousComments = [...comments];
        setComments(comments.filter(c => c.id !== commentId));

        startTransition(async () => {
            const result = await deleteCommentAction(commentId, groupId);
            if (result.error) {
                toast.error(result.error);
                setComments(previousComments); // Revert on error
            }
        });
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <MessageSquare className="w-3 h-3" /> Comments ({comments.length})
                </h4>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {comments.length > 0 ? (
                    comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3 group">
                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 overflow-hidden">
                                {comment.author?.avatar_url ? (
                                    <img src={comment.author.avatar_url} alt={comment.author.full_name} className="w-full h-full object-cover" />
                                ) : (
                                    <span>{(comment.author?.full_name || 'U').charAt(0)}</span>
                                )}
                            </div>
                            <div className="flex-1 bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm relative">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-xs font-bold text-slate-700">
                                        {comment.author?.full_name || 'Unknown User'}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                        {formatTimeAgo(comment.created_at)}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-600 whitespace-pre-wrap">{comment.content}</p>

                                {/* Delete Button (Only for author) */}
                                {comment.author_id === currentUserId && (
                                    <button
                                        onClick={() => handleDeleteComment(comment.id)}
                                        className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all bg-white/80 rounded"
                                        title="Delete comment"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="text-xs text-slate-400 italic">
                        No comments yet. Be the first to add one!
                    </p>
                )}
            </div>

            {/* Comment Input */}
            <form onSubmit={handleAddComment} className="relative">
                <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    disabled={isPending}
                    className="w-full py-2 px-3 pr-10 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 rounded-lg text-xs transition-all outline-none"
                />
                <button
                    type="submit"
                    disabled={!newComment.trim() || isPending}
                    className="absolute right-1.5 top-1.5 p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <Send className="w-3.5 h-3.5" />
                </button>
            </form>
        </div>
    );
}

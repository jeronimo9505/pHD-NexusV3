import { useState, useTransition, useEffect } from "react";
import { SampleComment } from "../types";
import { addSampleCommentAction, deleteSampleCommentAction } from "../actions";
import { toast } from "sonner";
import { cn } from '@/lib/utils';
import { MessageSquare, Send, Trash2, User as UserIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface SampleCommentsSectionProps {
    sampleId: string;
    groupId: string;
    // Current User ID for permission checks (delete own)
    // We can fetch it or pass it. Passing it avoids async in render if possible, 
    // but sample-detail-sheet is a client component, maybe we don't have it easily?
    // We can use createClient().auth.getUser() in useEffect.
    // Drive reports passed it. Let's try to pass it or fetch it.
    // If we fetch it here, it's safer.
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

export function SampleCommentsSection({ sampleId, groupId }: SampleCommentsSectionProps) {
    const [comments, setComments] = useState<SampleComment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [isPending, startTransition] = useTransition();
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const supabase = createClient();

    useEffect(() => {
        // Get current user
        supabase.auth.getUser().then(({ data }) => {
            setCurrentUserId(data.user?.id || null);
        });

        const fetchComments = async () => {
            const { data, error } = await supabase
                .from('sample_comments')
                .select(`
                    *,
                    author:author_id (
                        full_name,
                        avatar_url
                    )
                `)
                .eq('sample_id', sampleId)
                .order('created_at', { ascending: true });

            if (data) {
                setComments(data as unknown as SampleComment[]);
            }
        };

        fetchComments();

        // Subscribe to realtime changes
        const channel = supabase
            .channel(`sample-comments-${sampleId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'sample_comments',
                filter: `sample_id=eq.${sampleId}`
            }, () => {
                fetchComments();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [sampleId, supabase]);


    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !currentUserId) return;

        const content = newComment;
        setNewComment(""); // Optimistic clear

        // Optimistic add
        const tempId = crypto.randomUUID();
        const optimisticComment: SampleComment = {
            id: tempId,
            sample_id: sampleId,
            author_id: currentUserId,
            content: content,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            // We assume we know the author name? Or just "You"
            author: {
                full_name: 'You', // Placeholder until refresh
            }
        };

        setComments(prev => [...prev, optimisticComment]);

        startTransition(async () => {
            const result = await addSampleCommentAction(sampleId, content, groupId);
            if (result.error) {
                toast.error(result.error);
                setNewComment(content); // Revert input
                setComments(prev => prev.filter(c => c.id !== tempId)); // Revert list
            }
        });
    };

    const handleDeleteComment = async (commentId: string) => {
        // Optimistic delete
        const previousComments = [...comments];
        setComments(comments.filter(c => c.id !== commentId));

        startTransition(async () => {
            const result = await deleteSampleCommentAction(commentId, groupId);
            if (result.error) {
                toast.error(result.error);
                setComments(previousComments); // Revert on error
            }
        });
    };

    return (
        <div className="space-y-3 mt-6 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                    <MessageSquare size={12} className="text-slate-400" /> Comments ({comments.length})
                </h3>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                {comments.length > 0 ? (
                    comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3 group px-1">
                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 overflow-hidden border border-white shadow-sm">
                                {comment.author?.avatar_url ? (
                                    <img src={comment.author.avatar_url} alt={comment.author.full_name} className="w-full h-full object-cover" />
                                ) : (
                                    <span>{(comment.author?.full_name || 'U').charAt(0)}</span>
                                )}
                            </div>
                            <div className="flex-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100 relative group-hover:bg-white group-hover:shadow-sm transition-all">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-xs font-bold text-slate-700">
                                        {comment.author?.full_name || 'Unknown User'}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                        {formatTimeAgo(comment.created_at)}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{comment.content}</p>

                                {/* Delete Button (Only for author) */}
                                {comment.author_id === currentUserId && (
                                    <button
                                        onClick={() => handleDeleteComment(comment.id)}
                                        className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-slate-100"
                                        title="Delete comment"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-4 bg-slate-50/50 rounded-lg border border-dashed border-slate-200 mx-1">
                        <p className="text-xs text-slate-400 italic">No comments yet.</p>
                    </div>
                )}
            </div>

            {/* Comment Input */}
            <form onSubmit={handleAddComment} className="relative px-1">
                <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    disabled={isPending}
                    className="w-full py-2.5 px-3 pr-10 bg-white hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-lg text-xs transition-all outline-none shadow-sm"
                />
                <button
                    type="submit"
                    disabled={!newComment.trim() || isPending}
                    className="absolute right-2 top-2 p-1 text-slate-400 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <Send className="w-3.5 h-3.5" />
                </button>
            </form>
        </div>
    );
}

'use server';

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity-log";

export type TaskComment = {
    id: string;
    task_id: string;
    author_id: string;
    body: string;
    created_at: string;
    profile: {
        full_name: string;
        avatar_url?: string;
    };
};

export async function getTaskCommentsAction(taskId: string) {
    const supabase = await createClient();

    const { data: comments, error } = await supabase
        .from('task_comments')
        .select(`
            id,
            task_id,
            author_id,
            body,
            created_at,
            profile:profiles!task_comments_author_id_fkey(full_name, avatar_url)
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Error fetching comments:", error);
        return { error: error.message };
    }

    return { data: comments as TaskComment[] };
}

export async function createTaskCommentAction(taskId: string, groupId: string, content: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };
    if (!content.trim()) return { error: "Comment cannot be empty" };

    const { data: comment, error } = await supabase
        .from('task_comments')
        .insert({
            task_id: taskId,
            author_id: user.id,
            body: content.trim()
        })
        .select(`
            id,
            task_id,
            author_id,
            body,
            created_at,
            profile:profiles!task_comments_author_id_fkey(full_name, avatar_url)
        `)
        .single();

    if (error) {
        console.error("Error creating comment:", error);
        return { error: error.message };
    }

    // Log Activity
    await logActivity(groupId, 'commented', 'task', taskId, {
        comment_id: comment.id,
        preview: content.trim().substring(0, 100)
    });

    revalidatePath(`/${groupId}/tasks`);
    return { data: comment as TaskComment };
}

export async function deleteTaskCommentAction(commentId: string, groupId: string) {
    const supabase = await createClient();

    const { error } = await supabase
        .from('task_comments')
        .delete()
        .eq('id', commentId);

    if (error) {
        console.error("Error deleting comment:", error);
        return { error: error.message };
    }

    revalidatePath(`/${groupId}/tasks`);
    return { success: true };
}

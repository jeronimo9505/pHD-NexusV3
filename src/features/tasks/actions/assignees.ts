'use server';

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateTaskAssigneesAction(taskId: string, groupId: string, assigneeIds: string[]) {
    const supabase = await createClient();

    // 1. Delete existing assignments
    const { error: deleteError } = await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', taskId);

    if (deleteError) {
        console.error("Error deleting assignees:", deleteError);
        return { error: deleteError.message };
    }

    // 2. Insert new assignments
    if (assigneeIds.length > 0) {
        const assignments = assigneeIds.map(userId => ({
            task_id: taskId,
            user_id: userId
        }));

        const { error: insertError } = await supabase
            .from('task_assignees')
            .insert(assignments);

        if (insertError) {
            console.error("Error inserting assignees:", insertError);
            return { error: insertError.message };
        }
    }

    revalidatePath(`/${groupId}/tasks`);
    return { success: true };
}

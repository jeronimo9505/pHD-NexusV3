'use server';

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cookies } from "next/headers";

export type Subtask = {
    id: string;
    title: string;
    completed: boolean;
};

export type Task = {
    id: string;
    group_id: string;
    title: string;
    description?: string;
    status: string;
    previous_status?: string; // To remember original status when marking as done
    priority: 'low' | 'medium' | 'high';
    due_date?: string;
    created_by: string;
    created_at: string;
    completed: boolean;
    subtasks: Subtask[];
    assignees?: { user_id: string; profile: { full_name: string; avatar_url?: string } }[];
    creator_profile?: { full_name: string; avatar_url?: string };
    comments_count?: number;
};

const createTaskSchema = z.object({
    group_id: z.string().uuid(),
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    status: z.string().default('todo'),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    due_date: z.string().optional(), // ISO date string
    assignee_ids: z.array(z.string()).optional(),
});

export async function getTasksAction(groupId: string) {
    const supabase = await createClient();

    // Fetch tasks
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select(`
            *,
            assignees:task_assignees(user_id, profile:profiles(full_name, avatar_url)),
            creator_profile:profiles!created_by(full_name, avatar_url),
            comments:task_comments(count)
        `)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching tasks:", error);
        return { error: error.message };
    }

    // Transform data to match Task type (specifically comments_count and subtasks safety)
    const formattedTasks = tasks.map((t: any) => ({
        ...t,
        completed: t.completed ?? false, // Ensure boolean
        subtasks: t.subtasks || [], // Ensure array
        comments_count: t.comments?.[0]?.count || 0,
        // Supabase returns array of objects for relations, we just keep it as is but typed
    }));

    // Fetch group columns
    const { data: group } = await supabase
        .from('groups')
        .select('kanban_columns')
        .eq('id', groupId)
        .single();

    return {
        data: formattedTasks as Task[],
        columns: ((group as any)?.kanban_columns as string[]) || ["todo", "in_progress", "done"]
    };
}

export async function updateGroupKanbanColumnsAction(groupId: string, columns: string[]) {
    const supabase = await createClient();
    const { error, count } = await supabase
        .from('groups')
        .update({ kanban_columns: columns } as any) // Postgres handles JSONB array
        .eq('id', groupId)
        .select('*', { count: 'exact', head: true }); // Use select to get count

    if (error) return { error: error.message };
    if (count === 0) return { error: "Permission denied (RLS) or group not found" };

    revalidatePath(`/${groupId}/tasks`);
    return { success: true };
}

export async function moveTasksToStatusAction(groupId: string, oldStatus: string, newStatus: string) {
    const supabase = await createClient();

    // Update all tasks with the old status to the new status
    const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('group_id', groupId)
        .eq('status', oldStatus);

    if (error) return { error: error.message };

    revalidatePath(`/${groupId}/tasks`);
    return { success: true };
}

export async function createTaskAction(prevState: any, formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const rawData = {
        group_id: formData.get('group_id'),
        title: formData.get('title'),
        description: formData.get('description') || undefined, // Fix Zod null issue
        status: formData.get('status') || 'todo',
        priority: formData.get('priority') || 'medium',
        due_date: formData.get('due_date') || undefined,
        assignee_ids: formData.getAll('assignee_ids') as string[],
        subtasks: formData.get('subtasks') ? JSON.parse(formData.get('subtasks') as string) : [],
    };

    const validation = createTaskSchema.safeParse({ ...rawData, subtasks: undefined }); // Validate core fields only, subtasks separate for now or add to schema

    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }

    const { assignee_ids, ...taskData } = validation.data;

    // 1. Insert Task
    const { data: newTask, error: insertError } = await supabase
        .from('tasks')
        .insert({
            ...taskData,
            created_by: user.id,
            subtasks: rawData.subtasks
        })
        .select()
        .single();

    if (insertError) {
        return { error: insertError.message };
    }

    // 2. Insert Assignees (Auto-assign creator if nothing else selected, or explicitly selected)
    // "uno o más, por default primero siempre quien crea la tarea"
    // We'll interpret this as: Always add creator, OR ensure creator is in the list?
    // User says "one or more, by default first always who creates".
    // Let's add the creator to assignee_ids if not already there.

    const uniqueAssignees = new Set(assignee_ids || []);
    uniqueAssignees.add(user.id);
    const finalAssigneeIds = Array.from(uniqueAssignees);

    if (finalAssigneeIds.length > 0) {
        const modalAssignments = finalAssigneeIds.map(uid => ({
            task_id: newTask.id,
            user_id: uid
        }));

        const { error: assignError } = await supabase
            .from('task_assignees')
            .insert(modalAssignments);

        if (assignError) console.error("Error assigning users:", assignError);
    }

    revalidatePath(`/${taskData.group_id}/tasks`);
    return { success: true, task: newTask };
}

export async function updateTaskStatusAction(taskId: string, newStatus: string, groupId: string) {
    const supabase = await createClient();

    // Optimistic update support handled by client, strict server update here
    const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId);

    if (error) return { error: error.message };

    revalidatePath(`/${groupId}/tasks`);
    return { success: true };
}

export async function updateTaskAction(taskId: string, groupId: string, updates: Partial<Task>) {
    const supabase = await createClient();

    // Separate relational updates if any (e.g. assignees) - for now assuming simple fields + subtasks
    // If updating assignees, we'd need a separate logic or pass it differently.
    // Assuming 'updates' contains direct table columns.

    // Sanitize updates
    const {
        id,
        created_at,
        created_by,
        group_id,
        assignees,
        comments_count,
        ...tableUpdates
    } = updates as any;

    const { error } = await supabase
        .from('tasks')
        .update(tableUpdates)
        .eq('id', taskId);

    if (error) return { error: error.message };

    revalidatePath(`/${groupId}/tasks`);
    return { success: true };
}

export async function deleteTaskAction(taskId: string, groupId: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) return { error: error.message };
    revalidatePath(`/${groupId}/tasks`);
    return { success: true };
}

export async function setKanbanStateAction(groupId: string, collapsedState: Record<string, boolean>) {
    const cookieStore = await cookies();
    cookieStore.set(`kanban-col-state-${groupId}`, JSON.stringify(collapsedState), {
        sameSite: 'lax',
        secure: true,
        maxAge: 60 * 60 * 24 * 365 // 1 year
    });
    return { success: true };
}


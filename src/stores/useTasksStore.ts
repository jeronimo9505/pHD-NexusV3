import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { supabase } from '@/lib/supabase/client';

interface Task {
    id: string;
    group_id: string;
    created_by: string;
    title: string;
    description?: string;
    status: 'todo' | 'in_progress' | 'done';
    priority: 'low' | 'medium' | 'high';
    due_date?: string;
    completed_at?: string;
    created_at?: string;
    assignees?: any[];
    comments?: any[];
}

interface TasksState {
    tasks: Task[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchTasks: (groupId: string) => Promise<void>;
    createTask: (data: Partial<Task>) => Promise<{ error?: string; data?: Task }>;
    updateTask: (id: string, data: Partial<Task>) => Promise<{ error?: string }>;
    deleteTask: (id: string) => Promise<{ error?: string }>;
    addComment: (taskId: string, body: string, authorId: string) => Promise<{ error?: string }>;
    clearTasks: () => void;
}

export const useTasksStore = create<TasksState>()(
    immer((set, get) => ({
        tasks: [],
        loading: false,
        error: null,

        fetchTasks: async (groupId: string) => {
            if (!groupId) {
                set({ tasks: [], loading: false });
                return;
            }

            set({ loading: true, error: null });

            try {
                const { data, error } = await supabase
                    .from('tasks')
                    .select(`
            *,
            assignees:task_assignees(user_id, profiles(id, full_name, email)),
            comments:task_comments(id, body, author_id, created_at, profiles(full_name))
          `)
                    .eq('group_id', groupId)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                set({ tasks: data || [], loading: false, error: null });
            } catch (err: any) {
                console.error('Error fetching tasks:', err);
                set({ error: err.message, loading: false });
            }
        },

        createTask: async (taskData: Partial<Task>) => {
            // 1. Optimistic update
            const tempId = `temp-${Date.now()}`;
            const optimisticTask: Task = {
                id: tempId,
                status: 'todo',
                priority: 'medium',
                created_at: new Date().toISOString(),
                ...taskData,
            } as Task;

            set((state) => {
                state.tasks.unshift(optimisticTask);
            });

            try {
                // 2. Server mutation
                const { data, error } = await supabase
                    .from('tasks')
                    .insert(taskData)
                    .select(`
            *,
            assignees:task_assignees(user_id, profiles(id, full_name, email)),
            comments:task_comments(id, body, author_id, created_at, profiles(full_name))
          `)
                    .single();

                if (error) throw error;

                // 3. Replace temp with real
                set((state) => {
                    const index = state.tasks.findIndex(t => t.id === tempId);
                    if (index !== -1) {
                        state.tasks[index] = data;
                    }
                });

                return { data, error: undefined };
            } catch (err: any) {
                console.error('Error creating task:', err);

                // Rollback
                set((state) => {
                    state.tasks = state.tasks.filter(t => t.id !== tempId);
                });

                return { error: err.message };
            }
        },

        updateTask: async (id: string, updates: Partial<Task>) => {
            // 1. Optimistic update
            const previousTasks = get().tasks;

            set((state) => {
                const task = state.tasks.find(t => t.id === id);
                if (task) {
                    Object.assign(task, updates);
                }
            });

            try {
                // 2. Server mutation
                const { error } = await supabase
                    .from('tasks')
                    .update(updates)
                    .eq('id', id);

                if (error) throw error;

                return { error: undefined };
            } catch (err: any) {
                console.error('Error updating task:', err);

                // Rollback
                set({ tasks: previousTasks });

                return { error: err.message };
            }
        },

        deleteTask: async (id: string) => {
            // 1. Optimistic update
            const previousTasks = get().tasks;

            set((state) => {
                state.tasks = state.tasks.filter(t => t.id !== id);
            });

            try {
                // 2. Delete related records first
                await supabase.from('task_assignees').delete().eq('task_id', id);
                await supabase.from('task_comments').delete().eq('task_id', id);
                await supabase.from('report_task_links').delete().eq('task_id', id);
                await supabase.from('drive_report_task_links').delete().eq('task_id', id);

                // 3. Delete main record
                const { error } = await supabase
                    .from('tasks')
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                console.log('✅ Task deleted successfully');
                return { error: undefined };
            } catch (err: any) {
                console.error('❌ Error deleting task:', err);

                // Rollback
                set({ tasks: previousTasks });

                return { error: err.message };
            }
        },

        addComment: async (taskId: string, body: string, authorId: string) => {
            try {
                const { error } = await supabase
                    .from('task_comments')
                    .insert({ task_id: taskId, body, author_id: authorId });

                if (error) throw error;

                // Refetch task to get updated comments
                const { data } = await supabase
                    .from('tasks')
                    .select(`
            *,
            assignees:task_assignees(user_id, profiles(id, full_name, email)),
            comments:task_comments(id, body, author_id, created_at, profiles(full_name))
          `)
                    .eq('id', taskId)
                    .single();

                if (data) {
                    set((state) => {
                        const index = state.tasks.findIndex(t => t.id === taskId);
                        if (index !== -1) {
                            state.tasks[index] = data;
                        }
                    });
                }

                return { error: undefined };
            } catch (err: any) {
                console.error('Error adding comment:', err);
                return { error: err.message };
            }
        },

        clearTasks: () => {
            set({ tasks: [], loading: false, error: null });
        },
    }))
);

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';

export function useTasks() {
    const { activeGroupId, currentUser, groupMembers } = useApp();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchTasks = useCallback(async () => {
        if (!activeGroupId) return;

        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .eq('group_id', activeGroupId);

            if (error) throw error;

            // Load related data
            const { data: allComments } = await supabase.from('task_comments').select('*');
            const { data: allAssignees } = await supabase.from('task_assignees').select('*');
            const { data: allReportLinks } = await supabase.from('report_task_links').select('*');
            const { data: allDriveLinks } = await supabase.from('drive_report_task_links').select('*');

            // Transform for UI
            const transformed = (data || []).map(t => {
                const creator = groupMembers?.find(m => m.user_id === t.created_by || m.id === t.created_by)
                    || (currentUser?.id === t.created_by ? currentUser : null);

                const taskComments = (allComments || [])
                    .filter(c => c.task_id === t.id)
                    .map(c => {
                        const commentAuthor = groupMembers?.find(m => m.user_id === c.author_id || m.id === c.author_id)
                            || (currentUser?.id === c.author_id ? currentUser : null);
                        return {
                            id: c.id,
                            text: c.body,
                            author: commentAuthor?.full_name || commentAuthor?.name || 'Usuario',
                            role: commentAuthor?.system_role || commentAuthor?.role,
                            date: c.created_at
                        };
                    });

                const taskAssignees = (allAssignees || []).filter(a => a.task_id === t.id);
                const firstAssigneeId = taskAssignees.length > 0 ? taskAssignees[0].user_id : t.created_by;
                const assignedUser = groupMembers?.find(m => m.user_id === firstAssigneeId || m.id === firstAssigneeId)
                    || (currentUser?.id === firstAssigneeId ? currentUser : null);

                // Check both link tables
                const stdLink = (allReportLinks || []).find(l => l.task_id === t.id);
                const driveLink = (allDriveLinks || []).find(l => l.task_id === t.id);
                const sourceReportId = stdLink?.report_id || driveLink?.drive_report_id;

                return {
                    id: t.id,
                    groupId: t.group_id,
                    title: t.title,
                    description: t.description,
                    status: t.status,
                    priority: t.priority,
                    dueDate: t.due_date,
                    createdAt: t.created_at,
                    completedAt: t.completed_at,
                    assignedBy: creator?.full_name || creator?.name || 'Usuario',
                    assignedTo: assignedUser?.full_name || assignedUser?.name,
                    sourceReportId,
                    assignees: taskAssignees,
                    comments: taskComments
                };
            });

            transformed.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setTasks(transformed);
            setError(null);
        } catch (err) {
            console.error('Error fetching tasks:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [activeGroupId, groupMembers, currentUser]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    const createTask = async (taskData) => {
        if (!activeGroupId || !currentUser) return { error: 'Missing required data' };

        try {
            const { data: newTask, error } = await supabase.from('tasks').insert({
                group_id: activeGroupId,
                created_by: currentUser.id,
                title: taskData.title,
                description: taskData.description || '',
                status: taskData.status || 'todo',
                priority: taskData.priority || 'medium',
                due_date: taskData.dueDate || null
            }).select().single();

            if (error) return { error };

            const assigneeIds = (taskData.assignees && taskData.assignees.length > 0)
                ? taskData.assignees
                : [currentUser.id];

            if (assigneeIds.length > 0) {
                const assigneeRecords = assigneeIds.map(userId => ({
                    task_id: newTask.id,
                    user_id: userId
                }));
                await supabase.from('task_assignees').insert(assigneeRecords);
            }

            if (taskData.sourceReportId) {
                // Determine which link table to use
                // If it's a UUID, we check if it's in drive_reports
                const { data: isDriveReport } = await supabase.from('drive_reports').select('id').eq('id', taskData.sourceReportId).single();

                if (isDriveReport) {
                    await supabase.from('drive_report_task_links').insert({
                        task_id: newTask.id,
                        drive_report_id: taskData.sourceReportId
                    });
                } else {
                    await supabase.from('report_task_links').insert({
                        task_id: newTask.id,
                        report_id: taskData.sourceReportId
                    });
                }
            }

            await fetchTasks();
            return { data: newTask };
        } catch (err) {
            return { error: err.message };
        }
    };

    const updateTask = async (taskId, updates) => {
        try {
            const fieldMapping = {
                'dueDate': 'due_date'
            };

            const dbUpdates = {};
            Object.keys(updates).forEach(key => {
                if (key === 'sourceReportId' || key === 'assignees') return; // Handle separately
                const dbKey = fieldMapping[key] || key;
                dbUpdates[dbKey] = updates[key];
            });

            // Update main task fields if any
            if (Object.keys(dbUpdates).length > 0) {
                const { error } = await supabase.from('tasks').update(dbUpdates).eq('id', taskId);
                if (error) return { error };
            }

            if (updates.assignees) {
                await supabase.from('task_assignees').delete().eq('task_id', taskId);

                if (updates.assignees.length > 0) {
                    const newRecords = updates.assignees.map(userId => ({
                        task_id: taskId,
                        user_id: userId
                    }));
                    await supabase.from('task_assignees').insert(newRecords);
                }
            }

            if (updates.sourceReportId !== undefined) {
                // Clear existing from both link tables
                await supabase.from('report_task_links').delete().eq('task_id', taskId);
                await supabase.from('drive_report_task_links').delete().eq('task_id', taskId);

                // Add new if present
                if (updates.sourceReportId) {
                    const { data: isDriveReport } = await supabase.from('drive_reports').select('id').eq('id', updates.sourceReportId).single();

                    if (isDriveReport) {
                        await supabase.from('drive_report_task_links').insert({
                            task_id: taskId,
                            drive_report_id: updates.sourceReportId
                        });
                    } else {
                        await supabase.from('report_task_links').insert({
                            task_id: taskId,
                            report_id: updates.sourceReportId
                        });
                    }
                }
            }

            await fetchTasks();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    const deleteTask = async (taskId) => {
        try {
            await supabase.from('task_assignees').delete().eq('task_id', taskId);
            await supabase.from('task_comments').delete().eq('task_id', taskId);
            await supabase.from('report_task_links').delete().eq('task_id', taskId);
            await supabase.from('drive_report_task_links').delete().eq('task_id', taskId);

            const { error } = await supabase.from('tasks').delete().eq('id', taskId);
            if (error) return { error };

            await fetchTasks();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    const addComment = async (taskId, commentBody) => {
        if (!currentUser) return { error: 'No user' };

        try {
            const { error } = await supabase.from('task_comments').insert({
                task_id: taskId,
                author_id: currentUser.id,
                body: commentBody
            });

            if (error) return { error };

            await fetchTasks();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    const assignUser = async (taskId, userId) => {
        try {
            const { error } = await supabase.from('task_assignees').insert({
                task_id: taskId,
                user_id: userId
            });

            if (error) return { error };

            await fetchTasks();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    return {
        tasks,
        loading,
        error,
        fetchTasks,
        createTask,
        updateTask,
        deleteTask,
        addComment,
        assignUser
    };
}

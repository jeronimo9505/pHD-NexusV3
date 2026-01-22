import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';

export function useTasks() {
    // 1. Get raw data from AppContext (Single Source of Truth)
    const {
        tasks: rawTasks,
        activeGroupId,
        currentUser,
        groupMembers,
        refreshUserData // Function to reload global data
    } = useApp();

    // 2. Transform raw data for UI (Memoized)
    const tasks = useMemo(() => {
        if (!rawTasks) return [];

        const transformed = rawTasks.map(t => {
            // Find Creator
            const creator = groupMembers?.find(m => m.user_id === t.created_by || m.id === t.created_by)
                || (currentUser?.id === t.created_by ? currentUser : null);

            // Map Comments (using 'comments' relation from AppContext query)
            const taskComments = (t.comments || [])
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

            // Map Assignees (using 'assignees' relation from AppContext query)
            const taskAssignees = (t.assignees || []);
            const firstAssigneeId = taskAssignees.length > 0 ? taskAssignees[0].user_id : t.created_by;
            const assignedUser = groupMembers?.find(m => m.user_id === firstAssigneeId || m.id === firstAssigneeId)
                || (currentUser?.id === firstAssigneeId ? currentUser : null);

            // Map Links (using 'report_limits' and 'drive_links' alias from query)
            // Note: AppContext alias was: report_limits:report_task_links(*), drive_links:drive_report_task_links(*)
            const stdLink = (t.report_limits || [])[0]; // Usually 1-to-1 or 1-to-many? Assuming single link logic
            const driveLink = (t.drive_links || [])[0];
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
                comments: taskComments,
                created_by: t.created_by // Keep original ID for filters
            };
        });

        // Sort by Newest
        return transformed.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [rawTasks, groupMembers, currentUser]);

    // 3. Actions (Mutations)
    // These update DB then trigger global reload

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
                // Check if it's a Drive Report (usually UUID) or legacy ID
                // Best way: Check both or assume ID format. 
                // Let's optimize: Check if ID exists in drive_reports
                const { data: isDriveReport } = await supabase.from('drive_reports').select('id').eq('id', taskData.sourceReportId).maybeSingle();

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

            // Global Refresh
            if (refreshUserData) await refreshUserData();

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
                if (key === 'sourceReportId' || key === 'assignees') return;
                const dbKey = fieldMapping[key] || key;
                dbUpdates[dbKey] = updates[key];
            });

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
                await supabase.from('report_task_links').delete().eq('task_id', taskId);
                await supabase.from('drive_report_task_links').delete().eq('task_id', taskId);

                if (updates.sourceReportId) {
                    const { data: isDriveReport } = await supabase.from('drive_reports').select('id').eq('id', updates.sourceReportId).maybeSingle();

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

            if (refreshUserData) await refreshUserData();
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

            if (refreshUserData) await refreshUserData();
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

            if (refreshUserData) await refreshUserData();
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

            if (refreshUserData) await refreshUserData();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    return {
        tasks,          // Now from Context
        loading: !tasks, // Or use AppContext loading
        error: null,    // Errors handled in mutations
        fetchTasks: refreshUserData, // Alias for manual refresh if needed
        createTask,
        updateTask,
        deleteTask,
        addComment,
        assignUser
    };
}

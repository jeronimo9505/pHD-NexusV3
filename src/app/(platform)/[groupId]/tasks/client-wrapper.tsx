'use client';

import { useState, useEffect } from 'react';
import { Task, updateTaskStatusAction, createTaskAction, updateGroupKanbanColumnsAction, updateTaskAction, moveTasksToStatusAction } from '@/features/tasks/actions';
import { KanbanBoard } from '@/features/tasks/components/kanban-board';
import { TaskList } from '@/features/tasks/components/task-list';
import { TaskForm } from '@/features/tasks/components/task-form';
import { LayoutGrid, List, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ClientTasksWrapperProps {
    tasks: Task[];
    groupId: string;
    initialColumns: string[];
    initialCollapsedState: Record<string, boolean>;
}

export default function ClientTasksWrapper({ tasks: initialTasks, groupId, initialColumns, initialCollapsedState }: ClientTasksWrapperProps) {
    const [tasks, setTasks] = useState<Task[]>(initialTasks);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
    const [customColumns, setCustomColumns] = useState<string[]>(initialColumns);


    // Create Mode State
    const [isCreating, setIsCreating] = useState(false);
    const [createInColumn, setCreateInColumn] = useState<string | null>(null);

    // Sync from server if explicit revalidation happens (e.g. from other users or hard refresh)
    // But we prioritize local optimistic state for UX
    useEffect(() => {
        // Basic sync:
        setTasks(initialTasks);
    }, [initialTasks]);

    // Auto-heal Orphans: Check for specific tasks that belong to non-existent columns (orphans)
    // and move them to the first available column.
    useEffect(() => {
        if (customColumns.length > 0 && tasks.length > 0) {
            const firstColumn = customColumns[0];
            const orphans = tasks.filter(t => !customColumns.includes(t.status));

            if (orphans.length > 0) {
                // Group orphans by status to minimize API calls
                const uniqueOrphanStatuses = [...new Set(orphans.map(t => t.status))];

                uniqueOrphanStatuses.forEach(async (status) => {
                    // Prevent double-toast on strict mode or re-renders by checking if operation is needed
                    // For now simple toast is fine
                    console.warn(`Found orphaned tasks in "${status}". Moving to "${firstColumn}"...`);
                    toast.info(`Recovering tasks from deleted list "${status}"...`);
                    await moveTasksToStatusAction(groupId, status, firstColumn);
                });
            }
        }
    }, [tasks, customColumns, groupId]);

    const handleTaskMove = async (taskId: string, newStatus: string) => {
        // Optimistic Update
        const previousTasks = [...tasks];
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

        // Server Action
        const res = await updateTaskStatusAction(taskId, newStatus, groupId);
        if (res?.error) {
            toast.error(`Failed: ${res.error}`);
            setTasks(previousTasks); // Revert
        } else {
            toast.success(`Moved to ${newStatus}`);
        }
    };

    const handleCreateTask = async (formData: FormData) => {
        // Optimistic add? No, wait for ID.
        const res = await createTaskAction(null, formData);

        if (res?.error) {
            toast.error(res.error);
            return false;
        }

        // Let revalidatePath handle the list update via props from page, 
        // OR manually push if we return the task.
        // createTaskAction returns { success, task }
        if (res?.task) {
            // Ensure subtasks is an array if missing from server response (shouldn't happen with actions)
            const newTask: Task = { ...res.task, subtasks: res.task.subtasks || [] } as unknown as Task;
            setTasks(prev => [newTask, ...prev]);
            toast.success("Task created");
            return true;
        }
        return false;
    };

    return (
        <div className="h-full flex flex-col relative">
            {/* Toolbar - Compact */}
            <div className="flex justify-between items-center px-4 py-2 border-b border-slate-200 bg-white shrink-0">
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-md">
                    <button
                        onClick={() => setViewMode('board')}
                        className={`p-1.5 rounded transition-all ${viewMode === 'board' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`}
                        title="Kanban Board"
                    >
                        <LayoutGrid size={14} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`}
                        title="List View"
                    >
                        <List size={14} />
                    </button>
                </div>

                <button
                    onClick={() => setIsCreating(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors"
                >
                    <Plus size={14} /> New Task
                </button>
            </div>

            <div className={`flex-1 overflow-hidden ${viewMode === 'board' ? 'bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700' : 'bg-white'} px-4 pt-3 pb-1`}>
                {viewMode === 'board' ? (
                    <KanbanBoard
                        tasks={tasks}
                        groupId={groupId}
                        initialCollapsedState={initialCollapsedState}
                        onTaskClick={(t) => setSelectedTask(t)}
                        onTaskMove={handleTaskMove}
                        onToggleComplete={async (task) => {
                            // If marking as done, save current status as previous_status
                            // If unmarking, restore from previous_status or default to 'todo'
                            const isDone = task.status === 'done';
                            const newStatus = isDone
                                ? (task.previous_status || 'todo') // Restore previous or default to todo
                                : 'done'; // Mark as done

                            const updates: Partial<Task> = { status: newStatus };

                            // If marking as done, save the current status
                            if (!isDone && task.status !== 'done') {
                                updates.previous_status = task.status;
                            }

                            // Optimistic update
                            setTasks(prev => prev.map(t =>
                                t.id === task.id ? { ...t, ...updates } : t
                            ));

                            // Server action
                            const res = await updateTaskAction(task.id, groupId, updates);

                            if (res?.error) {
                                toast.error(`Failed to update task: ${res.error}`);
                                // Revert on error
                                setTasks(prev => prev.map(t =>
                                    t.id === task.id ? { ...t, status: task.status } : t
                                ));
                            }
                        }}
                        onCreateTask={() => {
                            setCreateInColumn(null);
                            setIsCreating(true);
                        }}
                        onCreateTaskInColumn={(columnId) => {
                            setCreateInColumn(columnId);
                            setIsCreating(true);
                        }}
                        columns={customColumns}
                        onAddColumn={async (name) => {
                            const oldCols = [...customColumns];
                            const newCols = [...customColumns, name];

                            // Optimistic update
                            setCustomColumns(newCols);

                            // Server action
                            const res = await updateGroupKanbanColumnsAction(groupId, newCols);

                            if (res?.error) {
                                toast.error(`Failed to save group: ${res.error}`);
                                setCustomColumns(oldCols); // Revert
                            } else {
                                toast.success("Group saved");
                            }
                        }}
                        onColumnRename={async (oldName, newName) => {
                            const oldCols = [...customColumns];
                            const newCols = customColumns.map(col => col === oldName ? newName : col);

                            // Optimistic update
                            setCustomColumns(newCols);

                            // Update column names in group
                            const colRes = await updateGroupKanbanColumnsAction(groupId, newCols);

                            // Update task statuses to match new column name
                            const taskRes = await moveTasksToStatusAction(groupId, oldName, newName);

                            if (colRes?.error || taskRes?.error) {
                                toast.error(`Failed to rename column: ${colRes?.error || taskRes?.error}`);
                                setCustomColumns(oldCols); // Revert
                            } else {
                                toast.success("Column renamed");
                            }
                        }}
                        onColumnReorder={async (newOrder) => {
                            const oldCols = [...customColumns];

                            // Optimistic update
                            setCustomColumns(newOrder);

                            // Server action
                            const res = await updateGroupKanbanColumnsAction(groupId, newOrder);

                            if (res?.error) {
                                toast.error(`Failed to reorder columns: ${res.error}`);
                                setCustomColumns(oldCols); // Revert
                            }
                        }}
                        onDeleteColumn={async (columnName) => {
                            if (!confirm(`Are you sure you want to delete the "${columnName}" list? Tasks will be moved to the first column.`)) return;

                            const oldCols = [...customColumns];
                            const newCols = customColumns.filter(c => c !== columnName);
                            const targetColumn = newCols.length > 0 ? newCols[0] : null;

                            setCustomColumns(newCols);

                            const colRes = await updateGroupKanbanColumnsAction(groupId, newCols);

                            if (targetColumn) {
                                await moveTasksToStatusAction(groupId, columnName, targetColumn);
                            }

                            if (colRes?.error) {
                                toast.error(`Failed to delete column: ${colRes.error}`);
                                setCustomColumns(oldCols);
                            } else {
                                toast.success("Column deleted");
                            }
                        }}
                    />
                ) : (
                    <div className="h-full overflow-y-auto custom-scrollbar p-4">
                        <TaskList
                            tasks={tasks}
                            groupId={groupId}
                            columns={customColumns}
                            onTaskClick={(t) => setSelectedTask(t)}
                        />
                    </div>
                )}
            </div>

            {/* Sheet Overlay - EDIT Mode */}
            {selectedTask && (
                <>
                    <div className="fixed inset-0 bg-black/10 z-40" onClick={() => setSelectedTask(null)} />
                    <TaskForm
                        task={selectedTask}
                        groupId={groupId}
                        onClose={() => setSelectedTask(null)}
                        columns={customColumns}
                    />
                </>
            )}

            {/* Sheet Overlay - CREATE Mode */}
            {isCreating && (
                <>
                    <div className="fixed inset-0 bg-black/10 z-40" onClick={() => {
                        setIsCreating(false);
                        setCreateInColumn(null);
                    }} />
                    <TaskForm
                        groupId={groupId}
                        initialStatus={createInColumn || undefined}
                        onClose={() => {
                            setIsCreating(false);
                            setCreateInColumn(null);
                        }}
                        onCreate={handleCreateTask}
                        columns={customColumns}
                    />
                </>
            )}
        </div>
    );
}

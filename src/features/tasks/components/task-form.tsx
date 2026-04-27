import { useState } from 'react';
import { Task, updateTaskAction, deleteTaskAction, Subtask } from '../actions';
import { X, CheckSquare, Trash2, Plus, Calendar, AlignLeft, Send, Loader2, MessageSquare, User } from 'lucide-react';
import { toast } from 'sonner';
import { UserSelect } from './user-select';
import { updateTaskAssigneesAction } from '../actions/assignees';
import { TaskComments } from './task-comments';

interface TaskFormProps {
    task?: Task | null; // If null/undefined, it's create mode
    groupId: string;
    onClose: () => void;
    onCreate?: (data: FormData) => Promise<boolean>;
    onSave?: () => Promise<void>;
    columns?: string[];
    initialStatus?: string;
}

export function TaskForm({ task, groupId, onClose, onCreate, onSave, columns = ["todo", "in_progress", "done"], initialStatus }: TaskFormProps) {
    const isEditMode = !!task;

    // Initialize state from task or defaults
    const [title, setTitle] = useState(task?.title || '');
    const [description, setDescription] = useState(task?.description || '');
    const [status, setStatus] = useState(task?.status || initialStatus || 'todo');
    const [priority, setPriority] = useState<'low' | 'medium' | 'high'>((task?.priority as any) || 'medium');
    const [dueDate, setDueDate] = useState(task?.due_date || '');
    const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assignees?.map(a => a.user_id) || []);
    const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks || []);
    const [subtaskInput, setSubtaskInput] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Update handlers for edit mode
    const handleUpdate = async (updates: Partial<Task>) => {
        if (!isEditMode || !task) return;
        const res = await updateTaskAction(task.id, groupId, updates);
        if (res.error) toast.error("Failed to update");
    };

    const handleAssigneesChange = async (newAssigneeIds: string[]) => {
        setAssigneeIds(newAssigneeIds);
        if (isEditMode && task) {
            const res = await updateTaskAssigneesAction(task.id, groupId, newAssigneeIds);
            if (res.error) {
                toast.error("Failed to update assignees");
                setAssigneeIds(task.assignees?.map(a => a.user_id) || []);
            } else {
                toast.success("Assignees updated");
            }
        }
    };

    const handleDueDateChange = async (newDate: string) => {
        setDueDate(newDate);
        if (isEditMode && task) {
            const res = await updateTaskAction(task.id, groupId, { due_date: newDate || null });
            if (res.error) {
                toast.error("Failed to update due date");
                setDueDate(task.due_date || '');
            } else {
                toast.success("Due date updated");
            }
        }
    };

    // Subtask handlers
    const handleAddSubtask = async () => {
        if (!subtaskInput.trim()) return;
        const newSubtask: Subtask = {
            id: crypto.randomUUID(),
            title: subtaskInput,
            completed: false
        };
        const updatedSubtasks = [...subtasks, newSubtask];
        setSubtasks(updatedSubtasks);
        setSubtaskInput('');

        if (isEditMode) {
            await handleUpdate({ subtasks: updatedSubtasks });
        }
    };

    const handleToggleSubtask = async (subtaskId: string) => {
        const updatedSubtasks = subtasks.map(st =>
            st.id === subtaskId ? { ...st, completed: !st.completed } : st
        );
        setSubtasks(updatedSubtasks);

        if (isEditMode) {
            await handleUpdate({ subtasks: updatedSubtasks });
        }
    };

    const handleDeleteSubtask = async (subtaskId: string) => {
        const updatedSubtasks = subtasks.filter(st => st.id !== subtaskId);
        setSubtasks(updatedSubtasks);

        if (isEditMode) {
            await handleUpdate({ subtasks: updatedSubtasks });
        }
    };

    // Create mode submit
    const handleCreate = async () => {
        if (!title.trim() || !onCreate) return;

        setSubmitting(true);
        const formData = new FormData();
        formData.append('group_id', groupId);
        formData.append('title', title);
        formData.append('description', description);
        formData.append('status', status);
        formData.append('priority', priority);
        formData.append('subtasks', JSON.stringify(subtasks));

        if (dueDate) formData.append('due_date', dueDate);
        assigneeIds.forEach(id => formData.append('assignee_ids', id));

        const success = await onCreate(formData);
        setSubmitting(false);
        if (success) {
            onClose();
        }
    };

    return (
        <div className="fixed inset-y-0 right-0 w-[500px] bg-slate-900 shadow-2xl z-50 flex flex-col border-l border-slate-700 transform transition-transform duration-300 animate-in slide-in-from-right">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                        {isEditMode ? 'Task Details' : 'New Task'}
                    </span>
                    {isEditMode && task && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span>
                                Created {new Date(task.created_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                })} at {new Date(task.created_at).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </span>
                            {task.creator_profile && (
                                <>
                                    <span className="text-slate-600">•</span>
                                    <span className="flex items-center gap-1">
                                        <User size={10} className="text-slate-500" />
                                        {task.creator_profile.full_name}
                                    </span>
                                </>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {isEditMode && task && (
                        <button
                            onClick={async () => {
                                if (window.confirm("Are you sure you want to delete this task?")) {
                                    const res = await deleteTaskAction(task.id, groupId);
                                    if (res.error) {
                                        toast.error(res.error);
                                    } else {
                                        toast.success("Task deleted");
                                        onClose();
                                    }
                                }
                            }}
                            className="p-1 hover:bg-slate-700 rounded-full transition-colors text-red-400 hover:text-red-300"
                            title="Delete Task"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
                    <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-full transition-colors">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900">

                {/* Title */}
                <div>
                    <input
                        autoFocus={!isEditMode}
                        className="w-full text-lg font-bold text-slate-100 bg-transparent outline-none focus:border-b-2 focus:border-indigo-500 placeholder:text-slate-500 pb-1"
                        value={title}
                        onChange={(e) => {
                            setTitle(e.target.value);
                            if (isEditMode) handleUpdate({ title: e.target.value });
                        }}
                        placeholder="Task Title"
                    />
                </div>

                {/* Meta Grid - Compact */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Status
                        </label>
                        <select
                            value={status}
                            onChange={(e) => {
                                setStatus(e.target.value);
                                if (isEditMode) handleUpdate({ status: e.target.value });
                            }}
                            className="w-full p-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-500 resize-none"
                        >
                            {columns.map(col => {
                                let label = col;
                                if (col === 'in_progress') label = 'In Progress';
                                else if (col === 'todo') label = 'To Do';
                                else label = col.replace(/_/g, ' ');

                                return (
                                    <option key={col} value={col}>
                                        {label}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Priority
                        </label>
                        <select
                            value={priority}
                            onChange={(e) => {
                                setPriority(e.target.value as 'low' | 'medium' | 'high');
                                if (isEditMode) handleUpdate({ priority: e.target.value as any });
                            }}
                            className="w-full p-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                        <UserSelect
                            groupId={groupId}
                            selectedUserIds={assigneeIds}
                            onChange={handleAssigneesChange}
                            label="Assignees"
                            placeholder="No assignees"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                            <Calendar size={12} className="text-slate-400" /> Due Date
                        </label>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={(e) => handleDueDateChange(e.target.value)}
                            className="w-full p-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>

                {/* Description */}
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                        <AlignLeft size={12} className="text-slate-400" /> Description
                    </label>
                    <textarea
                        className="w-full p-3 bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        rows={3}
                        value={description}
                        onChange={(e) => {
                            setDescription(e.target.value);
                            if (isEditMode) handleUpdate({ description: e.target.value });
                        }}
                        placeholder="Add a description..."
                    />
                </div>

                {/* Subtasks */}
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                        <CheckSquare size={14} className="text-indigo-400" />
                        Checklist ({subtasks.filter(st => st.completed).length}/{subtasks.length})
                    </h3>

                    <div className="space-y-2">
                        {subtasks.map(st => (
                            <div key={st.id} className="group flex items-center gap-2 p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700">
                                <button
                                    onClick={() => handleToggleSubtask(st.id)}
                                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${st.completed ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 hover:border-indigo-500'
                                        }`}
                                >
                                    {st.completed && <CheckSquare size={12} className="text-white" />}
                                </button>
                                <span className={`flex-1 text-sm ${st.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                                    {st.title}
                                </span>
                                <button onClick={() => handleDeleteSubtask(st.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 mt-2 p-2 bg-slate-800 rounded-lg border border-slate-700">
                        <Plus size={16} className="text-indigo-400" />
                        <input
                            className="flex-1 text-sm outline-none placeholder:text-slate-500 bg-transparent text-slate-100"
                            placeholder="Add an item..."
                            value={subtaskInput}
                            onChange={(e) => setSubtaskInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
                        />
                    </div>
                </div>

                {/* Comments Section - Only in Edit Mode */}
                {isEditMode && task && (
                    <TaskComments taskId={task.id} groupId={groupId} />
                )}

                {/* Create Button - Only in Create Mode */}
                {!isEditMode && (
                    <div className="pt-4 flex justify-end">
                        <button
                            onClick={handleCreate}
                            disabled={submitting || !title.trim()}
                            className="bg-indigo-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 hover:bg-indigo-500 transition-colors shadow-lg hover:shadow-indigo-500/50"
                        >
                            {submitting && <Loader2 size={16} className="animate-spin" />}
                            Create Task
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}

import { useState } from 'react';
import { Subtask } from '../actions';
import { X, CheckSquare, Trash2, Plus, AlignLeft, Calendar, User, Loader2 } from 'lucide-react';
import { UserSelect } from './user-select';

interface CreateTaskFormProps {
    groupId: string;
    onClose: () => void;
    onCreate: (data: FormData) => Promise<boolean>;
    columns?: string[];
}

export function CreateTaskForm({ groupId, onClose, onCreate, columns = ["todo", "in_progress", "done"] }: CreateTaskFormProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('todo');
    const [priority, setPriority] = useState('medium');
    const [dueDate, setDueDate] = useState('');
    const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
    const [subtasks, setSubtasks] = useState<Subtask[]>([]);
    const [subtaskInput, setSubtaskInput] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleAddSubtask = () => {
        if (!subtaskInput.trim()) return;
        const newSubtask: Subtask = {
            id: crypto.randomUUID(),
            title: subtaskInput,
            completed: false
        };
        setSubtasks([...subtasks, newSubtask]);
        setSubtaskInput('');
    };

    const handleDeleteSubtask = (id: string) => {
        setSubtasks(subtasks.filter(st => st.id !== id));
    };

    const handleSubmit = async () => {
        if (!title.trim()) return;

        setSubmitting(true);
        const formData = new FormData();
        formData.append('group_id', groupId);
        formData.append('title', title);
        formData.append('description', description);
        formData.append('status', status);
        formData.append('priority', priority);
        formData.append('subtasks', JSON.stringify(subtasks));

        // Add new fields
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
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">New Task</span>
                <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-full transition-colors">
                    <X size={20} className="text-slate-400" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-900">
                {/* Title */}
                <div>
                    <input
                        autoFocus
                        className="w-full text-xl font-bold text-slate-100 bg-transparent outline-none focus:border-b-2 focus:border-indigo-500 placeholder:text-slate-500 pb-2"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Task Title"
                    />
                </div>

                {/* Meta Grid (Status + Priority) */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-400" /> Status
                        </label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="w-full p-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 capitalize"
                        >
                            {columns.map(col => (
                                <option key={col} value={col}>
                                    {col === 'in_progress' ? 'In Progress' : col.replace(/_/g, ' ')}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-400" /> Priority
                        </label>
                        <select
                            value={priority}
                            onChange={(e) => setPriority(e.target.value)}
                            className="w-full p-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                </div>

                {/* Due Date & Assignees */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                            <Calendar size={12} className="text-slate-400" /> Due Date
                        </label>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="w-full p-2 bg-slate-800 border border-slate-700 text-slate-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div className="relative">
                        <UserSelect
                            groupId={groupId}
                            selectedUserIds={assigneeIds}
                            onChange={setAssigneeIds}
                            label="Assignees"
                            placeholder="Auto-assign to me"
                        />
                    </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                        <AlignLeft size={14} className="text-slate-400" /> Description
                    </label>
                    <textarea
                        className="w-full p-3 bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Add a description..."
                    />
                </div>

                {/* Subtasks */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <CheckSquare size={16} className="text-indigo-400" />
                        Checklist ({subtasks.length})
                    </h3>

                    <div className="space-y-2">
                        {subtasks.map(st => (
                            <div key={st.id} className="group flex items-center gap-2 p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700">
                                <span className="w-4 h-4 rounded border-2 border-slate-600 flex items-center justify-center">
                                    <CheckSquare size={12} className="text-transparent" />
                                </span>
                                <span className="flex-1 text-sm text-slate-200">{st.title}</span>
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

                <div className="pt-4 flex justify-end">
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || !title.trim()}
                        className="bg-indigo-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 hover:bg-indigo-500 transition-colors shadow-lg hover:shadow-indigo-500/50"
                    >
                        {submitting && <Loader2 size={16} className="animate-spin" />}
                        Create Task
                    </button>
                </div>

            </div>
        </div>
    );
}

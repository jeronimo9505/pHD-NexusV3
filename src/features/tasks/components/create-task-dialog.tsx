'use client';

import { useState } from 'react';
import { createTaskAction } from '../actions';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CreateTaskDialogProps {
    groupId: string;
    trigger?: React.ReactNode;
    onSuccess?: (task: any) => void;
}

export function CreateTaskDialog({ groupId, trigger, onSuccess }: CreateTaskDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        setIsSubmitting(true);
        const formData = new FormData();
        formData.append('group_id', groupId);
        formData.append('title', title);

        const res = await createTaskAction(null, formData);
        setIsSubmitting(false);

        if (res?.error) {
            toast.error(res.error);
        } else {
            toast.success("Task created");
            setTitle('');
            setIsOpen(false);
            if (onSuccess && res.task) {
                onSuccess(res.task);
            }
        }
    };

    if (!isOpen) {
        if (trigger) {
            return (
                <div onClick={() => setIsOpen(true)} className="inline-block cursor-pointer">
                    {trigger}
                </div>
            );
        }
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
            >
                <Plus size={16} /> New Task
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <h3 className="text-lg font-bold text-slate-800">Create New Task</h3>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Title</label>
                        <input
                            autoFocus
                            className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="What needs to be done?"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !title.trim()}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                            Create
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

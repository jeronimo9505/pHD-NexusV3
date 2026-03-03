'use client';

import { createGroupAction, joinGroupAction } from '@/features/groups/actions';
import { toast } from 'sonner';
import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CreateGroupModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<'create' | 'join'>('create');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.currentTarget);

        let result;
        if (mode === 'create') {
            result = await createGroupAction(formData);
        } else {
            result = await joinGroupAction(formData);
        }

        setLoading(false);

        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success(mode === 'create' ? 'Group created!' : 'Joined group!');
            setIsOpen(false);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
                <Plus size={18} />
                New Group
            </button>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
                <h2 className="text-xl font-bold mb-4">
                    {mode === 'create' ? 'Create a Research Group' : 'Join a Group'}
                </h2>

                <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-lg">
                    <button
                        onClick={() => setMode('create')}
                        className={cn(
                            "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                            mode === 'create' ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        Create New
                    </button>
                    <button
                        onClick={() => setMode('join')}
                        className={cn(
                            "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                            mode === 'join' ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        Join Existing
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === 'create' ? (
                        <>
                            <div>
                                <label className="block text-sm font-medium mb-1">Group Name</label>
                                <input
                                    name="name"
                                    required
                                    placeholder="e.g. Molecular Biology Lab"
                                    className="w-full border rounded-md px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <textarea
                                    name="description"
                                    placeholder="Optional description..."
                                    className="w-full border rounded-md px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium mb-1">Group Code</label>
                            <input
                                name="code"
                                required
                                placeholder="Enter the 6-character code"
                                className="w-full border rounded-md px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                            />
                        </div>
                    )}

                    <div className="flex justify-end gap-2 mt-6">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
                            {mode === 'create' ? 'Create Group' : 'Join Group'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

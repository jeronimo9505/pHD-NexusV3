'use client';

import { updateGroupAction } from '../actions';
import { toast } from 'sonner';
import { useState } from 'react';

export function EditGroupForm({
    group
}: {
    group: { id: string; name: string; description: string | null; logbook_is_private?: boolean }
}) {
    const [loading, setLoading] = useState(false);
    const [isPrivate, setIsPrivate] = useState(group.logbook_is_private || false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.currentTarget);
        formData.append('groupId', group.id); 
        formData.set('logbook_is_private', isPrivate.toString());

        const res = await updateGroupAction(formData);

        if (res?.error) {
            toast.error(res.error);
        } else {
            toast.success('Group updated successfully');
        }
        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            <div>
                <label className="block text-sm font-medium mb-1">Group Name</label>
                <input
                    name="name"
                    defaultValue={group.name}
                    required
                    className="w-full border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                    name="description"
                    defaultValue={group.description || ''}
                    rows={3}
                    className="w-full border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <input
                    type="checkbox"
                    id="logbook_is_private"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <div>
                    <label htmlFor="logbook_is_private" className="font-medium text-slate-900 block">
                        Private Logbook
                    </label>
                    <p className="text-xs text-slate-500">
                        Only the group creator will be able to see the Bitácora entries.
                    </p>
                </div>
            </div>

            <button
                type="submit"
                disabled={loading}
                className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
                {loading ? 'Saving...' : 'Save Changes'}
            </button>
        </form>
    );
}

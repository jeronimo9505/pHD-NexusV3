'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Search, UserPlus, X, Loader2 } from 'lucide-react';
import { inviteMemberAction, searchPlatformUsersAction } from '../actions';

interface InviteMemberFormProps {
    groupId: string;
}

export function InviteMemberForm({ groupId }: InviteMemberFormProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [inviting, setInviting] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!query.trim() || query.trim().length < 2) return;
        setSearching(true);
        const res = await searchPlatformUsersAction(query.trim(), groupId);
        if (res.error) {
            toast.error(res.error);
        } else {
            setResults(res.data || []);
            if ((res.data || []).length === 0) {
                toast.info('No users found matching that search.');
            }
        }
        setSearching(false);
    };

    const handleInvite = async (userId: string, name: string) => {
        setInviting(userId);
        const res = await inviteMemberAction(groupId, userId);
        if (res?.error) {
            toast.error(res.error);
        } else {
            toast.success(`${name} has been invited to the group!`);
            setResults(prev => prev.filter(u => u.id !== userId));
        }
        setInviting(null);
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
                <UserPlus size={18} className="text-blue-600" />
                Invite Members
            </h3>
            <p className="text-sm text-slate-500 mb-4">Search platform users by name or email to add them to this group.</p>

            <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Search by name or email..."
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                    />
                </div>
                <button
                    onClick={handleSearch}
                    disabled={searching || !query.trim()}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    Search
                </button>
            </div>

            {/* Results */}
            {results.length > 0 && (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {results.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-medium text-sm">
                                    {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-800">{user.full_name || 'Unnamed'}</p>
                                    <p className="text-xs text-slate-400">{user.email}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleInvite(user.id, user.full_name || user.email)}
                                disabled={inviting === user.id}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                            >
                                {inviting === user.id ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <UserPlus size={14} />
                                )}
                                Add
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { Star, LogOut, Plus, Users, X, Loader2, Clock, CheckCircle, Search, UserPlus, Lock } from 'lucide-react';
import {
    setDefaultGroupAction,
    clearDefaultGroupAction,
    createGroupAction,
    requestJoinGroupAction,
} from '@/features/groups/actions';
import { toast } from 'sonner';

interface GroupInfo {
    id: string;
    name: string;
    description?: string;
    code: string;
    owner_name: string;
    memberStatus: 'active' | 'pending' | null;
}

interface DashboardClientProps {
    allGroups: GroupInfo[];
    myGroups: GroupInfo[];
    defaultGroupId: string | null;
    userEmail: string;
    isSysAdmin: boolean;
}

export function DashboardClient({ allGroups, myGroups, defaultGroupId, userEmail, isSysAdmin }: DashboardClientProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [showModal, setShowModal] = useState<'create' | null>(null);
    const [loadingGroupId, setLoadingGroupId] = useState<string | null>(null);
    const [requestingId, setRequestingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [localPending, setLocalPending] = useState<Set<string>>(new Set());
    const [showLockMsg, setShowLockMsg] = useState(false);

    const handleSignOut = async () => {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    const handleSetDefault = async (groupId: string) => {
        setLoadingGroupId(groupId);
        const isAlreadyDefault = defaultGroupId === groupId;
        const res = isAlreadyDefault ? await clearDefaultGroupAction() : await setDefaultGroupAction(groupId);
        if (res?.error) toast.error(res.error);
        else {
            toast.success(isAlreadyDefault ? 'Default group cleared' : 'Default group set — auto-entering on login');
            router.refresh();
        }
        setLoadingGroupId(null);
    };

    const handleRequestJoin = async (groupId: string) => {
        setRequestingId(groupId);
        const res = await requestJoinGroupAction(groupId);
        if (res?.error) {
            toast.error(res.error);
        } else {
            toast.success('Join request sent! Waiting for approval.');
            setLocalPending(prev => new Set(prev).add(groupId));
            router.refresh();
        }
        setRequestingId(null);
    };

    // Groups NOT yet active for this user (available to browse)
    const availableGroups = allGroups.filter(g => g.memberStatus !== 'active');
    const filteredAvailable = availableGroups.filter(g =>
        !searchQuery || g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (g.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.owner_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-4">
                <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Research Groups</h1>
                        {defaultGroupId && (
                            <p className="text-xs text-emerald-600 mt-0.5 flex items-center gap-1">
                                <Star size={10} fill="currentColor" />
                                Auto-entering default group on login ·{' '}
                                <button onClick={() => handleSetDefault(defaultGroupId)} className="underline hover:text-emerald-800">
                                    Clear
                                </button>
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {isSysAdmin && (
                            <Link href="/admin" className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                                Admin Panel
                            </Link>
                        )}
                        <span className="text-sm text-slate-500 hidden md:block">{userEmail}</span>
                        {/* Create group — admin only */}
                        {isSysAdmin ? (
                            <button
                                onClick={() => setShowModal('create')}
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                                <Plus size={15} /> New Group
                            </button>
                        ) : (
                            <div className="relative">
                                <button
                                    disabled
                                    onMouseEnter={() => setShowLockMsg(true)}
                                    onMouseLeave={() => setShowLockMsg(false)}
                                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed border border-slate-200"
                                >
                                    <Lock size={14} /> New Group
                                </button>
                                {showLockMsg && (
                                    <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 text-white text-xs rounded-xl px-4 py-3 shadow-xl z-50 leading-relaxed">
                                        <p className="font-semibold mb-1">🔒 Acción restringida</p>
                                        <p className="text-slate-300">Solo los administradores del sistema pueden crear grupos. Solicita unirte a uno existente.</p>
                                        <div className="absolute -top-1.5 right-4 w-3 h-3 bg-slate-900 rotate-45 rounded-sm" />
                                    </div>
                                )}
                            </div>
                        )}
                        <button
                            onClick={handleSignOut}
                            title="Sign out"
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-slate-200 bg-white"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-8 py-8 space-y-10">

                {/* ── MY GROUPS ─────────────────────────────────── */}
                <section>
                    <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <CheckCircle size={18} className="text-emerald-500" /> My Groups
                    </h2>

                    {myGroups.length === 0 ? (
                        <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm">
                            You are not a member of any group yet. Request to join one below.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {myGroups.map(group => {
                                const isDefault = defaultGroupId === group.id;
                                const isLoading = loadingGroupId === group.id;
                                return (
                                    <div key={group.id} className="relative group/card">
                                        <a
                                            href={`/${group.id}/dashboard`}
                                            className="block bg-white p-5 rounded-xl shadow-sm border hover:shadow-md hover:border-indigo-200 transition-all"
                                        >
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="w-11 h-11 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-lg">
                                                    {group.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded font-mono">{group.code}</span>
                                            </div>
                                            <h3 className="text-base font-bold text-slate-900 mb-1 group-hover/card:text-indigo-600 transition-colors">{group.name}</h3>
                                            <p className="text-slate-500 text-xs line-clamp-2 mb-2">{group.description || 'No description.'}</p>
                                            <p className="text-xs text-slate-400">Owner: {group.owner_name}</p>
                                            {isDefault && (
                                                <span className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                                    <Star size={10} fill="currentColor" /> Default
                                                </span>
                                            )}
                                        </a>
                                        {/* Star default */}
                                        <button
                                            onClick={() => handleSetDefault(group.id)}
                                            disabled={isLoading}
                                            title={isDefault ? 'Clear default' : 'Set as default (auto-enter on login)'}
                                            className={`absolute top-2.5 right-2.5 p-1.5 rounded-md transition-all opacity-0 group-hover/card:opacity-100 ${isDefault ? 'text-amber-500 opacity-100 bg-amber-50' : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'}`}
                                        >
                                            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} fill={isDefault ? 'currentColor' : 'none'} />}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* ── AVAILABLE GROUPS ──────────────────────────── */}
                <section>
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <Users size={18} className="text-indigo-400" /> Available Groups
                            <span className="text-sm font-normal text-slate-400">({availableGroups.length})</span>
                        </h2>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search groups..."
                                className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white w-56"
                            />
                        </div>
                    </div>

                    {filteredAvailable.length === 0 ? (
                        <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm">
                            {availableGroups.length === 0 ? 'No other groups in the system.' : 'No groups match your search.'}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {filteredAvailable.map(group => {
                                const isPendingLocal = localPending.has(group.id) || group.memberStatus === 'pending';
                                const isRequesting = requestingId === group.id;
                                return (
                                    <div key={group.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="w-11 h-11 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 font-bold text-lg">
                                                {group.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            {isPendingLocal && (
                                                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full font-medium">
                                                    <Clock size={10} /> Pending
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-base font-bold text-slate-900 mb-1">{group.name}</h3>
                                        <p className="text-slate-500 text-xs line-clamp-2 mb-1">{group.description || 'No description.'}</p>
                                        <p className="text-xs text-slate-400 mb-4">Owner: <span className="font-medium text-slate-600">{group.owner_name}</span></p>

                                        {isPendingLocal ? (
                                            <div className="text-xs text-amber-600 flex items-center gap-1.5 bg-amber-50 rounded-lg px-3 py-2">
                                                <Clock size={12} />
                                                Join request pending approval from the group owner.
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleRequestJoin(group.id)}
                                                disabled={isRequesting}
                                                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors disabled:opacity-60"
                                            >
                                                {isRequesting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                                                Request to Join
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>

            {/* Modal: Create Group (admin only) */}
            {showModal === 'create' && (
                <Modal title="Create a New Group" onClose={() => setShowModal(null)}>
                    <form
                        action={async (fd) => { await createGroupAction(fd); }}
                        className="space-y-4"
                    >
                        <div>
                            <label className="block text-sm font-medium mb-1">Group Name</label>
                            <input name="name" placeholder="My Research Lab" className="w-full border rounded-lg px-3 py-2 text-sm" autoFocus required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Description</label>
                            <textarea name="description" rows={2} placeholder="What is this group about?" className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
                        </div>
                        <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium">
                            Create Group
                        </button>
                    </form>
                </Modal>
            )}
        </div>
    );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100">
                            <X size={18} />
                        </button>
                    </div>
                    {children}
                </div>
            </div>
        </>
    );
}

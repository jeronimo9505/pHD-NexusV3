'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    listAllUsers,
    listAllGroups,
    getPlatformStats,
    updateUserSystemRoleAction,
    updateUserStatusAction,
    deleteGroupAction,
    deleteUserAction,
    getAllPendingRequestsAction,
} from '../actions';
import { approveJoinRequestAction, rejectJoinRequestAction } from '@/features/groups/actions';
import { toast } from 'sonner';
import {
    Users,
    Building2,
    BarChart3,
    Shield,
    ShieldAlert,
    Trash2,
    Clock,
    Search,
    RefreshCw,
    Bell,
    ChevronLeft,
    Check,
    X,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'users' | 'groups' | 'stats' | 'notifications';

interface Stats {
    totalUsers: number;
    totalGroups: number;
    totalReports: number;
    totalTasks: number;
}

export function AdminPanel() {
    const [tab, setTab] = useState<Tab>('users');
    const [users, setUsers] = useState<any[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        const [usersRes, groupsRes, statsRes, notifRes] = await Promise.all([
            listAllUsers(),
            listAllGroups(),
            getPlatformStats(),
            getAllPendingRequestsAction(),
        ]);
        if (usersRes.data) setUsers(usersRes.data);
        if (groupsRes.data) setGroups(groupsRes.data);
        if (statsRes.data) setStats(statsRes.data);
        if (notifRes.data) setNotifications(notifRes.data as any[]);
        setLoading(false);
    };

    const handleRoleChange = async (userId: string, newRole: 'admin' | 'user') => {
        const res = await updateUserSystemRoleAction(userId, newRole);
        if (res.error) toast.error(res.error);
        else {
            toast.success('Role updated');
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, system_role: newRole } : u));
        }
    };

    const handleStatusChange = async (userId: string, newStatus: 'active' | 'pending' | 'inactive') => {
        const res = await updateUserStatusAction(userId, newStatus);
        if (res.error) toast.error(res.error);
        else {
            toast.success('Status updated');
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
        }
    };

    const handleDeleteUser = async (userId: string, name: string) => {
        if (!confirm(`¿Eliminar al usuario "${name}"? Esta acción no se puede deshacer.`)) return;
        setActionLoadingId(`del-user-${userId}`);
        const res = await deleteUserAction(userId);
        if (res.error) toast.error(res.error);
        else {
            toast.success('Usuario eliminado');
            setUsers(prev => prev.filter(u => u.id !== userId));
        }
        setActionLoadingId(null);
    };

    const handleDeleteGroup = async (groupId: string, groupName: string) => {
        if (!confirm(`¿Eliminar el grupo "${groupName}"? Se eliminarán todos sus datos.`)) return;
        const res = await deleteGroupAction(groupId);
        if (res.error) toast.error(res.error);
        else {
            toast.success('Grupo eliminado');
            setGroups(prev => prev.filter(g => g.id !== groupId));
        }
    };

    const handleApprove = async (memberId: string, groupId: string) => {
        setActionLoadingId(`approve-${memberId}`);
        const res = await approveJoinRequestAction(memberId, groupId);
        if (res.error) toast.error(res.error);
        else {
            toast.success('Solicitud aprobada');
            setNotifications(prev => prev.filter(n => n.id !== memberId));
        }
        setActionLoadingId(null);
    };

    const handleReject = async (memberId: string, groupId: string) => {
        setActionLoadingId(`reject-${memberId}`);
        const res = await rejectJoinRequestAction(memberId, groupId);
        if (res.error) toast.error(res.error);
        else {
            toast.success('Solicitud rechazada');
            setNotifications(prev => prev.filter(n => n.id !== memberId));
        }
        setActionLoadingId(null);
    };

    const tabs: { id: Tab; label: string; icon: any; count?: number; badge?: number }[] = [
        { id: 'users', label: 'Users', icon: Users, count: users.length },
        { id: 'groups', label: 'Groups', icon: Building2, count: groups.length },
        { id: 'stats', label: 'Statistics', icon: BarChart3 },
        { id: 'notifications', label: 'Notifications', icon: Bell, badge: notifications.length },
    ];

    const filteredUsers = users.filter(u =>
        !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
    );

    const filteredGroups = groups.filter(g =>
        !search || g.name?.toLowerCase().includes(search.toLowerCase()) || g.code?.toLowerCase().includes(search.toLowerCase())
    );

    const statusColors: Record<string, string> = {
        active: 'bg-emerald-100 text-emerald-700',
        pending: 'bg-amber-100 text-amber-700',
        inactive: 'bg-red-100 text-red-700',
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-8 py-5 bg-white border-b border-slate-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Back to Dashboard */}
                        <Link
                            href="/dashboard"
                            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-3 py-2 rounded-lg transition-colors"
                        >
                            <ChevronLeft size={16} />
                            Dashboard
                        </Link>
                        <div className="w-px h-6 bg-slate-200" />
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                                    <ShieldAlert size={18} className="text-red-600" />
                                </div>
                                Admin Panel
                            </h1>
                            <p className="text-slate-500 text-xs mt-0.5">Manage platform users, groups, and monitor statistics.</p>
                        </div>
                    </div>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-5 bg-slate-100 p-1 rounded-xl w-fit">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={cn(
                                'relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                                tab === t.id
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            )}
                        >
                            <t.icon size={15} />
                            {t.label}
                            {t.count !== undefined && (
                                <span className="text-xs bg-slate-200 px-1.5 py-0.5 rounded-full">{t.count}</span>
                            )}
                            {/* Notification badge */}
                            {t.badge !== undefined && t.badge > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                    {t.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
                {/* Search (Users & Groups tabs) */}
                {(tab === 'users' || tab === 'groups') && (
                    <div className="relative max-w-md mb-6">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder={tab === 'users' ? 'Search users by name or email...' : 'Search groups by name or code...'}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                        />
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    </div>
                ) : (
                    <>
                        {/* ─── USERS TAB ─────────────────────────── */}
                        {tab === 'users' && (
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                                            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                                            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">System Role</th>
                                            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
                                            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">Del</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredUsers.map((user) => {
                                            const isDeleting = actionLoadingId === `del-user-${user.id}`;
                                            return (
                                                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-5 py-3.5">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-medium text-sm">
                                                                {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                                                            </div>
                                                            <span className="font-medium text-slate-800 text-sm">{user.full_name || 'Unnamed'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-sm text-slate-500">{user.email}</td>
                                                    <td className="px-5 py-3.5">
                                                        <select
                                                            value={user.system_role}
                                                            onChange={(e) => handleRoleChange(user.id, e.target.value as 'admin' | 'user')}
                                                            className={cn(
                                                                'text-xs font-medium px-3 py-1.5 rounded-lg border-0 cursor-pointer focus:ring-2 focus:ring-blue-200',
                                                                user.system_role === 'admin'
                                                                    ? 'bg-red-100 text-red-700'
                                                                    : 'bg-blue-100 text-blue-700'
                                                            )}
                                                        >
                                                            <option value="user">User</option>
                                                            <option value="admin">Admin</option>
                                                        </select>
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <select
                                                            value={user.status}
                                                            onChange={(e) => handleStatusChange(user.id, e.target.value as any)}
                                                            className={cn(
                                                                'text-xs font-medium px-3 py-1.5 rounded-lg border-0 cursor-pointer focus:ring-2 focus:ring-blue-200',
                                                                statusColors[user.status] || 'bg-slate-100 text-slate-600'
                                                            )}
                                                        >
                                                            <option value="active">Active</option>
                                                            <option value="pending">Pending</option>
                                                            <option value="inactive">Inactive</option>
                                                        </select>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-xs text-slate-400">
                                                        {new Date(user.created_at).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <button
                                                            onClick={() => handleDeleteUser(user.id, user.full_name || user.email)}
                                                            disabled={!!actionLoadingId}
                                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                                                            title="Delete user"
                                                        >
                                                            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {filteredUsers.length === 0 && (
                                    <div className="text-center py-12 text-slate-400 text-sm">No users found.</div>
                                )}
                            </div>
                        )}

                        {/* ─── GROUPS TAB ────────────────────────── */}
                        {tab === 'groups' && (
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Group</th>
                                            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Code</th>
                                            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Members</th>
                                            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
                                            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredGroups.map((group: any) => (
                                            <tr key={group.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm">
                                                            {group.name?.substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-slate-800 text-sm">{group.name}</p>
                                                            {group.description && (
                                                                <p className="text-xs text-slate-400 line-clamp-1">{group.description}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{group.code}</span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className="flex items-center gap-1 text-sm text-slate-600">
                                                        <Users size={13} />
                                                        {group.group_members?.[0]?.count ?? 0}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-xs text-slate-400">
                                                    {new Date(group.created_at).toLocaleDateString()}
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <button
                                                        onClick={() => handleDeleteGroup(group.id, group.name)}
                                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Delete group"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredGroups.length === 0 && (
                                    <div className="text-center py-12 text-slate-400 text-sm">No groups found.</div>
                                )}
                            </div>
                        )}

                        {/* ─── STATS TAB ─────────────────────────── */}
                        {tab === 'stats' && stats && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                {[
                                    { label: 'Total Users', value: stats.totalUsers, icon: Users, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
                                    { label: 'Total Groups', value: stats.totalGroups, icon: Building2, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
                                    { label: 'Total Reports', value: stats.totalReports, icon: BarChart3, iconBg: 'bg-violet-100', iconColor: 'text-violet-600' },
                                    { label: 'Total Tasks', value: stats.totalTasks, icon: Clock, iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
                                ].map((stat) => (
                                    <div key={stat.label} className="p-6 rounded-xl border border-slate-200 bg-white">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', stat.iconBg)}>
                                                <stat.icon size={20} className={stat.iconColor} />
                                            </div>
                                            <span className="text-sm font-medium text-slate-500">{stat.label}</span>
                                        </div>
                                        <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ─── NOTIFICATIONS TAB ─────────────────── */}
                        {tab === 'notifications' && (
                            <div>
                                <p className="text-sm text-slate-500 mb-5">
                                    Todas las solicitudes de ingreso pendientes en todos los grupos del sistema.
                                </p>
                                {notifications.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                        <Bell size={36} className="mb-3 opacity-30" />
                                        <p className="text-sm">No hay solicitudes pendientes.</p>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                        <div className="divide-y divide-slate-100">
                                            {notifications.map((n: any) => {
                                                const isApproving = actionLoadingId === `approve-${n.id}`;
                                                const isRejecting = actionLoadingId === `reject-${n.id}`;
                                                const userName = n.profiles?.full_name || n.profiles?.email || 'Unknown';
                                                const groupName = n.groups?.name || 'Unknown group';
                                                return (
                                                    <div key={n.id} className="flex items-center justify-between px-5 py-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 font-bold text-sm">
                                                                {userName.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-semibold text-slate-900">{userName}</p>
                                                                <p className="text-xs text-slate-400">
                                                                    Solicita unirse a <span className="font-medium text-indigo-600">{groupName}</span>
                                                                    {' · '}{new Date(n.created_at).toLocaleDateString()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => handleApprove(n.id, n.group_id)}
                                                                disabled={!!actionLoadingId}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium rounded-lg border border-emerald-200 transition-colors disabled:opacity-50"
                                                            >
                                                                {isApproving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Aprobar
                                                            </button>
                                                            <button
                                                                onClick={() => handleReject(n.id, n.group_id)}
                                                                disabled={!!actionLoadingId}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg border border-red-200 transition-colors disabled:opacity-50"
                                                            >
                                                                {isRejecting ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />} Rechazar
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

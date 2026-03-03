'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSidebar } from './shell';
import { useState } from 'react';
import {
    Home,
    FileText,
    CheckSquare,
    BookOpen,
    Settings,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    LogOut,
    HardDrive,
    ShieldAlert,
    Plus,
    User,
    TestTube,
    CalendarDays,
} from 'lucide-react';
import { GroupRole, SystemRole } from '@/lib/auth/roles';
import { createBrowserClient } from '@supabase/ssr';

interface GroupInfo {
    id: string;
    name: string;
    code: string;
}

interface SidebarProps {
    groupId: string;
    role: GroupRole;
    systemRole?: SystemRole | null;
    userName?: string | null;
    userEmail?: string | null;
    groups?: GroupInfo[];
}

export function Sidebar({ groupId, role, systemRole, userName, userEmail, groups = [] }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { collapsed, toggle } = useSidebar();
    const [showGroups, setShowGroups] = useState(false);

    const isSysAdmin = systemRole === 'admin';
    const currentGroup = groups.find(g => g.id === groupId);

    const links = [
        { href: `/${groupId}/dashboard`, label: 'Dashboard', icon: Home },
        { href: `/${groupId}/drive-reports`, label: 'Drive Reports', icon: FileText },
        { href: `/${groupId}/samples`, label: 'Samples', icon: TestTube },
        { href: `/${groupId}/tasks`, label: 'Tasks', icon: CheckSquare },
        { href: `/${groupId}/calendar`, label: 'Calendar', icon: CalendarDays },
        { href: `/${groupId}/google-drive`, label: 'Google Drive', icon: HardDrive },
        { href: `/${groupId}/knowledge`, label: 'Knowledge Base', icon: BookOpen },
        { href: `/${groupId}/settings`, label: 'Settings', icon: Settings },
    ];

    const handleSignOut = async () => {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    const initials = userName
        ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : userEmail?.charAt(0).toUpperCase() || '?';

    return (
        <div className="h-full flex flex-col text-slate-300 overflow-hidden">
            {/* Header with logo + collapse toggle */}
            <div className={cn("border-b border-slate-800 flex items-center", collapsed ? "p-3 justify-center" : "p-6 justify-between")}>
                {!collapsed && (
                    <h1 className="text-xl font-bold text-white flex items-center gap-2 whitespace-nowrap">
                        <span className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0">PhD</span>
                        Nexus
                    </h1>
                )}
                {collapsed && (
                    <span className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center text-sm text-white font-bold flex-shrink-0">N</span>
                )}
                <button
                    onClick={toggle}
                    className={cn(
                        "p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors flex-shrink-0",
                        collapsed && "mt-2"
                    )}
                    title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
            </div>

            {/* Navigation */}
            <nav className={cn("flex-1 space-y-1 overflow-y-auto", collapsed ? "p-2" : "p-4")}>
                {links.map((link) => {
                    const isActive = pathname === link.href;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            title={collapsed ? link.label : undefined}
                            className={cn(
                                "flex items-center rounded-lg transition-all",
                                collapsed ? "justify-center p-3" : "gap-3 px-4 py-3",
                                isActive
                                    ? "bg-blue-600/10 text-blue-400 border border-blue-600/20"
                                    : "hover:bg-slate-800 hover:text-white"
                            )}
                        >
                            <link.icon size={20} className="flex-shrink-0" />
                            {!collapsed && <span className="font-medium whitespace-nowrap">{link.label}</span>}
                        </Link>
                    );
                })}

                {/* Admin Panel link — system admins only */}
                {isSysAdmin && (
                    <>
                        <div className={cn("border-t border-slate-800 my-2", collapsed && "mx-1")} />
                        <Link
                            href="/admin"
                            title={collapsed ? "Admin Panel" : undefined}
                            className={cn(
                                "flex items-center rounded-lg transition-all",
                                collapsed ? "justify-center p-3" : "gap-3 px-4 py-3",
                                pathname === '/admin'
                                    ? "bg-red-600/10 text-red-400 border border-red-600/20"
                                    : "hover:bg-slate-800 text-red-400/70 hover:text-red-400"
                            )}
                        >
                            <ShieldAlert size={20} className="flex-shrink-0" />
                            {!collapsed && <span className="font-medium whitespace-nowrap">Admin Panel</span>}
                        </Link>
                    </>
                )}
            </nav>

            {/* Bottom section: Group Switcher + User */}
            <div className={cn("border-t border-slate-800", collapsed ? "p-2" : "p-3")}>
                {/* Group Switcher Dropdown */}
                {!collapsed ? (
                    <div className="relative mb-2">
                        <button
                            onClick={() => setShowGroups(!showGroups)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors text-left"
                        >
                            <span className="bg-blue-600/20 text-blue-400 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {currentGroup?.name?.substring(0, 2).toUpperCase() || 'G'}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{currentGroup?.name || 'Select Group'}</p>
                                <p className="text-[10px] text-slate-500 font-mono">{currentGroup?.code}</p>
                            </div>
                            <ChevronDown size={14} className={cn("text-slate-500 transition-transform flex-shrink-0", showGroups && "rotate-180")} />
                        </button>

                        {/* Dropdown */}
                        {showGroups && (
                            <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                                <div className="px-3 py-2 border-b border-slate-700">
                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Your Groups</p>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                    {groups.map((group) => (
                                        <Link
                                            key={group.id}
                                            href={`/${group.id}/dashboard`}
                                            onClick={() => setShowGroups(false)}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-2.5 hover:bg-slate-700/50 transition-colors",
                                                group.id === groupId && "bg-blue-600/10"
                                            )}
                                        >
                                            <span className={cn(
                                                "w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                                                group.id === groupId
                                                    ? "bg-blue-600 text-white"
                                                    : "bg-slate-700 text-slate-300"
                                            )}>
                                                {group.name.substring(0, 2).toUpperCase()}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className={cn("text-sm truncate", group.id === groupId ? "text-blue-400 font-medium" : "text-slate-300")}>{group.name}</p>
                                            </div>
                                            {group.id === groupId && (
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                            )}
                                        </Link>
                                    ))}
                                </div>
                                <div className="border-t border-slate-700">
                                    <Link
                                        href="/dashboard"
                                        onClick={() => setShowGroups(false)}
                                        className="flex items-center gap-3 px-3 py-2.5 text-emerald-400 hover:bg-slate-700/50 transition-colors"
                                    >
                                        <Plus size={16} />
                                        <span className="text-sm font-medium">Create or Join Group</span>
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <Link
                        href="/dashboard"
                        title="Switch Group"
                        className="flex justify-center p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2"
                    >
                        <span className="bg-blue-600/20 text-blue-400 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {currentGroup?.name?.substring(0, 2).toUpperCase() || 'G'}
                        </span>
                    </Link>
                )}

                {/* User info + Logout */}
                <div className={cn(
                    "flex items-center rounded-lg",
                    collapsed ? "flex-col gap-2 p-1" : "gap-3 px-3 py-2"
                )}>
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {initials}
                    </div>
                    {!collapsed && (
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{userName || 'User'}</p>
                            <p className="text-[10px] text-slate-500 truncate">{userEmail}</p>
                        </div>
                    )}
                    <button
                        onClick={handleSignOut}
                        title="Sign out"
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors flex-shrink-0"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}

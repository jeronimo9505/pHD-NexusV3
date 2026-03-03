'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
    BookOpen, LayoutDashboard, FileText, CheckSquare, Library, Settings,
    Plus, CheckCircle2, GraduationCap, UserPlus, Shield, Users
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useTasks } from '../modules/Tasks/hooks/useTasks';
import { getWeekLabel, formatDateShort } from '../../utils/helpers';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

const NavButton = ({ href, active, icon, label, badge, onClick }) => {
    const content = (
        <div
            className={clsx(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                active ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
        >
            <div className="flex items-center gap-3">{icon}<span>{label}</span></div>
            {badge > 0 && (
                <span className={clsx("text-[10px] px-1.5 py-0.5 rounded-full font-bold", active ? "bg-indigo-500 text-white" : "bg-slate-200 text-slate-400")}>
                    {badge}
                </span>
            )}
        </div>
    );

    if (onClick) {
        return <button onClick={onClick} className="w-full">{content}</button>;
    }

    return (
        <Link href={href} className="w-full block">
            {content}
        </Link>
    );
};

export default function Sidebar() {
    const router = useRouter();
    const {
        activeSupervisorId, setActiveSupervisorId, availableSupervisors,
        groups, activeGroupId, setActiveGroupId,
        hasRole, setSelectedReportId, setIsEditingReport,
        userProfile, userRole // Added these
    } = useApp();

    const { tasks } = useTasks();

    // Use AuthContext for user info to be secure, but rely on AppContext for Permission Checks in Mixed Mode
    const { user, roles, can, signOut } = useAuth();
    const pathname = usePathname();

    const accessibleGroups = groups || [];

    // Mapping pathname to active module
    const isActive = (path) => pathname?.startsWith(path);

    const handleReportsClick = () => {
        setSelectedReportId(null);
        setIsEditingReport(false);
        router.push('/reports');
    };

    return (
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-20 shrink-0 h-screen font-sans">
            <div className="p-6 border-b border-gray-100">
                <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <BookOpen className="w-6 h-6 text-indigo-600" />
                    PhD Nexus
                </h1>

                <div className="mt-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                        <Users className="w-3 h-3" /> Grupo Activo
                    </div>
                    <select
                        value={activeGroupId || ""}
                        onChange={(e) => {
                            setActiveGroupId(e.target.value);
                            setSelectedReportId(null);
                            setIsEditingReport(false);
                        }}
                        className="w-full text-xs p-2 rounded-lg border border-gray-200 bg-slate-50 text-slate-700 font-medium outline-none focus:border-indigo-300 transition-all cursor-pointer"
                    >
                        {accessibleGroups.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                    </select>
                </div>

                <p className="text-xs text-slate-500 mt-3 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                    {userProfile?.name || user?.email || 'Invitado'}
                </p>
            </div>

            <div className="p-4 space-y-1 flex-1 overflow-y-auto custom-scrollbar">
                <p className="text-[10px] font-bold text-slate-400 uppercase px-3 mb-2 tracking-wider">Módulos</p>
                <NavButton href="/dashboard" active={pathname === '/dashboard'} icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard General" />

                {/* <NavButton
                    href="/reports"
                    active={isActive('/reports')}
                    icon={<FileText className="w-4 h-4" />}
                    label="Reportes Científicos"
                    onClick={handleReportsClick}
                /> */}

                <NavButton href="/tasks" active={isActive('/tasks')} icon={<CheckSquare className="w-4 h-4" />} label="Gestor de Tareas" badge={(tasks || []).filter(t => t.status !== 'done' && t.groupId === activeGroupId).length} />
                <NavButton href="/drive-reports" active={isActive('/drive-reports')} icon={<FileText className="w-4 h-4 text-indigo-500" />} label="Reportes Drive" />
                <NavButton href="/knowledge" active={isActive('/knowledge')} icon={<Library className="w-4 h-4" />} label="Libro de Conocimiento" />
                <NavButton href="/drive" active={isActive('/drive') && !isActive('/drive-reports')} icon={<div className="w-4 h-4 flex items-center justify-center font-bold text-[10px] border border-current rounded-sm">G</div>} label="Google Drive" />

                <div className="pt-4 mt-2 border-t border-gray-100">
                    <NavButton href="/settings" active={isActive('/settings')} icon={<Settings className="w-4 h-4" />} label="Configuración" />

                    {/* Admin Panel Link */}
                    {(hasRole?.('admin') || userProfile?.system_role === 'admin' || roles.includes('admin') || roles.includes('owner')) && (
                        <NavButton
                            href="/admin"
                            active={isActive('/admin')}
                            icon={<Shield className="w-4 h-4 text-indigo-600" />}
                            label="Admin Panel"
                        />
                    )}
                </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-gray-200">
                <div className="flex flex-col gap-1 text-center">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Rol Actual</span>
                    <div className={clsx(
                        "px-3 py-2 rounded-lg text-xs font-bold border flex flex-col gap-2 transition-colors",
                        "bg-gray-100 text-gray-700 border-gray-200"
                    )}>
                        <div className="flex items-center justify-center gap-2">
                            <span className="capitalize">{userRole || userProfile?.system_role || 'Sin Rol'}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium text-center truncate w-full px-1">
                            {userProfile?.email || user?.email}
                        </div>
                    </div>
                </div>
                <button onClick={signOut} className="mt-2 text-[10px] text-red-500 hover:text-red-700 font-bold w-full text-center hover:bg-red-50 p-1 rounded transition-colors">
                    Cerrar Sesión
                </button>
            </div>
        </aside >
    );
}

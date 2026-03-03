'use client';

import React, { useState } from 'react';
import { LayoutDashboard, Users, Box, Shield } from 'lucide-react';
import AdminDashboard from './components/AdminDashboard';
import UserManagement from './components/UserManagement';
import GroupManagement from './components/GroupManagement';
import RolesViewer from './components/RolesViewer';
import { clsx } from 'clsx';

export default function Admin() {
    const [activeTab, setActiveTab] = useState('dashboard');

    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'users', label: 'Usuarios', icon: Users },
        { id: 'groups', label: 'Grupos', icon: Box },
        { id: 'roles', label: 'Roles y Permisos', icon: Shield },
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Admin Header */}
            <header className="px-8 py-6 bg-white border-b border-gray-200 flex flex-col gap-4 sticky top-0 z-10">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Panel de Administración</h2>
                    <p className="text-sm text-slate-500">Gestión global del sistema PhD Nexus.</p>
                </div>

                {/* Navigation Tabs */}
                <nav className="flex items-center gap-1">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={clsx(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                                    isActive
                                        ? "bg-slate-800 text-white shadow-sm"
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                )}
                            >
                                <Icon className={clsx("w-4 h-4", isActive ? "text-slate-200" : "text-slate-400")} />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </header>

            {/* Content Area */}
            <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                <div className="max-w-7xl mx-auto">
                    {activeTab === 'dashboard' && <AdminDashboard setActiveTab={setActiveTab} />}
                    {activeTab === 'users' && <UserManagement />}
                    {activeTab === 'groups' && <GroupManagement />}
                    {activeTab === 'roles' && <RolesViewer />}
                </div>
            </main>
        </div>
    );
}

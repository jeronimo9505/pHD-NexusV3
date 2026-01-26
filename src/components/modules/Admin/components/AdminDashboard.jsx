import React, { useEffect, useState } from 'react';
import { Users, UserPlus, Box, Component } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function AdminDashboard({ setActiveTab }) {
    const [stats, setStats] = useState({
        pendingUsers: 0,
        activeUsers: 0,
        totalGroups: 0,
        activeReports: 0
    });

    useEffect(() => {
        fetchStats();
    }, []);

    // Migrated to Supabase
    const fetchStats = async () => {
        try {
            // 1. Pending Users
            const { count: pendingCount } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            // 2. Active Users
            const { count: activeCount } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active');

            // 3. Groups
            const { count: groupCount } = await supabase
                .from('groups')
                .select('*', { count: 'exact', head: true });

            setStats({
                pendingUsers: pendingCount || 0,
                activeUsers: activeCount || 0,
                totalGroups: groupCount || 0,
                activeReports: 0 // Reports table stats could be added here
            });
        } catch (err) {
            console.error("Error fetching admin stats:", err);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Welcome */}
            <div className="bg-indigo-600 rounded-2xl p-8 text-white shadow-lg shadow-indigo-200">
                <h3 className="text-3xl font-bold mb-2">Bienvenido al Panel de Control</h3>
                <p className="opacity-90 max-w-2xl">
                    Desde aquí puedes gestionar el acceso a PhD Nexus, organizar los laboratorios de investigación y supervisar la actividad global del sistema.
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Usuarios Pendientes"
                    value={stats.pendingUsers}
                    icon={UserPlus}
                    color="text-amber-600"
                    bg="bg-amber-50"
                    onClick={() => setActiveTab('users')}
                    actionLabel="Revisar Solicitudes"
                />
                <StatCard
                    title="Usuarios Activos"
                    value={stats.activeUsers}
                    icon={Users}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                    onClick={() => setActiveTab('users')}
                />
                <StatCard
                    title="Grupos de Investigación"
                    value={stats.totalGroups}
                    icon={Box}
                    color="text-blue-600"
                    bg="bg-blue-50"
                    onClick={() => setActiveTab('groups')}
                />
                {/* Placeholder for future Reports stat */}
                <StatCard
                    title="Actividad Reciente"
                    value="-"
                    icon={Component}
                    color="text-slate-600"
                    bg="bg-slate-50"
                />
            </div>

            {/* Quick Actions or Notices could go here */}
        </div>
    );
}

function StatCard({ title, value, icon: Icon, color, bg, onClick, actionLabel }) {
    return (
        <div
            onClick={onClick}
            className={`bg-white p-6 rounded-xl border border-gray-100 shadow-sm transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-200 group' : ''}`}
        >
            <div className="flex items-start justify-between mb-4">
                <div className={`${bg} p-3 rounded-lg`}>
                    <Icon className={`w-6 h-6 ${color}`} />
                </div>
                {actionLabel && (
                    <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full group-hover:bg-indigo-100 transition-colors">
                        {actionLabel}
                    </span>
                )}
            </div>
            <div>
                <h4 className="text-slate-500 text-sm font-medium mb-1">{title}</h4>
                <p className="text-3xl font-bold text-slate-800">{value}</p>
            </div>
        </div>
    );
}

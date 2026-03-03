'use client';

import React, { useState } from 'react';
import {
    Settings as SettingsIcon, Shield, CheckCircle2, Briefcase, Plus, FlaskConical,
    UserCircle, Key, Eye, EyeOff, Save, Trash2, Mail, Building
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import Modal from '@/components/ui/Modal';


export default function Settings() {
    const {
        userRole, setUserRole,
        groups, setGroups,
        realUser, impersonatedUser, impersonate, stopImpersonation,
        handleInviteUser, handleCreateUser, refreshUserData,
        userProfile, activeGroupId // Added these
    } = useApp();

    const [expandedGroupId, setExpandedGroupId] = useState(null);
    const [visiblePasswords, setVisiblePasswords] = useState({});

    const togglePasswordVisibility = (memberId) => {
        setVisiblePasswords(prev => ({ ...prev, [memberId]: !prev[memberId] }));
    };

    const handleUpdateMember = (groupId, memberId, field, value) => {
        setGroups(groups.map(group => {
            if (group.id !== groupId) return group;
            return {
                ...group,
                members: group.members.map(member => member.id === memberId ? { ...member, [field]: value } : member)
            };
        }));
    };

    const handleRemoveMember = (groupId, memberId) => {
        if (window.confirm('¿Está seguro de eliminar este miembro?')) {
            setGroups(groups.map(group => {
                if (group.id !== groupId) return group;
                return {
                    ...group,
                    members: group.members.filter(m => m.id !== memberId)
                };
            }));
        }
    };

    const handleAddGroup = () => {
        const newGroup = { id: `g-${Date.now()}`, name: 'Nuevo Grupo de Investigación', members: [] };
        setGroups([...groups, newGroup]);
        setExpandedGroupId(newGroup.id);
    };

    const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
    const [selectedGroupForAdd, setSelectedGroupForAdd] = useState(null);
    const [newMemberData, setNewMemberData] = useState({ email: '', role: 'student' });

    const openAddMemberModal = (groupId) => {
        setSelectedGroupForAdd(groupId);
        setNewMemberData({ email: '', role: 'student' });
        setIsAddMemberModalOpen(true);
    };

    // User Creation State
    const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
    const [newUserData, setNewUserData] = useState({ email: '', password: '', name: '', role: 'user' });
    const [allUsers, setAllUsers] = useState([]); // In a real app, fetch from profiles table

    // Fetch users (Mocking accessing the 'profiles' table via context or direct query if needed)
    // For now, we'll assume we can view them if we implemented `fetchUserList`.
    // Since we don't have `fetchUserList`, we will just show the "Create User" action primarily.

    const handleConfirmCreateUser = async () => {
        if (!newUserData.email || !newUserData.password || !newUserData.name) {
            alert("Por favor completa todos los campos");
            return;
        }

        const success = await handleCreateUser(newUserData.email, newUserData.password, newUserData.name, newUserData.role);
        if (success) {
            setIsCreateUserModalOpen(false);
            setNewUserData({ email: '', password: '', name: '', role: 'student' });
        }
    };

    const handleConfirmAddMember = async () => {
        if (!newMemberData.email) return;

        const success = await handleInviteUser(newMemberData.email, newMemberData.role.toLowerCase(), selectedGroupForAdd);
        if (success) {
            refreshUserData();
            setIsAddMemberModalOpen(false);
        }
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300">
            <header className="p-6 border-b border-gray-200 bg-white flex justify-between items-center shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3"><SettingsIcon className="w-6 h-6 text-slate-600" /> Configuración</h2>
                    <p className="text-sm text-slate-500 mt-1">Gestiona tu perfil y preferencias personales.</p>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50 custom-scrollbar">
                <div className="max-w-3xl mx-auto space-y-8">

                    {/* Simple Profile View for Everyone */}
                    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-6 border-b border-gray-100"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><UserCircle className="w-5 h-5 text-slate-600" /> Mi Perfil</h3></div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Nombre</label>
                                <p className="font-bold text-slate-700">{userProfile?.name || userProfile?.full_name}</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Email</label>
                                <p className="font-bold text-slate-700">{userProfile?.email}</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Rol Sistema</label>
                                <p className="font-bold text-slate-700 capitalize">{userProfile?.system_role || 'User'}</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Grupo Activo</label>
                                <p className="font-bold text-slate-700">{(groups || []).find(g => g.id === activeGroupId)?.name || 'Sin grupo'}</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Rol en Grupo</label>
                                <p className="font-bold text-slate-700 capitalize">{userRole}</p>
                            </div>
                        </div>
                    </section>

                    {/* Show link to Admin if capable */}
                    {userProfile?.system_role === 'admin' && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 flex items-center justify-between">
                            <div>
                                <h4 className="font-bold text-indigo-900">Panel de Administración</h4>
                                <p className="text-sm text-indigo-700">Tienes permisos de administrador del sistema.</p>
                            </div>
                            <button
                                onClick={() => window.location.reload()} // Navigation handled via Sidebar usually, but this is a fallback hint
                                className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm shadow-sm"
                            >
                                Usar Menú Lateral ➜
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

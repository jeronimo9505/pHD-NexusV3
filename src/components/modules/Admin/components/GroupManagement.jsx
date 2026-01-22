import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import { Box, Plus, Users, Trash2, Edit2, Shield, UserPlus } from 'lucide-react';
import Modal from '@/components/ui/Modal';

export default function GroupManagement() {
    const { currentUser, refreshUserData } = useApp();
    const [groups, setGroups] = useState([]);
    const [expandedGroup, setExpandedGroup] = useState(null);
    const [members, setMembers] = useState([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);

    // Create Group State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupDesc, setNewGroupDesc] = useState('');

    // Add Member State
    const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
    const [availableUsers, setAvailableUsers] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedUserRole, setSelectedUserRole] = useState('student');

    // Edit Group State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [editGroupName, setEditGroupName] = useState('');
    const [editGroupDesc, setEditGroupDesc] = useState('');

    // Migrated to Supabase
    useEffect(() => {
        fetchGroups();
    }, []);

    const fetchGroups = async () => {
        const { data } = await supabase.from('groups').select('*');
        if (data) setGroups(data);
    };

    const fetchGroupMembers = async (groupId) => {
        setIsLoadingMembers(true);

        const { data, error } = await supabase
            .from('group_members')
            .select(`
                *,
                user:profiles(*)
            `)
            .eq('group_id', groupId);

        if (error) {
            console.error("Error fetching group members:", error);
            setIsLoadingMembers(false);
            return;
        }

        const enrichedMembers = (data || []).map(m => ({
            ...m,
            email: m.user?.email || 'Unknown',
            full_name: m.user?.full_name || 'Sin nombre',
            membership_id: m.id, // Keep explicit reference
            id: m.user_id // Keep user id reference for compatibility
        }));

        setMembers(enrichedMembers);
        setIsLoadingMembers(false);
    };

    const fetchAvailableUsers = async (groupId) => {
        // Fetch all active users, and subtract existing members
        const { data: allUsers } = await supabase.from('profiles').select('*').eq('status', 'active');
        const { data: memberData } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);

        const existingMemberIds = (memberData || []).map(m => m.user_id);
        const available = (allUsers || []).filter(u => !existingMemberIds.includes(u.id));

        setAvailableUsers(available);
    };

    const handleGroupClick = (group) => {
        if (expandedGroup === group.id) {
            setExpandedGroup(null);
        } else {
            setExpandedGroup(group.id);
            fetchGroupMembers(group.id);
        }
    };

    const handleCreateGroup = async () => {
        if (!newGroupName) return;

        // Generate a unique code for the group
        const code = newGroupName.substring(0, 4).toUpperCase() + Math.floor(Math.random() * 10000);

        const { error } = await supabase.from('groups').insert({
            name: newGroupName,
            description: newGroupDesc,
            code: code,
            created_by: currentUser?.id
        });

        if (error) {
            alert("Error creando grupo: " + error.message);
        } else {
            setNewGroupName('');
            setNewGroupDesc('');
            setIsCreateModalOpen(false);
            fetchGroups();
            await refreshUserData();
        }
    };

    const handleEditGroup = async () => {
        if (!editingGroup || !editGroupName) return;

        const { error } = await supabase.from('groups').update({
            name: editGroupName,
            description: editGroupDesc
        }).eq('id', editingGroup.id);

        if (error) {
            alert("Error editando grupo: " + error.message);
        } else {
            setIsEditModalOpen(false);
            setEditingGroup(null);
            fetchGroups();
            await refreshUserData();
        }
    };

    const openEditModal = (group) => {
        setEditingGroup(group);
        setEditGroupName(group.name);
        setEditGroupDesc(group.description || '');
        setIsEditModalOpen(true);
    };

    const openAddMemberModal = async () => {
        await fetchAvailableUsers(expandedGroup);
        setSelectedUserId('');
        setSelectedUserRole('student');
        setIsAddMemberModalOpen(true);
    };

    const handleAddMember = async () => {
        if (!selectedUserId || !expandedGroup) return;

        const { error } = await supabase.from('group_members').insert({
            group_id: expandedGroup,
            user_id: selectedUserId,
            role: selectedUserRole,
            status: 'active'
        });

        if (error) {
            alert("Error añadiendo miembro: " + error.message);
        } else {
            setIsAddMemberModalOpen(false);
            fetchGroupMembers(expandedGroup);
            await refreshUserData();
        }
    };

    const handleRemoveMember = async (membershipId) => {
        if (!window.confirm("¿Seguro que quieres quitar a este miembro del grupo? No se perderán sus datos, solo el acceso.")) return;

        const { error } = await supabase.from('group_members').delete().eq('id', membershipId);

        if (error) alert("Error: " + error.message);
        else {
            if (expandedGroup) fetchGroupMembers(expandedGroup);
            await refreshUserData();
        }
    };

    const handleDeleteGroup = async (groupId) => {
        if (!window.confirm("¿ESTÁS SEGURO? Esto eliminará el grupo y desconectará a todos sus miembros. Esta acción no se puede deshacer.")) return;

        // Cascade delete should handle members usually, but let's be safe if no cascade
        const { error } = await supabase.from('groups').delete().eq('id', groupId);

        if (error) {
            alert("Error eliminando grupo: " + error.message);
        } else {
            setExpandedGroup(null);
            fetchGroups();
            await refreshUserData();
        }
    };

    const handleUpdateRole = async (membershipId, newRole) => {
        const { error } = await supabase.from('group_members').update({ role: newRole }).eq('id', membershipId);

        if (error) alert("Error updating role: " + error.message);
        else {
            if (expandedGroup) fetchGroupMembers(expandedGroup);
            await refreshUserData();
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">Grupos de Investigación</h3>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Nuevo Grupo
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {groups.map(group => (
                    <div key={group.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm transition-all hover:border-indigo-300">
                        <div
                            className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                            onClick={() => handleGroupClick(group)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="bg-indigo-50 p-2.5 rounded-lg text-indigo-600">
                                    <Box className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800">{group.name}</h4>
                                    <p className="text-xs text-slate-500 mt-0.5">{group.description || 'Sin descripción'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openEditModal(group);
                                    }}
                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    title="Editar grupo"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                {/* Delete Group Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteGroup(group.id);
                                    }}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Eliminar grupo"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>

                                <div className="text-xs text-slate-400 font-medium ml-2">
                                    {expandedGroup === group.id ? 'Cerrar' : 'Ver Detalles'}
                                </div>
                            </div>
                        </div>

                        {/* Members Expansion */}
                        {expandedGroup === group.id && (
                            <div className="bg-slate-50/50 border-t border-gray-100 p-6 animate-in slide-in-from-top-2">
                                <div className="flex justify-between items-center mb-4">
                                    <h5 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2">
                                        <Users className="w-4 h-4" /> Miembros del Grupo
                                    </h5>
                                    <button
                                        onClick={openAddMemberModal}
                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                                    >
                                        <UserPlus className="w-3.5 h-3.5" /> Añadir Miembro
                                    </button>
                                </div>

                                {isLoadingMembers ? (
                                    <div className="py-4 text-center text-slate-400 text-sm">Cargando miembros...</div>
                                ) : (
                                    <div className="space-y-3">
                                        {members.length === 0 && <p className="text-slate-400 text-sm italic">No hay miembros activos.</p>}
                                        {members.map(m => (
                                            <div key={m.membership_id || m.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold border border-slate-200">
                                                        {m.full_name?.charAt(0) || m.email?.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-700">{m.email}</p>
                                                        <p className="text-[10px] text-slate-400">{m.full_name || 'Sin nombre'} - <span className="text-indigo-500">{m.role}</span></p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <select
                                                        value={m.role || 'student'}
                                                        onChange={(e) => handleUpdateRole(m.membership_id || m.id, e.target.value)} // Handle ID mapping
                                                        className="text-xs bg-slate-50 border border-gray-200 rounded px-2 py-1 outline-none focus:border-indigo-500"
                                                    >
                                                        <option value="student">Estudiante</option>
                                                        <option value="researcher">Investigador</option>
                                                        <option value="supervisor">Supervisor</option>
                                                        <option value="lab_manager">Lab Manager</option>
                                                        <option value="owner">Owner</option>
                                                    </select>

                                                    <button
                                                        onClick={() => handleRemoveMember(m.membership_id)}
                                                        className="text-slate-300 hover:text-red-500 transition-colors"
                                                        title="Quitar del grupo"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Create Modal */}
            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Crear Nuevo Grupo">
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase">Nombre del Laboratorio / Grupo</label>
                        <input className="w-full text-sm bg-slate-50 border border-gray-200 rounded-lg px-3 py-2" placeholder="Ej: Lab de Nanomateriales" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase">Descripción (Opcional)</label>
                        <textarea className="w-full text-sm bg-slate-50 border border-gray-200 rounded-lg px-3 py-2" placeholder="Descripción breve..." value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} />
                    </div>
                    <div className="flex justify-end pt-4 gap-2">
                        <button onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-slate-600 text-sm font-medium">Cancelar</button>
                        <button onClick={handleCreateGroup} className="px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800">Crear Grupo</button>
                    </div>
                </div>
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Grupo">
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase">Nombre del Grupo</label>
                        <input className="w-full text-sm bg-slate-50 border border-gray-200 rounded-lg px-3 py-2" value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase">Descripción</label>
                        <textarea className="w-full text-sm bg-slate-50 border border-gray-200 rounded-lg px-3 py-2" value={editGroupDesc} onChange={(e) => setEditGroupDesc(e.target.value)} />
                    </div>
                    <div className="flex justify-end pt-4 gap-2">
                        <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-slate-600 text-sm font-medium">Cancelar</button>
                        <button onClick={handleEditGroup} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700">Guardar Cambios</button>
                    </div>
                </div>
            </Modal>

            {/* Add Member Modal */}
            <Modal isOpen={isAddMemberModalOpen} onClose={() => setIsAddMemberModalOpen(false)} title="Añadir Miembro al Grupo">
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase">Seleccionar Usuario</label>
                        <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className="w-full text-sm bg-slate-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                        >
                            <option value="">-- Selecciona un usuario --</option>
                            {availableUsers.map(user => (
                                <option key={user.id} value={user.id}>
                                    {user.email} {user.full_name ? `(${user.full_name})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase">Rol en el Grupo</label>
                        <select
                            value={selectedUserRole}
                            onChange={(e) => setSelectedUserRole(e.target.value)}
                            className="w-full text-sm bg-slate-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                        >
                            <option value="student">Estudiante</option>
                            <option value="researcher">Investigador</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="lab_manager">Lab Manager</option>
                            <option value="owner">Owner</option>
                        </select>
                    </div>
                    <div className="flex justify-end pt-4 gap-2">
                        <button onClick={() => setIsAddMemberModalOpen(false)} className="px-4 py-2 text-slate-600 text-sm font-medium">Cancelar</button>
                        <button onClick={handleAddMember} disabled={!selectedUserId} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">Añadir</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

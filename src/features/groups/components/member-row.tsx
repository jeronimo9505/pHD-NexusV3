'use client';

import { GroupMember } from '../types';
import { updateMemberRoleAction, removeMemberAction } from '../actions';
import { toast } from 'sonner';
import { useState } from 'react';
import { MoreVertical, Shield, ShieldAlert, Trash2, User } from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming you have utils
// Basic Dropdown/Menu implementation using headles UI or simple state if no library


export function MemberRow({
    member,
    currentUserId,
    canManage
}: {
    member: GroupMember & { profiles: any }; // Join type
    currentUserId: string;
    canManage: boolean;
}) {
    const [loading, setLoading] = useState(false);

    // Simple state for role change optimistically? 
    // For now standard server action

    const handleRoleChange = async (newRole: string) => {
        setLoading(true);
        const formData = new FormData();
        formData.append('groupId', member.group_id);
        formData.append('userId', member.user_id);
        formData.append('role', newRole);

        const res = await updateMemberRoleAction(formData);
        if (res?.error) toast.error(res.error);
        else toast.success('Role updated');
        setLoading(false);
    };

    const handleRemove = async () => {
        if (!confirm('Are you sure you want to remove this member?')) return;
        setLoading(true);
        const formData = new FormData();
        formData.append('groupId', member.group_id);
        formData.append('userId', member.user_id);

        const res = await removeMemberAction(formData);
        if (res?.error) toast.error(res.error);
        else toast.success('Member removed');
        setLoading(false);
    };

    const isMe = member.user_id === currentUserId;

    return (
        <div className="flex items-center justify-between p-4 bg-white border-b last:border-0 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden">
                    {member.profiles?.avatar_url ? (
                        <img src={member.profiles.avatar_url} alt={member.profiles.full_name || 'User'} className="w-full h-full object-cover" />
                    ) : (
                        <User className="text-slate-500" size={20} />
                    )}
                </div>
                <div>
                    <p className="font-medium text-slate-900">
                        {member.profiles?.full_name || member.profiles?.email}
                        {isMe && <span className="text-xs ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">You</span>}
                    </p>
                    <p className="text-xs text-slate-500 capitalize flex items-center gap-1">
                        {member.role}
                        {member.status === 'pending' && <span className="text-yellow-600">(Pending)</span>}
                    </p>
                </div>
            </div>

            {canManage && !isMe ? (
                <div className="flex items-center gap-2">
                    <select
                        disabled={loading}
                        value={member.role}
                        onChange={(e) => handleRoleChange(e.target.value)}
                        className="text-xs border rounded px-2 py-1 bg-white hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        <option value="student">Student</option>
                        <option value="researcher">Researcher</option>
                        <option value="supervisor">Supervisor</option>
                    </select>

                    <button
                        disabled={loading}
                        onClick={handleRemove}
                        className="p-2 text-slate-400 hover:text-red-600 rounded-full hover:bg-red-50 transition-colors"
                        title="Remove member"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            ) : (
                <span className="text-xs text-slate-400 px-3 py-1 bg-slate-100 rounded-full">{member.role}</span>
            )}
        </div>
    );
}

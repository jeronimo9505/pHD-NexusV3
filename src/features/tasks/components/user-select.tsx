'use client';

import { useState, useEffect } from 'react';
import { getGroupMembersAction } from '../actions/members';
import { User, Check } from 'lucide-react';

interface UserSelectProps {
    groupId: string;
    selectedUserIds: string[];
    onChange: (userIds: string[]) => void;
    label?: string;
    placeholder?: string;
}

type GroupMember = {
    user_id: string;
    role: string;
    profile: {
        full_name: string;
        avatar_url?: string;
    };
};

export function UserSelect({ groupId, selectedUserIds, onChange, label = "Assignees", placeholder = "Select members..." }: UserSelectProps) {
    const [members, setMembers] = useState<GroupMember[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadMembers() {
            const res = await getGroupMembersAction(groupId);
            if (res.data) {
                setMembers(res.data as GroupMember[]);
            }
            setLoading(false);
        }
        loadMembers();
    }, [groupId]);

    const toggleUser = (userId: string) => {
        if (selectedUserIds.includes(userId)) {
            onChange(selectedUserIds.filter(id => id !== userId));
        } else {
            onChange([...selectedUserIds, userId]);
        }
    };

    const selectedMembers = members.filter(m => selectedUserIds.includes(m.user_id));

    return (
        <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">{label}</label>

            {/* Selected Display */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-2 bg-slate-800 border border-slate-700 rounded-lg text-sm cursor-pointer hover:border-indigo-500 transition-all min-h-[38px] flex items-center gap-2"
            >
                {selectedMembers.length > 0 ? (
                    <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                            {selectedMembers.slice(0, 3).map(member => (
                                <div
                                    key={member.user_id}
                                    className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 border-2 border-slate-800 flex items-center justify-center text-xs font-bold text-white shadow-md"
                                    title={member.profile.full_name}
                                >
                                    {member.profile.avatar_url ? (
                                        <img src={member.profile.avatar_url} className="w-full h-full rounded-full object-cover" alt={member.profile.full_name} />
                                    ) : (
                                        member.profile.full_name.charAt(0).toUpperCase()
                                    )}
                                </div>
                            ))}
                            {selectedMembers.length > 3 && (
                                <div className="w-7 h-7 rounded-full bg-slate-700 border-2 border-slate-800 flex items-center justify-center text-xs font-medium text-slate-300">
                                    +{selectedMembers.length - 3}
                                </div>
                            )}
                        </div>
                        <span className="text-slate-200 font-medium">{selectedMembers.length} assigned</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                        <User size={16} />
                        <span>{placeholder}</span>
                    </div>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                    <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {loading ? (
                            <div className="p-3 text-sm text-slate-400 text-center">Loading...</div>
                        ) : members.length === 0 ? (
                            <div className="p-3 text-sm text-slate-400 text-center">No members found</div>
                        ) : (
                            members.map(member => (
                                <div
                                    key={member.user_id}
                                    onClick={() => toggleUser(member.user_id)}
                                    className="flex items-center gap-3 p-2 hover:bg-slate-700 cursor-pointer transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-medium text-white">
                                        {member.profile.avatar_url ? (
                                            <img src={member.profile.avatar_url} className="w-full h-full rounded-full" alt={member.profile.full_name} />
                                        ) : (
                                            member.profile.full_name.charAt(0)
                                        )}
                                    </div>
                                    <span className="flex-1 text-sm text-slate-200">{member.profile.full_name}</span>
                                    {selectedUserIds.includes(member.user_id) && (
                                        <Check size={16} className="text-indigo-400" />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

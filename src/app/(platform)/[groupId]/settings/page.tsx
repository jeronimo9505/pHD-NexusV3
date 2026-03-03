import { createClient } from "@/lib/supabase/server";
import { getGroupRole, isGroupOwner, isGroupAdmin, getSystemRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { EditGroupForm } from "@/features/groups/components/edit-group-form";
import { MemberList } from "@/features/groups/components/member-list";
import { DriveSettingsForm } from "@/features/groups/components/drive-settings-form";
import { InviteMemberForm } from "@/features/groups/components/invite-member-form";
import { Settings, Users, HardDrive, Key, UserPlus, Info, Clock } from "lucide-react";
import { PendingRequests } from "@/features/groups/components/pending-requests";

export default async function GroupSettingsPage({
    params,
}: {
    params: Promise<{ groupId: string }>;
}) {
    const { groupId } = await params;

    // All members can access settings now
    const role = await getGroupRole(groupId);
    if (!role) {
        redirect(`/dashboard`);
    }

    const supabase = await createClient();
    const { data: group } = await supabase.from('groups').select('*').eq('id', groupId).single();
    if (!group) return <div>Group not found</div>;

    // Check admin-level permissions
    const isOwner = await isGroupOwner(groupId);
    const canManage = isGroupAdmin(role) || isOwner;
    const systemRole = await getSystemRole();
    const isSysAdmin = systemRole === 'admin';

    const driveSettings = group.drive_settings as { clientId?: string; apiKey?: string; folderId?: string } | undefined;

    // Fetch pending join requests (only for managers)
    const pendingMembers = canManage ? await (async () => {
        const { data } = await supabase
            .from('group_members')
            .select('id, user_id, role, created_at, profiles(full_name, email)')
            .eq('group_id', groupId)
            .eq('status', 'pending');
        return (data ?? []) as any[];
    })() : [];

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-4xl mx-auto px-8 py-8 space-y-10">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                            <Settings size={20} className="text-slate-600" />
                        </div>
                        Group Settings
                    </h1>
                    <p className="text-slate-500 mt-1 ml-[52px]">
                        {canManage ? 'Manage your group, team, and integrations.' : 'View group information and team members.'}
                    </p>
                </div>

                {/* General Info — Admin only */}
                {canManage && (
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Info size={18} className="text-blue-600" />
                            <h2 className="text-lg font-semibold text-slate-900">General Information</h2>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200">
                            <EditGroupForm group={group} />
                        </div>
                    </section>
                )}

                {/* Access Code — visible to admin/owner */}
                {canManage && (
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Key size={18} className="text-emerald-600" />
                            <h2 className="text-lg font-semibold text-slate-900">Access Code</h2>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200">
                            <p className="text-sm text-slate-500 mb-3">Share this code to invite new members to join directly.</p>
                            <div className="bg-slate-900 text-white p-4 rounded-lg font-mono text-center text-2xl tracking-widest w-fit min-w-[200px]">
                                {group.code}
                            </div>
                        </div>
                    </section>
                )}

                {/* Invite Members — Admin only */}
                {canManage && (
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <UserPlus size={18} className="text-violet-600" />
                            <h2 className="text-lg font-semibold text-slate-900">Invite Members</h2>
                        </div>
                        <InviteMemberForm groupId={groupId} />
                    </section>
                )}

                {/* Pending Join Requests — Admin/Manager only */}
                {canManage && (
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Clock size={18} className="text-amber-500" />
                            <h2 className="text-lg font-semibold text-slate-900">Pending Join Requests</h2>
                        </div>
                        <PendingRequests groupId={groupId} pending={pendingMembers} />
                    </section>
                )}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Users size={18} className="text-indigo-600" />
                        <h2 className="text-lg font-semibold text-slate-900">Team Members</h2>
                    </div>
                    <MemberList groupId={groupId} currentUserRole={canManage ? role : 'student'} />
                </section>

                {/* Google Drive Integration — Admin/Owner/SystemAdmin only */}
                {(canManage || isSysAdmin) && (
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <HardDrive size={18} className="text-amber-600" />
                            <h2 className="text-lg font-semibold text-slate-900">Google Drive Integration</h2>
                        </div>
                        <DriveSettingsForm groupId={groupId} initialSettings={driveSettings} />
                    </section>
                )}
            </div>
        </div>
    );
}

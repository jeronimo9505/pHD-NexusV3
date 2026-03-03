import { createClient } from "@/lib/supabase/server";
import { MemberRow } from "./member-row";
import { GroupMember } from "../types";

export async function MemberList({
    groupId,
    currentUserRole
}: {
    groupId: string;
    currentUserRole: string;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch members with profile data
    const { data: members, error } = await supabase
        .from('group_members')
        .select(`
            *,
            profiles (
                full_name,
                email,
                avatar_url
            )
        `)
        .eq('group_id', groupId)
        .order('role', { ascending: false }); // simple ordering

    if (!members) return <div className="p-4 text-slate-500">No members found.</div>;

    const canManage = ['supervisor', 'labmanager', 'owner'].includes(currentUserRole);

    return (
        <div className="bg-white rounded-lg border overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b flex justify-between items-center">
                <h3 className="font-medium text-slate-700">Members ({members.length})</h3>
                {/* Could add invite button here */}
            </div>
            <div>
                {members.map((member: any) => (
                    <MemberRow
                        key={member.id}
                        member={member}
                        currentUserId={user?.id!}
                        canManage={canManage}
                    />
                ))}
            </div>
        </div>
    );
}

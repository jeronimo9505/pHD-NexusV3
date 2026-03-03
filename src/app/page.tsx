import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CreateGroupModal } from "@/features/groups/components/create-group-modal";

export default async function RootPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    // Fetch user's groups
    const { data: members } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id);

    if (members && members.length > 0) {
        // Redirect to the first group
        redirect(`/${members[0].group_id}/dashboard`);
    }

    // If no groups, show onboarding
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
            <div className="max-w-md w-full space-y-8 text-center">
                <div>
                    <h2 className="mt-6 text-3xl font-extrabold text-slate-900">Welcome to PhD Nexus</h2>
                    <p className="mt-2 text-sm text-slate-600">
                        You don't seem to be part of any research group yet.
                    </p>
                </div>

                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200">
                    <p className="mb-6 text-slate-500">Create a new group to get started, or ask your lab manager for an invite code.</p>
                    <div className="flex justify-center">
                        {/* We need a trigger for the modal. Checking if CreateGroupModal exports a standalone button or fully controlled component */}
                        {/* It seems CreateGroupModal is likely a Dialog/Modal triggered by a child? I need to check the file content first. */}
                        <CreateGroupModal />
                    </div>
                </div>
            </div>
        </div>
    );
}

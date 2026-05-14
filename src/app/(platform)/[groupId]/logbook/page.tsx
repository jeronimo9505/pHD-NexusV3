import { createClient, getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LogbookView } from "@/features/logbook/components/LogbookView";

interface PageProps {
    params: Promise<{ groupId: string }>;
}

export const metadata = {
    title: "Bitácora | PHD Nexus",
    description: "Tu bitácora de investigación personal conectada con Telegram",
};

export default async function LogbookPage({ params }: PageProps) {
    const { groupId } = await params;
    const user = await getUser();
    if (!user) redirect('/login');

    const supabase = await createClient();
    const { data: group } = await supabase
        .from('groups')
        .select('logbook_is_private, created_by')
        .eq('id', groupId)
        .single() as any;

    const isPrivate = group?.logbook_is_private || false;
    const isOwner = group?.created_by === user.id;

    return (
        <div className="h-full flex flex-col">
            <LogbookView 
                groupId={groupId} 
                userId={user.id} 
                isPrivate={isPrivate}
                isOwner={isOwner}
            />
        </div>
    );
}

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

    return (
        <div className="h-full flex flex-col">
            <LogbookView groupId={groupId} userId={user.id} />
        </div>
    );
}

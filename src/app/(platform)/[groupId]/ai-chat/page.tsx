import { isGroupOwner } from "@/lib/auth/roles";
import { AIChatPanel } from "@/features/ai-chat/components/AIChatPanel";
import { redirect } from "next/navigation";
import { Bot, Lock } from "lucide-react";

interface AIChatPageProps {
    params: Promise<{ groupId: string }>;
}

export default async function AIChatPage({ params }: AIChatPageProps) {
    const { groupId } = await params;
    const owner = await isGroupOwner(groupId);

    if (!owner) {
        redirect(`/${groupId}/dashboard`);
    }

    return (
        <div className="h-[calc(100vh-0px)] flex flex-col">
            <AIChatPanel groupId={groupId} />
        </div>
    );
}

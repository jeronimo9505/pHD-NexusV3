import { isGroupOwner } from "@/lib/auth/roles";
import { AIChatPanel } from "@/features/ai-chat/components/AIChatPanel";
import { redirect } from "next/navigation";
import { Bot, Lock } from "lucide-react";

interface AIChatPageProps {
    params: Promise<{ groupId: string }>;
}

export default async function AIChatPage({ params }: AIChatPageProps) {
    let groupId = "";
    try {
        const resolvedParams = await params;
        groupId = resolvedParams.groupId;

        if (!groupId || groupId === "ai-chat") {
            console.error("[AIChatPage] Invalid groupId detected:", groupId);
            redirect("/dashboard");
        }

        const owner = await isGroupOwner(groupId);

        if (!owner) {
            console.warn(`[AIChatPage] Access denied for user to group ${groupId}. Redirecting to dashboard.`);
            redirect(`/${groupId}/dashboard`);
        }

        return (
            <div className="h-[calc(100vh-0px)] flex flex-col">
                <AIChatPanel groupId={groupId} />
            </div>
        );
    } catch (e) {
        console.error("[AIChatPage] Critical error rendering AI Chat page:", e);
        // If it's a redirect error from Next.js, re-throw it so Next.js can handle it
        if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) {
            throw e;
        }
        
        // For other errors, redirect to a safe place
        redirect(groupId ? `/${groupId}/dashboard` : "/dashboard");
    }
}

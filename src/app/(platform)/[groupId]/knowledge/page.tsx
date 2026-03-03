
import { createClient } from "@/lib/supabase/server";
import { getKnowledgeItemsAction, type KnowledgeItem } from "@/features/knowledge/actions";
import { KnowledgeExplorer } from "@/features/knowledge/components/knowledge-explorer";

interface PageProps {
    params: Promise<{
        groupId: string;
    }>;
}

export default async function KnowledgePage({ params }: PageProps) {
    const { groupId } = await params;
    const supabase = await createClient();

    const [itemsRes, settingsRes] = await Promise.all([
        getKnowledgeItemsAction(groupId),
        supabase.from('groups').select('drive_settings').eq('id', groupId).single()
    ]);

    const items = (itemsRes.data || []) as KnowledgeItem[];
    const settings = (settingsRes.data?.drive_settings as any) || {};

    return (
        <KnowledgeExplorer
            initialItems={items}
            groupId={groupId}
            driveSettings={settings.googleDrive}
        />
    );
}

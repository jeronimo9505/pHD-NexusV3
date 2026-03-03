
import { createClient } from "@/lib/supabase/server";
import { getKnowledgeItemsAction } from "@/features/knowledge/actions";
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
        supabase.from('group_settings').select('drive_settings').eq('group_id', groupId).single()
    ]);

    const items = itemsRes.data || [];
    const settings = settingsRes.data?.drive_settings || {};

    return (
        <KnowledgeExplorer
            initialItems={items}
            groupId={groupId}
            driveSettings={settings.googleDrive}
        />
    );
}

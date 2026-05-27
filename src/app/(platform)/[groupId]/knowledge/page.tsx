
import { createClient } from "@/lib/supabase/server";
import { getKnowledgeItemsAction, type KnowledgeItem } from "@/features/knowledge/actions";
import { KnowledgeExplorer } from "@/features/knowledge/components/knowledge-explorer";

interface PageProps {
    params: Promise<{
        groupId: string;
    }>;
}

/** Narrows resource_type from `string | null` to the KnowledgeItem union. */
function toResourceType(v: string | null | undefined): KnowledgeItem['resource_type'] {
    if (v === 'file' || v === 'link' || v === 'note') return v;
    return undefined;
}

export default async function KnowledgePage({ params }: PageProps) {
    const { groupId } = await params;
    const supabase = await createClient();

    // Use explicit generics / typed variables to avoid TS2589
    // (type instantiation excessively deep on complex Supabase return types)
    const [itemsRes, settingsRes] = await Promise.all([
        getKnowledgeItemsAction(groupId),
        supabase
            .from('groups')
            .select('drive_settings')
            .eq('id', groupId)
            .single<{ drive_settings: Record<string, unknown> | null }>(),
    ]);

    // Map raw DB rows → KnowledgeItem[], narrowing resource_type to the union type
    const rawItems = itemsRes.data ?? [];
    const items: KnowledgeItem[] = rawItems.map((row) => ({
        ...row,
        url: row.url ?? '',
        content: row.content ?? undefined,
        drive_file_id: row.drive_file_id ?? undefined,
        category: row.category ?? undefined,
        folder_id: row.folder_id ?? undefined,
        tags: row.tags ?? undefined,
        is_pinned: row.is_pinned ?? undefined,
        is_starred: row.is_starred ?? undefined,
        resource_type: toResourceType((row as { resource_type?: string | null }).resource_type),
    }));

    const driveSettings = settingsRes.data?.drive_settings ?? {};

    return (
        <KnowledgeExplorer
            initialItems={items}
            groupId={groupId}
            driveSettings={(driveSettings as Record<string, unknown>).googleDrive}
        />
    );
}

import { createClient } from "@/lib/supabase/server";

export type ActivityAction = 'created' | 'updated' | 'deleted' | 'submitted' | 'reviewed' | 'login' | 'visit' | 'commented';
export type ActivityEntityType = 'report' | 'task' | 'knowledge' | 'group' | 'user' | 'comment';

/**
 * Logs an activity to the database.
 */
export async function logActivity(
    groupId: string,
    action: ActivityAction,
    entityType: ActivityEntityType,
    entityId: string,
    metadata: Record<string, any> = {}
) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    try {
        const { error } = await supabase
            .from('activity_log')
            .insert({
                group_id: groupId,
                user_id: user.id,
                action,
                entity_type: entityType,
                entity_id: entityId,
                metadata,
            });

        if (error) {
            console.error("Error logging activity:", error);
        }
    } catch (e) {
        console.error("Critical error in logActivity:", e);
    }
}

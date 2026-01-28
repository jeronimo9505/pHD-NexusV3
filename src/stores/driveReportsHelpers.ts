import { supabase } from '@/lib/supabase/client';

/**
 * Toggle seen status for a drive report
 * This is SEPARATE from the store - just updates DB and returns success
 * Caller must refresh the list afterward
 */
export async function toggleDriveReportSeen(reportId: string) {
    try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { error: 'Not authenticated' };
        }

        // Get current seen_by
        const { data: current, error: fetchError } = await supabase
            .from('drive_reports')
            .select('seen_by')
            .eq('id', reportId)
            .single();

        if (fetchError) throw fetchError;

        const currentSeenBy = current?.seen_by || [];
        const isSeen = currentSeenBy.includes(user.id);

        // Toggle
        const newSeenBy = isSeen
            ? currentSeenBy.filter(id => id !== user.id)
            : [...currentSeenBy, user.id];

        // Update
        const { error: updateError } = await supabase
            .from('drive_reports')
            .update({ seen_by: newSeenBy })
            .eq('id', reportId);

        if (updateError) throw updateError;

        return { error: undefined, isSeen: !isSeen };
    } catch (err: any) {
        console.error('Error toggling seen status:', err);
        return { error: err.message };
    }
}

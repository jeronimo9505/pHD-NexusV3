import { supabase } from '@/lib/supabase/client';

/**
 * Toggle seen status for a drive report
 * This is SEPARATE from the store - just updates DB and returns success
 * Caller must refresh the list afterward
 */
export async function toggleDriveReportSeen(reportId: string) {
    console.log('🔵 toggleDriveReportSeen called for:', reportId);

    try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.warn('⚠️ No authenticated user');
            return { error: 'Not authenticated' };
        }

        console.log('👤 User ID:', user.id);

        // Get current seen_by
        const { data: current, error: fetchError } = await supabase
            .from('drive_reports')
            .select('seen_by')
            .eq('id', reportId)
            .single();

        if (fetchError) {
            console.error('❌ Fetch error:', fetchError);
            throw fetchError;
        }

        console.log('📊 Current seen_by:', current?.seen_by);

        const currentSeenBy = current?.seen_by || [];
        const isSeen = currentSeenBy.includes(user.id);

        console.log('👁️ Is currently seen?', isSeen);

        // Toggle
        const newSeenBy = isSeen
            ? currentSeenBy.filter(id => id !== user.id)
            : [...currentSeenBy, user.id];

        console.log('📤 New seen_by:', newSeenBy);

        // Update
        const { error: updateError } = await supabase
            .from('drive_reports')
            .update({ seen_by: newSeenBy })
            .eq('id', reportId);

        if (updateError) {
            console.error('❌ Update error:', updateError);
            throw updateError;
        }

        console.log('✅ Successfully toggled seen status');
        return { error: undefined, isSeen: !isSeen };
    } catch (err: any) {
        console.error('❌ Error toggling seen status:', err);
        return { error: err.message };
    }
}

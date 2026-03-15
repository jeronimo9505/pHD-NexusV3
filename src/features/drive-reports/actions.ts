'use server';

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity-log";

const createSchema = z.object({
    title: z.string().min(3, { message: "Title must be at least 3 characters long" }),
    group_id: z.string().uuid({ message: "Invalid group ID" }),
    type: z.enum(['report', 'ppt', 'meeting_note'], { message: "Invalid report type" }),
    drive_file_id: z.string().min(1, { message: "Drive file ID is required" }),
    web_view_link: z.string().url({ message: "Invalid URL" }),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    sections: z.string().optional(), // JSON string
    status: z.enum(['draft', 'generated', 'pending', 'submitted', 'reviewed']).optional(), // Report status
});

export async function createDriveReportAction(formData: FormData) {
    try {
        const supabase = await createClient();

        // Parse sections if provided
        let sectionsData = null;
        const sectionsStr = formData.get('sections');
        if (sectionsStr && typeof sectionsStr === 'string') {
            try {
                sectionsData = JSON.parse(sectionsStr);
            } catch (e) {
                return { error: 'Invalid sections data' };
            }
        }

        const rawData = {
            title: formData.get('title'),
            group_id: formData.get('group_id'),
            type: formData.get('type'),
            web_view_link: formData.get('web_view_link'),
            drive_file_id: formData.get('drive_file_id'),
            start_date: formData.get('start_date') || undefined,
            end_date: formData.get('end_date') || undefined,
            sections: formData.get('sections'),
            status: formData.get('status') || undefined,
        };

        const validation = createSchema.safeParse(rawData);

        if (!validation.success) {
            const firstError = validation.error.issues[0];
            return { error: `${firstError.path.join('.')}: ${firstError.message}` };
        }

        // Check authentication
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
            return { error: 'You must be logged in to create a report' };
        }

        // Insert report
        const { error: insertError } = await supabase.from('drive_reports').insert({
            group_id: validation.data.group_id,
            title: validation.data.title,
            name: validation.data.title, // Populate name alias to satisfy not-null constraint
            type: validation.data.type,
            web_view_link: validation.data.web_view_link,
            drive_file_id: validation.data.drive_file_id,
            author_id: userData.user.id,
            status: validation.data.status || 'draft', // Use provided status or default to 'draft'
            start_date: validation.data.start_date || null,
            end_date: validation.data.end_date || null,
            sections: sectionsData,
        });

        if (insertError) {
            console.error('Create error:', insertError);
            return { error: `Failed to create report: ${insertError.message || insertError.code || 'Unknown error'}` };
        }

        // Log Activity
        await logActivity(validation.data.group_id, 'created', 'report', (validation.data as any).id || '', {
            title: validation.data.title,
            type: validation.data.type
        });

        revalidatePath(`/${validation.data.group_id}/drive-reports`);
        return { success: true };
    } catch (error) {
        console.error('Unexpected error in createDriveReportAction:', error);
        return { error: 'An unexpected error occurred. Please try again.' };
    }
}

export async function deleteDriveReportAction(id: string, groupId: string) {
    try {
        // Validate inputs
        if (!id || !groupId) {
            return { error: 'Invalid parameters' };
        }

        const supabase = await createClient();

        // Check authentication
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
            return { error: 'You must be logged in to delete a report' };
        }

        // Delete report (RLS will ensure user has permission)
        const { error } = await supabase
            .from('drive_reports')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Delete error:', error);
            return { error: 'Failed to delete report. You may not have permission.' };
        }

        revalidatePath(`/${groupId}/drive-reports`);
        return { success: true };
    } catch (error) {
        console.error('Unexpected error in deleteDriveReportAction:', error);
        return { error: 'An unexpected error occurred. Please try again.' };
    }
}

export async function markAsSeenAction(id: string, groupId: string) {
    try {
        // Validate inputs
        if (!id || !groupId) {
            return { error: 'Invalid parameters' };
        }

        const supabase = await createClient();

        // Check authentication
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return { error: 'You must be logged in to mark a report as seen' };
        }

        // Fetch current seen_by
        const { data: report, error: fetchError } = await supabase
            .from('drive_reports')
            .select('seen_by')
            .eq('id', id)
            .single();

        if (fetchError) {
            console.error('Fetch error:', fetchError);
            return { error: 'Failed to fetch report' };
        }

        const currentSeenBy = (report?.seen_by as string[]) || [];

        // Toggle: if already seen, remove; if not seen, add
        const isSeen = currentSeenBy.includes(user.id);
        const newSeenBy = isSeen
            ? currentSeenBy.filter((uid: string) => uid !== user.id)
            : [...currentSeenBy, user.id];

        const { error: updateError } = await supabase
            .from('drive_reports')
            .update({ seen_by: newSeenBy })
            .eq('id', id);

        if (updateError) {
            console.error('Update error:', updateError);
            return { error: 'Failed to update seen status' };
        }

        revalidatePath(`/${groupId}/drive-reports`);
        return { success: true, isSeen: !isSeen };
    } catch (error) {
        console.error('Unexpected error in markAsSeenAction:', error);
        return { error: 'An unexpected error occurred. Please try again.' };
    }
}

// ============================================
// DRAFT WORKFLOW ACTIONS
// ============================================

const draftSchema = z.object({
    title: z.string().min(3, { message: "Title must be at least 3 characters long" }),
    group_id: z.string().uuid({ message: "Invalid group ID" }),
    type: z.enum(['report', 'ppt', 'meeting_note'], { message: "Invalid report type" }),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    sections: z.string().optional(), // JSON string
});

export async function saveDraftAction(formData: FormData) {
    try {
        const supabase = await createClient();

        // Parse sections
        let sectionsData = null;
        const sectionsStr = formData.get('sections');
        if (sectionsStr && typeof sectionsStr === 'string') {
            try {
                sectionsData = JSON.parse(sectionsStr);
            } catch (e) {
                return { error: 'Invalid sections data' };
            }
        }

        const rawData = {
            title: formData.get('title'),
            group_id: formData.get('group_id'),
            type: formData.get('type'),
            start_date: formData.get('start_date') || undefined,
            end_date: formData.get('end_date') || undefined,
            sections: formData.get('sections'),
        };

        const validation = draftSchema.safeParse(rawData);

        if (!validation.success) {
            const firstError = validation.error.issues[0];
            return { error: `${firstError.path.join('.')}: ${firstError.message}` };
        }

        // Check authentication
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
            return { error: 'You must be logged in to create a draft' };
        }

        // Insert draft
        const { data, error: insertError } = await supabase.from('drive_reports').insert({
            group_id: validation.data.group_id,
            title: validation.data.title,
            name: validation.data.title, // Populate name alias to satisfy not-null constraint
            type: validation.data.type,
            author_id: userData.user.id,
            status: 'draft',
            start_date: validation.data.start_date || null,
            end_date: validation.data.end_date || null,
            sections: sectionsData,
            drive_file_id: null,
            web_view_link: null,
        }).select('id').single();

        if (insertError) {
            console.error('Create draft error:', insertError);
            return { error: 'Failed to create draft. Please try again.' };
        }

        revalidatePath(`/${validation.data.group_id}/drive-reports`);
        return { success: true, draftId: data.id };
    } catch (error) {
        console.error('Unexpected error in saveDraftAction:', error);
        return { error: 'An unexpected error occurred. Please try again.' };
    }
}

export async function updateDraftAction(formData: FormData) {
    try {
        const draftId = formData.get('draft_id');
        if (!draftId || typeof draftId !== 'string') {
            return { error: 'Invalid draft ID' };
        }

        const supabase = await createClient();

        // Parse sections
        let sectionsData = null;
        const sectionsStr = formData.get('sections');
        if (sectionsStr && typeof sectionsStr === 'string') {
            try {
                sectionsData = JSON.parse(sectionsStr);
            } catch (e) {
                return { error: 'Invalid sections data' };
            }
        }

        const rawData = {
            title: formData.get('title'),
            group_id: formData.get('group_id'),
            type: formData.get('type'),
            start_date: formData.get('start_date') || undefined,
            end_date: formData.get('end_date') || undefined,
            sections: formData.get('sections'),
        };

        const validation = draftSchema.safeParse(rawData);

        if (!validation.success) {
            const firstError = validation.error.issues[0];
            return { error: `${firstError.path.join('.')}: ${firstError.message}` };
        }

        // Check authentication
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
            return { error: 'You must be logged in to update a draft' };
        }

        // Update draft
        const { error: updateError } = await supabase
            .from('drive_reports')
            .update({
                title: validation.data.title,
                type: validation.data.type,
                start_date: validation.data.start_date || null,
                end_date: validation.data.end_date || null,
                sections: sectionsData,
            })
            .eq('id', draftId)
            .eq('status', 'draft'); // Only update if still a draft

        if (updateError) {
            console.error('Update draft error:', updateError);
            return { error: 'Failed to update draft. Please try again.' };
        }

        revalidatePath(`/${validation.data.group_id}/drive-reports`);
        return { success: true };
    } catch (error) {
        console.error('Unexpected error in updateDraftAction:', error);
        return { error: 'An unexpected error occurred. Please try again.' };
    }
}

export async function generateDocumentAction(formData: FormData) {
    try {
        const draftId = formData.get('draft_id');
        if (!draftId || typeof draftId !== 'string') {
            return { error: 'Invalid draft ID' };
        }

        const supabase = await createClient();

        // Check authentication
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
            return { error: 'You must be logged in to generate a document' };
        }

        // Fetch draft
        const { data: draft, error: fetchError } = await supabase
            .from('drive_reports')
            .select('*')
            .eq('id', draftId)
            .eq('status', 'draft')
            .single();

        if (fetchError || !draft) {
            return { error: 'Draft not found or already generated' };
        }

        // NOTE: Document generation happens on the client side
        // This action just marks the draft as ready for generation
        // The actual Google Docs API call is made from the client
        // After successful generation, the client will call updateDriveReportAction
        // to update the drive_file_id and web_view_link

        return {
            success: true,
            draft: {
                id: draft.id,
                title: draft.title,
                sections: draft.sections,
                type: draft.type,
            }
        };
    } catch (error) {
        console.error('Unexpected error in generateDocumentAction:', error);
        return { error: 'An unexpected error occurred. Please try again.' };
    }
}

// Helper action to update draft with Google Doc info after generation
export async function updateDraftWithDocAction(formData: FormData) {
    try {
        const draftId = formData.get('draft_id');
        const driveFileId = formData.get('drive_file_id');
        const webViewLink = formData.get('web_view_link');

        if (!draftId || typeof draftId !== 'string' ||
            !driveFileId || typeof driveFileId !== 'string' ||
            !webViewLink || typeof webViewLink !== 'string') {
            return { error: 'Missing required parameters' };
        }

        const supabase = await createClient();

        // Check authentication
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
            return { error: 'You must be logged in' };
        }

        // Update draft to pending status with Google Doc info
        const { error: updateError } = await supabase
            .from('drive_reports')
            .update({
                drive_file_id: driveFileId,
                web_view_link: webViewLink,
                status: 'pending',
            })
            .eq('id', draftId);

        if (updateError) {
            console.error('Update draft with doc error:', updateError);
            return { error: 'Failed to update draft. Please try again.' };
        }

        // Get group_id for revalidation
        const { data: report } = await supabase
            .from('drive_reports')
            .select('group_id')
            .eq('id', draftId)
            .single();

        if (report?.group_id) {
            revalidatePath(`/${report.group_id}/drive-reports`);
        }

        return { success: true };
    } catch (error) {
        console.error('Unexpected error in updateDraftWithDocAction:', error);
        return { error: 'An unexpected error occurred. Please try again.' };
    }
}
// Action to update report metadata (Title, Type) for ANY report (draft or generated)
export async function updateReportMetadataAction(formData: FormData) {
    try {
        const reportId = formData.get('report_id');
        const title = formData.get('title');
        const type = formData.get('type');
        const groupId = formData.get('group_id');

        if (!reportId || typeof reportId !== 'string' ||
            !title || typeof title !== 'string' ||
            !type || typeof type !== 'string' ||
            !groupId || typeof groupId !== 'string') {
            return { error: 'Invalid parameters' };
        }

        const supabase = await createClient();

        // Check authentication
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
            return { error: 'You must be logged in to update a report' };
        }

        // Update report
        const { error: updateError } = await supabase
            .from('drive_reports')
            .update({
                title: title,
                type: type,
                // Update name alias too
                name: title
            })
            .eq('id', reportId);

        if (updateError) {
            console.error('Update metadata error:', updateError);
            return { error: 'Failed to update report. Please try again.' };
        }

        revalidatePath(`/${groupId}/drive-reports`);
        return { success: true };
    } catch (error) {
        console.error('Unexpected error in updateReportMetadataAction:', error);
        return { error: 'An unexpected error occurred. Please try again.' };
    }
}
// ============================================
// COMMENT ACTIONS
// ============================================

export async function addCommentAction(reportId: string, content: string, groupId: string) {
    try {
        if (!reportId || !content || !groupId) {
            return { error: 'Invalid parameters' };
        }

        const supabase = await createClient();

        // Check authentication
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return { error: 'You must be logged in to comment' };
        }

        // Insert comment
        const { data, error } = await supabase
            .from('drive_report_comments')
            .insert({
                report_id: reportId,
                author_id: user.id,
                content: content.trim()
            })
            .select()
            .single();

        if (error) {
            console.error('Add comment error:', error);
            return { error: 'Failed to add comment' };
        }

        // Log Activity
        await logActivity(groupId, 'commented', 'report', reportId, {
            comment_id: data.id,
            preview: content.trim().substring(0, 100)
        });

        revalidatePath(`/${groupId}/drive-reports`);
        return { success: true, comment: data };
    } catch (error) {
        console.error('Unexpected error in addCommentAction:', error);
        return { error: 'An unexpected error occurred' };
    }
}

export async function deleteCommentAction(commentId: string, groupId: string) {
    try {
        if (!commentId || !groupId) {
            return { error: 'Invalid parameters' };
        }

        const supabase = await createClient();

        // Check authentication
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return { error: 'You must be logged in to delete a comment' };
        }

        // Delete comment (RLS ensures ownership)
        const { error } = await supabase
            .from('drive_report_comments')
            .delete()
            .eq('id', commentId);

        if (error) {
            console.error('Delete comment error:', error);
            return { error: 'Failed to delete comment. You may not have permission.' };
        }

        revalidatePath(`/${groupId}/drive-reports`);
        return { success: true };
    } catch (error) {
        console.error('Unexpected error in deleteCommentAction:', error);
        return { error: 'An unexpected error occurred' };
    }
}

export async function linkTaskToDriveReportAction(taskId: string, reportId: string, groupId: string) {
    try {
        if (!taskId || !reportId || !groupId) {
            return { error: 'Invalid parameters' };
        }

        const supabase = await createClient();

        // Check if link already exists
        const { data: existingLink } = await supabase
            .from('drive_report_task_links')
            .select('*')
            .eq('task_id', taskId)
            .eq('drive_report_id', reportId)
            .single();

        if (existingLink) {
            return { success: true };
        }

        const { error } = await supabase
            .from('drive_report_task_links')
            .insert({
                task_id: taskId,
                drive_report_id: reportId
            });

        if (error) {
            console.error('Link task error:', error);
            // If duplicate key error (race condition), consider it success
            if (error.code === '23505') return { success: true };
            return { error: 'Failed to link task' };
        }

        revalidatePath(`/${groupId}/drive-reports`);
        return { success: true };
    } catch (error) {
        console.error('Unexpected error linking task:', error);
        return { error: 'An unexpected error occurred' };
    }
}

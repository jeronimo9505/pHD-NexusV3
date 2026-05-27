'use server';

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RegularReport } from "./types";
import { logActivity } from "@/lib/activity-log";

const createReportSchema = z.object({
    group_id: z.string().uuid(),
    week_start: z.string(), // YYYY-MM-DD
    week_end: z.string(),   // YYYY-MM-DD
});

export async function getRegularReportsAction(groupId: string) {
    const supabase = await createClient();

    const { data: reports, error } = await supabase
        .from('reports')
        .select('*, author:profiles!author_id(full_name, avatar_url)')
        .eq('group_id', groupId)
        .order('week_start', { ascending: false });

    if (error) {
        console.error("Error fetching reports:", error);
        return { error: error.message };
    }

    return { data: reports as unknown as RegularReport[] };
}

export async function createRegularReportAction(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const rawData = {
        group_id: formData.get('group_id'),
        week_start: formData.get('week_start'),
        week_end: formData.get('week_end'),
    };

    const validation = createReportSchema.safeParse(rawData);
    if (!validation.success) return { error: validation.error.issues[0].message };

    const { data, error } = await supabase
        .from('reports')
        .insert({
            ...validation.data,
            author_id: user.id
        })
        .select()
        .single();

    if (error) return { error: error.message };

    // Log Activity
    await logActivity(validation.data.group_id, 'created', 'report', data.id, {
        week_start: validation.data.week_start
    });

    // Create default sections
    const defaultSections = ['context', 'experimental', 'findings', 'difficulties', 'nextSteps'];
    const sectionInserts = defaultSections.map(key => ({
        report_id: data.id,
        key,
        content: ''
    }));

    await supabase.from('report_sections').insert(sectionInserts);


    revalidatePath(`/${validation.data.group_id}/reports`);
    return { success: true, report: data };
}

export async function getRegularReportAction(reportId: string) {
    const supabase = await createClient();

    const { data: report, error } = await supabase
        .from('reports')
        .select(`
            *,
            author:profiles!author_id(full_name, avatar_url),
            sections:report_sections(*)
        `)
        .eq('id', reportId)
        .single();

    if (error) {
        return { error: error.message };
    }

    // Sort sections just in case
    if (report.sections) {
        const order = ['context', 'experimental', 'findings', 'difficulties', 'nextSteps'];
        report.sections.sort((a: any, b: any) => order.indexOf(a.key) - order.indexOf(b.key));
    }

    return { data: report as unknown as RegularReport };
}

export async function updateReportSectionAction(reportId: string, key: string, content: string, groupId: string) {
    const supabase = await createClient();

    const { error } = await supabase
        .from('report_sections')
        .update({ content })
        .eq('report_id', reportId)
        .eq('key', key);

    if (error) return { error: error.message };

    revalidatePath(`/${groupId}/reports/${reportId}`);
    return { success: true };
}

export async function updateReportStatusAction(reportId: string, status: 'draft' | 'submitted' | 'reviewed', groupId: string, feedback?: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const updates: any = { status };
    if (status === 'submitted') updates.submitted_at = new Date().toISOString();
    if (status === 'reviewed') {
        updates.reviewed_at = new Date().toISOString();
        if (user) updates.reviewed_by = user.id;
        if (feedback) updates.supervisor_feedback = feedback;
    }

    const { error } = await supabase
        .from('reports')
        .update(updates)
        .eq('id', reportId);

    if (error) return { error: error.message };

    // Log Activity
    await logActivity(groupId, status === 'submitted' ? 'submitted' : 'reviewed', 'report', reportId, {
        feedback_preview: feedback?.substring(0, 100)
    });

    revalidatePath(`/${groupId}/reports/${reportId}`);
    revalidatePath(`/${groupId}/reports`);
    revalidatePath(`/${groupId}/dashboard`);
    return { success: true };
}

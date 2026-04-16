'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createCalendarEventAction(data: {
    groupId: string;
    title: string;
    description?: string;
    location?: string;
    url?: string;
    allDay: boolean;
    startAt: string; // ISO
    endAt: string;   // ISO
    color?: string;
    gcalEventId?: string;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { error, data: created } = await supabase
        .from('calendar_events')
        .insert({
            group_id: data.groupId,
            created_by: user.id,
            title: data.title,
            description: data.description || null,
            location: data.location || null,
            url: data.url || null,
            all_day: data.allDay,
            start_at: data.startAt,
            end_at: data.endAt,
            color: data.color || 'indigo',
            gcal_event_id: data.gcalEventId || null,
        })
        .select()
        .single();

    if (error) return { error: error.message };
    revalidatePath(`/${data.groupId}/calendar`);
    return { success: true, event: created };
}

export async function deleteCalendarEventAction(eventId: string, groupId: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('calendar_events').delete().eq('id', eventId);
    if (error) return { error: error.message };
    revalidatePath(`/${groupId}/calendar`);
    return { success: true };
}

export async function updateCalendarEventAction(
    eventId: string,
    data: {
        groupId: string;
        title: string;
        description?: string;
        location?: string;
        url?: string;
        allDay: boolean;
        startAt: string;
        endAt: string;
        color?: string;
        gcalEventId?: string;
    }
) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { error } = await supabase
        .from('calendar_events')
        .update({
            title: data.title,
            description: data.description || null,
            location: data.location || null,
            url: data.url || null,
            all_day: data.allDay,
            start_at: data.startAt,
            end_at: data.endAt,
            color: data.color || 'indigo',
            gcal_event_id: data.gcalEventId || null,
            updated_at: new Date().toISOString()
        })
        .eq('id', eventId);

    if (error) return { error: error.message };
    revalidatePath(`/${data.groupId}/calendar`);
    return { success: true };
}

export async function getCalendarEventsAction(groupId: string, from: string, to: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('calendar_events')
        .select('*, creator:profiles!created_by(full_name)')
        .eq('group_id', groupId)
        .lte('start_at', to)
        .gte('end_at', from)
        .order('start_at', { ascending: true });

    if (error) return { error: error.message, data: [] };
    return { data: data ?? [] };
}

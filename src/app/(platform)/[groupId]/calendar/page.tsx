import { createClient } from "@/lib/supabase/server";
import { CalendarView } from "@/features/calendar/components/calendar-view";

export default async function CalendarPage({
    params,
}: {
    params: Promise<{ groupId: string }>;
}) {
    const { groupId } = await params;
    const supabase = await createClient();

    const [{ data: group }, { data: tasks }] = await Promise.all([
        supabase.from('groups').select('name, drive_settings').eq('id', groupId).single(),
        supabase
            .from('tasks')
            .select('id, title, due_date, status, priority')
            .eq('group_id', groupId)
            .not('due_date', 'is', null)
            .order('due_date', { ascending: true }),
    ]);

    // Also fetch all tasks with no due date for completeness
    const { data: allTasks } = await supabase
        .from('tasks')
        .select('id, title, due_date, status, priority')
        .eq('group_id', groupId)
        .order('due_date', { ascending: true, nullsFirst: false });

    const driveSettings = group?.drive_settings as any;
    const calendarId = driveSettings?.calendarId ?? null;

    return (
        <div className="h-full overflow-hidden">
            <CalendarView
                groupId={groupId}
                groupName={group?.name || 'Group'}
                calendarId={calendarId}
                driveSettings={driveSettings}
                tasks={allTasks || tasks || []}
            />
        </div>
    );
}

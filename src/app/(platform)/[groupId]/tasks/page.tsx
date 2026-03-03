
import { createClient } from "@/lib/supabase/server";
import { getTasksAction } from "@/features/tasks/actions";
import { CheckSquare } from "lucide-react";
import ClientTasksWrapper from "./client-wrapper";
import { cookies } from "next/headers";

interface PageProps {
    params: Promise<{
        groupId: string;
    }>;
}

export default async function TasksPage({ params }: PageProps) {
    const { groupId } = await params;
    const cookieStore = await cookies();
    const collapsedCookie = cookieStore.get(`kanban-col-state-${groupId}`);
    const initialCollapsedState: Record<string, boolean> = collapsedCookie ? JSON.parse(collapsedCookie.value) : {};

    // Server Fetch
    const response = await getTasksAction(groupId);
    const tasks = response.data;
    const columns = response.columns;
    const error = (response as any).error;

    if (error) {
        return <div className="p-6 text-red-600">Error loading tasks: {error}</div>;
    }

    return (
        // Removed bg-slate-50 to let board background take over. removed padding.
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header - kept for context but can be removed if user wants PURE board */}
            <header className="px-6 py-4 border-b border-gray-200 bg-white flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <CheckSquare className="text-indigo-600" /> Tasks
                    </h1>
                </div>
            </header>

            {/* Main Content (Board) */}
            <div className="flex-1 overflow-hidden relative">
                <ClientTasksWrapper
                    tasks={tasks || []}
                    groupId={groupId}
                    initialColumns={columns || ["todo", "in_progress", "done"]}
                    initialCollapsedState={initialCollapsedState}
                />
            </div>
        </div>
    );
}

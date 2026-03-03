'use client';

import { CheckSquare, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Task {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    due_date: string | null;
}

export function MyPendingTasksWidget({ groupId, tasks }: { groupId: string, tasks: Task[] }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col h-[350px] shadow-sm">
            <div className="flex justify-between items-center mb-4 shrink-0">
                <div className="flex items-center gap-2 text-slate-800">
                    <CheckSquare size={18} className="text-indigo-600" />
                    <h3 className="font-semibold">My Pending Tasks</h3>
                </div>
                {tasks.length > 0 && (
                    <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                        {tasks.length} pending
                    </span>
                )}
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-200">
                {tasks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                        <CheckSquare size={32} className="opacity-20" />
                        <p className="text-sm">You have no pending tasks!</p>
                    </div>
                ) : (
                    tasks.map(task => {
                        const isOverdue = task.due_date && new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0));
                        return (
                            <Link key={task.id} href={`/${groupId}/tasks`} className="block group">
                                <div className="bg-white border text-left border-slate-100 hover:border-indigo-200 rounded-lg p-3 transition-colors shadow-sm flex items-start gap-3">
                                    <div className="mt-0.5">
                                        {task.status === 'in_progress' ? (
                                            <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                                        ) : (
                                            <div className="w-4 h-4 rounded border-2 border-slate-300 group-hover:border-indigo-400 transition-colors" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-700 truncate group-hover:text-indigo-700">{task.title}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            {task.priority && (
                                                <span className={cn(
                                                    "text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md",
                                                    task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                                                        task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                                            task.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                                                                'bg-slate-100 text-slate-600'
                                                )}>
                                                    {task.priority}
                                                </span>
                                            )}
                                            {task.due_date && (
                                                <span className={cn("text-[11px] font-medium flex items-center gap-1", isOverdue ? "text-red-600" : "text-slate-500")}>
                                                    {isOverdue && <AlertCircle size={10} />}
                                                    {new Date(task.due_date).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })
                )}
            </div>

            <div className="pt-3 shrink-0 border-t border-slate-100 mt-2 text-center">
                <Link href={`/${groupId}/tasks`} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                    View all tasks →
                </Link>
            </div>
        </div>
    );
}

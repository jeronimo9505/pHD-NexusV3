'use client';

import { useState } from 'react';
import { DriveReport } from '../types';
import { Eye, CheckSquare, MessageSquare, User, Clock, Trash2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CommentsSection } from './comments-section';
import { TaskForm } from '@/features/tasks/components/task-form';
import { createTaskAction } from '@/features/tasks/actions';
import { linkTaskToDriveReportAction } from '../actions';
import { toast } from 'sonner';

interface ReportCardExpandedProps {
    report: DriveReport;
    expandedSection: 'seen' | 'tasks' | 'comments' | null;
    onToggleSection: (section: 'seen' | 'tasks' | 'comments') => void;
    currentUserId: string;
}

// Helper to format date
function formatDateShort(dateString: string, includeTime = false): string {
    const date = new Date(dateString);
    if (includeTime) {
        return date.toLocaleString('en-US', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    return date.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short'
    });
}

export function ReportCardExpanded({
    report,
    expandedSection,
    onToggleSection,
    currentUserId
}: ReportCardExpandedProps) {
    const [isCreatingTask, setIsCreatingTask] = useState(false);
    const [selectedTask, setSelectedTask] = useState<any | null>(null);

    const handleCreateTask = async (formData: FormData) => {
        const res = await createTaskAction(null, formData);
        if (res?.error) {
            toast.error(res.error);
            return false;
        }
        if (res?.task) {
            const linkRes = await linkTaskToDriveReportAction(res.task.id, report.id, report.group_id);
            if (linkRes.error) {
                toast.error("Task created but failed to link: " + linkRes.error);
            } else {
                toast.success("Task created and linked");
            }
            return true;
        }
        return false;
    };

    // Mock data for now - will be replaced with real data
    const seenDetails = report.seen_by?.map(userId => ({
        id: userId,
        name: userId === currentUserId ? 'You' : 'User',
        date: report.created_at
    })) || [];

    const tasks = report.linked_tasks?.map(link => link.task) || []; // Will integrate with tasks module
    const comments: any[] = []; // Will integrate with comments module

    if (!expandedSection) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-slate-100 bg-slate-50/50 overflow-hidden"
            >
                <div className="p-4">
                    {/* SEEN SECTION */}
                    {expandedSection === 'seen' && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                <Eye className="w-3 h-3" /> Seen by
                            </h4>
                            <div className="flex flex-wrap gap-2 pt-1">
                                {seenDetails.length > 0 ? (
                                    seenDetails.map((detail, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm"
                                        >
                                            <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                                                {detail.name.charAt(0)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-medium text-slate-700 leading-none">
                                                    {detail.name}
                                                </span>
                                                <span className="text-[9px] text-slate-400 leading-none mt-0.5">
                                                    {formatDateShort(detail.date, true)}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-xs text-slate-400 italic">
                                        No one has seen this yet.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TASKS SECTION */}
                    {expandedSection === 'tasks' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                    <CheckSquare className="w-3 h-3" /> Linked Tasks
                                </h4>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsCreatingTask(true);
                                    }}
                                    className="text-xs text-indigo-600 font-bold hover:underline"
                                >
                                    + Add Task
                                </button>
                            </div>

                            <div className="space-y-2">
                                {tasks.length > 0 ? (
                                    tasks.map((task: any) => (
                                        <div
                                            key={task.id}
                                            onClick={() => setSelectedTask(task)}
                                            className="group flex items-start gap-3 p-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-indigo-300 transition-colors cursor-pointer hover:bg-slate-50"
                                        >
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // TODO: Toggle task
                                                }}
                                                className={cn(
                                                    "mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-all",
                                                    task.status === 'done'
                                                        ? "bg-indigo-100 border-indigo-200 text-indigo-600"
                                                        : "border-slate-300 hover:border-indigo-400 text-transparent"
                                                )}
                                            >
                                                <CheckSquare className="w-3.5 h-3.5 fill-current" />
                                            </button>

                                            <div className="flex-1 min-w-0">
                                                <p className={cn(
                                                    "text-xs font-medium truncate",
                                                    task.status === 'done' ? "text-slate-400 line-through" : "text-slate-700"
                                                )}>
                                                    {task.title}
                                                </p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                        <User className="w-2.5 h-2.5" />
                                                        {task.assignees?.[0]?.profile?.full_name || 'Unassigned'}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm('Delete this task?')) {
                                                        // TODO: Delete task
                                                    }
                                                }}
                                                className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-xs text-slate-400 italic">
                                        No tasks linked to this report.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* COMMENTS SECTION */}
                    {expandedSection === 'comments' && (
                        <CommentsSection
                            reportId={report.id}
                            groupId={report.group_id}
                            currentUserId={currentUserId}
                        />
                    )}
                </div>
                {isCreatingTask && (
                    <>
                        <div className="fixed inset-0 bg-black/10 z-40" onClick={(e) => {
                            e.stopPropagation();
                            setIsCreatingTask(false);
                        }} />
                        <TaskForm
                            groupId={report.group_id}
                            onClose={() => setIsCreatingTask(false)}
                            onCreate={handleCreateTask}
                        />
                    </>
                )}
                {selectedTask && (
                    <>
                        <div className="fixed inset-0 bg-black/10 z-40" onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTask(null);
                        }} />
                        <TaskForm
                            task={selectedTask}
                            groupId={report.group_id}
                            onClose={() => setSelectedTask(null)}
                        />
                    </>
                )}
            </motion.div>
        </AnimatePresence>
    );
}

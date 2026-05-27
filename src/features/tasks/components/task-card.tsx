'use client';

import { Task } from '../actions';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Calendar, CheckSquare, MessageSquare } from 'lucide-react';
import { useState } from 'react';

interface TaskCardProps {
    task: Task;
    onClick: () => void;
    onToggleComplete?: (task: Task) => void;
}

export function TaskCard({ task, onClick, onToggleComplete }: TaskCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: task.id, data: { type: 'Task', task } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };

    // Derived State
    const isCompleted = task.status === 'done';
    const completedSubtasks = task.subtasks?.filter(st => st.completed).length || 0;
    const totalSubtasks = task.subtasks?.length || 0;
    const hasLabels = task.due_date || totalSubtasks > 0 || (task.assignees && task.assignees.length > 0);

    const priorityColor = {
        low: 'bg-blue-500',
        medium: 'bg-amber-500',
        high: 'bg-red-500'
    }[task.priority] || 'bg-slate-400';

    const getDueDateStyle = () => {
        if (!task.due_date) return '';
        const due = new Date(task.due_date);
        const now = new Date();
        const diff = (due.getTime() - now.getTime()) / (1000 * 3600 * 24);

        if (diff < 0) return 'bg-red-100 text-red-700 border border-red-200';
        if (diff < 2) return 'bg-amber-100 text-amber-700 border border-amber-200';
        return 'bg-slate-100 text-slate-600';
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        try {
            const isoDate = dateString.split('T')[0];
            const [year, month, day] = isoDate.split('-');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}`;
        } catch (e) {
            return dateString;
        }
    };

    const handleToggleComplete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onToggleComplete) {
            onToggleComplete(task);
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`group relative bg-white p-2 rounded-lg shadow-sm hover:shadow-md cursor-pointer touch-none transition-all border border-slate-200 hover:border-slate-300 ${isCompleted ? 'opacity-75' : ''}`}
        >
            {/* Priority Indicator - Thin left border */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${priorityColor}`} />

            {/* Completion Checkbox - Always visible on left, filled if completed */}
            <button
                onClick={handleToggleComplete}
                className={`absolute top-2 left-2 w-5 h-5 border-2 rounded-sm flex items-center justify-center transition-all shadow-sm z-10 ${isCompleted
                        ? 'bg-emerald-500 border-emerald-500'
                        : isHovered
                            ? 'bg-white border-slate-400 hover:border-emerald-500'
                            : 'bg-white border-slate-300'
                    }`}
                title={isCompleted ? "Mark as incomplete" : "Mark as complete"}
            >
                {isCompleted && <Check size={14} className="text-white font-bold" />}
            </button>

            {/* Title - Compact with left padding, strikethrough if completed */}
            <h4 className={`text-sm text-slate-900 leading-snug pl-7 ${isCompleted ? 'line-through text-slate-500' : ''}`}>
                {task.title}
            </h4>

            {/* Labels Row - Only if has metadata */}
            {hasLabels && (
                <div className="flex flex-wrap items-center gap-1 mt-2">
                    {/* Due Date */}
                    {task.due_date && (
                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${getDueDateStyle()}`}>
                            <Calendar size={10} />
                            <span className="font-medium">{formatDate(task.due_date)}</span>
                        </div>
                    )}

                    {/* Subtasks */}
                    {totalSubtasks > 0 && (
                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${completedSubtasks === totalSubtasks
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                            <CheckSquare size={10} />
                            <span className="font-medium">{completedSubtasks}/{totalSubtasks}</span>
                        </div>
                    )}

                    {/* Comments */}
                    {(task.comments_count || 0) > 0 && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                            <MessageSquare size={10} />
                            <span>{task.comments_count}</span>
                        </div>
                    )}

                    {/* Assignees - Compact */}
                    {task.assignees && task.assignees.length > 0 && (
                        <div className="flex -space-x-1 ml-auto">
                            {task.assignees.slice(0, 3).map((a, i) => (
                                <div
                                    key={a.user_id + i}
                                    className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 border border-white flex items-center justify-center text-[9px] font-bold text-white"
                                    title={a.profile?.full_name}
                                >
                                    {a.profile?.full_name?.charAt(0) || '?'}
                                </div>
                            ))}
                            {task.assignees.length > 3 && (
                                <div className="w-5 h-5 rounded-full bg-slate-200 border border-white flex items-center justify-center text-[8px] font-semibold text-slate-600">
                                    +{task.assignees.length - 3}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

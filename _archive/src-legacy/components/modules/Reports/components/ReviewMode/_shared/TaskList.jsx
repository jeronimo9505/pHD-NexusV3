import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, CheckSquare } from 'lucide-react';
import { formatShortDate } from './reviewModeFormatters';

export default function TaskList({
    tasks = [],
    variant = 'compact', // 'compact' | 'panel'
    title = 'Tareas Vinculadas',
    mode = 'linked', // 'linked' | 'nextSteps'
    initialVisible = 3,
    getTaskHref
}) {
    if (!tasks?.length) return null;

    const isCompact = variant === 'compact';
    const isNextSteps = mode === 'nextSteps';
    const [expanded, setExpanded] = useState(false);

    const normalizedTasks = useMemo(() => {
        return (tasks || []).map((t, idx) => {
            const id = t.id ?? `${idx}`;
            const title = t.title || t.name || 'Tarea';
            const description = t.description || t.details || '';
            const due_date = t.due_date || t.dueDate || null;
            const priority = t.priority || '—';
            const status = t.status || 'open';

            return {
                ...t,
                id,
                title,
                description,
                due_date,
                priority,
                status
            };
        });
    }, [tasks]);

    const visibleTasks = isNextSteps && !expanded ? normalizedTasks.slice(0, initialVisible) : normalizedTasks;
    const hiddenCount = normalizedTasks.length - visibleTasks.length;

    const resolveHref = (task) => {
        if (typeof getTaskHref === 'function') return getTaskHref(task);
        // Default fallback: if app has no task route wiring yet, keep non-breaking.
        return task.url || task.href || null;
    };

    return (
        <div className={clsx('space-y-2', !isCompact && 'mb-6 space-y-3')}>
            <div className={clsx('text-xs font-bold uppercase tracking-wider flex items-center gap-2', isCompact ? 'text-slate-300 pl-2' : 'text-slate-400')}>
                <CheckSquare className="w-3 h-3" /> {title}
            </div>

            {visibleTasks.map((task) => {
                const href = resolveHref(task);
                const Wrapper = href ? 'a' : 'div';

                return (
                <Wrapper
                    key={task.id}
                    href={href || undefined}
                    target={href ? '_blank' : undefined}
                    rel={href ? 'noreferrer' : undefined}
                    className={clsx(
                        'bg-white p-3 rounded-xl border shadow-sm flex items-start gap-2',
                        isCompact ? 'border-emerald-100 hover:shadow-md transition-shadow' : 'border-emerald-100',
                        href && 'hover:border-emerald-200'
                    )}
                    aria-label={href ? `Abrir tarea: ${task.title}` : undefined}
                >
                    <div className="mt-0.5">
                        <div
                            className={clsx(
                                'w-4 h-4 rounded border flex items-center justify-center',
                                task.status === 'done' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                            )}
                        >
                            {task.status === 'done' && <Check className="w-3 h-3 text-white" />}
                        </div>
                    </div>

                    <div className="flex-1 min-w-0">
                        <p className={clsx('truncate', isCompact ? 'text-xs font-bold text-slate-800' : 'text-sm font-medium text-slate-800', task.status === 'done' && !isCompact && 'line-through text-slate-400')}>
                            {task.title}
                        </p>
                        <p className={clsx('truncate mt-1', isCompact ? 'text-[10px] text-slate-400 mt-0' : 'text-xs text-slate-400')}>
                            {formatShortDate(task.due_date)} • {task.priority}
                        </p>

                        {isNextSteps && !isCompact && task.description && (
                            <p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap break-words">
                                {task.description}
                            </p>
                        )}
                    </div>
                </Wrapper>
            );
            })}

            {isNextSteps && normalizedTasks.length > initialVisible && (
                <button
                    type="button"
                    className={clsx(
                        'font-sans text-xs text-slate-500 hover:text-slate-700 transition-colors',
                        !isCompact && 'text-left'
                    )}
                    onClick={() => setExpanded((v) => !v)}
                    aria-label={expanded ? 'Mostrar menos tareas' : `Mostrar ${hiddenCount} tareas más`}
                >
                    {expanded ? 'Mostrar menos' : `Mostrar ${hiddenCount} más`}
                </button>
            )}

            {isCompact && <div className="border-b border-slate-100 my-4" />}
        </div>
    );
}

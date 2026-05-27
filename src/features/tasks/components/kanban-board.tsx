'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
    DndContext,
    DragOverlay,
    useSensor,
    useSensors,
    PointerSensor,
    closestCorners
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { Task, setKanbanStateAction } from '../actions';
import { TaskCard } from './task-card';
import { Plus, GripVertical, MoreHorizontal, X, Check, Trash2, ArrowLeftToLine, ArrowRightToLine, ChevronDown, ChevronRight } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface KanbanBoardProps {
    tasks: Task[];
    groupId: string;
    onTaskClick: (task: Task) => void;
    onTaskMove: (taskId: string, newStatus: string) => void;
    onToggleComplete: (task: Task) => void;
    customColumns?: string[];
    columns: string[];
    onAddColumn: (name: string) => void;
    onColumnRename: (oldName: string, newName: string) => void;
    onColumnReorder: (newOrder: string[]) => void;
    onDeleteColumn: (columnName: string) => void;
    onCreateTask: () => void;
    onCreateTaskInColumn: (columnId: string) => void;
    initialCollapsedState?: Record<string, boolean>;
}

export function KanbanBoard({ tasks, groupId, onTaskClick, onTaskMove, onToggleComplete, columns, onAddColumn, onColumnRename, onColumnReorder, onDeleteColumn, onCreateTask, onCreateTaskInColumn, initialCollapsedState = {} }: KanbanBoardProps) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeType, setActiveType] = useState<'task' | 'column' | null>(null);
    const [columnOrder, setColumnOrder] = useState<string[]>(columns);
    const [collapsedState, setCollapsedState] = useState<Record<string, boolean>>(initialCollapsedState);

    const handleToggleCollapse = async (columnId: string, isCollapsed: boolean) => {
        const newState = { ...collapsedState, [columnId]: isCollapsed };
        setCollapsedState(newState);
        await setKanbanStateAction(groupId, newState);
    };

    // FIX: Use useEffect for side effects, not useMemo
    useEffect(() => {
        setColumnOrder(columns);
    }, [columns]);

    const tasksByColumn = useMemo(() => {
        const group: Record<string, Task[]> = {};
        columnOrder.forEach(col => group[col] = []);
        tasks.forEach(t => {
            // Ensure column exists, otherwise fallback to first column (or ignore if no columns)
            if (columnOrder.length > 0) {
                const status = columnOrder.includes(t.status) ? t.status : columnOrder[0];
                if (!group[status]) group[status] = []; // Should be initialized above, but safety check
                group[status].push(t);
            }
        });
        return group;
    }, [tasks, columnOrder]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 }
        })
    );

    const handleDragStart = (event: any) => {
        const { active } = event;
        setActiveId(active.id);
        const isColumn = columnOrder.includes(active.id);
        setActiveType(isColumn ? 'column' : 'task');
    };

    const handleDragEnd = (event: any) => {
        const { active, over } = event;
        setActiveId(null);
        setActiveType(null);

        if (!over) return;

        // Handle column reordering
        if (activeType === 'column' && active.id !== over.id) {
            const oldIndex = columnOrder.indexOf(active.id);
            const newIndex = columnOrder.indexOf(over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newOrder = arrayMove(columnOrder, oldIndex, newIndex);
                setColumnOrder(newOrder);
                onColumnReorder(newOrder); // Persist to backend
            }
            return;
        }

        const taskId = active.id as string;
        let newStatus = over.id as string;

        // If dropped on a column that is not in the list (shouldn't happen) or dropped on a task
        if (!columnOrder.includes(newStatus)) {
            // If dropped on a task, find that task's column
            const overTask = tasks.find(t => t.id === over.id);
            if (overTask) newStatus = overTask.status;
        }

        const activeTask = tasks.find(t => t.id === taskId);

        if (newStatus && activeTask && activeTask.status !== newStatus) {
            onTaskMove(taskId, newStatus);
        }
    }

    const handleNewGroupClick = () => {
        const name = prompt("Enter new column name:");
        if (name && name.trim()) {
            onAddColumn(name.trim());
        }
    };

    const activeTask = tasks.find(t => t.id === activeId);

    return (
        <DndContext
            id="kanban-dnd-context"
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            collisionDetection={closestCorners}
        >
            <div className="flex h-full w-full overflow-x-auto pb-2 gap-3 items-start">

                <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                    {columnOrder.map(col => (
                        <KanbanColumn
                            key={`${groupId}-${col}`}
                            id={col}
                            groupId={groupId}
                            title={col}
                            tasks={tasksByColumn[col] || []}
                            isCollapsed={collapsedState[col] || false}
                            onToggleCollapse={(val) => handleToggleCollapse(col, val)}
                            onTaskClick={onTaskClick}
                            onToggleComplete={onToggleComplete}
                            onAddCard={() => onCreateTaskInColumn(col)}
                            onRename={(newName) => onColumnRename(col, newName)}
                            onDelete={() => onDeleteColumn(col)}
                        />
                    ))}
                </SortableContext>

                {/* Add Column Button */}
                <div
                    onClick={handleNewGroupClick}
                    className="min-w-[272px] h-fit p-2 flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-white hover:text-white transition-all cursor-pointer shrink-0"
                >
                    <Plus size={16} />
                    <span className="text-sm font-medium">Add another list</span>
                </div>

            </div>

            <DragOverlay>
                {activeId && activeType === 'task' && activeTask ? (
                    <div className="rotate-2 scale-105">
                        <TaskCard task={activeTask} onClick={() => { }} />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

// Sortable Column Component
// Sortable Column Component
function KanbanColumn({ id, title, tasks, onTaskClick, onToggleComplete, onAddCard, onRename, onDelete, groupId, isCollapsed, onToggleCollapse }: {
    id: string;
    groupId: string;
    title: string;
    tasks: Task[];
    isCollapsed: boolean;
    onToggleCollapse: (collapsed: boolean) => void;
    onTaskClick: (task: Task) => void;
    onToggleComplete: (task: Task) => void;
    onAddCard: () => void;
    onRename: (newName: string) => void;
    onDelete: () => void;
}) {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(title);
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Removed local state logic in favor of props from parent

    const { setNodeRef: setDropRef } = useDroppable({ id });
    const {
        attributes,
        listeners,
        setNodeRef: setSortRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getTitle = (t: string) => {
        if (t === 'todo') return 'To Do';
        if (t === 'in_progress') return 'In Progress';
        if (t === 'done') return 'Done';
        return t.charAt(0).toUpperCase() + t.slice(1);
    };

    // Allow renaming/editing for all columns, user can manage their workflow.
    // 'done' generally has special behavior in some apps, but if user wants to rename 'Done' to 'Completed', why not?
    // User requested "delete a list", so we enable menu for all.
    // Maybe block renaming of 'done' if logic explicitly depends on 'done' status string, 
    // but our app logic seems to treat 'done' status specially for completion toggle.
    // Ideally we should warn or block 'done' rename if it breaks completion logic.
    // But 'onColumnRename' in wrapper updates task statuses too. 
    // If we rename 'done' to 'fin', task.status becomes 'fin'. 
    // But 'onToggleComplete' logic checks `task.status === 'done'`.
    // So renaming 'done' will BREAK toggle logic unless we update that logic to check for the LAST column or something.
    // Safe bet: Block renaming/deleting 'done' column for now to prevent breaking core logic.

    const isSystemColumn = id === 'done';
    const isEditableTitle = !isSystemColumn;

    // Update: User asked to "delete a group list". 
    // We should allow deleting any custom list. 
    // 'todo' and 'in_progress' are also effectively custom in this flexible board, but usually 'todo' is default.
    // Let's rely on user discretion but maybe protect 'done'.

    const handleTitleClick = () => {
        if (isSystemColumn) return;
        setIsEditingTitle(true);
        setEditedTitle(getTitle(title));
    };

    const handleTitleSave = () => {
        if (editedTitle.trim() && editedTitle !== getTitle(title)) {
            onRename(editedTitle.trim());
        }
        setIsEditingTitle(false);
    };

    const handleTitleCancel = () => {
        setIsEditingTitle(false);
        setEditedTitle(getTitle(title));
    };

    if (isCollapsed) {
        return (
            <div
                ref={setSortRef}
                style={style}
                className="w-[40px] min-w-[40px] h-fit max-h-full flex flex-col bg-slate-100 rounded-xl shrink-0 border-2 border-slate-200 transition-all cursor-pointer hover:bg-slate-200"
                onClick={() => onToggleCollapse(false)}
            >
                <div className="p-2 flex flex-col items-center gap-4 h-full py-4">
                    <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
                        <GripVertical size={14} className="text-slate-400" />
                    </div>
                    <div className="writing-vertical-rl flex items-center gap-2 text-sm font-bold text-slate-700 whitespace-nowrap tracking-wide" style={{ writingMode: 'vertical-rl' }}>
                        {getTitle(title)}
                        <span className="text-xs font-normal text-slate-500">({tasks.length})</span>
                    </div>
                    <ChevronRight size={16} className="mt-auto text-slate-400" />
                </div>
            </div>
        )
    }

    return (
        <div
            ref={setSortRef}
            style={style}
            className="w-[272px] min-w-[272px] flex flex-col bg-slate-100 rounded-xl max-h-full shrink-0 border-2 border-slate-200"
        >
            {/* Column Header - Draggable */}
            <div className="p-2 flex items-center gap-1.5 group relative">
                <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
                    <GripVertical size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors flex-shrink-0" />
                </div>

                {isEditingTitle ? (
                    <div className="flex-1 flex items-center gap-1">
                        <input
                            autoFocus
                            value={editedTitle}
                            onChange={(e) => setEditedTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleTitleSave();
                                if (e.key === 'Escape') handleTitleCancel();
                            }}
                            className="flex-1 px-1 py-0.5 text-sm font-semibold bg-white border border-indigo-400 rounded outline-none"
                        />
                        <button onClick={handleTitleSave} className="p-0.5 hover:bg-emerald-100 rounded">
                            <Check size={14} className="text-emerald-600" />
                        </button>
                        <button onClick={handleTitleCancel} className="p-0.5 hover:bg-red-100 rounded">
                            <X size={14} className="text-red-600" />
                        </button>
                    </div>
                ) : (
                    <>
                        <h3
                            onClick={handleTitleClick}
                            className={`font-semibold text-slate-800 text-sm flex-1 truncate ${isEditableTitle
                                ? 'cursor-pointer hover:bg-slate-200 px-1 rounded transition-colors'
                                : 'cursor-default'
                                }`}
                            title={isEditableTitle ? 'Click to edit' : getTitle(title)}
                        >
                            {getTitle(title)}
                        </h3>
                        <span className="text-xs font-medium text-slate-500">
                            {tasks.length}
                        </span>

                        <div className="flex items-center gap-1">
                            <button
                                onClick={(e) => { e.stopPropagation(); onToggleCollapse(true); }}
                                className="p-1 hover:bg-slate-200 rounded transition-all text-slate-400 hover:text-slate-700"
                                title="Collapse list"
                            >
                                <ArrowLeftToLine size={14} />
                            </button>

                            <div className="relative">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                                    className="p-1 hover:bg-slate-200 rounded transition-all"
                                >
                                    <MoreHorizontal size={14} className="text-slate-600" />
                                </button>

                                {showMenu && (
                                    <div ref={menuRef} className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-slate-200 z-50 flex flex-col py-1 animate-in fade-in zoom-in-95 duration-100">
                                        <button
                                            onClick={() => { onToggleCollapse(true); setShowMenu(false); }}
                                            className="text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                        >
                                            <ArrowLeftToLine size={14} /> Collapse List
                                        </button>
                                        <button
                                            onClick={() => {
                                                // Trigger rename logic
                                                setIsEditingTitle(true);
                                                setEditedTitle(getTitle(title));
                                                setShowMenu(false);
                                            }}
                                            className="text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                            disabled={!isEditableTitle} // Disable for 'done'
                                        >
                                            <Check size={14} className={!isEditableTitle ? 'text-slate-300' : ''} />
                                            <span className={!isEditableTitle ? 'text-slate-400' : ''}>Rename List</span>
                                        </button>
                                        <div className="h-px bg-slate-100 my-1" />
                                        <button
                                            onClick={() => { onDelete(); setShowMenu(false); }}
                                            className="text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                        >
                                            <Trash2 size={14} /> Delete List
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Tasks Container - Droppable */}
            <div ref={setDropRef} className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5 min-h-[50px]">
                <SortableContext items={tasks.map(t => t.id)}>
                    {tasks.map(task => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onClick={() => onTaskClick(task)}
                            onToggleComplete={onToggleComplete}
                        />
                    ))}
                </SortableContext>

                {tasks.length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-xs">
                        Drop tasks here
                    </div>
                )}
            </div>

            {/* Add Card Button */}
            <div className="p-2">
                <button
                    onClick={onAddCard}
                    className="w-full p-1.5 text-left text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
                >
                    <Plus size={14} />
                    <span>Add a card</span>
                </button>
            </div>
        </div >
    );
}

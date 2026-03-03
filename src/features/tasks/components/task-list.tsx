'use client';

import { useState, useMemo } from 'react';
import { Task, updateTaskAction } from '../actions';
import {
    CheckCircle2,
    CheckSquare,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Calendar,
    User as UserIcon,
    Filter,
    Search,
    X
} from 'lucide-react';
import { toast } from 'sonner';

interface TaskListProps {
    tasks: Task[];
    groupId: string;
    columns: string[];
    onTaskClick: (task: Task) => void;
}

type SortKey = 'title' | 'status' | 'priority' | 'due_date' | 'created_at' | 'assignee';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
    key: SortKey;
    direction: SortDirection;
}

export function TaskList({ tasks, groupId, columns, onTaskClick }: TaskListProps) {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' });
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterPriority, setFilterPriority] = useState<string>('all');
    const [filterAssignee, setFilterAssignee] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Handle sort click
    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Simple optimistic toggle for checkbox
    const handleStatusToggle = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        const newStatus = task.status === 'done' ? 'todo' : 'done';
        const res = await updateTaskAction(task.id, groupId, { status: newStatus });
        if (res.error) toast.error("Failed to update status");
    };

    // Process tasks: Filter -> Sort -> Group (Done at bottom)
    const processedTasks = useMemo(() => {
        let filtered = tasks.filter(t => {
            // Search
            if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            // Status Filter
            if (filterStatus !== 'all' && t.status !== filterStatus) return false;
            // Priority Filter
            if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
            // Assignee Filter (simple check if assignee ID is in list)
            if (filterAssignee !== 'all') {
                const hasAssignee = t.assignees?.some(a => a.user_id === filterAssignee);
                if (!hasAssignee) return false;
            }
            return true;
        });

        // Sorting
        filtered.sort((a, b) => {
            // ALWAYS force 'done' to bottom regardless of sort, unless sorting by status explicitly
            if (sortConfig.key !== 'status') {
                if (a.status === 'done' && b.status !== 'done') return 1;
                if (a.status !== 'done' && b.status === 'done') return -1;
            }

            const modifier = sortConfig.direction === 'asc' ? 1 : -1;

            switch (sortConfig.key) {
                case 'title':
                    return a.title.localeCompare(b.title) * modifier;
                case 'status':
                    return a.status.localeCompare(b.status) * modifier;
                case 'priority': {
                    const priorityWeight = { high: 3, medium: 2, low: 1 };
                    return (priorityWeight[a.priority] - priorityWeight[b.priority]) * modifier;
                }
                case 'due_date':
                    // Handle missing dates (put at end)
                    if (!a.due_date) return 1;
                    if (!b.due_date) return -1;
                    return (new Date(a.due_date).getTime() - new Date(b.due_date).getTime()) * modifier;
                case 'created_at':
                    return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * modifier;
                case 'assignee':
                    // Sort by first assignee name
                    const nameA = a.assignees?.[0]?.profile?.full_name || 'z';
                    const nameB = b.assignees?.[0]?.profile?.full_name || 'z';
                    return nameA.localeCompare(nameB) * modifier;
                default:
                    return 0;
            }
        });

        return filtered;
    }, [tasks, sortConfig, searchQuery, filterStatus, filterPriority, filterAssignee]);

    // Unique assignees for filter
    const uniqueAssignees = useMemo(() => {
        const map = new Map();
        tasks.forEach(t => {
            t.assignees?.forEach(a => {
                map.set(a.user_id, a.profile.full_name);
            });
        });
        return Array.from(map.entries());
    }, [tasks]);

    // Timezone-safe formatting
    const formatDate = (dateString?: string) => {
        if (!dateString) return <span className="text-slate-300">-</span>;
        try {
            const isoDate = dateString.split('T')[0];
            const [year, month, day] = isoDate.split('-');
            return `${day}/${month}/${year}`;
        } catch (e) {
            return dateString;
        }
    };

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <ArrowUpDown size={12} className="ml-1 opacity-20" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={12} className="ml-1 text-indigo-600" />
            : <ArrowDown size={12} className="ml-1 text-indigo-600" />;
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Filters Toolbar */}
            <div className="flex flex-wrap gap-2 items-center bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                <div className="relative w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search tasks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-slate-50 focus:bg-white"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

                <div className="flex items-center gap-2">
                    <Filter size={14} className="text-slate-400" />
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:border-indigo-500 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                        <option value="all">All Lists</option>
                        {columns.map(col => (
                            <option key={col} value={col}>{col}</option>
                        ))}
                    </select>

                    <select
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value)}
                        className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:border-indigo-500 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                        <option value="all">All Priorities</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>

                    <select
                        value={filterAssignee}
                        onChange={(e) => setFilterAssignee(e.target.value)}
                        className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:border-indigo-500 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                        <option value="all">All Assignees</option>
                        {uniqueAssignees.map(([id, name]) => (
                            <option key={id} value={id}>{name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 overflow-y-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 sticky top-0 z-10 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-3 py-2 w-8 bg-slate-50"></th>
                            <th
                                className="px-3 py-2 cursor-pointer hover:bg-slate-100 transition-colors group bg-slate-50"
                                onClick={() => handleSort('title')}
                            >
                                <div className="flex items-center">Title <SortIcon column="title" /></div>
                            </th>
                            <th
                                className="px-3 py-2 w-32 cursor-pointer hover:bg-slate-100 transition-colors group bg-slate-50"
                                onClick={() => handleSort('status')}
                            >
                                <div className="flex items-center">List <SortIcon column="status" /></div>
                            </th>
                            <th
                                className="px-3 py-2 w-28 cursor-pointer hover:bg-slate-100 transition-colors group bg-slate-50"
                                onClick={() => handleSort('priority')}
                            >
                                <div className="flex items-center">Priority <SortIcon column="priority" /></div>
                            </th>
                            <th
                                className="px-3 py-2 w-28 cursor-pointer hover:bg-slate-100 transition-colors group bg-slate-50"
                                onClick={() => handleSort('due_date')}
                            >
                                <div className="flex items-center">Due Date <SortIcon column="due_date" /></div>
                            </th>
                            <th
                                className="px-3 py-2 w-28 cursor-pointer hover:bg-slate-100 transition-colors group bg-slate-50"
                                onClick={() => handleSort('assignee')}
                            >
                                <div className="flex items-center">Assignee <SortIcon column="assignee" /></div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {processedTasks.map(task => (
                            <tr
                                key={task.id}
                                onClick={() => onTaskClick(task)}
                                className={`hover:bg-slate-50 transition-colors cursor-pointer group text-xs ${task.status === 'done' ? 'bg-slate-50/50' : ''}`}
                            >
                                <td className="px-3 py-2">
                                    <button
                                        onClick={(e) => handleStatusToggle(e, task)}
                                        className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${task.status === 'done' ? 'bg-emerald-500 text-white scale-110' : 'border border-slate-300 text-transparent hover:border-emerald-400 hover:bg-emerald-50'}`}
                                    >
                                        <CheckCircle2 size={12} fill="currentColor" className={task.status === 'done' ? 'opacity-100' : 'opacity-0'} />
                                    </button>
                                </td>
                                <td className="px-3 py-2">
                                    <div className="flex flex-col justify-center">
                                        <span className={`font-medium truncate max-w-[300px] ${task.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                            {task.title}
                                        </span>
                                        {task.subtasks?.length > 0 && (
                                            <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                                                <CheckSquare size={10} />
                                                {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-3 py-2">
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border truncate max-w-[120px] ${task.status === 'done' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                        task.status === 'in_progress' || task.status === 'doing' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                            task.status === 'todo' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                                                'bg-indigo-50 text-indigo-600 border-indigo-100'
                                        }`}>
                                        {task.status === 'done' ? 'Done' :
                                            task.status === 'todo' ? 'To Do' :
                                                task.status === 'in_progress' ? 'Doing' :
                                                    task.status}
                                    </span>
                                </td>
                                <td className="px-3 py-2">
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${task.priority === 'high' ? 'bg-red-50 text-red-600' :
                                        task.priority === 'medium' ? 'bg-amber-50 text-amber-600' :
                                            'bg-blue-50 text-blue-600'
                                        }`}>
                                        {task.priority}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-slate-500 font-mono text-[11px]">
                                    {formatDate(task.due_date)}
                                </td>
                                <td className="px-3 py-2">
                                    <div className="flex -space-x-1.5">
                                        {task.assignees?.map((a, i) => (
                                            <div
                                                key={i}
                                                className="w-5 h-5 rounded-full bg-indigo-100 border border-white flex items-center justify-center text-[8px] font-bold text-indigo-700"
                                                title={a.profile?.full_name}
                                            >
                                                {a.profile?.full_name?.charAt(0)}
                                            </div>
                                        ))}
                                        {(!task.assignees || task.assignees.length === 0) && (
                                            <span className="text-slate-300 text-[10px] p-1">-</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {processedTasks.length === 0 && (
                    <div className="p-12 flex flex-col items-center justify-center text-slate-400">
                        <Filter className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm">No tasks match your filters.</p>
                        <button
                            onClick={() => { setSearchQuery(''); setFilterStatus('all'); setFilterPriority('all'); setFilterAssignee('all'); }}
                            className="mt-2 text-xs text-indigo-600 hover:underline"
                        >
                            Clear filters
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

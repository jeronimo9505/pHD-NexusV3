import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History, MessageSquare, CheckSquare, FileText, CheckCircle2, User, FileUp, Eye, MessageCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatDateShort, getDaysSince, formatTime, getWeekLabel } from '@/utils/helpers';
import { supabase } from '@/lib/supabase';
import { MOCK_USERS } from '@/data/mockUsers';
import clsx from 'clsx';

export default function ActivityFeed() {
    const router = useRouter();
    const { setActiveModule, setSelectedReportId, setSelectedTaskId, activeGroupId, userProfile } = useApp();
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchActivity = async () => {
            if (!activeGroupId || !userProfile) return;

            setLoading(true);
            try {
                const { data: reports } = await supabase.from('drive_reports').select('*').eq('group_id', activeGroupId);
                const { data: tasks } = await supabase.from('tasks').select('*').eq('group_id', activeGroupId);

                const reportIds = (reports || []).map(r => r.id);

                const { data: allComments } = await supabase.from('drive_report_comments').select('*');
                const { data: allViews } = await supabase.from('report_views').select('*');

                const groupComments = (allComments || []).filter(c => reportIds.includes(c.drive_report_id));
                const groupViews = (allViews || []).filter(v => reportIds.includes(v.report_id));

                let acts = [];

                (reports || []).forEach(r => {
                    const author = MOCK_USERS.find(u => u.id === r.author_id);
                    const isMe = r.author_id === userProfile.id;
                    const date = r.created_at || r.date;

                    acts.push({
                        id: `rep-create-${r.id}`,
                        type: 'report_create',
                        author: isMe ? 'Tú' : (author?.full_name || 'Alguien'),
                        authorId: r.author_id,
                        content: isMe ? `subiste un nuevo reporte: "${r.title || 'Sin título'}"` : `subió un nuevo reporte: "${r.title || 'Sin título'}"`,
                        date: date,
                        link: { module: 'drive-reports', id: r.id, label: 'Ver Reporte' }
                    });
                });

                groupViews.forEach(v => {
                    const report = reports.find(r => r.id === v.report_id);
                    if (!report) return;

                    const author = MOCK_USERS.find(u => u.id === v.user_id);
                    const isMe = v.user_id === userProfile.id;

                    if (isMe) return;

                    acts.push({
                        id: `rep-seen-${v.id || Math.random()}`,
                        type: 'report_seen',
                        author: isMe ? 'Tú' : (author?.full_name || 'Alguien'),
                        authorId: v.user_id,
                        content: isMe ? `viste el reporte: "${report.title}"` : `marcó como visto el reporte: "${report.title}"`,
                        date: v.viewed_at,
                        link: { module: 'drive-reports', id: v.report_id, label: 'Ver Reporte' }
                    });
                });

                groupComments.forEach(c => {
                    const author = MOCK_USERS.find(u => u.id === c.user_id);
                    const isMe = c.user_id === userProfile.id;
                    const report = reports.find(r => r.id === c.report_id);
                    const snippet = c.content?.length > 30 ? c.content.substring(0, 30) + '...' : c.content;

                    acts.push({
                        id: `rep-com-${c.id}`,
                        type: 'comment',
                        author: isMe ? 'Tú' : (author?.full_name || 'Alguien'),
                        authorId: c.user_id,
                        content: isMe ? `comentaste "${snippet}" en "${report?.title}"` : `comentó "${snippet}" en "${report?.title}"`,
                        date: c.created_at,
                        link: { module: 'drive-reports', id: c.report_id, label: 'Ver Comentario' }
                    });
                });

                const { data: allAssignees } = await supabase.from('task_assignees').select('*');

                (tasks || []).forEach(t => {
                    if (t.created_by === userProfile.id) {
                        acts.push({
                            id: `task-create-${t.id}`,
                            type: 'task',
                            author: 'Tú',
                            authorId: t.created_by,
                            content: `creaste la tarea: "${t.title}"`,
                            date: t.created_at,
                            link: { module: 'tasks', id: t.id, label: 'Ver Tarea' }
                        });
                    } else {
                        const creator = MOCK_USERS.find(u => u.id === t.created_by);
                        const amAssigned = allAssignees?.some(a => a.task_id === t.id && a.user_id === userProfile.id);

                        if (amAssigned) {
                            acts.push({
                                id: `task-assign-${t.id}`,
                                type: 'task',
                                author: creator?.full_name || 'Alguien',
                                authorId: t.created_by,
                                content: `te asignó la tarea: "${t.title}"`,
                                date: t.created_at,
                                link: { module: 'tasks', id: t.id, label: 'Ver Tarea' }
                            });
                        }
                    }
                });

                acts.sort((a, b) => new Date(b.date) - new Date(a.date));
                setActivities(acts);

            } catch (err) {
                console.error("Error loading activity:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchActivity();
    }, [activeGroupId, userProfile]);

    const handleNavigate = (link) => {
        if (!link) return;
        if (link.module === 'drive-reports') {
            setSelectedReportId(link.id); // Context update
            // router.push('/drive-reports'); // If this page existed
            // Assuming '/drive-reports' is the route based on Dashboard.jsx
            router.push('/drive-reports');
        } else if (link.module === 'tasks') {
            setSelectedTaskId(link.id);
            setActiveModule('tasks');
            router.push('/tasks');
        } else if (link.module === 'reports') {
            // Legacy fallback
            router.push('/reports');
        }
    };

    const getIcon = (type, statusType) => {
        switch (type) {
            case 'comment': return <MessageCircle className="w-4 h-4 text-blue-500" />;
            case 'task': return <CheckSquare className="w-4 h-4 text-emerald-500" />;
            case 'report_seen': return <Eye className="w-4 h-4 text-green-500" />;
            case 'report_create': return <FileUp className="w-4 h-4 text-indigo-500" />;
            default: return <History className="w-4 h-4 text-slate-500" />;
        }
    };

    return (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-4 py-2 border-b border-gray-100 bg-slate-50 flex-shrink-0">
                <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-500" /> Actividad Reciente (Grupo)
                </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar min-h-0">
                {activities.map(activity => (
                    <div key={activity.id} className="flex gap-3 items-start group animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100 group-hover:border-indigo-100 transition-colors flex-shrink-0">
                            {getIcon(activity.type, activity.statusType)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700">
                                <span className="font-bold text-slate-900">{activity.author}</span> {activity.content}
                            </p>
                            {activity.link && (
                                <button
                                    onClick={() => handleNavigate(activity.link)}
                                    className="text-xs text-indigo-600 font-bold hover:text-indigo-800 hover:underline mt-1 block truncate bg-indigo-50 px-2 py-1 rounded w-fit"
                                >
                                    {activity.link.label}
                                </button>
                            )}
                            {(() => {
                                const dateStr = activity.date;
                                const isValid = dateStr && !isNaN(new Date(dateStr).getTime());
                                if (!isValid) return <p className="text-[10px] text-slate-400 mt-1">Fecha desconocida</p>;

                                return (
                                    <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                        Hace {getDaysSince(dateStr)} días • {formatDateShort(dateStr)} • {formatTime(dateStr)}
                                    </p>
                                );
                            })()}
                        </div>
                    </div>
                ))}
                {activities.length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-sm italic">
                        {loading ? 'Cargando actividad...' : 'No hay actividad reciente de otros miembros.'}
                    </div>
                )}
            </div>
        </section>
    );
}

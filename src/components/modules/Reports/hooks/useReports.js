import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';

export function useReports(activeGroupId) {
    const {
        reports: rawReports,
        currentUser,
        refreshUserData
    } = useApp();

    const reports = useMemo(() => {
        if (!rawReports) return [];

        let transformed = rawReports.map(r => {
            // Find my view
            const myView = currentUser?.id ? (r.views || []).find(v => v.user_id === currentUser.id) : null;

            // Find context section
            const contextSec = (r.sections || []).find(s => s.key === 'context');

            const normStatus = (s) => {
                const v = (s || 'draft').toString().toLowerCase();
                if (v === 'approved') return 'reviewed';
                return v;
            };

            return {
                id: r.id,
                groupId: r.group_id,
                authorId: r.author_id,
                authorName: r.author?.full_name || 'Desconocido',
                startDate: r.week_start,
                endDate: r.week_end,
                status: normStatus(r.status),
                isImportant: r.is_important || false,
                submittedAt: r.submitted_at,
                reviewedAt: r.reviewed_at,
                reviewedBy: r.reviewer?.full_name,
                supervisorFeedback: r.supervisor_feedback,
                createdAt: r.created_at,
                views: r.views || [],
                mySeenAt: myView?.seen_at || null,
                isSeenByMe: Boolean(myView?.seen_at),
                context: contextSec?.content || '', // Mapped for List View

                // Fields that might be missing if not fully loaded but acceptable for List
                experimental: '',
                findings: '',
                difficulties: '',
                nextSteps: ''
            };
        });

        // Filter based on user role (same logic as before)
        if (currentUser?.id) {
            transformed = transformed.filter(r => r.status !== 'draft' || r.authorId === currentUser.id);
        } else {
            transformed = transformed.filter(r => r.status !== 'draft');
        }

        return transformed.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    }, [rawReports, currentUser]);

    // Actions
    const createReport = async (weekStart, weekEnd) => {
        if (!activeGroupId || !currentUser) return { error: 'Missing data' };

        try {
            const { data, error } = await supabase.from('reports').insert({
                group_id: activeGroupId,
                author_id: currentUser.id,
                week_start: weekStart,
                week_end: weekEnd,
                status: 'draft',
                is_important: false
            }).select().single();

            if (error) return { error };

            const sections = ['context', 'experimental', 'findings', 'difficulties', 'nextSteps'];
            const sectionInserts = sections.map(key => ({
                report_id: data.id,
                key: key,
                content: ''
            }));

            await supabase.from('report_sections').insert(sectionInserts);

            if (refreshUserData) await refreshUserData();
            return { data };
        } catch (err) {
            return { error: err.message };
        }
    };

    const updateReportDates = async (reportId, weekStart, weekEnd) => {
        try {
            const { error } = await supabase.from('reports').update({
                week_start: weekStart,
                week_end: weekEnd
            }).eq('id', reportId);

            if (error) return { error };

            if (refreshUserData) await refreshUserData();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    const deleteReport = async (reportId) => {
        try {
            const { error } = await supabase.from('reports').delete().eq('id', reportId);
            if (error) return { error };

            if (refreshUserData) await refreshUserData();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    return {
        reports,
        loading: !rawReports, // Derived loading
        error: null,
        fetchReports: refreshUserData,
        createReport,
        updateReportDates,
        deleteReport
    };
}

// Keep useReportDetails as is, but maybe fix its internal fetches to be more efficient?
// For now, leaving it as isolated fetch is safer for detail view complexity.
// But we must export it. I'll just copy the previous implementation of useReportDetails below.
// I need key imports from top of original file too.
// Wait, I am replacing the file content.
// I must include `useReportDetails` implementation.

import { useState, useEffect, useCallback, useRef } from 'react';

export function useReportDetails(reportId) {
    const { currentUser } = useApp();
    const [reportMeta, setReportMeta] = useState(null);
    const [sections, setSections] = useState({});
    const [annotations, setAnnotations] = useState([]);
    const [linkedTasks, setLinkedTasks] = useState([]);
    const [completedTasks, setCompletedTasks] = useState([]);
    const [linkedResources, setLinkedResources] = useState([]);
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(false);
    const saveTimeoutRef = useRef(null);

    const fetchReportDetails = useCallback(async () => {
        if (!reportId || !currentUser) return;

        try {
            setLoading(true);

            const { data: report, error: reportError } = await supabase
                .from('reports')
                .select(`
                    *,
                    author:profiles!reports_author_id_fkey(full_name),
                    reviewer:profiles!reports_reviewed_by_fkey(full_name),
                    views:report_views(user_id, seen_at)
                `)
                .eq('id', reportId)
                .single();

            if (reportError) throw reportError;

            if (report) {
                setReportMeta({
                    id: report.id,
                    groupId: report.group_id,
                    authorId: report.author_id,
                    authorName: report.author?.full_name || 'Unknown',
                    currentUserId: currentUser.id,
                    startDate: report.week_start,
                    endDate: report.week_end,
                    status: report.status,
                    isImportant: report.is_important || false,
                    submittedAt: report.submitted_at,
                    reviewedAt: report.reviewed_at,
                    reviewedBy: report.reviewer?.full_name,
                    createdAt: report.created_at,
                    seenBy: report.views?.map(v => ({ id: v.user_id })) || []
                });
            }

            const { data: sectionsData } = await supabase
                .from('report_sections')
                .select('*')
                .eq('report_id', reportId);

            const secMap = {};
            (sectionsData || []).forEach(s => {
                secMap[s.key] = s.content || '';
            });
            setSections(secMap);

            const { data: commentsData } = await supabase
                .from('report_comments')
                .select(`
                    *,
                    author:profiles(full_name, avatar_url)
                `)
                .eq('report_id', reportId)
                .order('created_at', { ascending: true });

            const formattedAnnotations = (commentsData || []).map(c => ({
                id: c.id,
                type: c.type || 'comment',
                section_key: c.section_key,
                sectionKey: c.section_key,
                text: c.quote,
                quote: c.quote,
                content: c.body,
                body: c.body,
                author_id: c.author_id,
                authorName: c.author?.full_name || 'Unknown',
                authorAvatar: c.author?.avatar_url,
                created_at: c.created_at,
                parent_id: c.parent_id,
                thread_id: c.thread_id,
                range_start: c.range_start,
                range_end: c.range_end
            }));

            setAnnotations(formattedAnnotations);
            setComments(formattedAnnotations.filter(a => a.type === 'comment'));

            const { data: tasksData } = await supabase
                .from('report_task_links')
                .select(`
                    task:tasks (
                        *,
                        assignees:task_assignees(user_id)
                    )
                `)
                .eq('report_id', reportId);

            const tasks = (tasksData || []).map(link => link.task).filter(Boolean);
            setLinkedTasks(tasks);
            setCompletedTasks(tasks.filter(t => t.status === 'done'));

            const { data: resourcesData } = await supabase
                .from('report_knowledge_links')
                .select(`
                    item:knowledge_items (*)
                `)
                .eq('report_id', reportId);

            const resources = (resourcesData || []).map(link => link.item).filter(Boolean);
            setLinkedResources(resources);

        } catch (err) {
            console.error('Error fetching report details:', err);
        } finally {
            setLoading(false);
        }
    }, [reportId, currentUser]);

    useEffect(() => {
        fetchReportDetails();
    }, [fetchReportDetails]);

    const updateSection = useCallback((key, content) => {
        setSections(prev => ({ ...prev, [key]: content }));

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(async () => {
            await persistSection(key, content);
        }, 500);
    }, [reportId]);

    const persistSection = async (key, content) => {
        try {
            await supabase.from('report_sections').upsert({
                report_id: reportId,
                key: key,
                content: content
            }, { onConflict: ['report_id', 'key'] });
        } catch (err) {
            console.error('Error saving section:', err);
        }
    };

    const addAnnotation = async (annotationData) => {
        try {
            const payload = {
                report_id: reportId,
                author_id: currentUser.id,
                type: annotationData.type || 'comment',
                section_key: annotationData.section_key || annotationData.sectionKey,
                body: annotationData.content || '',
                quote: annotationData.quote || annotationData.text,
                range_start: annotationData.range_start || 0,
                range_end: annotationData.range_end || 0,
                parent_id: annotationData.parent_id,
                thread_id: annotationData.thread_id,
                resolved: false
            };

            const { data, error } = await supabase
                .from('report_comments')
                .insert(payload)
                .select()
                .single();

            if (error) throw error;
            await fetchReportDetails();
            return { data };
        } catch (err) {
            console.error("Error adding annotation:", err);
            return { error: err.message };
        }
    };

    const deleteAnnotation = async (id) => {
        try {
            const { error } = await supabase
                .from('report_comments')
                .delete()
                .eq('id', id);

            if (error) throw error;
            await fetchReportDetails();
        } catch (err) {
            console.error("Error deleting annotation:", err);
        }
    };

    const updateReportStatus = async (newStatus) => {
        try {
            const updates = { status: newStatus };
            if (newStatus === 'submitted') updates.submitted_at = new Date().toISOString();
            if (newStatus === 'approved' || newStatus === 'reviewed') {
                updates.status = 'reviewed';
                updates.reviewed_at = new Date().toISOString();
                updates.reviewed_by = currentUser.id;
            }

            const { error } = await supabase.from('reports').update(updates).eq('id', reportId);
            if (error) return { error };

            await fetchReportDetails();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    const markAsSeen = async () => {
        if (!currentUser || !reportId) return;
        try {
            await supabase.from('report_views').upsert({
                report_id: reportId,
                user_id: currentUser.id,
                seen_at: new Date().toISOString()
            }, { onConflict: ['report_id', 'user_id'] });
        } catch (err) {
            console.error("Error marking seen:", err);
        }
    };

    return {
        reportMeta,
        sections,
        comments,
        annotations,
        linkedTasks,
        completedTasks,
        linkedResources,
        loading,
        updateSection,
        persistSection,
        addAnnotation,
        deleteAnnotation,
        updateReportStatus,
        markAsSeen,
        refetch: fetchReportDetails
    };
}

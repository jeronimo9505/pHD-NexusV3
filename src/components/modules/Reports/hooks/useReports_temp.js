import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase.from } from '@/lib/supabase';
import { MOCK_USERS } from '@/data/mockUsers';
import { useApp } from '@/context/AppContext';

export function useReports(activeGroupId) {
    const { currentUser } = useApp();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch Reports List
    const fetchReports = useCallback(async () => {
        if (!activeGroupId) return;

        try {
            setLoading(true);
            const { data, error } = await supabase.from.select('reports', {
                eq: { group_id: activeGroupId }
            });

            if (error) throw error;

            // Load sections for preview
            const { data: allSections } = await supabase.from.select('report_sections');
            const { data: allViews } = await supabase.from.select('report_views');

            const normStatus = (s) => {
                const v = (s || 'draft').toString().toLowerCase();
                if (v === 'approved') return 'reviewed';
                return v;
            };

            // Transform DB shape to UI shape
            let transformed = (data || []).map(r => {
                const author = MOCK_USERS.find(u => u.id === r.author_id);
                const reviewer = r.reviewed_by ? MOCK_USERS.find(u => u.id === r.reviewed_by) : null;
                const views = allViews?.filter(v => v.report_id === r.id) || [];

                const myView = currentUser?.id ? views.find(v => v.user_id === currentUser.id) : null;

                // Find context for preview
                const contextSec = allSections?.find(s => s.report_id === r.id && s.key === 'context');

                return {
                    id: r.id,
                    groupId: r.group_id,
                    authorId: r.author_id,
                    authorName: author?.full_name || 'Unknown',
                    startDate: r.week_start,
                    endDate: r.week_end,
                    status: normStatus(r.status),
                    isImportant: r.is_important || false,
                    submittedAt: r.submitted_at,
                    reviewedAt: r.reviewed_at,
                    reviewedBy: reviewer?.full_name,
                    supervisorFeedback: r.supervisor_feedback,
                    createdAt: r.created_at,
                    views: views,
                    mySeenAt: myView?.seen_at || myView?.viewed_at || null,
                    isSeenByMe: Boolean(myView?.seen_at || myView?.viewed_at),

                    // Context for preview
                    context: contextSec?.content || '',

                    // Other sections empty for list view optimization
                    experimental: '',
                    findings: '',
                    difficulties: '',
                    nextSteps: ''
                };
            });

            // Visibility rule: DRAFT only visible to the author.
            if (currentUser?.id) {
                transformed = transformed.filter((r) => r.status !== 'draft' || r.authorId === currentUser.id);
            } else {
                transformed = transformed.filter((r) => r.status !== 'draft');
            }

            // Sort by week_start descending
            transformed.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

            setReports(transformed);
            setError(null);
        } catch (err) {
            console.error('Error fetching reports:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [activeGroupId, currentUser?.id]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    // Create Report
    const createReport = async (weekStart, weekEnd) => {
        if (!activeGroupId || !currentUser) return { error: 'Missing data' };

        try {
            const { data, error } = await supabase.from.insert('reports', {
                group_id: activeGroupId,
                author_id: currentUser.id,
                week_start: weekStart,
                week_end: weekEnd,
                status: 'draft',
                is_important: false
            });

            if (error) return { error };

            // Create empty sections
            const sections = ['context', 'experimental', 'findings', 'difficulties', 'nextSteps'];
            for (const key of sections) {
                await supabase.from.insert('report_sections', {
                    report_id: data.id,
                    key: key,
                    content: ''
                });
            }

            await fetchReports();
            return { data };
        } catch (err) {
            return { error: err.message };
        }
    };

    // Update Report Dates
    const updateReportDates = async (reportId, weekStart, weekEnd) => {
        try {
            const { error } = await supabase.from.update('reports', reportId, {
                week_start: weekStart,
                week_end: weekEnd
            });

            if (error) return { error };

            await fetchReports();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    return {
        reports,
        loading,
        error,
        fetchReports,
        createReport,
        updateReportDates,
        deleteReport: async (reportId) => {
            try {
                // Delete report (cascade should handle sections/tasks if real DB, but for mock we might need manual cleanup or just soft delete. 
                // supabase.from delete is simple removal.)
                const { error } = await supabase.from.delete('reports', reportId);
                if (error) return { error };
                await fetchReports();
                return { error: null };
            } catch (err) {
                return { error: err.message };
            }
        }
    };
}

// Hook for Report Details
export function useReportDetails(reportId) {
    const { currentUser } = useApp();
    const { groupMembers } = useApp();
    const [reportMeta, setReportMeta] = useState(null);
    const [sections, setSections] = useState({});
    const [linkedTasks, setLinkedTasks] = useState([]); // New state
    const [completedTasks, setCompletedTasks] = useState([]);
    const [linkedResources, setLinkedResources] = useState([]); // New state for resources
    const [comments, setComments] = useState([]); // Comments state
    const [annotations, setAnnotations] = useState([]); // Annotations state
    const [views, setViews] = useState([]); // Views state
    const [loading, setLoading] = useState(false);
    const saveTimeoutRef = useRef(null);

    const normStatus = (s) => {
        const v = (s || 'draft').toString().toLowerCase();
        if (v === 'approved') return 'reviewed';
        return v;
    };

    const isSameUserInGroup = (member, userId) => {
        if (!member || !userId) return false;
        // groupMembers are shaped as: { id: userId, name, role, ... }
        return member.id === userId;
    };

    const computeAllMemberUserIds = (members, authorId) => {
        const ids = new Set();
        (members || []).forEach((m) => {
            if (m?.id) ids.add(m.id);
        });
        if (authorId) ids.add(authorId);
        return Array.from(ids);
    };

    const computeSeenState = (members, authorId, viewsRows) => {
        const allIds = computeAllMemberUserIds(members, authorId);
        const views = Array.isArray(viewsRows) ? viewsRows : [];

        const getSeenAt = (userId) => {
            const row = views.find((v) => v?.user_id === userId);
            return row?.seen_at || row?.viewed_at || null;
        };

        const getDecision = (userId) => {
            const row = views.find((v) => v?.user_id === userId);
            return row?.decision || null;
        };

        const seen = [];
        const pending = [];
        allIds.forEach((userId) => {
            const member = (members || []).find((m) => isSameUserInGroup(m, userId));
            const user = MOCK_USERS.find((u) => u.id === userId);
            const name = member?.name || user?.full_name || 'Miembro';
            const seenAt = getSeenAt(userId);
            const decision = getDecision(userId);
            if (seenAt) {
                seen.push({ id: userId, name, seenAt, decision });
            } else {
                pending.push({ id: userId, name });
            }
        });

        // Deterministic ordering
        seen.sort((a, b) => a.name.localeCompare(b.name));
        pending.sort((a, b) => a.name.localeCompare(b.name));

        return { allIds, seen, pending };
    };

    const ensureAuthorSeenRow = async (report) => {
        if (!report?.id || !report?.author_id) return;
        // Author is automatically considered seen.
        await supabase.from.upsert(
            'report_views',
            {
                report_id: report.id,
                user_id: report.author_id,
                // Seen, but no implicit approval. Other members must explicitly approve.
                seen_at: new Date().toISOString(),
                decision: null
            },
            ['report_id', 'user_id']
        );
    };

    const maybeAutoReview = async (report, members, viewsRows) => {
        if (!report?.id) return;
        const status = normStatus(report.status);
        // Only auto-review after it has been submitted.
        if (status !== 'submitted') return;

        // We only require approvals from non-author group members.
        const reviewerIds = (members || [])
            .map((m) => m?.id)
            .filter(Boolean)
            .filter((id) => id !== report.author_id);

        if (reviewerIds.length === 0) return;

        const views = Array.isArray(viewsRows) ? viewsRows : [];
        const allApproved = reviewerIds.every((id) => {
            const row = views.find((v) => v?.user_id === id);
            const decision = (row?.decision || '').toString().toLowerCase();
            return decision === 'approved';
        });

        if (!allApproved) return;

        await supabase.from.update('reports', report.id, {
            status: 'reviewed',
            reviewed_at: new Date().toISOString()
        });
    };

    // Fetch Report Details
    const fetchReportDetails = useCallback(async () => {
        if (!reportId) return;

        try {
            setLoading(true);

            // Get report metadata
            const { data: reportData } = await supabase.from.select('reports');
            const report = reportData?.find(r => r.id === reportId);

            const members = Array.isArray(groupMembers) ? groupMembers : [];

            // Get views early (needed to compute pending/seen and auto-review)
            const { data: viewsDataAll } = await supabase.from.select('report_views', {
                eq: { report_id: reportId }
            });
            const viewsRows = viewsDataAll || [];
            setViews(viewsRows);

            if (report) {
                // Ensure author is auto-seen (idempotent)
                await ensureAuthorSeenRow(report);

                // Auto-transition SUBMITTED -> REVIEWED when all members are seen.
                // note: this is idempotent too.
                await maybeAutoReview(report, members, viewsRows);
            }

            if (report) {
                const author = MOCK_USERS.find(u => u.id === report.author_id);
                const reviewerUser = report.reviewed_by ? MOCK_USERS.find(u => u.id === report.reviewed_by) : null;

                const { seen: seenBy, pending: pendingMembers } = computeSeenState(
                    members,
                    report.author_id,
                    viewsRows
                );

                // Build "reviewers" from the union of:
                // - group members
                // - report author (may not be part of groupMembers in some setups)
                // - any users that appear in report_views (to avoid dropping decisions)
                const userIdsFromViews = (viewsRows || [])
                    .map((v) => v?.user_id)
                    .filter(Boolean);

                const reviewerIds = Array.from(
                    new Set([
                        ...(members || []).map((m) => m?.id).filter(Boolean),
                        report.author_id,
                        ...userIdsFromViews
                    ])
                ).filter(Boolean);

                const reviewers = reviewerIds.map((userId) => {
                    const member = (members || []).find((m) => m?.id === userId);
                    const user = MOCK_USERS.find((u) => u.id === userId);
                    const row = (viewsRows || []).find((v) => v?.user_id === userId);

                    const seenAt = row?.seen_at || row?.viewed_at || null;
                    const decision = row?.decision || null;
                    const status = decision ? decision : (seenAt ? 'seen' : 'pending');

                    return {
                        id: userId,
                        name: member?.name || user?.full_name || 'Miembro',
                        role: member?.role || user?.role || null,
                        status,
                        seenAt,
                        decision,
                        decisionAt: decision ? seenAt : null
                    };
                });

                // Stable, deterministic ordering by name.
                reviewers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

                setReportMeta({
                    id: report.id,
                    groupId: report.group_id,
                    authorId: report.author_id,
                    authorName: author?.full_name || 'Unknown',
                    currentUserId: currentUser?.id || null,
                    startDate: report.week_start,
                    endDate: report.week_end,
                    status: normStatus(report.status),
                    isImportant: report.is_important || false,
                    submittedAt: report.submitted_at,
                    reviewedAt: report.reviewed_at,
                    reviewedById: report.reviewed_by,
                    reviewedByName: reviewerUser?.full_name,
                    supervisorFeedback: report.supervisor_feedback,
                    createdAt: report.created_at,
                    reviewers,
                    seenBy,
                    pendingMembers
                });
            }

            // Get sections
            const { data: sectionsData } = await supabase.from.select('report_sections');
            const reportSections = sectionsData?.filter(s => s.report_id === reportId) || [];

            const secMap = {};
            reportSections.forEach(s => {
                secMap[s.key] = s.content || '';
            });

            setSections(secMap);

            // Get linked tasks
            const { data: tasksData } = await supabase.from.select('tasks', {
                eq: { report_id: reportId }
            });
            setLinkedTasks(tasksData || []);

            // Get Completed Tasks (In Period)
            if (report) {
                const { data: allTasks } = await supabase.from.select('tasks', { eq: { group_id: report.group_id } });
                const { data: allAssignees } = await supabase.from.select('task_assignees');

                const pStart = new Date(report.week_start);
                const pEnd = new Date(report.week_end);
                pEnd.setHours(23, 59, 59, 999);

                const cTasks = (allTasks || []).filter(t => {
                    const cDate = t.completed_at ? new Date(t.completed_at) : null;
                    if (t.status !== 'done' || !cDate) return false;

                    if (cDate < pStart || cDate > pEnd) return false;

                    const assignees = (allAssignees || []).filter(a => a.task_id === t.id);
                    const isAssignee = assignees.some(a => a.user_id === report.author_id);
                    const isCreator = t.created_by === report.author_id;
                    const isCompleter = t.completed_by === report.author_id;

                    return isAssignee || isCreator || isCompleter;
                });
                setCompletedTasks(cTasks);
            }

            // Get comments
            const { data: commentsData } = await supabase.from.select('report_comments', {
                eq: { report_id: reportId }
            });

            // Enrich comments with author names
            const enrichedComments = (commentsData || []).map(c => {
                const author = MOCK_USERS.find(u => u.id === c.author_id);
                return {
                    ...c,
                    author: author?.full_name || 'Unknown',
                    date: c.created_at,
                    text: c.content // Map content to text for UI
                };
            });

            setComments(enrichedComments);

            // Get linked resources
            const { data: reportResources } = await supabase.from.select('report_resources', {
                eq: { report_id: reportId }
            });

            if (reportResources && reportResources.length > 0) {
                const { data: allKnowledge } = await supabase.from.select('knowledge_items');
                const enrichedResources = reportResources.map(rr => {
                    const item = allKnowledge?.find(k => k.id === rr.resource_id);
                    return item ? { ...item, linkId: rr.id } : null;
                }).filter(Boolean);
                setLinkedResources(enrichedResources);
            } else {
                setLinkedResources([]);
            }

            // Get annotations
            const { data: annotationsData } = await supabase.from.select('report_annotations', {
                eq: { report_id: reportId }
            });

            const enrichedAnnotations = (annotationsData || []).map(a => {
                const author = MOCK_USERS.find(u => u.id === a.author_id);
                return {
                    ...a,
                    author: author?.full_name || 'Unknown',
                    text: a.content || a.quote // Ensure text property exists for UI
                };
            });

            setAnnotations(enrichedAnnotations || []);

            // views already loaded above

        } catch (err) {
            console.error('Error fetching report details:', err);
        } finally {
            setLoading(false);
        }
    }, [reportId, groupMembers]);

    useEffect(() => {
        fetchReportDetails();
    }, [fetchReportDetails]);

    // Update Section (with debounce)
    // Update Section (with debounce)
    const updateSection = useCallback((key, content) => {
        // Update local state immediately
        setSections(prev => ({ ...prev, [key]: content }));

        // Debounce save to DB
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(async () => {
            await persistSection(key, content);
        }, 500);
    }, [reportId]);

    // Persist Section immediately
    const persistSection = async (key, content) => {
        try {
            await supabase.from.upsert('report_sections', {
                report_id: reportId,
                key: key,
                content: content
            }, ['report_id', 'key']);
        } catch (err) {
            console.error('Error saving section:', err);
        }
    };

    // Update Report Status
    const updateReportStatus = async (newStatus) => {
        try {
            // Check RAW status first primarily for decisions (approved/changes_requested)
            // Decisions are user-level actions, not report-level status changes.
            const rawStatus = (newStatus || '').toLowerCase();

            // 1. Handle Reviewer Decisions
            if (rawStatus === 'approved' || rawStatus === 'changes_requested') {
                if (!currentUser?.id) return { error: { message: 'Missing user' } };

                const decision = rawStatus === 'approved' ? 'approved' : 'changes_requested';
                const now = new Date().toISOString();

                await supabase.from.upsert('report_views', {
                    report_id: reportId,
                    user_id: currentUser.id,
                    seen_at: now,
                    decision
                }, ['report_id', 'user_id']);

                // After updating my decision, check if we can auto-review.
                const { data: reportData } = await supabase.from.select('reports');
                const report = reportData?.find((r) => r.id === reportId);
                const members = Array.isArray(groupMembers) ? groupMembers : [];
                const { data: viewsNow } = await supabase.from.select('report_views', {
                    eq: { report_id: reportId }
                });
                if (report) {
                    await ensureAuthorSeenRow(report);
                    await maybeAutoReview(report, members, viewsNow || []);
                }

                await fetchReportDetails();
                return { error: null };
            }

            // 2. Handle Global Status Changes (submitted, reviewed, draft)
            const statusNorm = normStatus(newStatus);
            const updates = { status: statusNorm };

            if (statusNorm === 'submitted') {
                updates.submitted_at = new Date().toISOString();
            }

            const { error } = await supabase.from.update('reports', reportId, updates);

            if (error) return { error };

            // When submitting, author should be automatically marked as seen.
            if (statusNorm === 'submitted') {
                const { data: reportData } = await supabase.from.select('reports');
                const report = reportData?.find((r) => r.id === reportId);
                if (report) {
                    await ensureAuthorSeenRow(report);
                }
            }

            await fetchReportDetails();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    // Update Supervisor Feedback
    const updateSupervisorFeedback = async (feedback) => {
        try {
            const { error } = await supabase.from.update('reports', reportId, {
                supervisor_feedback: feedback,
                reviewed_at: new Date().toISOString(),
                reviewed_by: currentUser?.id
            });

            if (error) return { error };

            await fetchReportDetails();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    // Add Comment
    const addComment = async (sectionKey, text) => {
        try {
            const { error } = await supabase.from.insert('report_comments', {
                report_id: reportId,
                section_key: sectionKey,
                content: text,
                author_id: currentUser?.id,
                created_at: new Date().toISOString()
            });

            if (error) return { error };

            await fetchReportDetails();
            return { error: null };
        } catch (err) {
            return { error: err.message };
        }
    };

    // Add Annotation
    const addAnnotation = async (annotationData) => {
        try {
            const { error } = await supabase.from.insert('report_annotations', annotationData);
            if (error) console.error(error);
            await fetchReportDetails();
            return { error };
        } catch (err) {
            console.error(err);
            return { error: err.message };
        }
    };

    // Delete Annotation
    const deleteAnnotation = async (id) => {
        try {
            const { error } = await supabase.from.delete('report_annotations', id);
            if (error) console.error(error);
            await fetchReportDetails();
        } catch (err) {
            console.error(err);
        }
    };


    // Link Task
    const linkTask = async (taskId) => {
        try {
            const { error } = await supabase.from.update('tasks', taskId, { report_id: reportId });
            if (error) console.error(error);
            await fetchReportDetails();
        } catch (err) {
            console.error(err);
        }
    };

    // Unlink Task
    const unlinkTask = async (taskId) => {
        try {
            // Update task to remove report_id
            const { error } = await supabase.from.update('tasks', taskId, { report_id: null });
            if (error) console.error(error);
            await fetchReportDetails();
        } catch (err) {
            console.error(err);
        }
    };

    // Link Resource
    const linkResource = async (resourceId) => {
        try {
            const { error } = await supabase.from.insert('report_resources', {
                report_id: reportId,
                resource_id: resourceId
            });
            if (error) console.error(error);
            await fetchReportDetails();
        } catch (err) {
            console.error(err);
        }
    };

    // Unlink Resource
    const unlinkResource = async (resourceId) => {
        try {
            // report_resources might not key by resourceId directly if generic, but usually we need the link ID.
            // For simplicity, let's find the link ID first OR delete by query. 
            // supabase.from delete expects ID. Let's assume we pass the RESOURCE ID and we find the link(s).

            const { data: links } = await supabase.from.select('report_resources', {
                eq: { report_id: reportId, resource_id: resourceId }
            });

            if (links && links.length > 0) {
                for (const link of links) {
                    await supabase.from.delete('report_resources', link.id);
                }
            }

            await fetchReportDetails();
        } catch (err) {
            console.error(err);
        }
    };

    // Mark as Seen
    const markAsSeen = async () => {
        if (!currentUser) return;

        try {
            // Upsert to enforce uniqueness on (report_id, user_id) in the mock layer.
            // This mirrors a real DB unique constraint and avoids duplicates.
            const { error } = await supabase.from.upsert('report_views', {
                report_id: reportId,
                user_id: currentUser.id,
                seen_at: new Date().toISOString()
            }, ['report_id', 'user_id']);

            if (error) console.error(error);

            // After marking seen, check if we can auto-review.
            const { data: reportData } = await supabase.from.select('reports');
            const report = reportData?.find((r) => r.id === reportId);

            const members = Array.isArray(groupMembers) ? groupMembers : [];
            const { data: viewsNow } = await supabase.from.select('report_views', {
                eq: { report_id: reportId }
            });

            if (report) {
                await maybeAutoReview(report, members, viewsNow || []);
            }

            await fetchReportDetails();
        } catch (err) {
            console.error(err);
        }
    };

    return {
        reportMeta,
        sections,
        loading,
        updateSection,
        persistSection,
        updateReportStatus,
        updateSupervisorFeedback,
        addComment,
        addAnnotation,
        deleteAnnotation,
        linkedTasks,
        completedTasks,
        linkedResources,
        comments,
        annotations,
        linkTask,
        unlinkTask,
        linkResource,
        unlinkResource,
        views,
        markAsSeen,
        refetch: fetchReportDetails
    };
}

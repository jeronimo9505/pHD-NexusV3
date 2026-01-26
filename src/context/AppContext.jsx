'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
// import { mockDB } from '../lib/mockDatabase';
// import { MOCK_USERS } from '../data/mockUsers';
// import { MOCK_GROUPS, MOCK_GROUP_MEMBERS, getGroupsByUserId, getUserRoleInGroup } from '../data/mockGroups';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    // -------------------------------------------------------------------------
    // 1. STATE DEFINITIONS
    // -------------------------------------------------------------------------
    const [tasks, setTasks] = useState([]);
    const [knowledge, setKnowledge] = useState([]);
    const [groupMembers, setGroupMembers] = useState([]);
    const [reports, setReports] = useState([]);
    const [driveReports, setDriveReports] = useState([]); // NEW: Drive Reports State
    const [groups, setGroups] = useState([]);

    const [activities, setActivities] = useState([]);
    const [announcements, setAnnouncements] = useState([]); // NEW: Announcements

    // Auth & User Context
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);

    // Group Context
    const [activeGroupId, setActiveGroupId] = useState(null);

    // Load activeGroupId from localStorage on mount (prevents Hydration error)
    useEffect(() => {
        const saved = window.localStorage.getItem('phd_nexus_activeGroupId');
        if (saved) setActiveGroupId(saved);
    }, []);

    // Module & UI State
    const [activeModule, setActiveModule] = useState('dashboard');
    const [selectedReportId, setSelectedReportId] = useState(null);
    const [selectedTaskId, setSelectedTaskId] = useState(null);
    const [isEditingReport, setIsEditingReport] = useState(false);
    const [userRole, setUserRole] = useState('student');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Left sidebar visibility

    // Derived State
    const activeGroup = groups.find(g => g.id === activeGroupId) || null;
    const availableSupervisors = groupMembers.filter(m =>
        m.role === 'supervisor' || m.role === 'labmanager'
    );

    // -------------------------------------------------------------------------
    // 2. LOGIC & EFFECTS
    // -------------------------------------------------------------------------

    // Basic RBAC Hierarchy
    const ROLE_HIERARCHY = {
        'admin': 4,
        'pi': 3,
        'labmanager': 3,
        'postdoc': 2,
        'student': 1,
        'guest': 0
    };

    const hasRole = (requiredRole) => {
        if (!currentUser || !requiredRole) return false;
        const currentLevel = ROLE_HIERARCHY[userRole] || 0;
        const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
        return currentLevel >= requiredLevel;
    };

    const addActivity = (activity) => {
        setActivities(prev => [
            {
                id: Math.random().toString(36).substr(2, 9),
                timestamp: new Date().toISOString(),
                ...activity
            },
            ...prev
        ].slice(0, 50));
    };

    const loadUserData = React.useCallback(async (userId) => {
        if (!userId) return;

        try {
            // 1. Get User Groups from Supabase
            const { data: memberships, error: memError } = await supabase
                .from('group_members')
                .select('group_id, role, status')
                .eq('user_id', userId)
                .eq('status', 'active');

            if (memError) {
                console.error("Error loading memberships:", memError);
                setGroups([]);
                setTasks([]);
                setReports([]);
                setKnowledge([]);
                setGroupMembers([]);
                return;
            }

            const groupIds = (memberships || []).map(m => m.group_id);

            let userGroups = [];
            if (groupIds.length > 0) {
                const { data: allGroups, error: groupsError } = await supabase
                    .from('groups')
                    .select('*')
                    .in('id', groupIds);

                if (groupsError) {
                    console.error("Error loading groups:", groupsError);
                } else {
                    console.log("[AppContext] Loaded Groups:", allGroups?.map(g => ({ id: g.id, name: g.name, drive_settings: g.drive_settings })));
                    userGroups = allGroups || [];
                }
            }

            setGroups(prev => {
                if (JSON.stringify(prev) === JSON.stringify(userGroups)) return prev;
                return userGroups;
            });

            // 2. Determine Active Group
            let currentGroupId = activeGroupId;
            if (!currentGroupId || !userGroups.find(g => g.id === currentGroupId)) {
                currentGroupId = userGroups.length > 0 ? userGroups[0].id : null;
                if (currentGroupId !== activeGroupId) {
                    setActiveGroupId(currentGroupId);
                    return;
                }
            }

            if (currentGroupId && memberships && memberships.length > 0) {
                // 3. Get Role in Active Group
                const membership = memberships.find(m => m.group_id === currentGroupId);
                const role = membership?.role || 'student';
                setUserRole(role);

                // 4. Load Group Data from Supabase
                const [tasksRes, reportsRes, knowledgeRes, membersRes, driveReportsRes, announcementsRes] = await Promise.all([
                    supabase.from('tasks')
                        .select(`
                            *,
                            assignees:task_assignees(*),
                            comments:task_comments(*),
                            report_limits:report_task_links(*),
                            drive_links:drive_report_task_links(*)
                        `)
                        .eq('group_id', currentGroupId),
                    supabase.from('reports')
                        .select(`
                            *,
                            author:profiles!reports_author_id_fkey(full_name),
                            reviewer:profiles!reports_reviewed_by_fkey(full_name),
                            views:report_views(user_id, seen_at),
                            sections:report_sections(key, content)
                        `)
                        .eq('group_id', currentGroupId),
                    supabase.from('knowledge_items')
                        .select(`
                            *,
                            comments:knowledge_comments(
                                id,
                                text,
                                created_at,
                                author:profiles(full_name)
                            )
                        `)
                        .eq('group_id', currentGroupId)
                        .order('created_at', { ascending: false }),
                    supabase.from('group_members').select('*, profiles(*)').eq('group_id', currentGroupId),
                    supabase.from('drive_reports')
                        .select(`
                            *,
                            comments:drive_report_comments(*, author:profiles(full_name)),
                            task_links:drive_report_task_links(*),
                            views:drive_report_views(user_id, viewed_at)
                        `)
                        .eq('group_id', currentGroupId),
                    supabase.from('announcements')
                        .select('*, author:profiles(full_name), comments:announcement_comments(*, author:profiles(full_name))')
                        .eq('group_id', currentGroupId)
                        .order('created_at', { ascending: false })
                ]);

                const members = (membersRes.data || []).map(m => ({
                    ...(m.profiles || {}),
                    role: m.role,
                    joinedAt: m.created_at,
                    full_name: m.profiles?.full_name || 'Sin nombre',
                    email: m.profiles?.email,
                    user_id: m.profiles?.id // Explicit user_id for easier searching
                }));
                setGroupMembers(members);

                const allTasksList = tasksRes.data || [];
                setTasks(allTasksList);
                setReports(reportsRes.data || []);
                setKnowledge(knowledgeRes.data || []);
                setAnnouncements(announcementsRes.data || []);

                // Map drive_reports snake_case back to camelCase for UI if needed
                const loadedDriveReports = (driveReportsRes.data || []).map(r => {
                    // Link tasks by IDs from task_links
                    const relatedTaskIds = (r.task_links || []).map(tl => tl.task_id);
                    const relatedTasks = allTasksList.filter(t => relatedTaskIds.includes(t.id));

                    // Map seen_by from views table now
                    // We want { name, date } objects
                    const seenDetails = (r.views || []).map(v => {
                        const member = members.find(m => m.user_id === v.user_id || m.id === v.user_id);
                        return {
                            id: v.user_id,
                            name: member?.full_name || 'Usuario',
                            date: v.viewed_at
                        };
                    });

                    // For backward compatibility (or simplicity in some UI parts), 
                    // we can keep seenByNames as string array, but it's better to pass full object
                    const seenByNames = seenDetails.map(d => d.name);
                    const seenByIds = seenDetails.map(d => d.id);

                    return {
                        ...r,
                        webViewLink: r.web_view_link,
                        driveFileId: r.drive_file_id,
                        isImportant: r.is_important,
                        startDate: r.start_date,
                        endDate: r.end_date,
                        authorName: r.author_name,
                        // Ensure comments and tasks are available for UI
                        comments: (r.comments || []).map(c => ({
                            ...c,
                            content: c.body, // Aliasing body to content as UI expects it
                            user_name: c.author?.full_name || 'Usuario'
                        })),
                        tasks: relatedTasks,
                        seenByNames,
                        seenDetails,
                        seen_by: seenByIds
                    };
                });
                setDriveReports(loadedDriveReports);

            } else {
                setUserRole('student');
                setTasks([]);
                setReports([]);
                setKnowledge([]);
                setGroupMembers([]);
            }
        } catch (err) {
            console.error("Error loading user data:", err);
            setGroups([]);
            setTasks([]);
            setReports([]);
            setKnowledge([]);
            setGroupMembers([]);
        }
    }, [activeGroupId]);

    // Auth Listener
    useEffect(() => {
        const checkAuth = async () => {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();

            if (session?.user) {
                const user = session.user;
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                const enrichedUser = { ...user, ...profile };
                setCurrentUser(enrichedUser);
                setIsAuthenticated(true);
                await loadUserData(user.id);
            } else {
                setIsAuthenticated(false);
                setCurrentUser(null);
            }
            setLoading(false);
        };
        checkAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                setCurrentUser({ ...session.user, ...profile });
                setIsAuthenticated(true);
            } else {
                setCurrentUser(null);
                setIsAuthenticated(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []); // Run only once on mount to prevent auth signal abortion

    // Reload data when active group changes
    useEffect(() => {
        if (currentUser && activeGroupId) {
            loadUserData(currentUser.id);
            window.localStorage.setItem('phd_nexus_activeGroupId', activeGroupId);
        }
    }, [activeGroupId, currentUser, loadUserData]);


    // Auth Actions
    const login = async (email, password) => {
        try {
            console.log('🔐 Login attempt:', { email, password: password ? '***' : 'EMPTY' });
            setLoading(true);
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            console.log('🔐 Supabase response:', { data: data ? 'OK' : 'NO DATA', error });
            if (error) throw error;

            if (data.session) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', data.session.user.id)
                    .single();

                setCurrentUser({ ...data.session.user, ...profile });
                setIsAuthenticated(true);
                await loadUserData(data.session.user.id);
            }
            setLoading(false);
            return { success: true };
        } catch (err) {
            console.error('🔐 Login error:', err);
            setLoading(false);
            return { success: false, error: err.message };
        }
    };

    const register = async (regData) => {
        try {
            setLoading(true);
            const { data, error } = await supabase.auth.signUp({
                email: regData.email,
                password: regData.password,
                options: {
                    data: {
                        full_name: regData.full_name
                    }
                }
            });
            if (error) throw error;

            if (data.user) {
                // Wait for trigger to create profile
                await new Promise(resolve => setTimeout(resolve, 500));

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();

                const enrichedUser = { ...data.user, ...profile };
                setCurrentUser(enrichedUser);
                setIsAuthenticated(true);
                await loadUserData(data.user.id);
                setLoading(false);
                return { success: true, user: enrichedUser };
            }
            setLoading(false);
            return { success: false, error: 'Registration failed' };
        } catch (err) {
            setLoading(false);
            return { success: false, error: err.message };
        }
    };

    const requestPasswordReset = async (email) => {
        try {
            setLoading(true);
            const redirectUrl = window.location.hostname === 'localhost'
                ? `${window.location.origin}/reset-password`
                : 'https://phdnexus2.vercel.app/reset-password';

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: redirectUrl,
            });
            if (error) {
                console.error("❌ Supabase Reset Error:", error);
                throw error;
            }
            setLoading(false);
            return { success: true };
        } catch (err) {
            console.error("❌ Reset Request Error:", err);
            setLoading(false);
            return { success: false, error: err.message };
        }
    };

    const updatePassword = async (newPassword) => {
        try {
            setLoading(true);
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) {
                console.error("❌ Supabase Update Error:", error);
                throw error;
            }
            setLoading(false);
            return { success: true };
        } catch (err) {
            setLoading(false);
            return { success: false, error: err.message };
        }
    };

    const logout = async () => {
        try {
            await supabase.auth.signOut();
            setIsAuthenticated(false);
            setCurrentUser(null);
            setGroups([]);
            setTasks([]);
            setReports([]);
            if (typeof window !== 'undefined') {
                window.localStorage.removeItem('phd_nexus_activeGroupId');
                window.location.href = '/login';
            }
        } catch (e) {
            console.error("Logout error:", e);
        }
    };

    const value = {
        // Auth
        isAuthenticated,
        login,
        logout,
        register,
        requestPasswordReset,
        updatePassword,
        currentUser,
        userProfile: currentUser,
        realUser: currentUser,
        loading,

        // Data State
        tasks, setTasks,
        tasks, setTasks,
        reports, setReports,
        driveReports, setDriveReports, // Export State
        knowledge, setKnowledge,
        groupMembers,
        groups, setGroups,
        activeGroupId, setActiveGroupId,
        activeGroup,

        // UI State
        activeModule, setActiveModule,
        userRole, setUserRole,
        selectedReportId, setSelectedReportId,
        selectedTaskId, setSelectedTaskId,
        isEditingReport, setIsEditingReport,
        isSidebarOpen, setIsSidebarOpen, // Added
        availableSupervisors,

        // Helpers
        isPending: currentUser?.status === 'pending',
        canAccessAdminPanel: currentUser?.system_role === 'admin',
        activities, setActivities,
        addActivity,
        refreshUserData: () => loadUserData(currentUser?.id),
        // updateGroupConfig deprecated - check updateGroupSettings
        // updateGroupConfig: async (groupId, config) => { ... },

        // Drive Reports Actions
        addDriveReport: async (reportData) => {
            // Map camelCase to snake_case for DB
            const dbPayload = {
                group_id: activeGroupId,
                author_id: reportData.author_id,
                author_name: reportData.author_name,
                title: reportData.title, // Maps to title
                name: reportData.title, // Also map to name for compatibility
                status: reportData.status,
                type: reportData.type,
                drive_file_id: reportData.drive_file_id || reportData.driveFileId,
                web_view_link: reportData.webViewLink, // Map camel to snake
                sections: reportData.sections,
                submitted_at: reportData.submitted_at,
                created_at: reportData.created_at || new Date().toISOString(),
                is_important: reportData.isImportant || false,
                start_date: reportData.startDate,
                end_date: reportData.endDate,
                // Handle any other fields?
                icon_link: reportData.iconLink,
                mime_type: reportData.mimeType
            };

            // Remove undefined values to let DB defaults take over if needed, or just send
            Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);

            const { data, error } = await supabase
                .from('drive_reports')
                .insert([dbPayload])
                .select()
                .single();

            if (error) {
                console.error("Error adding Drive Report:", error);
                throw error;
            }
            await loadUserData(currentUser?.id);
            return data;
        },

        updateDriveReport: async (id, data) => {
            // Map keys
            const dbUpdates = {};
            if (data.title !== undefined) dbUpdates.title = data.title;
            if (data.status !== undefined) dbUpdates.status = data.status;
            if (data.webViewLink !== undefined) dbUpdates.web_view_link = data.webViewLink;
            if (data.sections !== undefined) dbUpdates.sections = data.sections;
            if (data.drive_file_id !== undefined) dbUpdates.drive_file_id = data.drive_file_id;
            if (data.isImportant !== undefined) dbUpdates.is_important = data.isImportant;
            if (data.startDate !== undefined) dbUpdates.start_date = data.startDate;
            if (data.endDate !== undefined) dbUpdates.end_date = data.endDate;

            // Merge with raw data to allow passing other valid snake_case props
            const payload = { ...data, ...dbUpdates };

            // Remove camelCase keys that cause "Column does not exist" errors
            const keysToRemove = ['webViewLink', 'isImportant', 'startDate', 'endDate', 'driveFileId'];
            keysToRemove.forEach(k => delete payload[k]);

            const { error } = await supabase.from('drive_reports').update(payload).eq('id', id);

            if (error) {
                console.error("Error updating Drive Report:", error);
                throw error;
            }

            await loadUserData(currentUser?.id);
        },

        deleteDriveReport: async (id) => {
            const { error } = await supabase.from('drive_reports').delete().eq('id', id);
            if (error) throw error;
            await loadUserData(currentUser?.id);
        },

        updateGroupSettings: async (groupId, settings) => {
            console.log(`[AppContext] updateGroupSettings START for group ${groupId}`, settings);

            try {
                if (!groupId) throw new Error("ID de grupo no encontrado");

                // Fetch current settings to merge
                const { data: currentGroup, error: fetchError } = await supabase
                    .from('groups')
                    .select('drive_settings')
                    .eq('id', groupId)
                    .single();

                if (fetchError) {
                    console.warn("[AppContext] Error fetching current group settings (maybe it is empty?):", fetchError);
                }

                const mergedSettings = {
                    ...(currentGroup?.drive_settings || {}),
                    ...settings
                };

                console.log("[AppContext] Merged settings to save:", mergedSettings);

                const { data, error: updateError } = await supabase
                    .from('groups')
                    .update({ drive_settings: mergedSettings })
                    .eq('id', groupId)
                    .select(); // Request back to verify

                if (updateError) {
                    console.error("[AppContext] updateGroupSettings ERROR:", updateError);
                    alert("Error de base de datos al guardar: " + (updateError.message || JSON.stringify(updateError)));
                    throw updateError;
                }

                console.log("[AppContext] updateGroupSettings SUCCESS:", data);

                await loadUserData(currentUser?.id);
                return { success: true };

            } catch (err) {
                console.error("[AppContext] updateGroupSettings CRASH:", err);
                alert("Error crítico al guardar configuración: " + err.message);
                throw err;
            }
        },

        markDriveReportSeen: async (reportId) => {
            if (!currentUser) return;

            // Upsert into drive_report_views to track time
            // We use upsert so if it exists, it just updates timestamp (or does nothing if we want first view)
            // User probably wants "last viewed" or just "viewed". Let's update timestamp.
            const { error } = await supabase.from('drive_report_views').upsert({
                drive_report_id: reportId,
                user_id: currentUser.id,
                viewed_at: new Date().toISOString()
            }, { onConflict: 'drive_report_id, user_id' });

            if (error) {
                console.error("Error marking seen:", error);
                return;
            }

            // Also update the legacy array for backward compatibility if needed, 
            // OR just trigger a reload which will fetch from the new table.
            // Let's just reload.
            await loadUserData(currentUser?.id);
        },

        addDriveReportComment: async (reportId, text) => {
            if (!currentUser || !text) return;
            const { error } = await supabase.from('drive_report_comments').insert({
                drive_report_id: reportId,
                author_id: currentUser.id,
                body: text
            });
            if (error) {
                console.error("Error adding drive report comment:", error);
                alert("Error al añadir comentario: " + error.message);
                return;
            }
            await loadUserData(currentUser?.id);
        },

        // Announcements
        announcements,
        addAnnouncement: async (text) => {
            if (!currentUser || !activeGroupId) return;
            const { error } = await supabase.from('announcements').insert({
                group_id: activeGroupId,
                author_id: currentUser.id,
                content: text
            });
            if (error) {
                console.error("Error adding announcement:", error);
                return { error };
            }
            await loadUserData(currentUser?.id);
            return { success: true };
        },
        deleteAnnouncement: async (id) => {
            const { error } = await supabase.from('announcements').delete().eq('id', id);
            if (error) {
                console.error("Error deleting announcement:", error);
                return { error };
            }
            await loadUserData(currentUser?.id);
            return { success: true };
        },
        addAnnouncementComment: async (announcementId, text) => {
            if (!currentUser || !text) return;
            const { error } = await supabase.from('announcement_comments').insert({
                announcement_id: announcementId,
                user_id: currentUser.id,
                content: text
            });
            if (error) {
                console.error("Error adding announcement comment:", error);
                return { error };
            }
            await loadUserData(currentUser?.id);
            return { success: true };
        },

        // RBAC
        permissions: new Set(),
        can: () => true, // Keep permissive for mock, or implement permissions check later
        hasRole,       // Added hierarchy check
        ROLE_HIERARCHY // Exposed for UI checks
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => useContext(AppContext);

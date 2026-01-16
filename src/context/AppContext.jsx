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
    const [activeGroupId, setActiveGroupId] = useState(() =>
        window.localStorage.getItem('phd_nexus_activeGroupId') || null
    );

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
                const [tasksRes, reportsRes, knowledgeRes, membersRes, driveReportsRes] = await Promise.all([
                    supabase.from('tasks').select('*').eq('group_id', currentGroupId),
                    supabase.from('reports').select('*').eq('group_id', currentGroupId),
                    supabase.from('knowledge_items').select('*').eq('group_id', currentGroupId),
                    supabase.from('group_members').select('*, profiles(*)').eq('group_id', currentGroupId),
                    supabase.from('drive_reports').select('*').eq('group_id', currentGroupId) // Fetch Drive Reports
                ]);

                setTasks(tasksRes.data || []);
                setReports(reportsRes.data || []);
                setKnowledge(knowledgeRes.data || []);

                // Map drive_reports snake_case back to camelCase for UI if needed
                const loadedDriveReports = (driveReportsRes.data || []).map(r => ({
                    ...r,
                    webViewLink: r.web_view_link,
                    driveFileId: r.drive_file_id,
                    isImportant: r.is_important,
                    startDate: r.start_date,
                    endDate: r.end_date,
                    authorName: r.author_name
                }));
                setDriveReports(loadedDriveReports);

                const members = (membersRes.data || []).map(m => ({
                    ...(m.profiles || {}),
                    role: m.role,
                    joinedAt: m.created_at,
                    full_name: m.profiles?.full_name || 'Sin nombre',
                    email: m.profiles?.email
                }));
                setGroupMembers(members);

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
    }, [loadUserData]);

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
            setDriveReports(prev => [data, ...prev]);
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
            // Add others as needed

            // Merge with raw data in case we missed some or user sent snake_case already
            const payload = { ...dbUpdates, ...data };
            // Cleanup camelCase duplicates from payload if strictly needed, but Supabase ignores extra fields mostly if not in schema... 
            // actually Supabase Client might warn or error on unknown columns.
            // Let's rely on ...data containing snake_case if the caller is good, or our mapped `dbUpdates`.
            // Ideally we should sanitize.
            delete payload.webViewLink;
            delete payload.isImportant;

            const { error } = await supabase.from('drive_reports').update(payload).eq('id', id);
            if (error) throw error;
            setDriveReports(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
        },

        deleteDriveReport: async (id) => {
            const { error } = await supabase.from('drive_reports').delete().eq('id', id);
            if (error) throw error;
            setDriveReports(prev => prev.filter(r => r.id !== id));
        },

        updateGroupSettings: async (groupId, settings) => {
            console.log(`[AppContext] updateGroupSettings for group ${groupId}`, settings);
            const { error } = await supabase.from('groups').update({ drive_settings: settings }).eq('id', groupId);
            if (error) {
                console.error("[AppContext] updateGroupSettings ERROR:", error);
                throw error;
            }
            console.log("[AppContext] updateGroupSettings success");
            await loadUserData(currentUser?.id);
            return { success: true };
        },

        markDriveReportSeen: async (reportId) => {
            if (!currentUser) return;
            // Simplified for Supabase: we probably want a specific table or a JSONB column update
            // For now, let's assume 'seen_by' is a JSONB array or we use a separate table
            // This logic depends on the schema, but I'll make it generic.
            const { data: report } = await supabase.from('drive_reports').select('seen_by').eq('id', reportId).single();
            const seenBy = report?.seen_by || [];
            const newSeenBy = seenBy.includes(currentUser.id)
                ? seenBy.filter(id => id !== currentUser.id)
                : [...seenBy, currentUser.id];

            await supabase.from('drive_reports').update({ seen_by: newSeenBy }).eq('id', reportId);
            loadUserData(currentUser.id);
        },

        addDriveReportComment: async (reportId, text) => {
            if (!currentUser || !text) return;
            await supabase.from('drive_report_comments').insert({
                report_id: reportId,
                user_id: currentUser.id,
                content: text
            });
            loadUserData(currentUser.id);
        },

        // Announcements
        announcements,
        addAnnouncement: async (text) => {
            if (!currentUser || !activeGroupId) return;
            await supabase.from('announcements').insert({
                group_id: activeGroupId,
                author_id: currentUser.id,
                content: text
            });
            await loadUserData(currentUser.id);
        },
        deleteAnnouncement: async (id) => {
            await supabase.from('announcements').delete().eq('id', id);
            await loadUserData(currentUser.id);
        },
        addAnnouncementComment: async (announcementId, text) => {
            if (!currentUser || !text) return;
            await supabase.from('announcement_comments').insert({
                announcement_id: announcementId,
                user_id: currentUser.id,
                content: text
            });
            await loadUserData(currentUser.id);
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

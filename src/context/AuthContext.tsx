'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [permissions, setPermissions] = useState(new Set());
    const [roles, setRoles] = useState([]);
    const [activeGroupId, setActiveGroupId] = useState(null); // Managed here or AppContext?
    const router = useRouter();
    const supabase = createClient();

    // 1. Initialize Session
    useEffect(() => {
        const initAuth = async () => {
            try {
                // Bypass for local mode
                if (process.env.NEXT_PUBLIC_OPEN_MODE === 'true') {
                    console.log('Open Mode active: Skipping Supabase Auth');
                    setLoading(false);
                    return;
                }

                const { data: { session: currentSession } } = await supabase.auth.getSession();
                setSession(currentSession);
                setUser(currentSession?.user ?? null);
            } catch (error) {
                console.error('Auth initialization error:', error);
            } finally {
                setLoading(false);
            }
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
            setSession(newSession);
            setUser(newSession?.user ?? null);
            setLoading(false);
        });

        initAuth();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // 2. Load RBAC for a specific Group
    const loadPermissions = useCallback(async (groupId) => {
        if (!user || !groupId) return;

        setActiveGroupId(groupId);

        // Fetch Role in Group
        const { data: membership, error: memError } = await supabase
            .from('group_members')
            .select('role_id, roles(name)')
            .eq('user_id', user.id)
            .eq('group_id', groupId)
            .eq('status', 'active')
            .single();

        if (memError || !membership) {
            console.log('No membership found for group', groupId);
            setPermissions(new Set());
            setRoles([]);
            return;
        }

        // CAST TO ANY TO AVOID TS ISSUES WITH SUPABASE JOINS WITHOUT GENERATED TYPES
        const memAny = membership as any;
        const roleName = Array.isArray(memAny.roles) ? memAny.roles[0]?.name : memAny.roles?.name;
        // setRoles([roleName]); // If you handle multiple roles, adjust this.

        // Fetch Permissions for this Role
        const { data: permsData, error: permsError } = await supabase
            .from('role_permissions')
            .select(`
                permissions (
                    code
                )
            `)
            .eq('role', roleName);

        if (permsError) {
            console.error('Error fetching permissions:', permsError);
        }

        const newPerms = new Set((permsData as any[])?.map(p => {
            return Array.isArray(p.permissions) ? p.permissions[0]?.code : p.permissions?.code;
        }).filter(Boolean) || []);

        setPermissions(newPerms);
        setRoles([roleName]); // Simple single-role model per group

        console.log(`Loaded Permissions for ${roleName}:`, Array.from(newPerms));

    }, [user]);

    // 3. Helper: Check Permission
    // 3. Helper: Check Permission

    const ROLE_HIERARCHY = {
        'admin': 100,
        'supervisor': 50,
        'student': 10,
        'user': 1
    };

    /**
     * Check if user has at least this role (hierarchical).
     * e.g. hasRole('supervisor') returns true for supervisors AND admins.
     */
    const hasRole = useCallback((requiredRole) => {
        if (!user) return false;

        // 1. Check System Role first (Admin overrides all)
        // Assuming user object has app_metadata or we store system_role in explicit state? 
        // For now, let's assume we might have system roles in the future or check 'roles' state if it includes mixed roles.
        // If 'roles' contains 'admin', they have everything.

        const userRoles = roles || [];
        const userLevel = Math.max(...userRoles.map(r => ROLE_HIERARCHY[r] || 0));
        const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;

        return userLevel >= requiredLevel;
    }, [user, roles]);

    const can = useCallback((permissionCode) => {
        // 1. Hierarchy Bypass: Admins can do everything
        if (roles.includes('admin')) return true;

        // 2. Supervisors can usually do most things, but let's rely on explicit permissions + specific overrides if needed
        // If explicit permission exists:
        if (permissions.has(permissionCode)) return true;

        // 3. Fallback: Check implied permissions via hierarchy if not explicitly denied?
        // Actually, best practice is: Explicit Permission OR (High Level Role which implies all perms)
        // We already handled Admin. 

        return false;
    }, [permissions, roles]);

    const value = {
        user,
        session,
        loading,
        permissions,
        roles,
        loadPermissions,
        activeGroupId,
        can,
        hasRole, // Added hierarchy check
        signOut: async () => {
            await supabase.auth.signOut();
            router.push('/login');
        }
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};

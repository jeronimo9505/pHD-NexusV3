// Local Authentication System
// Simple auth for development without Supabase

import { mockDB } from './mockDatabase';

const SESSION_KEY = 'phd_nexus_session';

// Get current session from localStorage
export function getCurrentSession() {
    const sessionData = localStorage.getItem(SESSION_KEY);
    if (!sessionData) return null;

    try {
        return JSON.parse(sessionData);
    } catch {
        return null;
    }
}

// Login with email and password
export async function login(email, password) {
    console.log('[Auth] Attempting login:', { email, password });

    // Use mockDB to query profiles
    const { data: users } = await mockDB.select('profiles', { eq: { email, password } });
    console.log('[Auth] DB Query Result:', users);

    const user = users?.[0];

    if (!user) {
        return { success: false, error: 'Credenciales inválidas' };
    }

    // Create session (exclude password)
    const { password: _, ...userWithoutPassword } = user;
    const session = {
        user: userWithoutPassword,
        access_token: `mock_token_${user.id}`,
        expires_at: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    return { success: true, session };
}

// Logout
export async function logout() {
    localStorage.removeItem(SESSION_KEY);
    return { success: true };
}

// Get current user
export function getCurrentUser() {
    const session = getCurrentSession();
    return session?.user || null;
}

// Check if user is authenticated
export function isAuthenticated() {
    const session = getCurrentSession();
    if (!session) return false;

    // Check if session is expired
    if (session.expires_at < Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return false;
    }

    return true;
}

// Register new user (simulated)
export async function register({ email, password, full_name }) {
    // 1. Check if user already exists
    // 1. Check if user already exists via mockDB
    const { data: existingUsers } = await mockDB.select('profiles', { eq: { email } });

    if (existingUsers && existingUsers.length > 0) {
        return { success: false, error: 'El correo ya está registrado' };
    }

    // 2. Determine Role and Status
    // Check total user count to determine if First User
    const { count } = await mockDB.count('profiles');
    const isFirstUser = count === 0;

    const newUser = {
        id: `user_${Date.now()}`,
        email,
        password, // In real app, hash this!
        full_name,
        avatar_url: null,
        system_role: isFirstUser ? 'admin' : 'user', // First user is admin
        status: isFirstUser ? 'active' : 'pending',  // First user active
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // 3. Save to "Database"
    await mockDB.insert('profiles', newUser);

    return {
        success: true,
        user: newUser,
        message: 'Cuenta creada exitosamente'
    };
}

'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'google_drive_access_token';

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string) {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

function saveTokenToStorage(access_token: string, expiryMs: number) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token, expiry: expiryMs }));
        // Also inject into GAPI client immediately if it's loaded
        const gapi = (window as any).gapi;
        if (gapi?.client?.setToken) {
            gapi.client.setToken({ access_token });
        }
        console.log('[GoogleTokenSync] Google access token synced.');
    } catch (e) {
        console.warn('[GoogleTokenSync] Could not save token:', e);
    }
}

/**
 * Syncs the Google provider_token from the Supabase session into localStorage
 * and directly into the GAPI client. Handles:
 *   1. Initial login: reads the cookie set by /auth/callback
 *   2. Session refresh: listens to onAuthStateChange to keep the token alive
 *      without requiring popups or re-authentication
 */
export function GoogleTokenSync() {
    useEffect(() => {
        // --- 1. Initial login: consume the cookie from /auth/callback ---
        const cookieToken = getCookie('google_provider_token');
        const cookieExpiry = getCookie('google_provider_token_expiry');

        if (cookieToken) {
            const expiry = cookieExpiry ? Number(cookieExpiry) : Date.now() + 3_540_000;
            saveTokenToStorage(cookieToken, expiry);
            deleteCookie('google_provider_token');
            deleteCookie('google_provider_token_expiry');
        }

        // --- 2. Ongoing: subscribe to Supabase session changes ---
        // Supabase automatically refreshes the session (and provider_token)
        // before it expires. We hook into that to keep Google auth alive.
        const supabase = createClient();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session?.provider_token) return;

            const expiryMs = session.expires_at
                ? session.expires_at * 1000 - 60_000
                : Date.now() + 3_540_000;

            saveTokenToStorage(session.provider_token, expiryMs);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    return null;
}

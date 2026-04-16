'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'google_drive_access_token';
const HINT_KEY = 'google_auth_email_hint';

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string) {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

/**
 * GoogleTokenSync handles two separate concerns:
 *
 * 1. INITIAL LOGIN TOKEN: At login, /auth/callback saves the Google provider_token
 *    as a cookie. We read it here and save it to localStorage so GAPI can use it.
 *    This token has the Drive/Docs/Calendar scopes (if Supabase is configured for them).
 *    NOTE: We only use this for the FIRST session. Subsequent refreshes use the GIS flow.
 *
 * 2. EMAIL HINT: Whenever the Supabase session refreshes, we extract the user's email
 *    and save it as the GIS hint. This ensures the silent GIS re-auth knows which
 *    Google account to use, avoiding the account picker popup.
 *
 * IMPORTANT: We do NOT save the Supabase provider_token from onAuthStateChange to
 * replace the GIS token — the refreshed provider_token only has basic Google scopes
 * (openid, email, profile), not the Drive/Calendar scopes we need.
 */
export function GoogleTokenSync() {
    useEffect(() => {
        // --- 1. Initial login: consume the one-time cookie from /auth/callback ---
        const cookieToken = getCookie('google_provider_token');
        const cookieExpiry = getCookie('google_provider_token_expiry');

        if (cookieToken) {
            const expiry = cookieExpiry ? Number(cookieExpiry) : Date.now() + 3_540_000;
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: cookieToken, expiry }));
                // Inject immediately into GAPI if loaded
                const gapi = (window as any).gapi;
                if (gapi?.client?.setToken) gapi.client.setToken({ access_token: cookieToken });
                console.log('[GoogleTokenSync] Login token synced from auth callback.');
            } catch (e) {
                console.warn('[GoogleTokenSync] Could not save login token:', e);
            }
            deleteCookie('google_provider_token');
            deleteCookie('google_provider_token_expiry');
        }

        // --- 2. Subscribe to session changes to keep the email hint fresh ---
        // When the Supabase session refreshes (every ~hour), we update the hint email
        // so the GIS silent re-auth knows which account to use without a popup.
        // We do NOT replace the Drive/Calendar GIS token — that has wider scopes.
        const supabase = createClient();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const email = session?.user?.email;
            if (email) {
                localStorage.setItem(HINT_KEY, email);
                console.log('[GoogleTokenSync] Email hint updated:', email);
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    return null;
}

'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'google_drive_access_token';

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string) {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Runs once after login with Google OAuth.
 * Reads the `google_provider_token` cookie set by /auth/callback,
 * saves it to localStorage in the format expected by lib/google/auth.ts,
 * then deletes the cookie so it's only consumed once.
 */
export function GoogleTokenSync() {
    useEffect(() => {
        const token = getCookie('google_provider_token');
        const expiryStr = getCookie('google_provider_token_expiry');

        if (!token) return;

        const expiry = expiryStr ? Number(expiryStr) : Date.now() + 3_540_000;

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: token, expiry }));
            console.log('[GoogleTokenSync] Google access token saved to localStorage.');
        } catch (e) {
            console.warn('[GoogleTokenSync] Could not save token to localStorage:', e);
        }

        deleteCookie('google_provider_token');
        deleteCookie('google_provider_token_expiry');
    }, []);

    return null; // Renders nothing
}

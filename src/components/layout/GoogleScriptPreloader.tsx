'use client';

import { useEffect } from 'react';
import { loadGoogleScripts } from '@/lib/google/loader';

/**
 * Invisible component that pre-loads Google API scripts in the background
 * as soon as the user logs in. This way, when they navigate to Google Drive,
 * the heavy scripts (~400ms) are already cached in memory.
 * 
 * Also pre-initializes the GAPI client if drive_settings are available,
 * so the Discovery Documents are fetched in the background too.
 */
export function GoogleScriptPreloader({ apiKey, clientId }: { apiKey?: string; clientId?: string }) {
    useEffect(() => {
        // Start loading Google scripts immediately (non-blocking)
        loadGoogleScripts().then(async () => {
            // If we have credentials, pre-init the GAPI client too
            if (!apiKey || !clientId) return;

            const gapi = (window as any).gapi;
            if (!gapi) return;

            // Only pre-init if not already initialized
            if (gapi.client?.drive) return;

            try {
                // Load GAPI client module
                await new Promise<void>((resolve, reject) => {
                    gapi.load('client', { callback: resolve, onerror: reject });
                });

                // Init with API key
                await gapi.client.init({ apiKey: apiKey.trim() });

                // Pre-load Discovery Documents in parallel (the expensive part)
                await Promise.allSettled([
                    gapi.client.load("https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"),
                    gapi.client.load("https://docs.googleapis.com/$discovery/rest?version=v1"),
                    gapi.client.load("https://slides.googleapis.com/$discovery/rest?version=v1"),
                ]);

                // Restore cached token if available
                const STORAGE_KEY = 'google_drive_access_token';
                try {
                    const stored = localStorage.getItem(STORAGE_KEY);
                    if (stored) {
                        const { access_token, expiry } = JSON.parse(stored);
                        if (Date.now() < expiry) {
                            gapi.client.setToken({ access_token });
                        }
                    }
                } catch {}

                // Init token client (GIS) for future auth requests
                if ((window as any).google?.accounts?.oauth2) {
                    (window as any).google.accounts.oauth2.initTokenClient({
                        client_id: clientId.trim(),
                        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive.readonly',
                        callback: () => {}, // Will be overridden when actually used
                    });
                }

                console.log('[Preloader] Google APIs pre-loaded in background');
            } catch (e) {
                // Silent fail — the actual Drive module will retry
                console.info('[Preloader] Background pre-load skipped:', e);
            }
        }).catch(() => {
            // Silent fail for script loading — non-critical
        });
    }, [apiKey, clientId]);

    return null;
}

import { loadGoogleScripts } from "./loader";
import { toast } from "sonner";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

// Scopes required for creating and editing files and calendar events
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar';

const STORAGE_KEY = 'google_drive_access_token';

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let googleAuthPromise: Promise<string> | null = null;

// --- Helper Functions for Token Caching ---

const saveToken = (token: any) => {
    // access_tokens for client-side usually last 1 hour
    if (!token.expires_in) token.expires_in = 3600;
    // Buffer: 30s instead of 60s
    const expiry = Date.now() + (token.expires_in * 1000) - 30000;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        access_token: token.access_token,
        expiry
    }));
};

const loadToken = () => {
    if (typeof window === 'undefined') return null;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return null;
        const { access_token, expiry } = JSON.parse(stored);
        // If we are strictly within expiry, return it.
        if (Date.now() < expiry) return access_token;
        
        // Desktop optimization: If we're just over the edge, try to use it anyway 
        // until a fetch actually fails (handled in upload.ts retry logic)
        // This avoids popups appearing while the user is mid-typing if the token 
        // is technically expired but still valid at Google (they have grace periods).
        const gracePeriod = 5 * 60 * 1000; // 5 mins
        if (Date.now() < expiry + gracePeriod) return access_token;

        return null;
    } catch {
        return null;
    }
};

export const clearToken = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    // Also clear the GAPI in-memory token so withAuthRetry can get a fresh one
    const gapi = (window as any).gapi;
    if (gapi?.client?.setToken) {
        gapi.client.setToken(null);
    }
};

// --- Initialization ---

export const getGapiClient = async () => {
    await loadGoogleScripts();
    if (!(window as any).gapi) throw new Error('Google API not loaded');
    return (window as any).gapi;
}

export type GoogleService = 'drive' | 'docs' | 'slides' | 'calendar';
const SERVICE_URLS: Record<GoogleService, string> = {
    drive: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
    docs: 'https://docs.googleapis.com/$discovery/rest?version=v1',
    slides: 'https://slides.googleapis.com/$discovery/rest?version=v1',
    calendar: 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
};
let initializationQueue: Promise<unknown> = Promise.resolve();
let configuredApiKey = '';
let configuredClientId = '';

// Serialize initialization only, not file/event reads. A Drive-only screen
// never waits for Docs, Slides or Calendar discovery documents.
export function initGoogleClient(apiKey: string, clientId: string, services?: GoogleService[]): Promise<void> {
    const requested = services ?? ['drive', 'docs', 'slides', 'calendar'];
    const initialization = initializationQueue.then(async () => {
        await loadGoogleScripts();
        const gapi = (window as any).gapi;
        if (!gapi) throw new Error('GAPI not loaded');
        if (!gapi.client) await new Promise<void>((resolve, reject) => {
            gapi.load('client', { callback: resolve, onerror: reject, timeout: 10_000,
                ontimeout: () => reject(new Error('Google client timed out')) });
        });
        if (configuredApiKey !== apiKey.trim()) {
            await gapi.client.init({ apiKey: apiKey.trim() });
            configuredApiKey = apiKey.trim();
        }
        const loads = requested.map(async service => {
            if (!gapi.client[service]) await gapi.client.load(SERVICE_URLS[service]);
        });
        // Preserve legacy callers' tolerance for an unused, disabled API.
        // Explicit capability callers require every API they actually use.
        if (services) await Promise.all(loads);
        else await Promise.allSettled(loads);
        const savedToken = loadToken();
        if (savedToken) gapi.client.setToken({ access_token: savedToken });
        if ((!tokenClient || configuredClientId !== clientId.trim()) && (window as any).google?.accounts?.oauth2) {
            tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
                client_id: clientId.trim(), scope: SCOPES,
                callback: (resp: any) => {
                    if (resp.access_token) {
                        saveToken(resp);
                        if (resp.email) localStorage.setItem('google_auth_email_hint', resp.email);
                    }
                },
            });
            configuredClientId = clientId.trim();
        }
    });
    initializationQueue = initialization.catch(() => undefined);
    return initialization;
}

/**
 * Ensures valid authentication.
 * Returns the access token.
 */
export const ensureAuth = async (): Promise<string> => {
    // 1. Check if token is valid BEFORE any async operations to maintain user-interaction context.
    const savedToken = loadToken();
    
    if (savedToken) {
        // We have a token, we can safely load scripts asynchronously
        await loadGoogleScripts();
        const gapi = (window as any).gapi;

        if (!gapi.client) {
            await new Promise<void>((resolve, reject) => {
                gapi.load('client', { callback: resolve, onerror: reject });
            });
        }

        if (gapi.client && typeof gapi.client.setToken === 'function') {
            gapi.client.setToken({ access_token: savedToken });
        }
        return savedToken;
    }

    // 2. Token expired or missing — request a fresh one via GIS.
    // We MUST call requestAccessToken synchronously (before any await) so the browser
    // doesn't block the popup window (it requires transient user activation).
    
    if (googleAuthPromise) {
        return googleAuthPromise;
    }

    if (!tokenClient) {
        throw new Error("Google Token Client not initialized. Call initGoogleClient first.");
    }

    googleAuthPromise = new Promise<string>((resolve, reject) => {
        // Override callback for this specific request
        tokenClient!.callback = (resp: any) => {
            googleAuthPromise = null; // Reset promise
            if (resp.error) {
                console.error("Auth Error:", resp);
                reject(resp);
                return;
            }
            if (resp.access_token) {
                saveToken(resp);
                resolve(resp.access_token);
            } else {
                reject(new Error("No access_token received"));
            }
        };

        // Trigger GIS token request:
        // prompt: '' = no consent screen if already granted (silent re-auth)
        // hint: user email = avoids account picker popup
        const emailHint = localStorage.getItem('google_auth_email_hint') || undefined;
        (tokenClient as any).requestAccessToken({ prompt: '', hint: emailHint });
    });

    // Wait for the token request to complete
    const token = await googleAuthPromise;

    // After token is received, ensure GAPI is loaded so we can set the token
    await loadGoogleScripts();
    const gapi = (window as any).gapi;

    if (!gapi.client) {
        await new Promise<void>((resolve, reject) => {
            gapi.load('client', { callback: resolve, onerror: reject });
        });
    }

    if (gapi.client && typeof gapi.client.setToken === 'function') {
        gapi.client.setToken({ access_token: token });
    }

    return token;
};


import { loadGoogleScripts } from "./loader";
import { toast } from "sonner";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

// Scopes required for creating and editing files and calendar events
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar';
const DISCOVERY_DOCS = [
    "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
    "https://docs.googleapis.com/$discovery/rest?version=v1",
    "https://slides.googleapis.com/$discovery/rest?version=v1",
    "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"
];

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

export const initGoogleClient = async (apiKey: string, clientId: string) => {
    console.log("Initializing Google Client...");
    await loadGoogleScripts();

    if (!(window as any).gapi) throw new Error('GAPI not loaded');

    const gapi = (window as any).gapi;

    // If the preloader already initialized everything, just ensure token client exists
    if (gapi.client?.drive) {
        // Restore token if available
        const savedToken = loadToken();
        if (savedToken) {
            gapi.client.setToken({ access_token: savedToken });
        }

        // Ensure token client is set up
        if (!tokenClient && (window as any).google?.accounts?.oauth2) {
            tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
                client_id: clientId.trim(),
                scope: SCOPES,
                callback: (resp: any) => {
                    if (resp.access_token) {
                        saveToken(resp);
                        if (resp.email) localStorage.setItem('google_auth_email_hint', resp.email);
                    }
                },
            });
        }

        console.log("Google Client already pre-loaded — skipping init");
        return;
    }

    // Load GAPI client
    await new Promise<void>((resolve, reject) => {
        gapi.load('client', { callback: resolve, onerror: reject });
    });

    // Init GAPI client with API Key
    try {
        await gapi.client.init({
            apiKey: apiKey.trim(),
        });
    } catch (e: any) {
        console.warn("GAPI Init warning:", e);
    }

    // Load APIs individually to handle permissions/errors gracefully
    const loadApi = async (name: string, version: string, discoveryUrl: string) => {
        try {
            await gapi.client.load(discoveryUrl);
            console.log(`Loaded ${name} API`);
        } catch (e) {
            console.info(`[Info] Could not load ${name} API (checking others...)`);
        }
    };

    await Promise.all([
        loadApi('drive', 'v3', "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"),
        loadApi('docs', 'v1', "https://docs.googleapis.com/$discovery/rest?version=v1"),
        loadApi('slides', 'v1', "https://slides.googleapis.com/$discovery/rest?version=v1"),
        loadApi('calendar', 'v3', "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest")
    ]);

    // Restore token if available
    const savedToken = loadToken();
    if (savedToken) {
        console.log("Restoring cached Google token");
        gapi.client.setToken({ access_token: savedToken });
    }

    // Init Token Client (GIS)
    if ((window as any).google?.accounts?.oauth2) {
        tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: clientId.trim(),
            scope: SCOPES,
            callback: (resp: any) => {
                if (resp.access_token) {
                    saveToken(resp);
                    if (resp.email) localStorage.setItem('google_auth_email_hint', resp.email);
                }
            },
        });
    }

    console.log("Google Client Initialized");
};

/**
 * Ensures valid authentication.
 * Returns the access token.
 */
export const ensureAuth = async (): Promise<string> => {
    await loadGoogleScripts();
    const gapi = (window as any).gapi;

    // Ensure client is loaded
    if (!gapi.client) {
        await new Promise<void>((resolve, reject) => {
            gapi.load('client', { callback: resolve, onerror: reject });
        });
    }

    // 1. Use localStorage as source of truth for expiry.
    // gapi.client.getToken() returns whatever was last set in memory — it has no
    // knowledge of our expiry tracking — so we never trust it directly.
    const savedToken = loadToken();
    if (savedToken) {
        if (gapi.client && typeof gapi.client.setToken === 'function') {
            gapi.client.setToken({ access_token: savedToken });
        }
        return savedToken;
    }

    // 2. Token expired or missing — request a fresh one via GIS.
    // prompt: '' = silent re-auth (no consent screen if already granted).
    // This works automatically ~1 hour after login when the access token expires.
    // Avoid multiple simultaneous prompts
    if (googleAuthPromise) return googleAuthPromise;

    googleAuthPromise = new Promise<string>((resolve, reject) => {
        if (!tokenClient) {
            reject(new Error("Google Token Client not initialized. Call initGoogleClient first."));
            return;
        }

        // Override callback for this specific request
        tokenClient.callback = (resp: any) => {
            googleAuthPromise = null; // Reset promise
            if (resp.error) {
                console.error("Auth Error:", resp);
                reject(resp);
                return;
            }
            if (resp.access_token) {
                saveToken(resp);
                gapi.client.setToken({ access_token: resp.access_token });
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

    return googleAuthPromise;
};

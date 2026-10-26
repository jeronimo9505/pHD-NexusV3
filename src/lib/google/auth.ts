import { loadGoogleScripts } from "./loader";

// Scopes required for creating and editing files and calendar events
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar';

const STORAGE_KEY = 'google_drive_access_token';

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let googleAuthPromise: Promise<string> | null = null;

// --- Helper Functions for Token Caching ---

let memoryToken: { access_token: string; expiry: number; scope?: string } | null = null;
let rejectAuthorization: ((error: Error) => void) | null = null;
let authGeneration = 0;

const saveToken = (token: { access_token: string; expires_in?: number; scope?: string }) => {
    const seconds = Number(token.expires_in ?? 3600);
    const stored = { access_token: token.access_token, scope: token.scope, expiry: Date.now() + (Number.isFinite(seconds) ? seconds : 3600) * 1000 - 30_000 };
    memoryToken = stored;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch { /* This tab can still use its in-memory token. */ }
};

const loadToken = (requiredScopes: string[] = []) => {
    if (typeof window === 'undefined') return null;
    const permits = (token: { scope?: string }) => requiredScopes.every(scope => token.scope?.split(' ').includes(scope));
    if (memoryToken && memoryToken.expiry > Date.now() && permits(memoryToken)) return memoryToken.access_token;
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (stored && typeof stored.access_token === 'string' && Number.isFinite(stored.expiry) && stored.expiry > Date.now() && permits(stored)) return stored.access_token;
    } catch { /* Unavailable storage and malformed tokens are treated as signed out. */ }
    return null;
};

export const clearToken = () => {
    authGeneration++;
    memoryToken = null;
    rejectAuthorization?.(new Error('Google authorization cancelled. Please connect again.'));
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    (window as any).gapi?.client?.setToken?.(null);
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
        if (configuredClientId && configuredClientId !== clientId.trim()) clearToken();
        const savedToken = loadToken();
        gapi.client.setToken(savedToken ? { access_token: savedToken } : null);
        if ((!tokenClient || configuredClientId !== clientId.trim()) && (window as any).google?.accounts?.oauth2) {
            tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
                client_id: clientId.trim(), scope: SCOPES,
                error_callback: () => rejectAuthorization?.(new Error('Google authorization was closed or blocked. Click connect to try again.')),
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
export const ensureAuth = async (requiredScopes: string[] = []): Promise<string> => {
    const generation = authGeneration;
    // 1. Check if token is valid BEFORE any async operations to maintain user-interaction context.
    const savedToken = loadToken(requiredScopes);
    
    if (savedToken) {
        // We have a token, we can safely load scripts asynchronously
        await loadGoogleScripts();
        if (generation !== authGeneration) throw new Error('Google authorization changed. Please connect again.');
        const gapi = (window as any).gapi;

        if (!gapi.client) {
            await new Promise<void>((resolve, reject) => {
                gapi.load('client', { callback: resolve, onerror: reject, timeout: 10_000,
                    ontimeout: () => reject(new Error('Google client timed out')) });
            });
        }

        if (gapi.client && typeof gapi.client.setToken === 'function') {
            if (generation !== authGeneration) throw new Error('Google authorization changed. Please connect again.');
            gapi.client.setToken({ access_token: savedToken });
        }
        return savedToken;
    }

    // 2. Token expired or missing — request a fresh one via GIS.
    // We MUST call requestAccessToken synchronously (before any await) so the browser
    // doesn't block the popup window (it requires transient user activation).
    
    if (googleAuthPromise) {
        return googleAuthPromise.then(token => {
            if (!loadToken(requiredScopes)) throw new Error('Google did not grant the required permissions. Connect again and allow access.');
            return token;
        });
    }

    if (!tokenClient) {
        throw new Error("Google Token Client not initialized. Call initGoogleClient first.");
    }

    const activeClient = tokenClient;
    const tokenRequest = new Promise<string>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error, token?: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            rejectAuthorization = null;
            if (error) reject(error);
            else resolve(token!);
        };
        const timer = setTimeout(() => finish(new Error('Google authorization timed out. Please try again.')), 90_000);
        rejectAuthorization = error => finish(error);
        activeClient.callback = (response: any) => {
            if (settled) return;
            if (response.error || !response.access_token) {
                finish(new Error(response.error_description || response.error || 'Google did not return an access token'));
                return;
            }
            saveToken(response);
            if (!loadToken(requiredScopes)) {
                finish(new Error('Google did not grant the required permissions. Connect again and allow access.'));
                return;
            }
            finish(undefined, response.access_token);
        };
        let loginHint: string | undefined;
        try { loginHint = localStorage.getItem('google_auth_email_hint') || undefined; } catch { /* Optional hint. */ }
        try { (activeClient as any).requestAccessToken({ prompt: '', login_hint: loginHint }); }
        catch { finish(new Error('Google authorization could not open. Click connect to try again.')); }
    });
    const request = tokenRequest.then(async token => {
        await loadGoogleScripts();
        if (generation !== authGeneration) throw new Error('Google authorization changed. Please connect again.');
        const gapi = (window as any).gapi;
        if (!gapi.client) await new Promise<void>((resolve, reject) => {
            gapi.load('client', { callback: resolve, onerror: reject, timeout: 10_000,
                ontimeout: () => reject(new Error('Google client timed out')) });
        });
        if (generation !== authGeneration) throw new Error('Google authorization changed. Please connect again.');
        gapi.client.setToken({ access_token: token });
        return token;
    }).finally(() => { if (googleAuthPromise === request) googleAuthPromise = null; });
    googleAuthPromise = request;
    return request;
};

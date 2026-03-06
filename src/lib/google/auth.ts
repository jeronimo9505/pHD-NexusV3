import { loadGoogleScripts } from "./loader";
import { toast } from "sonner";

// Scopes required for creating and editing files
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive.readonly';
const DISCOVERY_DOCS = [
    "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
    "https://docs.googleapis.com/$discovery/rest?version=v1",
    "https://slides.googleapis.com/$discovery/rest?version=v1"
];

const STORAGE_KEY = 'google_drive_access_token';

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let googleAuthPromise: Promise<string> | null = null;

// --- Helper Functions for Token Caching ---

const saveToken = (token: any) => {
    // expires_in is usually 3599 seconds
    // Buffer: 60s
    if (!token.expires_in) token.expires_in = 3599;
    const expiry = Date.now() + (token.expires_in * 1000) - 60000;
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
        if (Date.now() < expiry) return access_token;
        localStorage.removeItem(STORAGE_KEY); // Expired
        return null;
    } catch {
        return null;
    }
};

export const clearToken = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
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

    // Load GAPI client
    await new Promise<void>((resolve, reject) => {
        (window as any).gapi.load('client', { callback: resolve, onerror: reject });
    });

    // Init GAPI client with API Key
    try {
        await (window as any).gapi.client.init({
            apiKey: apiKey.trim(),
            // discoveryDocs: DISCOVERY_DOCS, // Don't load all at once to prevent 403 failures blocking everything
        });
    } catch (e: any) {
        console.warn("GAPI Init warning:", e);
    }

    // Load APIs individually to handle permissions/errors gracefully
    const loadApi = async (name: string, version: string, discoveryUrl: string) => {
        try {
            await (window as any).gapi.client.load(discoveryUrl);
            console.log(`Loaded ${name} API`);
        } catch (e) {
            // Expected if the API key doesn't support this service (e.g. Slides)
            console.info(`[Info] Could not load ${name} API (checking others...)`);
        }
    };

    await Promise.all([
        loadApi('drive', 'v3', "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"),
        loadApi('docs', 'v1', "https://docs.googleapis.com/$discovery/rest?version=v1"),
        loadApi('slides', 'v1', "https://slides.googleapis.com/$discovery/rest?version=v1")
    ]);

    // Restore token if available
    const savedToken = loadToken();
    if (savedToken) {
        console.log("Restoring cached Google token");
        (window as any).gapi.client.setToken({ access_token: savedToken });
    }

    // Init Token Client (GIS)
    if ((window as any).google?.accounts?.oauth2) {
        tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: clientId.trim(),
            scope: SCOPES,
            callback: (resp: any) => {
                if (resp.access_token) {
                    saveToken(resp);
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

    // 1. Check if token is already active in GAPI
    if (gapi.client && typeof gapi.client.getToken === 'function') {
        const tokenObj = gapi.client.getToken();
        if (tokenObj && tokenObj.access_token) {
            // We assume GAPI keeps it valid or we manage it via localStorage
            return tokenObj.access_token;
        }
    }

    // 2. Check localStorage
    const savedToken = loadToken();
    if (savedToken) {
        if (gapi.client && typeof gapi.client.setToken === 'function') {
            gapi.client.setToken({ access_token: savedToken });
        }
        return savedToken;
    }

    // 3. Request new token (Prompt User)
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

        // Trigger popup
        tokenClient.requestAccessToken({ prompt: '' });
    });

    return googleAuthPromise;
};

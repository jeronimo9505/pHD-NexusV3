// Basic types for Google APIs to avoid 'any'
declare global {
    interface Window {
        gapi: any;
        google: any;
    }
}

namespace google.accounts.oauth2 {
    interface TokenClient {
        requestAccessToken(config: { prompt: string }): void;
        callback: (response: TokenResponse) => void;
    }
    interface TokenResponse {
        access_token: string;
        error?: any;
        expires_in: number;
    }
}

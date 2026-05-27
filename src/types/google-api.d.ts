// Google API type declarations
declare global {
    interface Window {
        gapi: {
            load: (api: string, callback: () => void) => void;
            client: {
                init: (config: {
                    apiKey: string;
                    discoveryDocs: string[];
                }) => Promise<void>;
                setToken: (token: { access_token: string }) => void;
                drive: {
                    files: {
                        list: (params: {
                            q?: string;
                            fields?: string;
                            orderBy?: string;
                            pageSize?: number;
                        }) => Promise<{
                            result: {
                                files: Array<{
                                    id: string;
                                    name: string;
                                    mimeType: string;
                                    webViewLink?: string;
                                    iconLink?: string;
                                    modifiedTime?: string;
                                }>;
                            };
                        }>;
                    };
                };
            };
        };
        google: {
            accounts: {
                oauth2: {
                    initTokenClient: (config: {
                        client_id: string;
                        scope: string;
                        callback: (response: { access_token?: string; error?: string }) => void;
                    }) => {
                        requestAccessToken: (options: { prompt: string }) => void;
                    };
                };
            };
        };
    }
}

export { };

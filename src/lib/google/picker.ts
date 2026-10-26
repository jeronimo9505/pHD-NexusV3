import { loadGoogleScripts } from "./loader";
import { ensureAuth } from "./auth";
 
declare global {
    interface Window {
        google: any;
        gapi: any;
    }
}

export interface PickerConfiguration {
    clientId: string;
    apiKey: string;
    token: string;
}

export { loadGoogleScripts };

// Request Access Token
// Now relies on centralized auth. Make sure initGoogleClient is called before this.
export const requestAccessToken = async (clientId: string) => {
    return await ensureAuth();
};


// Open Picker
export const openPicker = async ({
    clientId,
    apiKey,
    token,
    viewId = 'DOCS', // Default view
    onSelect
}: PickerConfiguration & {
    viewId?: 'DOCS' | 'FOLDERS' | string,
    onSelect: (file: any) => void
}) => {
    const w = window as any;
    if (!w.google || !w.google.picker) {
        // Load Picker Lib
        await new Promise<void>((resolve, reject) => w.gapi.load('picker', {
            callback: resolve, onerror: () => reject(new Error('Could not load Google Picker')),
            timeout: 10_000, ontimeout: () => reject(new Error('Google Picker timed out')),
        }));
    }
    createPicker({ clientId, apiKey, token, viewId, onSelect });
};

const createPicker = ({ clientId, apiKey, token, viewId, onSelect }: any) => {
    const projectNumber = clientId.trim().match(/^(\d+)-/)?.[1];
    if (!projectNumber) throw new Error('Google OAuth client ID is invalid. Check Group Settings.');
    const google = (window as any).google;
    const view = new google.picker.DocsView(google.picker.ViewId[viewId]);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(viewId === 'FOLDERS');

    const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .setAppId(projectNumber)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey.trim())
        .setOrigin(window.location.protocol + '//' + window.location.host)
        .addView(view)
        .setCallback((data: any) => {
            if (data.action === google.picker.Action.PICKED) {
                const file = data.docs[0];
                onSelect(file);
            }
        })
        .build();

    picker.setVisible(true);
};

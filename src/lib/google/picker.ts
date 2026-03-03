import { loadGoogleScripts } from "./loader";
import { ensureAuth } from "./auth";

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
export const openPicker = ({
    clientId,
    apiKey,
    token,
    viewId = 'DOCS', // Default view
    onSelect
}: PickerConfiguration & {
    viewId?: 'DOCS' | 'FOLDERS' | string,
    onSelect: (file: any) => void
}) => {
    if (!window.google || !window.google.picker) {
        // Load Picker Lib
        window.gapi.load('picker', {
            callback: () => {
                createPicker({ clientId, apiKey, token, viewId, onSelect });
            }
        });
    } else {
        createPicker({ clientId, apiKey, token, viewId, onSelect });
    }
};

const createPicker = ({ clientId, apiKey, token, viewId, onSelect }: any) => {
    const view = new window.google.picker.DocsView(window.google.picker.ViewId[viewId]);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(viewId === 'FOLDERS');

    const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .enableFeature(window.google.picker.Feature.SUPPORT_DRIVES)
        .setAppId(clientId.trim())
        .setOAuthToken(token)
        .setDeveloperKey(apiKey.trim())
        .setOrigin(window.location.protocol + '//' + window.location.host)
        .addView(view)
        .setCallback((data: any) => {
            if (data.action === window.google.picker.Action.PICKED) {
                const file = data.docs[0];
                onSelect(file);
            }
        })
        .build();

    picker.setVisible(true);
};

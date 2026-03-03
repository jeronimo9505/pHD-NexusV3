export const loadGoogleScripts = () => {
    if (typeof window === 'undefined') return Promise.resolve();

    // Singleton promise to prevent multiple loads
    if ((window as any)._googleScriptsLoadingPromise) {
        return (window as any)._googleScriptsLoadingPromise;
    }

    const loadPromise = new Promise<void>((resolve, reject) => {
        // Check if already loaded
        if ((window as any).gapi && (window as any).google?.accounts) {
            resolve();
            return;
        }

        let gapiLoaded = false;
        let gisLoaded = false;

        const checkDone = () => {
            if (gapiLoaded && gisLoaded) resolve();
        };

        // Load GAPI
        if (!(window as any).gapi) {
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.async = true;
            script.defer = true;
            script.onload = () => {
                gapiLoaded = true;
                checkDone();
            };
            script.onerror = (e) => {
                console.error("GAPI load error", e);
                reject(e);
            };
            document.body.appendChild(script);
        } else {
            gapiLoaded = true;
        }

        // Load GIS
        if (!(window as any).google?.accounts) {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = () => {
                gisLoaded = true;
                checkDone();
            };
            script.onerror = (e) => {
                console.error("GIS load error", e);
                reject(e);
            };
            document.body.appendChild(script);
        } else {
            gisLoaded = true;
        }

        checkDone();
    });

    (window as any)._googleScriptsLoadingPromise = loadPromise;
    return loadPromise;
};

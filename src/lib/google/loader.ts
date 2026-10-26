let scriptsPromise: Promise<void> | null = null;

function loadScript(src: string, isReady: () => boolean): Promise<void> {
    if (isReady()) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        let settled = false;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            script.onload = null;
            script.onerror = null;
            if (error) { script.remove(); reject(error); }
            else resolve();
        };
        const timer = setTimeout(() => finish(new Error('Google scripts timed out')), 15_000);
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = () => finish(isReady() ? undefined : new Error('Google API unavailable'));
        script.onerror = () => finish(new Error('Could not load Google API'));
        document.body.appendChild(script);
    });
}

export function loadGoogleScripts(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (scriptsPromise) return scriptsPromise;
    scriptsPromise = Promise.all([
        loadScript('https://apis.google.com/js/api.js', () => Boolean((window as any).gapi)),
        loadScript('https://accounts.google.com/gsi/client', () => Boolean((window as any).google?.accounts)),
    ]).then(() => undefined).catch(error => {
        // A transient outage must not poison every later attempt in this tab.
        scriptsPromise = null;
        throw error;
    });
    return scriptsPromise;
}

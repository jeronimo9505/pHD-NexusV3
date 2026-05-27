'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getGoogleOAuthUrlAction } from '@/features/auth/actions';
import { isDesktop } from '@/lib/desktop';

export function GoogleSignInButton() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await getGoogleOAuthUrlAction(window.location.origin, !isDesktop);

            if (result.error || !result.url) {
                setError(result.error || 'Could not connect to Google');
                setLoading(false);
                return;
            }

            // Desktop (Tauri) Fix: Just do a full redirect. 
            // The server already correctly set popup=0 in the redirect URL.
            if (isDesktop) {
                window.location.href = result.url;
                return;
            }

            // Web: Open a centered popup window
            const width = 520;
            const height = 620;

            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;

            const popup = window.open(
                result.url,
                'google-oauth',
                `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
            );

            if (!popup) {
                // Fallback: browser blocked the popup — do full redirect
                window.location.href = result.url;
                return;
            }

            // Poll until the popup closes, then refresh the session
            const timer = setInterval(() => {
                if (popup.closed) {
                    clearInterval(timer);
                    setLoading(false);
                    // Refresh the page so Next.js picks up the new session from cookies
                    router.refresh();
                    // Give the server a moment to set cookies, then redirect to dashboard
                    setTimeout(() => router.push('/dashboard'), 500);
                }
            }, 500);
        } catch (e) {
            setError('Unexpected error. Please try again.');
            setLoading(false);
        }
    };

    return (
        <div className="w-full">
            <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
                {loading ? (
                    <svg className="animate-spin h-4 w-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                ) : (
                    /* Google "G" logo */
                    <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                )}
                {loading ? 'Connecting with Google...' : 'Continue with Google'}
            </button>

            {error && (
                <p className="mt-2 text-xs text-red-500 text-center">{error}</p>
            )}
        </div>
    );
}

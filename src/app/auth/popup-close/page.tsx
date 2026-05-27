'use client';

import { useEffect } from 'react';

/**
 * This page is loaded inside the OAuth popup after a successful login.
 * It immediately closes itself so the parent window can detect the closure
 * and refresh the session.
 */
export default function PopupClosePage() {
    useEffect(() => {
        // Small delay so cookies are fully set before the parent polls
        const timer = setTimeout(() => {
            window.close();
        }, 300);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            fontFamily: 'system-ui, sans-serif',
            color: '#64748b',
            fontSize: '14px',
            gap: '10px'
        }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="10" cy="10" r="9" stroke="#22c55e" strokeWidth="2" />
                <path d="M6 10l3 3 5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Signed in! Closing...
        </div>
    );
}

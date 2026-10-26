'use client';

import { useEffect } from "react";
import { logVisitAction } from "@/features/auth/actions";
import { createVisitTracker } from '@/lib/visit-tracker';
const trackVisit = createVisitTracker(logVisitAction);

interface SessionTrackerProps {
    groupId: string;
    userId: string;
}

/**
 * Silent component that logs a "visit" to a group if it hasn't been logged recently.
 */
export function SessionTracker({ groupId, userId }: SessionTrackerProps) {
    useEffect(() => {
        // Schedule nonessential telemetry after the first render. Cleanup also
        // cancels the discarded Strict Mode effect before it sends anything.
        const send = () => { void trackVisit(userId, groupId).catch(error => console.error('Failed to log session visit:', error)); };
        if ('requestIdleCallback' in window) {
            const id = window.requestIdleCallback(send, { timeout: 2000 });
            return () => window.cancelIdleCallback(id);
        }
        const timer = setTimeout(send, 300);
        return () => clearTimeout(timer);
    }, [groupId, userId]);

    return null;
}

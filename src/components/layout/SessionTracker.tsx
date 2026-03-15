'use client';

import { useEffect, useRef } from "react";
import { logVisitAction } from "@/features/auth/actions";

interface SessionTrackerProps {
    groupId: string;
}

/**
 * Silent component that logs a "visit" to a group if it hasn't been logged recently.
 */
export function SessionTracker({ groupId }: SessionTrackerProps) {
    const loggedRef = useRef(false);

    useEffect(() => {
        if (loggedRef.current) return;
        
        // We log the visit on mount (once per full page load/refresh)
        // The server action handles the "spam protection" (e.g. only once every 4 hours)
        logVisitAction(groupId).then(() => {
            loggedRef.current = true;
        }).catch(err => {
            console.error("Failed to log session visit:", err);
        });
    }, [groupId]);

    return null;
}

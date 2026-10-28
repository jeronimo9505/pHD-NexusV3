'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hasNativeDrive, ramanDriveToken } from '@/lib/google/desktop-drive';
import { createClient } from '@/lib/supabase/client';
import { syncPendingRamanReferences } from '@/features/samples/raman-reference-sync';

export function RamanDriveSync({ groupId, userId }: { groupId: string; userId: string }) {
    const router = useRouter();
    useEffect(() => {
        if (!hasNativeDrive()) return;
        let current = true;
        const run = async () => {
            if (!current || !navigator.onLine || document.visibilityState === 'hidden') return;
            try {
                const result = await syncPendingRamanReferences(groupId, () => current);
                if (current && result.synced > 0) router.refresh();
            } catch { /* Pending jobs stay in Supabase; connection controls expose retry/errors. */ }
        };
        const refresh = () => { if (current && navigator.onLine) void ramanDriveToken(groupId).catch(() => {}); };
        const session = createClient().auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT' || (session && session.user.id !== userId)) current = false;
        });
        const timer = setInterval(run, 60_000);
        const renewal = setInterval(refresh, 5 * 60_000);
        window.addEventListener('online', run);
        window.addEventListener('phdnexus-google-connected', run);
        window.addEventListener('phdnexus-raman-pending', run);
        document.addEventListener('visibilitychange', run);
        const initial = setTimeout(run, 2000);
        return () => {
            current = false; clearTimeout(initial); clearInterval(timer); clearInterval(renewal);
            window.removeEventListener('online', run);
            window.removeEventListener('phdnexus-google-connected', run);
            window.removeEventListener('phdnexus-raman-pending', run);
            document.removeEventListener('visibilitychange', run);
            session.data.subscription.unsubscribe();
        };
    }, [groupId, userId, router]);
    return null;
}

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sample } from './types';
const EMPTY_SAMPLES: Sample[] = [];

// No shared cache: results belong to this grid and its current server snapshot.
export function useLogbookMeasurements(samples: Sample[], groupId: string, logbookId: string, enabled: boolean) {
    const [snapshot, setSnapshot] = useState<{
        source: Sample[]; data: Sample[]; error?: string;
    } | null>(null);

    useEffect(() => {
        if (!enabled || snapshot?.source === samples) return;
        let cancelled = false;
        const load = async () => {
            try {
                const supabase = createClient() as SupabaseClient;
                const { data, error } = await supabase.from('samples')
                    .select('id, characterizations:sample_characterizations(id, sample_id, type, data, created_at, performed_at)')
                    .eq('group_id', groupId).eq('logbook_id', logbookId);
                if (error) throw error;
                const measurements = new Map((data ?? []).map(row => [row.id, row.characterizations]));
                if (!cancelled) setSnapshot({ source: samples,
                    data: samples.map(sample => ({ ...sample, characterizations: measurements.get(sample.id) ?? [] })) });
            } catch {
                if (!cancelled) setSnapshot({ source: samples, data: [], error: 'Unable to load measurements. Please try again.' });
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [samples, groupId, logbookId, enabled, snapshot]);

    const current = snapshot?.source === samples ? snapshot : null;
    return {
        samples: current?.data ?? EMPTY_SAMPLES,
        loading: enabled && !current,
        error: current?.error,
        retry: () => setSnapshot(null),
    };
}

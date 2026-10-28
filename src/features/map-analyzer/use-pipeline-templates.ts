'use client';

import { useEffect, useRef, useState } from 'react';
import { getPipelineTemplatesAction, savePipelineTemplateAction } from './actions';

export function usePipelineTemplates(groupId: string) {
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [localTemplates, setLocalTemplates] = useState<Record<string, any[]>>({});
    const busy = useRef(false);
    const generation = useRef(0);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const version = ++generation.current;
        busy.current = false;
        setSaving(false);
        setLoading(true);
        setError(null);
        setRecords([]);
        try {
            const legacy = JSON.parse(localStorage.getItem('phdnexus_pipeline_templates') || '{}');
            setLocalTemplates(Object.fromEntries(Object.entries(legacy || {}).filter(([name, steps]) => name.trim() && Array.isArray(steps))) as Record<string, any[]>);
        } catch { setLocalTemplates({}); }
        getPipelineTemplatesAction(groupId).then(result => {
            if (version !== generation.current) return;
            if (result.error) throw new Error(result.error);
            setRecords(result.data || []);
        }).catch(() => {
            if (version === generation.current) setError('Could not load templates from Supabase. Retry before saving.');
        }).finally(() => {
            if (version === generation.current) setLoading(false);
        });
        return () => { generation.current += 1; };
    }, [groupId, attempt]);

    async function persist(name: string, steps: any[], id?: string) {
        const result = await savePipelineTemplateAction({ group_id: groupId, name, steps, id });
        if (result.error || !result.data) throw new Error(result.error || 'Supabase did not confirm the save');
        return result.data;
    }

    async function save(name: string, steps: any[]) {
        if (busy.current || loading || error) return false;
        busy.current = true;
        setSaving(true);
        const version = generation.current;
        try {
            const row = await persist(name, steps, records.find(row => row.name === name)?.id);
            if (version !== generation.current) return false;
            setRecords(current => [...current.filter(item => item.id !== row.id), row]);
            return true;
        } finally {
            if (version === generation.current) {
                busy.current = false;
                setSaving(false);
            }
        }
    }

    async function importLocal() {
        if (busy.current || loading || error) return 0;
        busy.current = true;
        setSaving(true);
        const version = generation.current;
        let count = 0;
        try {
            for (const [name, steps] of Object.entries(localTemplates)) {
                if (version !== generation.current) break;
                if (records.some(row => row.name === name)) continue;
                const row = await persist(name, steps);
                if (version !== generation.current) break;
                setRecords(current => [...current.filter(item => item.id !== row.id), row]);
                count += 1;
            }
            return count;
        } finally {
            if (version === generation.current) {
                busy.current = false;
                setSaving(false);
            }
        }
    }

    return { templates: Object.fromEntries(records.map(row => [row.name, row.steps])) as Record<string, any[]>,
        loading, saving, error, save, importLocal,
        localCount: Object.keys(localTemplates).filter(name => !records.some(row => row.name === name)).length,
        retry: () => setAttempt(value => value + 1) };
}

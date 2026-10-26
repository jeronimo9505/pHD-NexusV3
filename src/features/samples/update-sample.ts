import type { Sample, UpdateSampleInput } from './types';

export async function updateSample(input: UpdateSampleInput, groupId: string): Promise<{ data?: Sample; error?: string }> {
    try {
        const response = await fetch('/api/samples/update', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input, groupId }),
        });
        const result = await response.json();
        if (!response.ok) return { error: result.error || 'Unable to update sample' };
        return { data: result.data };
    } catch {
        return { error: 'Unable to save. Check your connection and try again.' };
    }
}

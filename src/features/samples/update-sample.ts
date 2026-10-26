import type { Sample, UpdateSampleInput } from './types';

// Only invalidation keys, never user records. A cached page revisited in this
// tab must refresh its server snapshot once, without refreshing during a save.
const dirtyLogbooks = new Set<string>();
export const consumeSampleRefresh = (groupId: string, logbookId: string) => dirtyLogbooks.delete(`${groupId}:${logbookId}`);

export async function updateSample(input: UpdateSampleInput, groupId: string): Promise<{ data?: Sample; error?: string }> {
    try {
        const response = await fetch('/api/samples/update', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input, groupId }),
        });
        const result = await response.json();
        if (!response.ok) return { error: result.error || 'Unable to update sample' };
        if (!result.data?.id) return { error: 'Unable to confirm the saved sample. Please reload.' };
        if (result.data.group_id === groupId && result.data.logbook_id) {
            if (dirtyLogbooks.size >= 100) dirtyLogbooks.delete(dirtyLogbooks.values().next().value!);
            dirtyLogbooks.add(`${groupId}:${result.data.logbook_id}`);
        }
        return { data: result.data };
    } catch {
        return { error: 'Unable to save. Check your connection and try again.' };
    }
}

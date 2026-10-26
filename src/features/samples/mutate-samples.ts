import { markSamplesChanged } from './update-sample';
import type { CreateSampleInput, Sample } from './types';

export async function createSample(input: CreateSampleInput, logbookId: string, requestId: string): Promise<{ data?: Sample; error?: string }> {
    const { group_id: groupId, ...draft } = input;
    try {
        const response = await fetch('/api/samples/mutate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId, logbookId, requestId, input: draft }) });
        const result = await response.json();
        if (!response.ok) return { error: result.error || 'Unable to create sample' };
        if (!result.data?.id || result.data.id !== requestId) return { error: 'Creation could not be confirmed. Retry this draft.' };
        markSamplesChanged(groupId, logbookId);
        return { data: result.data };
    } catch { return { error: 'Unable to confirm creation. Your draft is preserved; retry when connected.' }; }
}

export async function deleteSamples(groupId: string, logbookId: string, ids: string[]): Promise<{ deletedIds?: string[]; error?: string }> {
    try {
        const response = await fetch('/api/samples/mutate', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId, logbookId, ids }) });
        const result = await response.json();
        if (!response.ok) return { error: result.error || 'Unable to delete samples' };
        const deleted: string[] | undefined = result.deletedIds;
        if (!Array.isArray(deleted) || new Set(deleted).size !== new Set(ids).size || ids.some(id => !deleted.includes(id))) {
            return { error: 'Deletion could not be confirmed. Refresh before retrying.' };
        }
        markSamplesChanged(groupId, logbookId);
        return { deletedIds: deleted };
    } catch { return { error: 'Unable to confirm deletion. Refresh the list when connected.' }; }
}

import type { Sample } from './types';

export interface SampleChange { row: Sample; created: boolean }
const time = (row: Sample) => Date.parse(row.updated_at) || 0;

// Apply only confirmed mutations. Local tombstones also reject an older RSC
// snapshot arriving after a delete; a newer row from the server wins edits.
export function projectSampleRows(server: Sample[], changes: Record<string, SampleChange>, removed: ReadonlySet<string>): Sample[] {
    const known = new Set(server.map(row => row.id));
    const added = Object.values(changes).filter(change => change.created && !known.has(change.row.id) && !removed.has(change.row.id))
        .map(change => change.row).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return [...added, ...server.filter(row => !removed.has(row.id)).map(row => {
        const change = changes[row.id];
        return change && time(change.row) > time(row) ? { ...row, ...change.row } : row;
    })];
}

export function acknowledgeSampleRows(server: Sample[], changes: Record<string, SampleChange>) {
    let next = changes;
    for (const row of server) {
        const change = changes[row.id];
        if (change?.created && time(row) >= time(change.row)) {
            if (next === changes) next = { ...changes };
            next[row.id] = { ...change, created: false };
        }
    }
    return next;
}

export function expandSampleSelection(samples: Sample[], selected: string[]): string[] {
    const children = new Map<string, string[]>();
    for (const sample of samples) if (sample.parent_id) {
        const ids = children.get(sample.parent_id) ?? [];
        ids.push(sample.id); children.set(sample.parent_id, ids);
    }
    const result = new Set(selected);
    const queue = [...result];
    for (let index = 0; index < queue.length; index++) for (const id of children.get(queue[index]) ?? []) {
        if (!result.has(id)) { result.add(id); queue.push(id); }
    }
    return [...result];
}

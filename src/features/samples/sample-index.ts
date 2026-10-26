import type { Sample, SampleStatus } from './types';

export type SampleRow = Sample & { level: number; hasChildren: boolean };

export function createSampleIndex(samples: Sample[]) {
    const search = new Map(samples.map(sample => [sample.id, [
        sample.sample_code, sample.display_id, sample.name, sample.description,
        ...(sample.composition ?? []).flatMap(item => [item.code, (item as typeof item & { name?: string }).name]),
        JSON.stringify(sample.attributes ?? {}), ...(sample.characterization_types ?? []),
    ].filter((value): value is string => typeof value === 'string').map(value => value.toLowerCase())]));
    const nodes = new Map(samples.map(sample => [sample.id, {
        sample, children: [] as string[], timestamp: new Date(sample.created_at).getTime(),
    }]));
    const roots: string[] = [];
    for (const sample of samples) {
        const parent = sample.parent_id && nodes.get(sample.parent_id);
        if (parent) parent.children.push(sample.id);
        else roots.push(sample.id);
    }
    const sort = (ids: string[]) => ids.sort((a, b) => nodes.get(b)!.timestamp - nodes.get(a)!.timestamp);
    sort(roots);
    for (const node of nodes.values()) sort(node.children);
    const rows: SampleRow[] = [];
    const visited = new Set<string>();
    const visit = (ids: string[]) => {
        const stack = [...ids].reverse().map(id => ({ id, level: 0 }));
        while (stack.length) {
            const { id, level } = stack.pop()!;
            if (visited.has(id)) continue;
            visited.add(id);
            const node = nodes.get(id)!;
            rows.push({ ...node.sample, level, hasChildren: node.children.length > 0 });
            for (let i = node.children.length - 1; i >= 0; i--) stack.push({ id: node.children[i], level: level + 1 });
        }
    };
    visit(roots);
    // Corrupt cyclic parent links must not hang rendering or hide the records.
    visit(sort(samples.filter(sample => !visited.has(sample.id)).map(sample => sample.id)));
    return { samples, rows, search };
}

export function selectSampleRows(index: ReturnType<typeof createSampleIndex>, query: string,
    status: SampleStatus | 'all', collapsed: Record<string, boolean>): SampleRow[] {
    if (query || status !== 'all') {
        const lower = query.toLowerCase();
        return index.samples.filter(sample => (status === 'all' || sample.status === status)
            && (!query || index.search.get(sample.id)!.some(value => value.includes(lower))))
            .map(sample => ({ ...sample, level: 0, hasChildren: false }));
    }
    const visible: SampleRow[] = [];
    let hiddenBelow: number | undefined;
    for (const row of index.rows) {
        if (hiddenBelow !== undefined && row.level > hiddenBelow) continue;
        hiddenBelow = collapsed[row.id] ? row.level : undefined;
        visible.push(row);
    }
    return visible;
}

type ListParams = { q: string; fields: string; pageSize: number; pageToken?: string; orderBy?: string };
type Page<T> = { files: T[]; nextPageToken?: string };
type ListFiles<T> = (params: ListParams) => Promise<{ result: { files?: T[]; nextPageToken?: string } }>;
const FILE_FIELDS = 'id,name,mimeType,webViewLink,iconLink,modifiedTime,size,owners,lastModifyingUser';
const escapeQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// A source belongs to one mounted account/group, not to a global user cache.
export function createDriveDataSource<T extends { id: string }>(list: ListFiles<T>, now = Date.now) {
    const pages = new Map<string, { expires: number; page: Page<T> }>();
    const pending = new Map<string, Promise<Page<T>>>();
    const trees = new Map<string, { expires: number; ids: string[] }>();
    const pendingTrees = new Map<string, Promise<string[]>>();
    let generation = 0;

    async function page(params: ListParams, force = false): Promise<Page<T>> {
        const key = JSON.stringify(params);
        const existing = pending.get(key);
        if (existing) return existing;
        const cached = pages.get(key);
        if (!force && cached && cached.expires > now()) return cached.page;
        const requestGeneration = generation;
        const request = list(params).then(({ result }) => {
            const value = { files: result.files ?? [], nextPageToken: result.nextPageToken };
            if (requestGeneration === generation) {
                if (pages.size >= 50) pages.delete(pages.keys().next().value!);
                pages.set(key, { expires: now() + 30_000, page: value });
            }
            return value;
        }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
        pending.set(key, request);
        return request;
    }

    async function allPages(params: ListParams): Promise<T[]> {
        const result: T[] = [];
        let pageToken: string | undefined;
        do {
            const current = await page({ ...params, pageToken });
            result.push(...current.files);
            pageToken = current.nextPageToken;
        } while (pageToken);
        return result;
    }

    function folderIds(root: string): Promise<string[]> {
        const cached = trees.get(root);
        if (cached && cached.expires > now()) return Promise.resolve(cached.ids);
        const existing = pendingTrees.get(root);
        if (existing) return existing;
        const requestGeneration = generation;
        const request = (async () => {
            const visited = new Set([root]);
            const queue = [root];
            while (queue.length) {
                const children = await Promise.all(queue.splice(0, 4).map(id => allPages({
                    q: `'${escapeQuery(id)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                    fields: 'nextPageToken,files(id)', pageSize: 100,
                })));
                for (const child of children.flat()) if (!visited.has(child.id)) {
                    visited.add(child.id); queue.push(child.id);
                }
            }
            const ids = [...visited];
            if (requestGeneration === generation) trees.set(root, { ids, expires: now() + 60_000 });
            return ids;
        })().finally(() => { if (pendingTrees.get(root) === request) pendingTrees.delete(root); });
        pendingTrees.set(root, request);
        return request;
    }

    return {
        listFolder: (folder: string, pageToken?: string, force = false) => page({
            q: `'${escapeQuery(folder)}' in parents and trashed=false`,
            fields: `nextPageToken,files(${FILE_FIELDS})`, orderBy: 'folder,name', pageSize: 200, pageToken,
        }, force),
        async search(root: string, term: string, isCurrent = () => true) {
            const ids = await folderIds(root);
            const batches: string[][] = [];
            for (let i = 0; i < ids.length; i += 20) batches.push(ids.slice(i, i + 20));
            const matches = new Map<string, T>();
            while (batches.length && isCurrent()) {
                const results = await Promise.all(batches.splice(0, 4).map(chunk => allPages({
                    q: `name contains '${escapeQuery(term)}' and (${chunk.map(id => `'${escapeQuery(id)}' in parents`).join(' or ')}) and trashed=false`,
                    fields: `nextPageToken,files(${FILE_FIELDS})`, orderBy: 'modifiedTime desc', pageSize: 100,
                })));
                for (const file of results.flat()) matches.set(file.id, file);
            }
            return [...matches.values()];
        },
        invalidate() { generation++; pages.clear(); trees.clear(); pending.clear(); pendingTrees.clear(); },
    };
}

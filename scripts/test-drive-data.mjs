import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(fs.readFileSync('src/lib/google/drive-data.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const createSource = context.exports.createDriveDataSource;
let now = 0;
const requests = [];
const list = async params => {
    requests.push(params);
    if (params.q.includes("mimeType='application/vnd.google-apps.folder'")) {
        if (params.q.startsWith("'root'")) return { result: params.pageToken
            ? { files: [{ id: 'folder-b' }] }
            : { files: [{ id: 'folder-a' }], nextPageToken: 'folders-2' } };
        return { result: { files: [] } };
    }
    if (params.q.startsWith('name contains')) return { result: params.pageToken
        ? { files: [{ id: 'search-b' }, { id: 'search-a' }] }
        : { files: [{ id: 'search-a' }], nextPageToken: 'search-2' } };
    return { result: params.pageToken ? { files: [{ id: 'page-b' }] }
        : { files: [{ id: 'page-a' }], nextPageToken: 'page-2' } };
};
const source = createSource(list, () => now);
const [first, simultaneous] = await Promise.all([source.listFolder('root'), source.listFolder('root')]);
assert.equal(requests.length, 1, 'simultaneous folder loads deduplicate');
assert.equal(first, simultaneous);
assert.equal(first.nextPageToken, 'page-2');
await source.listFolder('root');
assert.equal(requests.length, 1, 'fresh folder cache avoids another request');
assert.equal((await source.listFolder('root', first.nextPageToken)).files[0].id, 'page-b');
now = 30_001;
await source.listFolder('root');
assert.equal(requests.length, 3, 'expired page is fetched again');

const results = await source.search('root', 'first');
assert.equal(results.length, 2, 'search reads every page and deduplicates results');
const folderReads = requests.filter(p => p.q.includes('mimeType=')).length;
assert.equal(folderReads, 4, 'folder index includes both folder pages and both children');
await source.search('root', 'second');
assert.equal(requests.filter(p => p.q.includes('mimeType=')).length, folderReads, 'next search reuses the folder tree');
const beforeCancelled = requests.length;
await source.search('root', 'cancelled', () => false);
assert.equal(requests.length, beforeCancelled, 'obsolete search skips file requests');
source.invalidate();
await source.search('root', "quote'\\value");
assert.ok(requests.some(p => p.q.includes("quote\\'\\\\value")), 'Drive query values are escaped');
assert.ok(requests.filter(p => p.q.includes('mimeType=')).length > folderReads, 'manual invalidation refreshes the tree');

let failures = 0;
const retry = createSource(async () => { if (!failures++) throw new Error('transient'); return { result: { files: [] } }; });
await assert.rejects(retry.listFolder('root'), /transient/);
await retry.listFolder('root');
assert.equal(failures, 2, 'failed promises do not poison retries');

const resolvers = [];
const racing = createSource(() => new Promise(resolve => resolvers.push(resolve)));
const old = racing.listFolder('root');
racing.invalidate();
const fresh = racing.listFolder('root');
resolvers[1]({ result: { files: [{ id: 'fresh' }] } });
await fresh;
resolvers[0]({ result: { files: [{ id: 'old' }] } });
await old;
assert.equal((await racing.listFolder('root')).files[0].id, 'fresh', 'invalidated pending results cannot overwrite the new cache');
const isolated = createSource(list, () => now);
const beforeIsolated = requests.length;
await isolated.listFolder('root');
assert.equal(requests.length, beforeIsolated + 1, 'another account/group source has an independent cache');
console.log('PASS Drive reads: deduplication, scoped cache, TTL, pagination, folder-index reuse, cancellation, escaping, failure retry and invalidation races');

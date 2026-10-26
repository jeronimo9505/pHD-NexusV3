import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const source = path => fs.readFileSync(path, 'utf8');
function module(path, globals = {}, dependencies = {}) {
    const context = { exports: {}, ...globals, require(name) { if (name in dependencies) return dependencies[name]; throw new Error(name); } };
    vm.runInNewContext(compile(source(path)), context); return context.exports;
}
function callbacks(path, names, globals) {
    const file = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const context = { exports: {}, ...globals };
    const find = node => {
        if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(file))) {
            vm.runInNewContext(compile(`exports.${node.name.getText(file)} = ${node.initializer.getText(file)};`), context);
        }
        ts.forEachChild(node, find);
    }; find(file); return context.exports;
}

// Actual form handler: a pending save cannot submit twice or close the draft.
let saveCalls = [], resolveSave, created = [], closed = 0, savingState;
const requestId = { current: null }, saving = { current: false };
const form = callbacks('src/features/samples/components/sample-form.tsx', ['handleSubmit'], {
    saving, requestId, isEdit: false, type: 'stock', parentId: '', composition: [],
    attributes: { count: 0, enabled: false }, description: 'draft', groupId: 'group', logbookId: 'book',
    crypto: { randomUUID: () => 'same-draft-id' },
    setIsSaving(value) { savingState = value; },
    createSample(...args) { saveCalls.push(args); return new Promise(resolve => { resolveSave = resolve; }); },
    onCreated(row) { created.push(row); }, onClose() { closed++; }, toast: { error() {}, success() {} },
});
const click = { preventDefault() {} };
const first = form.handleSubmit(click); await form.handleSubmit(click);
assert.equal(saveCalls.length, 1); assert.equal(closed, 0); assert.equal(created.length, 0); assert.equal(savingState, true);
resolveSave({ error: 'temporary failure' }); await first;
assert.equal(closed, 0); assert.equal(saving.current, false);
const retry = form.handleSubmit(click);
assert.equal(saveCalls[1][2], saveCalls[0][2], 'retry retains the request ID');
assert.equal(saveCalls[1][0].attributes.count, 0);
resolveSave({ data: { id: 'same-draft-id' } }); await retry;
assert.equal(created.length, 1); assert.equal(closed, 1); assert.equal(savingState, false);

// Actual deletion handlers: requesting the dialog never starts deletion; all
// state remains intact until a confirmed response, including the bulk selection.
let ids = [], removed = new Set(), selected = new Set(['a', 'b', 'other']), detail = { id: 'a' }, deleteError, deleteCalls = 0, resolveDelete;
const lock = { current: false };
const globals = { deleteLock: lock, deleteIds: ids, blockedChildren: 0, groupId: 'group', logbookId: 'book',
    setDeleteError(value) { deleteError = value; },
    setDeleteIds(value) { ids = value; globals.deleteIds = value; }, setDeleting() {},
    deleteSamples() { deleteCalls++; return new Promise(resolve => { resolveDelete = resolve; }); },
    setRemoved(callback) { removed = callback(removed); }, setSelectedIds(callback) { selected = callback(selected); },
    setDetailSample(callback) { detail = callback(detail); }, toast: { success() {} },
};
// Context properties are shared via accessor so each handler observes the latest selection.
Object.defineProperty(globals, 'deleteIds', { get: () => ids, enumerable: true, configurable: true });
const file = ts.createSourceFile('grid.tsx', source('src/features/samples/components/sample-grid.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const context = { exports: {} }; Object.defineProperties(context, Object.getOwnPropertyDescriptors(globals));
context.setDeleteIds = value => { ids = value; };
const find = node => {
    if (ts.isVariableDeclaration(node) && ['requestDeletion', 'confirmDeletion'].includes(node.name.getText(file))) {
        vm.runInNewContext(compile(`exports.${node.name.getText(file)} = ${node.initializer.getText(file)};`), context);
    }
    ts.forEachChild(node, find);
}; find(file);
context.exports.requestDeletion(['a', 'b']); assert.equal(deleteCalls, 0);
const deletion = context.exports.confirmDeletion(); await context.exports.confirmDeletion();
assert.equal(deleteCalls, 1); assert.equal(removed.size, 0); assert.equal(selected.size, 3); assert.equal(detail.id, 'a');
resolveDelete({ error: 'denied' }); await deletion;
assert.equal(deleteError, 'denied'); assert.equal(removed.size, 0); assert.equal(ids.length, 2);
const deleteRetry = context.exports.confirmDeletion(); resolveDelete({ deletedIds: ['a', 'b'] }); await deleteRetry;
assert.equal(removed.size, 2); assert.deepEqual([...selected], ['other']); assert.equal(detail, null); assert.equal(ids.length, 0);

const rows = module('src/features/samples/sample-rows.ts');
const oldRow = { id: 'old', updated_at: '2026-01-01', created_at: '2026-01-01' };
const newRow = { id: 'new', updated_at: '2026-01-02', created_at: '2026-01-02' };
const changes = { new: { row: newRow, created: true } };
assert.equal(rows.projectSampleRows([oldRow], changes, new Set())[0].id, 'new');
assert.equal(rows.projectSampleRows([oldRow, newRow], changes, new Set()).length, 2, 'server acknowledgement does not duplicate the new row');
const acknowledged = rows.acknowledgeSampleRows([oldRow, newRow], changes);
assert.equal(rows.projectSampleRows([oldRow], acknowledged, new Set()).length, 1, 'later external deletion is respected after server acknowledgement');
assert.equal(rows.projectSampleRows([oldRow], {}, new Set(['old'])).length, 0, 'late snapshot cannot resurrect a confirmed deletion');
assert.deepEqual(Array.from(rows.expandSampleSelection([{ id: 'a' }, { id: 'b', parent_id: 'a' }, { id: 'c', parent_id: 'b' }], ['a'])), ['a', 'b', 'c']);

let selection = new Set(['hidden-one', 'hidden-two']);
const selectionHandlers = callbacks('src/features/samples/components/sample-grid.tsx', ['toggleSelectAll'], {
    tree: [{ id: 'a' }, { id: 'b' }], setSelectedIds(callback) { selection = callback(selection); },
});
selectionHandlers.toggleSelectAll(); assert.equal(selection.size, 4, 'same-size hidden selection is not mistaken for the visible selection');
selectionHandlers.toggleSelectAll(); assert.deepEqual([...selection], ['hidden-one', 'hidden-two']);

// Browser adapters reject partial/false success and preserve the same creation key.
let response = {}, requests = [], invalidations = [];
const browser = module('src/features/samples/mutate-samples.ts', { async fetch(url, options) {
    requests.push({ url, options }); return { ok: !response.error, json: async () => response };
} }, { './update-sample': { markSamplesChanged: (...args) => invalidations.push(args) } });
const draft = { group_id: 'group', type: 'stock', parent_id: null, attributes: {}, composition: [] };
response = { error: 'denied' }; assert.ok((await browser.createSample(draft, 'book', 'request')).error); assert.equal(invalidations.length, 0);
response = { data: { id: 'request' } }; assert.equal((await browser.createSample(draft, 'book', 'request')).data.id, 'request');
assert.equal(JSON.parse(requests.at(-1).options.body).requestId, 'request');
response = { deletedIds: ['a'] }; assert.ok((await browser.deleteSamples('group', 'book', ['a', 'b'])).error);
response = { deletedIds: ['a', 'b'] }; assert.equal((await browser.deleteSamples('group', 'book', ['a', 'b'])).deletedIds.length, 2);

// HTTP boundary validates scope, identity, editable fields and server confirmation.
let user = null, createCalls = 0, deleteCallsHttp = 0;
const route = module('src/app/api/samples/mutate/route.ts', {}, {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    'next/cache': { revalidatePath() {} }, zod: require('zod'),
    '@/lib/supabase/server': { getUser: async () => user },
    '@/features/samples/server/mutations': {
        async createSampleRecord() { createCalls++; return { data: { id: 'created' } }; },
        async deleteSampleRecords() { deleteCallsHttp++; return { error: 'protected family' }; },
    },
});
const uuid = '11111111-1111-4111-8111-111111111111';
const req = (body, origin = 'https://app.test') => ({ headers: { get: () => origin }, nextUrl: { origin: 'https://app.test' }, json: async () => body });
const body = { groupId: uuid, logbookId: uuid, requestId: uuid, input: { type: 'stock', parent_id: null, attributes: {}, composition: [] } };
assert.equal((await route.POST(req(body))).status, 401);
user = { id: 'actor' };
assert.equal((await route.POST(req(body, 'https://other.test'))).status, 403);
assert.equal((await route.POST(req({ ...body, input: { ...body.input, created_by: uuid } }))).status, 400);
assert.equal(createCalls, 0);
assert.equal((await route.POST(req(body))).status, 200); assert.equal(createCalls, 1);
assert.equal((await route.DELETE(req({ groupId: uuid, logbookId: uuid, ids: [uuid] }))).status, 400);
assert.equal(deleteCallsHttp, 1);
await flush();
console.log('PASS Sample mutations: double-submit guard, stable draft retries, confirmation-only state, atomic response validation, stale snapshots, family selection and API authorization');

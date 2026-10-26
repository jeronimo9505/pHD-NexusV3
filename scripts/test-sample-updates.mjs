import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

// Actual persistence helper: no production writes; both DB phases are captured.
let calls = [], audit, missing = false, writeError = false;
const db = { from(table) {
    if (table === 'sample_audit_log') return { async insert(value) { audit = value; return {}; } };
    const call = { filters: [], update: false }; calls.push(call);
    const query = { select() { return query; }, update(payload) { call.update = true; call.payload = payload; return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        async single() {
            if (call.update) return writeError ? { error: { message: 'denied' } } : { data: { id: 'sample', group_id: 'group', ...call.payload } };
            return { data: missing ? null : { id: 'sample', status: 'active' } };
        } };
    return query;
} };
const helper = { exports: {}, require(name) {
    if (name === '@/lib/supabase/server') return { createClient: async () => db };
    throw new Error(name);
} };
vm.runInNewContext(compile('src/features/samples/server/update-sample.ts'), helper);
let result = await helper.exports.updateSampleRecord({ id: 'sample', status: 'completed' }, 'group', 'actor');
assert.equal(result.data.status, 'completed');
for (const call of calls) assert.deepEqual(call.filters, [['id', 'sample'], ['group_id', 'group']]);
assert.equal(audit.user_id, 'actor'); assert.equal(audit.sample_id, 'sample');
assert.equal(audit.changes.status.old, 'active'); assert.equal(audit.changes.status.new, 'completed');
missing = true; calls = []; audit = undefined;
assert.ok((await helper.exports.updateSampleRecord({ id: 'sample', status: 'completed' }, 'group', 'actor')).error);
assert.equal(calls.length, 1); assert.equal(audit, undefined);
missing = false; writeError = true; calls = [];
assert.ok((await helper.exports.updateSampleRecord({ id: 'sample', status: 'completed' }, 'group', 'actor')).error);
assert.equal(audit, undefined);

// Actual HTTP handler: auth, validation, origin and targeted invalidation.
let user = { id: 'actor' }, writes = [], invalidated = [], responseError = false;
const route = { exports: {}, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } };
    if (name === 'next/cache') return { revalidatePath: path => invalidated.push(path) };
    if (name === 'zod') return require('zod');
    if (name === '@/lib/supabase/server') return { getUser: async () => user };
    if (name === '@/features/samples/server/update-sample') return { async updateSampleRecord(...args) {
        writes.push(args); return responseError ? { error: 'denied' } : { data: { id: args[0].id, status: args[0].status } };
    } };
    throw new Error(name);
} };
vm.runInNewContext(compile('src/app/api/samples/update/route.ts'), route);
const groupId = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222';
const request = (body, origin = 'https://nexus.example') => ({ headers: { get: () => origin },
    nextUrl: { origin: 'https://nexus.example' }, json: async () => body });
const input = { id, status: 'completed' };
assert.equal((await route.exports.PATCH(request({ groupId, input }, 'https://other.example'))).status, 403);
assert.equal(writes.length, 0);
user = null;
assert.equal((await route.exports.PATCH(request({ groupId, input }))).status, 401);
assert.equal(writes.length, 0);
user = { id: 'actor' };
assert.equal((await route.exports.PATCH(request({ groupId, input: { ...input, group_id: 'other' } }))).status, 400);
assert.equal((await route.exports.PATCH(request({ groupId: 'invalid', input }))).status, 400);
const malformed = request(null); malformed.json = async () => { throw new Error('malformed'); };
assert.equal((await route.exports.PATCH(malformed)).status, 400);
assert.equal(writes.length, 0);
responseError = true;
assert.equal((await route.exports.PATCH(request({ groupId, input }))).status, 400);
assert.equal(invalidated.length, 0);
responseError = false;
result = await route.exports.PATCH(request({ groupId, input }));
assert.equal(result.status, 200); assert.equal(result.body.data.id, id);
assert.equal(result.headers['Cache-Control'], 'no-store');
assert.equal(writes.at(-1)[2], 'actor');
assert.deepEqual(invalidated, [`/${groupId}/samples`]);

// The browser sends one mutation request; failed reads never masquerade as saves.
let fetchCalls = [], fail = false;
const browser = { exports: {}, async fetch(url, options) {
    fetchCalls.push({ url, options });
    return { ok: !fail, json: async () => fail ? { error: 'denied' } : { data: { id, group_id: groupId, logbook_id: 'book', status: 'completed' } } };
} };
vm.runInNewContext(compile('src/features/samples/update-sample.ts'), browser);
assert.equal((await browser.exports.updateSample(input, groupId)).data.id, id);
assert.equal(fetchCalls.length, 1); assert.equal(fetchCalls[0].options.method, 'PATCH');
assert.equal(browser.exports.consumeSampleRefresh('other-group', 'book'), false);
assert.equal(browser.exports.consumeSampleRefresh(groupId, 'book'), true, 'revisited cached page must refresh once');
assert.equal(browser.exports.consumeSampleRefresh(groupId, 'book'), false);
fail = true;
assert.equal((await browser.exports.updateSample(input, groupId)).error, 'denied');

// Execute the real grid patch and projection, preserving joined list metadata.
const grid = ts.createSourceFile('sample-grid.tsx', fs.readFileSync('src/features/samples/components/sample-grid.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let patch, projection;
const find = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(grid) === 'applySampleUpdate') patch = node.initializer.getText(grid);
    if (ts.isVariableDeclaration(node) && node.name.getText(grid) === 'samples' && ts.isCallExpression(node.initializer)) projection = node.initializer.arguments[0].body.getText(grid);
    ts.forEachChild(node, find);
};
find(grid);
assert.ok(patch && projection);
const originals = [{ id: 's1', name: 'before', characterization_refs: [{ id: 'c1' }] }, { id: 's2', name: 'untouched' }];
let updates = { source: originals, rows: {} }, detail = originals[0];
const ui = { exports: {}, serverSamples: originals, samples: originals,
    setUpdates(callback) { updates = callback(updates); },
    setDetailSample(callback) { detail = callback(detail); },
};
vm.runInNewContext(ts.transpileModule(`exports.patch = ${patch}; exports.project = (serverSamples: any, updates: any) => ${projection};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, ui);
ui.exports.patch({ id: 's1', name: 'after' });
const projected = ui.exports.project(originals, updates);
assert.equal(projected[0].name, 'after');
assert.equal(projected[0].characterization_refs[0].id, 'c1');
assert.equal(projected[1], originals[1], 'unaffected sample keeps its object');
assert.equal(detail.name, 'after');
assert.equal(originals[0].name, 'before', 'server snapshot stays immutable');
const refreshed = [{ id: 's1', name: 'new server result' }];
assert.equal(ui.exports.project(refreshed, updates), refreshed, 'new server snapshot supersedes local patches');
console.log('PASS Sample updates: scoped session writes, audit attribution, rejected failures, HTTP auth/origin/validation, targeted response and invalidation');

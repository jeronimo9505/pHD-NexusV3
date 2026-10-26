import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText;
const requests = [];
let state = null, effect, cleanup, dependencies;
const context = { exports: {}, require(name) {
    if (name === 'react') return {
        useState() { return [state, value => { state = value; }]; },
        useEffect(callback, deps) {
            if (!dependencies || deps.some((value, index) => !Object.is(value, dependencies[index]))) {
                dependencies = deps; effect = callback;
            }
        },
    };
    if (name === '@/lib/supabase/client') return { createClient() { return {
        from(table) {
            const request = { table, filters: [] };
            const promise = new Promise(resolve => { request.resolve = resolve; });
            requests.push(request);
            const query = { select(fields) { request.fields = fields; return query; },
                eq(key, value) { request.filters.push([key, value]); return query; },
                then: promise.then.bind(promise) };
            return query;
        },
    }; } };
    throw new Error('Unexpected import: ' + name);
} };
vm.runInNewContext(compile(fs.readFileSync('src/features/samples/use-logbook-measurements.ts', 'utf8')), context);
let samples = [{ id: 's1', name: 'first' }], enabled = false;
const render = () => {
    const result = context.exports.useLogbookMeasurements(samples, 'group', 'book', enabled);
    if (effect) { const next = effect; effect = undefined; cleanup?.(); cleanup = next(); }
    return result;
};
const settle = async (index, result) => { requests[index].resolve(result); await new Promise(resolve => setImmediate(resolve)); return render(); };
assert.equal(render().loading, false);
assert.equal(requests.length, 0, 'sample table must not request measurements');
enabled = true;
assert.equal(render().loading, true);
assert.deepEqual(requests[0].filters, [['group_id', 'group'], ['logbook_id', 'book']]);
let result = await settle(0, { data: [{ id: 's1', characterizations: [{ id: 'c1', type: 'Raman', data: { laser: 532 } }] }] });
assert.equal(result.samples[0].characterizations[0].data.laser, 532);
render(); enabled = false; render(); enabled = true; render();
assert.equal(requests.length, 1, 'revisiting tabs reuses current snapshot');
samples = [{ id: 's1', name: 'edited' }]; render();
assert.equal(requests.length, 2, 'server refresh invalidates measurements');
samples = [{ id: 's2', name: 'newer snapshot' }]; render();
await settle(1, { data: [{ id: 's1', characterizations: [{ id: 'stale' }] }] });
assert.equal(render().loading, true, 'late result must not replace newer snapshot');
result = await settle(2, { error: { message: 'transient failure' } });
assert.ok(result.error); assert.equal(result.loading, false);
result.retry(); render();
assert.equal(requests.length, 4);
result = await settle(3, { data: [] });
assert.equal(result.loading, false); assert.equal(result.samples[0].characterizations.length, 0);

// Execute the actual initial query with a controlled DB adapter.
const actions = fs.readFileSync('src/features/samples/actions.ts', 'utf8');
const source = actions.slice(actions.indexOf('export async function getSamplesAction('), actions.indexOf('export async function createSampleAction('));
let fields, filters = [], clients = 0;
const query = { select(value) { fields = value; return query; }, eq(key, value) { filters.push([key, value]); return query; },
    async order() { return { data: [{ id: 's1', characterizations: [{ id: 'c1', type: 'Raman' }, { id: 'c2', type: 'Raman' }] }] }; } };
const server = { exports: {}, createClient: async () => { clients++; return { from: () => query }; } };
vm.runInNewContext(compile(source), server);
assert.ok((await server.exports.getSamplesAction('group', '')).error);
assert.equal(clients, 0, 'missing selection must never read the full group');
const initial = await server.exports.getSamplesAction('group', 'book');
assert.deepEqual(filters, [['group_id', 'group'], ['logbook_id', 'book']]);
assert.match(fields, /sample_characterizations\(id, type\)/);
assert.equal(initial.data[0].characterizations, undefined);
assert.equal(initial.data[0].characterization_refs[0].id, 'c1', 'technique badges retain direct measurement navigation');
assert.equal(initial.data[0].characterization_types.length, 1);
console.log('PASS Samples: selected-book scope, lightweight first read, deferred measurements, reuse, invalidation, stale-response protection and retry');

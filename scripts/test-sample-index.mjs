import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/samples/sample-index.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context);
const { createSampleIndex, selectSampleRows } = context.exports;
const sample = (id, parent_id, day, extra = {}) => ({ id, parent_id, name: id, status: 'active',
    created_at: `2026-01-${String(day).padStart(2, '0')}`, attributes: {}, ...extra });
const rows = [sample('child', 'root', 3), sample('root', null, 1), sample('other', null, 4),
    sample('grandchild', 'child', 2, { status: 'completed', attributes: { temperature: 900 } }),
    sample('orphan', 'missing', 5, { characterization_types: ['Raman'] })];
const index = createSampleIndex(rows);
const ids = result => Array.from(result, row => row.id);
assert.deepEqual(ids(selectSampleRows(index, '', 'all', {})), ['orphan', 'other', 'root', 'child', 'grandchild']);
assert.deepEqual(Array.from(index.rows, row => row.level), [0, 0, 0, 1, 2]);
assert.deepEqual(ids(selectSampleRows(index, '', 'all', { root: true })), ['orphan', 'other', 'root']);
assert.deepEqual(ids(selectSampleRows(index, '', 'all', { child: true })), ['orphan', 'other', 'root', 'child']);
assert.deepEqual(ids(selectSampleRows(index, '900', 'all', { root: true })), ['grandchild']);
assert.deepEqual(ids(selectSampleRows(index, 'RAMAN', 'all', {})), ['orphan']);
assert.deepEqual(ids(selectSampleRows(index, '', 'completed', { root: true })), ['grandchild']);
assert.equal(selectSampleRows(index, 'absent', 'all', {}).length, 0);
assert.equal(selectSampleRows(index, 'child', 'all', {})[0].level, 0);
assert.equal(rows[0].level, undefined, 'index must not mutate source data');

let attributeReads = 0;
const counted = sample('counted', null, 1);
Object.defineProperty(counted, 'attributes', { get() { attributeReads++; return { field: 'needle' }; } });
const cached = createSampleIndex([counted]);
const readsAfterIndex = attributeReads;
for (let i = 0; i < 20; i++) selectSampleRows(cached, 'no-match', 'all', {});
assert.equal(attributeReads, readsAfterIndex, 'typing must not serialize attributes again');

const deep = Array.from({ length: 20_000 }, (_, i) => sample(String(i), i ? String(i - 1) : null, 1));
assert.equal(createSampleIndex(deep).rows.length, deep.length, 'deep genealogy must not overflow the call stack');
const cyclic = createSampleIndex([sample('a', 'b', 1), sample('b', 'a', 2)]);
assert.equal(cyclic.rows.length, 2, 'cyclic records stay visible without infinite traversal');
console.log('PASS Samples index: genealogy, sorting, collapsed families, global filters, reusable search metadata, deep/cyclic links');

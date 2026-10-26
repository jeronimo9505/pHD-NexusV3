import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

// Exercise the current tree/filter implementation with synthetic metadata.
// This is a Node CPU benchmark, not a browser or network timing.
const source = fs.readFileSync('src/features/samples/sample-index.ts', 'utf8');
const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(code, context);
const results = [];
for (const rows of [121, 1000, 10000]) {
    const samples = Array.from({ length: rows }, (_, i) => ({
        id: `sample-${i}`, parent_id: i > 0 && i % 5 === 0 ? `sample-${i - 1}` : null,
        sample_code: `S${i}`, display_id: `S${i}`, name: `Graphene sample ${i}`,
        status: 'active', description: 'Synthetic research metadata',
        created_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
        composition: [{ code: 'G', name: 'Graphene' }],
        attributes: Object.fromEntries(Array.from({ length: 12 }, (_, j) => [`property-${j}`, `value-${i}-${j}`])),
        characterization_types: ['Raman', 'SEM'],
    }));
    const buildStart = performance.now();
    const index = context.exports.createSampleIndex(samples);
    const indexBuildMs = Number((performance.now() - buildStart).toFixed(2));
    for (const search of ['', 'graphene', 'no-match-query']) {
        const times = [];
        let returnedRows = 0;
        for (let run = 0; run < 7; run++) {
            const before = performance.now();
            returnedRows = context.exports.selectSampleRows(index, search, 'all', {}).length;
            times.push(performance.now() - before);
        }
        times.sort((a, b) => a - b);
        results.push({ rows, indexBuildMs, search: search || '(tree)', returnedRows, medianMs: Number(times[3].toFixed(2)) });
    }
}
console.table(results);

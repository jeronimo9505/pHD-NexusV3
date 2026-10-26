import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';

// Measures eager JS references of the route's primary client component.
// Does not claim to measure navigation duration or every layout dependency.
const routes = [
    ['samples', 'sample-grid.tsx'], ['map-analyzer', 'desktop-map-analyzer.tsx'],
    ['calendar', 'calendar-view.tsx'], ['drive-reports', 'report-list.tsx'],
    ['knowledge', 'knowledge-explorer.tsx'], ['logbook', 'LogbookView.tsx'],
    ['tasks', 'client-wrapper.tsx'], ['ai-chat', 'AIChatPanel.tsx'],
    ['settings', 'edit-group-form.tsx'],
    ['dashboard', 'dashboard-actions.tsx'],
    ['google-drive', 'drive-browser.tsx'],
];
const results = [];
const reportsSource = fs.readFileSync('src/features/regular-reports/components/report-list.tsx', 'utf8');
assert.ok(!/^['"]use client['"]/m.test(reportsSource), 'weekly report list stays server-rendered');
for (const [route, component] of routes) {
    const context = {};
    vm.runInNewContext(fs.readFileSync(`.next/server/app/(platform)/[groupId]/${route}/page_client-reference-manifest.js`, 'utf8'), context);
    const manifest = Object.values(context.__RSC_MANIFEST)[0];
    const entries = Object.entries(manifest.clientModules).filter(([key]) => key.endsWith('/' + component));
    assert.equal(entries.length, 1, `primary client reference exists for ${route}`);
    const chunks = [...new Set(entries.flatMap(([, entry]) => entry.chunks))];
    let rawBytes = 0, gzipBytes = 0;
    for (const chunk of chunks) {
        const data = fs.readFileSync('.next/' + chunk.replace('/_next/', ''));
        rawBytes += data.length;
        gzipBytes += zlib.gzipSync(data).length;
        assert.ok(!data.toString().includes('plotly.js v'), `full Plotly must not be eagerly loaded by ${route}`);
    }
    results.push({ route, eagerChunks: chunks.length, rawBytes, gzipBytes });
}
console.table(results);
console.log('PASS: full Plotly is absent from eager primary-component chunks in all checked web modules.');

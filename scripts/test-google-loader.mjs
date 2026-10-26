import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync('src/lib/google/loader.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function browser({ failFirst = false } = {}) {
    let failed = false;
    const scripts = [];
    const window = {};
    const context = { exports: {}, window, setTimeout, clearTimeout,
        document: {
            createElement: () => ({ remove() { this.removed = true; } }),
            body: { appendChild(script) {
                scripts.push(script);
                queueMicrotask(() => {
                    if (failFirst && !failed && script.src.includes('apis.google.com')) {
                        failed = true; script.onerror?.(); return;
                    }
                    if (script.src.includes('apis.google.com')) window.gapi = {};
                    else window.google = { accounts: {} };
                    script.onload?.();
                });
            } },
        },
    };
    vm.runInNewContext(code, context);
    return { load: context.exports.loadGoogleScripts, scripts };
}

const normal = browser();
const first = normal.load();
assert.equal(first, normal.load(), 'simultaneous callers share the same load');
await first;
await normal.load();
assert.equal(normal.scripts.length, 2, 'each Google script loads once');
const retry = browser({ failFirst: true });
await assert.rejects(retry.load(), /Could not load/);
await retry.load();
assert.equal(retry.scripts.length, 3, 'only the failed script retries');
assert.equal(retry.scripts[0].removed, true, 'failed script is removed');
const server = { exports: {} };
vm.runInNewContext(code, server);
await server.exports.loadGoogleScripts();
console.log('PASS Google loader: deduplication, cached success, transient failure recovery, SSR');

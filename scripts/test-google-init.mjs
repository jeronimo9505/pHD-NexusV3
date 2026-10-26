import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const calls = { scripts: 0, client: 0, init: 0, services: [], tokens: 0 };
let failDrive = true;
const gapi = {
    load(_name, { callback }) {
        calls.client++;
        this.client = {
            async init() { calls.init++; },
            async load(url) {
                const service = url.includes('docs.googleapis') ? 'docs' : url.includes('slides.googleapis') ? 'slides' : url.includes('calendar/') ? 'calendar' : 'drive';
                calls.services.push(service);
                if (service === 'drive' && failDrive) { failDrive = false; throw new Error('drive unavailable'); }
                this[service] = {};
            },
            setToken() {},
        };
        callback();
    },
};
const code = ts.transpileModule(fs.readFileSync('src/lib/google/auth.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {}, console, setTimeout, clearTimeout,
    window: { gapi, google: { accounts: { oauth2: { initTokenClient() { calls.tokens++; return {}; } } } } },
    localStorage: { getItem() { return null; } },
    require(name) {
        if (name === './loader') return { loadGoogleScripts: async () => { calls.scripts++; } };
        if (name === 'sonner') return { toast: {} };
        if (name === '@/lib/supabase/client') return { createClient() {} };
        throw new Error('Unexpected dependency: ' + name);
    },
};
vm.runInNewContext(code, context);
const initialize = context.exports.initGoogleClient;
await assert.rejects(initialize('key', 'client', ['drive']), /drive unavailable/);
await Promise.all([initialize('key', 'client', ['drive']), initialize('key', 'client', ['drive'])]);
assert.equal(calls.init, 1, 'the base client initializes once');
assert.equal(calls.client, 1, 'the client module loads once');
assert.equal(calls.services.join(','), 'drive,drive', 'Drive retries once and concurrent callers do not reload it');
await initialize('key', 'client', ['calendar']);
assert.equal(calls.services.join(','), 'drive,drive,calendar', 'Calendar loads without Docs or Slides');
await initialize('key', 'other-client', ['drive']);
assert.equal(calls.tokens, 2, 'changing OAuth configuration rebuilds the token client');
console.log('PASS Google init: per-service discovery, serialized initialization, recovery after failure, configuration changes');

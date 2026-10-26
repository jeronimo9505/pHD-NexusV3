import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Blob } from 'node:buffer';

function load(path, globals = {}, dependencies = {}) {
    const context = { exports: {}, console, ...globals, require(name) {
        if (name in dependencies) return dependencies[name];
        throw new Error('Unexpected import: ' + name);
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    } }).outputText, context);
    return context.exports;
}
const flush = () => new Promise(resolve => setImmediate(resolve));

// OAuth: actual central module, fake GIS callbacks and no account/network access.
const stored = new Map(), timers = new Map();
let config, client, requests = 0, currentToken, blockScripts, throwPopup = false;
const gapi = { client: { drive: {}, async init() {}, setToken(value) { currentToken = value; } } };
const auth = load('src/lib/google/auth.ts', {
    setTimeout(callback, delay) { const id = Symbol(); timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    window: { gapi, google: { accounts: { oauth2: { initTokenClient(options) {
        config = options;
        client = { callback: options.callback, requestAccessToken() { requests++; if (throwPopup) throw new Error('blocked'); } };
        return client;
    } } } } },
}, { './loader': { loadGoogleScripts: async () => { if (blockScripts) await blockScripts; } } });
await auth.initGoogleClient('key', '123-client', ['drive']);
const first = auth.ensureAuth(), second = auth.ensureAuth();
assert.equal(requests, 1, 'popup starts synchronously and is shared');
client.callback({ access_token: 'synthetic-token', expires_in: 3600 });
assert.deepEqual(await Promise.all([first, second]), ['synthetic-token', 'synthetic-token']);
assert.equal(currentToken.access_token, 'synthetic-token');
await auth.ensureAuth(); assert.equal(requests, 1);
auth.clearToken();
const closed = auth.ensureAuth(); config.error_callback({ type: 'popup_closed' });
await assert.rejects(closed, /closed or blocked/);
const retry = auth.ensureAuth(); client.callback({ access_token: 'retry', expires_in: 3600 });
assert.equal(await retry, 'retry');
auth.clearToken();
stored.set('google_drive_access_token', JSON.stringify({ access_token: 'expired', expiry: Date.now() - 1000 }));
const expired = auth.ensureAuth();
assert.equal(requests, 4, 'expired tokens never receive a grace period');
const timeout = [...timers.values()].find(timer => timer.delay === 90_000);
timeout.callback(); await assert.rejects(expired, /timed out/);
throwPopup = true; await assert.rejects(auth.ensureAuth(), /could not open/); throwPopup = false;
const cancelled = auth.ensureAuth(), oldCallback = client.callback;
auth.clearToken(); await assert.rejects(cancelled, /cancelled/);
oldCallback({ access_token: 'late', expires_in: 3600 }); assert.equal(currentToken, null);
let release;
blockScripts = new Promise(resolve => { release = resolve; });
const lateSetup = auth.ensureAuth(); client.callback({ access_token: 'late-setup', expires_in: 3600 });
await flush(); auth.clearToken(); release();
await assert.rejects(lateSetup, /authorization changed/); assert.equal(currentToken, null); blockScripts = null;
const unscoped = auth.ensureAuth(); client.callback({ access_token: 'drive-login', expires_in: 3600 }); await unscoped;
const beforeScopeRequest = requests;
const scope = 'https://www.googleapis.com/auth/calendar';
const scoped = auth.ensureAuth([scope]);
assert.equal(requests, beforeScopeRequest + 1, 'Calendar must not reuse a login token with unknown scopes');
client.callback({ access_token: 'calendar-token', scope, expires_in: 3600 });
assert.equal(await scoped, 'calendar-token');
await auth.ensureAuth([scope]); assert.equal(requests, beforeScopeRequest + 1);

// Session changes clear Google credentials instead of reusing another account.
let sessionListener, sessionClears = 0;
const hints = new Map([['google_auth_email_hint', 'previous@example.test'], ['google_drive_access_token', 'old']]);
const sync = load('src/components/layout/GoogleTokenSync.tsx', {
    document: { cookie: '' }, window: {},
    localStorage: { getItem: key => hints.get(key) ?? null, setItem: (key, value) => hints.set(key, value), removeItem: key => hints.delete(key) },
}, {
    react: { useEffect(callback) { callback(); } },
    '@/lib/google/auth': { clearToken() { sessionClears++; hints.delete('google_drive_access_token'); } },
    '@/lib/supabase/client': { createClient: () => ({ auth: { onAuthStateChange(callback) { sessionListener = callback; return { data: { subscription: { unsubscribe() {} } } }; } } }) },
});
sync.GoogleTokenSync();
sessionListener('INITIAL_SESSION', { user: { id: 'new-user', email: 'new@example.test' } });
assert.equal(sessionClears, 1); assert.equal(hints.has('google_drive_access_token'), false);
assert.equal(hints.get('google_auth_email_hint'), 'new@example.test');
sessionListener('SIGNED_OUT', null); assert.equal(sessionClears, 2);
assert.equal(hints.has('google_auth_email_hint'), false);

// Calendar: denied permission is not token expiry; mutations are never replayed.
let cleared = 0, calendarCalls = 0, calendarStatus = 403, discovered = 0;
const calendarClient = { async load() { discovered++; this.calendar = { events: {
    async patch() { calendarCalls++; throw { status: calendarStatus }; },
} }; } };
const calendar = load('src/lib/google/calendar.ts', { window: { gapi: { client: calendarClient } } }, {
    './auth': { ensureAuth: async () => 'token', clearToken() { cleared++; } },
});
const event = { title: 'test', startAt: '2026-01-01T10:00:00Z', endAt: '2026-01-01T11:00:00Z' };
await assert.rejects(calendar.updateMeetConference('calendar', 'event', event));
assert.equal(discovered, 1); assert.equal(calendarCalls, 1); assert.equal(cleared, 0);
calendarStatus = 401; await assert.rejects(calendar.updateMeetConference('calendar', 'event', event));
assert.equal(calendarCalls, 2); assert.equal(cleared, 1);

// Knowledge sync: every page, nested folders, duplicates, complete-or-error.
let scanMode = 'ok', scanCalls = 0;
const scan = load('src/lib/google/drive.ts', { window: { gapi: { client: { setToken() {}, drive: { files: {
    async get() { return { result: { name: 'Root' } }; },
    async list(params) {
        scanCalls++;
        if (scanMode === 'error') throw new Error('denied');
        if (scanMode === 'incomplete') return { result: { incompleteSearch: true } };
        if (scanMode === 'repeated') return { result: { nextPageToken: 'same' } };
        if (params.q.includes("'child'")) return { result: { files: [{ id: 'third', name: 'nested' }, { id: 'root', name: 'Root', mimeType: 'application/vnd.google-apps.folder' }] } };
        if (params.pageToken) return { result: { files: [{ id: 'second', name: 'page two' }] } };
        return { result: { nextPageToken: 'page2', files: [{ id: 'first', name: 'page one' }, { id: 'child', name: 'Category', mimeType: 'application/vnd.google-apps.folder' }] } };
    },
} } } } } }, { './loader': {} });
const files = await scan.syncDriveFilesRecursive('root', 'token');
assert.deepEqual(Array.from(files, file => file.id), ['first', 'second', 'third']);
assert.equal(files[2].category, 'Category'); assert.equal(files[2].tags[0], 'Category'); assert.equal(scanCalls, 3);
for (scanMode of ['error', 'incomplete', 'repeated']) await assert.rejects(scan.syncDriveFilesRecursive('root', 'token'));

// Upload/download: binary payloads and tokens exclusively in HTTP headers.
let fetches = [], status = 200, download, revoked = false;
const fetchMock = async (url, options) => { fetches.push({ url, options }); return {
    status, ok: status === 200, json: async () => ({ id: 'new', error: { message: 'denied' } }), blob: async () => new Blob(['file']),
}; };
const authMock = { ensureAuth: async () => 'synthetic-secret', clearToken() { cleared++; } };
const upload = load('src/lib/google/upload.ts', { Blob, crypto: { randomUUID: () => 'test-boundary' }, fetch: fetchMock }, { './auth': authMock });
const binary = Object.assign(new Blob([new Uint8Array([0, 255, 3, 200])]), { name: 'binary.bin' });
await upload.uploadFileToDrive(binary, 'folder');
assert.ok(fetches[0].options.body instanceof Blob);
assert.ok((await fetches[0].options.body.text()).includes('"mimeType":"application/octet-stream"'));
assert.ok(Buffer.from(await fetches[0].options.body.arrayBuffer()).includes(Buffer.from([0, 255, 3, 200])));
assert.equal(fetches[0].options.headers.Authorization, 'Bearer synthetic-secret');
const downloads = load('src/lib/google/download.ts', {
    fetch: fetchMock, URL: { createObjectURL: () => 'blob:local', revokeObjectURL() { revoked = true; } },
    setTimeout(callback) { callback(); }, document: { body: { appendChild() {} }, createElement() { const anchor = { click() { download = { href: this.href, name: this.download }; }, remove() {} }; return anchor; } },
}, { './auth': authMock });
await downloads.downloadDriveContent('file/id', 'export.pdf', { mimeType: 'application/pdf' });
assert.equal(download.href, 'blob:local'); assert.equal(download.name, 'export.pdf'); assert.ok(revoked);
assert.ok(fetches.at(-1).url.includes('file%2Fid/export'));
for (const call of fetches) assert.ok(!call.url.includes('synthetic-secret') && !call.url.includes('access_token'));
status = 401; const previous = cleared;
await assert.rejects(upload.uploadFileToDrive(binary)); assert.equal(cleared, previous + 1);
await assert.rejects(downloads.downloadDriveContent('id', 'file')); assert.equal(cleared, previous + 2);

const model = load('src/lib/google/model.ts');
assert.equal(model.configuredGeminiModel(' gemini-2.5-flash '), 'gemini-2.5-flash');
assert.equal(model.configuredGeminiModel(''), null);
for (const path of ['src/features/ai-chat/actions.ts', 'src/features/logbook/actions.ts']) {
    assert.ok(!fs.readFileSync(path, 'utf8').includes('gemini-1.5-flash'), 'no hidden legacy model replacement');
}

// Picker loading is awaitable and uses the numeric Cloud project identifier.
let pickerAppId, visible = false, pickerFailure = false;
const pickerApi = {
    DocsView: class { setIncludeFolders() {} setSelectFolderEnabled() {} },
    ViewId: { DOCS: 'docs' }, Feature: {}, Action: { PICKED: 'picked' },
    PickerBuilder: class {
        enableFeature() { return this; } setAppId(value) { pickerAppId = value; return this; }
        setOAuthToken() { return this; } setDeveloperKey() { return this; } setOrigin() { return this; }
        addView() { return this; } setCallback() { return this; }
        build() { return { setVisible(value) { visible = value; } }; }
    },
};
const pickerWindow = { google: {}, location: { protocol: 'https:', host: 'example.test' }, gapi: {
    load(_name, options) {
        if (pickerFailure) options.ontimeout();
        else { pickerWindow.google.picker = pickerApi; options.callback(); }
    },
} };
const picker = load('src/lib/google/picker.ts', { window: pickerWindow }, { './loader': {}, './auth': authMock });
await picker.openPicker({ clientId: '12345-client.apps.googleusercontent.com', apiKey: 'key', token: 'token', onSelect() {} });
assert.equal(pickerAppId, '12345'); assert.equal(visible, true);
delete pickerWindow.google.picker; pickerFailure = true;
await assert.rejects(picker.openPicker({ clientId: '12345-client', apiKey: 'key', token: 'token', onSelect() {} }), /timed out/);
console.log('PASS Google reliability: OAuth concurrency/cancel/timeout/expiry, Calendar errors, complete Drive sync, binary upload, header-only downloads and configured Gemini models');

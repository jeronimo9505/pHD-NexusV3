import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { previewPlan } from './desktop-preview.mjs';

const compile = source => ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
function getFunction(path, name, globals) {
    const file = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declaration = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(declaration, name);
    const context = { exports: {}, ...globals, require: () => ({ jsx: (...args) => args }) };
    vm.runInNewContext(compile(declaration.getText(file)), context);
    return context.exports[name] ?? context.exports.default;
}

// Concurrent effects/remounts share work, scoped to the authenticated user/group.
const trackerModule = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync('src/lib/visit-tracker.ts', 'utf8')), trackerModule);
let now = 0, visits = 0, release, fail = false;
let gate = new Promise(resolve => { release = resolve; });
const track = trackerModule.exports.createVisitTracker(async () => {
    visits++; if (gate) return gate; return fail ? { error: 'temporary' } : { success: true };
}, () => now);
const first = track('user', 'group'), duplicate = track('user', 'group');
await flush(); assert.equal(visits, 1);
release({ success: true }); await Promise.all([first, duplicate]); gate = null;
await track('user', 'group'); assert.equal(visits, 1);
await track('other-user', 'group'); await track('user', 'other-group'); assert.equal(visits, 3);
now = 4 * 60 * 60 * 1000 + 1;
await track('user', 'group'); assert.equal(visits, 4);
fail = true; await assert.rejects(track('retry-user', 'group'));
fail = false; await track('retry-user', 'group'); assert.equal(visits, 6);

// The actual visit action preserves retryable failures and uses the actor's ID.
let user = { id: 'actor' }, recent = { data: null }, insertError = null, inserted = [], dbReads = 0;
const query = { select() { dbReads++; return query; }, eq() { return query; }, gt() { return query; }, limit() { return query; },
    async maybeSingle() { return recent; }, async insert(row) { inserted.push(row); return { error: insertError }; } };
const logVisit = getFunction('src/features/auth/actions.ts', 'logVisitAction', {
    createClient: async () => ({ from: () => query }), getUser: async () => user,
});
user = null; assert.ok((await logVisit('group')).error); assert.equal(dbReads, 0);
user = { id: 'actor' }; recent = { error: { message: 'unavailable' } };
assert.ok((await logVisit('group')).error); assert.equal(inserted.length, 0);
recent = { data: { id: 'already' } };
assert.equal((await logVisit('group')).alreadyLogged, true); assert.equal(inserted.length, 0);
recent = { data: null }; insertError = { message: 'denied' };
assert.ok((await logVisit('group')).error);
insertError = null; assert.equal((await logVisit('group')).success, true);
assert.equal(inserted.at(-1).user_id, 'actor'); assert.equal(inserted.at(-1).group_id, 'group');

// All independent snapshot reads start before awaiting any one of them.
const started = [], releases = [];
const read = name => () => { started.push(name); return new Promise(resolve => releases.push(resolve)); };
let denied = false;
const snapshot = getFunction('src/features/admin/actions.ts', 'getAdminSnapshotAction', {
    requireAdmin: async () => { if (denied) throw new Error('Unauthorized'); },
    createClient: async () => ({}),
    readAllUsers: read('users'), readAllGroups: read('groups'), readPlatformStats: read('stats'), readPendingRequests: read('notifications'),
});
const pendingSnapshot = snapshot(); await flush();
assert.deepEqual(started, ['users', 'groups', 'stats', 'notifications']);
releases[0]({ data: [{ id: 'user' }] }); releases[1]({ data: [] });
releases[2]({ data: { totalUsers: 1, totalGroups: 0, totalReports: 0, totalTasks: 0 } }); releases[3]({ data: [] });
assert.equal((await pendingSnapshot).stats.totalUsers, 1);
denied = true; await assert.rejects(snapshot()); assert.equal(started.length, 4);

// Directory queries really execute together, and membership failures stay errors.
const directoryStarted = [], directoryReleases = [];
const directory = getFunction('src/features/groups/actions.ts', 'getAllGroupsAction', {
    getUser: async () => user,
    createClient: async () => ({ from(table) {
        const promise = new Promise(resolve => directoryReleases.push({ table, resolve }));
        const builder = { select() { return builder; }, order() { return builder; }, eq() { return builder; },
            then(resolve, reject) { directoryStarted.push(table); return promise.then(resolve, reject); } };
        return builder;
    } }),
});
const directoryResult = directory(); await flush();
assert.deepEqual(directoryStarted, ['groups', 'group_members']);
directoryReleases[0].resolve({ data: [{ id: 'g', profiles: { full_name: 'Owner' } }] });
directoryReleases[1].resolve({ data: [{ group_id: 'g', status: 'active' }] });
assert.equal((await directoryResult).data[0].memberStatus, 'active');
const failedDirectory = directory(); await flush();
directoryReleases[2].resolve({ data: [{ id: 'g' }] });
directoryReleases[3].resolve({ error: { message: 'membership unavailable' } });
assert.equal((await failedDirectory).error, 'membership unavailable');

// Default-group dispatch checks access without reading the full directory.
let directoryReads = 0, membershipChecks = 0, role = 'student';
const dashboard = getFunction('src/app/(platform)/dashboard/page.tsx', 'DashboardRoot', {
    getUser: async () => user, getCurrentProfile: async () => ({ default_group_id: 'default-group' }),
    getGroupRole: async () => { membershipChecks++; return role; },
    getAllGroupsAction: async () => { directoryReads++; return { data: [] }; },
    redirect: url => { throw new Error('redirect:' + url); }, DashboardClient: () => null,
});
await assert.rejects(dashboard({ searchParams: Promise.resolve({}) }), /redirect:\/default-group\/dashboard/);
assert.equal(directoryReads, 0); assert.equal(membershipChecks, 1);
role = null; await dashboard({ searchParams: Promise.resolve({}) }); assert.equal(directoryReads, 1);
role = 'student'; await dashboard({ searchParams: Promise.resolve({ noredirect: 'true' }) });
assert.equal(membershipChecks, 2); assert.equal(directoryReads, 2);
user = null; await assert.rejects(dashboard({ searchParams: Promise.resolve({}) }), /redirect:\/login/);
assert.equal(directoryReads, 2);

const plan = previewPlan('next-cli');
assert.deepEqual(plan.map(([, args]) => args), [['next-cli', 'build', '--webpack'], ['next-cli', 'start', '--port', '3000']]);
const config = JSON.parse(fs.readFileSync('src-tauri/tauri.performance.conf.json', 'utf8'));
assert.equal(config.build.devUrl, 'http://localhost:3000');
assert.equal(config.build.beforeDevCommand, 'npm run desktop:preview');
console.log('PASS Desktop loading: visit deduplication/isolation/TTL/retry, persistence errors, concurrent admin snapshot/access, default-group dispatch, compiled preview configuration');

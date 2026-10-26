import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(code) {
    const context = { exports: {} };
    vm.runInNewContext(ts.transpileModule(code, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, context);
    return context.exports;
}

// Execute the actual component callbacks, with only their I/O/state mocked.
const calendar = fs.readFileSync('src/features/calendar/components/calendar-view.tsx', 'utf8');
const marker = 'const fetchLocal = useCallback(async (from: string, to: string) => {';
const start = calendar.indexOf(marker) + marker.length;
const end = calendar.indexOf('}, [groupId]);', start);
assert.ok(start >= marker.length && end > start);
const { calendarHarness } = load(`export function calendarHarness(getCalendarEventsAction: any) {
    const groupId = 'test-group';
    const rangeRef = { current: null as any }, loadedRangeRef = { current: '' },
        eventRequestRef = { current: 0 }, pendingRangeRef = { current: '' };
    const state = { loading: false, events: [] as any[], errors: 0 };
    const setLoadingEvents = (value: boolean) => { state.loading = value; };
    const setLocalEvents = (value: any[]) => { state.events = value; };
    const toast = { error: () => { state.errors++; } };
    const fetchLocal = async (from: string, to: string) => {${calendar.slice(start, end)}};
    return { load: fetchLocal, state };
}`);
const pending = [];
const controller = calendarHarness((group, from, to) => new Promise(resolve => pending.push({ from, to, resolve })));
const first = controller.load('A', 'A-end');
await controller.load('A', 'A-end');
assert.equal(pending.length, 1, 'same pending calendar range is not fetched twice');
pending[0].resolve({ data: [{ id: 'A' }] }); await first;
const second = controller.load('B', 'B-end');
await controller.load('A', 'A-end');
pending[1].resolve({ data: [{ id: 'B' }] }); await second;
assert.equal(controller.state.events[0].id, 'A', 'late calendar range cannot replace current cached range');
assert.equal(controller.state.loading, false);
const failed = controller.load('C', 'C-end');
pending[2].resolve({ data: [], error: 'temporary' }); await failed;
assert.equal(controller.state.errors, 1);
const retry = controller.load('C', 'C-end');
assert.equal(pending.length, 4, 'failed calendar range can be retried');
pending[3].resolve({ data: [] }); await retry;
assert.equal(controller.state.loading, false);

const logbook = fs.readFileSync('src/features/logbook/components/LogbookView.tsx', 'utf8');
const entryStart = logbook.indexOf('    const fetchEntries = async');
const entryEnd = logbook.indexOf('    const fetchTasks = async', entryStart);
assert.ok(entryStart >= 0 && entryEnd > entryStart);
const { logbookHarness } = load(`export function logbookHarness(response: any) {
    const groupId = 'test-group', entries: any[] = [], ITEMS_PER_PAGE = 50;
    const state = { loading: true, ready: false, entries: [] as any[], errors: 0 };
    const chain: any = { then: (resolve: any, reject: any) => Promise.resolve(response).then(resolve, reject) };
    for (const method of ['select', 'eq', 'limit', 'lte', 'lt', 'gt', 'order']) chain[method] = () => chain;
    const supabase = { from: () => chain };
    const setIsLoadingMore = (value: boolean) => { state.loading = value; };
    const setIsReady = (value: boolean) => { state.ready = value; };
    const setEntries = (value: any) => { state.entries = typeof value === 'function' ? value(state.entries) : value; };
    const setHasMore = () => {}, setHasMoreDown = () => {};
    const toast = { error: () => { state.errors++; } };
    ${logbook.slice(entryStart, entryEnd)}
    return { load: fetchEntries, state };
}`);
const empty = logbookHarness({ data: [], error: null }); await empty.load();
assert.equal(empty.state.ready, true, 'empty logbook becomes visible');
assert.equal(empty.state.loading, false);
const error = logbookHarness({ data: null, error: { message: 'offline' } }); await error.load();
assert.equal(error.state.ready, true, 'failed logbook does not stay hidden');
assert.equal(error.state.errors, 1);
console.log('PASS loading lifecycle: calendar deduplication/races/retry; logbook empty/error completion');

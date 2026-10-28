import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const rows = [{ id: 'c1', data: { raman_drive_sync: { status: 'pending', job_id: 'job-1', name: 'reference.json', payload: { data: [{ x: 1, y: 2 }] } } } }];
let networkFailure = true, uploads = [], writes = [], conflict = false, verified = true;
const requests = [];
const context = { exports: {}, Blob, crypto, require(name) {
    if (name === '@/lib/google/desktop-drive') return { desktopDriveCommand: async()=>verified, ramanDriveFetch: async (url, options = {}) => {
        requests.push(url);
        if (url.includes('generateIds')) return { ok: true, json: async () => ({ ids: ['stable-id'] }) };
        if (options.method === 'POST') {
            uploads.push(await options.body.text());
            if (networkFailure) { networkFailure = false; throw new Error('response lost'); }
            return { ok: false, status: 409 };
        }
        return { ok: true, json: async () => ({ id: 'stable-id', appProperties: { nexusRamanJob: conflict ? 'other-job' : 'job-1' } }) };
    } };
    if (name === './raman-reference-actions') return {
        getPendingRamanReferencesAction: async () => ({ data: rows.filter(r => r.data.raman_drive_sync.status === 'pending') }),
        updateRamanReferenceSyncAction: async input => {
            writes.push(input);
            const job = rows[0].data.raman_drive_sync;
            if (input.complete) { job.status = 'synced'; rows[0].data.raman_spectrum_file_id = input.fileId; }
            else job.file_id = input.fileId;
            return { fileId: input.fileId };
        },
    };
    throw new Error(name);
} };
vm.runInNewContext(compile(fs.readFileSync('src/features/samples/raman-reference-sync.ts', 'utf8')), context);
const sync = context.exports.syncPendingRamanReferences;
await assert.rejects(sync('group'), /response lost/);
assert.equal(rows[0].data.raman_drive_sync.status, 'pending');
assert.equal(rows[0].data.raman_drive_sync.file_id, 'stable-id');
assert.equal(rows[0].data.raman_spectrum_file_id, undefined);
let result = await sync('group');
assert.equal(result.synced, 1);
assert.equal(requests.filter(url => url.includes('generateIds')).length, 1, 'retry reuses persisted Drive ID');
assert.ok(uploads.every(body => body.includes('stable-id')));
assert.equal(writes.filter(w => w.complete).length, 1, 'only confirmed files are linked');
rows[0].data.raman_drive_sync.status = 'pending'; conflict = true;
await assert.rejects(sync('group'), /different reference/);
assert.equal(rows[0].data.raman_drive_sync.status, 'pending');
let length = requests.length; verified=false; await assert.rejects(sync('group'), /modified after saving/); assert.equal(requests.length,length); verified=true;
await sync('group', () => false); assert.equal(requests.length, length);

// Real token/fetch adapter: native detection, account scoping, one refresh on 401.
let forceCalls = [], attempts = 0;
const adapter = { exports: {}, Headers, AbortSignal, window: { __TAURI_INTERNALS__: {}, location: { pathname: '/11111111-1111-1111-1111-111111111111/samples' } },
    fetch: async (url, options) => { attempts++; assert.ok(options.headers.Authorization.startsWith('Bearer ')); return { status: attempts === 1 ? 401 : 200 }; },
    require(name) {
        if (name === '@/lib/supabase/client') return { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) } }) };
        if (name === '@tauri-apps/api/core') return { invoke: async (command, params) => { assert.equal(command, 'google_drive_token'); assert.equal(params.userId, 'user-a'); forceCalls.push(params.force); return params.force ? 'renewed' : 'cached'; } };
        throw new Error(name);
    } };
vm.runInNewContext(compile(fs.readFileSync('src/lib/google/desktop-drive.ts', 'utf8')), adapter);
assert.equal((await adapter.exports.ramanDriveFetch('https://www.googleapis.com/drive/v3/files')).status, 200);
assert.deepEqual(forceCalls, [false, true]);
await assert.rejects(adapter.exports.ramanDriveToken(undefined, false, 'other-user'), /Session changed/);
delete adapter.window.__TAURI_INTERNALS__; assert.equal(adapter.exports.hasNativeDrive(), false, 'localhost alone is not native');

// Server adapter: only small RPC parameters leave the server; Postgres concurrency
// and RLS behavior are tested against the real DB in a ROLLBACK transaction.
let member = true, rpcResult = {data:{fileId:'new-ref'}}, rpcCalls=[];
const server = { exports: {}, require(name) {
    if(name==='@/lib/supabase/server')return {
        getUser:async()=>({id:'user'}),createClient:async()=>({
            from(table){assert.equal(table,'group_members');const query={select(){return query;},eq(){return query;},maybeSingle:async()=>({data:member?{id:'m'}:null})};return query;},
            rpc:async(name,params)=>{rpcCalls.push({name,params});return rpcResult;}
        })
    };
    throw Error(name);
}};
vm.runInNewContext(compile(fs.readFileSync('src/features/samples/raman-reference-actions.ts','utf8')),server);
const update=server.exports.updateRamanReferenceSyncAction;
let confirmed=await update({groupId:'g',id:'c',jobId:'job',fileId:'new-ref',complete:true});
assert.equal(confirmed.fileId,'new-ref');
assert.equal(rpcCalls[0].name,'update_raman_reference_sync_safe');
assert.equal(rpcCalls[0].params.p_complete,true);
assert.equal(rpcCalls[0].params.p_job_id,'job');
assert.equal(Object.keys(rpcCalls[0].params).length,5,'no spectrum snapshot in request URL');
rpcResult={data:{stale:true}};assert.equal((await update({groupId:'g',id:'c',jobId:'job',fileId:'new-ref'})).stale,true);
rpcResult={error:{message:'write rejected'}};assert.equal((await update({groupId:'g',id:'c',jobId:'job',fileId:'new-ref'})).error,'write rejected');
member=false;const callsBefore=rpcCalls.length;assert.ok((await update({groupId:'g',id:'c',jobId:'job',fileId:'new-ref'})).error);assert.equal(rpcCalls.length,callsBefore);
console.log('Raman Drive: native refresh, durable retries, stable IDs, confirmation, identity and scoped RPC passed');

// Real Raman submit callback: preserve old link, enqueue before any Drive call,
// and block a second click while Supabase is saving.
const modal = fs.readFileSync('src/features/samples/components/characterization-modal.tsx','utf8');
const submitSource = modal.slice(modal.indexOf('    const handleSubmit ='), modal.indexOf('    // Google Doc Generation Helper'));
let saveResolve, submitted=[], events=[], saveErrors=[];
const { File } = await import('node:buffer');
const submitContext = { exports:{}, Blob, File, crypto, console,
    submittingRef:{current:false},setIsSubmitting(){},type:'Raman',scriptsLoaded:true,
    hasNativeDrive:()=>true,desktopDriveIdentity:async()=>({userId:'owner'}),desktopDriveCommand:async()=> 'signature',isAddingCustomType:false,customTypeName:'',dataFields:[],initialData:{id:'existing',data:{raman_spectrum_file_id:'old-file'}},
    notes:'',equipment:'',fileOrigin:'',driveFileLink:'',h5RelativePaths:[],localFilePaths:[],fileMetadata:{},
    isDesktop:true,ramanSpectrum:'1 2\n3 4',performedAt:'',sample:{id:'sample',sample_code:'A1',name:'Example'},
    driveSettings:{sampleFolderId:'folder'},pastedImages:[],setParameterOrder(){},updateBatch:false,groupId:'group',
    localStorage:{getItem:()=>null,setItem(){}},window:{dispatchEvent:event=>events.push(event.type)},Event,
    toast:{error:error=>saveErrors.push(error),success(){},info(){}},onClose(){},
    uploadFileToDrive(){throw Error('Native submit must not upload before Supabase confirmation');},
    updateCharacterizationAction:input=>{submitted.push(input);return new Promise(resolve=>saveResolve=resolve);},
};
vm.runInNewContext(compile(submitSource+'\nexports.submit=handleSubmit;'),submitContext);
let saving = submitContext.exports.submit({preventDefault(){}});
await submitContext.exports.submit({preventDefault(){}});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(submitted.length,1);assert.equal(events.length,0);
assert.equal(submitted[0].data.raman_spectrum_file_id,'old-file');
assert.equal(submitted[0].data.raman_drive_sync.status,'pending');
assert.equal(submitted[0].data.raman_drive_sync.payload.data.length,2);
assert.equal(submitted[0].data.raman_drive_sync.payload.parameters.raman_drive_sync,undefined);
saveResolve({success:true});await saving;
assert.deepEqual(events,['phdnexus-raman-pending']);assert.equal(submitContext.submittingRef.current,false);
saving=submitContext.exports.submit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));saveResolve({error:'write failed'});await saving;
assert.equal(events.length,1);assert.deepEqual(saveErrors,['write failed']);
console.log('Raman submit: durable-first save, old link retention, duplicate-click guard and failed-save isolation passed');

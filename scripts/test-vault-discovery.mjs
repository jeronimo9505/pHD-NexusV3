import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync('src/features/map-analyzer/actions.ts','utf8');
const action = source.slice(source.indexOf('export async function getVaultSamplesAction'), source.indexOf('export async function getRamanWorkspacesAction'));
const calls = [];
let pages = [], failure = false;
const context = { exports: {}, createClient: async () => ({ from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const query = { select(fields) { call.fields=fields; return query; }, eq(k,v) {call.filters.push([k,v]);return query;}, order(k) {call.order=k;return query;}, range(a,b) {call.range=[a,b];return Promise.resolve(failure ? {error:{message:'denied'}} : {data:pages.shift() || []});} };
    return query;
} }) };
vm.runInNewContext(ts.transpileModule(action,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
const load = context.exports.getVaultSamplesAction;
assert.ok((await load('g','')).error); assert.equal(calls.length,0);
pages=[[{id:'s',characterizations:[{type:'Raman',data:{local_h5_paths:['map.h5']}}]}]];
let result=await load('g','book');
assert.equal(result.data[0].characterizations[0].data.local_h5_paths[0],'map.h5');
assert.deepEqual(calls[0].filters,[['group_id','g'],['logbook_id','book'],['characterizations.type','Raman']]);
assert.match(calls[0].fields,/data, performed_at, created_at/);
pages=[Array.from({length:500},(_,i)=>({id:i})),[{id:500}]];
result=await load('g'); assert.equal(result.data.length,501);
assert.equal(calls[1].fields,'id, name, sample_code, logbook_id');
assert.deepEqual(calls[2].range,[500,999]);
failure=true; assert.equal((await load('g','book')).error,'denied');
const modal=fs.readFileSync('src/features/map-analyzer/components/vault-explorer-modal.tsx','utf8');
assert.doesNotMatch(modal,/getSamplesAction/);
assert.match(modal,/getVaultSamplesAction\(groupId, dbLb.id\)/);
assert.match(modal,/request !== discoveryRequest.current/);
assert.match(modal,/if \(samplesRes.error\) throw/);
const parent=fs.readFileSync('src/features/map-analyzer/components/desktop-map-analyzer.tsx','utf8');
assert.doesNotMatch(parent,/getSamplesAction/);
console.log('Vault discovery regression checks passed');
// Exercise the real selection callback with a Supabase-shaped response.
const handlerSource=modal.slice(modal.indexOf('    const handleSelectLogbook ='),modal.indexOf('    const handleSelectSample ='));
let displayed=[], errorMessage=null, stateLoading=false, pending=[];
const requestContext={exports:{},groupId:'g',discoveryRequest:{current:0},
 getVaultSamplesAction:()=>new Promise(resolve=>pending.push(resolve)),
 setLoadError:v=>errorMessage=v,setFiles:v=>displayed=v,setDbSamples:()=>{},setSelectedPaths:()=>{},setStep:()=>{},setSearch:()=>{},setFacetFilters:()=>{},setStatusFilter:()=>{},setDateFrom:()=>{},setDateTo:()=>{},setLoading:v=>stateLoading=v,setSelectedDbLogbook:()=>{},setIsLegacyMode:()=>{},setSelectedSample:()=>{},toast:{error:()=>{}}};
vm.runInNewContext(ts.transpileModule(handlerSource+'\nexports.select=handleSelectLogbook;',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,requestContext);
const select=requestContext.exports.select;
let first=select({id:'a'}), second=select({id:'b'});
pending[1]({data:[{name:'sample',sample_code:'A1',characterizations:[{id:'c',type:'Raman',data:{local_h5_paths:[],local_h5_path:'folder/map.h5',file_metadata:{'folder/map.h5':{spectra:25}}}}]}]});
await second;assert.equal(displayed.length,1);assert.equal(displayed[0].n_spectra,25);
pending[0]({data:[]});await first;assert.equal(displayed.length,1,'older logbook must not replace newer maps');
first=select({id:'a'});pending[2]({error:'denied'});await first;
assert.ok(errorMessage);assert.equal(displayed.length,0);assert.equal(stateLoading,false);
console.log('Vault callback: cloud paths, singular fallback, stale response and errors passed');

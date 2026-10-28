import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const calls=[];let allowed=true;
const client={from(table){calls.push(['from',table]);return {
    select(value){calls.push(['select',value]);return this;},eq(key,value){calls.push(['eq',key,value]);return this;},
    or(value){calls.push(['or',value]);return this;},order(key){calls.push(['order',key]);return this;},
    in(key,value){calls.push(['in',key,Array.from(value)]);return this;},
    range:async(start,end)=>{calls.push(['range',start,end]);return{data:[{id:'record',sample_id:'sample',source_hash:'a'.repeat(64),object_id:'21',attached_ids:['27'],samples:{sample_code:'A24',display_id:'24',name:'Grid',logbook_id:'logbook',logbooks:{name:'SERS'}}}],error:null};},
    maybeSingle:async()=>({data:allowed?{id:'member'}:null,error:null}),
    limit:async count=>{calls.push(['limit',count]);return{data:[{id:'sample',sample_code:'A23-c4'}],error:null};}
};}};
const context={exports:{},require(name){
    if(name==='@/lib/supabase/server')return{createClient:async()=>client,getUser:async()=>({id:'user'})};
    if(name==='next/cache')return{revalidatePath(){}};
    if(name==='./actions')return{createCharacterizationAction:async input=>({id:input.record_id,created:true})};
    throw new Error(`Unexpected import ${name}`);
}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/samples/wip-actions.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,context);
const search=context.exports.getWipSampleCatalogAction;
await search('group');assert.equal(calls.length,0,'empty input must not fetch the sample catalog');
const result=await search('group','A23');
assert.equal(result.data[0].id,'sample');
assert.ok(calls.some(call=>JSON.stringify(call)==='["eq","group_id","group"]'));
assert.ok(calls.some(call=>JSON.stringify(call)==='["or","sample_code.ilike.A23%,display_id.ilike.A23%"]'));
assert.ok(calls.some(call=>JSON.stringify(call)==='["limit",20]'));
calls.length=0;await search('group','','default-sample');
assert.ok(calls.some(call=>JSON.stringify(call)==='["eq","id","default-sample"]'));
calls.length=0;await search('group','%,()');assert.equal(calls.length,0);
allowed=false;calls.length=0;
assert.ok((await search('group','A23')).error);
assert.ok(!calls.some(call=>JSON.stringify(call)==='["from","samples"]'),'unauthorized search never reaches samples');
const history=context.exports.getWipImportHistoryAction;
calls.length=0;await history('group',['invalid']);assert.equal(calls.length,0);
assert.ok((await history('group',['a'.repeat(64)])).error);
allowed=true;calls.length=0;
const imported=await history('group',['a'.repeat(64)]);
assert.equal(imported.data[0].sample_label,'A24 · Grid');
assert.equal(imported.data[0].sample.id,'sample');
assert.equal(imported.data[0].attached_ids[0],'27');
assert.ok(calls.some(call=>JSON.stringify(call)==='["eq","samples.group_id","group"]'));
assert.ok(calls.some(call=>call[0]==='in'&&call[1]==='data->wip_import->>source_hash'));
console.log('PASS WIP sample search: no full catalog, ID-prefix autocomplete, limit 20, explicit selection, group authorization');

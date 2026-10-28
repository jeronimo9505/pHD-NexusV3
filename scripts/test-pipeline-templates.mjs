import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let slots=[], cursor=0, effects=[], requests=[], writes=[], failSave=false;
const legacy=JSON.stringify({ali:[{type:'crop'}],Existing:[{type:'normalize'}]});
const context={exports:{},localStorage:{getItem:()=>legacy},require(name){
 if(name==='react')return {
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useEffect(callback,deps){const i=cursor++;const prev=slots[i];if(!prev||deps.some((v,j)=>v!==prev.deps[j])){prev?.cleanup?.();effects.push(()=>{slots[i]={deps,cleanup:callback()};});}}
 };
 if(name==='./actions')return {
  getPipelineTemplatesAction(group){return new Promise(resolve=>requests.push({group,resolve}));},
  savePipelineTemplateAction(input){return new Promise(resolve=>writes.push({input,resolve}));}
 };
 throw Error(name);
}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/map-analyzer/use-pipeline-templates.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
let group='g';
function render(){cursor=0;const value=context.exports.usePipelineTemplates(group);const pending=effects;effects=[];pending.forEach(fn=>fn());return value;}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
render();requests[0].resolve({data:[{id:'cloud',name:'Existing',steps:[{type:'baseline'}]}]});await settle();
let state=render();assert.equal(state.localCount,1);assert.equal(state.templates.Existing[0].type,'baseline');
let importing=state.importLocal();assert.equal(writes.length,1);assert.equal(writes[0].input.name,'ali');
assert.equal(await state.save('duplicate',[]),false,'same-tick duplicate blocked');
writes[0].resolve({data:{...writes[0].input,id:'ali'}});assert.equal(await importing,1);
state=render();assert.equal(state.localCount,0);assert.equal(context.localStorage.getItem(),legacy,'local backup retained');
let saving=state.save('ali',[{type:'despike'}]);assert.equal(writes[1].input.id,'ali');
writes[1].resolve({error:'permission denied'});await assert.rejects(saving,/permission denied/);
state=render();assert.equal(state.templates.ali[0].type,'crop','failed save preserves confirmed data');
saving=state.save('ali',[{type:'normalize'}]);
group='other';render();requests[1].resolve({data:[]});await settle();
writes[2].resolve({data:{...writes[2].input,id:'ali'}});assert.equal(await saving,false);
state=render();assert.equal(Object.keys(state.templates).length,0,'old save cannot leak to new group');
state.retry();render();requests[2].resolve({error:'offline'});await settle();
state=render();assert.ok(state.error);assert.equal(await state.save('blocked',[]),false);
const server=fs.readFileSync('src/features/map-analyzer/actions.ts','utf8');
assert.match(server,/Active group membership is required/);
assert.match(server,/\.eq\('group_id', input.group_id\)/);
console.log('Pipeline templates: Supabase reads, migration collisions, duplicate clicks, failures and stale responses passed');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {scanTelegramSecrets} from './check-telegram-secrets.mjs';
const fakeToken=['123','456','789'].join('')+':'+ 'A'.repeat(35);
assert.ok(scanTelegramSecrets(`const token="${fakeToken}";`,'route.ts').length);
assert.ok(scanTelegramSecrets('TELEGRAM_BOT_TOKEN=example','.env').length);
assert.equal(scanTelegramSecrets('TELEGRAM_BOT_TOKEN="encrypted:ciphertext"','.env').length,0);
assert.ok(!JSON.stringify(scanTelegramSecrets(fakeToken,'test.txt')).includes(fakeToken));

class NextResponse extends Response {static json(body,options){return new NextResponse(JSON.stringify(body),{...options,headers:{'Content-Type':'application/json',...options?.headers}});}}
function route(kind,{signedIn=true,member=true,entry=true,deleted=true,failTelegram=false}={}) {
    const calls=[],logs=[],filters=[];
    const client={from(table){
        let operation='select';
        const query={select(){return query;},eq(key,value){filters.push([table,key,value]);return query;},contains(key,value){filters.push([table,key,value]);return query;},limit(){return query;},
            insert(){operation='insert';return query;},update(){operation='update';return query;},delete(){operation='delete';return query;},
            single:async()=>result(),maybeSingle:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};
        function result(){
            if(table==='group_members')return {data:member?{id:'member'}:null};
            if(table==='profiles')return {data:{id:'user'}};
            if(table==='logbook_entries')return {data:operation==='delete'?(deleted?{id:'entry'}:null):operation==='insert'?{id:'entry'}:entry?{id:'entry',group_id:'group',telegram_message_id:1,telegram_chat_id:'chat'}:null};
            return {data:null};
        }
        return query;
    }};
    const context={exports:{},Response,Headers,FormData,URL,console:{error:(...args)=>logs.push(args)},process:{env:{TELEGRAM_BOT_TOKEN:fakeToken,TELEGRAM_CHAT_ID:'chat'}},
        fetch:async(url)=>{calls.push(url);if(failTelegram)throw new Error('Request failed '+url);return new Response(JSON.stringify({ok:true,result:{message_id:10,file_path:'photos/photo.jpg'}}),{status:200,headers:{'content-type':'application/json'}});},
        require(name){if(name==='next/server')return{NextResponse};if(name==='@/lib/supabase/server')return{createClient:async()=>client,getUser:async()=>signedIn?{id:'user'}:null};throw new Error(name);}};
    const compiled=ts.transpileModule(fs.readFileSync(`src/app/api/logbook/${kind}/route.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(compiled,context);
    return {...context.exports,calls,logs,filters};
}
const request={url:'https://nexus.test/api/logbook/image?file_id=photo',headers:new Headers({'content-type':'application/json'}),json:async()=>({id:'entry',groupId:'group',text:'Logbook text'})};
for(const kind of ['send','delete','image']) {
    const method=kind==='send'?'POST':kind==='delete'?'DELETE':'GET';
    const anonymous=route(kind,{signedIn:false});assert.equal((await anonymous[method](request)).status,401);assert.equal(anonymous.calls.length,0);
    const forbidden=route(kind,{member:false});assert.ok([403,404].includes((await forbidden[method](request)).status));assert.equal(forbidden.calls.length,0);
    const failure=route(kind,{failTelegram:true});await failure[method](request);assert.ok(!JSON.stringify(failure.logs).includes(fakeToken),`${kind} logged credential-bearing errors`);
}
const noEntry=route('image',{entry:false});assert.equal((await noEntry.GET(request)).status,404);assert.equal(noEntry.calls.length,0);
const image=route('image');const response=await image.GET(request);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
assert.ok(image.filters.some(([table,key])=>table==='logbook_entries'&&key==='media_files'));
const deniedDeletion=route('delete',{deleted:false});assert.equal((await deniedDeletion.DELETE(request)).status,403);assert.equal(deniedDeletion.calls.length,0);
console.log('PASS Telegram security: session/group access, media ownership, successful-deletion requirement, private caching, secret-free logs and redacted scan findings');

import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nandozap-test-'));
const password=crypto.randomBytes(32).toString('base64url');
const key=crypto.randomBytes(48).toString('base64url');
const server=net.createServer();server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const port=server.address().port;server.close();
const base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(root,'server.mjs')],{
 env:{...process.env,PORT:String(port),NZ_ADMIN_PASSWORD:password,NZ_SESSION_SECRET:key,
 NZ_MASTER_KEY:crypto.randomBytes(48).toString('base64url'),NZ_META_VERIFY_TOKEN:crypto.randomBytes(40).toString('base64url'),
 NZ_DATA_DURABLE:'false',NZ_DB_FILE:path.join(tmp,'db.sqlite')},stdio:['ignore','pipe','pipe']
});
let stderr='';child.stderr.on('data',x=>{stderr+=x.toString();});
async function poll(){for(let i=0;i<60;i++){try{let r=await fetch(base+'/healthz');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,120));}throw Error('Server did not start. '+stderr);}
async function call(p,method='GET',data,cookie=''){
 return fetch(base+p,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(method==='GET'?{}:{'x-nz-action':'admin'})},
  body:method==='GET'?undefined:JSON.stringify(data||{}),redirect:'manual'});
}
try{
 await poll();
 let r=await call('/api/status');assert.equal(r.status,401,'unauthorized status must fail');
 r=await call('/api/login','POST',{password:'wrong'});assert.equal(r.status,401,'wrong password must fail');
 r=await call('/api/login','POST',{password});assert.equal(r.status,200,'admin login must succeed');
 const cookie=r.headers.get('set-cookie')?.split(';')[0]||'';
 assert.ok(cookie.startsWith('nz_session='),'http-only session cookie needed');
 r=await call('/api/status','GET',undefined,cookie);assert.equal(r.status,200);
 let payload=await r.json();assert.equal(payload.durable,false);assert.equal(payload.contacts,0);
 r=await call('/api/demo','POST',{},cookie);assert.equal(r.status,200,'demo creation');
 r=await call('/api/chats','GET',undefined,cookie);assert.equal(r.status,200);
 payload=await r.json();assert.equal(payload.chats.length,1);
 const id=payload.chats[0].id;
 r=await call('/api/messages?contact_id='+id,'GET',undefined,cookie);assert.equal(r.status,200);
 payload=await r.json();assert.equal(payload.messages.length,1);
 r=await call('/api/send','POST',{contactId:id,text:'teste'},cookie);assert.equal(r.status,503,'temporary storage must block real sends');
 r=await call('/webhooks/meta','POST',{object:'whatsapp_business_account'});assert.equal(r.status,503,'temporary storage must block real inbound');
 r=await call('/webhooks/meta?hub.mode=subscribe&hub.verify_token=abc&hub.challenge=123');assert.equal(r.status,503);
 r=await call('/api/create-mcp-key','POST',{},cookie);assert.equal(r.status,200);
 const mcpKey=(await r.json()).key;assert.ok(mcpKey.length>=32);
 r=await fetch(base+'/mcp',{method:'POST',headers:{authorization:'Bearer '+mcpKey,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
 assert.equal(r.status,200);payload=await r.json();assert.ok(payload.result.tools.some(t=>t.name==='listar_conversas'));
 r=await call('/api/export','GET',undefined,cookie);assert.equal(r.status,200);
 payload=await r.json();assert.equal(payload.contacts.length,1);assert.ok(!JSON.stringify(payload).includes('NZ_MASTER_KEY'));
 r=await call('/api/delete-contact','POST',{contactId:id},cookie);assert.equal(r.status,200);
 r=await call('/api/chats','GET',undefined,cookie);assert.equal((await r.json()).chats.length,0);
 console.log('NandoZap standalone smoke checks passed: login, protection, inbox, demo, MCP, export, delete and blocked real traffic.');
}finally{
 child.kill('SIGTERM');
 await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,1500);});
 fs.rmSync(tmp,{recursive:true,force:true});
}
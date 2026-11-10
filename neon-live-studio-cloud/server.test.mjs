import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const PORT=34000+Math.floor(Math.random()*2000);
const BASE='http://127.0.0.1:'+PORT;
const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1',NEON_ADMIN_KEY:'valid-test-key-1234567'},stdio:['ignore','pipe','pipe']});
let log='';
child.stderr.on('data',d=>log+=d);
child.stdout.on('data',d=>log+=d);
async function wait(){for(let i=0;i<90;i++){if(child.exitCode!==null)throw new Error('Servidor encerrou: '+log);try{const r=await fetch(BASE+'/health');if(r.ok)return;}catch{}await delay(100);}throw new Error('Servidor não iniciou: '+log);}
async function send(route,body={},cookie=''){const r=await fetch(BASE+route,{method:'POST',headers:{'content-type':'application/json','x-neon-request':'1',...(cookie?{cookie}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};}
await wait();
try{
 await test('site HTML publicado e modo multiplayer habilitado',async()=>{let r=await fetch(BASE);assert.equal(r.status,200);let h=await r.text();assert.match(h,/name="neon-multiplayer"/);assert.match(h,/id="stage"/);});
 await test('health and public state',async()=>{let r=await fetch(BASE+'/health');assert.equal(r.status,200);assert.equal((await r.json()).version,'realtime');r=await fetch(BASE+'/api/state');assert.equal(r.status,200);let s=await r.json();assert.equal(s.isHost,false);assert.equal(s.phase,'inscricao');});
 await test('viewer cannot control the host',async()=>{let r=await send('/api/host/action',{action:'demo'});assert.equal(r.status,401);});
 let cookie='';
 await test('host login requires correct secret',async()=>{let a=await send('/api/host/login',{key:'incorrect'});assert.equal(a.status,401);let b=await send('/api/host/login',{key:'valid-test-key-1234567'});assert.equal(b.status,200);assert.match(b.cookie,/HttpOnly/);assert.match(b.cookie,/Secure/);cookie=b.cookie.split(';')[0];assert.ok(cookie);});
 await test('viewer enrollment enforces uniqueness',async()=>{let a=await send('/api/join',{name:'Maria'});assert.equal(a.status,200);let b=await send('/api/join',{name:'Maria'});assert.equal(b.status,409);});
 await test('host adds bots and starts race',async()=>{let a=await send('/api/host/action',{action:'demo'},cookie);assert.equal(a.status,200);let b=await send('/api/host/action',{action:'start'},cookie);assert.equal(b.status,200);let r=await fetch(BASE+'/api/state');let s=await r.json();assert.equal(s.phase,'corrida');assert.ok(s.players.length>=8);});
 await test('likes and gifts are reflected in shared state',async()=>{let a=await send('/api/host/action',{action:'like'},cookie);assert.equal(a.status,200);let b=await send('/api/host/action',{action:'rose'},cookie);assert.equal(b.status,200);let s=await(await fetch(BASE+'/api/state')).json();assert.equal(s.likes,15);assert.equal(s.gifts,1);});
 await test('quiz question and duplicate answer prevention',async()=>{let a=await send('/api/host/action',{action:'select',game:'quiz'},cookie);assert.equal(a.status,200);assert.equal((await send('/api/join',{name:'Maria'})).status,200);assert.equal((await send('/api/host/action',{action:'start'},cookie)).status,200);let q=await(await fetch(BASE+'/api/state')).json();assert.equal(q.game,'quiz');let r=await send('/api/answer',{name:'Maria',choice:0});assert.equal(r.status,200);assert.equal(r.body.correct,true);let again=await send('/api/answer',{name:'Maria',choice:0});assert.equal(again.status,409);});
 await test('reject cross-origin mutation',async()=>{let r=await fetch(BASE+'/api/host/action',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json','x-neon-request':'1',cookie},body:JSON.stringify({action:'next'})});assert.equal(r.status,403);});
}finally{child.kill('SIGTERM');}

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const w0=source.indexOf('const TAU=Math.PI*2;'),w1=source.indexOf('function createEngine(canvas)',w0);
const p0=source.indexOf('const ORIGINAL_CAR_DATA='),p1=source.indexOf('const q=s=>document.querySelector(s);',p0);
function physics(){
 assert.ok(w0>=0&&w1>w0&&p0>=0&&p1>p0);
 const ctx=vm.createContext({window:{},localStorage:{getItem:()=>null,setItem:()=>{}},console});
 vm.runInContext([source.slice(w0,w1),
  'const RaceNarrator={reset(){},finish(){},overtake(){},tick(){},turbo(){}};',
  source.slice(p0,p1)].join('\n'),ctx,{timeout:4000});
 return ctx;
}
test('release metadata, recuperação WebGL, isolamento de erros e features',()=>{
 assert.match(html,/NEON RUSH V15\.0\.0/);
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/window\.NEON_RUSH_RELEASE=Object\.freeze/);
 assert.match(source,/webglcontextlost/);
 assert.match(source,/webglcontextrestored/);
 assert.match(source,/if\(init3D\(\)&&gridCars\(\)\)/);
 assert.match(source,/visibilitychange/);
 assert.match(source,/Falha no minimapa/);
 for(const id of ['giftFeed','botGifts','lapSelect','nitroBadge','minimap'])assert.match(html,new RegExp('id="'+id+'"'));
 for(const fn of ['makeNitroFlames','makeNamePlate','layoutMinimapMarkers'])assert.match(source,new RegExp('function '+fn+'\\('));
});
test('uma volta real de 10.000 m, da largada até a bandeirada', {timeout:90000},()=>{
 const ctx=physics();
 const program="(()=>{createDrivers();players=players.slice(0,10);raceLaps=1;gamePhase='race';timer=0;nextClose=Infinity;inDiagnosticRun=true;physicsStep.previousOrder=null;let steps=0,error=null;while(gamePhase==='race'&&steps<44000){physicsStep(1/60);steps++;if(steps%60===0){const bad=checkPhysics();if(bad.length){error='overlap:'+JSON.stringify(bad);break;}if(players.some(d=>!Number.isFinite(d.progress)||!Number.isFinite(d.speed)||!Number.isFinite(d.lateral))){error='nonfinite';break;}}}return {phase:gamePhase,steps,meters:Math.max(...players.map(d=>d.progress)),errors:error,seconds:timer,players:players.length};})()";
 const r=vm.runInContext(program,ctx,{timeout:88000});
 assert.equal(r.errors,null,JSON.stringify(r));
 assert.equal(r.phase,'podium',JSON.stringify(r));
 assert.ok(r.meters>=10000,JSON.stringify(r));
 assert.ok(r.steps>6000&&r.steps<44000,JSON.stringify(r));
 assert.equal(r.players,10);
});
test('passagem pela volta 2/3 e chegada na volta 10/10',()=>{
 const ctx=physics();
 const program="(()=>{createDrivers();players=players.slice(0,10);raceLaps=3;gamePhase='race';timer=50;nextClose=Infinity;inDiagnosticRun=true;players[0].progress=9999.8;players[0].speed=32;for(let i=1;i<players.length;i++)players[i].progress=9000-i*70;for(let i=0;i<6;i++)physicsStep(1/60);const mid={phase:gamePhase,meters:players[0].progress,lap:currentLap(players[0].progress)};createDrivers();players=players.slice(0,10);raceLaps=10;gamePhase='race';timer=800;nextClose=Infinity;players[0].progress=99999.9;players[0].speed=35;for(let i=1;i<players.length;i++)players[i].progress=95000-i*70;for(let i=0;i<10&&gamePhase==='race';i++)physicsStep(1/60);return {mid,end:{phase:gamePhase,meters:players[0].progress,laps:raceLaps}};})()";
 const r=vm.runInContext(program,ctx,{timeout:4000});
 assert.equal(r.mid.phase,'race');
 assert.ok(r.mid.meters>10000,JSON.stringify(r));
 assert.equal(r.mid.lap,2);
 assert.equal(r.end.phase,'podium',JSON.stringify(r));
 assert.ok(r.end.meters>=100000,JSON.stringify(r));
 assert.equal(r.end.laps,10);
});
test('dez carros sem colisão na largada e bots identificados como demonstração',()=>{
 const ctx=physics();
 const r=vm.runInContext("(()=>{createDrivers();players=players.slice(0,10);return {n:players.length,overlap:checkPhysics().length,allowed:ALLOWED_LAPS.join(','),botMode:gameOptions.botGifts}})()",ctx);
 assert.equal(r.n,10);
 assert.equal(r.overlap,0);
 assert.equal(r.allowed,'1,2,3,5,10');
 assert.equal(typeof r.botMode,'boolean');
 assert.match(source,/source==='bot'\?'BOT DE TESTE'/);
});
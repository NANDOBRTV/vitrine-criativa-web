'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).join('\n');
const worldStart=source.indexOf('const TAU=Math.PI*2;');
const worldEnd=source.indexOf('function createEngine(canvas)',worldStart);
const physicsStart=source.indexOf('const CAR_DATA=');
const physicsEnd=source.indexOf('const q=s=>document.querySelector(s);',physicsStart);
const roadStart=source.indexOf('function makeRoad(');
const roadEnd=source.indexOf('// V14 real geometry:',roadStart);
const mapStart=source.indexOf('function mapGeometry(');
const mapEnd=source.indexOf('function selectDriver(i)',mapStart);
function context(){
 assert.ok(worldEnd>worldStart&&physicsEnd>physicsStart&&roadEnd>roadStart&&mapEnd>mapStart);
 const sandbox=vm.createContext({window:{},localStorage:{getItem:()=>null,setItem:()=>{}},console});
 vm.runInContext([
  source.slice(worldStart,worldEnd),
  'const RaceNarrator={reset(){},finish(){},overtake(){},tick(){}};',
  source.slice(physicsStart,physicsEnd),
  source.slice(roadStart,roadEnd),
  source.slice(mapStart,mapEnd)
 ].join('\n'),sandbox,{timeout:5000});
 return sandbox;
}
test('10 km exatos e emenda física sem lacuna',()=>{
 const c=context();
 const r=vm.runInContext("(()=>{const a=point(0),b=point(DISTANCE),p=point(-.1),q=point(DISTANCE-.1);return {distance:DISTANCE,arc:TRACK.lengths.at(-1),gap:Math.hypot(a[0]-b[0],a[2]-b[2]),tangent:Math.abs(angle(0)-angle(DISTANCE)),seam:Math.hypot(p[0]-q[0],p[2]-q[2])};})()",c);
 assert.equal(r.distance,10000);
 assert.ok(Math.abs(r.arc-10000)<1e-6);
 assert.ok(r.gap<1e-6);
 assert.ok(r.tangent<1e-6);
 assert.ok(r.seam<1e-5);
});
test('minimapa fechado e transparente',()=>{
 const map=vm.runInContext('mapGeometry(164,194)',context());
 assert.ok(map.center.length>400&&map.center.length<1000);
 const a=map.center[0],b=map.center.at(-1);
 assert.ok(Math.hypot(a[0]-b[0],a[2]-b[2])<1e-6);
 assert.match(html,/\.mapShell\{[^}]*background:transparent;border:0/);
 assert.match(html,/#minimap\{[^}]*background:transparent/);
 assert.match(source,/c\.closePath\(\)/);
 assert.match(source,/mapPoints=used\.length/);
});
test('cenário dividido em trechos para Android',()=>{
 const r=vm.runInContext("(()=>{const a=makeRoad(-155,240),b=makeScenery(-155,240);return {road:a.n,scenery:b.n};})()",context(),{timeout:5000});
 assert.ok(r.road>1000&&r.road<40000,'road vertices='+r.road);
 assert.ok(r.scenery>100&&r.scenery<50000,'scenery vertices='+r.scenery);
 assert.match(source,/gl\.deleteBuffer\(meshes\.road\.buf\)/);
 assert.match(source,/refreshWorldMeshes\(follow\.progress\)/);
});
test('escolha de 1,2,3,5,10 voltas e nomes persistidos',()=>{
 const c=context();
 const r=vm.runInContext("(()=>{gameOptions.laps=5;driverNames['04']='Maria';saveSettings();createDrivers();return {laps:gameOptions.laps,name:players[0].name,valid:ALLOWED_LAPS.join(',')};})()",c);
 assert.equal(r.laps,5);
 assert.equal(r.name,'Maria');
 assert.equal(r.valid,'1,2,3,5,10');
 for(const v of [1,2,3,5,10])assert.match(html,new RegExp('<option value="'+v+'">'));
 assert.match(html,/id="nameInput"/);
 assert.match(html,/id="nameSave"/);
 assert.match(source,/raceLaps=gameOptions\.laps/);
});
test('10 km completados avançam para a segunda volta de três',()=>{
 const c=context();
 const r=vm.runInContext("(()=>{createDrivers();gamePhase='race';raceLaps=3;timer=0;inDiagnosticRun=true;nextClose=Infinity;physicsStep.previousOrder=null;players[0].progress=9999.9;players[0].speed=31;for(let i=1;i<players.length;i++){players[i].progress=-100-i*25;}for(let i=0;i<4;i++)physicsStep(1/60);return {phase:gamePhase,lap:currentLap(players[0].progress),progress:players[0].progress};})()",c,{timeout:3000});
 assert.equal(r.phase,'race');
 assert.equal(r.lap,2);
 assert.ok(r.progress>=10000);
});
test('bandeirada após 3 voltas e sem antigo limite 78 segundos',()=>{
 const c=context();
 const r=vm.runInContext("(()=>{createDrivers();gamePhase='race';raceLaps=3;timer=300;inDiagnosticRun=true;nextClose=Infinity;physicsStep.previousOrder=null;players[0].progress=29999.95;players[0].speed=29;players[0].lateral=-6;players[0].target=-6;for(let i=1;i<players.length;i++)players[i].progress=-100-i*25;physicsStep(1/60);return {phase:gamePhase,progress:players[0].progress};})()",c,{timeout:3000});
 assert.equal(r.phase,'podium');
 assert.ok(r.progress>=30000);
});
test('encontro de carros na junção entre duas voltas não atravessa',()=>{
 const c=context();
 const r=vm.runInContext("(()=>{createDrivers();gamePhase='race';raceLaps=3;timer=100;inDiagnosticRun=true;nextClose=Infinity;players.forEach((p,i)=>{p.progress=-200-i*25;p.speed=20;});players[0].progress=9999;players[0].lateral=2;players[0].target=2;players[1].progress=1;players[1].lateral=2;players[1].target=2;const before=checkPhysics().length;physicsStep(1/60);return {before,after:checkPhysics().length};})()",c,{timeout:3000});
 assert.ok(r.before>0);
 assert.equal(r.after,0);
});
test('placas 3D personalizadas mantêm 10 modelos e pinturas',()=>{
 assert.match(source,/function makeNamePlate\(gl,d\)/);
 assert.match(source,/function replaceNamePlate\(d\)/);
 assert.match(source,/engine\.draw\(sign,M\(/);
 assert.match(source,/d\.name=label;driverNames\[d\.id\]=label/);
 assert.match(source,/function createCarModels\(gl\)/);
 assert.match(source,/function uploadPaint\(gl,canvas\)/);
});
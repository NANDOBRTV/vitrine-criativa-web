import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
const a=html.indexOf('const CAR_DATA='),b=html.indexOf('const q=s=>',a);
const c=html.indexOf('let mapTrack='),d=html.indexOf('function selectDriver(',c);
const e=html.indexOf('window.NEON_RUSH_V14=window.NEON_RUSH_V13='),f=html.indexOf('</script>',e);
assert.ok([a,b,c,d,e,f].every(i=>i>=0)&&a<b&&c<d&&e<f);
const physics=html.slice(a,b),map=html.slice(c,d),publicApi=html.slice(e,f);
const narrator={finish(){},overtake(){},tick(){},reset(){},getState(){return {enabled:false}}};
function run(code,withMap=false){
 return runInNewContext(physics+"const rank=()=>[...players].sort((a,b)=>b.progress-a.progress);"+
 (withMap?map:'')+publicApi+"\n"+code,{
  RaceNarrator:narrator,window:{},localStorage:{getItem(){return null},setItem(){}},console
 },{timeout:15000});
}
test('sintaxe, dez skins, narração e controles preservados',()=>{
 scripts.forEach((src,i)=>assert.doesNotThrow(()=>new Script(src,{filename:'inline-'+i})));
 for(const id of ['world','minimap','mapShell','mapCount','mapLegend','gameSettings','quality','mute','narrator','mapToggle','rank','boost','gift','camera','choose','close','restart','full','picker','webglFail'])
  assert.ok(html.includes('id="'+id+'"'),'Falta #'+id);
 for(const txt of ['createCarModels(gl)','makeRoad()','makeWheel()','stockcar-viewer.html','const RaceNarrator=','RaceNarrator.finish','const CAR_DATA='])
  assert.ok(html.includes(txt),txt);
});
test('pista contínua e dez pontos numerados no minimapa',()=>{
 const r=run("createDrivers();const canvas={width:164,height:194,getContext:()=>ctx};"+
 "const ctx={beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},save(){},restore(){},setLineDash(){},arc(){},fillText(){}};"+
 "const els={'#minimap':canvas,'#mapCount':{textContent:''},'#mapLegend':{textContent:''}};const q=x=>els[x];"+
 "drawMap();const headings=[...Array(681)].map((_,i)=>angle(START+i));"+
 "return {points:mapPoints,unique:mapUnique,samples:mapTrack.center.length,label:els['#mapCount'].textContent,turn:Math.max(...headings.slice(1).map((v,i)=>Math.abs(v-headings[i]))),grid:[0,-8,-16].map(p=>point(START+p,0)[2])};",true);
 assert.equal(r.points,10);assert.equal(r.unique,10);assert.ok(r.samples>170);
 assert.equal(r.label,'10/10');assert.ok(r.turn<.25);
 assert.equal(new Set(r.grid).size,3);
});
test('contato longitudinal é corrigido, sem carros sobrepostos',()=>{
 const r=run("createDrivers();gamePhase='race';timer=0;physicsStep.previousOrder=null;"+
 "players[0].progress=100;players[4].progress=98;players[0].speed=players[4].speed=0;"+
 "const before=checkPhysics().length;physicsStep(1/60);return {before,after:checkPhysics().length,gap:players[0].progress-players[4].progress,min:SAFE_GAP};");
 assert.equal(r.before,1);assert.equal(r.after,0);assert.ok(r.gap>=r.min-1e-7);
});
test('80 corridas de estresse de física com ultrapassagens e sem NaN',()=>{
 const r=run("let issues=0,ticks=0,passes=0;"+
 "function random(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}}"+
 "for(let seed=1;seed<=80;seed++){const rnd=random(seed);createDrivers();gamePhase='race';timer=0;physicsStep.previousOrder=null;passingEvents=0;"+
 "for(const p of players){p.maxSpeed=18+20*rnd();p.speed=10+24*rnd();p.boost=rnd()<.3?4:0;p.lastLaneChange=-99;}"+
 "for(let i=0;i<700;i++){if(gamePhase!=='race')break;physicsStep(1/60);ticks++;"+
 "if(checkPhysics().length||players.some(p=>![p.progress,p.lateral,p.speed].every(Number.isFinite))){issues++;break;}}passes+=passingEvents;}"+
 "return {issues,ticks,passes};");
 assert.equal(r.issues,0);assert.ok(r.ticks>30000);assert.ok(r.passes>100);
});
test('simulação de diagnóstico não altera a corrida visível',()=>{
 const r=run("createDrivers();gamePhase='gpu-error';"+
 "const snapshot=()=>JSON.stringify({gamePhase,timer,players,focus,watchOvertake,collisionEvents,passingEvents});"+
 "const before=snapshot();const report=window.NEON_RUSH_V14.testRun(35);const after=snapshot();"+
 "let bounded=false;try{window.NEON_RUSH_V14.testRun(100000)}catch(e){bounded=e instanceof RangeError;}"+
 "return {same:before===after,bounded,passes:report.passes,drivers:report.drivers.length};");
 assert.equal(r.same,true);assert.equal(r.bounded,true);assert.equal(r.drivers,10);assert.ok(r.passes>0);
});
test('WebGL no Android, áudio, qualidade ECO e HUD otimizado',()=>{
 for(const txt of ['webglcontextlost','webglcontextrestored','setupWebGLRecovery();','gamePhase=\'gpu-error\'',
   "gameOptions.quality==='eco'?1:1.35",'lastHudPaint','lastMapPaint','cpuRenderMs','saveSettings()',
   "q('#narrator').onclick","q('#camera').onclick","q('#quality').onclick"])
   assert.ok(html.includes(txt),txt);
});

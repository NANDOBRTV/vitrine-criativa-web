'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
function env(){
 const a=source.indexOf('const TAU=Math.PI*2;'),b=source.indexOf('function createEngine(canvas)',a);
 const p=source.indexOf('const CAR_DATA='),q=source.indexOf('const q=s=>document.querySelector(s);',p);
 const m=source.indexOf('function mapGeometry(w,h)'),n=source.indexOf('function selectDriver(i)',m);
 assert.ok(a>=0&&b>a&&p>=0&&q>p&&m>=0&&n>m);
 const calls=[],canvas2d={};
 for(const fn of ['clearRect','save','restore','beginPath','closePath','moveTo','lineTo','stroke','fill','arc','fillText','setLineDash']){
  canvas2d[fn]=(...args)=>{calls.push([fn,...args]);};
 }
 const canvas={width:164,height:194,getContext:()=>canvas2d};
 const elements={};
 const document={querySelector(sel){return sel==='#minimap'?canvas:(elements[sel]??={textContent:''});}};
 const sandbox=vm.createContext({console,window:{},document,localStorage:{getItem:()=>null,setItem:()=>{}}});
 const script=[
  source.slice(a,b),
  'const RaceNarrator={reset(){},finish(){},overtake(){},tick(){},turbo(){}};',
  source.slice(p,q),
  'const q=s=>document.querySelector(s);const rank=()=>[...players].sort((a,b)=>b.progress-a.progress);',
  'let mapTrack=null,mapPoints=0,mapUnique=0,mapFrames=0;',
  source.slice(m,n)
 ].join('\n');
 vm.runInContext(script,sandbox,{timeout:5000});return {sandbox,calls};
}
function run(sandbox,expression){
 return JSON.parse(JSON.stringify(vm.runInContext(expression,sandbox,{timeout:10000})));
}
function validate(markers,label){
 assert.equal(markers.length,10,label+': missing car');
 const ids=new Set(markers.map(m=>m.id));assert.equal(ids.size,10,label+': duplicate');
 for(let i=0;i<markers.length;i++){
  const a=markers[i];
  assert.ok(a.x>=8&&a.x<=156&&a.y>=8&&a.y<=186,label+': outside map '+a.id);
  for(let j=i+1;j<markers.length;j++){
   const b=markers[j],d=Math.hypot(a.x-b.x,a.y-b.y);
   assert.ok(d>=14,label+': badges overlapped '+a.id+' '+b.id+': '+d);
  }
 }
}
test('largada usa quatro colunas de carros lado a lado e três fileiras, nunca uma fila única',()=>{
 const {sandbox,calls}=env();
 const state=run(sandbox,"(()=>{createDrivers();drawMap();return mapMarkerState.map(p=>({...p}));})()");
 validate(state,'largada');
 assert.ok(state.every(m=>m.layout==='grid'),'all starting cars must be in multi-lane grid mode');
 const row1=state.filter(m=>['04','11','18','27'].includes(m.id));
 const row2=state.filter(m=>['33','07','19','23'].includes(m.id));
 const row3=state.filter(m=>['90','64'].includes(m.id));
 assert.equal(row1.length,4);assert.equal(row2.length,4);assert.equal(row3.length,2);
 // Four cars at identical physical distance must fan ACROSS the race direction.
 const tangent=run(sandbox,"(()=>{const a=mapTrack.atMeters(-10),b=mapTrack.atMeters(10),l=Math.hypot(b.x-a.x,b.y-a.y);return {x:(b.x-a.x)/l,y:(b.y-a.y)/l};})()");
 function along(a,b){return (a.x-b.x)*tangent.x+(a.y-b.y)*tangent.y;}
 function across(a,b){return (a.x-b.x)*(-tangent.y)+(a.y-b.y)*tangent.x;}
 const longitudinal=Math.max(...row1.map(a=>along(a,row1[0])))-Math.min(...row1.map(a=>along(a,row1[0])));
 const lateral=Math.max(...row1.map(a=>across(a,row1[0])))-Math.min(...row1.map(a=>across(a,row1[0])));
 assert.ok(lateral>=45,'Cars in same row must spread across track, got '+lateral);
 assert.ok(longitudinal<15,'Starting row must not look like a train, got '+longitudinal);
 const car04=state.find(m=>m.id==='04'),car33=state.find(m=>m.id==='33'),car90=state.find(m=>m.id==='90');
 assert.ok(Math.abs(across(car04,car33))<8,'Same-lane cars should stay in their column');
 assert.ok(Math.abs(along(car04,car33))>15,'Second row must sit behind the first');
 assert.ok(Math.abs(along(car33,car90))>15,'Third row must sit behind the second');
 assert.equal(calls.filter(x=>x[0]==='arc').length,11,'10 markers plus L/C, not double points');
});
test('pelotão mantém as faixas em outra curva, inclusive cruzando linha de chegada',()=>{
 const {sandbox}=env();
 for(const start of [3132,4990,7511,9974,10000,19993]){
  const state=run(sandbox,"(()=>{createDrivers();players.forEach((p,i)=>{p.progress="+start+"-Math.floor(i/4)*8;});drawMap();return mapMarkerState.map(m=>({...m}));})()");
  validate(state,'pelotão '+start);
  assert.ok(state.every(p=>p.layout==='grid'),'must remain grid for close pack '+start);
 }
});
test('carros distantes ficam nas posições naturais ao longo do circuito, sem transformar todos em grid',()=>{
 const {sandbox}=env();
 const state=run(sandbox,"(()=>{createDrivers();players.forEach((p,i)=>{p.progress=i*950;});drawMap();return mapMarkerState.map(m=>({...m}));})()");
 validate(state,'carros espalhados');
 assert.ok(state.every(p=>p.layout==='track'),'distant cars must be plotted on the real circuit');
});
test('80 pelotões alternando curva e volta não perdem marcadores ou invadem a borda',()=>{
 const {sandbox}=env();
 const result=run(sandbox,"(()=>{createDrivers();let min=Infinity,invalid=0;for(let k=0;k<80;k++){const base=k*131;players.forEach((p,i)=>{p.progress=base-Math.floor(i/4)*8;});drawMap();for(let i=0;i<mapMarkerState.length;i++){const a=mapMarkerState[i];if(!Number.isFinite(a.x)||a.x<8||a.x>156||a.y<8||a.y>186)invalid++;for(let j=i+1;j<mapMarkerState.length;j++){const b=mapMarkerState[j],gap=Math.hypot(a.x-b.x,a.y-b.y);min=Math.min(min,gap);if(gap<14)invalid++;}}}return {min,invalid};})()");
 assert.equal(result.invalid,0,'track layout errors, minimum='+result.min);
});
test('grid altera somente minimapa e mantém nitro, carros, 10 km, voltas e mini chat',()=>{
 assert.match(html,/NEON RUSH V14\.6\.2/);
 assert.match(source,/function layoutMinimapMarkers\(/);
 assert.match(source,/function activateNitro\(/);
 assert.match(source,/function receiveGift\(/);
 assert.match(source,/function makeNitroFlames\(/);
 assert.match(source,/function makeNamePlate\(/);
 assert.match(source,/DISTANCE=10000/);
 assert.match(html,/id="giftFeed"/);
 assert.match(html,/id="lapSelect"/);
});
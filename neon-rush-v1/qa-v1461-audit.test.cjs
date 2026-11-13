'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
function setup(){
 const worldStart=source.indexOf('const TAU=Math.PI*2;');
 const worldEnd=source.indexOf('function createEngine(canvas)',worldStart);
 const physicsStart=source.indexOf('const CAR_DATA=');
 const physicsEnd=source.indexOf('const q=s=>document.querySelector(s);',physicsStart);
 const mapStart=source.indexOf('function mapGeometry(w,h)');
 const mapEnd=source.indexOf('function selectDriver(i)',mapStart);
 assert.ok(worldStart>=0&&worldEnd>worldStart&&physicsStart>=0&&physicsEnd>physicsStart&&mapEnd>mapStart);
 const log=[];
 const canvas2d={
  clearRect(){log.push(['clearRect'])},save(){log.push(['save'])},restore(){log.push(['restore'])},
  beginPath(){log.push(['beginPath'])},closePath(){log.push(['closePath'])},
  moveTo(x,y){log.push(['moveTo',x,y])},lineTo(x,y){log.push(['lineTo',x,y])},
  arc(x,y,r){log.push(['arc',x,y,r])},stroke(){log.push(['stroke'])},
  fill(){log.push(['fill'])},fillText(t,x,y){log.push(['text',t,x,y])},
  setLineDash(v){log.push(['dash',...v])}
 };
 const elements=new Map();
 const canvas={width:164,height:194,getContext:()=>canvas2d};
 const document={querySelector(sel){if(sel==='#minimap')return canvas;
   if(!elements.has(sel))elements.set(sel,{textContent:'',dataset:{},replaceChildren(){}});
   return elements.get(sel);
 }};
 const env=vm.createContext({console,document,window:{},localStorage:{getItem:()=>null,setItem:()=>{}},performance:{now:()=>0}});
 vm.runInContext([
  source.slice(worldStart,worldEnd),
  'const RaceNarrator={reset(){},finish(){},overtake(){},tick(){},turbo(){}};',
  source.slice(physicsStart,physicsEnd),
  'const q=s=>document.querySelector(s);',
  source.slice(mapStart,mapEnd)
 ].join('\n'),env,{timeout:4000});
 return {env,log,elements};
}
test('exatamente 10 marcadores livres e nenhuma linha ligando os carros',()=>{
 const {env,log,elements}=setup();
 const state=vm.runInContext("(()=>{createDrivers();players.forEach((p,i)=>{p.progress=3050+i*.25});selected=8;mapFrames=0;drawMap();return {markers:mapMarkerState.map(m=>({...m})),count:mapPoints,unique:mapUnique};})()",env,{timeout:2000});
 assert.equal(state.count,10);
 assert.equal(state.unique,10);
 assert.equal(state.markers.length,10);
 const close=log.findIndex(x=>x[0]==='closePath');
 assert.ok(close>300,'Circuito deve permanecer fechado');
 assert.equal(log.slice(close+1).filter(x=>x[0]==='lineTo').length,0,'Nenhum conector permitido entre marcadores');
 assert.equal(log.filter(x=>x[0]==='arc').length,11,'Exatamente dez marcadores mais L/C');
 for(const a of state.markers){
  assert.ok(a.x>=8&&a.x<=156&&a.y>=8&&a.y<=186,JSON.stringify(a));
  assert.equal(Object.prototype.hasOwnProperty.call(a,'realX'),false,'Ponto duplicado não permitido');
 }
 for(let i=0;i<state.markers.length;i++)for(let j=i+1;j<state.markers.length;j++)
  assert.ok(Math.hypot(state.markers[i].x-state.markers[j].x,state.markers[i].y-state.markers[j].y)>14,'Bolinhas grudadas');
 assert.match(elements.get('#mapLegend').textContent,/independentes/);
});
test('20 pelotões: nenhum conector e nenhum marcador sobreposto',()=>{
 const {env,log}=setup();
 const sample=vm.runInContext("(()=>{createDrivers();let violations=0,badges=0;for(let attempt=0;attempt<20;attempt++){const origin=(attempt*739)%DISTANCE;players.forEach((p,i)=>{p.progress=origin+(attempt%2?i*.18:i*25)});mapFrames=0;drawMap();const pts=mapMarkerState;if(pts.length!==10)violations++;for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)if(Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y)<14)violations++;badges+=pts.length;}return {violations,badges};})()",env,{timeout:9000});
 assert.equal(sample.violations,0);
 assert.equal(sample.badges,200);
 assert.equal(log.filter(x=>x[0]==='arc').length,20*11);
 assert.equal(log.filter(x=>x[0]==='closePath').length,20);
});
test('mantém nitro, configurações e mini chat, sem recursos removidos',()=>{
 assert.match(html,/NEON RUSH V14\.6\.1/);
 assert.match(html,/id="giftFeed"/);
 assert.match(html,/id="botGifts"/);
 assert.match(html,/id="nitroBadge"/);
 assert.match(source,/function receiveGift\(/);
 assert.match(source,/function makeNitroFlames\(/);
 assert.match(source,/function layoutMinimapMarkers\(/);
 assert.doesNotMatch(source,/if\(displaced>5\)/);
 assert.doesNotMatch(source,/realX:t\.X\(o\.pos\)/);
});
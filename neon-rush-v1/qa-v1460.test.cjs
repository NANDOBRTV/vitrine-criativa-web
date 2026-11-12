'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).join('\n');
const worldStart=source.indexOf('const TAU=Math.PI*2;'),worldEnd=source.indexOf('function createEngine(canvas)');
const physStart=source.indexOf('const CAR_DATA='),physEnd=source.indexOf('const q=s=>document.querySelector(s);',physStart);
const mapStart=source.indexOf('function mapGeometry('),mapEnd=source.indexOf('function selectDriver(i)',mapStart);
function env(){
 assert.ok(worldStart>=0&&worldEnd>worldStart&&physEnd>physStart&&mapEnd>mapStart);
 const els={};
 function makeEl(){return {dataset:{},children:[],replaceChildren(...items){this.children=items;},append(...items){this.children.push(...items);},textContent:'',className:''};}
 const document={createElement:()=>makeEl(),querySelector:(selector)=>(els[selector]??=makeEl())};
 const c=vm.createContext({window:{},document,localStorage:{getItem:()=>null,setItem:()=>{}},console});
 vm.runInContext([source.slice(worldStart,worldEnd),'const RaceNarrator={reset(){},finish(){},overtake(){},tick(){},turbo(){}};',source.slice(physStart,physEnd),'const q=s=>document.querySelector(s);',source.slice(mapStart,mapEnd)].join('\n'),c,{timeout:4000});
 return {c,els};
}
test('V14.6.0 mantém os modelos e nitro real em WebGL',()=>{
 assert.match(html,/V14\.6\.0/);
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/function makeNitroFlames\(\)/);
 assert.match(source,/nitro:makeNitroFlames\(\)\.upload\(gl\)/);
 assert.match(source,/engine\.draw\(meshes\.nitro/);
 assert.match(source,/d\.boost>0\?11:0/);
 for(const id of ['04','11','18','27','33','07','19','23','90','64'])assert.match(source,new RegExp("'"+id+"'"));
});
test('10 carros agrupados: os dez números ficam dentro do mapa sem colisão',()=>{
 const {c}=env();
 const r=vm.runInContext("(()=>{const t=mapGeometry(164,194),cars=Array.from({length:10},(_,i)=>({driver:{id:String(i),progress:8057+i*.15},i,pos:point(8057+i*.15,0)})),a=layoutMinimapMarkers(cars,t,19);let min=Infinity,maxOffset=0;for(let i=0;i<a.length;i++){const p=a[i].position;if(!(p.x>=8&&p.x<=156&&p.y>=8&&p.y<=186))throw Error('outside '+i);maxOffset=Math.max(maxOffset,Math.hypot(p.x-a[i].route.x,p.y-a[i].route.y));for(let j=0;j<i;j++)min=Math.min(min,Math.hypot(p.x-a[j].position.x,p.y-a[j].position.y));}return {n:a.length,min,maxOffset};})()",c,{timeout:2500});
 assert.equal(r.n,10);
 assert.ok(r.min>14,'minimum marker distance='+r.min);
 assert.ok(r.maxOffset>25,'number label should move while true dot stays fixed');
});
test('diferentes posições de corrida e travessia da linha de chegada não sobrepõem números',()=>{
 const {c}=env();
 const r=vm.runInContext("(()=>{const t=mapGeometry(164,194);let nearest=Infinity,bad=0;for(let run=0;run<90;run++){const cars=Array.from({length:10},(_,i)=>{const meters=run%3===0?1000+run*30+i*.2:run%3===1?9950+i*3:i*1000+(run*7)%90;return {driver:{id:String(i),progress:meters},i,pos:point(meters,0)};});const a=layoutMinimapMarkers(cars,t,19);if(a.length!==10)bad++;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const p=a[i].position,q=a[j].position,d=Math.hypot(p.x-q.x,p.y-q.y);nearest=Math.min(nearest,d);if(d<14||p.x<8||p.x>156||p.y<8||p.y>186)bad++;}}return {nearest,bad};})()",c,{timeout:4500});
 assert.equal(r.bad,0,'minimum='+r.nearest);
});
test('presente do bot aumenta nitro e registra mini chat, com emissor identificado',()=>{
 const {c,els}=env();
 const r=vm.runInContext("(()=>{createDrivers();gamePhase='race';timer=3;gameOptions.botGifts=false;const ok=receiveGift({sender:'João BOT',recipientId:'04',gift:'Presente',source:'bot'});const first={ok,boost:players[0].boost,feed:giftFeed[0].sender,source:giftFeed[0].source,count:giftEvents};gameOptions.botGifts=true;nextBotGift=5;timer=6;botGiftTick();return {first,count:giftEvents,next:nextBotGift};})()",c);
 assert.equal(r.first.ok,true);
 assert.equal(r.first.boost,6.2);
 assert.equal(r.first.feed,'João BOT');
 assert.equal(r.first.source,'bot');
 assert.equal(r.count,2);
 assert.ok(r.next>10);
 assert.equal(els['#giftFeed'].children.length,2);
 assert.match(els['#giftFeed'].children[0].children[0].textContent,/João BOT/);
});
test('nome malicioso em presente não injeta HTML e não trava a física',()=>{
 const {c,els}=env();
 const r=vm.runInContext("(()=>{createDrivers();gamePhase='race';timer=1;gameOptions.botGifts=false;const ok=receiveGift({sender:'<img src=x onerror=alert(1)>',recipientId:'18',gift:'<svg onload=1>',source:'external'});physicsStep(1/60);return {ok,sender:giftFeed[0].sender,gift:giftFeed[0].gift,boost:players.find(p=>p.id==='18').boost};})()",c);
 assert.equal(r.ok,true);
 assert.ok(!r.sender.includes('<')&&!r.gift.includes('<'));
 assert.ok(r.boost>0);
 assert.ok(els['#giftFeed'].children.length);
});
test('etiquetas mostram posições reais ligadas e o mapa é transparente',()=>{
 assert.match(source,/function layoutMinimapMarkers\(cars,track,minSpacing=19\)/);
 assert.match(source,/const actual=\{x:t\.X\(o\.pos\),y:t\.Y\(o\.pos\)\}/);
 assert.match(source,/if\(displaced>5\)/);
 assert.match(source,/mapMarkerState=arranged\.map/);
 assert.match(source,/c\.clearRect\(0,0,w,h\)/);
 assert.match(html,/\.mapShell\{[^}]*background:transparent/);
});
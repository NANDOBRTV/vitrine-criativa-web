'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const a=source.indexOf('const TAU=Math.PI*2;'),b=source.indexOf('function createEngine(canvas)',a);
const c=source.indexOf('const CAR_DATA='),d=source.indexOf('const q=s=>document.querySelector(s);',c);
function fixture(){
 assert.ok(a>=0&&b>a&&c>=0&&d>c);
 const elements=new Map(),store=new Map();
 const makeEl=()=>({textContent:'',hidden:false,dataset:{},children:[],replaceChildren(...args){this.children=args;},append(...args){this.children.push(...args)},setAttribute(){}});
 const document={createElement:makeEl,querySelector:s=>{if(!elements.has(s))elements.set(s,makeEl());return elements.get(s)}};
 const ctx=vm.createContext({window:{},document,console,performance:{now:()=>10000},
  Math:{...Math,random:()=>0},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}});
 // Supply deterministic random without changing Math builtins.
 const code=[source.slice(a,b),
  "const RaceNarrator={reset(){},finish(){},overtake(){},tick(){},turbo(){},tapNitro(){}};",
  source.slice(c,d),
  "const q=s=>document.querySelector(s);"].join('\n');
 // vm's real Math handles geometry. Random is made deterministic on the context's native Math.
 delete ctx.Math;
 vm.runInContext('Math.random=()=>0',ctx);
 vm.runInContext(code,ctx,{timeout:7000});
 const get=js=>JSON.parse(JSON.stringify(vm.runInContext(js,ctx,{timeout:20000})));
 return {get,store,elements};
}
test('botões, nomes de 10 bots, configuração persistente e classificação separada',()=>{
 assert.match(html,/NEON RUSH V14\.9\.0/);
 for(const id of ['botLikes','botGifts','liveTapRank','liveLikesRank','liveRaceRank'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(source,/function botLikeTick\(\)/);
 assert.match(source,/if\(!inDiagnosticRun\)\{botGiftTick\(\);botLikeTick\(\);\}/);
 const {get,store}=fixture();
 const result=get("(()=>{createDrivers();gameOptions.botLikes=false;saveSettings();return {bots:GIFT_BOT_NAMES.length,saved:JSON.parse(localStorage.getItem(SETTINGS_KEY)).botLikes,defaultNames:GIFT_BOT_NAMES.every(n=>n.endsWith(' BOT'))};})()");
 assert.equal(result.bots,10);assert.equal(result.saved,false);assert.equal(result.defaultNames,true);
 assert.equal(store.size,1);
});
test('bot curte automaticamente só durante corrida, no horário certo e sem eventos duplicados',()=>{
 const {get}=fixture();
 const res=get("(()=>{createDrivers();gamePhase='countdown';timer=5;const before=botLikeTick();gamePhase='race';timer=1;const early=botLikeTick();timer=1.1;const first=botLikeTick();const dup=botLikeTick();return {before,early,first,dup,count:totalTaps,bots:tapViewers.size,name:[...tapViewers.values()][0].name,source:[...tapViewers.values()][0].source,events:botTapTurn,next:nextBotTapAt};})()");
 assert.equal(res.before,false);assert.equal(res.early,false);
 assert.equal(res.first.accepted,true);assert.equal(res.dup,false);
 assert.equal(res.count,55);assert.equal(res.bots,1);
 assert.equal(res.name,'João BOT');assert.equal(res.source,'bot');
 assert.equal(res.events,1);assert.ok(res.next>1.1);
});
test('10 bots contabilizam individualmente tap taps: 250 = 1 curtida e Nitro por bot',()=>{
 const {get,elements}=fixture();
 const res=get("(()=>{createDrivers();gamePhase='race';gameOptions.botLikes=true;for(let i=0;i<50;i++){timer=nextBotTapAt;botLikeTick();}return {botEvents:botTapTurn,taps:totalTaps,likes:totalLikes,nitros:totalTapNitros,viewers:[...tapViewers.values()].map(r=>({...r})),carBoosts:players.map(p=>p.boost),ranked:tapRanking('likes').map(x=>x.name),feed:giftFeed.map(x=>({...x}))};})()");
 assert.equal(res.botEvents,50);assert.equal(res.taps,2750);assert.equal(res.likes,10);assert.equal(res.nitros,10);
 assert.equal(res.viewers.length,10);
 for(const v of res.viewers){assert.equal(v.taps,275);assert.equal(v.likes,1);assert.equal(v.nitros,1);assert.equal(v.source,'bot');}
 assert.equal(res.carBoosts.filter(x=>x>=5).length,10);
 assert.equal(new Set(res.ranked).size,10);
 assert.ok(res.feed.some(f=>f.kind==='tap'&&f.source==='bot'));
 assert.ok(elements.get('#giftFeed').children.some(x=>x.children[2].textContent==='BOT DE TESTE'));
});
test('desligar bots impede novos taps e diagnóstico não injeta curtidas',()=>{
 const {get}=fixture();
 const res=get("(()=>{createDrivers();gamePhase='race';timer=2;gameOptions.botLikes=false;const off=botLikeTick();const tapsOff=totalTaps;gameOptions.botLikes=true;inDiagnosticRun=true;const diag=botLikeTick();inDiagnosticRun=false;const on=botLikeTick();gameOptions.botLikes=false;timer=nextBotTapAt+10;const offAgain=botLikeTick();return {off,diag,on:!!on.accepted,offAgain,tapsOff,totalTaps,events:botTapTurn};})()");
 assert.equal(res.off,false);assert.equal(res.diag,false);assert.equal(res.on,true);
 assert.equal(res.offAgain,false);assert.equal(res.tapsOff,0);assert.equal(res.events,1);assert.equal(res.totalTaps,55);
});
test('ao reiniciar, relógio e rodízio reiniciam sem zerar o acumulado da sessão',()=>{
 const {get}=fixture();
 const r=get("(()=>{createDrivers();gamePhase='race';timer=2;botLikeTick();const before={taps:totalTaps,events:botTapTurn};engine={};gridCars();const after={taps:totalTaps,events:botTapTurn,next:nextBotTapAt,phase:gamePhase};return {before,after};})()");
 assert.equal(r.before.taps,55);assert.equal(r.after.taps,55);assert.equal(r.before.events,1);
 assert.equal(r.after.events,0);assert.equal(r.after.next,1.1);assert.equal(r.after.phase,'countdown');
});

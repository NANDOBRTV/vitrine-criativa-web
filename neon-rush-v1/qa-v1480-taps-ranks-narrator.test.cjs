'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const worldStart=source.indexOf('const TAU=Math.PI*2;'),worldEnd=source.indexOf('function createEngine(canvas)',worldStart);
const physicsStart=source.indexOf('const ORIGINAL_CAR_DATA='),physicsEnd=source.indexOf('const q=s=>document.querySelector(s);',physicsStart);
function env(){
 assert.ok(worldStart>=0&&worldEnd>worldStart&&physicsStart>=0&&physicsEnd>physicsStart);
 const nodes=new Map();
 const el=()=>({textContent:'',dataset:{},children:[],replaceChildren(...items){this.children=items},append(...items){this.children.push(...items)}});
 const document={createElement:el,querySelector:(id)=>{if(!nodes.has(id))nodes.set(id,el());return nodes.get(id)}};
 const ctx=vm.createContext({window:{},document,localStorage:{getItem:()=>null,setItem:()=>{}},console,performance:{now:()=>2000}});
 vm.runInContext([source.slice(worldStart,worldEnd),
  "const RaceNarrator={reset(){},finish(){},overtake(){},tick(){},turbo(){},tapNitro(){}};",
  source.slice(physicsStart,physicsEnd),
  "const q=s=>document.querySelector(s);"].join('\n'),ctx,{timeout:6000});
 return {ctx,nodes};
}
function run(ctx,s){return JSON.parse(JSON.stringify(vm.runInContext(s,ctx,{timeout:4000})))}
test('249 tap taps não geram curtida/nitro; o 250º gera exatamente um',()=>{
 const {ctx}=env();
 const r=run(ctx,"(()=>{createDrivers();gamePhase='race';const a=receiveTap({sender:'Ana',viewerId:'ana-1',count:249,recipientId:'04',source:'demo'});const b=receiveTap({sender:'Ana',viewerId:'ana-1',count:1,recipientId:'04',source:'demo'});return {a,b,boost:players[0].boost,taps:totalTaps,likes:totalLikes,rank:tapRanking('taps').map(x=>({name:x.name,taps:x.taps,likes:x.likes}))};})()");
 assert.equal(r.a.taps,249);assert.equal(r.a.likes,0);assert.equal(r.a.nitros,0);
 assert.equal(r.b.taps,250);assert.equal(r.b.likes,1);assert.equal(r.b.nitros,1);
 assert.equal(r.boost,5);assert.equal(r.taps,250);assert.equal(r.likes,1);
 assert.equal(r.rank.length,1);assert.equal(r.rank[0].taps,250);
});
test('500 taps num evento = 2 curtidas e 2 ativações; sem arredondamento indevido',()=>{
 const {ctx}=env();
 const r=run(ctx,"(()=>{createDrivers();gamePhase='race';const a=receiveTap({sender:'Bruno',viewerId:'b',count:500,recipientId:'11'});const b=receiveTap({sender:'Bruno',viewerId:'b',count:249,recipientId:'11'});const c=receiveTap({sender:'Bruno',viewerId:'b',count:1,recipientId:'11'});return {a,b,c,boost:players[1].boost,likes:totalLikes,nitros:totalTapNitros};})()");
 assert.equal(r.a.nitros,2);assert.equal(r.a.likes,2);assert.equal(r.a.pending,0);
 assert.equal(r.b.taps,749);assert.equal(r.b.nitros,0);
 assert.equal(r.c.taps,750);assert.equal(r.c.nitros,1);assert.equal(r.c.likes,3);
 assert.equal(r.likes,3);assert.equal(r.nitros,3);assert.equal(r.boost,12);
});
test('tap taps durante contagem ficam na fila e ativam nitro na largada',()=>{
 const {ctx}=env();
 const r=run(ctx,"(()=>{createDrivers();gamePhase='countdown';const a=receiveTap({sender:'Lia',count:250,recipientId:'18'});const oldBoost=players[2].boost;gamePhase='race';flushPendingTapNitro();return {a,oldBoost,newBoost:players[2].boost,pending:tapRanking('taps')[0].pending};})()");
 assert.equal(r.a.accepted,true);
 assert.equal(r.a.pending,1);
 assert.equal(r.oldBoost,0);
 assert.equal(r.newBoost,5);
 assert.equal(r.pending,0);
});
test('rankings independentes, ordem por usuário, nomes higienizados e contagens válidas',()=>{
 const {ctx}=env();
 const r=run(ctx,"(()=>{createDrivers();gamePhase='race';receiveTap({sender:'Ana',viewerId:'a',count:500});receiveTap({sender:'Bia',viewerId:'b',count:625});receiveTap({sender:'Cris',viewerId:'c',count:75});const invalid=receiveTap({sender:'Exploit',count:-1});const huge=receiveTap({sender:'Exploit',count:999999999});const safe=receiveTap({sender:'<img onerror=alert(1)>',viewerId:'safe',count:1});return {taps:tapRanking('taps').map(x=>x.name),likes:tapRanking('likes').map(x=>x.likes),invalid,huge,safe,total:totalTaps};})()");
 assert.deepEqual(r.taps.slice(0,3),['Bia','Ana','Cris']);
 assert.deepEqual(r.likes.slice(0,3),[2,2,0]);
 assert.equal(r.invalid.accepted,false);assert.equal(r.huge.accepted,false);
 assert.ok(!r.safe.name.includes('<'));
 assert.equal(r.total,1201);
});
test('HUD dentro do frame contém três rankings, painel completo e controles de teste',()=>{
 for(const id of ['liveRanks','liveRaceRank','liveTapRank','liveLikesRank','tapRankPanel','likesRankPanel','tapUserInput','tapOne','tapFifty','tapTwoFifty','voiceSelect','voiceTest'])
  assert.match(html,new RegExp('id="'+id+'"'),id);
 const frame=html.indexOf('id="frame"'),overlay=html.indexOf('id="liveRanks"'),endFrame=html.indexOf('id="finishOverlay"');
 assert.ok(frame>=0&&overlay>frame&&overlay<endFrame);
 assert.match(source,/function updateLiveLeaderboards\(/);
 assert.match(source,/function receiveTap\(/);
 assert.match(source,/const TAP_THRESHOLD=250/);
 assert.match(source,/window\.NEON_RUSH_RELEASE=Object\.freeze/);
 assert.match(source,/tikTokConnected:false/);
});
test('narrador usa voz opcional, cadência lenta e permite prévia manual',()=>{
 assert.match(source,/function chooseVoice\(\)/);
 assert.match(source,/function refreshVoices\(\)/);
 assert.match(source,/u\.lang='pt-BR';u\.rate=1\.01;u\.pitch=1\.00/);
 assert.match(source,/function sample\(\)/);
 assert.match(source,/nextCommentAt=timer\+19/);
 assert.match(source,/narratorVoice:gameOptions\.narratorVoice/);
 assert.match(source,/RaceNarrator\.tapNitro/);
 assert.match(html,/NEON RUSH V15\.0\.0/);
});
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const world=source.indexOf('const TAU=Math.PI*2;'),engine=source.indexOf('function createEngine(canvas)',world);
const physical=source.indexOf('const CAR_DATA='),qAt=source.indexOf('const q=s=>document.querySelector(s);',physical);
const mapAt=source.indexOf('function mapGeometry(w,h)'),mapEnd=source.indexOf('function selectDriver(i)',mapAt);
function sim(withMap=false){
 assert.ok(world>=0&&engine>world&&physical>=0&&qAt>physical&&mapAt>=0&&mapEnd>mapAt);
 const calls=[];
 const c={};for(const fn of ['clearRect','save','restore','beginPath','closePath','moveTo','lineTo','stroke','fill','arc','fillText','setLineDash'])c[fn]=(...args)=>calls.push([fn,...args]);
 const nodes=new Map(),create=()=>({textContent:'',dataset:{},replaceChildren(){},hidden:false});
 const canvas={width:164,height:194,getContext:()=>c};
 const document={querySelector(sel){if(sel==='#minimap')return canvas;if(!nodes.has(sel))nodes.set(sel,create());return nodes.get(sel)}};
 const ctx=vm.createContext({console,window:{},document,performance:{now:()=>0},localStorage:{getItem:()=>null,setItem:()=>{}}});
 vm.runInContext([source.slice(world,engine),
  "const RaceNarrator={reset(){},finish(){},overtake(){},tick(){},turbo(){},tapNitro(){}};",
  source.slice(physical,qAt),
  ...(withMap?["const q=s=>document.querySelector(s);","const rank=()=>[...players].sort((a,b)=>b.progress-a.progress);",
    "let mapTrack=null,mapPoints=0,mapUnique=0,mapFrames=0;",source.slice(mapAt,mapEnd)]:[])
 ].join('\n'),ctx,{timeout:6000});
 return {ctx,calls,nodes};
}
function go(ctx,script,timeout=10000){return JSON.parse(JSON.stringify(vm.runInContext(script,ctx,{timeout})))}
test('50 carros numerados: dez originais + quarenta novos, sem IDs ou cores duplicados',()=>{
 const {ctx}=sim();
 const r=go(ctx,"(()=>{createDrivers();return {length:players.length,extra:EXTRA_CAR_IDS.length,original:ORIGINAL_CAR_DATA.length,ids:players.map(p=>p.id),colors:players.map(p=>p.color),generated:players.filter(p=>p.generated).length,names:players.map(p=>p.name),styles:EXTRA_CAR_IDS.every(id=>typeof teamColor==='function')};})()");
 assert.equal(r.length,50);assert.equal(r.extra,40);assert.equal(r.original,10);
 assert.equal(new Set(r.ids).size,50,'Duplicate race numbers');
 assert.equal(new Set(r.colors).size,50,'Duplicate paint colors');
 assert.equal(new Set(r.names).size,50,'Duplicate pilot display names');
 assert.equal(r.generated,40);
 assert.match(html,/NEON RUSH V15\.0\.0/);
 assert.match(source,/generatedCarPreview\(/);
 assert.match(source,/style\.generated\?256:512/);
});
test('grid real de largada: 4 faixas e 13 fileiras, espaçamento físico consistente',()=>{
 const {ctx}=sim();
 const result=go(ctx,"(()=>{createDrivers();return {n:players.length,lanes:players.map(p=>p.lateral),progress:players.map(p=>p.progress),overlaps:checkPhysics(),minGap:SAFE_GAP};})()");
 assert.equal(result.n,50);assert.equal(result.overlaps.length,0);
 assert.equal(new Set(result.lanes).size,4);
 assert.equal(new Set(result.progress).size,13);
 for(let i=0;i<50;i++){assert.equal(result.progress[i],-Math.floor(i/4)*8);assert.equal(result.lanes[i],[-6,-2,2,6][i%4]);}
});
test('50 bolinhas livres, sem conector, dentro do minimapa em quatro faixas',()=>{
 const {ctx,calls}=sim(true);
 const r=go(ctx,"(()=>{createDrivers();selected=8;drawMap();return {dots:mapMarkerState.map(p=>({...p})),count:mapPoints,unique:mapUnique,mapText:document.querySelector('#mapLegend').textContent};})()");
 assert.equal(r.dots.length,50);assert.equal(r.count,50);assert.equal(r.unique,50);
 assert.equal(calls.filter(x=>x[0]==='arc').length,51,'50 car dots + start/finish');
 const closeIndex=calls.findIndex(x=>x[0]==='closePath');
 assert.ok(closeIndex>300,'Track border missing');
 assert.equal(calls.slice(closeIndex+1).filter(x=>x[0]==='lineTo').length,0,'Line connecting dots');
 for(const d of r.dots){assert.ok(d.x>=8&&d.x<=156&&d.y>=8&&d.y<=186,'Off map '+d.id);assert.equal(typeof d.id,'string');}
 const row1=r.dots.slice(0,4),row13=r.dots.slice(48);
 assert.equal(row1.length,4);assert.equal(row13.length,2);
 let min=Infinity;for(let i=0;i<r.dots.length;i++)for(let j=0;j<i;j++)min=Math.min(min,Math.hypot(r.dots[i].x-r.dots[j].x,r.dots[i].y-r.dots[j].y));
 assert.ok(min>=5.8,'Overlapping car dots, minimum gap='+min);
 assert.match(r.mapText,/50 pontos livres/);
});
test('vinte pelotões de 50 carros continuam no mapa sem perder números',()=>{
 const {ctx}=sim(true);
 const r=go(ctx,"(()=>{createDrivers();let minimum=Infinity,missing=0,outer=0;for(let k=0;k<20;k++){const base=k*427;players.forEach((p,i)=>p.progress=base-Math.floor(i/4)*8);drawMap();if(mapMarkerState.length!==50||mapUnique!==50)missing++;for(let i=0;i<mapMarkerState.length;i++){const a=mapMarkerState[i];if(a.x<8||a.x>156||a.y<8||a.y>186)outer++;for(let j=i+1;j<mapMarkerState.length;j++){const b=mapMarkerState[j];minimum=Math.min(minimum,Math.hypot(a.x-b.x,a.y-b.y));}}}return {minimum,missing,outer};})()",25000);
 assert.equal(r.missing,0);assert.equal(r.outer,0);
 assert.ok(r.minimum>=5.4,'Merged 50-dot grid, closest='+r.minimum);
});
test('ranking da corrida mostra TOP 5 na pista e até 50 posições completas no painel',()=>{
 for(const id of ['liveRaceRank','liveTapRank','liveLikesRank','rank','tapRankPanel','likesRankPanel'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(source,/drawRankRows\('#liveRaceRank',race,raceMini,5,true\)/);
 assert.match(source,/drawRankRows\('#liveTapRank',tap,[^\n]+,5,true/);
 assert.match(source,/drawRankRows\('#liveLikesRank',likes,[^\n]+,5,true/);
 assert.match(source,/drawRankRows\('#rank',race,raceFull,TOTAL_CARS,false\)/);
 assert.match(source,/drawRankRows\('#tapRankPanel',tap,[^\n]+TOTAL_CARS,false/);
 assert.match(source,/drawRankRows\('#likesRankPanel',likes,[^\n]+TOTAL_CARS,false/);
});
test('cinquenta carros sobrevivem a 40 segundos de física e nitro sem sobreposições', {timeout:120000},()=>{
 const {ctx}=sim();
 const res=go(ctx,"(()=>{createDrivers();gamePhase='race';inDiagnosticRun=true;nextClose=Infinity;timer=0;let firstBad=null,steps=0;players.forEach((d,i)=>{d.maxSpeed=26+(i%10)*.5;d.boost=i%5===0?6:0;});for(;steps<2400;steps++){physicsStep(1/60);if(steps%30===0){const collisions=checkPhysics();if(collisions.length){firstBad=collisions;break;}if(players.some(p=>!Number.isFinite(p.progress)||!Number.isFinite(p.speed)||!Number.isFinite(p.lateral))){firstBad='invalid position';break;}}}return {steps,firstBad,playerCount:players.length,leader:Math.max(...players.map(p=>p.progress)),overlaps:checkPhysics().length};})()",110000);
 assert.equal(res.firstBad,null,JSON.stringify(res));assert.equal(res.playerCount,50);assert.ok(res.steps>=2400,JSON.stringify(res));assert.equal(res.overlaps,0);
});
test('50 carros completam uma prova real de 10 km com pódio', {timeout:180000},()=>{
 const {ctx}=sim();
 const res=go(ctx,"(()=>{createDrivers();gamePhase='race';raceLaps=1;inDiagnosticRun=true;timer=0;nextClose=Infinity;physicsStep.previousOrder=null;let steps=0,bad=null;while(gamePhase==='race'&&steps<40000){physicsStep(1/60);steps++;if(steps%240===0){const errs=checkPhysics();if(errs.length){bad=errs;break;}if(players.some(d=>!Number.isFinite(d.progress)||!Number.isFinite(d.speed))){bad='NaN';break;}}}return {steps,phase:gamePhase,bad,meters:Math.max(...players.map(p=>p.progress)),count:players.length};})()",170000);
 assert.equal(res.bad,null,JSON.stringify(res));assert.equal(res.count,50);assert.equal(res.phase,'podium',JSON.stringify(res));assert.ok(res.meters>=10000,JSON.stringify(res));
});

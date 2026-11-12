import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');

test('scripts JavaScript com sintaxe válida',()=>{
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
 assert.ok(scripts.length>=1);
 scripts.forEach((src,i)=>assert.doesNotThrow(()=>new Script(src,{filename:'neon-inline-'+i+'.js'})));
});

test('HTML sem IDs duplicados e com controles essenciais',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size,'IDs HTML duplicados');
 for(const id of ['world','minimap','mapShell','mapCount','mapLegend','settingsPanel','gameSettings','settingsJump','settingsStatus','settingsFeedback','quality','mute','narrator','mapToggle','rank','boost','gift','camera','choose','close','restart','full','picker','pickerClose','pickerList','webglFail'])assert.ok(ids.includes(id),'Falta #'+id);
});

test('os 10 modelos possuem números exclusivos',()=>{
 const match=html.match(/const CAR_DATA=\[([\s\S]*?)\];/);
 assert.ok(match,'CAR_DATA ausente');
 const numbers=[...match[1].matchAll(/\['(\d{2})'/g)].map(m=>m[1]);
 assert.deepEqual([...numbers].sort(),['04','07','11','18','19','23','27','33','64','90']);
});

test('o minimapa usa o traçado do motor, dez pontos e separação visual',()=>{
 for(const target of ['function mapGeometry','function drawMap','point(START+d,-11.1)','point(START+d,11.1)','const used=[]','mapPoints=used.length','mapUnique=new Set','Math.hypot','mapPoints,mapUnique'])assert.ok(html.includes(target),target);
 const a=html.indexOf('const DISTANCE='),b=html.indexOf('let timer=',a);
 assert.ok(a>=0&&b>a);
 const geom=html.slice(a,b);
 const values=runInNewContext(geom+';({xs:[...Array(69)].map((_,i)=>pathX(START+i*10)),grid:[0,-8,-16].map(d=>point(START+d,-2)[2]),curve:Math.abs(pathCurve(START+200))})',{Math});
 assert.ok(Math.max(...values.xs)>30&&Math.min(...values.xs)<-25,'Traçado não tem curvas em S');
 assert.ok(new Set(values.grid).size===3,'Três filas de largada colapsaram');
 assert.ok(Number.isFinite(values.curve));
});

test('o modo WebGL nunca substitui a partida por corrida invisível',()=>{
 assert.ok(html.includes("gamePhase='gpu-error'"));
 assert.ok(html.includes("if(!engine){gamePhase='gpu-error'"));
 assert.ok(html.includes('const at=point(START+d.progress,d.lateral)'),'Grid 3D deve manter distância negativa');
 assert.ok(html.includes("const z2=START+follow.progress"));
});

test('qualidade e mapa persistem; narração e áudio são opt-in',()=>{
 for(const x of ['SETTINGS_KEY','function saveSettings()','function syncSettings()', "q('#mapToggle').onclick", "q('#quality').onclick", "q('#narrator').onclick", "q('#mute').onclick", 'RaceNarrator.overtake','RaceNarrator.finish'])assert.ok(html.includes(x),x);
 assert.ok(html.includes('localStorage.setItem(SETTINGS_KEY'));
 assert.ok(html.includes('muted=true'));
});

test('galeria existente, skins e física continuam no jogo',()=>{
 for(const x of ['stockcar-viewer.html','createCarModels(gl)','makeRoad()','makeWheel()','function checkPhysics()','window.NEON_RUSH_V14','SAFE_GAP=5.7'])assert.ok(html.includes(x),x);
});

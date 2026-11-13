'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const matches = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
const source = matches.map(m => m[1]).join('\n');
const from = source.indexOf('const CAR_DATA=');
const to = source.indexOf('const q=s=>document.querySelector(s);', from);

function physicsEnv() {
  assert.ok(from >= 0 && to > from, 'Trecho real de física não encontrado');
  const sandbox = vm.createContext({
    window: {},
    localStorage: { getItem: () => null, setItem: () => {} },
    console
  });
  vm.runInContext(
    'const RaceNarrator = {reset(){},finish(){},overtake(){},tick(){}};\n' +
    source.slice(from, to), sandbox, {timeout: 3000}
  );
  return sandbox;
}

test('JavaScript embutido tem sintaxe válida', () => {
  assert.ok(source.length > 20000);
  assert.doesNotThrow(() => new vm.Script(source, {filename:'neon-rush-v1442.js'}));
});

test('mantém 10 modelos, controles, assets e WebGL original', () => {
  assert.match(html, /V14\.6\.1/);
  assert.match(source, /createEngine\(canvas\)/);
  assert.match(source, /getContext\('webgl'/);
  assert.match(html, /stockcar-viewer\.html/);
  for (const id of ['04','11','18','27','33','07','19','23','90','64'])
    assert.match(source, new RegExp("'"+id+"'"));
  for (const id of ['choose','camera','close','restart','boost','gift','minimap','narrator'])
    assert.ok(html.includes('id="'+id+'"'), 'Controle ausente: '+id);
});

test('gridCars limpa estatísticas de cada corrida e câmera anterior', () => {
  const context = physicsEnv();
  const data = vm.runInContext(
    'engine={};createDrivers();collisionEvents=12;passingEvents=7;orientationIssues=4;' +
    'podiumElapsed=8;cameraTrackId="old";renderHistory=[15];' +
    'const started=gridCars();' +
    '({started,phase:gamePhase,players:players.length,collisions:collisionEvents,' +
    'passes:passingEvents,invalid:orientationIssues,podiumElapsed,cameraTrackId,' +
    'renderCount:renderHistory.length});',
    context, {timeout: 3000}
  );
  assert.equal(data.started, true);
  assert.equal(data.phase, 'countdown');
  assert.equal(data.players, 10);
  assert.equal(data.collisions, 0);
  assert.equal(data.passes, 0);
  assert.equal(data.invalid, 0);
  assert.equal(data.podiumElapsed, 0);
  assert.equal(data.cameraTrackId, null);
  assert.equal(data.renderCount, 0);
});

test('HUD mostra distância do piloto selecionado e pódio reinicia após 9s', () => {
  assert.match(source, /q\('#meter'\)\.textContent=completedMeters\(me\.progress\)/);
  assert.match(source, /if\(gamePhase==='podium'\)\{podiumElapsed\+=rawdt;if\(podiumElapsed>=9&&engine\)gridCars\(\);\}/);
  assert.match(source, /cameraKey!==cameraTrackId/);
  assert.match(source, /let rawdt=Math\.max\(0,Math\.min\(/);
});

test('220 corridas de física real sem sobreposições nem estados inválidos', {timeout: 110000}, () => {
  const context = physicsEnv();
  let seed = 20261112;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let race=0;race<220;race++) {
    const speeds = Array.from({length:10}, () => +(23+rand()*12).toFixed(3));
    const boosts = Array.from({length:10}, () => rand()>.74?5:0);
    context.testSpeeds = speeds;
    context.testBoosts = boosts;
    const res=vm.runInContext(
      'createDrivers();gamePhase="race";timer=0;nextClose=Infinity;inDiagnosticRun=true;' +
      'physicsStep.previousOrder=null;collisionEvents=0;passingEvents=0;orientationIssues=0;' +
      'players.forEach((p,i)=>{p.maxSpeed=testSpeeds[i];p.boost=testBoosts[i];});' +
      '(()=>{let steps=0,firstBad=null;' +
      'for(;steps<4680&&gamePhase==="race";steps++){' +
      'physicsStep(1/60);const bad=checkPhysics();if(bad.length){firstBad=bad;break;}' +
      'if(players.some(p=>!Number.isFinite(p.progress)||!Number.isFinite(p.speed)||!Number.isFinite(p.lateral))){firstBad="NaN";break;}' +
      '}' +
      'return {steps,firstBad,players:players.length,phase:gamePhase,invalid:orientationIssues};})()',
      context, {timeout: 10000}
    );
    assert.equal(res.firstBad, null, 'Sobreposição/física inválida na corrida '+race+': '+JSON.stringify(res.firstBad));
    assert.equal(res.players, 10);
    assert.equal(res.invalid, 0);
    assert.ok(res.steps>0);
  }
});

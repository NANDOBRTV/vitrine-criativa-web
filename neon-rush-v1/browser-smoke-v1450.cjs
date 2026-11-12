'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.NEON_RUSH_V15)&&Boolean(window.NEON_V14_DIAGNOSTICS),{timeout:25000});
  const initial=await page.evaluate(()=>({
   diagnostics:window.NEON_V14_DIAGNOSTICS,
   models:window.NEON_V14_METRICS?.carModels?.uniqueModels,
   paintings:window.NEON_V14_METRICS?.carModels?.paintings,
   rendered:window.NEON_V14_METRICS?.visibleVehicles,
   mapStyle:getComputedStyle(document.querySelector('#mapShell')).backgroundColor,
   mapPixel:[...document.querySelector('#minimap').getContext('2d').getImageData(0,0,1,1).data],
   controls:['choose','camera','close','restart','lapSelect','nameSave','nameInput'].every(k=>document.getElementById(k))
  }));
  assert.equal(initial.diagnostics.real3D,true,'WebGL real indisponível');
  assert.equal(initial.diagnostics.players,10);
  assert.equal(initial.models,10);
  assert.equal(initial.rendered,10);
  assert.equal(initial.diagnostics.mapPoints,10);
  assert.equal(initial.diagnostics.mapUnique,10);
  assert.equal(initial.mapPixel[3],0,'Minimapa deve manter píxeis externos transparentes');
  assert.match(initial.mapStyle,/rgba\(0, 0, 0, 0\)|transparent/);
  assert.ok(initial.controls);
  await page.fill('#nameInput','Piloto Teste');
  await page.click('#nameSave');
  const custom=await page.evaluate(()=>window.NEON_RUSH_V15.getState().drivers[8].name);
  assert.equal(custom,'Piloto Teste');
  await page.selectOption('#lapSelect','3');
  await page.click('#restart');
  const laps=await page.evaluate(()=>window.NEON_RUSH_V15.getState().laps);
  assert.equal(laps,3);
  await page.waitForTimeout(200);
  await page.screenshot({path:'neon-rush-v1450-android-smoke.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',initial,laps,custom,errors},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
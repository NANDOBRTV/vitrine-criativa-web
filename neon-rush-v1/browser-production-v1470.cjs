'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.NEON_RUSH_RELEASE?.version==='15.0.0'&&window.NEON_V14_DIAGNOSTICS?.real3D===true&&window.NEON_V14_DIAGNOSTICS?.mapPoints===50,{timeout:60000});
  const initial=await page.evaluate(()=>({
   release:window.NEON_RUSH_RELEASE,
   state:window.NEON_RUSH_V16.getState(),
   diag:window.NEON_V14_DIAGNOSTICS,
   modelCount:window.NEON_V14_METRICS.carModels.uniqueModels,
   canvas:document.querySelector('#world').getBoundingClientRect().toJSON(),
   map:document.querySelector('#minimap').getBoundingClientRect().toJSON()
  }));
  assert.equal(initial.release.giftMode,'simulated');
  assert.equal(initial.release.trackMeters,10000);
  assert.equal(initial.release.vehicles,50);
  assert.equal(initial.modelCount,10);
  assert.equal(initial.state.mapMarkers.length,50);
  assert.ok(initial.map.right<=390&&initial.map.left>=0,'minimap must be inside mobile viewport');
  assert.ok(initial.canvas.height>200);
  await page.locator('#gameSettings').evaluate(el=>el.open=true);
  const initialQuality=await page.locator('#quality').textContent();
  await page.click('#quality');
  const nextQuality=await page.locator('#quality').textContent();
  assert.notEqual(nextQuality,initialQuality);
  await page.click('#quality');
  assert.equal(await page.locator('#quality').textContent(),initialQuality);
  await page.click('#mapToggle');
  assert.equal(await page.locator('#mapShell').evaluate(el=>el.hidden),true);
  await page.click('#mapToggle');
  assert.equal(await page.locator('#mapShell').evaluate(el=>el.hidden),false);
  await page.selectOption('#lapSelect','3');
  await page.fill('#nameInput','Piloto Produção');
  await page.click('#nameSave');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.NEON_RUSH_RELEASE?.version==='15.0.0'&&window.NEON_RUSH_V16?.getState()?.rendering,{timeout:25000});
  assert.equal(await page.locator('#lapSelect').inputValue(),'3');
  assert.equal(await page.evaluate(()=>window.NEON_RUSH_V16.getState().drivers[8].name),'Piloto Produção');
  await page.screenshot({path:'neon-rush-v1470-production-mobile.png',fullPage:true});
  await page.waitForFunction(()=>window.NEON_RUSH_V16.getState().mode==='race',{timeout:15000});
  assert.equal(await page.evaluate(()=>window.NEON_RUSH_V16.receiveGift({sender:'BOT Teste',recipientId:'90',gift:'Presente',source:'bot'})),true);
  await page.waitForFunction(()=>window.NEON_V14_METRICS?.nitroRendered>0,{timeout:8000});
  assert.match(await page.locator('#giftFeed').textContent(),/BOT Teste/);
  // Test real browser-level WebGL loss and recovery when the extension exists.
  const supported=await page.evaluate(()=>Boolean(document.querySelector('#world').getContext('webgl')?.getExtension('WEBGL_lose_context')));
  let webglRecovery='unsupported';
  if(supported){
   await page.evaluate(()=>{
    const ext=document.querySelector('#world').getContext('webgl').getExtension('WEBGL_lose_context');
    ext.loseContext();setTimeout(()=>ext.restoreContext(),650);
   });
   await page.waitForFunction(()=>window.NEON_RUSH_V16?.getState()?.mode==='gpu-error',{timeout:9000});
   await page.waitForFunction(()=>window.NEON_RUSH_V16?.getState()?.rendering&&window.NEON_RUSH_V16.getState().mode!=='gpu-error',{timeout:25000});
   webglRecovery='pass';
  }
  await page.setViewportSize({width:360,height:800});
  await page.waitForTimeout(400);
  const small=await page.evaluate(()=>({
   map:document.querySelector('#minimap').getBoundingClientRect().toJSON(),
   world:document.querySelector('#world').getBoundingClientRect().toJSON()
  }));
  assert.ok(small.map.left>=0&&small.map.right<=360,'small Android minimap clipping');
  assert.ok(small.world.height>200);
  assert.deepEqual(errors,[],'unexpected browser JS errors');
  console.log(JSON.stringify({result:'PASS',release:initial.release,models:initial.modelCount,markers:initial.state.mapMarkers.length,webglRecovery,qualityToggle:true,mapToggle:true,lapsPersist:true,namesPersist:true,giftNitro:true,viewports:['390x844','360x800'],errors},null,2));
 } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exit(1);});
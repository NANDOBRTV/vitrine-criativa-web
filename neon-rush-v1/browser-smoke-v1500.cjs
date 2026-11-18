'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.NEON_RUSH_RELEASE?.version==='15.0.0'&&window.NEON_V14_DIAGNOSTICS?.real3D===true&&window.NEON_RUSH_V16?.getState()?.mapMarkers?.length===50,{timeout:70000});
  const initial=await page.evaluate(()=>({
   version:window.NEON_RUSH_RELEASE,drivers:window.NEON_RUSH_V16.getState().drivers,
   map:window.NEON_RUSH_V16.getState().mapMarkers,models:window.NEON_V14_METRICS.carModels,
   positions:document.querySelector('#position').textContent,drawn:window.NEON_V14_METRICS.visibleVehicles
  }));
  assert.equal(initial.version.vehicles,50);
  assert.equal(initial.drivers.length,50);
  assert.equal(initial.map.length,50);
  assert.equal(new Set(initial.drivers.map(d=>d.id)).size,50);
  assert.equal(initial.drivers.filter(d=>d.generated).length,40);
  assert.equal(initial.models.uniqueLiveries,50);
  assert.equal(initial.models.uniqueModels,10,'ten original chassis should be preserved');
  assert.equal(initial.models.paintings,250);
  assert.equal(initial.drawn,50);
  assert.match(initial.positions,/\/50/);
  assert.equal(await page.locator('#liveRaceRank .liveRankRow').count(),5);
  assert.equal(await page.locator('#rank > div').count(),50);
  await page.locator('#choose').click();
  assert.equal(await page.locator('#pickerList button').count(),50);
  const generatedPreview=await page.locator('#pickerList button').nth(10).locator('img').getAttribute('src');
  assert.ok(generatedPreview?.startsWith('data:image/png;base64,'),'extra car must have generated preview');
  await page.locator('#pickerList button').nth(10).click();
  const selectedId=initial.drivers[10].id;
  const viewed=await page.evaluate(()=>window.NEON_RUSH_V16.getState().drivers[10].id);
  assert.equal(viewed,selectedId);
  await page.waitForFunction(()=>window.NEON_RUSH_V16.getState().mode==='race',{timeout:16000});
  const taps=await page.evaluate((id)=>window.NEON_RUSH_V16.receiveTap({sender:'Nova Equipe',viewerId:'new-team-test',count:250,recipientId:id,source:'demo'}),selectedId);
  assert.equal(taps.accepted,true);assert.equal(taps.likes,1);assert.equal(taps.nitros,1);
  await page.waitForFunction(()=>window.NEON_V14_METRICS?.nitroRendered>0,{timeout:10000});
  assert.match(await page.locator('#liveLikesRank').textContent(),/Nova Equipe/);
  const gift=await page.evaluate((id)=>window.NEON_RUSH_V16.receiveGift({sender:'Equipe Teste',recipientId:id,gift:'Presente',source:'demo'}),selectedId);
  assert.equal(gift,true);
  await page.screenshot({path:'neon-rush-v1500-50cars-expanded-ranks-android.png',fullPage:true});
  const screens=[];
  for(const w of [390,360]){
   await page.setViewportSize({width:w,height:Math.round(w*16/9)});
   await page.waitForTimeout(300);
   const b=await page.locator('#liveRanks').boundingBox(),f=await page.locator('#frame').boundingBox();
   assert.ok(b&&f&&b.x>=f.x&&b.x+b.width<=f.x+f.width+1&&b.y+b.height<=f.y+f.height+1,'HUD clipped for '+w);
   screens.push(w);
  }
  assert.deepEqual(errors,[],'Uncaught browser JS errors');
  console.log(JSON.stringify({result:'PASS',cars:50,newCars:40,skins:initial.models.paintings,chassis:10,rendered:initial.drawn,minimapDots:50,top5:5,fullRank:50,previewGenerated:true,tapLikes:taps.likes,nitro:true,viewports:screens,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
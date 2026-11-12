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
  await page.waitForFunction(()=>window.NEON_RUSH_V16?.getState()?.rendering&&window.NEON_V14_DIAGNOSTICS?.mapPoints===10,{timeout:25000});
  function verifyMarkers(markers){
   assert.equal(markers.length,10);
   for(let i=0;i<markers.length;i++){
    const m=markers[i];
    assert.ok(m.x>=8&&m.x<=156&&m.y>=8&&m.y<=186,'Outside minimap: '+m.id);
    for(let j=0;j<i;j++){
     const n=markers[j],d=Math.hypot(m.x-n.x,m.y-n.y);
     assert.ok(d>14,'Badges overlap: '+m.id+' '+n.id+' '+d);
    }
   }
  }
  let initial=await page.evaluate(()=>window.NEON_RUSH_V16.getState());
  verifyMarkers(initial.mapMarkers);
  assert.equal(initial.drivers.length,10);
  assert.equal(initial.lapDistance,10000);
  await page.waitForFunction(()=>window.NEON_RUSH_V16.getState().mode==='race',{timeout:12000});
  const pilotId=await page.evaluate(()=>window.NEON_RUSH_V16.getState().drivers[8].id);
  const ok=await page.evaluate((id)=>window.NEON_RUSH_V16.receiveGift({sender:'João BOT',gift:'Presente',recipientId:id,source:'bot'}),pilotId);
  assert.equal(ok,true);
  await page.waitForFunction(()=>window.NEON_V14_METRICS?.nitroRendered>0,{timeout:5000});
  await page.waitForTimeout(400);
  const after=await page.evaluate(()=>({
   state:window.NEON_RUSH_V16.getState(),
   nitroRendered:window.NEON_V14_METRICS.nitroRendered,
   feedText:document.querySelector('#giftFeed').textContent,
   badgeText:document.querySelector('#nitroBadge').textContent,
   badgeHidden:document.querySelector('#nitroBadge').hidden,
   mapStyle:getComputedStyle(document.querySelector('#mapShell')).backgroundColor,
   mapAlpha:document.querySelector('#minimap').getContext('2d').getImageData(0,0,1,1).data[3],
   botToggle:document.querySelector('#botGifts').textContent
  }));
  verifyMarkers(after.state.mapMarkers);
  assert.ok(after.nitroRendered>=1);
  assert.ok(after.state.gifts>=1);
  assert.ok(after.feedText.includes('João BOT'));
  assert.ok(after.feedText.includes('NITRO'));
  assert.equal(after.badgeHidden,false);
  assert.ok(after.badgeText.includes('NITRO'));
  assert.equal(after.mapAlpha,0);
  assert.match(after.mapStyle,/rgba\(0, 0, 0, 0\)|transparent/);
  await page.screenshot({path:'neon-rush-v1460-nitro-android.png',fullPage:true});
  await page.click('#botGifts');
  assert.ok((await page.locator('#botGifts').textContent()).includes('OFF'));
  const count=await page.evaluate(()=>window.NEON_RUSH_V16.getState().gifts);
  await page.click('#gift');
  assert.ok((await page.evaluate(()=>window.NEON_RUSH_V16.getState().gifts))>count);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',markers:after.state.mapMarkers.length,minimMapIsTransparent:after.mapAlpha===0,renderedNitro:after.nitroRendered,chat:after.feedText,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
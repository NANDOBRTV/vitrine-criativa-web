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
  await page.waitForFunction(()=>window.NEON_RUSH_RELEASE?.version==='14.8.0'&&window.NEON_V14_DIAGNOSTICS?.real3D===true&&window.NEON_RUSH_V16?.getState()?.mapMarkers?.length===10,{timeout:25000});
  assert.equal(await page.locator('#liveRaceRank .liveRankRow').count(),3);
  assert.equal(await page.locator('#rank').locator('div').count(),10);
  assert.match(await page.locator('#liveTapRank').textContent(),/Aguardando taps/);
  assert.match(await page.locator('#liveLikesRank').textContent(),/Aguardando curtidas/);
  await page.waitForFunction(()=>window.NEON_RUSH_V16.getState().mode==='race',{timeout:12000});
  await page.locator('#tapUserInput').fill('Lia Teste');
  await page.locator('#tapFifty').click();
  await page.locator('#tapFifty').click();
  const r1=await page.evaluate(()=>window.NEON_RUSH_V16.getTapRankings());
  assert.equal(r1.taps[0].taps,100);
  assert.equal(r1.taps[0].likes,0);
  await page.locator('#tapTwoFifty').click();
  const r2=await page.evaluate(()=>window.NEON_RUSH_V16.getTapRankings());
  assert.equal(r2.taps[0].taps,350);
  assert.equal(r2.taps[0].likes,1);
  assert.equal(r2.totalNitros,1);
  assert.match(await page.locator('#liveTapRank').textContent(),/Lia Teste/);
  assert.match(await page.locator('#liveLikesRank').textContent(),/Lia Teste/);
  assert.match(await page.locator('#giftFeed').textContent(),/TAP TAPS/);
  const spectator=await page.evaluate(()=>window.NEON_RUSH_V16.receiveTap({sender:'Bruno',viewerId:'viewer-b',count:500,recipientId:'11',source:'external'}));
  assert.equal(spectator.accepted,true);assert.equal(spectator.likes,2);assert.equal(spectator.nitros,2);
  await page.waitForTimeout(600);
  assert.match(await page.locator('#liveLikesRank').textContent(),/Bruno/);
  const voiceSelector=await page.locator('#voiceSelect').inputValue();
  assert.equal(voiceSelector,'auto');
  await page.locator('#voiceTest').click();
  assert.match(await page.locator('#narrationCaption').textContent(),/grid está formado/);
  assert.equal(await page.locator('#narrationCaption').evaluate(el=>el.hidden),false);
  await page.screenshot({path:'neon-rush-v1480-taps-ranks-mobile.png',fullPage:true});
  for(const viewport of [{width:390,height:844},{width:360,height:800}]){
   await page.setViewportSize(viewport);
   await page.waitForTimeout(200);
   const box=await page.locator('#liveRanks').boundingBox();
   const frame=await page.locator('#frame').boundingBox();
   assert.ok(box&&frame);
   assert.ok(box.x>=frame.x&&box.x+box.width<=frame.x+frame.width+1);
   assert.ok(box.y>=frame.y&&box.y+box.height<=frame.y+frame.height+1);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',rankGroups:3,raceRows:10,viewerTaps:350,viewerLikes:1,secondViewerLikes:2,voiceTest:true,models:10,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
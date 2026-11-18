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
  await page.waitForFunction(()=>window.NEON_RUSH_RELEASE?.version==='15.0.0'&&window.NEON_RUSH_V16?.getState()?.rendering,{timeout:25000});
  assert.equal(await page.locator('#botLikes').getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>window.NEON_RUSH_V16?.getState()?.mode==='race',{timeout:12000});
  await page.waitForFunction(()=>window.NEON_RUSH_V16?.getBotLikeStatus()?.eventsSent>=2,{timeout:12000});
  const ongoing=await page.evaluate(()=>({
    bot:window.NEON_RUSH_V16.getBotLikeStatus(),
    taps:window.NEON_RUSH_V16.getTapRankings()
  }));
  assert.ok(ongoing.bot.eventsSent>=2);
  assert.ok(ongoing.taps.taps.length>=2,'two bots should populate tap leaderboard');
  assert.ok(ongoing.taps.taps.every(x=>x.name.endsWith(' BOT')));
  assert.match(await page.locator('#liveTapRank').textContent(),/BOT/);
  assert.equal(await page.locator('#liveRaceRank .liveRankRow').count(),5);
  await page.locator('#botLikes').click();
  assert.equal(await page.locator('#botLikes').getAttribute('aria-pressed'),'false');
  const stopped=await page.evaluate(()=>window.NEON_RUSH_V16.getBotLikeStatus().eventsSent);
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(()=>window.NEON_RUSH_V16.getBotLikeStatus().eventsSent),stopped,'bots continued liking after OFF');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.NEON_RUSH_V16?.getState()?.rendering,{timeout:25000});
  assert.equal(await page.locator('#botLikes').getAttribute('aria-pressed'),'false','option should persist after reload');
  await page.locator('#botLikes').click();
  assert.equal(await page.locator('#botLikes').getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>window.NEON_RUSH_V16?.getState()?.mode==='race',{timeout:12000});
  await page.waitForFunction(()=>window.NEON_RUSH_V16?.getBotLikeStatus()?.eventsSent>=1,{timeout:9000});
  const joined=await page.evaluate(()=>{
   const existing=window.NEON_RUSH_V16.getTapRankings().taps.find(x=>x.name==='João BOT');
   return window.NEON_RUSH_V16.receiveTap({sender:'João BOT',viewerId:'demo-like-bot-0',count:250,recipientId:'04',source:'bot'});
  });
  assert.equal(joined.accepted,true);
  assert.ok(joined.likes>=1);
  await page.waitForFunction(()=>window.NEON_V14_METRICS?.nitroRendered>0,{timeout:7000});
  await page.waitForFunction(()=>document.querySelector('#liveLikesRank')?.textContent?.includes('João BOT'),{timeout:4000});
  assert.match(await page.locator('#liveLikesRank').textContent(),/João BOT/);
  assert.match(await page.locator('#giftFeed').textContent(),/BOT DE TESTE/);
  await page.screenshot({path:'neon-rush-v1490-auto-bot-likes-android.png',fullPage:true});
  for(const width of [390,360]){
   await page.setViewportSize({width,height:Math.round(width*16/9)});
   await page.waitForTimeout(120);
   const r=await page.locator('#liveRanks').boundingBox(),f=await page.locator('#frame').boundingBox();
   assert.ok(r&&f&&r.x>=f.x&&r.x+r.width<=f.x+f.width+1);
  }
  assert.deepEqual(errors,[],'Unexpected JS errors');
  console.log(JSON.stringify({result:'PASS',automatedBotTaps:ongoing.taps.totalTaps,autoEvents:ongoing.bot.eventsSent,botNames:ongoing.taps.taps.map(x=>x.name),togglePersists:true,milestoneLikes:joined.likes,milestoneNitro:true,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
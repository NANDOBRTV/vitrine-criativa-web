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
  await page.waitForFunction(()=>window.NEON_RUSH_V16?.getState()?.mapMarkers?.length===10&&window.NEON_V14_DIAGNOSTICS?.real3D===true&&window.NEON_V14_METRICS?.carModels?.uniqueModels===10,{timeout:25000});
  const state=await page.evaluate(()=>{
   const markers=window.NEON_RUSH_V16.getState().mapMarkers;
   const a=mapTrack.atMeters(-10),b=mapTrack.atMeters(10),len=Math.hypot(b.x-a.x,b.y-a.y);
   const tangent={x:(b.x-a.x)/len,y:(b.y-a.y)/len};
   return {markers,tangent,real3D:window.NEON_V14_DIAGNOSTICS?.real3D,models:window.NEON_V14_METRICS?.carModels?.uniqueModels};
  });
  assert.equal(state.real3D,true);
  assert.equal(state.models,10);
  assert.equal(state.markers.length,10);
  assert.ok(state.markers.every(p=>p.layout==='grid'));
  const ids=['04','11','18','27'];
  const first=state.markers.filter(m=>ids.includes(m.id));
  assert.equal(first.length,4);
  const cross=m=>m.x*(-state.tangent.y)+m.y*state.tangent.x;
  const along=m=>m.x*state.tangent.x+m.y*state.tangent.y;
  const width=Math.max(...first.map(cross))-Math.min(...first.map(cross));
  const depth=Math.max(...first.map(along))-Math.min(...first.map(along));
  assert.ok(width>=45,'Grid must have four side-by-side columns, width='+width);
  assert.ok(depth<15,'Starting row cannot be rendered like a train, longitudinal='+depth);
  for(let i=0;i<state.markers.length;i++){
   const a=state.markers[i];
   assert.ok(a.x>=8&&a.x<=156&&a.y>=8&&a.y<=186);
   for(let j=i+1;j<state.markers.length;j++){
    const b=state.markers[j];
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=14,'overlap '+a.id+' '+b.id);
   }
  }
  await page.screenshot({path:'neon-rush-v1462-grid-android.png',fullPage:true});
  await page.waitForFunction(()=>window.NEON_RUSH_V16.getState().mode==='race',{timeout:15000});
  const gift=await page.evaluate(()=>window.NEON_RUSH_V16.receiveGift({sender:'Teste QA',recipientId:'90',gift:'Presente',source:'demo'}));
  assert.equal(gift,true,'gift interaction preserved');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',gridColumns:4,gridRows:3,rowWidth:width,rowDepth:depth,markers:10,webgl:state.real3D,models:state.models,gift,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
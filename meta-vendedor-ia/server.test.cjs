"use strict";
const {spawn} = require("node:child_process");
const {randomInt} = require("node:crypto");
const {test, after, before} = require("node:test");
const assert = require("node:assert/strict");

const port=22000+randomInt(1000);
const base="http://127.0.0.1:"+port;
const fakeApiKey="CI_TEST_ONLY_NOT_A_REAL_SECRET_1234567890";
let child;
before(async () => {
  child=spawn(process.execPath,[require("node:path").join(__dirname,"server.js")],{
    env:{
      ...process.env,
      PORT:String(port),
      WEBHOOK_VERIFY_TOKEN:"CI_VERIFY_ONLY",
      VITRINE_SEND_API_KEY:fakeApiKey,
      META_APP_SECRET:"CI_FAKE_META_SECRET",
      META_WA_ACCESS_TOKEN:"CI_FAKE_TOKEN",
      META_PHONE_NUMBER_ID:"1466234116566033"
    },stdio:["ignore","pipe","pipe"]
  });
  let started=false;
  for (let n=0;n<80;n++) {
    if (child.exitCode !== null) throw new Error("Server exited unexpectedly");
    try {
      const r=await fetch(base+"/health");
      if (r.ok) {started=true;break;}
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(started,"server starts on assigned port");
});
after(()=>{if(child && child.exitCode===null)child.kill("SIGTERM");});

test("health reports status but never secrets",async ()=>{
  const r=await fetch(base+"/health"),t=await r.text();
  assert.equal(r.status,200);const j=JSON.parse(t);
  assert.equal(j.auto_reply_enabled,false);
  assert.equal(j.outbound_integration_enabled,true);
  assert.equal(t.includes(fakeApiKey),false);
  assert.equal(t.includes("CI_FAKE_TOKEN"),false);
});

test("Meta webhook accepts only correct verify token",async ()=>{
  const good=await fetch(base+"/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=CI_VERIFY_ONLY&hub.challenge=78910");
  assert.equal(good.status,200);assert.equal(await good.text(),"78910");
  const bad=await fetch(base+"/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=NOPE&hub.challenge=78910");
  assert.equal(bad.status,403);
});

test("Meta POST refuses invalid signature",async ()=>{
  const r=await fetch(base+"/webhooks/whatsapp",{
    method:"POST",headers:{"Content-Type":"application/json","x-hub-signature-256":"sha256=bad"},
    body:JSON.stringify({object:"whatsapp_business_account",entry:[]})
  });
  assert.equal(r.status,401);
});

test("MCP requires separate integration credential",async ()=>{
  const r=await fetch(base+"/mcp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{}})});
  assert.equal(r.status,401);
});

test("MCP initialize + tools/list work when authenticated",async ()=>{
  const headers={"Authorization":"Bearer "+fakeApiKey,"Content-Type":"application/json"};
  const init=await fetch(base+"/mcp",{method:"POST",headers,body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{}})});
  assert.equal(init.status,200);const hello=await init.json();
  assert.equal(hello.result.serverInfo.name,"vitrine-vendedor-ia");
  const r=await fetch(base+"/mcp",{method:"POST",headers,body:JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/list"})});
  assert.equal(r.status,200);const x=await r.json();
  assert.equal(x.result.tools[0].name,"send_approved_whatsapp_template");
});

test("outbound endpoint refuses missing consent even with integration key",async ()=>{
  const r=await fetch(base+"/api/whatsapp/send-template",{
    method:"POST",headers:{"Authorization":"Bearer "+fakeApiKey,"Content-Type":"application/json"},
    body:JSON.stringify({to:"5582999999999",template_name:"example_template",opt_in_confirmed:false})
  });
  assert.equal(r.status,400);
});

test("outbound endpoint refuses unauthenticated calls without contacting Meta",async ()=>{
  const r=await fetch(base+"/api/whatsapp/send-template",{
    method:"POST",headers:{"Content-Type":"application/json"},body:"{}"
  });
  assert.equal(r.status,401);
});

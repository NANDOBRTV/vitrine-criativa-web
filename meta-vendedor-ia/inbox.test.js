"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const inbox=require("./postgres-inbox");
test("parses simulated incoming text event without contacting Meta or database",()=>{
 const event={entry:[{changes:[{value:{messages:[{id:"simulated-message-1",from:"5511999990000",timestamp:1762459200,type:"text",text:{body:"Mensagem simulada"}}]}}]}]};
 const rows=inbox.parse(event);
 assert.equal(rows.length,1);
 assert.equal(rows[0].id,"simulated-message-1");
 assert.equal(rows[0].text,"Mensagem simulada");
 assert.equal(rows[0].from,"5511999990000");
});
test("ignores events without incoming messages",()=>assert.deepEqual(inbox.parse({entry:[{changes:[{value:{statuses:[{status:"delivered"}]}}]}]}),[]));

test("accepts business-scoped user ID when phone number is omitted",()=>{
 const event={entry:[{changes:[{value:{messages:[{id:"bsuid-example-1",from_user_id:"US.13491208655302741918",timestamp:"1749416383",type:"text",text:{body:"Another color?"}}]}}]}]};
 const rows=inbox.parse(event);
 assert.equal(rows.length,1);
 assert.equal(rows[0].from,"US.13491208655302741918");
 assert.equal(rows[0].text,"Another color?");
});

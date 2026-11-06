"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const inbox = require("./inbox");
test("receives simulated Meta text event, deduplicates and lists safely", () => {
 const id="simulated-"+Date.now();
 const event={entry:[{changes:[{value:{messages:[{id,from:"5582996843269",timestamp:Math.floor(Date.now()/1000),type:"text",text:{body:"Mensagem simulada; não enviada"}}]}}]}]};
 assert.equal(inbox.ingest(event),1);
 assert.equal(inbox.ingest(event),0);
 const result=inbox.list({limit:1});
 assert.equal(result.messages[0].id,id);
 assert.equal(result.messages[0].text,"Mensagem simulada; não enviada");
 assert.equal(result.volatile,true);
});
test("rejects invalid date filter",()=>assert.throws(()=>inbox.list({date:"invalid"})));

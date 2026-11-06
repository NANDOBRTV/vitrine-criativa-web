"use strict";
// Load the database driver only when database access is required.
let pool,ready;
function connection() {
 if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
 if (!pool) { const {Pool}=require("pg"); pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000,
   ssl:process.env.DATABASE_SSL==="require"?{rejectUnauthorized:true}:undefined}); }
 return pool;
}
async function init() {
 if (!ready) ready=(async()=>{
  const db=connection();
  await db.query("CREATE SCHEMA IF NOT EXISTS whatsapp_vitrine");
  await db.query(`CREATE TABLE IF NOT EXISTS whatsapp_vitrine.inbound_messages (
    id text PRIMARY KEY, sender text NOT NULL, received_at timestamptz NOT NULL,
    message_type text NOT NULL, body text, created_at timestamptz NOT NULL DEFAULT now()
  )`);
 })().catch(e=>{ready=null;throw e});
 return ready;
}
function parse(event) {
 const records=[];
 for(const entry of event.entry||[]) for(const change of entry.changes||[]) {
  for(const m of change.value?.messages||[]) {
   if(!m.id || !m.from) continue;
   const time=Number(m.timestamp);
   records.push({id:String(m.id).slice(0,160),from:String(m.from).slice(0,32),
    timestamp:Number.isFinite(time)&&time>0?new Date(time*1000):new Date(),
    type:String(m.type||"unknown").slice(0,32),
    text:m.type==="text"?String(m.text?.body||"").slice(0,4096):null});
  }
 }
 return records;
}
async function ingest(event) {
 await init();let added=0;
 for(const m of parse(event)) {
  const r=await connection().query(
   "INSERT INTO whatsapp_vitrine.inbound_messages (id,sender,received_at,message_type,body) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
   [m.id,m.from,m.timestamp,m.type,m.text]);
  added+=r.rowCount;
 }
 return added;
}
async function list({date,limit=30}={}) {
 await init();
 const n=Math.max(1,Math.min(100,Number(limit)||30));
 if(date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("Invalid date");
 const q=date?
  ["SELECT id,sender AS from,received_at,message_type AS type,body AS text FROM whatsapp_vitrine.inbound_messages WHERE received_at >= $1::date AND received_at < ($1::date + interval '1 day') ORDER BY received_at DESC LIMIT $2",[date,n]]:
  ["SELECT id,sender AS from,received_at,message_type AS type,body AS text FROM whatsapp_vitrine.inbound_messages ORDER BY received_at DESC LIMIT $1",[n]];
 const r=await connection().query(...q);
 return {timezone:"UTC",persistent:true,messages:r.rows};
}
module.exports={init,ingest,list,parse};

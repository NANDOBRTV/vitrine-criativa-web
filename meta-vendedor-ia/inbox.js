"use strict";
// Bounded, volatile inbox. Messages disappear on restart; no external storage.
const messages = [];
const LIMIT = 300;
function ingest(event) {
  let added = 0;
  for (const entry of event.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    for (const m of value.messages || []) {
      if (!m.id || messages.some(x => x.id === m.id)) continue;
      const record = {
        id: String(m.id).slice(0,160),
        from: String(m.from || "").slice(0,32),
        timestamp: Number(m.timestamp) || Math.floor(Date.now()/1000),
        type: String(m.type || "unknown").slice(0,32),
        text: m.type === "text" ? String(m.text?.body || "").slice(0,4096) : null
      };
      messages.push(record); added++;
    }
  }
  if (messages.length > LIMIT) messages.splice(0,messages.length-LIMIT);
  return added;
}
function list({date,limit=30}={}) {
  const n=Math.max(1,Math.min(100,Number(limit)||30));
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
  // Meta timestamps are UTC. Return UTC ISO timestamps; date filter is UTC.
  return {timezone:"UTC",volatile:true,retained:messages.length,
    messages:messages.filter(m=>!date || new Date(m.timestamp*1000).toISOString().slice(0,10)===date)
      .slice(-n).reverse().map(m=>({...m,received_at:new Date(m.timestamp*1000).toISOString()}))};
}
module.exports={ingest,list};

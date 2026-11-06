"use strict";
const crypto=require("node:crypto");
const inbox=require("./postgres-inbox");
const lastSend=new Map();
function respond(res,status,obj){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(obj));}
function auth(req){const secret=process.env.VITRINE_SEND_API_KEY||"",v=req.headers.authorization||"";if(secret.length<24||!v.startsWith("Bearer "))return false;const a=Buffer.from(v.slice(7)),b=Buffer.from(secret);return a.length===b.length&&crypto.timingSafeEqual(a,b)}
async function sendText(req,res){
 if(!auth(req))return respond(res,401,{error:"Unauthorized"});
 let size=0,parts=[];try{for await(const chunk of req){size+=chunk.length;if(size>16384)return respond(res,413,{error:"Body too large"});parts.push(chunk)}}catch{return respond(res,400,{error:"Invalid body"})}
 let v;try{v=JSON.parse(Buffer.concat(parts).toString("utf8"))}catch{return respond(res,400,{error:"Invalid JSON"})}
 if(!v||typeof v.to!=="string"||!/^[1-9][0-9]{7,14}$/.test(v.to)||typeof v.text!=="string"||!v.text.trim()||v.text.length>4096||v.confirmed!==true)return respond(res,400,{error:"Invalid recipient, message or confirmation"});
 const token=process.env.META_WA_ACCESS_TOKEN,phone=process.env.META_PHONE_NUMBER_ID;
 if(!token||!/^\d{6,20}$/.test(phone||""))return respond(res,503,{error:"Meta credentials incomplete"});
 let last;try{last=await inbox.recentInbound(v.to)}catch{return respond(res,503,{error:"Cannot verify customer service window"})}
 if(!last||Date.now()-new Date(last).getTime()>=24*3600000||new Date(last).getTime()>Date.now()+60000)return respond(res,403,{error:"Outside 24-hour customer service window; use approved template"});
 const fingerprint=crypto.createHash("sha256").update(v.to+"\0"+v.text).digest("hex");
 if(lastSend.has(fingerprint)&&Date.now()-lastSend.get(fingerprint)<60000)return respond(res,429,{error:"Duplicate message blocked"});
 lastSend.set(fingerprint,Date.now());
 try{const result=await fetch("https://graph.facebook.com/v25.0/"+phone+"/messages",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to:v.to,type:"text",text:{preview_url:false,body:v.text}}),signal:AbortSignal.timeout(12000)});const data=await result.json().catch(()=>({}));if(!result.ok){lastSend.delete(fingerprint);return respond(res,502,{error:"Meta rejected message",http_status:result.status,meta_error_code:data.error?.code||null})}return respond(res,200,{ok:true,status:"accepted_by_meta_not_delivery_confirmed",message_id:data.messages?.[0]?.id||null})}catch{return respond(res,502,{error:"Request failed; verify delivery before retry"})}
}
module.exports={sendText};

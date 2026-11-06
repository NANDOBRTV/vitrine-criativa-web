"use strict";
const crypto=require("node:crypto");
const inbox=require("./postgres-inbox");
const locks=new Set();
const instruction="Você é o atendente virtual da Vitrine Criativa Web, que oferece criação de sites para pequenos negócios no Brasil. Responda em português brasileiro, de modo curto, educado e profissional. Identifique-se como assistente virtual. Não invente preços, prazos, descontos, links, resultados ou disponibilidade. Se o cliente pedir orçamento, solicite o tipo de negócio e o que precisa no site. Não solicite senhas, dados bancários ou documentos. Não pressione o cliente, não envie propaganda não solicitada. Se pedir humano, informe que a solicitação será encaminhada e não continue vendendo. Não faça promessas de pagamentos ou vendas.";
async function answer(text){
 const key=process.env.OPENAI_API_KEY;
 if(!key)throw Error("AI key unavailable");
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
 try{
 const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.VITRINE_AI_MODEL||"gpt-4.1-mini",instructions:instruction,input:text,max_output_tokens:180,store:false}),signal:controller.signal});
 if(!r.ok)throw Error("AI provider error");
 const data=await r.json();const result=(data.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==="output_text").map(c=>c.text).join(" ").trim();
 if(!result)throw Error("Empty AI reply");return result.slice(0,1200);
 }finally{clearTimeout(timeout)}
}
async function handle(event){
 if(process.env.VITRINE_AUTO_REPLY_ENABLED!=="true")return;
 const token=process.env.META_WA_ACCESS_TOKEN,phone=process.env.META_PHONE_NUMBER_ID;
 if(!token||!/^\d{6,20}$/.test(phone||"")||!process.env.OPENAI_API_KEY)return;
 for(const entry of event.entry||[])for(const change of entry.changes||[])for(const m of change.value?.messages||[]){
 if(m.type!=="text"||!m.text?.body||!m.id||!m.from||!/^[1-9]\d{7,14}$/.test(m.from))continue;
 if(locks.has(m.id))continue;locks.add(m.id);
 try{
 const last=await inbox.recentInbound(m.from);
 if(!last||Date.now()-new Date(last).getTime()>24*3600000)continue;
 const reply=await answer(m.text.body.slice(0,2000));
 const r=await fetch("https://graph.facebook.com/v25.0/"+phone+"/messages",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:m.from,type:"text",text:{body:reply,preview_url:false}}),signal:AbortSignal.timeout(12000)});
 if(!r.ok)console.error("AI_REPLY_META_REJECTED",r.status);else console.log("AI_REPLY_ACCEPTED",crypto.createHash("sha256").update(m.id).digest("hex").slice(0,12));
 }catch(e){console.error("AI_REPLY_FAILED",e.name||"Error")}finally{locks.delete(m.id)}
 }
}
module.exports={handle};

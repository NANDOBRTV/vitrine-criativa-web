"use strict";
/** Stateless minimal MCP Streamable HTTP server for the Vitrine WhatsApp connector. */
const {sendTemplate} = require("./send-api");
const crypto = require("node:crypto");
const inbox = require("./inbox");

function authorized(req) {
  const key = process.env.VITRINE_SEND_API_KEY;
  const a = String(req.headers.authorization || "");
  if (!key || key.length < 24 || !a.startsWith("Bearer ")) return false;
  const x = Buffer.from(a.slice(7)), y = Buffer.from(key);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function write(res,status,obj) {
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"});
  res.end(JSON.stringify(obj));
}
const tool = {
  name:"send_approved_whatsapp_template",
  title:"Enviar modelo aprovado no WhatsApp",
  description:"Envia UMA mensagem de template aprovado pela Meta para destinatário com consentimento comprovado. Exige pedido do usuário para destinatário específico e opt_in_confirmed=true. Não é ferramenta de disparo em massa.",
  inputSchema:{
    type:"object",additionalProperties:false,
    required:["to","template_name","opt_in_confirmed"],
    properties:{
      to:{type:"string",description:"Número de destinatário E.164 sem sinal +"},
      template_name:{type:"string",description:"Template já aprovado na Meta, ex. 3p_direct_integration_test_template"},
      language_code:{type:"string",description:"Idioma do template, ex. en_US ou pt_BR"},
      opt_in_confirmed:{type:"boolean",description:"Confirme consentimento específico do destinatário"}
    }
  }
};
const inboxTool = {
  name:"list_received_whatsapp_messages",
  title:"Consultar mensagens recebidas no WhatsApp",
  description:"Lista mensagens recebidas após a implantação desta versão. Armazenamento temporário em memória: mensagens se perdem ao reiniciar o serviço. Data e horários em UTC.",
  inputSchema:{type:"object",additionalProperties:false,properties:{
    date:{type:"string",description:"Data UTC YYYY-MM-DD (opcional)"},
    limit:{type:"integer",minimum:1,maximum:100}
  }}
};
async function mcp(req,res) {
  if (!authorized(req)) return write(res,401,{error:"Unauthorized; configure VITRINE_SEND_API_KEY in Render and connect the plugin with the same key"});
  if (req.method === "GET") return write(res,405,{error:"SSE not supported; use POST JSON-RPC"});
  if (req.method !== "POST") return write(res,405,{error:"Method not allowed"});
  let raw = "";
  req.on("data", c => {raw += c.toString("utf8"); if (raw.length > 32768) req.destroy();});
  req.on("error", () => {});
  req.on("end", async () => {
    let msg;
    try {msg=JSON.parse(raw);}catch {return write(res,400,{error:"Invalid JSON"});}
    if (!msg || msg.jsonrpc!=="2.0" || typeof msg.method!=="string") return write(res,400,{error:"Invalid JSON-RPC"});
    if (msg.method==="notifications/initialized") {res.writeHead(202);return res.end();}
    const base={jsonrpc:"2.0",id:msg.id??null};
    if (msg.method==="initialize") return write(res,200,{
      ...base,result:{
        protocolVersion:"2025-03-26",
        capabilities:{tools:{listChanged:false}},
        serverInfo:{name:"vitrine-vendedor-ia",version:"1.0.0"}
      }
    });
    if (msg.method==="ping") return write(res,200,{...base,result:{}});
    if (msg.method==="tools/list") return write(res,200,{...base,result:{tools:[tool,inboxTool]}});
    if (msg.method==="tools/call" && msg.params?.name===inboxTool.name) {
      try {
        const result=inbox.list(msg.params?.arguments || {});
        return write(res,200,{...base,result:{content:[{type:"text",text:JSON.stringify(result)}]}});
      } catch {
        return write(res,200,{...base,result:{content:[{type:"text",text:"Invalid inbox query"}],isError:true}});
      }
    }
    if (msg.method==="tools/call" && msg.params?.name===tool.name) {
      // Reuse the same validated & authenticated send-template routine by simulating
      // only the body-bearing request, without repeating/revealing the auth token.
      const args=msg.params?.arguments || {};
      const fakeReq = require("node:stream").Readable.from([Buffer.from(JSON.stringify(args))]);
      fakeReq.headers=req.headers;
      const parts=[];let status=500;
      const fakeRes={
        writeHead:(s)=>{status=s;},
        end:(chunk)=>{parts.push(String(chunk||""));}
      };
      try {
        await sendTemplate(fakeReq,fakeRes);
        const payload=parts.join("");
        const value=JSON.parse(payload||"{}");
        return write(res,200,{...base,result:{
          content:[{type:"text",text:JSON.stringify(value)}],
          isError:status>=400
        }});
      } catch {
        return write(res,200,{...base,result:{content:[{type:"text",text:"Falha na chamada de envio"}],isError:true}});
      }
    }
    return write(res,200,{...base,error:{code:-32601,message:"Method not found"}});
  });
}
module.exports={mcp};

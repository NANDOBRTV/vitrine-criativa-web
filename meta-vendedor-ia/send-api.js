"use strict";

/* Authenticated outbound API. Disabled unless VITRINE_SEND_API_KEY is set. */
const crypto = require("node:crypto");
const lastSend = new Map();
const PATH = "/api/whatsapp/send-template";
const SERVER = "https://vitrine-vendedor-ia-webhook.onrender.com";

function secureEquals(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function json(res, code, obj) {
  res.writeHead(code, {
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff"
  });
  res.end(JSON.stringify(obj));
}

const schema = {
  openapi:"3.1.0",
  info:{title:"Vitrine WhatsApp - Envio de modelos aprovados",version:"1.0.0",description:"Envio apenas para contatos que deram consentimento."},
  servers:[{url:SERVER}],
  components:{securitySchemes:{bearerAuth:{type:"http",scheme:"bearer"}}},
  paths:{
    "/api/whatsapp/send-template":{
      post:{
        operationId:"enviarModeloWhatsApp",
        summary:"Enviar template WhatsApp aprovado somente a contato que consentiu",
        security:[{bearerAuth:[]}],
        requestBody:{required:true,content:{"application/json":{schema:{
          type:"object",additionalProperties:false,
          required:["to","template_name","opt_in_confirmed"],
          properties:{
            to:{type:"string",description:"E.164 sem +, ex. 5582999999999"},
            template_name:{type:"string"},
            language_code:{type:"string",default:"pt_BR"},
            opt_in_confirmed:{type:"boolean",enum:[true]}
          }
        }}}},
        responses:{"200":{description:"Meta aceitou a solicitação. A entrega não está confirmada."},
          "400":{description:"Dados inválidos ou falta de consentimento"},
          "401":{description:"Credencial incorreta"},
          "503":{description:"Integração não configurada"}}
      }
    }
  }
};

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > 20 * 1024) { reject(new Error("Too large")); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function sendTemplate(req, res) {
  const secret = process.env.VITRINE_SEND_API_KEY;
  if (!secret || secret.length < 24) return json(res, 503, {ok:false,error:"Integration key not configured"});
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || !secureEquals(auth.slice(7), secret)) {
    return json(res, 401, {ok:false,error:"Unauthorized"});
  }

  let value;
  try { value = JSON.parse((await readBody(req)).toString("utf8")); }
  catch { return json(res, 400, {ok:false,error:"Invalid JSON"}); }
  if (!value || value.opt_in_confirmed !== true ||
      typeof value.to !== "string" || !/^[1-9][0-9]{7,14}$/.test(value.to) ||
      typeof value.template_name !== "string" || !/^[a-z0-9][a-z0-9_]{0,199}$/.test(value.template_name) ||
      (value.language_code !== undefined &&
      (typeof value.language_code !== "string" || !/^[a-z]{2,3}_[A-Z]{2}$/.test(value.language_code)))) {
    return json(res, 400, {ok:false,error:"Invalid input or contact consent not confirmed"});
  }

  const waToken = process.env.META_WA_ACCESS_TOKEN;
  const phoneId = process.env.META_PHONE_NUMBER_ID;
  if (!waToken || !phoneId || !/^[0-9]{6,20}$/.test(phoneId)) {
    return json(res, 503, {ok:false,error:"Meta credentials incomplete"});
  }

  const now = Date.now();
  for (const [key, date] of lastSend) if (now - date > 60000) lastSend.delete(key);
  const fingerprint = crypto.createHash("sha256").update(value.to).digest("hex");
  if (lastSend.has(fingerprint)) return json(res, 429, {ok:false,error:"Duplicate recipient within 60 seconds"});
  lastSend.set(fingerprint, now);

  const payload = {
    messaging_product:"whatsapp",
    to:value.to,
    type:"template",
    template:{name:value.template_name,language:{code:value.language_code || "pt_BR"}}
  };
  const signal = AbortSignal.timeout(12000);
  try {
    const url = "https://graph.facebook.com/v25.0/" + phoneId + "/messages";
    const result = await fetch(url, {
      method:"POST",
      headers:{"Authorization":"Bearer " + waToken,"Content-Type":"application/json"},
      body:JSON.stringify(payload),signal
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) {
      lastSend.delete(fingerprint);
      return json(res, 502, {ok:false,error:"Meta rejected request",http_status:result.status,meta_error_code:data.error?.code || null});
    }
    return json(res, 200, {
      ok:true,
      status:"accepted_by_meta_not_delivery_confirmed",
      message_id:data.messages?.[0]?.id || null
    });
  } catch {
    return json(res, 502, {ok:false,error:"Request failed or timed out; check delivery before retrying"});
  }
}

module.exports = {PATH, schema, sendTemplate};

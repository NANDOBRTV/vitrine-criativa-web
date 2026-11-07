import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const root=path.dirname(fileURLToPath(import.meta.url));
const dbFile=process.env.NZ_DB_FILE||path.join(root,'state.sqlite');
const port=Number(process.env.PORT||3000);
const adminPassword=process.env.NZ_ADMIN_PASSWORD||'';
const sessionSecret=process.env.NZ_SESSION_SECRET||'';
const masterKey=process.env.NZ_MASTER_KEY||'';
const durable=process.env.NZ_DATA_DURABLE==='true';
const graphVersion=process.env.NZ_GRAPH_VERSION||'v26.0';
if(adminPassword.length<20||sessionSecret.length<40||masterKey.length<40){
 throw new Error('NZ_ADMIN_PASSWORD, NZ_SESSION_SECRET and NZ_MASTER_KEY must be securely configured.');
}
fs.mkdirSync(path.dirname(dbFile),{recursive:true});
const db=new DatabaseSync(dbFile);
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
db.exec("CREATE TABLE IF NOT EXISTS contacts(id INTEGER PRIMARY KEY AUTOINCREMENT,wa_id TEXT UNIQUE NOT NULL,name TEXT NOT NULL DEFAULT 'Contato',last_at TEXT,last_inbound_at TEXT,last_auto_at TEXT,paused INTEGER NOT NULL DEFAULT 0,opt_out INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
db.exec("CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,provider_id TEXT UNIQUE,direction TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'text',body TEXT NOT NULL,delivery_status TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
db.exec("CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);");
db.exec("CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,info TEXT NOT NULL DEFAULT '',at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
const now=()=>new Date().toISOString();
const hash=(v)=>crypto.createHash('sha256').update(String(v)).digest();
const constant=(a,b)=>crypto.timingSafeEqual(hash(a),hash(b));
const aesKey=hash(masterKey);
function encrypt(data){
 const nonce=crypto.randomBytes(12);
 const cipher=crypto.createCipheriv('aes-256-gcm',aesKey,nonce);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);
 return Buffer.concat([nonce,cipher.getAuthTag(),encrypted]).toString('base64url');
}
function decrypt(raw){
 const data=Buffer.from(raw,'base64url'),nonce=data.subarray(0,12),tag=data.subarray(12,28);
 const decipher=crypto.createDecipheriv('aes-256-gcm',aesKey,nonce);
 decipher.setAuthTag(tag);
 return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString());
}
const defaultConfig={
 businessName:'NandoZap IA',systemPrompt:'Você é um atendente comercial educado. Responda somente perguntas relacionadas à empresa. Não prometa preços, entregas ou descontos que não foram confirmados. Se o cliente quiser falar com uma pessoa, peça para aguardar o atendimento humano.',
 autoMode:'off',metaAppSecret:'',metaVerifyToken:process.env.NZ_META_VERIFY_TOKEN||crypto.randomBytes(24).toString('hex'),
 metaAccessToken:'',metaPhoneId:'',openaiApiKey:'',voiceMode:'off',voiceName:'marin',graphVersion
};
let config;
const stored=db.prepare("SELECT value FROM kv WHERE key='config'").get();
try{config=stored?{...defaultConfig,...decrypt(stored.value)}:defaultConfig;}
catch{throw new Error('NandoZap config cannot be decrypted. Verify NZ_MASTER_KEY.');}
function saveConfig(){
 db.prepare("INSERT INTO kv(key,value) VALUES('config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(encrypt(config));
}
if(!stored)saveConfig();
const audit=(kind,info='')=>db.prepare('INSERT INTO audit(kind,info,at) VALUES(?,?,?)').run(kind,String(info).slice(0,150),now());
const statusOf=()=>({metaReady:Boolean(config.metaAppSecret&&config.metaAccessToken&&config.metaPhoneId),autoMode:config.autoMode,voiceMode:config.voiceMode,voiceName:config.voiceName,
 durable, mcpReady:Boolean(db.prepare("SELECT value FROM kv WHERE key='mcp_hash'").get()),
 businessName:config.businessName});
function send(res,status,obj,headers={}){
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','strict-transport-security':'max-age=31536000; includeSubDomains',...headers});
 res.end(JSON.stringify(obj));
}
const ok=(res,obj)=>send(res,200,obj);
async function parseBody(req,limit=300000){
 const data=[];let total=0;
 for await(const c of req){total+=c.length;if(total>limit)throw Object.assign(new Error('Payload muito grande'),{status:413});data.push(c);}
 return Buffer.concat(data);
}
function jsonBody(raw){try{return JSON.parse(raw.toString('utf8')||'{}');}catch{throw Object.assign(new Error('JSON inválido'),{status:400});}}
function getCookie(req,name){
 const found=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
 return found?decodeURIComponent(found.slice(name.length+1)):'';
}
function signSession(expires){
 const part=Buffer.from(String(expires)).toString('base64url');
 return part+'.'+crypto.createHmac('sha256',sessionSecret).update(part).digest('base64url');
}
function authorized(req){
 const token=getCookie(req,'nz_session');const parts=token.split('.');
 if(parts.length!==2)return false;
 if(!constant(crypto.createHmac('sha256',sessionSecret).update(parts[0]).digest('base64url'),parts[1]))return false;
 const until=Number(Buffer.from(parts[0],'base64url').toString());
 return Number.isFinite(until)&&until>Date.now();
}
function validOrigin(req){
 const origin=req.headers.origin;
 if(!origin)return true;
 try{return new URL(origin).host===req.headers.host&&new URL(origin).protocol==='https:';}
 catch{return false;}
}
function safeWrite(req){return validOrigin(req)&&req.headers['x-nz-action']==='admin';}
function chats(){
 return db.prepare("SELECT c.*, (SELECT body FROM messages m WHERE m.contact_id=c.id ORDER BY m.id DESC LIMIT 1) AS preview, (SELECT direction FROM messages m WHERE m.contact_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_from FROM contacts c ORDER BY COALESCE(c.last_at,c.created_at) DESC LIMIT 100").all().map(c=>({...c,wa_id:c.wa_id.slice(0,4)+'••••'+c.wa_id.slice(-3)}));
}
function contactById(id){return db.prepare('SELECT * FROM contacts WHERE id=?').get(id);}
function upsertContact(waId,name,when,isInbound){
 const original=db.prepare('SELECT id FROM contacts WHERE wa_id=?').get(waId);
 if(original){
  db.prepare('UPDATE contacts SET name=CASE WHEN ? != ? THEN ? ELSE name END,last_at=?,last_inbound_at=CASE WHEN ? THEN ? ELSE last_inbound_at END WHERE id=?').run(name,'Contato',name,when,isInbound?1:0,when,original.id);
  return original.id;
 }
 return Number(db.prepare('INSERT INTO contacts(wa_id,name,last_at,last_inbound_at) VALUES(?,?,?,?)').run(waId,name,when,isInbound?when:null).lastInsertRowid);
}
function addMessage(contactId,providerId,direction,kind,body,when=now(),status=''){
 try{const result=db.prepare('INSERT INTO messages(contact_id,provider_id,direction,kind,body,created_at,delivery_status) VALUES(?,?,?,?,?,?,?)').run(contactId,providerId,direction,kind,String(body).slice(0,8000),when,status);return Number(result.lastInsertRowid);}
 catch(e){if(String(e).includes('UNIQUE'))return 0;throw e;}
}
async function sendWhatsApp(contactId,text){
 if(!durable)throw Object.assign(new Error('Envio desativado: a hospedagem atual não possui armazenamento durável.'),{status:503});
 if(!statusOf().metaReady)throw Object.assign(new Error('Conexão oficial da Meta ainda não está configurada.'),{status:409});
 const c=contactById(Number(contactId));
 if(!c)throw Object.assign(new Error('Contato não encontrado.'),{status:404});
 if(c.opt_out)throw Object.assign(new Error('Contato pediu para não receber mensagens.'),{status:403});
 const recent=c.last_inbound_at&&Date.now()-Date.parse(c.last_inbound_at)<86400000;
 if(!recent)throw Object.assign(new Error('A janela de 24 horas terminou. É necessário um modelo aprovado pela Meta.'),{status:409});
 if(typeof text!=='string'||text.trim().length<1||text.length>4096)throw Object.assign(new Error('Texto inválido.'),{status:400});
 const response=await fetch('https://graph.facebook.com/'+encodeURIComponent(config.graphVersion)+'/'+encodeURIComponent(config.metaPhoneId)+'/messages',{
  method:'POST',headers:{'authorization':'Bearer '+config.metaAccessToken,'content-type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',to:c.wa_id,type:'text',text:{body:text.trim()}}),
  signal:AbortSignal.timeout(12000)
 });
 const raw=await response.json().catch(()=>({}));
 if(!response.ok){audit('meta_send_failed','http '+response.status);throw Object.assign(new Error('Meta rejeitou o envio. Código HTTP '+response.status),{status:502});}
 const messageId=String(raw.messages?.[0]?.id||'');
 addMessage(c.id,messageId||null,'out','text',text.trim(),now(),'accepted');
 audit('outbound_sent','contact:'+c.id);
 return {accepted:true,messageId};
}

const voices=new Set(['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar']);
let previewLastAt=0;
const metaBase=()=> 'https://graph.facebook.com/'+encodeURIComponent(config.graphVersion)+'/';
function requireVoiceKey(){
 if(!config.openaiApiKey)throw Object.assign(new Error('Configure a chave de API da OpenAI para gerar ou transcrever áudio.'),{status:409});
}
function eligibleContact(id){
 if(!durable)throw Object.assign(new Error('Envio de áudio bloqueado até existir armazenamento permanente.'),{status:503});
 if(!statusOf().metaReady)throw Object.assign(new Error('Conecte primeiro a API oficial da Meta.'),{status:409});
 const c=contactById(Number(id));
 if(!c)throw Object.assign(new Error('Contato não encontrado.'),{status:404});
 if(c.opt_out)throw Object.assign(new Error('O contato optou por não receber mensagens.'),{status:403});
 if(!c.last_inbound_at||Date.now()-Date.parse(c.last_inbound_at)>=86400000)
   throw Object.assign(new Error('Janela de atendimento de 24 horas encerrada. É necessário um template aprovado.'),{status:409});
 return c;
}
async function boundedBytes(response,max=16*1024*1024){
 const len=Number(response.headers.get('content-length')||'0');
 if(len>max)throw new Error('Áudio ultrapassou limite de tamanho');
 const reader=response.body?.getReader();
 if(!reader)throw new Error('Resposta de áudio vazia');
 const chunks=[];let length=0;
 for(;;){
  const {value,done}=await reader.read();if(done)break;
  length+=value.byteLength;
  if(length>max){reader.cancel().catch(()=>{});throw new Error('Áudio ultrapassou limite de tamanho');}
  chunks.push(Buffer.from(value));
 }
 if(!length)throw new Error('Áudio vazio');
 return Buffer.concat(chunks,length);
}
async function synthesizeVoice(text,voiceOverride=null){
 requireVoiceKey();
 const message=String(text||'').trim();
 if(message.length<1||message.length>1100)throw Object.assign(new Error('A resposta de áudio precisa ter entre 1 e 1100 caracteres.'),{status:400});
 const sentence='Aviso: áudio gerado por inteligência artificial. '+message;
 const response=await fetch('https://api.openai.com/v1/audio/speech',{
  method:'POST',signal:AbortSignal.timeout(30000),
  headers:{'authorization':'Bearer '+config.openaiApiKey,'content-type':'application/json'},
  body:JSON.stringify({model:process.env.NZ_TTS_MODEL||'gpt-4o-mini-tts',
    voice:voices.has(voiceOverride)?voiceOverride:voices.has(config.voiceName)?config.voiceName:'marin',
    input:sentence,response_format:'mp3',speed:1,
    instructions:'Fale em português do Brasil, com dicção clara, ritmo natural e atendimento profissional. Nunca finja ser uma pessoa.'})
 });
 if(!response.ok){audit('voice_generation_failed','http '+response.status);throw Object.assign(new Error('Falha na geração de áudio pela API.'),{status:502});}
 return boundedBytes(response);
}
async function sendWhatsAppAudio(contactId,text){
 const c=eligibleContact(contactId);requireVoiceKey();
 const mp3=await synthesizeVoice(text);
 const form=new FormData();
 form.set('messaging_product','whatsapp');
 form.set('type','audio/mpeg');
 form.set('file',new Blob([mp3],{type:'audio/mpeg'}),'nandozap-resposta.mp3');
 const upload=await fetch(metaBase()+encodeURIComponent(config.metaPhoneId)+'/media',{
  method:'POST',signal:AbortSignal.timeout(25000),
  headers:{'authorization':'Bearer '+config.metaAccessToken},body:form
 });
 const data=await upload.json().catch(()=>({}));
 if(!upload.ok||!data.id){audit('voice_upload_failed','http '+upload.status);throw Object.assign(new Error('A Meta recusou o arquivo de áudio.'),{status:502});}
 const response=await fetch(metaBase()+encodeURIComponent(config.metaPhoneId)+'/messages',{
  method:'POST',signal:AbortSignal.timeout(15000),
  headers:{'authorization':'Bearer '+config.metaAccessToken,'content-type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',to:c.wa_id,type:'audio',audio:{id:String(data.id)}})
 });
 const payload=await response.json().catch(()=>({}));
 if(!response.ok){audit('voice_send_failed','http '+response.status);throw Object.assign(new Error('A Meta recusou o envio do áudio.'),{status:502});}
 const providerId=String(payload.messages?.[0]?.id||'');
 addMessage(c.id,providerId||null,'out','audio','🔊 Voz de IA: '+String(text).slice(0,1100),now(),'accepted');
 audit('voice_sent','contact:'+c.id);return {accepted:true,messageId:providerId,format:'audio/mpeg'};
}
function allowedMetaMediaHost(url){
 try{const u=new URL(url);
  return u.protocol==='https:'&&/^(?:[a-z0-9-]+\.)*(?:fbcdn\.net|fbsbx\.com)$/.test(u.hostname);
 }catch{return false;}
}
async function metaDownload(url){
 let current=url;
 for(let redirect=0;redirect<3;redirect++){
  if(!allowedMetaMediaHost(current))throw new Error('Endereço de mídia não autorizado');
  const response=await fetch(current,{
   headers:{'authorization':'Bearer '+config.metaAccessToken},
   redirect:'manual',signal:AbortSignal.timeout(16000)
  });
  if(response.status>=300&&response.status<400){
   const next=response.headers.get('location');
   if(!next)throw new Error('Redirecionamento sem endereço');
   current=new URL(next,current).toString();continue;
  }
  if(!response.ok)throw new Error('Não foi possível baixar o áudio autorizado');
  return boundedBytes(response);
 }
 throw new Error('Redirecionamento excessivo no áudio');
}
async function transcribeVoiceFromMeta(mediaId){
 requireVoiceKey();
 if(!/^\d{6,40}$/.test(String(mediaId)))throw new Error('ID de áudio inválido');
 const details=await fetch(metaBase()+encodeURIComponent(String(mediaId)),{
  headers:{'authorization':'Bearer '+config.metaAccessToken},signal:AbortSignal.timeout(12000)
 });
 if(!details.ok)throw new Error('A Meta não disponibilizou os detalhes do áudio');
 const info=await details.json();
 if(!info.url||!allowedMetaMediaHost(info.url))throw new Error('Origem de áudio inválida');
 const buffer=await metaDownload(info.url);
 const type=String(info.mime_type||'audio/ogg').toLowerCase();
 const ext=type.includes('mpeg')?'mp3':type.includes('mp4')?'m4a':type.includes('aac')?'aac':'ogg';
 const form=new FormData();
 form.set('model','gpt-4o-mini-transcribe');form.set('language','pt');
 form.set('file',new Blob([buffer],{type:type.split(';')[0]}),'mensagem.'+ext);
 const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{
  method:'POST',headers:{'authorization':'Bearer '+config.openaiApiKey},
  body:form,signal:AbortSignal.timeout(30000)
 });
 if(!response.ok)throw new Error('Serviço de transcrição indisponível');
 const payload=await response.json();
 return String(payload.text||'').trim().slice(0,3000);
}
async function processIncomingVoice(contactId,providerId,mediaId){
 try{
  const transcript=await transcribeVoiceFromMeta(mediaId);
  if(!transcript)return;
  db.prepare('UPDATE messages SET body=? WHERE provider_id=? AND direction=?').run('🎤 Transcrição: '+transcript,providerId,'in');
  audit('voice_transcribed','contact:'+contactId);
  const text=transcript.trim();
  if(/^(parar|sair|stop|cancelar)$/i.test(text)){
   db.prepare('UPDATE contacts SET opt_out=1 WHERE id=?').run(contactId);audit('opt_out','contact:'+contactId);
   return;
  }
  await maybeAutoReply(contactId,text,true);
 }catch(e){audit('voice_transcription_failed','contact:'+contactId);}
}

function staticReply(text){
 const t=String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/\b(preco|valor|quanto custa|orcamento)\b/.test(t))return 'Olá! 😊 Posso preparar uma proposta para você. Me conta qual produto ou serviço precisa e os detalhes principais?';
 if(/\b(horario|atendimento|aberto)\b/.test(t))return 'Olá! Recebemos sua mensagem. Qual é sua dúvida? Nossa equipe pode confirmar os horários de atendimento.';
 if(/\b(site|catalogo|loja|pagina)\b/.test(t))return 'Olá! 😊 Trabalhamos com soluções digitais e podemos entender o que você precisa. Você procura um site, catálogo ou outro serviço?';
 return 'Olá! 😊 Obrigado pelo contato. Pode me contar um pouco mais sobre o que você precisa?';
}
async function aiReply(text){
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',
  headers:{'authorization':'Bearer '+config.openaiApiKey,'content-type':'application/json'},
  body:JSON.stringify({model:'gpt-4.1-mini',store:false,max_output_tokens:180,
   input:[{role:'system',content:config.systemPrompt},{role:'user',content:String(text).slice(0,3000)}]}),
  signal:AbortSignal.timeout(16000)
 });
 if(!response.ok)throw new Error('AI request failed: '+response.status);
 const payload=await response.json();
 const result=payload.output_text||payload.output?.flatMap(o=>(o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text)).join(' ');
 if(!result)return null;
 return String(result).slice(0,900);
}
async function maybeAutoReply(contactId,text,fromAudio=false){
 const contact=contactById(contactId);
 if(!durable||config.autoMode==='off'||!statusOf().metaReady||!contact||contact.paused||contact.opt_out)return;
 if(contact.last_auto_at&&Date.now()-Date.parse(contact.last_auto_at)<60000)return;
 const dayStart=new Date();dayStart.setUTCHours(0,0,0,0);
 const today=db.prepare("SELECT COUNT(*) AS n FROM audit WHERE kind='auto_reply_sent' AND at>=?").get(dayStart.toISOString()).n;
 if(today>=50){audit('auto_reply_daily_cap');return;}
 const plain=String(text).toLowerCase().trim();
 if(/^(parar|sair|stop|cancelar)$/.test(plain)){
  db.prepare('UPDATE contacts SET opt_out=1 WHERE id=?').run(contactId);audit('opt_out','contact:'+contactId);return;
 }
 if(!String(text).trim())return;
 db.prepare('UPDATE contacts SET last_auto_at=? WHERE id=?').run(now(),contactId);
 try{
  const reply=config.autoMode==='ai'?(config.openaiApiKey?await aiReply(text):null):staticReply(text);
  if(reply){
   if(config.voiceMode==='always'||(config.voiceMode==='mirror'&&fromAudio))await sendWhatsAppAudio(contactId,reply);
   else await sendWhatsApp(contactId,reply);
   audit('auto_reply_sent','contact:'+contactId);
  }
 }catch{audit('auto_reply_failed','contact:'+contactId);}
}
async function metaWebhook(req,res,url){
 if(!durable)return send(res,503,{error:'Armazenamento permanente é obrigatório antes de ativar a integração oficial.'});
 if(req.method==='GET'){
  const mode=url.searchParams.get('hub.mode'),token=url.searchParams.get('hub.verify_token'),challenge=url.searchParams.get('hub.challenge');
  if(mode==='subscribe'&&token&&constant(token,config.metaVerifyToken)&&/^[0-9]{1,24}$/.test(challenge||'')){
   res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store'});res.end(challenge);return;
  }return send(res,403,{error:'Verificação recusada'});
 }
 if(req.method!=='POST')return send(res,405,{error:'Método inválido'});
 if(!durable)return send(res,503,{error:'Ative armazenamento persistente antes de receber dados reais.'});
 if(!config.metaAppSecret)return send(res,503,{error:'Meta App Secret não configurado'});
 const raw=await parseBody(req);
 const signature=req.headers['x-hub-signature-256']||'';
 const expected='sha256='+crypto.createHmac('sha256',config.metaAppSecret).update(raw).digest('hex');
 if(typeof signature!=='string'||!constant(signature,expected))return send(res,401,{error:'Assinatura inválida'});
 const data=jsonBody(raw);
 if(data.object!=='whatsapp_business_account')return ok(res,{received:0});
 let inserted=0;const tasks=[];
 for(const entry of (data.entry||[]).slice(0,10))for(const change of (entry.changes||[]).slice(0,10)){
  const value=change.value||{};
  const names=new Map((value.contacts||[]).map(c=>[c.wa_id,c.profile?.name||'Contato']));
  for(const item of (value.messages||[]).slice(0,50)){
   if(!item.id||!item.from||!/^[0-9]{8,18}$/.test(String(item.from)))continue;
   const when=item.timestamp&&/^\d{10}$/.test(String(item.timestamp))?new Date(Number(item.timestamp)*1000).toISOString():now();
   const name=String(names.get(item.from)||'Contato').slice(0,150);
   const text=item.type==='text'?String(item.text?.body||'').slice(0,8000):item.type==='audio'?'🎤 Áudio recebido (transcrição pendente)':'['+String(item.type||'Mídia')+']';
   const id=upsertContact(String(item.from),name,when,true);
   const created=addMessage(id,String(item.id),'in',String(item.type||'text'),text,when,'received');
   if(created){
    inserted++;
    if(item.type==='audio'&&item.audio?.id){tasks.push([id,String(item.id),String(item.audio.id),'audio']);}
    if(item.type==='text'){
     if(/^(parar|sair|stop|cancelar)$/i.test(text.trim())){
      db.prepare('UPDATE contacts SET opt_out=1 WHERE id=?').run(id);audit('opt_out','contact:'+id);
     }else tasks.push([id,text]);
    }
   }
  }
  for(const item of (value.statuses||[]).slice(0,50)){
   if(item.id)db.prepare('UPDATE messages SET delivery_status=? WHERE provider_id=?').run(String(item.status||'').slice(0,40),String(item.id));
  }
 }
 ok(res,{received:inserted});
 if(inserted)audit('meta_inbound','count:'+inserted);
 for(const task of tasks){
  if(task[3]==='audio')processIncomingVoice(task[0],task[1],task[2]).catch(()=>{});
  else maybeAutoReply(task[0],task[1]).catch(()=>{});
 }
}
const toolSpecs=[
 {name:'nandozap_status',description:'Consultar estado do NandoZap IA, sem enviar mensagens.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'listar_conversas',description:'Listar conversas reais do NandoZap IA, somente leitura.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'listar_mensagens',description:'Consultar mensagens de uma conversa pelo ID retornado por listar_conversas.',inputSchema:{type:'object',properties:{contact_id:{type:'integer'}},required:['contact_id'],additionalProperties:false}}
];
function mcpReply(id,result){return {jsonrpc:'2.0',id,result};}
async function mcp(req,res){
 if(req.method!=='POST')return send(res,405,{error:'Use POST JSON-RPC'});
 const key=(req.headers.authorization||'').replace(/^Bearer /,'');
 const saved=db.prepare("SELECT value FROM kv WHERE key='mcp_hash'").get();
 if(!saved||!key||!constant(crypto.createHash('sha256').update(key).digest('hex'),saved.value))return send(res,401,{error:'Credencial MCP inválida'});
 const data=jsonBody(await parseBody(req,32000));
 const id=data.id??null;
 if(data.method==='notifications/initialized'){res.writeHead(202);return res.end();}
 if(data.method==='initialize')return ok(res,mcpReply(id,{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'NandoZap IA',version:'0.3.0'}}));
 if(data.method==='ping')return ok(res,mcpReply(id,{}));
 if(data.method==='tools/list')return ok(res,mcpReply(id,{tools:toolSpecs}));
 if(data.method!=='tools/call')return send(res,200,{jsonrpc:'2.0',id,error:{code:-32601,message:'Método desconhecido'}});
 const name=data.params?.name,args=data.params?.arguments||{};
 let result;
 if(name==='nandozap_status')result={...statusOf(),contacts:db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n};
 else if(name==='listar_conversas')result=chats().slice(0,50);
 else if(name==='listar_mensagens'){
  if(!Number.isSafeInteger(args.contact_id))return send(res,200,{jsonrpc:'2.0',id,error:{code:-32602,message:'contact_id inválido'}});
  result=db.prepare('SELECT id,contact_id,direction,kind,body,created_at FROM messages WHERE contact_id=? ORDER BY id DESC LIMIT 100').all(args.contact_id);
 }else return send(res,200,{jsonrpc:'2.0',id,error:{code:-32601,message:'Ferramenta desconhecida'}});
 return ok(res,mcpReply(id,{content:[{type:'text',text:JSON.stringify(result)}],isError:false}));
}
const attempts=new Map();
const html=fs.readFileSync(path.join(root,'public/index.html'));
const js=fs.readFileSync(path.join(root,'public/app.js'));
function serve(res,asset){
 const body=asset==='js'?js:html;
 res.writeHead(200,{'content-type':asset==='js'?'application/javascript; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-store',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-frame-options':'DENY','x-content-type-options':'nosniff'});
 res.end(body);
}
const httpServer=http.createServer(async(req,res)=>{
 const url=new URL(req.url||'/', 'https://local.invalid');
 const pathname=url.pathname;
 try{
  if(req.method==='GET'&&pathname==='/healthz')return ok(res,{ok:true,service:'nandozap-ia-independent'});
  if(req.method==='GET'&&pathname==='/')return serve(res,'html');
  if(req.method==='GET'&&pathname==='/app.js')return serve(res,'js');
  if(pathname==='/webhooks/meta')return await metaWebhook(req,res,url);
  if(pathname==='/mcp')return await mcp(req,res);
  if(pathname==='/api/login'&&req.method==='POST'){
   if(!validOrigin(req))return send(res,403,{error:'Origem inválida'});
   const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].slice(0,60);
   const data=jsonBody(await parseBody(req,1000)),prior=attempts.get(ip)||{n:0,t:Date.now()};
   if(Date.now()-prior.t>600000){prior.n=0;prior.t=Date.now();}
   if(prior.n>=8)return send(res,429,{error:'Muitas tentativas. Tente mais tarde.'});
   if(typeof data.password!=='string'||!constant(data.password,adminPassword)){
    prior.n++;attempts.set(ip,prior);return send(res,401,{error:'Senha inválida'});
   }
   attempts.delete(ip);
   const token=signSession(Date.now()+12*3600000);
   const secure=req.headers['x-forwarded-proto']==='https'||Boolean(req.socket.encrypted);
   return send(res,200,{ok:true},{'set-cookie':'nz_session='+encodeURIComponent(token)+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200'+(secure?'; Secure':'')});
  }
  if(!pathname.startsWith('/api/'))return send(res,404,{error:'Não encontrado'});
  if(!authorized(req))return send(res,401,{error:'Sessão expirada ou não autorizada'});
  if(req.method!=='GET'&&!safeWrite(req))return send(res,403,{error:'Ação não autorizada'});
  if(req.method==='POST'&&pathname==='/api/logout')return send(res,200,{ok:true},{'set-cookie':'nz_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});
  if(req.method==='GET'&&pathname==='/api/status'){
   const count=(table)=>db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
   return ok(res,{...statusOf(),contacts:count('contacts'),messages:count('messages'),inbound:db.prepare("SELECT COUNT(*) AS n FROM messages WHERE direction='in'").get().n,
    waiting:db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE last_inbound_at IS NOT NULL AND (SELECT direction FROM messages WHERE contact_id=contacts.id ORDER BY id DESC LIMIT 1)='in'").get().n,
    latestInbound:db.prepare("SELECT MAX(created_at) AS at FROM messages WHERE direction='in'").get().at});
  }
  if(req.method==='GET'&&pathname==='/api/settings')return ok(res,{
   businessName:config.businessName,systemPrompt:config.systemPrompt,autoMode:config.autoMode,voiceMode:config.voiceMode,voiceName:config.voiceName,metaVerifyToken:config.metaVerifyToken,
   graphVersion:config.graphVersion,metaAppSecretSet:Boolean(config.metaAppSecret),metaAccessTokenSet:Boolean(config.metaAccessToken),
   metaPhoneId:config.metaPhoneId,openaiApiKeySet:Boolean(config.openaiApiKey),durable,webhookUrl:'https://'+req.headers.host+'/webhooks/meta',
   mcpUrl:'https://'+req.headers.host+'/mcp'
  });
  if(req.method==='POST'&&pathname==='/api/settings'){
   const data=jsonBody(await parseBody(req,17000));
   for(const key of ['businessName','systemPrompt','metaPhoneId','graphVersion']){
    if(typeof data[key]==='string')config[key]=data[key].slice(0,key==='systemPrompt'?2000:160).trim();
   }
   for(const key of ['metaAppSecret','metaAccessToken','openaiApiKey']){
    if(typeof data[key]==='string'&&data[key].trim())config[key]=data[key].trim().slice(0,2000);
   }
   if(['off','mirror','always'].includes(data.voiceMode)){
    if(data.voiceMode!=='off'&&!durable)return send(res,409,{error:'Áudio automático requer armazenamento permanente.'});
    if(data.voiceMode!=='off'&&!config.openaiApiKey)return send(res,409,{error:'Cadastre a chave OpenAI API para ativar áudio.'});
    config.voiceMode=data.voiceMode;
   }
   if(typeof data.voiceName==='string'&&voices.has(data.voiceName))config.voiceName=data.voiceName;
   if(['off','rules','ai'].includes(data.autoMode)){
    if(data.autoMode!=='off'&&!durable)return send(res,409,{error:'Não é seguro ativar automações sem armazenamento persistente.'});
    if(data.autoMode!=='off'&&!statusOf().metaReady)return send(res,409,{error:'Conecte a Meta antes de ativar respostas automáticas.'});
    if(data.autoMode==='ai'&&!config.openaiApiKey)return send(res,409,{error:'A chave de API da IA é obrigatória.'});
    config.autoMode=data.autoMode;
   }
   saveConfig();audit('settings_updated');return ok(res,{saved:true,...statusOf()});
  }
  if(req.method==='GET'&&pathname==='/api/chats')return ok(res,{chats:chats()});
  if(req.method==='GET'&&pathname==='/api/messages'){
   const id=Number(url.searchParams.get('contact_id'));
   if(!Number.isSafeInteger(id)||id<=0)return send(res,400,{error:'Contato inválido'});
   return ok(res,{messages:db.prepare('SELECT id,contact_id,direction,kind,body,created_at,delivery_status FROM messages WHERE contact_id=? ORDER BY id DESC LIMIT 100').all(id).reverse()});
  }
  if(req.method==='POST'&&pathname==='/api/send'){
   const data=jsonBody(await parseBody(req,6500));
   return ok(res,await sendWhatsApp(Number(data.contactId),data.text));
  }
  if(req.method==='POST'&&pathname==='/api/send-audio'){
   const data=jsonBody(await parseBody(req,2800));
   return ok(res,await sendWhatsAppAudio(Number(data.contactId),data.text));
  }
  if(req.method==='POST'&&pathname==='/api/preview-voice'){
   const data=jsonBody(await parseBody(req,600));
   if(Date.now()-previewLastAt<15000)return send(res,429,{error:'Aguarde 15 segundos antes de ouvir outra prévia.'});
   previewLastAt=Date.now();
   const bytes=await synthesizeVoice(String(data.text||'Olá! Sou a assistente virtual do NandoZap IA. Como posso ajudar?').slice(0,180),data.voiceName);
   res.writeHead(200,{'content-type':'audio/mpeg','cache-control':'no-store','x-content-type-options':'nosniff','content-length':String(bytes.length)});
   res.end(bytes);return;
  }
  if(req.method==='POST'&&pathname==='/api/contact-details'){
   const data=jsonBody(await parseBody(req,1400)),c=contactById(Number(data.contactId));
   if(!c)return send(res,404,{error:'Contato não encontrado'});
   const nextName=typeof data.name==='string'?data.name.trim().slice(0,150):c.name;
   if(!nextName)return send(res,400,{error:'Nome obrigatório'});
   const note=typeof data.note==='string'?data.note.trim().slice(0,600):null;
   db.exec('CREATE TABLE IF NOT EXISTS contact_notes(contact_id INTEGER PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,note TEXT NOT NULL DEFAULT "")');
   db.prepare('UPDATE contacts SET name=? WHERE id=?').run(nextName,c.id);
   if(note!==null)db.prepare('INSERT INTO contact_notes(contact_id,note) VALUES(?,?) ON CONFLICT(contact_id) DO UPDATE SET note=excluded.note').run(c.id,note);
   audit('contact_updated','id:'+c.id);return ok(res,{ok:true});
  }
  if(req.method==='GET'&&pathname==='/api/contact-details'){
   const id=Number(url.searchParams.get('contact_id'));if(!contactById(id))return send(res,404,{error:'Contato não encontrado'});
   db.exec('CREATE TABLE IF NOT EXISTS contact_notes(contact_id INTEGER PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,note TEXT NOT NULL DEFAULT "")');
   return ok(res,{contact:contactById(id),note:db.prepare('SELECT note FROM contact_notes WHERE contact_id=?').get(id)?.note||''});
  }
  if(req.method==='POST'&&pathname==='/api/pause'){
   const data=jsonBody(await parseBody(req,300));
   const c=contactById(Number(data.contactId));if(!c)return send(res,404,{error:'Contato não encontrado'});
   db.prepare('UPDATE contacts SET paused=? WHERE id=?').run(data.paused?1:0,c.id);
   audit('pause_changed','contact:'+c.id);return ok(res,{ok:true});
  }
  if(req.method==='POST'&&pathname==='/api/create-mcp-key'){
   const key='nandozap_'+crypto.randomBytes(32).toString('base64url');
   db.prepare("INSERT INTO kv(key,value) VALUES('mcp_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(crypto.createHash('sha256').update(key).digest('hex'));
   audit('mcp_rotated');return ok(res,{key,shownOnce:true});
  }
  if(req.method==='GET'&&pathname==='/api/export'){
   return ok(res,{exportedAt:now(),contacts:db.prepare('SELECT * FROM contacts').all(),messages:db.prepare('SELECT * FROM messages').all(),
    contactNotes:db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_notes'").get()?db.prepare('SELECT * FROM contact_notes').all():[],
    audit:db.prepare('SELECT * FROM audit').all(),settings:{businessName:config.businessName,autoMode:config.autoMode}});
  }
  if(req.method==='POST'&&pathname==='/api/delete-contact'){
   const data=jsonBody(await parseBody(req,300)),id=Number(data.contactId);
   if(!contactById(id))return send(res,404,{error:'Contato não encontrado'});
   db.prepare('DELETE FROM contacts WHERE id=?').run(id);audit('contact_deleted','id:'+id);return ok(res,{deleted:true});
  }
  if(req.method==='POST'&&pathname==='/api/demo'){
   const testId=upsertContact('00000000000','Cliente de exemplo',now(),true);
   addMessage(testId,'demo-'+crypto.randomUUID(),'in','text','Olá! Gostaria de informações sobre seus serviços.',now(),'demo');
   audit('demo_created');return ok(res,{ok:true});
  }
  return send(res,404,{error:'Rota desconhecida'});
 }catch(e){
  const status=Number.isInteger(e?.status)?e.status:500;
  if(status>=500)console.error('NandoZap request error',String(e?.name||'error'));
  send(res,status,{error:status<500?String(e.message):'Erro no servidor. Confira os registros.'});
 }
});
httpServer.listen(port,'0.0.0.0',()=>console.log('NandoZap IA independent ready on port '+port));
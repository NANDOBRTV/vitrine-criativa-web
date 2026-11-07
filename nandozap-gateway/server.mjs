import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import makeWASocket, {useMultiFileAuthState, DisconnectReason, Browsers} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';

const baseDir=path.dirname(fileURLToPath(import.meta.url));
const authDir=path.join(baseDir,'.session');
const port=Number(process.env.PORT||3000);
const setupSecret=process.env.NANDOZAP_SETUP_SECRET||'';
if(setupSecret.length<40)throw new Error('NANDOZAP_SETUP_SECRET must be set to a strong secret');
const publicDir=path.join(baseDir,'public');
const logger=pino({level:'silent'});
let sock=null,starting=null,phase='idle',qrImage='',pairCode='',lastError='',registered=false,lastConnectedAt=null;
let lastAttemptAt=0;
let lastCloseCode=null;
let pairIssuedAt=null;
function safeEvent(kind,details={}){console.log('[nandozap-pair]',JSON.stringify({kind,...details}));}
function hash(s){return crypto.createHash('sha256').update(s).digest();}
function compare(a,b){const x=hash(a),y=hash(b);return crypto.timingSafeEqual(x,y);}
function cookieValue(request){const raw=request.headers.cookie||'';const found=raw.split(';').map(x=>x.trim()).find(x=>x.startsWith('nz_admin='));return found?decodeURIComponent(found.slice(9)):'';}
function authorized(request){return compare(cookieValue(request),setupSecret);}
function safeOrigin(request){
 const origin=request.headers.origin;
 if(!origin)return true;
 try{const host=new URL(origin).host;return host===request.headers.host && new URL(origin).protocol==='https:';}catch{return false;}
}
function bodyJson(request,maxBytes=4096){
 return new Promise((resolve,reject)=>{let body='',size=0;request.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){reject(new Error('Body too large'));request.destroy();return;}body+=chunk.toString('utf8');});request.on('end',()=>{try{resolve(body?JSON.parse(body):{});}catch{reject(new Error('JSON inválido'));}});request.on('error',reject);});
}
const common={
 'cache-control':'no-store',
 'x-content-type-options':'nosniff',
 'x-frame-options':'DENY',
 'referrer-policy':'no-referrer',
 'permissions-policy':'camera=(),microphone=(),geolocation=()',
 'strict-transport-security':'max-age=31536000; includeSubDomains'
};
function json(response,status,value,extraHeaders={}){response.writeHead(status,{...common,'content-type':'application/json; charset=utf-8',...extraHeaders});response.end(JSON.stringify(value));}
function text(response,status,value,contentType='text/plain; charset=utf-8'){response.writeHead(status,{...common,'content-type':contentType,'content-security-policy':"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"});response.end(value);}
const pause=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(){
 if(starting)return starting;
 if(sock&&(phase==='connected'||phase==='waiting'||phase==='connecting'))return;
 starting=(async()=>{
  phase='connecting';qrImage='';pairCode='';lastError='';
  await fs.mkdir(authDir,{recursive:true,mode:0o700});
  const {state,saveCreds}=await useMultiFileAuthState(authDir);
  registered=Boolean(state.creds.registered);
  const current=makeWASocket({
   auth:state,
   browser:Browsers.macOS('Desktop'),
   printQRInTerminal:false,
   logger,
   markOnlineOnConnect:false,
   syncFullHistory:false,
   connectTimeoutMs:60000,
   keepAliveIntervalMs:20000
  });
  sock=current;
  let credentialsSaved=Promise.resolve();
  current.ev.on('creds.update',()=>{
   credentialsSaved=credentialsSaved.then(()=>saveCreds()).catch(()=>{
    lastError='Não foi possível salvar as credenciais do pareamento.';
    safeEvent('save-credentials-failed');
   });
  });
  current.ev.on('connection.update',async(update)=>{
   if(sock!==current)return;
   if(update.connection==='connecting')safeEvent('socket-connecting');
   if(update.qr){
    try{qrImage=await QRCode.toDataURL(update.qr,{width:270,margin:2,errorCorrectionLevel:'M'});phase='waiting';safeEvent('qr-ready');}catch{lastError='Falha ao gerar QR';}
   }
   if(update.connection==='open'){
    phase='connected';registered=true;lastCloseCode=null;lastConnectedAt=new Date().toISOString();lastError='';pairCode='';qrImage='';safeEvent('socket-connected');
   }
   if(update.connection==='close'){
    const code=Number(update.lastDisconnect?.error?.output?.statusCode||0);
    lastCloseCode=code||null;
    safeEvent('socket-closed',{code:lastCloseCode,hadPairCode:Boolean(pairIssuedAt)});
    qrImage='';pairCode='';
    await credentialsSaved;
    if(code===DisconnectReason.loggedOut){
      phase='logged-out';registered=false;
      lastError='O WhatsApp recusou ou encerrou o vínculo. Confira o número; em caso de repetição, use um cliente oficial.';
      await fs.rm(authDir,{recursive:true,force:true}).catch(()=>{});
      sock=null;
    }else{
      phase='reconnecting';
      lastError=code===DisconnectReason.restartRequired
       ? 'O WhatsApp solicitou reinício da sessão. Reconectando com as credenciais salvas.'
       : code===408
         ? 'O tempo de conexão expirou. Tente um novo código uma vez ou use QR em outro aparelho.'
         : 'A conexão foi interrompida; tentando reconectar.';
      sock=null;
      setTimeout(()=>{connect().catch(e=>safeEvent('reconnect-failed',{cause:String(e?.name||'unknown')}));},2500);
    }
   }
  });
 })();
 try{await starting;}catch(e){phase='error';lastError=String(e?.message||'Erro ao iniciar conexão').slice(0,200);sock=null;throw e;}
 finally{starting=null;}
}
async function status(){return {phase,connected:phase==='connected',qr:phase==='waiting'?qrImage:null,pairCode:pairCode||null,registered,lastConnectedAt,lastCloseCode,pairIssuedAt,error:lastError,warning:'Teste não oficial. O WhatsApp pode recusar o vínculo com bibliotecas não oficiais. Render Free pode dormir e perder a sessão.'};}
const recentAttempts=new Map();
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url||'/',"http://localhost").pathname;
 try{
  if(req.method==='GET'&&pathname==='/healthz')return json(res,200,{ok:true,kind:'nandozap-pair-test'});
  if(req.method==='GET'&&(pathname==='/'||pathname==='/app.js')){
    const name=pathname==='/app.js'?'app.js':'index.html';
    const file=await fs.readFile(path.join(publicDir,name),'utf8');
    return text(res,200,file,name.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8');
  }
  if(req.method==='POST'&&pathname==='/api/login'){
   if(!safeOrigin(req))return json(res,403,{error:'Origem não permitida'});
   const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].slice(0,90);
   const attempts=recentAttempts.get(ip)||{count:0,time:Date.now()};
   if(Date.now()-attempts.time>600000){attempts.count=0;attempts.time=Date.now();}
   if(attempts.count>8)return json(res,429,{error:'Muitas tentativas. Tente mais tarde.'});
   const value=await bodyJson(req);
   if(typeof value.token!=='string'||!compare(value.token,setupSecret)){
    attempts.count++;recentAttempts.set(ip,attempts);return json(res,401,{error:'Link de acesso inválido.'});
   }
   recentAttempts.delete(ip);
   return json(res,200,{ok:true},{'set-cookie':'nz_admin='+encodeURIComponent(setupSecret)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200'});
  }
  if(pathname.startsWith('/api/')){
   if(!authorized(req))return json(res,401,{error:'Abra o link de acesso privado para conectar sua conta.'});
   if(!safeOrigin(req))return json(res,403,{error:'Origem não permitida'});
   if(req.method==='GET'&&pathname==='/api/status')return json(res,200,await status());
   if(req.method==='POST'&&pathname==='/api/start'){
    await bodyJson(req);
    await connect();
    return json(res,200,await status());
   }
   if(req.method==='POST'&&pathname==='/api/pair-code'){
    const data=await bodyJson(req);
    const number=String(data.phone||'').replace(/\D/g,'');
    if(!/^\d{10,15}$/.test(number))return json(res,400,{error:'Informe o número com DDI e DDD. Ex.: 5582999999999.'});
    if(Date.now()-lastAttemptAt<30000)return json(res,429,{error:'Aguarde antes de solicitar outro código.'});
    await connect();
    if(phase==='connected')return json(res,409,{error:'Esta conta já está conectada.'});
    if(!sock || !(phase==='waiting'||phase==='connecting'))return json(res,409,{error:'Conexão ainda não está pronta. Aguarde o QR aparecer e tente novamente.'});
    lastAttemptAt=Date.now();
    try{
     const raw=await sock.requestPairingCode(number);
     pairCode=String(raw||'').replace(/[^0-9A-Za-z]/g,'').toUpperCase();
     pairIssuedAt=new Date().toISOString();
     safeEvent('pair-code-issued',{length:pairCode.length});
     return json(res,200,{code:pairCode.match(/.{1,4}/g)?.join('-')||pairCode});
    }catch(e){
     lastError='Não foi possível obter um código. Confira o número completo e tente novamente.';
     safeEvent('pair-code-failed',{cause:String(e?.name||'unknown')});
     return json(res,503,{error:lastError});
    }
   }
   return json(res,404,{error:'Rota não encontrada'});
  }
  return json(res,404,{error:'Não encontrado'});
 }catch(e){return json(res,500,{error:'Falha temporária no servidor. Tente atualizar a página.'});}
});
server.listen(port,'0.0.0.0',()=>console.log('NandoZap pairing test listening on '+port));
process.on('SIGTERM',()=>{server.close();setTimeout(()=>process.exit(0),3000);});

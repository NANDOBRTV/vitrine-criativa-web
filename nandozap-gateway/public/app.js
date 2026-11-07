const byId=id=>document.getElementById(id);
let authorized=false,intervalId=null,lastCode='',activeTab='code';
const statusLine=byId('state'),detail=byId('detail');
const show=(id,yes)=>byId(id).classList.toggle('hidden',!yes);
async function api(path,options={}){
 const res=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
 let data={};
 try{data=await res.json();}catch{}
 if(!res.ok)throw new Error(data.error||'Falha na conexão');
 return data;
}
function alertError(message){detail.textContent=message;detail.style.color='#e8bb83';}
async function check(){
 try{
  const data=await api('/api/status');
  statusLine.textContent=({
   idle:'Aguardando início',connecting:'Iniciando...',waiting:'Aguardando pareamento',
   connected:'Conectado',reconnecting:'Reconectando...',error:'Erro temporário','logged-out':'Desconectado'
  })[data.phase]||data.phase;
  statusLine.classList.toggle('ok',data.connected);
  if(data.error)alertError(data.error);
  else detail.textContent=data.connected?'Conexão com WhatsApp Web estabelecida. O vendedor IA ainda não está integrado.':'O código é gerado pelo servidor quando o WhatsApp Web estiver pronto.';
  show('pairing',!data.connected&&data.phase!=='idle'&&data.phase!=='error');
  byId('start').textContent=data.connected?'WhatsApp conectado':data.phase==='idle'||data.phase==='error'||data.phase==='logged-out'?'Iniciar conexão':'Conexão em andamento';
  if(data.qr){byId('qrImage').src=data.qr;show('qrImage',true);show('qrWait',false);}
  else {show('qrImage',false);show('qrWait',true);}
  if(data.pairCode&&!lastCode){lastCode=data.pairCode;byId('code').textContent=data.pairCode.match(/.{1,4}/g)?.join('-')||data.pairCode;show('codeBox',true);}
  if(data.connected){lastCode='';show('codeBox',false);}
 }catch(e){statusLine.textContent='Falha ao consultar';alertError(e.message);}
}
async function boot(){
 const url=new URL(location.href);
 const token=decodeURIComponent(location.hash.replace(/^#access=/,''));
 if(token){
  history.replaceState({},'',url.pathname+url.search);
  try{await api('/api/login',{method:'POST',body:JSON.stringify({token})});}catch(e){alertError(e.message);}
 }
 try{await api('/api/status');authorized=true;}catch{authorized=false;}
 show('denied',!authorized);show('page',authorized);
 if(authorized){await check();intervalId=setInterval(check,3500);}
}
byId('start').addEventListener('click',async()=>{
 byId('start').disabled=true;
 try{await api('/api/start',{method:'POST',body:'{}'});await check();}catch(e){alertError(e.message);}
 finally{byId('start').disabled=false;}
});
byId('tabCode').addEventListener('click',()=>{
 activeTab='code';show('codePanel',true);show('qrPanel',false);
 byId('tabCode').classList.add('active');byId('tabQr').classList.remove('active');
});
byId('tabQr').addEventListener('click',()=>{
 activeTab='qr';show('codePanel',false);show('qrPanel',true);
 byId('tabCode').classList.remove('active');byId('tabQr').classList.add('active');
});
byId('generate').addEventListener('click',async()=>{
 const phone=byId('phone').value.replace(/\D/g,'');
 if(!/^\d{10,15}$/.test(phone)){alertError('Informe o número completo com DDI 55 e DDD.');return;}
 byId('generate').disabled=true;
 try{
  const {code}=await api('/api/pair-code',{method:'POST',body:JSON.stringify({phone})});
  lastCode=code.replace(/-/g,'');byId('code').textContent=code;
  show('codeBox',true);detail.textContent='Código real recebido. Digite-o no WhatsApp Business em Aparelhos conectados.';
 }catch(e){alertError(e.message);}
 finally{byId('generate').disabled=false;}
});
byId('copy').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(lastCode);byId('copy').textContent='Copiado';}
 catch{byId('copy').textContent='Selecione e copie o código';}
});
boot();

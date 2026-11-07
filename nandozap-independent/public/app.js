const $=id=>document.getElementById(id);
let authenticated=false,summary=null,settings=null,currentContact=null,allChats=[];
function visible(id,yes){
 const node=$(id);
 if(!node)return;
 // #workspace is hidden by its stylesheet default; removing inline display
 // does not override that rule. Use an explicit display for visible screens.
 node.style.display= yes ? (id==='loginPage'?'grid':'block') : 'none';
}
function toast(message,warning=false){
 const el=$('toast');el.textContent=message;el.style.display='block';
 el.style.borderColor=warning?'#ab7550':'#65e6a1';
 clearTimeout(window.nzToastTimer);
 window.nzToastTimer=setTimeout(()=>el.style.display='none',5500);
}
async function api(path,method='GET',body){
 const request={method,cache:'no-store',credentials:'same-origin',headers:{}};
 if(method!=='GET'){
  request.headers['content-type']='application/json';
  request.headers['x-nz-action']='admin';
  request.body=JSON.stringify(body||{});
 }
 let result;
 try{result=await fetch(path,request);}
 catch{throw Error('Não foi possível acessar o servidor. Confira sua conexão.');}
 let data={};try{data=await result.json();}catch{}
 if(!result.ok){
  if(result.status===401&&path!=='/api/login')showLogin();
  throw Error(data.error||'Falha HTTP '+result.status);
 }
 return data;
}
function showLogin(){
 authenticated=false;visible('loginPage',true);visible('workspace',false);
}
function showDashboard(){
 authenticated=true;visible('loginPage',false);visible('workspace',true);
}
async function doLogin(password){
 if(!password)return $('loginError').textContent='Informe a senha de administrador.';
 $('login').disabled=true;
 try{
  await api('/api/login','POST',{password});
  $('password').value='';$('loginError').textContent='';
  showDashboard();
 }catch(e){
  $('loginError').textContent=e.message;
  $('login').disabled=false;
  return;
 }
 try{await loadAll();}
 catch(e){toast('O painel abriu, mas não foi possível carregar todos os dados: '+e.message,true);}
 finally{$('login').disabled=false;}
}
async function startup(){
 const fragment=location.hash;
 if(fragment.startsWith('#access=')){
  const password=decodeURIComponent(fragment.slice(8));
  history.replaceState(null,'',location.pathname+location.search);
  await doLogin(password);
  return;
 }
 try{await api('/api/status');showDashboard();}
 catch{showLogin();return;}
 try{await loadAll();}
 catch(e){toast('Alguns dados ainda não carregaram: '+e.message,true);}
}
async function loadAll(){
 await Promise.all([refreshStats(),loadSettings(),loadChats()]);
}
function page(name){
 for(const section of document.querySelectorAll('.section'))section.classList.toggle('visible',section.id===name);
 for(const nav of document.querySelectorAll('.nav'))nav.classList.toggle('active',nav.dataset.page===name);
 if(name==='inbox')loadChats().catch(e=>toast(e.message,true));
 if(name==='connection'||name==='assistant'||name==='security')loadSettings().catch(e=>toast(e.message,true));
}
function readable(value){return value?'Ativo':'Pendente';}
function canSendAudioToWhatsApp(){
 return Boolean(summary?.durable&&summary?.metaReady&&summary?.voiceReady&&currentContact
  &&!String(currentContact.wa_id||'').startsWith('0000'));
}
function updateAudioButton(){
 const button=$('sendAudio'),hint=$('audioHint');
 if(!button||!hint)return;
 if(canSendAudioToWhatsApp()){
  button.textContent='🎙 Enviar áudio';
  button.title='Gerar e enviar áudio real pelo WhatsApp Business';
  hint.textContent='Envio de voz pela Meta. O contato precisa ter iniciado a conversa há menos de 24 horas e a IA precisa estar configurada.';
 }else{
  button.textContent='🔊 Ouvir áudio';
  button.title='Ouvir o texto usando a voz do seu celular, sem enviar mensagens';
  hint.textContent='Prévia local: o celular lê o texto, mas não envia WhatsApp. Para enviar áudio real, configure Meta, banco permanente e chave OpenAI API.';
 }
}
function previewLocalAudio(text){
 const words=String(text||'').trim();
 if(!words)return toast('Escreva uma mensagem para ouvir no celular.',true);
 if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window)){
  return toast('A leitura de voz não está disponível neste navegador. Experimente abrir no Chrome do Android.',true);
 }
 try{
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(words.slice(0,1100));
  utterance.lang='pt-BR';
  utterance.rate=0.95;
  utterance.pitch=1;
  const installed=window.speechSynthesis.getVoices();
  const pt=installed.find(v=>v.lang.toLowerCase()==='pt-br')||installed.find(v=>v.lang.toLowerCase().startsWith('pt'));
  if(pt)utterance.voice=pt;
  utterance.onstart=()=>toast('Reproduzindo prévia no celular. Nenhuma mensagem foi enviada.');
  utterance.onerror=()=>toast('A voz do celular não conseguiu reproduzir o texto. Confira a voz de leitura nas configurações do Android.',true);
  window.nzCurrentSpeech=utterance;
  window.speechSynthesis.speak(utterance);
 }catch{
  toast('Falha ao iniciar a prévia de voz neste navegador.',true);
 }
}
async function refreshStats(){
 summary=await api('/api/status');
 $('statContacts').textContent=summary.contacts;
 $('statMessages').textContent=summary.messages;
 $('statWaiting').textContent=summary.waiting;
 $('statAuto').textContent=summary.autoMode==='off'?'Desligada':summary.autoMode==='rules'?'Regras':'IA';
 $('webhookState').textContent=readable(summary.metaReady);
 $('storageState').textContent=summary.durable?'Durável':'Temporário';
 $('mcpState').textContent=readable(summary.mcpReady);
 $('replyState').textContent=summary.autoMode==='off'?'Desligadas':'Modo '+summary.autoMode;
 $('metaBanner').textContent=summary.metaReady?'Credenciais da Meta cadastradas; ainda é necessário validar um webhook real.':'Aguardando credenciais oficiais da Meta para este NandoZap.';
 $('prodNotice').textContent=summary.durable?'Banco com persistência habilitada. Valide a Meta antes de iniciar envios.':'Armazenamento temporário: envios reais e automações estão bloqueados até existir um banco persistente.';
 $('storageDetails').textContent=summary.durable?'Armazenamento durável habilitado.':'Armazenamento provisório. Seus dados de teste podem desaparecer após reinício da nuvem.';
 updateAudioButton();
}
async function loadSettings(){
 settings=await api('/api/settings');
 $('autoMode').value=settings.autoMode;
 $('voiceMode').value=settings.voiceMode||'off';
 $('voiceName').value=settings.voiceName||'marin';
 $('businessName').value=settings.businessName||'';
 $('systemPrompt').value=settings.systemPrompt||'';
 $('aiKeyStatus').textContent=readable(settings.openaiApiKeySet);
 $('appSecretStatus').textContent=readable(settings.metaAppSecretSet);
 $('accessTokenStatus').textContent=readable(settings.metaAccessTokenSet);
 $('metaPhone').value=settings.metaPhoneId||'';
 $('webhookUrl').textContent=settings.webhookUrl;
 $('verifyToken').textContent=settings.metaVerifyToken;
 $('mcpUrl').textContent=settings.mcpUrl;
}
function makeChatRow(c){
 const row=document.createElement('button');row.className='contact'+(currentContact?.id===c.id?' selected':'');
 const icon=document.createElement('div');icon.className='avatar';icon.textContent=(c.name||'C').slice(0,1).toUpperCase();
 const body=document.createElement('div');body.className='contactBody';
 const strong=document.createElement('strong');strong.textContent=c.name+(c.paused?' • pausado':'');
 const small=document.createElement('small');small.textContent=c.preview||'Sem mensagens';
 body.append(strong,small);row.append(icon,body);
 row.onclick=()=>selectChat(c);
 return row;
}
function renderChatList(){
 const list=$('contactList');list.replaceChildren();
 const query=$('chatSearch').value.trim().toLocaleLowerCase('pt-BR');
 const results=allChats.filter(c=>(c.name||'').toLocaleLowerCase('pt-BR').includes(query));
 if(!results.length){const empty=document.createElement('div');empty.className='card';empty.textContent='Nenhuma conversa encontrada.';list.append(empty);}
 else for(const c of results)list.append(makeChatRow(c));
}
async function loadChats(){
 const response=await api('/api/chats');
 allChats=response.chats||[];
 renderChatList();
 if(currentContact){const updated=allChats.find(c=>c.id===currentContact.id);if(updated)await selectChat(updated);else currentContact=null;}
}
async function selectChat(c){
 currentContact=c;
 updateAudioButton();
 for(const node of $('contactList').children)node.classList.toggle('selected',node.textContent.includes(c.name));
 $('chatTitle').textContent=c.name+' • '+c.wa_id+(c.paused?' • Atendimento pausado':'');
 $('pauseContact').textContent=c.paused?'Reativar IA':'Pausar IA';
 const response=await api('/api/messages?contact_id='+encodeURIComponent(c.id));
 const list=$('messages');list.replaceChildren();
 const messages=response.messages||[];
 if(!messages.length){const empty=document.createElement('p');empty.textContent='Conversa vazia.';list.append(empty);}
 for(const m of messages){
  const bubble=document.createElement('div');bubble.className='bubble '+(m.direction==='out'?'out':'in');
  const content=document.createElement('span');content.textContent=m.body;
  const timestamp=document.createElement('em');timestamp.textContent=new Date(m.created_at).toLocaleString('pt-BR');
  bubble.append(content,timestamp);list.append(bubble);
 }
 list.scrollTop=list.scrollHeight;
}
async function saveSettings(data){
 try{await api('/api/settings','POST',data);toast('Configurações salvas.');await loadSettings();await refreshStats();}
 catch(e){toast(e.message,true);}
}
async function sendReply(){
 if(!currentContact)return toast('Selecione um contato.',true);
 const value=$('replyInput').value.trim();if(!value)return;
 $('sendReply').disabled=true;
 try{
  await api('/api/send','POST',{contactId:currentContact.id,text:value});
  $('replyInput').value='';toast('Mensagem aceita pela Meta; entrega será atualizada por webhook.');await selectChat(currentContact);
 }catch(e){toast(e.message,true)}
 finally{$('sendReply').disabled=false;}
}
async function sendAudio(){
 if(!currentContact)return toast('Selecione um contato.',true);
 const value=$('replyInput').value.trim();
 if(!value)return toast('Digite primeiro a mensagem que deseja ouvir.',true);
 if(value.length>1100)return toast('O áudio aceita até 1100 caracteres.',true);
 if(!canSendAudioToWhatsApp()){
  previewLocalAudio(value);
  return;
 }
 $('sendAudio').disabled=true;
 try{
  await api('/api/send-audio','POST',{contactId:currentContact.id,text:value});
  $('replyInput').value='';
  toast('Áudio aceito pela Meta; a entrega depende do WhatsApp.');
  await selectChat(currentContact);
 }catch(e){toast(e.message,true);}
 finally{$('sendAudio').disabled=false;}
}
async function previewVoice(){
 const sample='Olá! Sou a assistente virtual do NandoZap IA. Posso ajudar com suas dúvidas e pedidos.';
 if(!settings?.openaiApiKeySet){
  previewLocalAudio(sample);
  return;
 }
 const node=$('previewVoice');node.disabled=true;
 try{
  const res=await fetch('/api/preview-voice',{
   method:'POST',cache:'no-store',credentials:'same-origin',
   headers:{'content-type':'application/json','x-nz-action':'admin'},
   body:JSON.stringify({text:sample,voiceName:$('voiceName').value})
  });
  if(!res.ok){const data=await res.json().catch(()=>({}));throw Error(data.error||'Não foi possível gerar a voz.');}
  const data=await res.blob();
  if(window.nzPreviewUrl)URL.revokeObjectURL(window.nzPreviewUrl);
  window.nzPreviewUrl=URL.createObjectURL(data);
  const player=$('audioPlayer');player.src=window.nzPreviewUrl;player.style.display='block';await player.play().catch(()=>{});
  toast('Prévia de áudio gerada. Nenhuma mensagem de WhatsApp foi enviada.');
 }catch(e){toast(e.message,true);}
 finally{node.disabled=false;}
}
async function changePause(){
 if(!currentContact)return toast('Selecione um contato.',true);
 try{
  await api('/api/pause','POST',{contactId:currentContact.id,paused:!currentContact.paused});
  toast(currentContact.paused?'Atendimento reativado.':'IA pausada para este contato.');
  await loadChats();
 }catch(e){toast(e.message,true);}
}
async function editCurrentContact(){
 if(!currentContact)return toast('Selecione um contato.',true);
 try{
  const details=await api('/api/contact-details?contact_id='+encodeURIComponent(currentContact.id));
  const name=prompt('Nome do contato:',details.contact.name);
  if(name===null)return;
  const note=prompt('Observações sobre o contato (até 600 caracteres):',details.note||'');
  if(note===null)return;
  await api('/api/contact-details','POST',{contactId:currentContact.id,name,note});
  toast('Contato atualizado.');await loadChats();
 }catch(e){toast(e.message,true);}
}
async function deleteCurrentContact(){
 if(!currentContact)return toast('Selecione um contato.',true);
 if(!confirm('Apagar permanentemente este contato e todas as mensagens? Esta ação não pode ser desfeita.'))return;
 try{
  await api('/api/delete-contact','POST',{contactId:currentContact.id});
  toast('Contato e histórico excluídos.');currentContact=null;$('chatTitle').textContent='Selecione uma conversa';
  $('messages').replaceChildren();await loadChats();await refreshStats();
 }catch(e){toast(e.message,true);}
}
async function createDemo(){
 try{await api('/api/demo','POST',{});toast('Conversa demonstrativa criada, sem enviar WhatsApp.');await loadChats();await refreshStats();page('inbox');}
 catch(e){toast(e.message,true)}
}
async function copyText(value){
 try{await navigator.clipboard.writeText(value);toast('Copiado para a área de transferência.');}
 catch{toast('Selecione e copie o texto manualmente.',true);}
}
async function exportData(){
 try{
  const data=await api('/api/export');
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download='nandozap-backup-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);toast('Backup exportado para o seu celular.');
 }catch(e){toast(e.message,true)}
}
for(const el of document.querySelectorAll('.nav'))el.addEventListener('click',()=>page(el.dataset.page));
for(const el of document.querySelectorAll('[data-jump]'))el.addEventListener('click',()=>page(el.dataset.jump));
$('login').addEventListener('click',()=>doLogin($('password').value));
$('password').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin(e.target.value);});
$('logout').addEventListener('click',async()=>{await api('/api/logout','POST',{}).catch(()=>{});showLogin();});
$('refreshChats').addEventListener('click',()=>loadChats().catch(e=>toast(e.message,true)));
$('chatSearch').addEventListener('input',renderChatList);
$('pauseContact').addEventListener('click',changePause);
$('editContact').addEventListener('click',editCurrentContact);
$('deleteContact').addEventListener('click',deleteCurrentContact);
$('sendReply').addEventListener('click',sendReply);
$('sendAudio').addEventListener('click',sendAudio);
$('previewVoice').addEventListener('click',previewVoice);
$('replyInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendReply();}});
$('testDemo').addEventListener('click',createDemo);
$('saveAssistant').addEventListener('click',()=>saveSettings({businessName:$('businessName').value,systemPrompt:$('systemPrompt').value,autoMode:$('autoMode').value,voiceMode:$('voiceMode').value,voiceName:$('voiceName').value}));
$('saveAi').addEventListener('click',()=>saveSettings({openaiApiKey:$('openaiKey').value,businessName:$('businessName').value,systemPrompt:$('systemPrompt').value,autoMode:$('autoMode').value,voiceMode:$('voiceMode').value,voiceName:$('voiceName').value}));
$('saveMeta').addEventListener('click',()=>saveSettings({metaPhoneId:$('metaPhone').value,metaAppSecret:$('metaAppSecret').value,metaAccessToken:$('metaToken').value}));
$('copyWebhook').addEventListener('click',()=>copyText($('webhookUrl').textContent+'\n'+$('verifyToken').textContent));
$('generateKey').addEventListener('click',async()=>{
 if(summary?.mcpReady&&!confirm('A chave antiga será invalidada. Deseja gerar outra?'))return;
 try{
  const data=await api('/api/create-mcp-key','POST',{});
  $('keyDisplay').textContent=data.key;
  $('keyContainer').style.display='block';
  toast('Chave MCP gerada; copie agora e mantenha privada.');
  await refreshStats();
 }catch(e){toast(e.message,true);}
});
$('copyKey').addEventListener('click',()=>copyText($('keyDisplay').textContent));
$('export').addEventListener('click',exportData);
startup();
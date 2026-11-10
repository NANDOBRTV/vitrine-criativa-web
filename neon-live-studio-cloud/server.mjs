import http from 'node:http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PORT=Number(process.env.PORT||3000),HOST=process.env.HOST||'0.0.0.0',KEY=process.env.NEON_ADMIN_KEY||'';
const DIR=path.dirname(fileURLToPath(import.meta.url));
const colors=['#5cf3ea','#ff78af','#fbd583','#a69dff','#92ffb5','#ffa783','#65b8ff','#e5a3fa'];
const games=['turbo','arena','marble','towers','quiz'];
const questions=[{q:'Qual planeta é conhecido como planeta vermelho?',a:['Marte','Vênus','Júpiter'],correct:0},{q:'Quanto é 7 × 8?',a:['54','56','64'],correct:1},{q:'Qual oceano é o maior?',a:['Atlântico','Pacífico','Índico'],correct:1},{q:'Qual linguagem funciona no navegador?',a:['JavaScript','C++','Python'],correct:0}];
const now=()=>Date.now(),clean=(v,n=26)=>String(v??'').replace(/[<>&\x00-\x1f]/g,'').trim().slice(0,n);
let st={game:'turbo',phase:'inscricao',round:1,likes:0,gifts:0,players:[],towerHp:[100,100],feed:[],started:now(),questionIndex:0,winners:[]};
const clients=new Set(),sessions=new Map(),rates=new Map();
function log(msg){st.feed.unshift(clean(msg,130));st.feed=st.feed.slice(0,12);}
function rank(){return [...st.players].sort((a,b)=>st.game==='arena'?b.health-a.health:st.game==='quiz'?b.score-a.score:b.progress-a.progress);}
function state(){return {game:st.game,phase:st.phase,round:st.round,likes:st.likes,gifts:st.gifts,players:st.players.map(p=>({...p,progress:+p.progress.toFixed(2),health:+p.health.toFixed(1)})),towerHp:st.towerHp,feed:st.feed,winners:st.winners,questionIndex:st.questionIndex,quiz:st.game==='quiz'?questions[st.questionIndex]:null,elapsed:st.phase==='corrida'?(now()-st.started)/1000:0};}
function emit(){let msg='data: '+JSON.stringify(state())+'\n\n';for(const c of clients){try{c.write(msg);}catch{clients.delete(c);}}}
function next(){st.round++;st.phase='inscricao';st.started=now();st.players=[];st.towerHp=[100,100];st.questionIndex=0;st.winners=[];log('Inscrições abertas, rodada '+st.round);emit();}
function select(g){if(!games.includes(g))return false;st.game=g;st.round=0;next();return true;}
function join(raw){if(st.phase!=='inscricao')return {ok:false,error:'Inscrições encerradas'};let name=clean(raw,24);if(!name)return {ok:false,error:'Informe seu nome'};if(st.players.find(p=>p.name.toLowerCase()===name.toLowerCase()))return {ok:false,error:'Nome já inscrito'};if(st.players.length>=20)return {ok:false,error:'Limite de participantes'};let i=st.players.length;st.players.push({name,progress:0,speed:3+Math.random()*2.9,boost:0,health:100,lane:i%4,score:0,color:colors[i%8],team:i%2});log(name+' entrou na partida');emit();return {ok:true};}
function demo(){let n=0;for(const v of ['Nando','Fenix','Lua','Ninja','Volt','Rafa','Bia','KDX'])if(join('Demo_'+v).ok)n++;return n;}
function start(){if(st.phase!=='inscricao'||st.players.length===0)return false;st.phase='corrida';st.started=now();log('Partida iniciada!');emit();return true;}
function like(){st.likes+=15;let p=st.players[0];if(p){p.boost+=24;p.score+=3;}log('15 curtidas: '+(p?.name||'nenhum piloto')+' recebeu impulso');emit();}
function gift(a){st.gifts++;const p=st.players[0],amount=a==='galaxy'?45:10;if(p){p.score+=amount;if(st.game==='arena'&&a==='galaxy'){let target=st.players.find(x=>x!==p&&x.health>0);if(target)target.health=Math.max(0,target.health-amount);}else if(st.game==='towers'){st.towerHp[1]=Math.max(0,st.towerHp[1]-amount*.7);st.towerHp[0]=Math.min(100,st.towerHp[0]+amount*.2);}else{p.boost+=amount;p.health=Math.min(100,p.health+amount*.5);}}log('Presente '+a+' aplicado');emit();}
function answer(raw,c){if(st.game!=='quiz'||st.phase!=='corrida')return {ok:false,error:'Quiz indisponível'};let p=st.players.find(x=>x.name.toLowerCase()===clean(raw,24).toLowerCase());if(!p)return {ok:false,error:'Você ainda não está inscrito'};const i=Number(c);if(!Number.isInteger(i)||i<0||i>2)return {ok:false,error:'Resposta inválida'};let key='answered'+st.questionIndex;if(p[key])return {ok:false,error:'Você já respondeu'};p[key]=true;let correct=i===questions[st.questionIndex].correct;if(correct)p.score+=20;log(p.name+(correct?' acertou!':' errou a pergunta'));emit();return {ok:true,correct};}
function finish(){if(st.phase!=='corrida')return;st.phase='podio';st.started=now();st.winners=rank().slice(0,3).map(p=>p.name);log('Campeão: '+(st.winners[0]||'Sem participantes'));emit();}
let last=now();setInterval(()=>{let t=now(),dt=Math.min(1,(t-last)/1000);last=t;if(st.phase==='corrida'){let elapsed=(t-st.started)/1000;for(const p of st.players){if(st.game==='arena'){p.health=Math.max(0,p.health-dt*(.7+Math.random()*1.8));p.progress=Math.min(100,p.progress+dt*1.7);}else if(st.game==='quiz'){p.progress=Math.min(100,p.progress+dt*2);}else{p.progress=Math.min(100,p.progress+dt*(1.5+p.speed*.28+Math.min(20,p.boost)*.11));p.boost=Math.max(0,p.boost-dt*3);}}if(st.game==='quiz'){const j=Math.min(questions.length-1,Math.floor(elapsed/12));if(j!==st.questionIndex){st.questionIndex=j;log('Pergunta '+(j+1));}}if(st.game==='towers')st.towerHp[1]=Math.max(0,st.towerHp[1]-dt*.1);if(elapsed>=52||st.players.some(p=>p.progress>=100)||st.game==='arena'&&st.players.filter(p=>p.health>0).length<=1||st.game==='towers'&&st.towerHp[1]<=0)finish();}else if(st.phase==='podio'&&t-st.started>16000)next();emit();},500).unref();
function json(res,n,obj,extra={}){res.writeHead(n,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra});res.end(JSON.stringify(obj));}
function rate(req,tag,max=10){let ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'?').split(',')[0],k=tag+ip,v=rates.get(k)||{n:0,t:now()};if(now()-v.t>60000)v={n:0,t:now()};v.n++;rates.set(k,v);return v.n>max;}
function session(req){const c=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('neon_host='))?.slice(10);return c&&sessions.get(c)>now();}
function check(a,b){if(!a||!b)return false;let x=crypto.createHash('sha256').update(String(a)).digest(),y=crypto.createHash('sha256').update(String(b)).digest();return crypto.timingSafeEqual(x,y);}
function origin(req){const o=req.headers.origin;return !o||o==='https://'+req.headers.host||o==='http://'+req.headers.host;}
async function readBody(req){let a=[],sz=0;for await(const c of req){sz+=c.length;if(sz>8192)throw Error('large');a.push(c);}return JSON.parse(Buffer.concat(a).toString('utf8')||'{}');}
const html=await readFile(path.join(DIR,'index.html'));
http.createServer(async(req,res)=>{
 let u;try{u=new URL(req.url,'https://'+(req.headers.host||'localhost'));}catch{return json(res,400,{error:'URL inválida'});}
 const p=u.pathname;
 if(req.method==='GET'&&p==='/health')return json(res,200,{ok:true,version:'realtime',game:st.game,phase:st.phase,players:st.players.length});
 if(req.method==='GET'&&p==='/api/state')return json(res,200,{...state(),isHost:!!session(req)});
 if(req.method==='GET'&&p==='/api/events'){if(clients.size>=150)return json(res,503,{error:'Muitas conexões'});res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','connection':'keep-alive','x-accel-buffering':'no'});clients.add(res);res.write('data: '+JSON.stringify(state())+'\n\n');req.on('close',()=>clients.delete(res));return;}
 if(req.method==='POST'&&p.startsWith('/api/')){
  if(!origin(req)||req.headers['x-neon-request']!=='1'||!req.headers['content-type']?.includes('application/json'))return json(res,403,{error:'Requisição não autorizada'});
  let b;try{b=await readBody(req);}catch{return json(res,400,{error:'JSON inválido'});}
  if(p==='/api/host/login'){if(rate(req,'login',10))return json(res,429,{error:'Muitas tentativas'});if(!check(b.key,KEY))return json(res,401,{error:'Código incorreto'});let sid=crypto.randomBytes(32).toString('hex');sessions.set(sid,now()+86400000);return json(res,200,{ok:true},{'set-cookie':'neon_host='+sid+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400'});}
  if(p==='/api/join'){if(rate(req,'join',18))return json(res,429,{error:'Muitas tentativas'});let r=join(b.name);return json(res,r.ok?200:409,r);}
  if(p==='/api/answer'){if(rate(req,'answer',35))return json(res,429,{error:'Muitas respostas'});let r=answer(b.name,b.choice);return json(res,r.ok?200:409,r);}
  if(!session(req))return json(res,401,{error:'Somente o criador pode controlar o jogo'});
  if(p==='/api/host/logout'){sessions.delete((req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('neon_host='))?.slice(10));return json(res,200,{ok:true},{'set-cookie':'neon_host=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  if(p==='/api/host/action'){const a=clean(b.action,20);let ok=true;if(a==='demo')demo();else if(a==='start')ok=start();else if(a==='next')next();else if(a==='select')ok=select(clean(b.game,20));else if(a==='like')like();else if(a==='rose'||a==='galaxy')gift(a);else ok=false;return json(res,ok?200:409,{ok,game:st.game,phase:st.phase});}
  return json(res,404,{error:'Rota não encontrada'});
 }
 if(req.method==='GET'&&(p==='/'||p==='/index.html')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:; base-uri 'self'; object-src 'none'"});res.end(html);return;}
 return json(res,404,{error:'Não encontrado'});
}).listen(PORT,HOST,()=>console.log('Neon Live Studio Online porta '+PORT));
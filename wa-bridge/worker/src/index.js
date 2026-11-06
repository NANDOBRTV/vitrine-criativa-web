import { Hono } from 'hono';
import { Agent, mountWebhook } from '@emerleite/wa-agent';

const WEBSITE = 'https://nandobrtv.github.io/vitrine-criativa-web/';
const INTRO = [
  'Olá! 👋 Sou o atendimento automático da Vitrine Criativa Web.',
  'Criamos sites para empresas, páginas de vendas e artes para divulgação.',
  'Digite *serviços*, *orçamento*, *site*, *humano* ou *parar*.',
  'Não solicitamos senhas nem códigos de verificação.'
].join('\n');

let app;
let agent;

function withoutAccents(value) {
  return String(value || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function init(env) {
  if (app) return;
  app = new Hono();

  app.get('/health', c => c.json({ status: 'ok', project: 'vitrine-wa-atendimento' }));

  agent = new Agent({
    whatsapp: {
      endpoint: env.META_WA_ENDPOINT,
      token: env.META_WA_TOKEN,
      verifyToken: env.META_WH_TOKEN,
      appSecret: env.META_APP_SECRET,
    },
    db: env.DB,
    queue: { debounceSeconds: 3, maxAttempts: 3 },
  });

  agent.command(['oi', 'ajuda', 'menu', 'inicio'], async ({ reply }) => {
    await reply.text(INTRO);
  });

  agent.command(['servicos', 'serviços'], async ({ reply }) => {
    await reply.text('Trabalhamos com criação de sites institucionais, páginas de vendas e artes para redes sociais. Conte qual é o seu negócio e o que você precisa.\nPortfólio: ' + WEBSITE);
  });

  agent.command(['site', 'portfolio', 'portfólio'], async ({ reply }) => {
    await reply.text('Conheça nosso trabalho: ' + WEBSITE);
  });

  agent.command(['orcamento', 'orçamento', 'precos', 'preços'], async ({ reply }) => {
    await reply.text('Para preparar um orçamento, conte: 1) nome do negócio; 2) site ou arte que precisa; 3) objetivo. O valor depende do serviço.\nVeja nosso portfólio: ' + WEBSITE);
  });

  agent.command(['humano', 'atendente'], async ({ reply }) => {
    await reply.text('Seu pedido de atendimento humano deve ser acompanhado pela equipe da Vitrine Criativa Web. Escreva o assunto e o melhor horário; não informe dados sensíveis por aqui.');
  });

  agent.command(['parar', 'sair', 'stop'], async ({ user, leads, reply }) => {
    await leads.optOut(user.whatsapp);
    await reply.text('Entendido. Você saiu da lista de comunicações proativas. Para voltar a solicitar atendimento, escreva *oi*.');
  });

  agent.onText(async ({ text, reply }) => {
    const t = withoutAccents(text);
    if (/\b(preco|valor|quanto|orcamento|custa)\b/.test(t)) {
      return reply.text('O preço depende do tipo de projeto. Escreva *orçamento* para informar o que precisa.\n' + WEBSITE);
    }
    if (/\b(site|pagina|loja|catalogo|portfolio)\b/.test(t)) {
      return reply.text('Podemos conversar sobre um site ou catálogo para seu negócio. Veja exemplos: ' + WEBSITE + '\nEscreva *orçamento* para detalhar o projeto.');
    }
    await reply.text(INTRO);
  });

  // Rotas /wa/webhook (GET validação da Meta e POST assinado).
  mountWebhook(agent, app);
}

export default {
  fetch(request, env, ctx) {
    init(env);
    return app.fetch(request, env, ctx);
  },
  scheduled(event, env, ctx) {
    init(env);
    return agent.scheduled(event, env, ctx);
  },
};

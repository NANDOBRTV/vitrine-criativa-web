import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readConfig(env = process.env) {
  const required = ['META_WA_TOKEN', 'META_WA_ENDPOINT', 'WA_TEST_RECIPIENT'];
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error('Credenciais de teste não configuradas no GitHub: ' + missing.join(', '));
  if (env.WA_TEST_ENABLED !== 'true') throw new Error('Teste desativado: configure WA_TEST_ENABLED=true nas Variables do repositório.');
  const endpoint = new URL(env.META_WA_ENDPOINT);
  if (endpoint.origin !== 'https://graph.facebook.com') throw new Error('Endpoint Meta inválido.');
  const match = endpoint.pathname.match(/^\/(v\d+\.\d+)\/(\d+)\/?$/);
  if (!match) throw new Error('META_WA_ENDPOINT deve terminar em /vNN.N/PHONE_NUMBER_ID.');
  const [, version, phoneId] = match;
  const recipient = env.WA_TEST_RECIPIENT.replace(/\D/g, '');
  if (!/^\d{5,30}$/.test(phoneId)) throw new Error('Phone number ID inválido.');
  if (!/^\d{10,15}$/.test(recipient)) throw new Error('Número de teste inválido.');
  return { token: env.META_WA_TOKEN, phoneId, recipient, version };
}

export async function sendHelloWorld(config, http = fetch) {
  // Um único modelo de demonstração da Meta; nenhum número nem texto aparece no GitHub Issues.
  const url = `https://graph.facebook.com/${config.version}/${config.phoneId}/messages`;
  let response;
  try {
    response = await http(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: config.recipient,
        type: 'template',
        template: { name: 'hello_world', language: { code: 'en_US' } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('Falha de conexão com a API da Meta.');
  }
  let body = {};
  try { body = await response.json(); } catch { /* no JSON */ }
  if (!response.ok) {
    const metaCode = Number.isInteger(body?.error?.code) ? body.error.code : 'não informado';
    throw new Error(`API da Meta rejeitou o envio (HTTP ${response.status}, código ${metaCode}).`);
  }
  if (!Array.isArray(body.messages) || !body.messages[0]?.id) {
    throw new Error('Resposta inesperada da API: não retornou identificador da mensagem.');
  }
  return { accepted: true };
}

async function main() {
  try {
    const result = await sendHelloWorld(readConfig());
    console.log(result.accepted ? 'API da Meta aceitou a mensagem de teste.' : 'Teste não concluído.');
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

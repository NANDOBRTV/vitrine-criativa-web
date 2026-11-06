import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig, sendHelloWorld } from './send-test.mjs';

const env = {
  META_WA_TOKEN: 'TOKEN_FICTICIO',
  META_WA_ENDPOINT: 'https://graph.facebook.com/v26.0/1234567890',
  WA_TEST_RECIPIENT: '55 82 99999-1234',
  WA_TEST_ENABLED: 'true',
};

test('leitura de configuração sem vazar número nem segredo', () => {
  const config = readConfig(env);
  assert.equal(config.recipient, '5582999991234');
  assert.equal(config.phoneId, '1234567890');
  assert.equal(config.version, 'v26.0');
});

test('o teste é bloqueado por padrão', () => {
  assert.throws(() => readConfig({ ...env, WA_TEST_ENABLED: 'false' }), /desativado/);
});

test('rejeita endpoint que não seja Graph API', () => {
  assert.throws(() => readConfig({ ...env, META_WA_ENDPOINT: 'https://exemplo.invalid/v26.0/1234567890' }), /inválido/);
});

test('envia somente template hello_world uma única vez', async () => {
  const config = readConfig(env);
  let requests = 0;
  const http = async (url, options) => {
    requests++;
    assert.equal(url, 'https://graph.facebook.com/v26.0/1234567890/messages');
    assert.equal(options.method, 'POST');
    const data = JSON.parse(options.body);
    assert.equal(data.to, '5582999991234');
    assert.equal(data.type, 'template');
    assert.equal(data.template.name, 'hello_world');
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.test' }] }) };
  };
  assert.deepEqual(await sendHelloWorld(config, http), { accepted: true });
  assert.equal(requests, 1);
});

test('falha segura da Meta não divulga token nem telefone', async () => {
  const config = readConfig(env);
  await assert.rejects(
    () => sendHelloWorld(config, async () => ({ ok: false, status: 403, json: async () => ({ error: { code: 190 } }) })),
    error => error.message.includes('HTTP 403') &&
      !error.message.includes(config.token) &&
      !error.message.includes(config.recipient),
  );
});

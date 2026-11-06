import { readFileSync, writeFileSync } from 'node:fs';

const id = (process.env.CF_D1_DATABASE_ID || '').trim();
if (!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(id)) {
  throw new Error('Configure CF_D1_DATABASE_ID com o identificador UUID do banco D1.');
}

const file = new URL('../wrangler.toml', import.meta.url);
const original = readFileSync(file, 'utf8');
if (!original.includes('REPLACE_WITH_CF_D1_DATABASE_ID')) {
  throw new Error('Placeholder D1 não encontrado; não sobrescrever configuração inesperada.');
}
writeFileSync(file, original.replace('REPLACE_WITH_CF_D1_DATABASE_ID', id));
console.log('Configuração D1 aplicada ao build (sem mostrar credenciais).');

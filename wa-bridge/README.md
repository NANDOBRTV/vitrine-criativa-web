# Vitrine Criativa Web — ponte gratuita de WhatsApp

Implementação de teste: **ChatGPT → GitHub Issues/Actions → API oficial da Meta** para UM envio de demonstração, e **Meta webhook → Cloudflare Worker + wa-agent** para atendimento reativo a mensagens recebidas.

Não é conexão MCP nativa do ChatGPT Plus. Os comandos são acionados mediante a criação de uma issue específica no GitHub por uma conta autorizada. Sem credenciais Meta e Cloudflare nada é enviado.

## Proteção e limites

- Este repositório é **público**. NÃO escreva números, nomes, mensagens de clientes, tokens ou comprovantes em Issues, comentários ou arquivos.
- As Issues usam apenas títulos fixos: `[WA_TEST]` e `[WA_DEPLOY]`. Só as Issues criadas por `NANDOBRTV` são elegíveis aos workflows.
- `WA_TEST_ENABLED` e `WA_DEPLOY_ENABLED` precisam estar explicitamente definidos como `true` em **Variables**.
- O envio de teste usa apenas o template **hello_world**, nunca texto arbitrário ou disparos em massa.
- Use somente o número de teste disponibilizado pela Meta com um destinatário autorizado. Não use o número comercial principal na primeira etapa.
- Respostas do Worker acontecem após o cliente escrever primeiro; para iniciar outras conversas, cumpra as regras de consentimento e templates aprovados da Meta.
- O atendimento começa com regras em português e **não usa API de IA paga**. IA generativa só deve ser ligada depois de testar e definir privacidade, orçamento e supervisão.

## Etapa 1 — Meta for Developers (celular)

1. Abra https://developers.facebook.com/apps/ e crie ou abra um aplicativo com o caso de uso **WhatsApp / Connect with customers**.
2. Em **WhatsApp > API Setup / Test API**, obtenha:
   - **Temporary Access Token** (expira; suficiente só para o teste);
   - **Phone number ID** do número de teste;
   - Adicione seu telefone como destinatário permitido de teste.
3. No aplicativo Meta, em **App Settings > Basic**, copie o **App Secret**.
4. Escolha uma frase aleatória longa como token de verificação de webhook. Ele deve ser idêntico nas configurações GitHub e Meta.

**Não publique essas credenciais no chat ou nas Issues.**

## Etapa 2 — Cloudflare Free e D1 (celular)

1. Crie/acesse sua conta em https://dash.cloudflare.com/ no plano gratuito.
2. Abra **Workers & Pages / D1 SQL Database** e crie um banco com nome `vitrine-wa-db`. Copie o **database ID** (UUID).
3. Copie o **Account ID** na área do perfil da conta Cloudflare.
4. Crie um token de API com acesso ao **Workers Scripts (Edit)** e **D1 (Edit)** apenas na conta necessária. Não use a Global API Key.

O Cloudflare Worker usa D1 para histórico, deduplicação, fila e leads. No plano Free há limites de uso; não há garantia de serviço ilimitado.

## Etapa 3 — Secrets do GitHub

Abra https://github.com/NANDOBRTV/vitrine-criativa-web/settings/secrets/actions em um navegador logado (se necessário, habilite **site para computador** no Chrome do Android).

Crie estes **Repository Secrets**, um por vez:

| Secret | Valor a ser preenchido |
|---|---|
| `META_WA_ENDPOINT` | `https://graph.facebook.com/v26.0/SEU_PHONE_NUMBER_ID` (use a versão atual exibida pela Meta) |
| `META_WA_TOKEN` | token de acesso WhatsApp da Meta |
| `META_WH_TOKEN` | token aleatório escolhido para validar webhook |
| `META_APP_SECRET` | App Secret do aplicativo Meta |
| `WA_TEST_RECIPIENT` | seu número autorizado no teste, com DDI+DDD, apenas dígitos |
| `CLOUDFLARE_API_TOKEN` | token API Cloudflare com permissões mínimas |
| `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare |
| `CF_D1_DATABASE_ID` | ID UUID do banco D1 |

Depois abra **Settings > Secrets and variables > Actions > Variables**:

| Variable | Valor |
|---|---|
| `WA_TEST_ENABLED` | `true` para permitir o teste de mensagem |
| `WA_DEPLOY_ENABLED` | `true` para permitir implantação do Worker |

Os workflows foram criados em uma **branch de integração**. Para ativá-los no GitHub, precisam estar na branch padrão `main` (ou ser incorporados a ela via pull request). Não modifique o código do site existente.

## Etapa 4 — Testar envio a si mesmo pelo ChatGPT

Quando todos os secrets da Meta e `WA_TEST_ENABLED=true` estiverem salvos e os workflows já estiverem na `main`, peça nesta conversa:

> Crie uma issue no repositório NANDOBRTV/vitrine-criativa-web com o título exato [WA_TEST] para testar o envio oficial da Meta ao meu número autorizado. Depois verifique o GitHub Actions.

O fluxo em `.github/workflows/wa-send-test.yml` aceitará apenas esse título e apenas a conta proprietária. O script `wa-bridge/commands/send-test.mjs` enviará o template de demonstração da Meta uma única vez.

O GitHub Actions adicionará à issue um comentário sem número ou conteúdo de cliente, indicando se a API Meta aceitou a requisição. **Aceito pela API não garante entregue**: confirme no WhatsApp.

## Etapa 5 — Publicar atendente com Cloudflare Worker

Com os segredos Cloudflare e Meta completos e `WA_DEPLOY_ENABLED=true`, peça para criar outra issue com título exato **[WA_DEPLOY]**. O GitHub Actions instalará as dependências, aplicará as migrações D1, publicará o Worker e enviará os quatro segredos Meta diretamente ao Cloudflare.

O Cloudflare publicará uma URL `https://vitrine-wa-atendimento.<subdominio>.workers.dev`. A URL efetiva fica nos logs de deploy (não contém segredos).

No painel Meta, configure:

- **Webhook callback URL:** `https://SEU_WORKER.workers.dev/wa/webhook`
- **Verify token:** o mesmo valor do secret `META_WH_TOKEN`
- Assine o evento **messages**.

Para verificar o servidor sem credenciais, abra `https://SEU_WORKER.workers.dev/health`. Uma resposta JSON de status `ok` confirma que o HTTP do Worker respondeu, mas não comprova pareamento nem envio.

Ao receber uma mensagem, o `wa-agent` verifica a assinatura do webhook, persiste o evento no D1 e responde com menu de serviços. O comando `parar` registra saída de comunicações proativas.

## Testes de software

```sh
node --test wa-bridge/commands/send-test.test.mjs
node --check wa-bridge/worker/src/index.js
```

Os testes utilizam um cliente HTTP fictício e **nunca** enviam mensagens reais.

## Limitações antes de produção

- Não existe acesso de leitura às mensagens de clientes diretamente nesta conversa. Esse caminho exige um armazenamento e consulta protegidos, preferencialmente um repositório **privado**, nunca Issues públicas.
- A ponte neste repositório público foi deliberadamente limitada a um envio de teste pré-aprovado.
- A API oficial Meta pode cobrar conversas/templates fora das franquias. Hosting gratuito possui cotas.
- O token de teste Meta é temporário. Atendimento contínuo requer a configuração de credenciais de produção aprovadas.
- Antes de escalar, defina consentimento, retenção dos dados, fluxo de atendimento humano e política de opt-out.

Código base: https://github.com/emerleite/wa-agent — MIT. Projeto de integração independente para Vitrine Criativa Web.

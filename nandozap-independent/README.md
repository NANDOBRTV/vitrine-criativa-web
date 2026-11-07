# NandoZap IA — Independente

Versão **0.3**, aplicativo próprio para administrar o WhatsApp Business, sem iZap, WhatSync, Vendedor IA ou outros serviços de atendimento.

## Página publicada

- Painel: https://nandozap-ia-independent.onrender.com
- Health: https://nandozap-ia-independent.onrender.com/healthz
- Webhook oficial da Meta: https://nandozap-ia-independent.onrender.com/webhooks/meta
- MCP: https://nandozap-ia-independent.onrender.com/mcp
- Serviço Render próprio: `srv-dbnl9sp5efls73bln9jg`

Este código está em uma **ramificação isolada** e diretório `nandozap-independent` do GitHub. Não importa, consulta ou envia dados para os outros projetos.

## Recursos implementados

- Login administrativo privado, sessão assinada e limite de tentativas de login;
- Painel responsivo para Android;
- Caixa de entrada, pesquisa de contatos, pausa individual, notas e exclusão de dados;
- Webhook oficial Meta: verificação de challenge, assinatura HMAC SHA-256, idempotência, recebimento e status de mensagens;
- Envio de mensagens dentro da janela oficial de 24h e depois do vínculo com a Meta;
- Atendente comercial com modo regras e modo OpenAI Responses API (chave própria);
- Respeito a pedido de parar, limite de frequência e teto de 50 respostas automáticas diárias;
- MCP JSON-RPC com consulta de status, conversas e mensagens (somente leitura), token aleatório armazenado apenas como hash;
- Credenciais Meta e OpenAI criptografadas com AES-256-GCM;
- Exportação JSON e exclusão de contatos; registros de ações sem textos de clientes;
- Testes de sintaxe e script `test.mjs` cobrindo login, integração, MCP e bloqueio seguro de envios.

## Estado de produção — **não ativado**

O serviço está no plano **Render Free**. A Render pode suspender o serviço depois de 15 minutos sem acessos e **apagar o armazenamento SQLite local no reinício ou novo deploy**. Portanto, `NZ_DATA_DURABLE=false` bloqueia propositalmente o recebimento de webhooks, envios reais e respostas automáticas. Há uma base de teste temporária, não um banco de produção.

Para produção, escolha uma infraestrutura com armazenamento durável e sem suspensão:
- Serviço pago com disco persistente, definindo `NZ_DB_FILE` para o volume montado e `NZ_DATA_DURABLE=true`; ou
- Migrar as tabelas para um Postgres externo durável e adequar as consultas (o código atual usa SQLite local).

**A assinatura ChatGPT Plus não inclui créditos da API da OpenAI.** O modo regras funciona sem custo de IA, mas também depende de armazenamento durável e do vínculo Meta.

## Credenciais e privacidade

As variáveis são configuradas **somente no servidor**:
```
NZ_ADMIN_PASSWORD=<senha forte>
NZ_SESSION_SECRET=<segredo aleatório de 40+ caracteres>
NZ_MASTER_KEY=<segredo aleatório de 40+ caracteres>
NZ_META_VERIFY_TOKEN=<segredo fixo para a Meta>
NZ_DATA_DURABLE=false
NZ_GRAPH_VERSION=v26.0
NODE_VERSION=22.16.0
```

Os segredos da Meta e a chave da API da IA são cadastrados no painel protegido, nunca enviados para outros projetos.

## Vincular WhatsApp Business

A Meta deve emitir para **este próprio NandoZap**:
1. Meta App Secret;
2. Token de acesso com permissões oficiais apropriadas;
3. Phone Number ID;
4. Assinatura do webhook oficial apontando para `/webhooks/meta`.

A autorização do proprietário na Meta é inevitável. Não copie tokens de provedores anteriores e não desconecte seu número existente antes de validar a migração. QR Code do WhatsApp Web (Baileys) não é um substituto oficial.

## MCP e ChatGPT

Este servidor implementa MCP com bearer token rotacionável, mas **a criação da conexão no ChatGPT ainda precisa ser validada**. Para integração OAuth em ChatGPT, falta implementar um provedor OAuth 2.1 com PKCE e consentimento, ou usar mecanismo de autenticação aceito pelo ChatGPT. Não coloque token MCP em URL ou repositório.

## Testes

```bash
node nandozap-independent/test.mjs
```

No GitHub, o workflow `nandozap-check.yml` executa os testes isolados em pushes desta ramificação. Para desenvolvimento local, use `node nandozap-independent/server.mjs` com as variáveis definidas.

**Não marque como pronto para clientes reais antes de passar pelos testes de webhooks e persistência e obter a autorização Meta.**

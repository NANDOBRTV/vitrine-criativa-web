# Vendedor IA — Webhook seguro de validação da Meta

Este servidor cria o callback HTTPS usado no caso de uso **WhatsApp Business API** do aplicativo Meta "Vendedor IA".

Endpoint de verificação: `GET /webhooks/whatsapp` com `hub.mode`, `hub.verify_token` e `hub.challenge`. Quando o token coincide, responde com o desafio. Também fornece `GET /health`.

Mensagens `POST` exigem `X-Hub-Signature-256` validada com `META_APP_SECRET`. Se essa variável ainda não estiver configurada, as mensagens são recusadas com HTTP 503. Os dados recebidos não são armazenados nem reenviados; nenhuma resposta automática está ativa. Adicionar comportamento comercial apenas após confirmação explícita de assinatura, permissões adequadas e salvaguardas anti-spam.

## Configuração no Render

Runtime Node; comando de build `echo 'No build needed'`; start `node meta-vendedor-ia/server.js`.

Variáveis de ambiente, **somente no Render**, não no GitHub:
- `WEBHOOK_VERIFY_TOKEN`: sequência gerada separadamente, igual ao campo "Verificar token" da Meta.
- `META_APP_SECRET`: segredo do aplicativo Meta (somente antes de ativar eventos reais; não compartilhar em chats ou logs).

A integração Peach do número comercial existente é separada. **Não registrar novamente nem migrar o número já conectado**. A validação GET não ativa envio de mensagens por IA.

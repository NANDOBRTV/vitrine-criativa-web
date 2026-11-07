# NandoZap IA — conector de pareamento experimental

Esta ramificação do repositório hospeda um teste isolado de conexão por **WhatsApp Web**, usando Baileys. Não é a API oficial da Meta.

## Segurança

- Acesso protegido por NANDOZAP_SETUP_SECRET (mínimo 40 caracteres), configurado no Render, nunca no código.
- O acesso começa por URL com fragmento #access=, transferido via POST e trocado por cookie HttpOnly com SameSite Strict.
- Nenhuma mensagem é enviada automaticamente.
- O endpoint público /healthz só informa disponibilidade de servidor.
- A sessão WhatsApp fica em pasta local .session ignorada pelo repositório; isso é efêmero no Render Free.
- QR e código de pareamento são gerados pelo socket real.
- NÃO usar em produção nem como solução 24 horas: Render Free suspende serviço ocioso e apaga arquivos locais, e o WhatsApp pode restringir clientes não oficiais.
- A ligação com o banco de dados, API MCP e atendimento automático do NandoZap IA principal ainda não foi implementada; este é só o pareamento de teste.

## Rodar (desenvolvimento)

Node 20+:
```bash
cd nandozap-gateway
npm install
NANDOZAP_SETUP_SECRET="defina-uma-chave-aleatoria-com-mais-de-40-caracteres" npm start
```

Render Web service: branch `nandozap-qr-gateway`, build command `cd nandozap-gateway && npm install --omit=dev`, start command `cd nandozap-gateway && npm start`, runtime Node, free plan.

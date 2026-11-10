# Neon Live Studio — navegador e multiplayer

## Endereços

**Demonstração pública atualmente no ar:** https://neon-live-studio-cloud.onrender.com

Nesta URL, os cinco jogos usam o modo de demonstração em cada navegador; não é multiplayer entre aparelhos. É compatível com Android sem Termux. WebGL é tentado primeiro; o motor 2D entra como alternativa.

**Código novo para multiplayer:** \`neon-live-studio-cloud/server.mjs\`, pronto para configurar uma instância Node em um serviço separado. O serviço Node ainda **não está implantado**. Não confunda o site estático ativo com o Node multiplayer.

## O que o Node faz

- Um espaço de jogo compartilhado; transmissão do placar via SSE (\`GET /api/events\`).
- Os espectadores entram pelo navegador (\`POST /api/join\`), até 20 por rodada.
- O criador muda o jogo, inicia partida, adiciona bots e testa presentes (\`POST /api/host/action\`).
- Login exclusivo do criador com \`NEON_ADMIN_KEY\`, definido no ambiente da hospedagem, nunca no código-fonte.
- Controle de duplicações, limites básicos por IP, validação da origem e cookie HttpOnly, Secure, SameSite=Strict.
- Cinco modos com estado autoritativo: corrida, batalha, esferas, torres e quiz.
- Perguntas em que cada participante responde uma vez por rodada.
- Tela vertical \`/?view=live\` com placar espelhado no servidor.

### Limitações honestas

É um **protótipo online**, não um jogo com qualidade AAA nem uma cópia dos recursos do Livecade. Não há TikTok LIVE real, monetização, múltiplos criadores independentes, arquivos 3D premium ou persistência. O Render no plano gratuito pode suspender o processo, reiniciando partidas e sessões. A implementação atual mantém tudo em memória: não é uma infraestrutura 24 horas nem pronta para milhares de espectadores. Uma conexão TikTok verdadeira exige integração autorizada e testes próprios.

## Publicação Node no Render (passo de ativação pendente)

Esta etapa não foi feita automaticamente porque a ferramenta de criação de serviço devolveu um bloqueio de segurança.

Configuração para um serviço **novo, separado dos já existentes**:

- Repo: \`https://github.com/NANDOBRTV/vitrine-criativa-web\`
- Branch: \`neon-live-studio-cloud\`
- Ambiente: Node.js, plano **Free**
- Build: \`node --check neon-live-studio-cloud/server.mjs && node --test neon-live-studio-cloud/server.test.mjs\`
- Start: \`node neon-live-studio-cloud/server.mjs\`
- Environment: \`NEON_ADMIN_KEY\` com uma chave **forte privada** que não deve ser publicada no GitHub.
- Não é necessário definir \`PORT\`: a plataforma fornece automaticamente.
- Health check: \`/health\`

Após a ativação, a URL da instância Node serve o mesmo painel visual com o modo multiplayer habilitado. Basta inserir o código de criador uma vez no botão "Entrar como criador". Outras pessoas acessam a URL normal e entram pelo botão "Entrar".

## Desenvolvimento e testes locais

Requisitos: Node 20+. Sem dependências npm externas para o servidor.

\`\`\`bash
NEON_ADMIN_KEY='troque-esta-chave-por-outra-longa-e-privada' node neon-live-studio-cloud/server.mjs
\`\`\`

Testes isolados:

\`\`\`bash
cd neon-live-studio-cloud
node --check server.mjs
node --test server.test.mjs
\`\`\`

Teste gráfico real (WebGL, GPU, FPS) precisa de navegador compatível. O Firecrawl pode verificar páginas e interações, mas seu ambiente de navegação pode não oferecer GPU.

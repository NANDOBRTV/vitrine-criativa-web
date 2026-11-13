# Auditoria GameDev Master — NEON RUSH V14.6.1

**Data:** 13 de novembro de 2026  
**Código auditado:** `NANDOBRTV/vitrine-criativa-web`, `neon-rush-v1/index.html`, branch de produção `neon-rush-stockcar-v11` (V14.6.0).  
**Patch da auditoria:** `neon-rush-v1461-gamedev-audit-minimap-20261113`.  
**Motor real:** WebGL 1 + JavaScript/Canvas 2D próprios; não usa Three.js.  
**Método:** inspeção de código em cinco frentes (estado, física, assets, UI e desempenho), testes unitários e Playwright em emulação de viewport mobile. Não corresponde a cinco desenvolvedores independentes.

## Achados prioritários

| ID | Gravidade | Estado | Evidência e impacto | Ação |
|---|---|---|---|---|
| MAP-01 | Alta | **Confirmado e corrigido na branch V14.6.1** | A V14.6.0 desenha um ponto físico e um badge por carro e adiciona `lineTo(actual,displayed)`. São até **20 pontos visuais** e conectores, embora o usuário tenha solicitado 10 bolinhas livres. | Exibir apenas um badge por carro; remover ponto extra, tether e linha central tracejada, mantendo somente o contorno da pista. |
| QA-02 | Alta | **Lacuna de cobertura confirmada** | O teste chamado “220 corridas” executa **4.680 passos a 60Hz = 78s por simulação**, não uma volta inteira de 10.000m. Ele é uma boa regressão para colisões, mas **não prova 220 corridas completas** de 10km nem 10 voltas. | Manter testes atuais e acrescentar simulações de duração real/semear progresso próximo de cada passagem da linha L/C e provas de várias voltas. |
| MAP-03 | Média | **Compromisso visual documentado** | O minimapa possui 164 × 194 pixels e usa `layoutMinimapMarkers(...,19)` para espalhar badges de carros aglomerados. Assim os números ficam legíveis, mas a posição visual pode diferir da posição em metros. | Manter ordenação por percurso, mostrar distância exata no HUD; não representar reposicionamento visual como medida proporcional perfeita. |
| PERF-04 | Média | **Risco por inspeção — não medido no Redmi** | `refreshWorldMeshes` recria e envia ao WebGL os buffers de pista/cenário sempre que o bloco de 72m muda, com destruição dos buffers anteriores. Possível pico de CPU/GPU/memória em Android intermediário. | Perfil de FPS/p95 no aparelho; considerar pré-gerar ou reutilizar uma malha circular de trechos. |
| LIVE-05 | Média | **Limitação funcional confirmada** | `receiveGift()` registra evento local e ativa nitro; o bot é uma simulação. Não há neste módulo confirmação por conector TikTok LIVE nem verificação de autenticidade do presente. | Exibir claramente **SIMULADOR/BOT** e só contar presentes reais após integração autenticada, com IDs de evento para impedir duplicidade. |
| BRW-06 | Média | **Cobertura insuficiente** | Os testes Playwright no Chromium usando SwiftShader verificam WebGL e HUD, mas não equivalem a benchmark ou verificação de estabilidade, áudio e FPS no Redmi 13C. | Testar no Android real, várias largadas, 3/10 voltas, câmera, áudio, perda/restauração de contexto e aquecimento. |
| UI-07 | Baixa | **Aprovado por inspeção** | Os textos de presente/nome são inseridos via `textContent`, evitando renderização de HTML arbitrário. | Preservar essa proteção nas próximas integrações. |
| TRACK-08 | Baixa | **Aprovado por inspeção e testes anteriores** | A curva fechada usa parametrização do percurso, `DISTANCE=10000` e opções 1/2/3/5/10 voltas. | Não alterar a pista para remover linhas do minimapa. |

## Teste específico adicionado

Arquivo `neon-rush-v1/qa-v1461-audit.test.cjs` usa um Canvas 2D instrumentado e verifica:
- Exatamente **dez círculos numerados mais o marcador L/C**, não vinte pontos.
- **Zero chamadas `lineTo()` após fechar o contorno do circuito.**
- Nenhum badge fora do Canvas ou sobreposto no pelotão compacto.
- Vinte configurações de pelotão, com 200 marcadores verificados ao todo.
- Manutenção de HUD, bots, nitro, mini chat e API de presentes.

O workflow executa também os testes anteriores de física/voltas e Playwright mobile. Consulte o resultado de **GitHub Actions** associado ao PR antes de publicar; este documento não considera a execução aprovada antecipadamente.

## Matriz de verificação

| Frente | Evidência | Limitação |
|---|---|---|
| Estado/integração | APIs e bot de presentes inspecionados; fluxo de texto seguro | TikTok LIVE real não conectado; autenticação de presentes não implementada |
| Física | 60Hz fixos, limites de distância, colisões entre voltas e nitro inspecionados; testes de regressão existentes | 220 testes de 78s ≠ 220 provas completas de 10km |
| Assets/3D | Dez modelos 3D, dez skins e geometria de nitro mantidos | Qualidade visual e FPS em GPU Android ainda não mensurados |
| Interface/minimapa | Código V14.6.1 passou a desenhar 10 badges livres, sem tether; novo teste Canvas específico | Distribuição visual de badges próximos não é distância em escala exata |
| Performance | Modelo usa streaming de cenário, 24/30 FPS de render e 60Hz de física | Perfil de frame time p95, temperatura, memória e WebGL context-loss ainda faltam no Redmi |

**Prioridade:** 1) testar e publicar MAP-01; 2) medir PERF-04 em Android; 3) ampliar QA-02 para prova completa; 4) autenticar LIVE-05 quando existir conector real.

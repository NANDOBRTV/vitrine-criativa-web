# Stock Car 3D — GameDev Master QA V14.4.1

Data: 12/11/2026. Projeto: `neon-rush-v1`, branch `neon-rush-stockcar-v11`. Motor: WebGL próprio (JavaScript), sem Three.js e sem Unity.

## Escopo preservado
- 10 carros distintos: nº 04, 11, 18, 27, 33, 07, 19, 23, 90 e 64
- Carrocerias 3D, pinturas, rodas independentes e referência à galeria de sprites
- Circuito 680 m e minimapa com 10 pontos identificáveis
- Física 60 Hz, IA, ultrapassagens, colisões, turbo, presentes simulados
- Câmeras Perseguição / TV / Aérea, closes automáticos
- Narrador em pt-BR, áudio do motor, painel e preferências do usuário

## Defeitos reproduzidos e corrigidos

1. **Sobreposição persistente entre veículos (física)** — Reproduzido com veículos nº 04 e 33 na mesma faixa, a 2 m de distância longitudinal. A versão anterior mantinha 2 m após atualizar, pois `Math.max(progressAnterior, posicaoSegura)` bloqueava a separação. A V14.4.1 aceita a correção e aplica um segundo passe de resolução de conflitos na faixa; resultado do mesmo cenário: 5,7 m de separação e nenhum par em colisão.
2. **Teste de diagnóstico alterava partida real** — `NEON_RUSH_V14.testRun()` substituía o estado e deixava a corrida em pódio mesmo quando a GPU tinha falhado. Corrigido usando clones e restauração completa em `finally`, evitando fala do narrador durante o diagnóstico. O parâmetro foi limitado a 0–90 s.
3. **Excesso de atualização DOM (Android)** — HUD e minimapa eram atualizados a cada renderização. Agora os custos de HUD e minimapa são limitados a aproximadamente 8 e 9 atualizações/s; a cena 3D mantém o orçamento de 30 FPS ou 24 FPS ECO.
4. **Modo ECO não aliviava pixels GPU** — A resolução real foi limitada a até 1× devicePixelRatio no ECO, contra 1,35× no normal.
5. **Perda do contexto gráfico Android** — Acrescentados handlers `webglcontextlost` / `webglcontextrestored` para pausar e orientar o reinício, preservando o erro visível em vez de simular uma corrida sem imagem.
6. **Curvatura inicial de pilotos de trás** — A física passa a ler `START + progress` mesmo com distâncias negativas, como já ocorre no desenho corrigido da largada.

## Testes executados

| Verificação | Resultado | Modalidade |
| --- | --- | --- |
| Sintaxe JavaScript embutido | APROVADO | Parser JS no código exato do GitHub |
| Regressão de carros sobrepostos na mesma faixa | APROVADO | Antes 2,0 m / depois 5,7 m |
| 220 corridas, 202.400 passos de física, velocidades variadas | APROVADO | Simulação sem GPU |
| Passagens registradas em 220 simulações | 5.310 eventos | Simulação sem GPU |
| Sobreposição e coordenadas não finitas no estresse | 0 casos | Simulação sem GPU |
| `testRun` isolado e duração fora do limite | APROVADO | Execução do JS do repositório |
| Minimapa, 10 marcadores, curva S, 10 skins/controles e áudio mantidos | APROVADO nos testes de código | Geometria + inspeção estática |
| Seis grupos da suíte adicional `gamedev-master-qa.test.mjs` | 6/6 APROVADOS | Avaliação equivalente em runtime V8 |
| Render do jogo WebGL numa GPU Android | **NÃO EXECUTADO** | Depende de dispositivo real |
| Qualidade audível da voz Android e FPS/p95 GPU | **NÃO EXECUTADO** | Depende do dispositivo |
| Conexão real com TikTok LIVE | **NÃO IMPLEMENTADA** | Os botões continuam sendo simuladores |

## Futuros critérios de aprovação em Android

- Abrir em Chrome e confirmar carros 3D sólidos, 10 pinturas e câmera perseguição em curvas.
- Testar corrida com 10 carros por pelo menos 10 minutos, conferir FPS/temperatura.
- Testar perda/restauração de contexto mudando de aplicativo, volta para corrida sem duplicar eventos.
- Conferir som e narrador em pt-BR, áudio simultâneo, e abrir/trocar Câmera / Piloto / ECO / minimapa.

## Rollback

Backup: branch `neon-stockcar-v14-3-1-before-gamedev-qa-20261112`. Os assets e a galeria existentes não foram substituídos.

## Notas

Não declarar "100% sem bugs" sem executar testes gráficos no próprio Android. Os 220 cenários foram simulações de física, não provas de qualidade visual na GPU. As correções são incrementais, sem reescrita nem remoção de recursos.

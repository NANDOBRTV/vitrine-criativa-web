# Neon Rush Stock Car V11 — integração verificável

Esta ramificação adiciona sprites dos dez veículos da prancha fornecida pelo usuário ao Neon Rush V10. **Os carros são imagens 2D com aparência 3D (billboards), não modelos 3D reais.** A física/colisão continua no motor original.

## Como a versão na nuvem é montada

- `neon-rush-v1/index.html`: integração do jogo, dez carros e minimapa.
- `neon-rush-v1/stockcar-web-assets.b64`: ZIP binário codificado em base64 que contém a galeria, o manifesto e os gráficos WebP otimizados para Android.
- Comando de build do site isolado: `mkdir -p stockcar-public && cp neon-rush-v1/index.html stockcar-public/index.html && base64 -d neon-rush-v1/stockcar-web-assets.b64 > /tmp/neon-stockcar-assets.zip && unzip -q -o /tmp/neon-stockcar-assets.zip -d stockcar-public`.

## Links

- Jogo: https://neon-rush-stockcar-v11.onrender.com/
- Galeria de validação: https://neon-rush-stockcar-v11.onrender.com/stockcar-viewer.html
- Manifesto: https://neon-rush-stockcar-v11.onrender.com/assets/stockcar/manifest.json

Foram recortadas 60 vistas de origem; 58 aceitas e duas colocadas em quarentena devido a aparente troca de pintura (Cruze 04 frontal ¾ e Corolla 11 frontal). Os arquivos restantes incluem rodas, referências de animação, efeitos e texturas. Os itens de efeito/quadros não foram ativados porque alguns têm fundos de painel e não permitem recuperação limpa, e as animações não identificam com segurança todos os veículos.

A versão para baixar inclui todos os **PNGs**, testes e relatório. Os arquivos publicados são WebP derivados desses PNGs para reduzir peso.

**Testes:** 75 verificações estáticas, validação do carregador, 24 simulações de colisão (12 com 10 carros e 12 com 16) sem sobreposições, carregamento HTTP da nova galeria. O modo WebGL no Android físico não foi testado.

Mantida a V10 anterior em ramificação e site separados, sem alteração do serviço existente.
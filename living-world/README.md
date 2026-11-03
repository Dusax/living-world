# 🏕 Mundo Vivo

Uma vila em pixel art que **cresce sozinha**: cada **seguidor vira um morador**, e os moradores decidem sozinhos o que fazer (cortar madeira, plantar, minerar, forjar, construir, vigiar, explorar, conversar, brigar…). Você é o **deus**: decreta, sussurra, vota, manda, abençoa, castiga e derruba meteoros. O jogo narra a própria história em **legendas de vídeo vertical (9:16)** e **grava clipes** prontos para postar.

> Interpretação própria do formato "mundo de IA com seguidores como moradores". Não é cópia de nenhum perfil.

## Rodar

```bash
cd living-world
npm start          # servidor estático, sem dependências -> http://localhost:8080
npm test           # simulação headless (Node >= 20)
```

Não abra o `index.html` direto (`file://`): módulos ES precisam de um servidor.

## O mundo

- Floresta densa, uma clareira, trilhas até **marcos** (lagoa, açude, esqueleto gigante, ruínas, cachoeira na montanha).
- A clareira cresce conforme os lenhadores derrubam árvores; onde muita gente anda, a grama vira trilha de terra e, em cidades, pedra.
- Progressão: **Acampamento → Vila → Cidade → Reino**. Fila de obras automática: cabanas, plantações, poço, celeiro (com ovelhas), forja, mercado, muralha de estacas, torres de vigia, biblioteca, castelo.
- Dia/noite, estações (o inverno é duro: estoque no outono), chuva, seca. Fome, cansaço, solidão; há mortes.
- **Ofícios**: lenhador, fazendeiro, mineiro, mestre de obras, ferreiro, guarda, explorador, rei.

## Seguidores = moradores

Painel **Seguidores**: cole os @ reais de quem te segue (um por linha) e eles chegam em **caravana**, em fila pela trilha da montanha. Com 2 seguidores é um acampamento; com 40, um reino.

## Votação ("stories")

**Eleger rei**, **próxima obra**, **expedição**. Você abre a votação, soma os votos que vieram dos stories (+1/+5) e encerra; o resultado vira história e muda o mundo. A votação também aparece no vídeo.

## Quem decide pelos moradores

| Cérebro | Como funciona | Custo |
|---|---|---|
| **Instinto** (padrão) | Utilidade ponderada: necessidades × personalidade × ofício × estado do povoado × sua influência | Grátis, offline |
| **Claude** | Cada decisão é um prompt (estado, lembranças, relações, "voz do céu"); devolve JSON `{thought, action, target, say}` | Sua chave |

Se o Claude erra, demora (15 s) ou pede algo impossível, o morador cai no instinto. Fome extrema vira reflexo nos dois. Ligue em **IA (Claude) e jogo**: a chave fica só no `localStorage` e vai direto para `api.anthropic.com`; há limite de chamadas e contador de tokens.

## Vídeo e narração

- **Legendas** 2–3 palavras por vez, com destaque, como nos vídeos curtos. O narrador comenta chegadas, obras, estações, mortes, expedições, votações.
- **Cenas internas** (forja, sino, trono, livro) entram quando algo marcante acontece.
- **Câmera automática**: segue a história; arraste/zoom para assumir (volta sozinha depois de 8 s).
- **🎬 Intro** ("Essa página tem N seguidores"), **📜 Roteiro** (Claude, ou resumo simples sem chave, vira legendas) e **⏺ Gravar clipe** (canvas 720×1280 → `.webm`).

## Seus poderes

Decreto para todos e sussurro para um (texto livre; no modo instinto, palavras-chave mudam prioridades; no modo Claude entra no prompt e cada um obedece ou não), ordens diretas, chuva/seca/colheita/dádiva/praga/meteoro, plantar árvore/arbusto/pedra/cabana, abençoar, raio, seguir com a câmera. Salvamento automático a cada 30 s.

Controles: arrastar = câmera · roda/pinça = zoom · botão direito = mandar o selecionado · espaço = pausar · 1×–8×.

## Estrutura

```
src/world.js     terreno, trilhas, marcos, recursos, estruturas
src/sim.js       motor: tempo, estações, planejador de obras, ofícios, ações, votação, poderes, save/load
src/brain.js     instinto (utilidade), prompt do LLM, parser
src/agent.js     personalidade e estado
src/path.js      busca de caminho (BFS)
src/llm.js       cliente da API da Anthropic (navegador)
src/sprites.js   sprites em pixel art gerados por código
src/render.js    renderização, luz, clima, HUD, legendas
src/narrator.js  fila de falas e legendas
src/scenes.js    cenas internas
src/main.js      UI, câmera automática, gravação
test/            testes headless
```

`world.js`, `sim.js`, `brain.js` não tocam no DOM: dá para rodar o mundo no Node/servidor 24/7 e só transmitir a tela.

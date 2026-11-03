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

## Moradores estilo D&D

Cada seguidor chega com uma **ficha**: raça (humano, elfo, anão, halfling, meio-orc), **classe** (guerreiro, bárbaro, paladino, patrulheiro, ladino, bardo, clérigo, mago), atributos FOR/DES/CON/INT/SAB/CAR (4d6 descartando o menor), PV, alinhamento (derivado da personalidade), **nível 1–10** e XP (coletar, colher, construir, explorar, conversar, ajudar, sobreviver).

A classe muda o jeito de viver: bárbaro corta mais madeira, patrulheiro acha mais comida e anda rápido nas expedições, ladino descobre o mapa, bardo faz amizades mais rápido, clérigo cura quem está por perto, mago constrói mais depressa e forja ferramentas em dobro, paladino é candidato natural a rei. Cada classe tem roupa própria no mapa.

**Rei por clamor popular:** numa cidade grande, depois de alguns dias, o povo pede um rei. Abre-se uma votação (candidatos por carisma, nível e laços). Se você não decidir em 2 dias, o povo vota sozinho.

## Quem decide pelos moradores (mentes)

| Cérebro | Como funciona | Custo |
|---|---|---|
| **Instinto** (padrão) | Utilidade ponderada: necessidades × personalidade × classe × ofício × estado do povoado × sua influência | Grátis, offline |
| **Mentes (IA)** | Um **pool** de provedores: Gemini (AI Studio), Groq, OpenRouter, Ollama local, qualquer URL compatível com OpenAI, ou Claude. Cada um tem limite por minuto e por dia (editável) | Pode ser 100% grátis |

O jogo **reveza** entre as mentes com folga, coloca em espera a que devolver 429, desliga a que recusar a chave e, se nenhuma puder responder, usa o instinto. Modo **híbrido**: decisões importantes (decreto, sussurro, recém-chegado, solidão, rei) sempre consultam a IA; as comuns, só a fração que você definir (padrão 25%). Isso mantém o consumo dentro de planos grátis.

Configure em **Mentes (IA) e jogo**: escolha o provedor, cole a chave, ajuste modelo e limites. Chaves ficam só no `localStorage` do navegador. Os limites e nomes de modelo iniciais são conservadores e **podem estar desatualizados**: confira a página do provedor. Para a IA funcionar, abra o jogo localmente (`npm start`) ou numa hospedagem sua; o link publicado como artefato do Claude bloqueia conexões externas.

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
src/agent.js     fichas D&D (classes, raças, atributos, nível), personalidade
src/path.js      busca de caminho (BFS)
src/llm.js       pool de mentes: provedores, limites, rodízio, modo híbrido
src/sprites.js   sprites em pixel art gerados por código
src/render.js    renderização, luz, clima, HUD, legendas
src/narrator.js  fila de falas e legendas
src/scenes.js    cenas internas
src/main.js      UI, câmera automática, gravação
test/            testes headless
```

`world.js`, `sim.js`, `brain.js` não tocam no DOM: dá para rodar o mundo no Node/servidor 24/7 e só transmitir a tela.

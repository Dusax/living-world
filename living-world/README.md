# 🏕 Mundo Vivo

Um jogo para você assistir e interferir: uma vila em pixel art que **cresce sozinha**. Dois moradores acendem uma fogueira numa clareira e, se houver comida e lugar para dormir, **viajantes chegam por conta própria**. Eles têm ficha de D&D, decidem o que fazer (cortar madeira, plantar, minerar, forjar, construir, vigiar, explorar, conversar, brigar…) e você é o **deus**: decreta, sussurra, manda, abençoa, castiga e derruba meteoros. O jogo narra a própria história em legendas de vídeo vertical (9:16) e grava clipes.

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

## Crescimento

Viajantes chegam sozinhos em fila pela trilha da montanha, quando há comida no armazém e camas livres (e a vila constrói mais cabanas quando as camas acabam). Em ~60 dias de jogo (cerca de 24 min em 1×) costuma passar de 30 moradores. Você também pode chamar gente na hora, com ou sem nome, no painel **Chamar moradores**.

## Votação

**Eleger rei**, **próxima obra**, **expedição**. Você abre a votação e escolhe o vencedor (ou soma votos e encerra); o resultado vira história e muda o mundo. Também aparece no vídeo.

## Moradores estilo D&D

Cada seguidor chega com uma **ficha**: raça (humano, elfo, anão, halfling, meio-orc), **classe** (guerreiro, bárbaro, paladino, patrulheiro, ladino, bardo, clérigo, mago), atributos FOR/DES/CON/INT/SAB/CAR (4d6 descartando o menor), PV, alinhamento (derivado da personalidade), **nível 1–10** e XP (coletar, colher, construir, explorar, conversar, ajudar, sobreviver).

A classe muda o jeito de viver: bárbaro corta mais madeira, patrulheiro acha mais comida e anda rápido nas expedições, ladino descobre o mapa, bardo faz amizades mais rápido, clérigo cura quem está por perto, mago constrói mais depressa e forja ferramentas em dobro, paladino é candidato natural a rei. Cada classe tem roupa própria no mapa.

**Rei por clamor popular:** numa cidade grande, depois de alguns dias, o povo pede um rei. Abre-se uma votação (candidatos por carisma, nível e laços). Se você não decidir em 2 dias, o povo vota sozinho.

## Vida real

Os moradores têm **idade** (1 ano = 3 dias de jogo), **sexo**, **sobrenome/família** e envelhecem de verdade:

- **Amor e casamento:** flertam, se apaixonam, se casam (casal mora junto), têm **filhos** (gravidez de ~2 dias, gêmeos raros) que herdam atributos, personalidade e vocação dos pais.
- **Crianças crescem:** são menores no mapa, brincam, aprendem com os mais velhos e aos 16 anos recebem a classe e entram na vida adulta. Idosos têm cabelo branco e trabalham menos.
- **Morte por velhice** (a partir dos 55, crescendo com a idade), luto de quem fica, órfãos acolhidos por alguém da vila.
- **Traição e intriga:** casos secretos (você vê no cartão, como deus), descobertos mais cedo ou mais tarde, com divórcio, briga ou perdão; boatos; rejeição; **golpe contra o rei impopular**; quem decide **ir embora para sempre**.
- Só a vila que a lavoura sustenta cresce: nascimentos e viajantes dependem de comida e camas. Romance e casamento só entre adultos.
- **Cupido** (ferramenta): faz dois adultos se apaixonarem.

## Consciência e livre-arbítrio

Cada morador tem **humor**, **memória de longo prazo** (momentos marcantes e um resumo da própria história) e um **objetivo de vida escrito nas próprias palavras**, que ele muda quando a vida muda: casar, ser rei, vingar-se, explorar, proteger a família, partir… ou qualquer coisa. Os tipos de objetivo e de ação são só **sugestões**.

- **Sem IA:** os objetivos nascem das regras (personalidade, classe, o que viveu) e o instinto os persegue.
- **Com IA:** cada pessoa **reflete** periodicamente (sem travar o corpo) e decide como se sente, o que quer e o que faz. Pode escolher **qualquer ato** (`ato` com `intent` livre: roubar, mentir, envenenar, fundar um culto, desafiar o rei, pedir perdão, sabotar…). Um **mestre estilo D&D** (a IA) decide habilidade e CD e os efeitos de sucesso e falha; o jogo **rola o d20** e aplica as consequências (opiniões, amor, ferimentos, mortes, humor, objetivos). Sem IA, um mestre de regras faz esse papel.
- O que sobra de limite é físico (fome, cansaço, ferimentos) e uma única trava de conteúdo: romance e casamento só entre adultos.

## Quem decide pelos moradores (mentes)

| Cérebro | Como funciona | Custo |
|---|---|---|
| **Instinto** (padrão) | Utilidade ponderada: necessidades × personalidade × classe × ofício × estado do povoado × sua influência | Grátis, offline |
| **Mentes (IA)** | Reflexão, decisões e mestre de jogo. Um **pool** de provedores: Gemini (AI Studio), Groq, OpenRouter, Ollama local, qualquer URL compatível com OpenAI, ou Claude. Cada um tem limite por minuto e por dia (editável) | Pode ser 100% grátis |

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
src/agent.js     fichas D&D (classes, raças, atributos, nível), idade, família
src/life.js      vida real: romance, casamento, filhos, traição, velhice, golpes
src/mind.js      consciência: humor, objetivos livres, memória, reflexão e mestre (prompts)
src/freewill.js  atos livres: mestre de regras, d20 e efeitos validados
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

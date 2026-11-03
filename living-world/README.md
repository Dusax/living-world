# 🏝 Mundo Vivo

Um mundo simulado onde os habitantes **decidem sozinhos** o que fazer — comer, trabalhar, construir casas, conversar, brigar, se apaixonar por amigos, ter filhos — e **você é o deus**: pode decretar, sussurrar, mandar, abençoar, castigar e derrubar meteoros.

> Esta é uma interpretação própria da ideia de "mundo de IA com agentes autônomos + um deus que interfere".
> Não é uma cópia de nenhum perfil específico.

## Rodar

```bash
cd living-world
npm start          # servidor estático sem dependências -> http://localhost:8080
npm test           # simulação headless (Node >= 20)
```

Não abra o `index.html` direto (`file://`): módulos ES precisam de um servidor.

## Como os habitantes decidem

Cada habitante tem **personalidade** (coragem, sociabilidade, diligência, curiosidade, bondade), **necessidades** (fome, cansaço, solidão, vida), **inventário**, **memória/diário** e **relações** com os outros.

Quando ficam sem o que fazer, escolhem a próxima ação por um de dois "cérebros":

| Cérebro | Como funciona | Custo |
|---|---|---|
| **Instinto** (padrão) | Utilidade ponderada: necessidades × personalidade × estado do povoado × sua influência | Grátis, offline |
| **Claude** | Cada decisão é um prompt com o estado, as lembranças e a "voz do céu"; o modelo devolve JSON `{thought, action, target, say}` | Você usa a sua chave |

Se o Claude erra, demora (15 s) ou pede algo impossível, o habitante cai no instinto. Reflexos de sobrevivência (fome ≥ 90) valem para os dois.

Para ligar o Claude: painel **IA (Claude) e jogo** → cole sua chave da Anthropic → marque "Usar Claude como mente". A chave fica só no `localStorage` do navegador e vai direto para `api.anthropic.com`. Há um limite de chamadas por sessão (padrão 400) e um contador de tokens.

## Seus poderes

- **Decreto** (texto livre para todos) e **sussurro** (texto livre para uma pessoa). No modo instinto, palavras-chave ("casa", "comida", "festa", "explorar"…) mudam as prioridades; no modo Claude, o texto entra no prompt e cada um obedece, duvida ou ignora conforme o temperamento.
- **Ordens diretas**: escolher a ação de alguém, ou mandá-lo a um ponto (botão direito / ferramenta 📍).
- **Eventos**: chuva, seca, colheita farta, dádiva, forasteiro, praga, meteoro.
- **Ferramentas**: plantar árvore, arbusto, pedra, casa pronta, meteoro no ponto clicado.
- **Abençoar / Raio** num habitante. **Seguir** com a câmera.
- **Crônica**: log de tudo e botão "Contar o dia" (Claude narra, ou resumo simples sem chave). Dá para exportar em `.txt`.
- Salvamento automático a cada 30 s no navegador (+ botões Salvar/Carregar/Novo mundo).

Controles: arrastar = mover câmera · roda/pinça = zoom · espaço = pausar · 1×–8× de velocidade.

## Estrutura

```
src/rng.js     PRNG determinístico (mesma semente = mesmo mundo)
src/world.js   terreno procedural, recursos, estruturas
src/path.js    busca de caminho (BFS)
src/agent.js   personalidade e estado dos habitantes
src/brain.js   instinto (utilidade), prompt do LLM, parser
src/sim.js     motor: tempo, estações, clima, ações, relações, poderes divinos, save/load
src/llm.js     cliente da API da Anthropic (navegador)
src/render.js  canvas 2D (dia/noite, estações, chuva, balões de fala)
src/main.js    UI e loop
test/          testes headless da simulação
```

`sim.js`, `brain.js`, `world.js` não tocam no DOM — dá para rodar o mundo no Node, em servidor, ou trocar a UI.

## Ideias para evoluir

- Mundo persistente rodando 24/7 num servidor, transmitido por vídeo/stream (o formato de "conta de Instagram" costuma ser clipes gravados da simulação).
- Mais camadas: profissões, comércio, religião (a "voz do céu" virando mito), guerras entre vilas, tecnologia.
- Gravação automática de clipes (`canvas.captureStream()` + `MediaRecorder`) e narração por voz.
- Memória de longo prazo com resumos feitos pelo LLM e sistema de reflexão (estilo *Generative Agents*).

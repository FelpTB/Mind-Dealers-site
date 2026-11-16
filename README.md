# Mind Dealers — protótipo online

Jogo online para 4 jogadores. O servidor aplica todas as regras do [Manual de Regras](https://app.notion.com/p/418f5867e96080a6819fd8a9cd1c9dd0)
e deixa para os jogadores apenas as decisões. Sem arte: só os textos das cartas e um mapa simples.

## Como rodar

Precisa só do Node.js 18+ (sem `npm install`, não há dependências).

```bash
node server.js
```

Abra `http://localhost:3000`. Um jogador cria a sala e envia o link/código para os outros três.
Para outras pessoas entrarem pela internet, rode o servidor numa máquina acessível (ex.: Render, Railway, Fly.io,
uma VPS) ou exponha a porta local com um túnel (ex.: `ngrok http 3000`). A porta pode ser trocada com `PORT=8080`.

## Hospedar no Railway

O repositório já vem pronto para o Railway (`railway.json` + `package.json`):

1. Em [railway.com](https://railway.com), crie um projeto com **Deploy from GitHub repo** e escolha `FelpTB/Mind-Dealers-site`.
2. O Railway detecta o Node 22, roda `node server.js` e usa a porta que ele mesmo define (variável `PORT`). Não há build nem variáveis para configurar.
3. Em **Settings → Networking**, clique em **Generate Domain** para ganhar um endereço público (ex.: `mind-dealers.up.railway.app`).
4. Cada `git push` na branch `main` publica uma nova versão automaticamente.

Cuidados:

- As salas ficam na memória do servidor. **Cada nova publicação (ou reinício) apaga as partidas em andamento**, então evite fazer push no meio de um jogo.
- Mantenha **1 réplica** (já definido em `railway.json`): com mais de uma, jogadores da mesma sala poderiam cair em servidores diferentes.
- O Railway verifica a saúde do servidor em `/health`.

**Modo teste:** ao criar a sala, marque "Modo teste" para controlar os 4 jogadores no mesmo navegador.
A opção "seguir decisões" troca de assento sozinha para quem precisa decidir. A semente repete um embaralhamento.

Teste automático (joga 300 partidas aleatórias contra o motor):

```bash
node test/fuzz.js 300
```

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `server/data.js` | Cartas, locais, mapa, rodadas e números das regras (exportados do Notion). Edite aqui para mudar dados. |
| `server/engine.js` | Motor de regras: preparação, turnos, efeitos, transições, Modo Serafim, vitórias. |
| `server.js` | Servidor HTTP: salas, informação oculta por jogador, atualização ao vivo (SSE). |
| `public/` | Interface web (HTML/CSS/JS puro). |
| `test/fuzz.js` | Teste com partidas aleatórias. |

## O que é automático

Preparação inteira, ordem de turno, passos e ações restantes, validação de movimento (lotação, local fechado,
Alameda, Beco, Barreira Social, Constrição, Cúpula), trocas na trilha de prestígio, limite de mão, dano = descarte,
eliminação, janelas de reação (Extintor, Escudo Humano, Dor Compartilhada, Espelho, Enganação, Conversa Longa),
Roupa de Proteção e Plot Armor, efeitos de todas as 46 cartas, efeitos dos locais (Hospital, Banco, Sede, Metrô,
Rádio, Mercado, Cassino), virada de cartas dia/noite, cartas de Revelação, apostas do Cassino, Modo Serafim
(pergunta privada para todos, igual para não entregar o Artista), Marcador de Confiança e todas as condições de vitória.

## Decisões tomadas onde o manual não define (revisar)

1. **Mapa:** o Notion não tem o grafo de caminhos. Usei um mapa provisório 3×3 (12 calçadas, 2 alamedas, 4 becos)
   em `server/data.js` (`SLOTS` e `PATHS`). Os locais são sorteados nos espaços a cada partida.
2. **Manipular:** depois de Manipular, a ordem de escolha continua a do prestígio do início da rodada (ponto em aberto no manual).
3. **Explosão Celestial:** só fica ativa se o Serafim a colocar num local com Influenciar; o próprio Serafim não é atingido.
4. **Espelho de Cristal:** o portador escolhe se reflete; não é descartado. **Roupa de Proteção** é descartada depois de anular um ataque.
5. **Contrato de Detetive:** "olhar a carta" = ver uma carta da mão do alvo, escolhida às cegas. Com 3 cópias, gasta as 3 e revela a função.
6. **Incendiar:** descarta todo o equipamento do alvo; o portador descarta 1 carta no início de cada turno seu.
7. **Surto de Produtividade** vai para o descarte depois de revelado.
8. **Sede dos Mercenários:** vale para cartas de Ataque usadas com "Usar Carta" (não para Faca nem Incendiar).
9. **Vida Dividida:** quando a divisão não é exata, as cartas que sobram vão primeiro para quem tem menor prestígio.
10. **Modo Serafim numa transição para a noite:** como a Rodada 9 é de dia, o tabuleiro amanhece em seguida (revelações e checagem de vitória).
11. **Extintor** cancela o efeito inteiro, inclusive o descarte que o Sacrifício cobraria do usuário.
12. **Jogador eliminado** continua ocupando sua posição na trilha de prestígio.
13. **Prêmio do Cassino** sai do baralho normal.
14. **Artista eliminado:** o jogo termina com vitória só do Mind Dealer.

// Dados do jogo exportados do Notion (bases "Cartas", "Locais" e "Rodadas").
// Para mudar uma regra numérica ou texto de carta, edite aqui; o motor lê tudo deste arquivo.

// mode: acao | reacao | revelacao | equip
// cat: Ataque | Defesa | Movimento | Utilidade
const CARDS = [
  { id: 'surto', name: 'Surto de Produtividade', deck: 'luxo', copies: 2, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Para usar, revele essa carta no início do turno, ela não consome uma Ação. Realize uma ação extra nesse turno. Você realiza 3 Ações no turno.' },
  { id: 'olhar', name: 'Olhar do Serafim', deck: 'normal', copies: 3, vis: true, cat: 'Utilidade', mode: 'acao', text: 'Veja toda a mão de um jogador.' },
  { id: 'reputacao', name: 'Construir Reputação', deck: 'normal', copies: 3, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Aumente seu prestígio em um nível.' },
  { id: 'sacrificio', name: 'Sacrifício', deck: 'luxo', copies: 1, vis: false, cat: 'Ataque', mode: 'acao', text: 'Descarte duas cartas do alvo, você descarta uma. (Ao ser refletido você descarta as 3.)' },
  { id: 'teletransporte', name: 'Teletransporte', deck: 'luxo', copies: 2, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Mova um jogador para qualquer lugar.' },
  { id: 'espiadinha', name: 'Espiadinha', deck: 'normal', copies: 3, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Veja uma carta da mão de outro jogador.' },
  { id: 'explosao', name: 'Explosão Celestial', deck: 'normal', copies: 1, vis: true, cat: 'Ataque', mode: 'revelacao', text: 'Ao influenciar com essa carta, ela deve se manter virada para cima, sempre. Influência: todos que entrarem nesse local perdem 3 cartas.' },
  { id: 'espelho', name: 'Espelho de Cristal', deck: 'luxo', copies: 1, vis: false, cat: 'Defesa', mode: 'equip', text: 'Equipado: reflete o efeito de uma carta usada em você de volta para o dono da carta.' },
  { id: 'plotarmor', name: 'Plot Armor', deck: 'luxo', copies: 2, vis: false, cat: 'Defesa', mode: 'equip', text: 'Sempre que for descartar cartas, ao invés disso você pode descer posições na trilha de prestígio, uma posição para cada carta não descartada. Só é possível caso você consiga descer posições na trilha.' },
  { id: 'voo', name: 'Voo do Serafim', deck: 'normal', copies: 2, vis: true, cat: 'Movimento', mode: 'acao', text: 'Se move para qualquer lugar no tabuleiro; todos os jogadores que estiverem no destino descartam uma carta.' },
  { id: 'transmitir', name: 'Transmitir Memória', deck: 'normal', copies: 3, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Realiza a ação de Influenciar em qualquer lugar do mapa.' },
  { id: 'dor', name: 'Dor Compartilhada', deck: 'normal', copies: 2, vis: false, cat: 'Ataque', mode: 'reacao', text: 'Ao receber o efeito de uma carta, escolha outro jogador: ele recebe o mesmo efeito.' },
  { id: 'maoleve', name: 'Mão Leve', deck: 'normal', copies: 3, vis: false, cat: 'Ataque', mode: 'acao', text: 'Roube uma carta da mão de outro jogador nesse mesmo lugar.' },
  { id: 'escudo', name: 'Escudo Humano', deck: 'normal', copies: 2, vis: false, cat: 'Defesa', mode: 'reacao', text: 'Ao receber o efeito de uma carta, transfira esse efeito para outro jogador.' },
  { id: 'passeio', name: 'Passeio de Carro', deck: 'luxo', copies: 2, vis: false, cat: 'Movimento', mode: 'acao', text: 'Se mova para qualquer local do mapa.' },
  { id: 'negociacao', name: 'Negociação', deck: 'normal', copies: 2, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Compre 2 cartas do baralho normal.' },
  { id: 'repouso', name: 'Repouso do Serafim', deck: 'normal', copies: 2, vis: true, cat: 'Utilidade', mode: 'acao', text: 'Compre 2 cartas do baralho normal.' },
  { id: 'corrupcao', name: 'Corrupção', deck: 'luxo', copies: 1, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Compre 2 cartas do baralho de luxo e desça duas posições na trilha de prestígio. Só é possível se você puder descer as posições.' },
  { id: 'incendiar', name: 'Incendiar', deck: 'normal', copies: 2, vis: true, cat: 'Ataque', mode: 'acao', text: 'Dê esta carta de presente para um jogador no mesmo local que você; ela vai para o local de equipamento dele, descartando o que houver lá. Equipado: a cada rodada o jogador que possui essa carta deve descartar uma carta da mão.' },
  { id: 'negjusta', name: 'Negociação Justa', deck: 'normal', copies: 2, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Compre uma carta do baralho de luxo.' },
  { id: 'detetive', name: 'Contrato de Detetive', deck: 'normal', copies: 3, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Olhe a carta de um jogador. Com 3 cópias desta carta, você revela para todos a identidade de um jogador à sua escolha.' },
  { id: 'sabedoria', name: 'Sabedoria do Serafim', deck: 'normal', copies: 3, vis: true, cat: 'Utilidade', mode: 'acao', text: 'Revele a identidade de um jogador.' },
  { id: 'armadilha', name: 'Armadilha Explosiva', deck: 'normal', copies: 3, vis: false, cat: 'Ataque', mode: 'revelacao', text: 'Ao revelar: cause 1 de dano a todos nesse local.' },
  { id: 'barreira', name: 'Barreira Social', deck: 'normal', copies: 1, vis: false, cat: 'Utilidade', mode: 'revelacao', text: 'Ao revelar, enquanto essa carta estiver revelada no local, jogadores com prestígio médio ou baixo não podem entrar. (Se você estiver no lugar e seu prestígio mudar, você permanece, mas não pode retornar ao sair.)' },
  { id: 'escopeta', name: 'Tiro de Escopeta', deck: 'luxo', copies: 2, vis: false, cat: 'Ataque', mode: 'acao', text: 'Faça um jogador em uma área adjacente descartar uma carta ou faça um jogador na mesma área descartar duas cartas.' },
  { id: 'magia', name: 'Magia de Troca', deck: 'luxo', copies: 1, vis: false, cat: 'Movimento', mode: 'acao', text: 'Troque de lugar com qualquer jogador.' },
  { id: 'enganacao', name: 'Enganação', deck: 'normal', copies: 2, vis: false, cat: 'Ataque', mode: 'reacao', text: 'Quando um jogador interagir com você, use esta carta: o jogador em questão deve te entregar uma carta sem receber nada em troca.' },
  { id: 'extintor', name: 'Extintor de Incêndio', deck: 'normal', copies: 2, vis: false, cat: 'Defesa', mode: 'reacao', text: 'Cancele uma carta de Ataque usada em você.' },
  { id: 'conversa', name: 'Conversa Longa', deck: 'normal', copies: 3, vis: false, cat: 'Utilidade', mode: 'reacao', text: 'Ao interagir com um outro jogador, use essa carta. Durante essa interação ambos trocam uma carta a mais (pode acumular).' },
  { id: 'roubo', name: 'Roubo Caridoso', deck: 'normal', copies: 2, vis: false, cat: 'Ataque', mode: 'acao', text: 'O jogador de maior prestígio dá uma carta para o jogador de menor prestígio. (Global)' },
  { id: 'convocacao', name: 'Convocação', deck: 'normal', copies: 1, vis: false, cat: 'Movimento', mode: 'revelacao', text: 'Ao revelar, os jogadores são levados para o local da revelação até que a lotação seja atingida, por ordem de proximidade; em caso de empate o de menor prestígio é levado.' },
  { id: 'arma', name: 'Arma de Disparo', deck: 'normal', copies: 3, vis: false, cat: 'Ataque', mode: 'acao', text: 'Faça um jogador em uma área adjacente descartar uma carta.' },
  { id: 'cupula', name: 'Cúpula de Recuperação', deck: 'luxo', copies: 2, vis: false, cat: 'Utilidade', mode: 'equip', text: 'Equipado: você não pode se movimentar. Início do turno: compre uma carta do baralho normal.' },
  { id: 'aura', name: 'Aura do Serafim', deck: 'luxo', copies: 1, vis: true, cat: 'Ataque', mode: 'equip', text: 'Modo Serafim: Equipado: ao se mover para um local pela primeira vez no turno, todos os outros jogadores presentes nele descartam 2 cartas.' },
  { id: 'faca', name: 'Faca', deck: 'normal', copies: 3, vis: false, cat: 'Ataque', mode: 'equip', text: 'Equipado: Ação: um jogador no mesmo local descarta uma carta.' },
  { id: 'roupa', name: 'Roupa de Proteção', deck: 'normal', copies: 3, vis: false, cat: 'Defesa', mode: 'equip', text: 'Equipado: anula o efeito da próxima carta de ataque recebida.' },
  { id: 'amanhecer', name: 'Amanhecer Adiantado', deck: 'normal', copies: 2, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Escolha um local e revele todas as cartas de influência presentes nele.' },
  { id: 'vida', name: 'Vida Dividida', deck: 'luxo', copies: 1, vis: false, cat: 'Utilidade', mode: 'revelacao', text: 'Ao revelar: as mãos de todos os jogadores no local são embaralhadas juntas e distribuídas igualmente entre eles.' },
  { id: 'facacombate', name: 'Faca de Combate', deck: 'luxo', copies: 2, vis: false, cat: 'Ataque', mode: 'equip', text: 'Equipado: Ação: um jogador no mesmo local descarta duas cartas.' },
  { id: 'punicao', name: 'Punição do Serafim', deck: 'normal', copies: 2, vis: true, cat: 'Ataque', mode: 'acao', text: 'O jogador com maior prestígio, tirando você mesmo, descarta 2 cartas.' },
  { id: 'destruir', name: 'Destruir Propriedade', deck: 'normal', copies: 3, vis: false, cat: 'Ataque', mode: 'acao', text: 'Destrua o equipamento de um jogador à sua escolha.' },
  { id: 'reciclagem', name: 'Reciclagem', deck: 'normal', copies: 3, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Compre uma carta da pilha de descarte de cartas normais. Você escolhe.' },
  { id: 'tesouro', name: 'Tesouro do Outro', deck: 'normal', copies: 3, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Compre uma carta da pilha de descarte de Luxo. Você escolhe.' },
  { id: 'constricao', name: 'Constrição da Serpente de Fogo', deck: 'normal', copies: 2, vis: true, cat: 'Ataque', mode: 'acao', text: 'O alvo descarta uma carta e não pode se mover pelo seu próximo turno.' },
  { id: 'vestes', name: 'Vestes Luxuosas', deck: 'luxo', copies: 1, vis: false, cat: 'Utilidade', mode: 'equip', text: 'Equipado: início do turno: aumente uma posição na trilha de prestígio.' },
  { id: 'aumento', name: 'Aumento de Inventário', deck: 'luxo', copies: 2, vis: false, cat: 'Utilidade', mode: 'acao', text: 'Equipe um segundo equipamento sem descartar o primeiro. A carta a ser equipada deve estar na sua mão.' },
];

// open: D (dia) | N (noite) | 24 ; deck: normal | luxo | mercado
const LOCATIONS = [
  { id: 'ashton', name: 'Edifício Ashton', open: '24', cap: 4, cards: 3, deck: 'normal', text: 'Ponto de partida de todos. Todos são trazidos para cá quando o Artista revela o Modo Serafim.' },
  { id: 'hospital', name: 'Hospital', open: '24', cap: 1, cards: 3, deck: 'normal', text: 'Se tiver menos de 5 cartas na mão, pode Influenciar sem dar nada em troca. Fim de período: as cartas são repostas.' },
  { id: 'banco', name: 'Banco', open: 'D', cap: 2, cards: 2, deck: 'luxo', text: 'Para Influenciar é preciso ter prestígio Alto. Fechado à noite.' },
  { id: 'arena', name: 'Arena', open: '24', cap: 4, cards: 5, deck: 'normal', text: 'Sem função. É nas 5 cartas da Arena que acontecem as apostas do Cassino.' },
  { id: 'radio', name: 'Estação de Rádio', open: '24', cap: 2, cards: 3, deck: 'normal', text: 'Ação: interagir com qualquer jogador no tabuleiro, trocando uma carta com ele.' },
  { id: 'sede', name: 'Sede dos Mercenários', open: '24', cap: 2, cards: 3, deck: 'luxo', text: 'Ao usar uma carta de Ataque aqui, ela não é descartada: fica no local e você pega uma das cartas do local para a mão.' },
  { id: 'metro', name: 'Estação de Metrô', open: 'D', cap: 3, cards: 2, deck: 'normal', text: 'Ação: mover para qualquer local. Fechada à noite.' },
  { id: 'mercado', name: 'Mercado', open: '24', cap: 3, cards: 3, deck: 'mercado', text: 'Início de período: as cartas (exceto vislumbres) são trocadas — normais de dia, de luxo à noite. As cartas ficam sempre viradas para cima.' },
  { id: 'cassino', name: 'Cassino', open: 'N', cap: 4, cards: 2, deck: 'normal', text: 'Ação (noite): aposte de 0 a 5 no número de vislumbres revelados na Arena no amanhecer. Prêmio: 2 cartas +1 por outro apostador; cada carta em excesso é descartada e sobe seu prestígio. Apostas únicas. Fechado de dia.' },
];

// Mapa: 9 espaços. Os locais são sorteados nos espaços a cada partida.
// O Notion não define o grafo do tabuleiro; este é um mapa provisório (editável).
const SLOTS = [
  { x: 150, y: 110 }, { x: 450, y: 90 }, { x: 750, y: 110 },
  { x: 150, y: 330 }, { x: 450, y: 330 }, { x: 750, y: 330 },
  { x: 150, y: 550 }, { x: 450, y: 570 }, { x: 750, y: 550 },
];
// type: calcada | alameda | beco ; curve: deslocamento do arco para desenho
const PATHS = [
  [0, 1, 'calcada'], [1, 2, 'calcada'], [3, 4, 'calcada'], [4, 5, 'calcada'], [6, 7, 'calcada'], [7, 8, 'calcada'],
  [0, 3, 'calcada'], [3, 6, 'calcada'], [1, 4, 'calcada'], [4, 7, 'calcada'], [2, 5, 'calcada'], [5, 8, 'calcada'],
  [0, 2, 'alameda', -110], [6, 8, 'alameda', 105],
  [0, 6, 'beco', 150], [2, 8, 'beco', -150],
  [1, 3, 'beco', 0], [5, 7, 'beco', 0],
];

const ROUNDS = [
  { period: '1', dn: 'D' }, { period: '1', dn: 'D' },
  { period: '2', dn: 'N' }, { period: '2', dn: 'N' },
  { period: '3', dn: 'D' }, { period: '3', dn: 'D' },
  { period: '4', dn: 'N' }, { period: '4', dn: 'N' },
  { period: 'Final', dn: 'D' }, { period: 'Final', dn: 'N' }, { period: 'Final', dn: 'D' },
];

const RULES = {
  handLimit: 5,
  serafimHandLimit: 7,
  startingHand: 5,
  moveSteps: [2, 3, 3, 4], // por posição na Trilha de Movimento
  mdRevealedGoal: 15,
  citizenGlimpseGoal: 3,
  // X = locais influenciáveis - 2
  setupGlimpses: LOCATIONS.length - 2,
};

const ROLES = {
  artista: { name: 'Artista', win: ['Fim do Período Final: Mind Dealer eliminado e nenhum Cidadão com 3+ vislumbres.', 'Amanhecer: nenhuma carta de Vislumbre no tabuleiro.', 'Pode ativar o Modo Serafim nas transições de período.'] },
  minddealer: { name: 'Mind Dealer', win: ['Amanhecer: todos os locais com pelo menos um Vislumbre revelado.', 'Amanhecer: 15 Vislumbres revelados nos locais.', 'Chegar vivo ao fim do Período Final.', 'O Artista ser eliminado.'] },
  cidadao: { name: 'Cidadão', win: ['Fim do Período Final: estar vivo com 3+ vislumbres na mão (equipados contam).', 'Ter o Marcador de Confiança do Artista e estar vivo numa vitória do Artista.'] },
};

module.exports = { CARDS, LOCATIONS, SLOTS, PATHS, ROUNDS, RULES, ROLES };

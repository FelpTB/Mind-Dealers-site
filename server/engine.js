'use strict';
// Motor de regras do Mind Dealers.
// O fluxo do jogo é um gerador (main) que "pausa" (yield) sempre que precisa de uma decisão
// de jogador. Tudo que não é decisão é aplicado automaticamente.

const D = require('./data');
const CARD = {}; D.CARDS.forEach(c => { CARD[c.id] = c; });
const LOC = {}; D.LOCATIONS.forEach(l => { LOC[l.id] = l; });
const { RULES, ROUNDS, ROLES } = D;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

class GameOver { constructor(result) { this.result = result; } }

const LEVEL = pos => (pos === 1 ? 'Alto' : pos === 4 ? 'Baixo' : 'Médio');

class Game {
  constructor(names, seed) {
    if (names.length !== 4) throw new Error('Mind Dealers precisa de 4 jogadores');
    this.seed = seed != null ? seed : Math.floor(Math.random() * 1e9);
    this.rand = mulberry32(this.seed);
    this.players = names.map((name, i) => ({
      id: i, name, role: null, hand: [], equips: [], equipCap: 1, loc: null,
      alive: true, serafim: false, revealed: false, constricted: false, inbox: [],
    }));
    this.log = [];
    this.seq = 0;
    this.version = 0;
    this.pending = null;
    this.over = null;
    this.turn = null;
    this.turnError = null;
    this.bets = {};
    this.trust = null;
    this.round = 0;
    this.boardDn = 'D';
    this.moveTrack = [null, null, null, null];
    this.gen = this.main();
    this.step(undefined);
  }

  // ------------------------------------------------------------------ infra
  step(ans) {
    try {
      const r = this.gen.next(ans);
      if (!r.done) this.pending = { prompts: r.value.prompts, multi: !!r.value.multi, answers: {} };
      else this.pending = null;
    } catch (e) {
      if (e instanceof GameOver) this.finish(e.result);
      else { console.error(e); this.pub('⚠ Erro interno do motor: ' + e.message); this.pending = null; }
    }
    this.version++;
  }

  answer(pid, ans) {
    if (this.over) return 'A partida terminou.';
    if (!this.pending) return 'Nada pendente.';
    const pr = this.pending.prompts.find(p => p.pid === pid && !(pid in this.pending.answers));
    if (!pr) return 'Não há decisão sua pendente.';
    const err = pr.validate ? pr.validate(ans) : null;
    if (err) return err;
    if (this.pending.multi) {
      this.pending.answers[pid] = ans;
      if (this.pending.prompts.every(p => p.pid in this.pending.answers)) {
        const all = this.pending.answers; this.pending = null; this.step(all);
      } else this.version++;
    } else { this.pending = null; this.step(ans); }
    return null;
  }

  pub(text) { this.log.push({ seq: ++this.seq, text, to: null }); }
  priv(pid, text) { this.log.push({ seq: ++this.seq, text, to: pid }); }
  info(pid, title, uids, extra) {
    this.players[pid].inbox.push({ id: ++this.seq, title, cards: (uids || []).map(u => this.cardInfo(u)), text: extra || '' });
  }

  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  P(id) { return this.players[id]; }
  def(uid) { return CARD[this.cards[uid]]; }
  cardInfo(uid) { const d = this.def(uid); return { uid, id: d.id, name: d.name, text: d.text, deck: d.deck, vis: d.vis, cat: d.cat, mode: d.mode }; }
  cname(uid) { return this.def(uid).name; }
  alive() { return this.players.filter(p => p.alive); }
  hasEquip(p, id) { return p.equips.some(u => this.cards[u] === id); }
  handOf(p, id) { return p.hand.filter(u => this.cards[u] === id); }
  visCount(p) { return p.hand.concat(p.equips).filter(u => this.def(u).vis).length; }
  handLimit(p) { return p.serafim ? RULES.serafimHandLimit : RULES.handLimit; }
  locName(id) { return LOC[id].name; }

  // ---------------------------------------------------------------- prompts
  *ask(pid, kind, data, validate) {
    const a = yield { prompts: [Object.assign({ pid, kind }, data, { validate })] };
    return a;
  }
  *askOption(pid, text, options, extra) {
    const ok = options.filter(o => !o.disabled).map(o => o.id);
    return yield* this.ask(pid, 'option', Object.assign({ text, options }, extra || {}),
      a => (ok.includes(a) ? null : 'Opção inválida.'));
  }
  *askCards(pid, text, uids, min, max, extra) {
    const cards = uids.map(u => this.cardInfo(u));
    return yield* this.ask(pid, 'cards', Object.assign({ text, cards, min, max }, extra || {}), a => {
      if (!Array.isArray(a)) return 'Resposta inválida.';
      if (new Set(a).size !== a.length) return 'Carta repetida.';
      if (a.length < min || a.length > max) return `Escolha ${min === max ? min : min + ' a ' + max} carta(s).`;
      if (!a.every(u => uids.includes(u))) return 'Carta inválida.';
      return null;
    });
  }
  *askPlayer(pid, text, pids, cancel, extra) {
    const options = pids.map(id => ({ id: 'p' + id, label: this.P(id).name }));
    if (cancel) options.push({ id: 'cancel', label: (extra && extra.cancelLabel) || 'Cancelar' });
    const a = yield* this.askOption(pid, text, options, Object.assign({ sub: 'player' }, extra || {}));
    return a === 'cancel' ? null : Number(a.slice(1));
  }
  *askLocation(pid, text, locIds, cancel) {
    const options = locIds.map(id => ({ id: 'l:' + id, label: this.locName(id) }));
    if (cancel) options.push({ id: 'cancel', label: 'Cancelar' });
    const a = yield* this.askOption(pid, text, options, { sub: 'location', locs: locIds });
    return a === 'cancel' ? null : a.slice(2);
  }
  // escolher carta de um local (às cegas se virada para baixo)
  *askLocCard(pid, text, locId, cancel) {
    const L = this.locs[locId];
    const options = L.cards.map((c, i) => ({ id: 'i' + i, label: c.up ? this.cname(c.uid) : `Carta ${i + 1} (virada para baixo)`, card: c.up ? this.cardInfo(c.uid) : null }));
    if (cancel) options.push({ id: 'cancel', label: 'Cancelar' });
    const a = yield* this.askOption(pid, text, options, { sub: 'loccard' });
    return a === 'cancel' ? null : Number(a.slice(1));
  }

  // ---------------------------------------------------------------- setup
  setup() {
    this.uidSeq = 0; this.cards = {};
    const mk = id => { const u = 'c' + (++this.uidSeq); this.cards[u] = id; return u; };
    const normal = [], luxo = [];
    D.CARDS.forEach(c => { for (let i = 0; i < c.copies; i++) (c.deck === 'normal' ? normal : luxo).push(mk(c.id)); });
    this.shuffle(normal); this.shuffle(luxo);

    // locais nos espaços do mapa
    const ids = this.shuffle(D.LOCATIONS.map(l => l.id));
    this.slotLoc = ids;
    this.locs = {};
    ids.forEach((id, slot) => { this.locs[id] = { id, slot, cards: [] }; });
    this.adj = {}; ids.forEach(id => { this.adj[id] = []; });
    D.PATHS.forEach(([a, b, type]) => {
      this.adj[ids[a]].push({ to: ids[b], type });
      this.adj[ids[b]].push({ to: ids[a], type });
    });

    // baralho de influência (jogo começa de dia: Mercado recebe cartas normais)
    const deckFor = l => (l.deck === 'luxo' ? 'luxo' : 'normal');
    const need = { normal: 0, luxo: 0 };
    D.LOCATIONS.forEach(l => { need[deckFor(l)] += l.cards; });
    const take = (arr, pred, n) => { const out = []; for (let i = 0; i < arr.length && out.length < n;) { if (pred(arr[i])) out.push(arr.splice(i, 1)[0]); else i++; } return out; };
    const X = Math.min(RULES.setupGlimpses, need.normal);
    const vis = take(normal, u => this.def(u).vis, X);
    const infNormal = this.shuffle(vis.concat(take(normal, u => !this.def(u).vis, need.normal - vis.length)));
    const infLuxo = this.shuffle(take(luxo, u => !this.def(u).vis, need.luxo));
    ids.forEach(id => {
      const l = LOC[id]; const src = deckFor(l) === 'luxo' ? infLuxo : infNormal;
      for (let i = 0; i < l.cards; i++) this.locs[id].cards.push({ uid: src.pop(), up: true });
    });
    this.decks = { normal, luxo };
    this.discard = { normal: [], luxo: [] };

    const roles = this.shuffle(['artista', 'minddealer', 'cidadao', 'cidadao']);
    this.players.forEach((p, i) => { p.role = roles[i]; p.loc = 'ashton'; });
    this.prestige = this.shuffle(this.players.map(p => p.id));
    this.players.forEach(p => { for (let i = 0; i < RULES.startingHand; i++) this.giveDraw(p, 'normal', true); });

    this.pub(`Partida preparada (semente ${this.seed}). Locais sorteados, ${X} vislumbres distribuídos nos locais, 5 cartas para cada jogador, funções distribuídas.`);
    this.pub('Ordem de prestígio: ' + this.prestige.map((id, i) => `${i + 1}. ${this.P(id).name}`).join(', '));
    this.players.forEach(p => this.priv(p.id, `Sua função: ${ROLES[p.role].name}.`));
  }

  draw(deck) {
    if (!this.decks[deck].length && this.discard[deck].length) {
      this.decks[deck] = this.shuffle(this.discard[deck]); this.discard[deck] = [];
      this.pub(`Baralho ${deck === 'luxo' ? 'de luxo' : 'normal'} reembaralhado a partir do descarte.`);
    }
    return this.decks[deck].pop() || null;
  }
  giveDraw(p, deck, silent) {
    const u = this.draw(deck);
    if (!u) { this.pub(`Não há cartas no baralho ${deck}.`); return null; }
    p.hand.push(u);
    if (!silent) this.priv(p.id, `Você comprou: ${this.cname(u)}.`);
    return u;
  }
  toDiscard(uid) { this.discard[this.def(uid).deck].push(uid); }
  removeFromHand(p, uid) { const i = p.hand.indexOf(uid); if (i >= 0) p.hand.splice(i, 1); return i >= 0; }

  // ------------------------------------------------------------ prestígio
  pos(pid) { return this.prestige.indexOf(pid) + 1; }
  canUp(pid, n = 1) { return this.pos(pid) - n >= 1; }
  canDown(pid, n = 1) { return this.pos(pid) + n <= 4; }
  up(pid) {
    const i = this.prestige.indexOf(pid); if (i <= 0) return false;
    const other = this.prestige[i - 1];
    [this.prestige[i - 1], this.prestige[i]] = [pid, other];
    this.pub(`Prestígio: ${this.P(pid).name} sobe para ${i}, ${this.P(other).name} desce para ${i + 1}.`);
    return true;
  }
  down(pid) {
    const i = this.prestige.indexOf(pid); if (i >= 3) return false;
    const other = this.prestige[i + 1];
    [this.prestige[i + 1], this.prestige[i]] = [pid, other];
    this.pub(`Prestígio: ${this.P(pid).name} desce para ${i + 2}, ${this.P(other).name} sobe para ${i + 1}.`);
    return true;
  }
  topAlive(exceptId) { return this.prestige.find(id => this.P(id).alive && id !== exceptId); }
  bottomAlive() { return [...this.prestige].reverse().find(id => this.P(id).alive); }

  // ------------------------------------------------------------- locais
  isOpen(locId) { const o = LOC[locId].open; return o === '24' || o === this.boardDn; }
  playersAt(locId) { return this.alive().filter(p => p.loc === locId); }
  barrierUp(locId) { return this.locs[locId].cards.some(c => c.up && this.cards[c.uid] === 'barreira'); }
  enterReason(p, locId) {
    if (!this.isOpen(locId)) return `${this.locName(locId)} está fechado`;
    if (this.playersAt(locId).filter(o => o.id !== p.id).length >= LOC[locId].cap) return `${this.locName(locId)} está lotado`;
    if (this.barrierUp(locId) && this.pos(p.id) !== 1) return `Barreira Social: só prestígio Alto entra`;
    return null;
  }
  enterable(p, exceptCurrent = true) { return this.slotLoc.filter(id => (!exceptCurrent || id !== p.loc) && !this.enterReason(p, id)); }
  dist(a, b) {
    if (a === b) return 0;
    const seen = { [a]: 0 }; const q = [a];
    while (q.length) { const x = q.shift(); for (const e of this.adj[x]) if (!(e.to in seen)) { seen[e.to] = seen[x] + 1; if (e.to === b) return seen[e.to]; q.push(e.to); } }
    return 99;
  }
  adjacentTo(locId) { return [...new Set(this.adj[locId].map(e => e.to))]; }

  *enterLocation(p, locId, byMove) {
    p.loc = locId;
    this.pub(`${p.name} entrou em ${this.locName(locId)}.`);
    const L = this.locs[locId];
    if (!p.serafim && L.cards.some(c => c.active && this.cards[c.uid] === 'explosao')) {
      this.pub(`Explosão Celestial atinge ${p.name}!`);
      yield* this.damage(p.id, 3, 'Explosão Celestial');
    }
    if (byMove && p.alive && p.serafim && this.hasEquip(p, 'aura') && this.turn && this.turn.pid === p.id && !this.turn.auraUsed) {
      this.turn.auraUsed = true;
      for (const o of this.playersAt(locId).filter(o => o.id !== p.id)) {
        this.pub(`Aura do Serafim atinge ${o.name}.`);
        yield* this.damage(o.id, 2, 'Aura do Serafim');
      }
    }
  }

  // ----------------------------------------------------- dano / eliminação
  *damage(pid, n, reason) {
    const p = this.P(pid);
    if (!p.alive || n <= 0) return;
    let left = n;
    if (this.hasEquip(p, 'plotarmor')) {
      while (left > 0 && this.canDown(pid)) {
        const a = yield* this.askOption(pid, `${reason}: você deve descartar ${left} carta(s). Plot Armor: descer 1 posição de prestígio em vez de descartar 1 carta?`,
          [{ id: 'sim', label: 'Descer prestígio' }, { id: 'nao', label: 'Descartar cartas' }]);
        if (a !== 'sim') break;
        this.down(pid); left--;
        this.pub(`${p.name} usou Plot Armor (desceu prestígio em vez de descartar).`);
      }
    }
    if (left > 0 && p.hand.length) {
      let chosen;
      if (p.hand.length <= left) chosen = [...p.hand];
      else chosen = yield* this.askCards(pid, `${reason}: escolha ${left} carta(s) para descartar.`, p.hand, left, left);
      chosen.forEach(u => { this.removeFromHand(p, u); this.toDiscard(u); });
      this.pub(`${p.name} descartou ${chosen.length} carta(s) (${reason}): ${chosen.map(u => this.cname(u)).join(', ')}.`);
    }
    yield* this.checkElim(pid);
  }

  *checkElim(pid) {
    const p = this.P(pid);
    if (!p.alive || p.hand.length > 0) return;
    p.alive = false;
    p.equips.forEach(u => this.toDiscard(u)); p.equips = [];
    p.loc = null;
    if (this.trust === pid) this.trust = null;
    if (p.role === 'artista') {
      p.revealed = true;
      this.pub(`☠ ${p.name} foi eliminado(a) e era o ARTISTA!`);
      throw new GameOver({ winners: this.players.filter(x => x.role === 'minddealer').map(x => x.id), reason: 'O Artista foi eliminado: vitória do Mind Dealer.' });
    }
    this.pub(`☠ ${p.name} foi eliminado(a) (sem cartas na mão). A função permanece oculta.`);
  }

  *enforceLimit(pid) {
    const p = this.P(pid);
    const lim = this.handLimit(p);
    if (!p.alive || p.hand.length <= lim) return;
    const n = p.hand.length - lim;
    const chosen = yield* this.askCards(pid, `Limite de mão (${lim}): descarte ${n} carta(s).`, p.hand, n, n);
    chosen.forEach(u => { this.removeFromHand(p, u); this.toDiscard(u); });
    this.pub(`${p.name} descartou ${n} carta(s) por limite de mão.`);
  }

  *sweep() {
    for (const id of this.prestige) {
      const p = this.P(id);
      if (!p.alive) continue;
      yield* this.enforceLimit(id);
      yield* this.checkElim(id);
    }
  }

  revealRole(pid, by) {
    const p = this.P(pid);
    p.revealed = true;
    this.pub(`🔎 ${by ? by + ' revelou: ' : ''}${p.name} é ${ROLES[p.role].name}!`);
  }

  // ------------------------------------------------------------- fluxo
  *main() {
    this.setup();
    while (true) {
      yield* this.orderPhase();
      for (const pid of this.moveTrack.filter(x => x != null)) {
        if (this.P(pid).alive) yield* this.playTurn(pid);
      }
      if (this.round >= ROUNDS.length - 1) break;
      const cur = ROUNDS[this.round];
      this.round++;
      const next = ROUNDS[this.round];
      this.pub(`— Fim da rodada. Início da Rodada ${this.round + 1} (Período ${next.period}, ${next.dn === 'D' ? 'Dia' : 'Noite'}).`);
      if (cur.period !== next.period || cur.dn !== next.dn) yield* this.transition(cur, next);
    }
    this.finalEvaluation();
  }

  *orderPhase() {
    this.moveTrack = [null, null, null, null];
    const order = this.prestige.filter(id => this.P(id).alive);
    const free = () => [0, 1, 2, 3].filter(i => this.moveTrack[i] == null);
    const posOpts = () => free().map(i => ({ id: 'pos' + i, label: `Posição ${i + 1} — ${RULES.moveSteps[i]} passos` }));
    this.pub('Definição da ordem de turno (Trilha de Movimento).');
    for (let k = 0; k < order.length; k++) {
      const pid = order[k];
      if (this.moveTrack.includes(pid)) continue;
      const opts = posOpts();
      const unplacedOthers = order.filter(o => o !== pid && !this.moveTrack.includes(o));
      if (k === 0 && this.canDown(pid) && unplacedOthers.length) opts.push({ id: 'manip', label: 'Manipular: descer 1 de prestígio e definir a posição de outro jogador' });
      let a = yield* this.askOption(pid, 'Escolha sua posição na Trilha de Movimento (posições menores jogam antes, com menos passos).', opts, { sub: 'order' });
      if (a === 'manip') {
        this.down(pid);
        const tgt = yield* this.askPlayer(pid, 'Manipular: qual jogador você vai posicionar?', unplacedOthers, false);
        const pa = yield* this.askOption(pid, `Manipular: posição de ${this.P(tgt).name}`, posOpts(), { sub: 'order' });
        this.moveTrack[Number(pa.slice(3))] = tgt;
        this.pub(`${this.P(pid).name} manipulou: ${this.P(tgt).name} vai para a posição ${Number(pa.slice(3)) + 1}.`);
        a = yield* this.askOption(pid, 'Agora escolha a sua posição.', posOpts(), { sub: 'order' });
      }
      const i = Number(a.slice(3));
      this.moveTrack[i] = pid;
      this.pub(`${this.P(pid).name} ficou na posição ${i + 1} da Trilha de Movimento.`);
    }
  }

  *playTurn(pid) {
    const p = this.P(pid);
    const idx = this.moveTrack.indexOf(pid);
    this.turn = { pid, actions: 2, steps: RULES.moveSteps[idx], auraUsed: false };
    this.turnError = null;
    this.pub(`▶ Turno de ${p.name} (${this.turn.steps} passos).`);
    if (p.constricted) { this.turn.steps = 0; p.constricted = false; this.pub(`${p.name} está preso pela Constrição e não pode se mover neste turno.`); }
    if (this.hasEquip(p, 'cupula')) this.turn.steps = 0;

    if (this.hasEquip(p, 'incendiar')) { this.pub(`Incendiar queima ${p.name}.`); yield* this.damage(pid, 1, 'Incendiar'); }
    if (p.alive && this.hasEquip(p, 'cupula')) { this.giveDraw(p, 'normal'); this.pub(`${p.name} comprou 1 carta (Cúpula de Recuperação).`); yield* this.enforceLimit(pid); }
    if (p.alive && this.hasEquip(p, 'vestes') && this.canUp(pid)) this.up(pid);
    const surto = p.alive && this.handOf(p, 'surto')[0];
    if (surto) {
      const a = yield* this.askOption(pid, 'Início do turno: revelar Surto de Produtividade? (3 ações neste turno, sem gastar ação)',
        [{ id: 'sim', label: 'Revelar e usar' }, { id: 'nao', label: 'Não usar' }], { card: this.cardInfo(surto) });
      if (a === 'sim') {
        this.removeFromHand(p, surto); this.toDiscard(surto); this.turn.actions = 3;
        this.pub(`${p.name} revelou Surto de Produtividade: 3 ações neste turno.`);
        yield* this.checkElim(pid);
      }
    }
    while (p.alive && !this.over) {
      const ans = yield* this.ask(pid, 'turn', { text: 'Seu turno' }, a => (a && typeof a.type === 'string' ? null : 'Ação inválida.'));
      this.turnError = null;
      if (ans.type === 'end') break;
      const err = yield* this.doTurnAction(p, ans);
      if (err) this.turnError = err;
      yield* this.sweep();
    }
    if (p.alive) this.pub(`${p.name} encerrou o turno.`);
    this.turn = null;
  }

  // opções do turno (também usadas pela interface)
  turnOptions(p) {
    const t = this.turn; if (!t || t.pid !== p.id) return null;
    const here = this.locs[p.loc];
    const open = this.isOpen(p.loc);
    const act = t.actions > 0;
    const closedMsg = `${this.locName(p.loc)} está fechado: só é possível Influenciar`;
    const noAct = 'Sem ações restantes';
    const r = { actions: t.actions, steps: t.steps, error: this.turnError };
    r.moves = this.adj[p.loc].map(e => {
      let reason = null;
      if (t.steps < 1) reason = this.hasEquip(p, 'cupula') ? 'Cúpula de Recuperação: não pode se mover' : 'Sem passos';
      else if (e.type === 'alameda' && !this.canDown(p.id)) reason = 'Alameda exige descer prestígio (você está na posição 4)';
      else reason = this.enterReason(p, e.to);
      const note = e.type === 'alameda' ? 'desce 1 de prestígio' : e.type === 'beco' ? (this.pos(p.id) <= 3 ? 'descarta 1 carta' : 'sem custo (prestígio baixo)') : '';
      return { to: e.to, name: this.locName(e.to), type: e.type, note, reason };
    });
    let infReason = !act ? noAct : !here.cards.length ? 'Local sem cartas' : (p.loc === 'banco' && this.pos(p.id) !== 1) ? 'Banco: exige prestígio Alto' : null;
    r.influence = { reason: infReason, free: p.loc === 'hospital' && p.hand.length < 5, cards: this.locView(p.loc).cards };
    const others = this.playersAt(p.loc).filter(o => o.id !== p.id);
    r.interact = { reason: !act ? noAct : !open ? closedMsg : !others.length ? 'Ninguém neste local' : !p.hand.length ? 'Sem cartas' : null, targets: others.map(o => o.id) };
    r.cards = p.hand.map(u => {
      const d = this.def(u);
      let use = null, equip = null;
      if (d.mode === 'acao') use = !act ? noAct : !open ? closedMsg : this.useReason(p, u);
      else use = d.mode === 'reacao' ? 'Reação: usada em resposta' : d.mode === 'revelacao' ? 'Revelação: coloque num local com Influenciar' : 'Equipamento: use Equipar';
      if (d.id === 'surto') use = 'Só no início do turno';
      equip = d.mode !== 'equip' ? 'Não é equipamento' : !act ? noAct : !open ? closedMsg : null;
      return { uid: u, use, equip };
    });
    // ação de local
    const la = { metro: 'Mover para qualquer local', radio: 'Interagir com qualquer jogador', cassino: 'Apostar' }[p.loc];
    if (la) {
      let reason = !act ? noAct : !open ? closedMsg : null;
      if (!reason && p.loc === 'cassino') reason = this.bets[p.id] != null ? 'Você já apostou' : !this.freeBets().length ? 'Sem apostas livres' : null;
      if (!reason && p.loc === 'radio' && !this.alive().some(o => o.id !== p.id)) reason = 'Ninguém para interagir';
      if (!reason && p.loc === 'radio' && !p.hand.length) reason = 'Sem cartas';
      if (!reason && p.loc === 'metro' && !this.enterable(p).length) reason = 'Nenhum destino disponível';
      r.location = { label: la, reason };
    }
    r.equipActions = p.equips.filter(u => ['faca', 'facacombate'].includes(this.cards[u])).map(u => ({
      uid: u, name: this.cname(u), reason: !act ? noAct : !open ? closedMsg : !others.length ? 'Ninguém neste local' : null,
    }));
    return r;
  }

  freeBets() { const used = Object.values(this.bets); return [0, 1, 2, 3, 4, 5].filter(v => !used.includes(v)); }

  *doTurnAction(p, a) {
    const t = this.turn;
    const opts = this.turnOptions(p);
    if (a.type === 'move') {
      const m = opts.moves.find(x => x.to === a.to);
      if (!m) return 'Destino não adjacente.';
      if (m.reason) return m.reason;
      t.steps--;
      if (m.type === 'alameda') { this.pub(`${p.name} atravessou uma Alameda.`); this.down(p.id); }
      if (m.type === 'beco' && this.pos(p.id) <= 3) { this.pub(`${p.name} atravessou um Beco.`); yield* this.damage(p.id, 1, 'Beco'); if (!p.alive) return null; }
      yield* this.enterLocation(p, a.to, true);
      return null;
    }
    if (a.type === 'influence') {
      if (opts.influence.reason) return opts.influence.reason;
      if (a.free) {
        if (!opts.influence.free) return 'Influência sem troca só no Hospital com menos de 5 cartas.';
        const i = Number(a.take);
        if (!(i >= 0 && i < this.locs[p.loc].cards.length)) return 'Carta do local inválida.';
        t.actions--;
        const c = this.locs[p.loc].cards.splice(i, 1)[0];
        p.hand.push(c.uid);
        this.pub(`${p.name} pegou uma carta do Hospital sem troca${c.up ? ` (${this.cname(c.uid)})` : ''}.`);
        this.priv(p.id, `Você pegou: ${this.cname(c.uid)}.`);
        return null;
      }
      if (!p.hand.includes(a.give)) return 'Escolha uma carta da mão para dar.';
      const i = Number(a.take);
      if (!(i >= 0 && i < this.locs[p.loc].cards.length)) return 'Escolha uma carta do local.';
      t.actions--;
      this.influence(p, p.loc, a.give, i);
      return null;
    }
    if (a.type === 'interact') {
      if (opts.interact.reason) return opts.interact.reason;
      const tgt = Number(a.target);
      if (!opts.interact.targets.includes(tgt)) return 'Alvo inválido.';
      t.actions--;
      yield* this.interact(p, this.P(tgt), false);
      return null;
    }
    if (a.type === 'useCard') {
      const c = opts.cards.find(x => x.uid === a.uid);
      if (!c) return 'Carta não está na mão.';
      if (c.use) return c.use;
      return yield* this.useCard(p, a.uid);
    }
    if (a.type === 'equip') {
      const c = opts.cards.find(x => x.uid === a.uid);
      if (!c) return 'Carta não está na mão.';
      if (c.equip) return c.equip;
      t.actions--;
      this.removeFromHand(p, a.uid);
      yield* this.equip(p, a.uid);
      return null;
    }
    if (a.type === 'location') {
      if (!opts.location) return 'Este local não tem ação.';
      if (opts.location.reason) return opts.location.reason;
      if (p.loc === 'metro') {
        const to = yield* this.askLocation(p.id, 'Metrô: para onde ir?', this.enterable(p), true);
        if (!to) return null;
        t.actions--;
        this.pub(`${p.name} usou o Metrô.`);
        yield* this.enterLocation(p, to, true);
      } else if (p.loc === 'radio') {
        const tgt = yield* this.askPlayer(p.id, 'Rádio: interagir com quem?', this.alive().filter(o => o.id !== p.id).map(o => o.id), true);
        if (tgt == null) return null;
        t.actions--;
        this.pub(`${p.name} usou a Estação de Rádio.`);
        yield* this.interact(p, this.P(tgt), true);
      } else if (p.loc === 'cassino') {
        const opts2 = this.freeBets().map(v => ({ id: 'b' + v, label: `${v} vislumbre(s)` }));
        opts2.push({ id: 'cancel', label: 'Cancelar' });
        const b = yield* this.askOption(p.id, 'Cassino: aposte quantos vislumbres serão revelados na Arena no próximo amanhecer.', opts2);
        if (b === 'cancel') return null;
        t.actions--;
        this.bets[p.id] = Number(b.slice(1));
        this.pub(`${p.name} fez uma aposta secreta no Cassino.`);
        this.priv(p.id, `Sua aposta: ${this.bets[p.id]}.`);
      }
      return null;
    }
    if (a.type === 'equipAction') {
      const e = opts.equipActions.find(x => x.uid === a.uid);
      if (!e) return 'Equipamento inválido.';
      if (e.reason) return e.reason;
      const n = this.cards[a.uid] === 'faca' ? 1 : 2;
      const tgt = yield* this.askPlayer(p.id, `${e.name}: qual jogador neste local descarta ${n}?`, this.playersAt(p.loc).filter(o => o.id !== p.id).map(o => o.id), true);
      if (tgt == null) return null;
      t.actions--;
      this.pub(`${p.name} usou ${e.name} contra ${this.P(tgt).name}.`);
      yield* this.targeted(p, this.def(a.uid), tgt, true, function* (tid) { yield* this.damage(tid, n, e.name); });
      return null;
    }
    return 'Ação desconhecida.';
  }

  // troca de carta com local
  influence(p, locId, giveUid, takeIdx) {
    const L = this.locs[locId];
    const taken = L.cards[takeIdx];
    this.removeFromHand(p, giveUid);
    const placedUp = locId === 'mercado' || this.boardDn === 'D';
    const slot = { uid: giveUid, up: placedUp };
    if (this.cards[giveUid] === 'explosao' && p.serafim) { slot.up = true; slot.active = true; }
    L.cards[takeIdx] = slot;
    p.hand.push(taken.uid);
    const gaveTxt = slot.up ? ` deixou ${this.cname(giveUid)}` : ' deixou uma carta virada para baixo';
    const tookTxt = taken.up ? ` e pegou ${this.cname(taken.uid)}` : ' e pegou uma carta virada para baixo';
    this.pub(`${p.name} influenciou ${this.locName(locId)}:${gaveTxt}${tookTxt}.`);
    this.priv(p.id, `Você deu ${this.cname(giveUid)} e pegou ${this.cname(taken.uid)}.`);
    if (slot.active) this.pub('A Explosão Celestial está ativa neste local!');
  }

  *interact(p, tgt, radio) {
    this.pub(`${p.name} interagiu com ${tgt.name}${radio ? ' (via Rádio)' : ''}.`);
    let extra = 0;
    const myConv = this.handOf(p, 'conversa');
    if (myConv.length && p.hand.length > 1) {
      const opts = [{ id: 'n0', label: 'Não usar' }];
      for (let k = 1; k <= myConv.length; k++) opts.push({ id: 'n' + k, label: `Usar ${k} Conversa Longa (+${k} troca)` });
      const a = yield* this.askOption(p.id, 'Usar Conversa Longa nesta interação?', opts);
      const k = Number(a.slice(1));
      for (let i = 0; i < k; i++) { const u = myConv[i]; this.removeFromHand(p, u); this.toDiscard(u); }
      if (k) { extra += k; this.pub(`${p.name} usou ${k} Conversa Longa.`); }
    }
    let enganado = false;
    const tConv = this.handOf(tgt, 'conversa'), tEng = this.handOf(tgt, 'enganacao');
    if (tConv.length || tEng.length) {
      const opts = [{ id: 'nada', label: 'Não reagir' }];
      if (tEng.length) opts.push({ id: 'eng', label: 'Enganação (receber sem devolver)' });
      for (let k = 1; k <= tConv.length; k++) opts.push({ id: 'c' + k, label: `Usar ${k} Conversa Longa (+${k} troca)` });
      const a = yield* this.askOption(tgt.id, `${p.name} está interagindo com você. Usar reação?`, opts);
      if (a === 'eng') { const u = tEng[0]; this.removeFromHand(tgt, u); this.toDiscard(u); enganado = true; this.pub(`${tgt.name} usou Enganação!`); }
      else if (a[0] === 'c') { const k = Number(a.slice(1)); for (let i = 0; i < k; i++) { this.removeFromHand(tgt, tConv[i]); this.toDiscard(tConv[i]); } extra += k; this.pub(`${tgt.name} usou ${k} Conversa Longa.`); }
    }
    const n = 1 + extra;
    const nGive = Math.min(n, p.hand.length);
    let give = [];
    if (nGive > 0) give = yield* this.askCards(p.id, `Escolha ${nGive} carta(s) para dar a ${tgt.name}.`, p.hand, nGive, nGive);
    let back = [];
    if (!enganado) {
      const nBack = Math.min(n, tgt.hand.length);
      if (nBack > 0) back = yield* this.askCards(tgt.id, `Interação com ${p.name}: escolha ${nBack} carta(s) para devolver.`, tgt.hand, nBack, nBack);
    }
    give.forEach(u => { this.removeFromHand(p, u); tgt.hand.push(u); });
    back.forEach(u => { this.removeFromHand(tgt, u); p.hand.push(u); });
    this.pub(`Troca concluída: ${p.name} deu ${give.length} e recebeu ${back.length} carta(s).`);
    if (give.length) this.priv(tgt.id, `Você recebeu de ${p.name}: ${give.map(u => this.cname(u)).join(', ')}.`);
    if (back.length) this.priv(p.id, `Você recebeu de ${tgt.name}: ${back.map(u => this.cname(u)).join(', ')}.`);
    yield* this.enforceLimit(tgt.id);
    yield* this.enforceLimit(p.id);
    yield* this.checkElim(tgt.id);
    yield* this.checkElim(p.id);
  }

  *equip(p, uid, forceSecond) {
    if (forceSecond) p.equipCap = Math.max(p.equipCap, 2);
    if (p.equips.length >= p.equipCap) {
      const all = p.equips.concat([uid]);
      const opts = all.map(u => ({ id: u, label: `Descartar ${this.cname(u)}`, card: this.cardInfo(u) }));
      const d = yield* this.askOption(p.id, 'Espaço de equipamento cheio: qual carta descartar?', opts);
      if (d === uid) { this.toDiscard(uid); this.pub(`${p.name} descartou ${this.cname(uid)} em vez de equipar.`); yield* this.checkElim(p.id); return; }
      p.equips.splice(p.equips.indexOf(d), 1); this.toDiscard(d);
      this.pub(`${p.name} descartou o equipamento ${this.cname(d)}.`);
    }
    p.equips.push(uid);
    this.pub(`${p.name} equipou ${this.cname(uid)}.`);
    yield* this.checkElim(p.id);
  }

  // ---------------------------------------------------------- cartas
  useReason(p, uid) {
    const d = this.def(uid);
    if (d.vis && !p.serafim) return 'Efeito de Modo Serafim';
    const others = this.alive().filter(o => o.id !== p.id);
    const same = others.filter(o => o.loc === p.loc);
    const adj = others.filter(o => this.adjacentTo(p.loc).includes(o.loc));
    switch (d.id) {
      case 'reputacao': return this.canUp(p.id) ? null : 'Você já tem o maior prestígio';
      case 'corrupcao': return this.canDown(p.id, 2) ? null : 'Precisa poder descer 2 posições';
      case 'espiadinha': case 'olhar': return others.some(o => o.hand.length) ? null : 'Ninguém com cartas';
      case 'maoleve': return same.some(o => o.hand.length) ? null : 'Ninguém com cartas neste local';
      case 'incendiar': return same.length ? null : 'Ninguém neste local';
      case 'arma': return adj.length ? null : 'Ninguém em local adjacente';
      case 'escopeta': return adj.length || same.length ? null : 'Ninguém no mesmo local ou adjacente';
      case 'destruir': return this.alive().some(o => o.equips.length) ? null : 'Ninguém tem equipamento';
      case 'reciclagem': return this.discard.normal.length ? null : 'Descarte normal vazio';
      case 'tesouro': return this.discard.luxo.length ? null : 'Descarte de luxo vazio';
      case 'transmitir': return p.hand.length >= 2 ? null : 'Precisa de outra carta para trocar';
      case 'aumento': return p.hand.some(u => u !== uid && this.def(u).mode === 'equip') ? null : 'Sem equipamento na mão';
      case 'passeio': case 'voo': return this.enterable(p).length ? null : 'Nenhum destino disponível';
      case 'roubo': { const a = this.topAlive(), b = this.bottomAlive(); return a !== b ? null : 'Sem doador/recebedor'; }
      case 'punicao': return this.topAlive(p.id) != null ? null : 'Sem alvo';
      default: return others.length || ['negociacao', 'repouso', 'negjusta', 'amanhecer', 'teletransporte'].includes(d.id) ? null : 'Sem alvo';
    }
  }

  // tira a carta da mão, gasta a ação e decide se vai ao descarte (ou fica de lado na Sede)
  commit(ctx) {
    const { p, uid, d } = ctx;
    this.removeFromHand(p, uid);
    this.turn.actions--;
    ctx.sede = d.cat === 'Ataque' && p.loc === 'sede' && this.isOpen('sede') && !ctx.keep;
    if (!ctx.sede && !ctx.keep) this.toDiscard(uid);
    this.pub(`${p.name} usou ${d.name}.`);
  }

  *useCard(p, uid) {
    const d = this.def(uid);
    const ctx = { p, uid, d, sede: false, keep: false };
    const others = () => this.alive().filter(o => o.id !== p.id).map(o => o.id);
    const self = this;
    switch (d.id) {
      case 'reputacao': this.commit(ctx); this.up(p.id); break;
      case 'negociacao': case 'repouso': this.commit(ctx); this.giveDraw(p, 'normal'); this.giveDraw(p, 'normal'); this.pub(`${p.name} comprou 2 cartas normais.`); break;
      case 'negjusta': this.commit(ctx); this.giveDraw(p, 'luxo'); this.pub(`${p.name} comprou 1 carta de luxo.`); break;
      case 'corrupcao': this.commit(ctx); this.giveDraw(p, 'luxo'); this.giveDraw(p, 'luxo'); this.down(p.id); this.down(p.id); this.pub(`${p.name} comprou 2 cartas de luxo.`); break;
      case 'reciclagem': case 'tesouro': {
        const pile = this.discard[d.id === 'reciclagem' ? 'normal' : 'luxo'];
        const opts = pile.map(u => ({ id: u, label: this.cname(u), card: this.cardInfo(u) }));
        opts.push({ id: 'cancel', label: 'Cancelar' });
        const pick = yield* this.askOption(p.id, `${d.name}: escolha uma carta do descarte.`, opts, { sub: 'pile' });
        if (pick === 'cancel') return null;
        this.commit(ctx);
        pile.splice(pile.indexOf(pick), 1); p.hand.push(pick);
        this.pub(`${p.name} pegou ${this.cname(pick)} do descarte.`);
        break;
      }
      case 'passeio': {
        const to = yield* this.askLocation(p.id, 'Passeio de Carro: para onde ir?', this.enterable(p), true);
        if (!to) return null;
        this.commit(ctx); yield* this.enterLocation(p, to, false); break;
      }
      case 'voo': {
        const to = yield* this.askLocation(p.id, 'Voo do Serafim: para onde voar?', this.enterable(p), true);
        if (!to) return null;
        this.commit(ctx);
        const victims = this.playersAt(to).filter(o => o.id !== p.id);
        yield* this.enterLocation(p, to, false);
        for (const v of victims) yield* this.damage(v.id, 1, 'Voo do Serafim');
        break;
      }
      case 'teletransporte': {
        const tgt = yield* this.askPlayer(p.id, 'Teletransporte: mover qual jogador?', this.alive().map(o => o.id), true);
        if (tgt == null) return null;
        const to = yield* this.askLocation(p.id, `Teletransporte: para onde mover ${this.P(tgt).name}?`, this.enterable(this.P(tgt)), true);
        if (!to) return null;
        this.commit(ctx);
        yield* this.targeted(p, d, tgt, false, function* (tid) {
          const tp = self.P(tid);
          if (self.enterReason(tp, to) && tp.loc !== to) { self.pub(`${tp.name} não pode ser levado para ${self.locName(to)}.`); return; }
          yield* self.enterLocation(tp, to, false);
        });
        break;
      }
      case 'magia': {
        const tgt = yield* this.askPlayer(p.id, 'Magia de Troca: trocar de lugar com quem?', others(), true);
        if (tgt == null) return null;
        this.commit(ctx);
        yield* this.targeted(p, d, tgt, false, function* (tid) {
          if (tid === p.id) return;
          const tp = self.P(tid); const a = p.loc, b = tp.loc;
          self.pub(`${p.name} e ${tp.name} trocam de lugar.`);
          yield* self.enterLocation(p, b, false);
          if (tp.alive) yield* self.enterLocation(tp, a, false);
        });
        break;
      }
      case 'olhar': case 'espiadinha': case 'detetive': {
        let reveal = false;
        if (d.id === 'detetive' && this.handOf(p, 'detetive').length >= 3) {
          const m = yield* this.askOption(p.id, 'Contrato de Detetive: você tem 3 cópias.', [
            { id: 'olhar', label: 'Olhar uma carta (usa 1 cópia)' }, { id: 'revelar', label: 'Revelar a identidade de um jogador (usa 3 cópias)' }, { id: 'cancel', label: 'Cancelar' }]);
          if (m === 'cancel') return null;
          reveal = m === 'revelar';
        }
        const cands = reveal ? others() : others().filter(id => this.P(id).hand.length);
        const tgt = yield* this.askPlayer(p.id, reveal ? 'Revelar a identidade de quem?' : `${d.name}: alvo?`, cands, true);
        if (tgt == null) return null;
        this.commit(ctx);
        if (reveal) {
          this.handOf(p, 'detetive').slice(0, 2).forEach(u => { this.removeFromHand(p, u); this.toDiscard(u); });
          yield* this.targeted(p, d, tgt, false, function* (tid) { self.revealRole(tid, p.name + ' (Contrato de Detetive)'); });
          break;
        }
        yield* this.targeted(p, d, tgt, false, function* (tid) {
          const tp = self.P(tid);
          if (!tp.hand.length) return;
          if (d.id === 'olhar') { self.info(p.id, `Mão de ${tp.name}`, tp.hand); self.pub(`${p.name} viu a mão de ${tp.name}.`); return; }
          const opts = tp.hand.map((u, i) => ({ id: 'i' + i, label: `Carta ${i + 1}` }));
          const pick = yield* self.askOption(p.id, `Escolha uma carta (às cegas) da mão de ${tp.name}.`, opts);
          const u = tp.hand[Number(pick.slice(1))];
          self.info(p.id, `Carta de ${tp.name}`, [u]);
          self.pub(`${p.name} viu uma carta de ${tp.name}.`);
        });
        break;
      }
      case 'sabedoria': {
        const tgt = yield* this.askPlayer(p.id, 'Sabedoria do Serafim: revelar a identidade de quem?', others(), true);
        if (tgt == null) return null;
        this.commit(ctx);
        yield* this.targeted(p, d, tgt, false, function* (tid) { self.revealRole(tid, p.name); });
        break;
      }
      case 'maoleve': {
        const tgt = yield* this.askPlayer(p.id, 'Mão Leve: roubar de quem (mesmo local)?', this.playersAt(p.loc).filter(o => o.id !== p.id && o.hand.length).map(o => o.id), true);
        if (tgt == null) return null;
        this.commit(ctx);
        yield* this.targeted(p, d, tgt, true, function* (tid) {
          if (tid === p.id) return;
          const tp = self.P(tid); if (!tp.hand.length) return;
          const u = tp.hand[Math.floor(self.rand() * tp.hand.length)];
          self.removeFromHand(tp, u); p.hand.push(u);
          self.pub(`${p.name} roubou uma carta de ${tp.name}.`);
          self.priv(p.id, `Você roubou: ${self.cname(u)}.`); self.priv(tid, `Roubaram de você: ${self.cname(u)}.`);
          yield* self.checkElim(tid);
        });
        break;
      }
      case 'sacrificio': {
        const tgt = yield* this.askPlayer(p.id, 'Sacrifício: alvo?', others(), true);
        if (tgt == null) return null;
        this.commit(ctx);
        yield* this.targeted(p, d, tgt, true, function* (tid, reflected) {
          if (reflected) { yield* self.damage(p.id, 3, 'Sacrifício refletido'); return; }
          yield* self.damage(tid, 2, 'Sacrifício');
          yield* self.damage(p.id, 1, 'Sacrifício (custo)');
        });
        break;
      }
      case 'arma': case 'escopeta': {
        const adj = this.adjacentTo(p.loc);
        const cands = this.alive().filter(o => o.id !== p.id && (adj.includes(o.loc) || (d.id === 'escopeta' && o.loc === p.loc))).map(o => o.id);
        const tgt = yield* this.askPlayer(p.id, d.id === 'arma' ? 'Arma de Disparo: alvo em local adjacente?' : 'Tiro de Escopeta: alvo (adjacente: 1 carta; mesmo local: 2 cartas)?', cands, true);
        if (tgt == null) return null;
        const n = d.id === 'escopeta' && this.P(tgt).loc === p.loc ? 2 : 1;
        this.commit(ctx);
        yield* this.targeted(p, d, tgt, true, function* (tid) { yield* self.damage(tid, n, d.name); });
        break;
      }
      case 'constricao': {
        const tgt = yield* this.askPlayer(p.id, 'Constrição da Serpente de Fogo: alvo?', others(), true);
        if (tgt == null) return null;
        this.commit(ctx);
        yield* this.targeted(p, d, tgt, true, function* (tid) {
          yield* self.damage(tid, 1, d.name);
          if (self.P(tid).alive) { self.P(tid).constricted = true; self.pub(`${self.P(tid).name} não poderá se mover no próximo turno.`); }
        });
        break;
      }
      case 'punicao': {
        const tgt = this.topAlive(p.id);
        this.commit(ctx);
        this.pub(`Punição do Serafim recai sobre ${this.P(tgt).name} (maior prestígio).`);
        yield* this.targeted(p, d, tgt, true, function* (tid) { yield* self.damage(tid, 2, d.name); });
        break;
      }
      case 'destruir': {
        const tgt = yield* this.askPlayer(p.id, 'Destruir Propriedade: de quem?', this.alive().filter(o => o.equips.length).map(o => o.id), true);
        if (tgt == null) return null;
        this.commit(ctx);
        yield* this.targeted(p, d, tgt, true, function* (tid) {
          const tp = self.P(tid); if (!tp.equips.length) return;
          let u = tp.equips[0];
          if (tp.equips.length > 1) u = yield* self.askOption(p.id, `Qual equipamento de ${tp.name} destruir?`, tp.equips.map(x => ({ id: x, label: self.cname(x), card: self.cardInfo(x) })));
          tp.equips.splice(tp.equips.indexOf(u), 1); self.toDiscard(u);
          self.pub(`${self.cname(u)} de ${tp.name} foi destruído.`);
        });
        break;
      }
      case 'incendiar': {
        const tgt = yield* this.askPlayer(p.id, 'Incendiar: presentear quem (mesmo local)?', this.playersAt(p.loc).filter(o => o.id !== p.id).map(o => o.id), true);
        if (tgt == null) return null;
        ctx.keep = true;
        this.commit(ctx);
        let placed = false;
        yield* this.targeted(p, d, tgt, true, function* (tid) {
          const tp = self.P(tid);
          tp.equips.forEach(u => self.toDiscard(u));
          if (tp.equips.length) self.pub(`Equipamento de ${tp.name} descartado.`);
          tp.equips = [uid]; placed = true;
          self.pub(`${tp.name} agora carrega Incendiar.`);
        });
        if (!placed) this.toDiscard(uid);
        break;
      }
      case 'roubo': {
        this.commit(ctx);
        const a = this.P(this.topAlive()), b = this.P(this.bottomAlive());
        if (a.hand.length) {
          const g = a.hand.length === 1 ? [a.hand[0]] : yield* this.askCards(a.id, `Roubo Caridoso: escolha 1 carta para dar a ${b.name}.`, a.hand, 1, 1);
          this.removeFromHand(a, g[0]); b.hand.push(g[0]);
          this.pub(`${a.name} (maior prestígio) deu uma carta a ${b.name} (menor prestígio).`);
          this.priv(b.id, `Você recebeu ${this.cname(g[0])}.`);
          yield* this.checkElim(a.id);
          yield* this.enforceLimit(b.id);
        }
        break;
      }
      case 'transmitir': {
        const locs = this.slotLoc.filter(id => this.locs[id].cards.length && (id !== 'banco' || this.pos(p.id) === 1));
        const to = yield* this.askLocation(p.id, 'Transmitir Memória: influenciar qual local?', locs, true);
        if (!to) return null;
        this.commit(ctx);
        const give = yield* this.askCards(p.id, `Transmitir Memória: carta para deixar em ${this.locName(to)}.`, p.hand, 1, 1);
        const idx = yield* this.askLocCard(p.id, `Transmitir Memória: qual carta pegar em ${this.locName(to)}?`, to, false);
        this.influence(p, to, give[0], idx);
        break;
      }
      case 'amanhecer': {
        const locs = this.slotLoc.filter(id => this.locs[id].cards.some(c => !c.up));
        if (!locs.length) { return 'Não há cartas viradas para baixo em nenhum local.'; }
        const to = yield* this.askLocation(p.id, 'Amanhecer Adiantado: revelar as cartas de qual local?', locs, true);
        if (!to) return null;
        this.commit(ctx);
        const trig = [];
        this.locs[to].cards.forEach(c => { if (!c.up) { c.up = true; if (this.def(c.uid).mode === 'revelacao') trig.push(c.uid); } });
        this.pub(`Cartas de ${this.locName(to)} reveladas: ${this.locs[to].cards.map(c => this.cname(c.uid)).join(', ')}.`);
        for (const u of trig) yield* this.triggerReveal(to, u);
        this.checkBoardWins(false);
        break;
      }
      case 'aumento': {
        const eq = p.hand.filter(u => u !== uid && this.def(u).mode === 'equip');
        const pick = yield* this.askOption(p.id, 'Aumento de Inventário: equipar qual carta?', eq.map(u => ({ id: u, label: this.cname(u), card: this.cardInfo(u) })).concat([{ id: 'cancel', label: 'Cancelar' }]));
        if (pick === 'cancel') return null;
        this.commit(ctx);
        this.removeFromHand(p, pick);
        yield* this.equip(p, pick, true);
        break;
      }
      default:
        return 'Esta carta não pode ser usada como ação.';
    }
    if (ctx.sede) yield* this.sedeSwap(p, uid);
    return null;
  }

  *sedeSwap(p, uid) {
    const L = this.locs.sede;
    if (!L.cards.length) { this.toDiscard(uid); return; }
    const i = yield* this.askLocCard(p.id, `Sede dos Mercenários: ${this.cname(uid)} fica no local. Escolha uma carta do local para a sua mão.`, 'sede', false);
    const taken = L.cards[i];
    L.cards[i] = { uid, up: this.boardDn === 'D' };
    p.hand.push(taken.uid);
    this.pub(`Sede dos Mercenários: ${this.cname(uid)} ficou no local e ${p.name} pegou ${taken.up ? this.cname(taken.uid) : 'uma carta virada para baixo'}.`);
    this.priv(p.id, `Você pegou ${this.cname(taken.uid)} da Sede.`);
  }

  // Janela de reação para cartas com alvo.
  *targeted(user, d, targetId, attack, apply) {
    let target = targetId, reflected = false;
    const extra = [];
    for (let guard = 0; guard < 8; guard++) {
      const t = this.P(target);
      if (t.id === user.id || !t.alive) break;
      const opts = [{ id: 'nada', label: 'Não reagir' }];
      if (attack && this.handOf(t, 'extintor').length) opts.push({ id: 'extintor', label: 'Extintor de Incêndio (cancelar ataque)' });
      if (this.handOf(t, 'escudo').length) opts.push({ id: 'escudo', label: 'Escudo Humano (transferir efeito)' });
      if (this.handOf(t, 'dor').length && this.alive().some(o => o.id !== t.id && o.id !== user.id)) opts.push({ id: 'dor', label: 'Dor Compartilhada (outro jogador também recebe)' });
      if (this.hasEquip(t, 'espelho') && !reflected) opts.push({ id: 'espelho', label: 'Espelho de Cristal (refletir para o dono)' });
      if (opts.length === 1) break;
      const a = yield* this.askOption(t.id, `${user.name} usou ${d.name} em você. Reagir?`, opts, { card: { name: d.name, text: d.text, cat: d.cat } });
      if (a === 'nada') break;
      if (a === 'extintor') {
        const u = this.handOf(t, 'extintor')[0]; this.removeFromHand(t, u); this.toDiscard(u);
        this.pub(`${t.name} usou Extintor de Incêndio: ${d.name} foi cancelada.`);
        yield* this.checkElim(t.id);
        return;
      }
      if (a === 'escudo') {
        const u = this.handOf(t, 'escudo')[0]; this.removeFromHand(t, u); this.toDiscard(u);
        const nt = yield* this.askPlayer(t.id, 'Escudo Humano: transferir o efeito para quem?', this.alive().filter(o => o.id !== t.id).map(o => o.id), false);
        this.pub(`${t.name} usou Escudo Humano: o efeito vai para ${this.P(nt).name}.`);
        yield* this.checkElim(t.id);
        target = nt; continue;
      }
      if (a === 'espelho') { this.pub(`${t.name} refletiu ${d.name} com o Espelho de Cristal!`); reflected = true; target = user.id; break; }
      if (a === 'dor') {
        const u = this.handOf(t, 'dor')[0]; this.removeFromHand(t, u); this.toDiscard(u);
        const o = yield* this.askPlayer(t.id, 'Dor Compartilhada: quem também recebe o efeito?', this.alive().filter(o => o.id !== t.id && o.id !== user.id).map(o => o.id), false);
        this.pub(`${t.name} usou Dor Compartilhada: ${this.P(o).name} também recebe o efeito.`);
        extra.push(o);
        break;
      }
    }
    for (const tid of [target].concat(extra)) {
      const t = this.P(tid);
      if (!t.alive) continue;
      if (attack && this.hasEquip(t, 'roupa')) {
        const u = t.equips.find(x => this.cards[x] === 'roupa');
        t.equips.splice(t.equips.indexOf(u), 1); this.toDiscard(u);
        this.pub(`A Roupa de Proteção de ${t.name} anulou ${d.name} (e foi descartada).`);
        continue;
      }
      yield* apply.call(this, tid, reflected && tid === user.id);
    }
  }

  // --------------------------------------------------------- transições
  *transition(cur, next) {
    this.pub(`=== Transição: ${cur.dn === 'D' ? 'Dia' : 'Noite'} → ${next.dn === 'D' ? 'Dia' : 'Noite'} ===`);
    if (next.dn === 'N' && this.boardDn === 'D') yield* this.dusk();
    else if (next.dn === 'D' && this.boardDn === 'N') yield* this.dawn();
    yield* this.serafimCheck(cur, next);
  }

  maintenance() {
    // Hospital
    const H = this.locs.hospital;
    let n = 0;
    while (H.cards.length < LOC.hospital.cards) { const u = this.draw('normal'); if (!u) break; H.cards.push({ uid: u, up: this.boardDn === 'D' }); n++; }
    if (n) this.pub(`Hospital reposto com ${n} carta(s).`);
    // Mercado
    const M = this.locs.mercado; const deck = this.boardDn === 'D' ? 'normal' : 'luxo';
    M.cards = M.cards.map(c => {
      if (this.def(c.uid).vis) return c;
      this.toDiscard(c.uid);
      const u = this.draw(deck);
      return u ? { uid: u, up: true } : null;
    }).filter(Boolean);
    this.pub(`Mercado renovado com cartas ${deck === 'luxo' ? 'de luxo' : 'normais'}: ${M.cards.map(c => this.cname(c.uid)).join(', ')}.`);
  }

  *dusk() {
    this.boardDn = 'N';
    for (const id of this.slotLoc) {
      if (id === 'mercado') continue;
      this.locs[id].cards.forEach(c => { if (!c.active) c.up = false; });
    }
    this.pub('Anoitece: cartas de influência viradas para baixo. Banco e Metrô fecham; Cassino abre.');
    this.maintenance();
  }

  *dawn() {
    this.boardDn = 'D';
    const trig = [];
    for (const id of this.slotLoc) {
      this.locs[id].cards.forEach(c => { if (!c.up) { c.up = true; if (this.def(c.uid).mode === 'revelacao') trig.push([id, c.uid]); } });
    }
    this.pub('Amanhece: cartas de influência reveladas. Cassino fecha; Banco e Metrô abrem.');
    for (const id of this.slotLoc) {
      const L = this.locs[id];
      if (L.cards.length) this.pub(`  ${this.locName(id)}: ${L.cards.map(c => this.cname(c.uid)).join(', ')}`);
    }
    for (const [id, u] of trig) yield* this.triggerReveal(id, u);
    yield* this.resolveCasino();
    this.checkBoardWins(true);
    this.maintenance();
  }

  *triggerReveal(locId, uid) {
    const id = this.cards[uid];
    const name = this.locName(locId);
    if (id === 'armadilha') {
      this.pub(`💥 Armadilha Explosiva revelada em ${name}!`);
      for (const o of this.playersAt(locId)) yield* this.damage(o.id, 1, 'Armadilha Explosiva');
    } else if (id === 'barreira') {
      this.pub(`🚧 Barreira Social revelada em ${name}: só prestígio Alto pode entrar.`);
    } else if (id === 'convocacao') {
      this.pub(`📣 Convocação revelada em ${name}!`);
      let room = LOC[locId].cap - this.playersAt(locId).length;
      const cands = this.alive().filter(o => o.loc !== locId)
        .sort((a, b) => (this.dist(a.loc, locId) - this.dist(b.loc, locId)) || (this.pos(b.id) - this.pos(a.id)));
      for (const o of cands) { if (room <= 0) break; room--; yield* this.enterLocation(o, locId, false); }
    } else if (id === 'vida') {
      const ps = this.playersAt(locId).sort((a, b) => this.pos(b.id) - this.pos(a.id));
      this.pub(`🔀 Vida Dividida revelada em ${name}!`);
      if (ps.length > 1) {
        const pool = this.shuffle(ps.flatMap(o => o.hand));
        ps.forEach(o => { o.hand = []; });
        pool.forEach((u, i) => ps[i % ps.length].hand.push(u));
        this.pub(`As mãos de ${ps.map(o => o.name).join(', ')} foram embaralhadas e redistribuídas.`);
        for (const o of ps) yield* this.enforceLimit(o.id);
      }
    } else if (id === 'explosao') {
      const c = this.locs[locId].cards.find(c => c.uid === uid);
      if (c && c.active) this.pub(`Explosão Celestial ativa em ${name}.`);
    }
  }

  *resolveCasino() {
    const entries = Object.entries(this.bets);
    if (!entries.length) return;
    const count = this.locs.arena.cards.filter(c => c.up && this.def(c.uid).vis).length;
    this.pub(`🎲 Cassino: a Arena revelou ${count} vislumbre(s). Apostas: ${entries.map(([pid, v]) => `${this.P(pid).name}=${v}`).join(', ')}.`);
    const win = entries.find(([, v]) => v === count);
    this.bets = {};
    if (!win) { this.pub('Ninguém acertou a aposta.'); return; }
    const p = this.P(Number(win[0]));
    if (!p.alive) return;
    const prize = 2 + (entries.length - 1);
    const got = [];
    for (let i = 0; i < prize; i++) { const u = this.giveDraw(p, 'normal', true); if (u) got.push(u); }
    this.pub(`${p.name} acertou e ganhou ${got.length} carta(s) reveladas: ${got.map(u => this.cname(u)).join(', ')}.`);
    const excess = p.hand.length - this.handLimit(p);
    if (excess > 0) {
      const ch = yield* this.askCards(p.id, `Cassino: descarte ${excess} carta(s) em excesso (cada uma sobe seu prestígio).`, p.hand, excess, excess);
      ch.forEach(u => { this.removeFromHand(p, u); this.toDiscard(u); });
      for (let i = 0; i < excess; i++) this.up(p.id);
      this.pub(`${p.name} descartou ${excess} carta(s) em excesso e subiu de prestígio.`);
    }
  }

  checkBoardWins(fullDawn) {
    let any = 0, revealed = 0, locsWith = 0;
    for (const id of this.slotLoc) {
      const cs = this.locs[id].cards.filter(c => this.def(c.uid).vis);
      any += cs.length;
      const up = cs.filter(c => c.up).length;
      revealed += up; if (up) locsWith++;
    }
    this.pub(`Vislumbres revelados no tabuleiro: ${revealed} (em ${locsWith} de ${this.slotLoc.length} locais).`);
    if (locsWith === this.slotLoc.length || revealed >= RULES.mdRevealedGoal) {
      throw new GameOver({ winners: this.players.filter(p => p.role === 'minddealer').map(p => p.id), reason: locsWith === this.slotLoc.length ? 'Todos os locais revelaram vislumbres: vitória do Mind Dealer.' : `${revealed} vislumbres revelados: vitória do Mind Dealer.` });
    }
    if (fullDawn && any === 0) {
      const art = this.players.find(p => p.role === 'artista');
      throw new GameOver({ winners: this.artistWinners(art), reason: 'Amanhecer sem nenhum vislumbre no tabuleiro: vitória do Artista.' });
    }
  }

  artistWinners(art) {
    const w = [art.id];
    if (this.trust != null) {
      const t = this.P(this.trust);
      if (t.role === 'cidadao' && t.alive && this.visCount(t) < RULES.citizenGlimpseGoal) w.push(t.id);
    }
    return w;
  }

  *serafimCheck(cur, next) {
    const art = this.players.find(p => p.role === 'artista');
    const mandatory = art.alive && !art.serafim && ((cur.period === '4' && next.period === 'Final') || art.revealed);
    const prompts = this.alive().map(p => {
      const isArt = p.id === art.id && !art.serafim;
      const options = isArt
        ? (mandatory ? [{ id: 'serafim', label: 'Ativar Modo Serafim (obrigatório)' }] : [{ id: 'continuar', label: 'Continuar' }, { id: 'serafim', label: 'Ativar Modo Serafim' }])
        : [{ id: 'continuar', label: 'Continuar' }];
      const ok = options.map(o => o.id);
      return { pid: p.id, kind: 'option', sub: 'transition', text: 'Transição de período. Confirme para continuar.', options, validate: a => (ok.includes(a) ? null : 'Opção inválida.') };
    });
    const ans = yield { multi: true, prompts };
    if (ans[art.id] === 'serafim') yield* this.activateSerafim(art);
  }

  *activateSerafim(art) {
    art.serafim = true; art.revealed = true;
    this.pub(`✨ ${art.name} é o ARTISTA e ativou o MODO SERAFIM! O jogo avança para o Período Final.`);
    this.round = 8;
    for (const p of this.alive()) p.loc = 'ashton';
    this.pub('Todos foram levados ao Edifício Ashton.');
    let n = 0;
    while (art.hand.length < RULES.serafimHandLimit) { if (!this.giveDraw(art, 'normal', true)) break; n++; }
    this.pub(`O Serafim comprou ${n} carta(s) (limite de mão 7).`);
    const cands = this.alive().filter(o => o.id !== art.id).map(o => o.id);
    if (cands.length) {
      const t = yield* this.askPlayer(art.id, 'Conceder o Marcador de Confiança? (opcional)', cands, true, { cancelLabel: 'Não conceder' });
      if (t != null) { this.trust = t; this.pub(`O Serafim concedeu o Marcador de Confiança a ${this.P(t).name}.`); }
    }
    if (this.boardDn === 'N') yield* this.dawn();
  }

  finalEvaluation() {
    const md = this.players.find(p => p.role === 'minddealer');
    const art = this.players.find(p => p.role === 'artista');
    const cits = this.players.filter(p => p.role === 'cidadao' && p.alive && this.visCount(p) >= RULES.citizenGlimpseGoal);
    let winners = [], reason;
    if (md.alive && md.hand.length > 0) {
      winners = [md.id].concat(cits.map(c => c.id));
      reason = 'Fim do Período Final: o Mind Dealer chegou vivo' + (cits.length ? ` e ${cits.map(c => c.name).join(', ')} juntou 3+ vislumbres.` : '.');
    } else if (cits.length) {
      winners = cits.map(c => c.id);
      reason = 'Fim do Período Final: Cidadão(s) com 3+ vislumbres na mão.';
    } else {
      winners = this.artistWinners(art);
      reason = 'Fim do Período Final: Mind Dealer eliminado e nenhum Cidadão com 3+ vislumbres: vitória do Artista.';
    }
    throw new GameOver({ winners, reason });
  }

  finish(result) {
    this.over = result;
    this.pending = null;
    this.turn = null;
    this.players.forEach(p => { p.revealed = true; });
    this.pub(`🏁 FIM DE JOGO — ${result.reason} Vencedores: ${result.winners.map(id => `${this.P(id).name} (${ROLES[this.P(id).role].name})`).join(', ') || 'ninguém'}.`);
  }

  // --------------------------------------------------------------- views
  locView(id) {
    const L = this.locs[id], l = LOC[id];
    return {
      id, name: l.name, text: l.text, slot: L.slot, cap: l.cap, open: l.open, isOpen: this.isOpen(id),
      players: this.playersAt(id).map(p => p.id),
      cards: L.cards.map(c => (c.up ? Object.assign(this.cardInfo(c.uid), { up: true, active: !!c.active }) : { up: false })),
    };
  }

  view(pid) {
    const r = ROUNDS[this.round];
    const me = pid != null ? this.P(pid) : null;
    const pend = this.pending ? this.pending.prompts.filter(p => !(p.pid in this.pending.answers)) : [];
    const mine = pend.find(p => p.pid === pid);
    let prompt = null;
    if (mine) { prompt = Object.assign({}, mine); delete prompt.validate; if (prompt.kind === 'turn') prompt.options = this.turnOptions(me); }
    return {
      version: this.version, seed: this.seed,
      round: this.round + 1, period: r.period, dn: r.dn, boardDn: this.boardDn,
      over: this.over,
      map: { slots: D.SLOTS, paths: D.PATHS, slotLoc: this.slotLoc },
      locs: this.slotLoc.map(id => this.locView(id)),
      players: this.players.map(p => ({
        id: p.id, name: p.name, alive: p.alive, loc: p.loc, handCount: p.hand.length,
        equips: p.equips.map(u => this.cardInfo(u)), prestige: this.pos(p.id), level: LEVEL(this.pos(p.id)),
        move: this.moveTrack.indexOf(p.id) + 1 || null, serafim: p.serafim, constricted: p.constricted,
        role: (p.revealed || p.id === pid) ? p.role : null, roleName: (p.revealed || p.id === pid) ? ROLES[p.role].name : null,
        trust: this.trust === p.id, bet: this.bets[p.id] != null, visCount: this.over ? this.visCount(p) : undefined,
        hand: this.over ? p.hand.map(u => this.cardInfo(u)) : undefined,
      })),
      prestige: this.prestige, moveTrack: this.moveTrack, moveSteps: RULES.moveSteps,
      decks: { normal: this.decks.normal.length, luxo: this.decks.luxo.length },
      discard: { normal: this.discard.normal.map(u => this.cardInfo(u)), luxo: this.discard.luxo.map(u => this.cardInfo(u)) },
      turn: this.turn ? { pid: this.turn.pid, actions: this.turn.actions, steps: this.turn.steps } : null,
      waitingOn: pend.map(p => p.pid),
      casinoFree: this.freeBets(),
      me: me ? {
        id: me.id, role: me.role, roleName: ROLES[me.role].name, win: ROLES[me.role].win,
        hand: me.hand.map(u => this.cardInfo(u)), handLimit: this.handLimit(me), visCount: this.visCount(me),
        bet: this.bets[me.id] != null ? this.bets[me.id] : null, inbox: me.inbox.slice(-10),
      } : null,
      prompt,
      log: this.log.filter(e => e.to == null || e.to === pid).slice(-250),
    };
  }
}

module.exports = { Game, CARD, LOC };

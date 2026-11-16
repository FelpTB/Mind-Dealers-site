// Joga partidas inteiras com decisões aleatórias para encontrar erros no motor.
// Uso: node test/fuzz.js [partidas]
const { Game } = require('../server/engine');

const N = Number(process.argv[2] || 300);
let seedR = 12345;
const rnd = () => { seedR = (seedR * 1103515245 + 12345) & 0x7fffffff; return seedR / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];

function answerFor(g, pr) {
  if (pr.kind === 'option' && !pr.options.some(o => o.id !== 'cancel')) { if (!pr.options.length) throw new Error('Prompt sem opções: ' + pr.text); return 'cancel'; }
  if (pr.kind === 'option') return pick(pr.options.filter(o => !o.disabled && o.id !== 'cancel').concat(pr.options.filter(o => o.id === 'cancel').slice(0, rnd() < 0.05 ? 1 : 0))).id;
  if (pr.kind === 'cards') {
    const ids = pr.cards.map(c => c.uid).sort(() => rnd() - 0.5);
    return ids.slice(0, pr.min);
  }
  if (pr.kind === 'turn') {
    const v = g.view(pr.pid); const o = v.prompt.options; const me = v.me;
    const acts = [];
    o.moves.filter(m => !m.reason).forEach(m => acts.push({ type: 'move', to: m.to }));
    if (!o.influence.reason) {
      if (o.influence.free) acts.push({ type: 'influence', free: true, take: Math.floor(rnd() * o.influence.cards.length) });
      if (me.hand.length) acts.push({ type: 'influence', give: pick(me.hand).uid, take: Math.floor(rnd() * o.influence.cards.length) });
    }
    if (!o.interact.reason) acts.push({ type: 'interact', target: pick(o.interact.targets) });
    o.cards.forEach(c => { if (!c.use) { acts.push({ type: 'useCard', uid: c.uid }); acts.push({ type: 'useCard', uid: c.uid }); } if (!c.equip) acts.push({ type: 'equip', uid: c.uid }); });
    if (o.location && !o.location.reason) acts.push({ type: 'location' });
    o.equipActions.filter(e => !e.reason).forEach(e => acts.push({ type: 'equipAction', uid: e.uid }));
    if (!acts.length || rnd() < 0.12) return { type: 'end' };
    return pick(acts);
  }
  throw new Error('prompt desconhecido ' + pr.kind);
}

const stats = { games: 0, errors: 0, reasons: {}, rounds: {}, steps: 0 };
for (let i = 0; i < N; i++) {
  const g = new Game(['A', 'B', 'C', 'D'], i + 1);
  let guard = 0;
  while (!g.over && g.pending && guard++ < 20000) {
    const prs = g.pending.prompts.filter(p => !(p.pid in g.pending.answers));
    const pr = prs[0];
    const ans = answerFor(g, pr);
    const err = g.answer(pr.pid, ans);
    if (err && pr.kind !== 'turn') { console.log('Resposta rejeitada', pr.kind, pr.text, ans, err); stats.errors++; break; }
    stats.steps++;
  }
  const internal = g.log.find(e => e.text.startsWith('⚠ Erro interno'));
  if (internal) { stats.errors++; console.log('Seed', i + 1, internal.text); }
  if (!g.over && !internal) { stats.errors++; console.log('Seed', i + 1, 'não terminou', guard, g.pending && g.pending.prompts.map(p => p.kind + ':' + p.text)); }
  if (g.over) { const k = g.over.reason.split(':')[0]; stats.reasons[k] = (stats.reasons[k] || 0) + 1; stats.rounds[g.round + 1] = (stats.rounds[g.round + 1] || 0) + 1; }
  stats.games++;
}
console.log(JSON.stringify(stats, null, 1));
process.exit(stats.errors ? 1 : 0);

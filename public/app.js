'use strict';
// Cliente do Mind Dealers: renderiza o estado enviado pelo servidor e envia decisões.
const app = document.getElementById('app');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = load('md_session');            // { room, token, seat }
let V = null;                          // último estado recebido
let es = null;
const ui = { mode: null, give: null, take: null, sel: [], key: null, follow: true, modal: null, seed: '', err: '' };

function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3500);
}

async function api(path, body) {
  try {
    const r = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.error || 'Erro'); return null; }
    return j;
  } catch (e) { toast('Sem conexão com o servidor.'); return null; }
}

function connect() {
  if (es) es.close();
  if (!S) { renderHome(); return; }
  es = new EventSource(`/api/stream?room=${encodeURIComponent(S.room)}&token=${encodeURIComponent(S.token)}&seat=${S.seat || 0}`);
  es.onmessage = e => { V = JSON.parse(e.data); onView(); };
  es.onerror = () => {
    if (es.readyState === 2) { S = null; store('md_session', null); ui.err = 'Sala não encontrada (o servidor pode ter reiniciado).'; renderHome(); }
  };
}

function setSeat(s) {
  if (!S || S.seat === s) return;
  S.seat = s; store('md_session', S); connect();
}

function onView() {
  if (V.lobby) { renderLobby(); return; }
  if (!V.mySeats.includes(S.seat)) { setSeat(V.mySeats[0]); return; }
  // modo teste: segue automaticamente o assento que precisa decidir
  if (V.test && ui.follow && V.waitingOn.length && !V.waitingOn.includes(S.seat)) {
    const nxt = V.waitingOn.find(s => V.mySeats.includes(s));
    if (nxt != null) { setSeat(nxt); return; }
  }
  const key = V.version + ':' + S.seat;
  if (key !== ui.key) { ui.key = key; ui.mode = null; ui.give = null; ui.take = null; ui.sel = []; }
  renderGame();
}

async function send(answer) {
  const r = await api('act', { room: S.room, token: S.token, seat: S.seat, answer });
  return r;
}

// ------------------------------------------------------------------ telas iniciais
function renderHome() {
  const q = new URLSearchParams(location.search);
  const sala = (q.get('sala') || '').toUpperCase();
  app.innerHTML = `
  <div class="lobby">
    <div><h1>Mind Dealers</h1><div class="muted">Protótipo online — regras automatizadas, decisões dos jogadores.</div></div>
    ${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ''}
    <div class="panel">
      <h2>Entrar numa sala</h2>
      <input id="jcode" placeholder="Código da sala" value="${esc(sala)}" maxlength="4" style="text-transform:uppercase">
      <input id="jname" placeholder="Seu nome" maxlength="20" value="${esc(load('md_name') || '')}">
      <button class="primary" data-a="join">Entrar</button>
    </div>
    <div class="panel">
      <h2>Criar sala</h2>
      <input id="cname" placeholder="Seu nome" maxlength="20" value="${esc(load('md_name') || '')}">
      <label class="row small"><input type="checkbox" id="ctest"> Modo teste: eu controlo os 4 jogadores neste navegador</label>
      <button class="primary" data-a="create">Criar sala</button>
    </div>
  </div>`;
}

function renderLobby() {
  const link = `${location.origin}/?sala=${V.room}`;
  app.innerHTML = `
  <div class="lobby">
    <div><h1>Sala ${esc(V.room)}</h1><div class="muted">${V.test ? 'Modo teste (você controla os 4 assentos).' : 'Compartilhe o código ou o link com mais 3 jogadores.'}</div></div>
    <div class="panel">
      <div class="row"><input readonly value="${esc(link)}" style="flex:1" onclick="this.select()"><button data-a="copy" data-v="${esc(link)}">Copiar link</button></div>
      <h2>Jogadores (${V.seats.length}/4)</h2>
      ${[0, 1, 2, 3].map(i => `<div class="seat">${V.seats[i] ? `<span class="name p${i}">${esc(V.seats[i])}</span>${V.mySeats.includes(i) ? ' <span class="muted small">(você)</span>' : ''}` : '<span class="muted">aguardando…</span>'}</div>`).join('')}
      ${V.host ? `
        <div class="row"><input id="seed" placeholder="Semente (opcional)" value="${esc(ui.seed)}" oninput="ui.seed=this.value" style="width:170px">
        <button class="primary" data-a="start" ${V.seats.length === 4 ? '' : 'disabled'}>Iniciar partida</button></div>
        <div class="small muted">A semente repete o mesmo embaralhamento (útil para reproduzir uma partida).</div>`
    : '<div class="muted">Aguardando o anfitrião iniciar.</div>'}
      <button data-a="leave">Sair da sala</button>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ jogo
const pn = id => `<span class="name p${id}">${esc(V.players[id].name)}</span>`;
const chip = id => `<span class="chip p${id}">${esc(V.players[id].name)}${V.players[id].serafim ? ' ✦' : ''}</span>`;
const DECK = { normal: 'Normal', luxo: 'Luxo' };
const MODE = { acao: 'Ação', reacao: 'Reação', revelacao: 'Revelação', equip: 'Equipamento' };

function cardHTML(c, extra = '', cls = '', attrs = '') {
  if (!c) return `<div class="card hidden ${cls}" ${attrs}>Carta virada para baixo${extra}</div>`;
  return `<div class="card ${c.vis ? 'vis' : ''} ${c.deck === 'luxo' ? 'luxo' : ''} ${cls}" ${attrs}>
    <div class="cn">${esc(c.name)}</div>
    <div class="tags">${c.vis ? '<span class="tag vis">Vislumbre</span>' : ''}<span class="tag ${c.deck === 'luxo' ? 'luxo' : ''}">${DECK[c.deck] || ''}</span>${c.cat ? `<span class="tag">${esc(c.cat)}</span>` : ''}${c.mode ? `<span class="tag">${MODE[c.mode]}</span>` : ''}${c.active ? '<span class="tag vis">ATIVA</span>' : ''}</div>
    <div class="ct">${c.vis && c.mode !== 'equip' && c.mode !== 'revelacao' ? '<b>Modo Serafim:</b> ' : ''}${esc(c.text)}</div>
    ${extra}
  </div>`;
}

function turnOpts() { return V.prompt && V.prompt.kind === 'turn' ? V.prompt.options : null; }

function boardHTML() {
  const o = turnOpts();
  const me = V.players[S.seat];
  const slots = V.map.slots;
  const pick = V.prompt && V.prompt.sub === 'location' ? V.prompt.options.map(x => x.id).filter(id => id.startsWith('l:')).map(id => id.slice(2)) : [];
  const paths = V.map.paths.map(([a, b, type, curve]) => {
    const A = slots[a], B = slots[b];
    const st = type === 'alameda' ? 'stroke="var(--alameda)" stroke-dasharray="14 8"' : type === 'beco' ? 'stroke="var(--beco)" stroke-dasharray="3 7" stroke-linecap="round"' : 'stroke="var(--path)"';
    let d = `M${A.x},${A.y} L${B.x},${B.y}`;
    if (curve) {
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, len = Math.hypot(B.x - A.x, B.y - A.y);
      const nx = -(B.y - A.y) / len, ny = (B.x - A.x) / len;
      d = `M${A.x},${A.y} Q${mx + nx * curve * 2},${my + ny * curve * 2} ${B.x},${B.y}`;
    }
    return `<path d="${d}" fill="none" stroke-width="5" ${st}/>`;
  }).join('');
  const locs = V.locs.map(l => {
    const s = slots[l.slot];
    const mv = o && o.moves.find(m => m.to === l.id && !m.reason);
    const cls = ['loc', l.isOpen ? '' : 'closed', me.loc === l.id ? 'here' : '', mv ? 'canmove' : '', pick.includes(l.id) ? 'pickable' : ''].join(' ');
    const openTxt = l.open === '24' ? '24h' : l.open === 'D' ? 'Dia' : 'Noite';
    return `<div class="${cls}" style="left:${(s.x + 30) / 960 * 100}%;top:${(s.y + 30) / 720 * 100}%" data-a="loc" data-loc="${l.id}">
      <div class="lname"><span>${esc(l.name)}</span><span class="muted">${l.players.length}/${l.cap}</span></div>
      <div class="lmeta">${l.isOpen ? 'Aberto' : 'Fechado'} · abre ${openTxt}</div>
      <div class="mini">${l.players.map(chip).join('')}</div>
      <div class="mini">${l.cards.map(c => c.up ? `<span class="mc ${c.vis ? 'vis' : ''} ${c.active ? 'active' : ''}" title="${esc(c.text)}">${esc(c.name)}</span>` : '<span class="mc down">?</span>').join('')}</div>
      ${mv ? `<div class="mv">→ mover (${mv.type}${mv.note ? ': ' + esc(mv.note) : ''})</div>` : ''}
      ${pick.includes(l.id) ? '<div class="mv" style="color:var(--accent)">clique para escolher</div>' : ''}
    </div>`;
  }).join('');
  return `<div class="board-wrap"><div class="board ${V.boardDn === 'N' ? 'night' : ''}"><svg viewBox="-30 -30 960 720" preserveAspectRatio="none">${paths}</svg>${locs}</div></div>
  <div class="legend"><span><i></i>Calçada (1 passo)</span><span><i class="al"></i>Alameda (desce 1 de prestígio)</span><span><i class="be"></i>Beco (prestígio Alto/Médio descarta 1)</span><span>? = carta virada para baixo</span><span>✦ = Serafim</span></div>`;
}

function playersHTML() {
  const rows = V.prestige.map(id => {
    const p = V.players[id];
    const st = [];
    if (p.roleName) st.push(`<b>${esc(p.roleName)}</b>`);
    if (p.serafim) st.push('Serafim');
    if (p.trust) st.push('Confiança');
    if (p.constricted) st.push('Preso');
    if (p.bet) st.push('Apostou');
    if (!p.alive) st.push('Eliminado');
    return `<tr class="${p.alive ? '' : 'dead'} ${V.turn && V.turn.pid === id ? 'active' : ''}">
      <td>${p.prestige}. ${pn(id)}</td><td>${p.level}</td><td>${p.move || '—'}</td>
      <td>${p.loc ? esc(V.locs.find(l => l.id === p.loc).name) : '—'}</td><td>${p.handCount}</td>
      <td>${p.equips.map(e => `<span class="tag ${e.vis ? 'vis' : ''}" title="${esc(e.text)}">${esc(e.name)}</span>`).join(' ') || '—'}</td>
      <td class="small">${st.join(' · ')}</td></tr>`;
  }).join('');
  const mt = V.moveTrack.map((id, i) => `<li>${id != null ? pn(id) : '<span class="muted">—</span>'} <span class="muted small">(${V.moveSteps[i]} passos)</span></li>`).join('');
  return `<div class="panel">
    <h2>Jogadores (ordem de prestígio)</h2>
    <div style="overflow-x:auto"><table class="players"><tr><th>Prestígio</th><th>Nível</th><th>Mov.</th><th>Local</th><th>Mão</th><th>Equip.</th><th>Status</th></tr>${rows}</table></div>
    <div class="tracks" style="margin-top:10px">
      <div><h2>Trilha de Movimento</h2><ol>${mt}</ol></div>
      <div><h2>Baralhos</h2><div class="small">Normal: ${V.decks.normal} · Luxo: ${V.decks.luxo}<br>Descarte: ${V.discard.normal.length} normais, ${V.discard.luxo.length} de luxo</div>
      <button data-a="modal" data-m="discard" style="margin-top:6px">Ver descartes</button></div>
    </div>
  </div>`;
}

function promptHTML() {
  const pr = V.prompt;
  if (V.over) return '';
  if (!pr) {
    const w = V.waitingOn.map(pn).join(', ');
    return `<div class="panel"><div class="muted">${w ? 'Aguardando: ' + w : 'Aguardando…'}</div></div>`;
  }
  if (pr.kind === 'turn') return turnHTML(pr.options);
  if (pr.kind === 'option') {
    const withCards = pr.options.some(o => o.card);
    const opts = withCards
      ? `<div class="cards">${pr.options.map(o => o.card ? cardHTML(o.card, `<div class="acts"><button class="primary" data-a="opt" data-id="${esc(o.id)}">${esc(o.label)}</button></div>`) : `<div><button data-a="opt" data-id="${esc(o.id)}">${esc(o.label)}</button></div>`).join('')}</div>`
      : `<div class="opts">${pr.options.map(o => `<button class="${o.id === 'cancel' ? '' : 'primary'}" data-a="opt" data-id="${esc(o.id)}" ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</button>`).join('')}</div>`;
    return `<div class="panel prompt"><div class="ptext">${esc(pr.text)}</div>${pr.card ? cardHTML(pr.card) : ''}${pr.sub === 'location' ? '<div class="small muted">Você também pode clicar no local no mapa.</div>' : ''}${opts}</div>`;
  }
  if (pr.kind === 'cards') {
    const n = ui.sel.length;
    return `<div class="panel prompt"><div class="ptext">${esc(pr.text)}</div>
      <div class="cards">${pr.cards.map(c => cardHTML(c, '', 'selectable ' + (ui.sel.includes(c.uid) ? 'selected' : ''), `data-a="pick" data-uid="${c.uid}"`)).join('')}</div>
      <div class="row" style="margin-top:8px"><button class="primary" data-a="cards-ok" ${n >= pr.min && n <= pr.max ? '' : 'disabled'}>Confirmar (${n}/${pr.min === pr.max ? pr.min : pr.min + '–' + pr.max})</button></div></div>`;
  }
  return '';
}

function turnHTML(o) {
  const me = V.players[S.seat];
  const why = r => (r ? `<span class="why-line">${esc(r)}</span>` : '');
  let wizard = '';
  if (ui.mode === 'influence') {
    const loc = V.locs.find(l => l.id === me.loc);
    wizard = `<div class="panel" style="margin-top:8px"><b>Influenciar ${esc(loc.name)}</b>
      <div class="small muted">1) Escolha a carta do local que você vai pegar${V.boardDn === 'N' && me.loc !== 'mercado' ? ' (às cegas, à noite)' : ''}. 2) Clique na carta da sua mão que vai deixar (lá embaixo).</div>
      <div class="cards" style="margin-top:6px">${o.influence.cards.map((c, i) => cardHTML(c.up ? c : null, '', 'selectable ' + (ui.take === i ? 'selected' : ''), `data-a="take" data-i="${i}"`)).join('')}</div>
      <div class="row" style="margin-top:8px">
        <button class="primary" data-a="infl-ok" ${ui.take != null && ui.give ? '' : 'disabled'}>Trocar${ui.give ? ' (deixar ' + esc(V.me.hand.find(h => h.uid === ui.give)?.name || '') + ')' : ''}</button>
        ${o.influence.free ? `<button data-a="infl-free" ${ui.take != null ? '' : 'disabled'}>Pegar sem troca (Hospital)</button>` : ''}
        <button data-a="mode" data-m="">Cancelar</button></div></div>`;
  }
  return `<div class="panel prompt">
    <div class="row"><span class="ptext" style="margin:0">Sua vez</span><span class="counter">Ações: ${o.actions}</span><span class="counter">Passos: ${o.steps}</span>
      <button class="primary" data-a="end" style="margin-left:auto">Encerrar turno</button></div>
    ${o.error ? `<div class="err">${esc(o.error)}</div>` : ''}
    <h3 style="margin-top:10px;font-size:13px">Mover (1 passo por caminho)</h3>
    <div class="moves">${o.moves.map(m => `<div><button data-a="move" data-to="${m.to}" ${m.reason ? 'disabled' : ''}>→ ${esc(m.name)} <span class="small muted">(${m.type}${m.note ? ': ' + esc(m.note) : ''})</span></button>${m.reason ? '<br>' + why(m.reason) : ''}</div>`).join('')}</div>
    <h3 style="margin-top:10px;font-size:13px">Ações</h3>
    <div class="opts">
      <div><button data-a="mode" data-m="influence" ${o.influence.reason ? 'disabled' : ''}>Influenciar</button><br>${why(o.influence.reason)}</div>
      <div>${o.interact.reason ? `<button disabled>Interagir</button><br>${why(o.interact.reason)}` : o.interact.targets.map(t => `<button data-a="interact" data-t="${t}">Interagir com ${esc(V.players[t].name)}</button>`).join(' ')}</div>
      ${o.location ? `<div><button data-a="locact" ${o.location.reason ? 'disabled' : ''}>${esc(o.location.label)}</button><br>${why(o.location.reason)}</div>` : ''}
      ${o.equipActions.map(e => `<div><button data-a="eqact" data-uid="${e.uid}" ${e.reason ? 'disabled' : ''}>${esc(e.name)}: atacar</button><br>${why(e.reason)}</div>`).join('')}
    </div>
    <div class="small muted" style="margin-top:6px">Usar Carta e Equipar: botões nas cartas da sua mão.</div>
    ${wizard}
  </div>`;
}

function meHTML() {
  const m = V.me; if (!m) return '';
  const me = V.players[S.seat];
  return `<div class="panel">
    <div class="row"><span class="muted">Você é</span> ${pn(S.seat)} <span class="muted">·</span> <span class="role">${esc(m.roleName)}${me.serafim ? ' (Serafim)' : ''}</span></div>
    <ul class="win">${m.win.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
    <div class="small" style="margin-top:6px">Vislumbres na mão/equipados: <b>${m.visCount}</b> · Limite de mão: ${m.handLimit}${m.bet != null ? ` · Aposta no Cassino: ${m.bet}` : ''}${me.trust ? ' · Você tem o Marcador de Confiança' : ''}</div>
  </div>`;
}

function handHTML() {
  const m = V.me; if (!m) return '';
  const o = turnOpts();
  const me = V.players[S.seat];
  const cards = m.hand.map(c => {
    let extra = '';
    if (o) {
      const co = o.cards.find(x => x.uid === c.uid);
      if (ui.mode === 'influence') extra = `<div class="acts"><button class="${ui.give === c.uid ? 'primary' : ''}" data-a="give" data-uid="${c.uid}">${ui.give === c.uid ? 'Vai deixar esta' : 'Deixar esta no local'}</button></div>`;
      else if (co) {
        const b = [];
        if (c.mode === 'acao') b.push(`<button class="primary" data-a="use" data-uid="${c.uid}" ${co.use ? 'disabled' : ''}>Usar</button>`);
        if (c.mode === 'equip') b.push(`<button class="primary" data-a="equip" data-uid="${c.uid}" ${co.equip ? 'disabled' : ''}>Equipar</button>`);
        const r = c.mode === 'acao' ? co.use : c.mode === 'equip' ? co.equip : co.use;
        extra = `<div class="acts">${b.join('')}</div>${r ? `<div class="why">${esc(r)}</div>` : ''}`;
      }
    }
    return cardHTML(c, extra);
  }).join('');
  const eq = me.equips.length ? `<h2 style="margin-top:10px">Equipados</h2><div class="cards">${me.equips.map(c => cardHTML(c)).join('')}</div>` : '';
  return `<div class="panel"><h2>Sua mão (${m.hand.length}/${m.handLimit})</h2><div class="cards">${cards || '<span class="muted">Sem cartas.</span>'}</div>${eq}</div>`;
}

function logHTML() {
  return `<div class="panel"><h2>Registro</h2><div class="log" id="log">${V.log.map(e => `<div class="${e.to != null ? 'priv' : ''}">${e.to != null ? '🔒 ' : ''}${esc(e.text)}</div>`).join('')}</div></div>`;
}

function modalHTML() {
  // fim de jogo
  if (V.over && ui.modal !== 'closed-over') {
    return `<div class="overlay"><div class="modal"><h2>Fim de jogo</h2><div>${esc(V.over.reason)}</div>
      <div><b>Vencedores:</b> ${V.over.winners.map(pn).join(', ') || 'ninguém'}</div>
      <table class="players"><tr><th>Jogador</th><th>Função</th><th>Vivo</th><th>Vislumbres</th><th>Mão final</th></tr>
      ${V.players.map(p => `<tr><td>${pn(p.id)}</td><td>${esc(p.roleName)}</td><td>${p.alive ? 'sim' : 'não'}</td><td>${p.visCount}</td><td class="small">${(p.hand || []).map(c => esc(c.name)).join(', ')}</td></tr>`).join('')}</table>
      <div class="row">${V.host ? '<button class="primary" data-a="start">Nova partida (mesma sala)</button>' : ''}<button data-a="modal" data-m="closed-over">Ver tabuleiro</button><button data-a="leave">Sair</button></div></div></div>`;
  }
  // mensagens privadas (cartas vistas)
  const seen = load(`md_seen_${V.room}_${S.seat}`) || 0;
  const it = V.me && V.me.inbox.find(i => i.id > seen);
  if (it) {
    return `<div class="overlay"><div class="modal"><h2>${esc(it.title)}</h2><div class="small muted">Somente você vê isto.</div>
      <div class="cards">${it.cards.map(c => cardHTML(c)).join('') || '<span class="muted">Mão vazia.</span>'}</div>
      <div><button class="primary" data-a="inbox" data-id="${it.id}">OK</button></div></div></div>`;
  }
  if (ui.modal === 'discard') {
    return `<div class="overlay"><div class="modal"><h2>Pilhas de descarte</h2>
      <h3 style="font-size:13px">Normal (${V.discard.normal.length})</h3><div class="cards">${V.discard.normal.slice().reverse().map(c => cardHTML(c)).join('')}</div>
      <h3 style="font-size:13px">Luxo (${V.discard.luxo.length})</h3><div class="cards">${V.discard.luxo.slice().reverse().map(c => cardHTML(c)).join('')}</div>
      <div><button data-a="modal" data-m="">Fechar</button></div></div></div>`;
  }
  if (ui.modal && ui.modal.startsWith('loc:')) {
    const l = V.locs.find(x => x.id === ui.modal.slice(4));
    return `<div class="overlay"><div class="modal"><h2>${esc(l.name)}</h2>
      <div class="small">Abre: ${l.open === '24' ? '24h' : l.open === 'D' ? 'Dia' : 'Noite'} · Lotação ${l.players.length}/${l.cap} · ${l.isOpen ? 'Aberto agora' : 'Fechado agora'}</div>
      <div>${esc(l.text)}</div>
      <div class="mini" style="font-size:13px">${l.players.map(chip).join(' ')}</div>
      <h3 style="font-size:13px">Cartas de influência</h3>
      <div class="cards">${l.cards.map(c => cardHTML(c.up ? c : null)).join('') || '<span class="muted">Nenhuma.</span>'}</div>
      <div><button data-a="modal" data-m="">Fechar</button></div></div></div>`;
  }
  return '';
}

function renderGame() {
  const r = `Rodada ${V.round}/11 · Período ${V.period}`;
  const turn = V.turn ? `Vez de ${pn(V.turn.pid)}` : '';
  const seats = V.test ? `<div class="seats"><span class="small muted">Ver como:</span>${V.mySeats.map(s => `<button class="${s === S.seat ? 'sel' : ''} ${V.waitingOn.includes(s) ? 'waiting' : ''}" data-a="seat" data-s="${s}">${esc(V.players[s].name)}</button>`).join('')}
    <label class="small row"><input type="checkbox" data-a="follow" ${ui.follow ? 'checked' : ''}> seguir decisões</label></div>` : '';
  const logEl = document.getElementById('log');
  const atBottom = !logEl || logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
  app.innerHTML = `
  <div class="top"><h1>Mind Dealers</h1><span class="pill">Sala ${esc(V.room)}</span><span class="pill">${r}</span>
    <span class="pill ${V.dn === 'N' ? 'night' : 'day'}">${V.dn === 'N' ? '☾ Noite' : '☀ Dia'}</span><span>${turn}</span>
    <span class="small muted" title="semente do embaralhamento">semente ${V.seed}</span>${seats}</div>
  <div class="layout">
    <div class="col">${boardHTML()}${playersHTML()}</div>
    <div class="col">${promptHTML()}${meHTML()}${handHTML()}${logHTML()}</div>
  </div>${modalHTML()}`;
  const l2 = document.getElementById('log');
  if (l2 && atBottom) l2.scrollTop = l2.scrollHeight;
}

// ------------------------------------------------------------------ eventos
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-a]');
  if (!t) return;
  const a = t.dataset.a, d = t.dataset;
  switch (a) {
    case 'create': {
      const name = document.getElementById('cname').value.trim();
      store('md_name', name);
      const r = await api('create', { name, test: document.getElementById('ctest').checked });
      if (r) { S = { room: r.room, token: r.token, seat: 0 }; store('md_session', S); ui.err = ''; connect(); }
      break;
    }
    case 'join': {
      const name = document.getElementById('jname').value.trim();
      store('md_name', name);
      const r = await api('join', { room: document.getElementById('jcode').value.trim().toUpperCase(), name });
      if (r) { S = { room: r.room, token: r.token, seat: 0 }; store('md_session', S); ui.err = ''; history.replaceState(null, '', '/'); connect(); }
      break;
    }
    case 'copy': navigator.clipboard && navigator.clipboard.writeText(d.v); toast('Link copiado.'); break;
    case 'start': ui.modal = null; await api('start', { room: S.room, token: S.token, seed: ui.seed }); break;
    case 'leave': if (es) es.close(); S = null; store('md_session', null); V = null; ui.modal = null; renderHome(); break;
    case 'seat': ui.follow = false; setSeat(Number(d.s)); break;
    case 'follow': ui.follow = t.checked; if (V) onView(); break;
    case 'modal': ui.modal = d.m || null; renderGame(); break;
    case 'inbox': store(`md_seen_${V.room}_${S.seat}`, Number(d.id)); renderGame(); break;
    case 'loc': {
      if (V.prompt && V.prompt.sub === 'location' && V.prompt.options.some(o => o.id === 'l:' + d.loc)) { send('l:' + d.loc); break; }
      const o = turnOpts();
      const mv = o && o.moves.find(m => m.to === d.loc && !m.reason);
      if (mv && ui.mode !== 'influence') { send({ type: 'move', to: d.loc }); break; }
      ui.modal = 'loc:' + d.loc; renderGame();
      break;
    }
    case 'move': send({ type: 'move', to: d.to }); break;
    case 'end': send({ type: 'end' }); break;
    case 'mode': ui.mode = d.m || null; ui.give = null; ui.take = null; renderGame(); break;
    case 'give': ui.give = d.uid; renderGame(); break;
    case 'take': ui.take = Number(d.i); renderGame(); break;
    case 'infl-ok': send({ type: 'influence', give: ui.give, take: ui.take }); break;
    case 'infl-free': send({ type: 'influence', free: true, take: ui.take }); break;
    case 'interact': send({ type: 'interact', target: Number(d.t) }); break;
    case 'use': send({ type: 'useCard', uid: d.uid }); break;
    case 'equip': send({ type: 'equip', uid: d.uid }); break;
    case 'locact': send({ type: 'location' }); break;
    case 'eqact': send({ type: 'equipAction', uid: d.uid }); break;
    case 'opt': send(d.id); break;
    case 'pick': {
      const i = ui.sel.indexOf(d.uid);
      if (i >= 0) ui.sel.splice(i, 1);
      else { ui.sel.push(d.uid); if (V.prompt && ui.sel.length > V.prompt.max) ui.sel.shift(); }
      renderGame(); break;
    }
    case 'cards-ok': send(ui.sel.slice()); break;
    default: break;
  }
});

connect();

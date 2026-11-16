'use strict';
// Servidor do Mind Dealers: Node puro, sem dependências.
// Salas com código de 4 letras; estado enviado por Server-Sent Events; ações por POST.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Game } = require('./server/engine');

const PORT = Number(process.env.PORT || 3000);
const PUB = path.join(__dirname, 'public');
const rooms = new Map();

const token = () => crypto.randomBytes(12).toString('hex');
function code() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join(''); } while (rooms.has(c));
  return c;
}

function seatsFor(room, tok) {
  if (room.test && tok === room.hostToken) return room.seats.map((_, i) => i);
  return room.seats.map((s, i) => (s.token === tok ? i : -1)).filter(i => i >= 0);
}

function lobbyView(room, tok) {
  return {
    lobby: true, room: room.code, test: room.test, host: tok === room.hostToken,
    seats: room.seats.map(s => s.name), mySeats: seatsFor(room, tok), started: !!room.game,
  };
}

function viewFor(room, tok, seat) {
  const mine = seatsFor(room, tok);
  if (!room.game) return lobbyView(room, tok);
  const s = mine.includes(seat) ? seat : mine[0];
  const v = room.game.view(s);
  v.room = room.code; v.mySeats = mine; v.test = room.test; v.host = tok === room.hostToken;
  v.seatNames = room.seats.map(x => x.name);
  return v;
}

function broadcast(room) {
  room.touched = Date.now();
  for (const c of room.clients) {
    try { c.res.write(`data: ${JSON.stringify(viewFor(room, c.tok, c.seat))}\n\n`); } catch (e) { /* cliente caiu */ }
  }
}

function body(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { resolve({}); } });
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/health') return json(res, 200, { ok: true, rooms: rooms.size });

  if (req.method === 'POST' && p.startsWith('/api/')) {
    const b = await body(req);
    const name = String(b.name || '').trim().slice(0, 20);
    if (p === '/api/create') {
      if (!name) return json(res, 400, { error: 'Informe seu nome.' });
      const room = { code: code(), test: !!b.test, hostToken: token(), seats: [], clients: new Set(), game: null, touched: Date.now() };
      room.seats.push({ name, token: room.hostToken });
      if (room.test) ['Jogador 2', 'Jogador 3', 'Jogador 4'].forEach(n => room.seats.push({ name: n, token: room.hostToken }));
      rooms.set(room.code, room);
      return json(res, 200, { room: room.code, token: room.hostToken });
    }
    const room = rooms.get(String(b.room || '').toUpperCase());
    if (!room) return json(res, 404, { error: 'Sala não encontrada.' });
    if (p === '/api/join') {
      if (!name) return json(res, 400, { error: 'Informe seu nome.' });
      if (room.game) return json(res, 400, { error: 'A partida já começou.' });
      if (room.seats.length >= 4) return json(res, 400, { error: 'Sala cheia (4 jogadores).' });
      const t = token();
      room.seats.push({ name, token: t });
      broadcast(room);
      return json(res, 200, { room: room.code, token: t });
    }
    if (p === '/api/start') {
      if (b.token !== room.hostToken) return json(res, 403, { error: 'Só o anfitrião inicia.' });
      if (room.seats.length !== 4) return json(res, 400, { error: 'São necessários 4 jogadores.' });
      if (room.game && !room.game.over) return json(res, 400, { error: 'Partida em andamento.' });
      const seed = b.seed !== undefined && b.seed !== '' && !isNaN(Number(b.seed)) ? Number(b.seed) : undefined;
      room.game = new Game(room.seats.map(s => s.name), seed);
      broadcast(room);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/act') {
      if (!room.game) return json(res, 400, { error: 'Partida não iniciada.' });
      const seat = Number(b.seat);
      if (!seatsFor(room, b.token).includes(seat)) return json(res, 403, { error: 'Assento inválido.' });
      const err = room.game.answer(seat, b.answer);
      broadcast(room);
      return json(res, err ? 400 : 200, err ? { error: err } : { ok: true });
    }
    return json(res, 404, { error: 'Rota desconhecida.' });
  }

  if (req.method === 'GET' && p === '/api/stream') {
    const room = rooms.get(String(url.searchParams.get('room') || '').toUpperCase());
    const tok = url.searchParams.get('token');
    if (!room || !seatsFor(room, tok).length) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const c = { res, tok, seat: Number(url.searchParams.get('seat') || 0) };
    room.clients.add(c);
    res.write(`data: ${JSON.stringify(viewFor(room, tok, c.seat))}\n\n`);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { /* */ } }, 20000);
    req.on('close', () => { clearInterval(ping); room.clients.delete(c); });
    return;
  }

  // arquivos estáticos
  let f = p === '/' ? '/index.html' : p;
  f = path.normalize(path.join(PUB, f));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// limpa salas paradas há mais de 12 horas
setInterval(() => {
  const lim = Date.now() - 12 * 3600 * 1000;
  for (const [k, r] of rooms) if (r.touched < lim && !r.clients.size) rooms.delete(k);
}, 3600 * 1000);

server.listen(PORT, '0.0.0.0', () => console.log(`Mind Dealers rodando na porta ${PORT}`));

// Railway envia SIGTERM ao reimplantar: fecha as conexões ao vivo e encerra.
function shutdown() {
  for (const r of rooms.values()) for (const c of r.clients) { try { c.res.end(); } catch (e) { /* */ } }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Quintet server: serves the game and relays TikTok LIVE chat to it.
// Each browser opens GET /api/chat?user=<tiktok name> (Server-Sent Events).
// Browsers watching the same streamer share one TikTok connection.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TikTokLiveConnection, WebcastEvent, ControlEvent, UserOfflineError } from 'tiktok-live-connector';

const PORT = Number(process.env.PORT) || 3000;
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 50;          // streamers connected at once
const EULER_API_KEY = process.env.EULER_API_KEY || undefined;   // optional, raises TikTok rate limits
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

const TYPES = { '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon', '.png': 'image/png' };
const rooms = new Map();   // username -> { conn, clients: Set<res>, status }

function send(res, msg) { res.write(`data: ${JSON.stringify(msg)}\n\n`); }
function broadcast(room, msg) { for (const res of room.clients) send(res, msg); }

function closeRoom(name) {
  const room = rooms.get(name);
  if (!room) return;
  rooms.delete(name);
  room.conn.disconnect().catch(() => {});
}

function openRoom(name) {
  const conn = new TikTokLiveConnection(name, {
    signApiKey: EULER_API_KEY,
    processInitialData: false,   // ignore chat sent before the game connected
  });
  const room = { conn, clients: new Set(), status: { type: 'status', state: 'connecting', message: `Connecting to @${name}…` } };
  rooms.set(name, room);

  const setStatus = (state, message) => { room.status = { type: 'status', state, message }; broadcast(room, room.status); };
  const fail = message => { setStatus('error', message); for (const res of room.clients) res.end(); closeRoom(name); };

  conn.on(WebcastEvent.CHAT, data => {
    const user = data.user?.uniqueId || data.user?.nickname || 'viewer';
    if (data.comment) broadcast(room, { type: 'chat', user, text: String(data.comment).slice(0, 200) });
  });
  conn.on(ControlEvent.DISCONNECTED, () => {
    if (rooms.get(name) === room) fail(`Lost connection to @${name}. The stream may have ended. Press Connect to retry.`);
  });

  conn.connect()
    .then(() => setStatus('connected', `Connected to @${name}`))
    .catch(err => {
      if (rooms.get(name) !== room) return;
      if (err instanceof UserOfflineError || /offline|not live|isn't live/i.test(String(err?.message))) {
        fail(`@${name} isn't live right now. Go live, then press Connect.`);
      } else {
        console.error(`[${name}] connect failed:`, err?.message || err);
        fail(`Couldn't find a live stream for @${name}. Check the username and make sure you're live.`);
      }
    });
  return room;
}

function handleChat(req, res, url) {
  const name = (url.searchParams.get('user') || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._]{2,24}$/.test(name)) { res.writeHead(400, { 'Content-Type': 'text/plain' }); return res.end('Bad username'); }

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 600000\n\n');   // the page reconnects itself; stop the browser auto-retrying

  let room = rooms.get(name);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) {
      send(res, { type: 'status', state: 'error', message: 'The game is busy right now. Try again in a few minutes.' });
      return res.end();
    }
    room = openRoom(name);
  }
  room.clients.add(res);
  send(res, room.status);

  const ping = setInterval(() => res.write(': ping\n\n'), 25000);   // keep proxies from closing the stream
  req.on('close', () => {
    clearInterval(ping);
    room.clients.delete(res);
    if (!room.clients.size && rooms.get(name) === room) closeRoom(name);
  });
}

function serveFile(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': file.endsWith('.txt') ? 'public, max-age=86400' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (url.pathname === '/api/ping') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size })); }
  if (url.pathname === '/api/chat') return handleChat(req, res, url);
  serveFile(res, url.pathname);
}).listen(PORT, () => console.log(`Quintet running at http://localhost:${PORT}`));

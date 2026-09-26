// One Durable Object instance per room code. It owns the Game, the WebSockets
// of everyone in the room, and the clock that drives the round.
import { Game } from './game.js';

const TICK_MS = 200;
const EMPTY_RESET_MS = 60_000; // room disappears a minute after the last person leaves
const IDLE_CLOSE_MS = 20 * 60_000; // close rooms nobody has touched for 20 minutes
const MAX_MESSAGE_BYTES = 2048;

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.code = null;
    this.game = null;
    this.claimed = false;
    this.sockets = new Map(); // WebSocket -> { playerId, tokens, refillAt }
    this.interval = null;
    this.flushTimer = null;
    this.flushedVersion = -1;
    this.emptySince = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const [action, rawCode] = url.pathname.split('/').filter(Boolean);
    const code = (rawCode || '').toUpperCase();
    if (!this.code) this.code = code;
    if (!this.game) this.game = new Game(this.code);

    if (action === 'claim') {
      if (this.claimed && (this.game.humanCount() > 0 || this.sockets.size > 0)) {
        return new Response('taken', { status: 409 });
      }
      this.game = new Game(this.code);
      this.claimed = true;
      this.emptySince = Date.now();
      this.ensureTicking();
      return new Response('ok');
    }

    if (action === 'peek') {
      return Response.json(
        { exists: this.claimed, phase: this.game.phase, players: this.game.connectedHumanCount() },
        { headers: { 'cache-control': 'no-store' } },
      );
    }

    if (action === 'ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 });
      }
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      this.onConnect(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  onConnect(ws) {
    const session = { playerId: null, tokens: 40, refillAt: Date.now() };
    this.sockets.set(ws, session);
    ws.addEventListener('message', (event) => this.onMessage(ws, session, event.data));
    ws.addEventListener('close', () => this.onClose(ws, session));
    ws.addEventListener('error', () => this.onClose(ws, session));
    this.ensureTicking();
  }

  onMessage(ws, session, data) {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE_BYTES) return;
    // Simple token bucket: 20 messages per second, bursts of 40.
    const now = Date.now();
    session.tokens = Math.min(40, session.tokens + ((now - session.refillAt) / 1000) * 20);
    session.refillAt = now;
    if (session.tokens < 1) return;
    session.tokens -= 1;

    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.t === 'ping') {
      this.send(ws, { t: 'pong', ts: msg.ts, now: Date.now() });
      return;
    }

    if (msg.t === 'hello') {
      if (session.playerId) return;
      if (!this.claimed && typeof msg.token === 'string' && msg.token) {
        // Someone who had a seat here is reconnecting, but the room was reset
        // (server update or restart). Bring the room back under the same code.
        this.game = new Game(this.code);
        this.claimed = true;
        this.restartedAt = Date.now();
      }
      if (!this.claimed) {
        this.send(ws, { t: 'closed', code: 4004, reason: 'Room not found' });
        ws.close(4004, 'Room not found');
        this.sockets.delete(ws);
        return;
      }
      const result = this.game.join({ token: typeof msg.token === 'string' ? msg.token : null, name: msg.name });
      if (result.error) {
        this.send(ws, { t: 'closed', code: 4009, reason: 'Room is full' });
        ws.close(4009, 'Room is full');
        this.sockets.delete(ws);
        return;
      }
      const id = result.player.id;
      // The same player opened the game in a new tab: retire the old connection.
      for (const [other, s] of this.sockets) {
        if (other !== ws && s.playerId === id) {
          this.sockets.delete(other);
          this.send(other, { t: 'closed', code: 4001, reason: 'Opened in another tab' });
          try { other.close(4001, 'Opened in another tab'); } catch {}
        }
      }
      session.playerId = id;
      this.emptySince = null;
      const restarted = !result.rejoined && !!this.restartedAt && Date.now() - this.restartedAt < 60_000 && typeof msg.token === 'string';
      this.send(ws, { t: 'welcome', id, token: result.player.token, rejoined: result.rejoined, restarted });
      this.flushSoon(true);
      return;
    }

    if (!session.playerId) return;
    if (msg.t === 'debugEvent') {
      // Local testing only: `wrangler dev --var DEV:1`. Never set on the real site.
      if (this.env && this.env.DEV === '1' && this.game.phase === 'playing') {
        this.game.triggerEvent(Date.now(), msg.kind, session.playerId);
        this.flushSoon();
      }
      return;
    }
    this.game.handle(session.playerId, msg);
    this.flushSoon();
  }

  onClose(ws, session) {
    if (!this.sockets.has(ws)) return;
    this.sockets.delete(ws);
    if (session.playerId) {
      const stillHere = [...this.sockets.values()].some((s) => s.playerId === session.playerId);
      if (!stillHere) this.game.disconnect(session.playerId);
    }
    this.flushSoon();
  }

  ensureTicking() {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    const now = Date.now();
    this.game.tick();
    if (this.game.version !== this.flushedVersion) this.flushSoon();

    const connected = [...this.sockets.values()].some((s) => s.playerId);
    if (!connected) {
      if (this.emptySince === null) this.emptySince = now;
      if (now - this.emptySince > EMPTY_RESET_MS) {
        clearInterval(this.interval);
        this.interval = null;
        this.claimed = false;
        this.game = new Game(this.code);
      }
    } else {
      this.emptySince = null;
      if (now - this.game.lastHumanInput > IDLE_CLOSE_MS) {
        for (const ws of [...this.sockets.keys()]) {
          this.send(ws, { t: 'closed', code: 4008, reason: 'Closed after 20 quiet minutes' });
          try { ws.close(4008, 'Idle'); } catch {}
        }
        this.sockets.clear();
      }
    }
  }

  flushSoon(immediate = false) {
    if (immediate) {
      if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
      this.flush();
      return;
    }
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 25);
  }

  flush() {
    this.flushedVersion = this.game.version;
    const fx = this.game.drainFx();
    for (const [ws, s] of this.sockets) {
      if (!s.playerId || !this.game.players.has(s.playerId)) continue;
      const view = this.game.viewFor(s.playerId);
      const mine = fx.filter((f) => f.to === 'all' || f.to === s.playerId).map((f) => f.fx);
      if (mine.length) view.fx = mine;
      this.send(ws, view);
    }
    for (const close of this.game.drainCloses()) {
      for (const [ws, s] of [...this.sockets]) {
        if (s.playerId !== close.id) continue;
        this.sockets.delete(ws);
        this.send(ws, { t: 'closed', code: close.code, reason: close.reason });
        try { ws.close(close.code, close.reason); } catch {}
      }
    }
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }
}

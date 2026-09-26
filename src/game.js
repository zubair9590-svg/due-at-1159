// Server-authoritative game logic for one room.
// Pure JavaScript with no platform APIs, so it runs the same inside the
// Cloudflare Durable Object and in plain Node for tests.
import {
  STATION_IDS, ASSIGNMENT_TYPES, TOPICS, DIFFICULTY, LENGTHS, CHAT_LINES,
  BOT_NAMES, FUN_NAMES, AVATARS, COLORS, makeTask, gradeFor, reportFor, GRADE_POINTS,
  AWARDS, FALLBACK_AWARD,
} from './content.js';

export const MAX_PLAYERS = 8;
export const DESK_LIMIT = 6;
const COUNTDOWN_MS = 4500;
const AWAY_AFTER_MS = 6000; // mid-round, a dropped player's work moves to teammates after this
const LOBBY_DROP_MS = 45000; // in the lobby, a dropped player disappears after this
const HOST_HANDOFF_MS = 4000;
const WIFI_MS = 7000;
const PRINTER_MS = 6000;
const CHAT_BUBBLES = 3;
const NO_SPAWN_TAIL_MS = 12000;
const NO_EVENT_TAIL_MS = 15000;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const between = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function weightedPick(items, weight) {
  const weights = items.map((it) => Math.max(0, weight(it)));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return items[0];
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}
function rid(n) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
function newStats() {
  return {
    steps: 0, passes: 0, submits: 0, mistakes: 0, tasks: 0, taskMs: 0, clutch: 0, received: 0,
    by: { research: 0, write: 0, design: 0, edit: 0 },
  };
}
const round2 = (x) => Math.round(x * 100) / 100;

export function cleanName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

export class Game {
  constructor(code, now = () => Date.now()) {
    this.code = code;
    this.now = now;
    this.phase = 'lobby'; // lobby | countdown | playing | results
    this.players = new Map();
    this.hostId = null;
    this.settings = { difficulty: 'sophomore', length: 180 };
    this.round = null;
    this.results = null;
    this.best = null;
    this.roundsPlayed = 0;
    this.fx = [];
    this.closeQueue = [];
    this.seq = 0;
    this.version = 0;
    this.lastHumanInput = now();
  }

  // ------------------------------------------------------------ plumbing
  nextId(prefix) { return prefix + (++this.seq); }
  touch() { this.version++; }
  emit(to, fx) { this.fx.push({ to, fx }); this.touch(); }
  drainFx() { const f = this.fx; this.fx = []; return f; }
  drainCloses() { const c = this.closeQueue; this.closeQueue = []; return c; }
  humans() { return [...this.players.values()].filter((p) => !p.isBot); }
  humanCount() { return this.humans().length; }
  connectedHumanCount() { return this.humans().filter((p) => p.connected).length; }
  orderedPlayers() { return [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt); }
  // Everyone who can receive and do work right now.
  roster() { return this.orderedPlayers().filter((p) => p.isBot || (p.connected && !p.away)); }
  isBlocked(p) { return p.wifiUntil > this.now() || p.chat.length > 0; }

  // ------------------------------------------------------------ membership
  join({ token, name }) {
    const now = this.now();
    if (token) {
      const existing = this.humans().find((p) => p.token === token);
      if (existing) {
        existing.connected = true;
        existing.disconnectedAt = 0;
        const wasAway = existing.away;
        existing.away = false;
        if (this.round && (this.phase === 'playing' || this.phase === 'countdown')) {
          if (!existing.stations.length) existing.stations = [this.neediestStation()];
          if (wasAway) this.emit('all', { k: 'back', name: existing.name });
        }
        this.lastHumanInput = now;
        this.touch();
        return { player: existing, rejoined: true };
      }
    }
    if (this.players.size >= MAX_PLAYERS) {
      const bot = this.orderedPlayers().reverse().find((p) => p.isBot);
      if (bot && this.phase === 'lobby') this.removePlayer(bot.id);
      else return { error: 'full' };
    }
    const p = this.makePlayer({ name: cleanName(name) || pick(FUN_NAMES), isBot: false });
    p.token = crypto.randomUUID();
    this.players.set(p.id, p);
    const host = this.players.get(this.hostId);
    if (!host || host.isBot) this.hostId = p.id;
    const late = this.phase === 'playing' || this.phase === 'countdown';
    if (late) p.stations = [this.neediestStation()];
    this.emit('all', { k: 'joined', id: p.id, name: p.name, late });
    this.lastHumanInput = now;
    return { player: p, rejoined: false };
  }

  makePlayer({ name, isBot }) {
    const used = new Set([...this.players.values()].map((p) => p.avatar));
    let i = AVATARS.findIndex((a) => !used.has(a));
    if (i < 0) i = this.players.size % AVATARS.length;
    return {
      id: rid(8), token: null, name: this.uniqueName(name), isBot,
      avatar: AVATARS[i], color: COLORS[i],
      connected: true, away: false, disconnectedAt: 0, joinedAt: this.now() + this.players.size / 1000,
      stations: [], desk: [], stats: newStats(), wifiUntil: 0, chat: [],
      bot: isBot ? { busyUntil: 0, startedAt: 0, workingOn: null, nextAt: 0 } : null,
    };
  }

  uniqueName(name, selfId) {
    const taken = new Set([...this.players.values()].filter((p) => p.id !== selfId).map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 30; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${name.slice(0, 12)} ${rid(3)}`;
  }

  disconnect(id) {
    const p = this.players.get(id);
    if (!p || p.isBot) return;
    p.connected = false;
    p.disconnectedAt = this.now();
    this.touch();
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.round && p.desk.length) this.redistribute(p);
    this.players.delete(id);
    if (this.hostId === id) this.pickNewHost();
    if (this.round && this.phase !== 'results') this.ensureCoverage();
    this.emit('all', { k: 'left', name: p.name, bot: p.isBot });
  }

  pickNewHost() {
    const humans = this.humans().sort((a, b) => a.joinedAt - b.joinedAt);
    const next = humans.find((p) => p.connected) || humans.find((p) => p.id === this.hostId) || humans[0];
    this.hostId = next ? next.id : null;
    this.touch();
  }

  addBot() {
    if (this.players.size >= MAX_PLAYERS) return;
    const used = new Set([...this.players.values()].map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || 'Bot';
    const b = this.makePlayer({ name, isBot: true });
    this.players.set(b.id, b);
    this.emit('all', { k: 'joined', id: b.id, name: b.name, bot: true });
  }

  removeBot() {
    const bots = this.orderedPlayers().filter((p) => p.isBot);
    if (bots.length) this.removePlayer(bots[bots.length - 1].id);
  }

  // ------------------------------------------------------------ messages
  handle(id, msg) {
    const p = this.players.get(id);
    if (!p || !msg || typeof msg.t !== 'string') return;
    if (!p.isBot) this.lastHumanInput = this.now();
    const isHost = id === this.hostId;
    switch (msg.t) {
      case 'rename': {
        const n = cleanName(msg.name);
        if (n && this.phase !== 'playing') { p.name = this.uniqueName(n, p.id); this.touch(); }
        break;
      }
      case 'settings':
        if (isHost && this.phase === 'lobby') {
          if (DIFFICULTY[msg.difficulty]) this.settings.difficulty = msg.difficulty;
          if (LENGTHS.includes(msg.length)) this.settings.length = msg.length;
          this.touch();
        }
        break;
      case 'addBot': if (isHost && this.phase === 'lobby') this.addBot(); break;
      case 'removeBot': if (isHost && this.phase === 'lobby') this.removeBot(); break;
      case 'kick':
        if (isHost && this.phase === 'lobby' && msg.id !== id && this.players.has(msg.id)) {
          const target = this.players.get(msg.id);
          this.removePlayer(msg.id);
          if (!target.isBot) this.closeQueue.push({ id: msg.id, code: 4003, reason: 'Removed by the host' });
        }
        break;
      case 'start': if (isHost && this.phase === 'lobby') this.startCountdown(); break;
      case 'quickplay':
        if (isHost && this.phase === 'lobby') {
          while (this.players.size < 4) this.addBot();
          this.startCountdown();
        }
        break;
      case 'lobby': if (isHost && this.phase === 'results') this.backToLobby(); break;
      case 'leave':
        this.removePlayer(id);
        this.closeQueue.push({ id, code: 4000, reason: 'Left the room' });
        break;
      case 'done': this.completeStep(p, msg); break;
      case 'oops':
        if (this.phase === 'playing') { p.stats.mistakes++; this.touch(); }
        break;
      case 'pass': this.pass(p, msg); break;
      case 'submit': this.submit(p, msg); break;
      case 'dismiss':
        if (p.chat.length) { p.chat = p.chat.filter((c) => c.id !== msg.id); this.touch(); }
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ round lifecycle
  startCountdown() {
    const now = this.now();
    const diff = DIFFICULTY[this.settings.difficulty];
    for (const p of this.players.values()) {
      p.desk = [];
      p.stats = newStats();
      p.wifiUntil = 0;
      p.chat = [];
      if (p.bot) Object.assign(p.bot, { busyUntil: 0, startedAt: 0, workingOn: null, nextAt: 0 });
    }
    this.assignStations(this.roster());
    const startAt = now + COUNTDOWN_MS;
    this.round = {
      difficulty: diff.id,
      length: this.settings.length * 1000,
      startAt,
      endAt: startAt + this.settings.length * 1000,
      folders: new Map(),
      archive: [],
      events: [],
      nextSpawnAt: startAt + 600,
      burst: Math.min(3, Math.max(1, this.roster().length)), // quick extra spawns so nobody starts idle
      nextEventAt: startAt + between(22000, 32000),
      printerUntil: 0,
      spawned: 0,
      lastTopics: [],
      lastEvent: null,
    };
    this.results = null;
    this.phase = 'countdown';
    this.emit('all', { k: 'countdown' });
  }

  backToLobby() {
    this.phase = 'lobby';
    this.round = null;
    for (const p of this.players.values()) {
      p.desk = [];
      p.stations = [];
      p.chat = [];
      p.wifiUntil = 0;
    }
    this.emit('all', { k: 'lobby' });
  }

  finishRound() {
    const r = this.round;
    const now = this.now();
    const unfinished = [...r.folders.values()];
    for (const p of this.players.values()) { p.desk = []; p.chat = []; p.wifiUntil = 0; }
    const resolved = r.archive;
    const points = resolved.reduce((s, a) => s + GRADE_POINTS[a.grade], 0);
    const gpa = resolved.length ? points / resolved.length : 0;
    const report = reportFor(gpa, resolved.length);
    const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const a of resolved) grades[a.grade]++;
    const everyone = this.orderedPlayers();
    const newBest = resolved.length > 0 && (!this.best || gpa > this.best.gpa);
    if (newBest) this.best = { gpa, at: now };
    this.results = {
      gpa: round2(gpa),
      letter: report.letter,
      headline: report.headline,
      line: report.line,
      submitted: resolved.length - grades.F,
      late: grades.F,
      unfinished: unfinished.length,
      grades,
      transcript: resolved.map((a) => ({ title: a.title, emoji: a.emoji, topic: a.topic, grade: a.grade, by: a.by })),
      awards: this.computeAwards(everyone),
      newBest,
      difficulty: r.difficulty,
      length: r.length,
    };
    r.folders.clear();
    this.phase = 'results';
    this.roundsPlayed++;
    this.emit('all', { k: 'end' });
  }

  computeAwards(players) {
    const given = new Map();
    for (const award of AWARDS) {
      let best = null;
      let bestVal = 0;
      for (const p of players) {
        if (given.has(p.id)) continue;
        const v = award.stat(p.stats);
        if (v >= award.min && v > bestVal) { best = p; bestVal = v; }
      }
      if (best) given.set(best.id, { id: award.id, emoji: award.emoji, title: award.title, blurb: award.blurb(best.stats) });
    }
    return players.map((p) => ({
      playerId: p.id, name: p.name, avatar: p.avatar, color: p.color, isBot: p.isBot,
      steps: p.stats.steps, submits: p.stats.submits, passes: p.stats.passes,
      ...(given.get(p.id) || { id: FALLBACK_AWARD.id, emoji: FALLBACK_AWARD.emoji, title: FALLBACK_AWARD.title, blurb: FALLBACK_AWARD.blurb() }),
    }));
  }

  // ------------------------------------------------------------ jobs
  // Hand out the four jobs. With fewer than four players some people get two;
  // with more than four, jobs are doubled up.
  assignStations(list) {
    const players = shuffle(list);
    if (!players.length) return;
    players.forEach((p) => { p.stations = []; });
    const order = shuffle(STATION_IDS);
    if (players.length >= 4) players.forEach((p, i) => { p.stations = [order[i % 4]]; });
    else order.forEach((s, i) => players[i % players.length].stations.push(s));
    this.touch();
  }

  // The job with the most waiting work per person doing it.
  neediestStation() {
    const owners = Object.fromEntries(STATION_IDS.map((s) => [s, 0]));
    for (const p of this.roster()) for (const s of p.stations) owners[s]++;
    const waiting = Object.fromEntries(STATION_IDS.map((s) => [s, 0]));
    if (this.round) for (const f of this.round.folders.values()) if (!f.ready) waiting[f.steps[f.stepIndex]]++;
    let best = STATION_IDS[0];
    let bestScore = -Infinity;
    for (const s of STATION_IDS) {
      const score = (owners[s] === 0 ? 1000 : 0) + (waiting[s] + 1) / (owners[s] + 1);
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  // Make sure every job still has someone doing it (after drops and leaves).
  ensureCoverage() {
    const roster = this.roster();
    if (!roster.length) return;
    for (const s of STATION_IDS) {
      if (roster.some((p) => p.stations.includes(s))) continue;
      const target = roster.slice().sort((a, b) => a.stations.length - b.stations.length || a.desk.length - b.desk.length)[0];
      target.stations.push(s);
      this.emit(target.id, { k: 'newJob', stations: target.stations.slice(), reason: 'cover', added: s });
    }
  }

  // ------------------------------------------------------------ folders
  bestRecipient(folder, candidates, { allowFull = false, ownersOnly = false } = {}) {
    const need = folder.ready ? null : folder.steps[folder.stepIndex];
    const withSpace = candidates.filter((c) => c.desk.length < DESK_LIMIT);
    const pool = withSpace.length ? withSpace : allowFull ? candidates : [];
    if (!pool.length) return null;
    const owners = need ? pool.filter((c) => c.stations.includes(need)) : [];
    if (ownersOnly && need && !owners.length) return null;
    const list = owners.length ? owners : pool;
    return list.slice().sort((a, b) => a.desk.length - b.desk.length || Number(a.isBot) - Number(b.isBot))[0];
  }

  moveFolder(folder, from, to) {
    if (from) from.desk = from.desk.filter((id) => id !== folder.id);
    to.desk.push(folder.id);
    folder.holderId = to.id;
    this.touch();
  }

  redistribute(p) {
    const others = this.roster().filter((o) => o.id !== p.id);
    if (!others.length || !this.round) return;
    for (const fid of p.desk.slice()) {
      const f = this.round.folders.get(fid);
      if (!f) continue;
      const target = this.bestRecipient(f, others, { allowFull: true });
      if (!target) continue;
      this.moveFolder(f, p, target);
      this.emit(target.id, { k: 'incoming', folder: f.id, title: f.title, emoji: f.emoji, from: p.name, rescued: true });
    }
  }

  spawnInterval(now) {
    const r = this.round;
    const diff = DIFFICULTY[r.difficulty];
    const n = Math.max(1, this.roster().length);
    // Bigger groups finish more work, but every hand-off costs time, so the
    // workload grows a bit slower than the group does.
    const perMinute = 3.4 * Math.pow(n, 0.72) * diff.load;
    let ms = 60000 / perMinute;
    if ((now - r.startAt) / r.length < 0.1) ms *= 1.15;
    return clamp(ms * between(0.8, 1.2), 3000, 24000);
  }

  spawnFolder(now) {
    const r = this.round;
    const diff = DIFFICULTY[r.difficulty];
    const progress = (now - r.startAt) / r.length;
    const types = ASSIGNMENT_TYPES.filter((t) => progress >= t.minAt);
    // Favor work that starts at the job with the least waiting, so every job stays busy.
    const waiting = Object.fromEntries(STATION_IDS.map((s) => [s, 0]));
    for (const f of r.folders.values()) if (!f.ready) waiting[f.steps[f.stepIndex]]++;
    const type = weightedPick(types, (t) => {
      const base = t.steps.length <= 2 ? 1.5 - progress : 0.35 + progress;
      return (t.rare ? base * 0.35 : base) / (1 + waiting[t.steps[0]]);
    });
    const freshTopics = TOPICS.filter((t) => !r.lastTopics.includes(t.id));
    const topic = pick(freshTopics.length ? freshTopics : TOPICS);
    r.lastTopics.push(topic.id);
    if (r.lastTopics.length > 8) r.lastTopics.shift();
    const total = diff.baseTime + diff.stepTime * type.steps.length;
    const folder = {
      id: this.nextId('f'),
      kind: type.kind,
      title: type.title,
      emoji: type.emoji,
      topic: { id: topic.id, name: topic.name, emoji: topic.emoji },
      topicRef: topic,
      steps: type.steps.slice(),
      stepIndex: 0,
      ready: false,
      holderId: null,
      createdAt: now,
      dueAt: now + total,
      total,
      task: null,
    };
    folder.task = makeTask(folder.steps[0], topic, r.difficulty, this.nextId('t'));
    const roster = this.roster();
    const smart = diff.smartRouting || r.spawned < 3;
    let target;
    if (smart) {
      target = this.bestRecipient(folder, roster);
    } else {
      const withSpace = roster.filter((p) => p.desk.length < DESK_LIMIT);
      target = withSpace.length ? pick(withSpace) : null;
    }
    if (!target) return false;
    r.folders.set(folder.id, folder);
    r.spawned++;
    this.moveFolder(folder, null, target);
    this.emit('all', { k: 'new', folder: folder.id, title: folder.title, emoji: folder.emoji, to: target.id });
    return true;
  }

  resolve(folder, grade, by) {
    const r = this.round;
    r.folders.delete(folder.id);
    const holder = this.players.get(folder.holderId);
    if (holder) holder.desk = holder.desk.filter((id) => id !== folder.id);
    r.archive.push({
      id: folder.id, title: folder.title, emoji: folder.emoji, topic: folder.topic.name,
      grade, by: by ? by.name : null, at: this.now() - r.startAt,
    });
    this.touch();
  }

  // ------------------------------------------------------------ player actions
  completeStep(p, msg) {
    if (this.phase !== 'playing') return;
    const f = this.round.folders.get(msg.folder);
    if (!f || f.holderId !== p.id || f.ready) return this.emit(p.id, { k: 'stale', folder: msg.folder });
    const need = f.steps[f.stepIndex];
    if (!p.stations.includes(need)) return this.emit(p.id, { k: 'err', code: 'notYourJob', station: need });
    if (!f.task || f.task.id !== msg.task) return this.emit(p.id, { k: 'stale', folder: f.id });
    if (this.isBlocked(p)) return this.emit(p.id, { k: 'err', code: 'blocked' });
    this.advance(f, p, Number(msg.ms) || 0);
  }

  advance(f, p, ms) {
    const need = f.steps[f.stepIndex];
    p.stats.steps++;
    p.stats.by[need]++;
    if (ms > 0 && ms < 60000) { p.stats.tasks++; p.stats.taskMs += ms; }
    f.stepIndex++;
    if (f.stepIndex >= f.steps.length) {
      f.ready = true;
      f.task = null;
    } else {
      f.task = makeTask(f.steps[f.stepIndex], f.topicRef, this.round.difficulty, this.nextId('t'));
    }
    this.emit(p.id, { k: 'stepDone', folder: f.id, ready: f.ready, next: f.ready ? null : f.steps[f.stepIndex] });
  }

  pass(p, msg) {
    if (this.phase !== 'playing') return;
    const f = this.round.folders.get(msg.folder);
    if (!f || f.holderId !== p.id) return this.emit(p.id, { k: 'stale', folder: msg.folder });
    const to = this.players.get(msg.to);
    if (!to || to.id === p.id) return;
    if (!to.isBot && (!to.connected || to.away)) return this.emit(p.id, { k: 'err', code: 'away', name: to.name });
    if (to.desk.length >= DESK_LIMIT) return this.emit(p.id, { k: 'err', code: 'deskFull', name: to.name });
    if (this.isBlocked(p)) return this.emit(p.id, { k: 'err', code: 'blocked' });
    this.moveFolder(f, p, to);
    p.stats.passes++;
    to.stats.received++;
    this.emit(to.id, { k: 'incoming', folder: f.id, title: f.title, emoji: f.emoji, from: p.name, fromId: p.id });
    this.emit(p.id, { k: 'sent', folder: f.id, to: to.id, name: to.name });
  }

  submit(p, msg) {
    if (this.phase !== 'playing') return;
    const now = this.now();
    const f = this.round.folders.get(msg.folder);
    if (!f || f.holderId !== p.id || !f.ready) return this.emit(p.id, { k: 'stale', folder: msg.folder });
    if (this.round.printerUntil > now) return this.emit(p.id, { k: 'err', code: 'printer' });
    if (this.isBlocked(p)) return this.emit(p.id, { k: 'err', code: 'blocked' });
    const frac = clamp((f.dueAt - now) / f.total, 0, 1);
    const grade = gradeFor(frac);
    this.resolve(f, grade, p);
    p.stats.submits++;
    if (frac < 0.2) p.stats.clutch++;
    this.emit('all', { k: 'submitted', folder: f.id, title: f.title, emoji: f.emoji, grade, by: p.name, byId: p.id });
  }

  // ------------------------------------------------------------ chaos events
  // forced/forcedTarget are only used by the local test trigger.
  triggerEvent(now, forced = null, forcedTarget = null) {
    const r = this.round;
    const roster = this.roster();
    const humans = roster.filter((p) => !p.isBot);
    const weights = {
      deadline: 3,
      extension: r.events.length ? 2 : 0.5,
      groupchat: 3,
      printer: 2,
      wifi: 3,
      swap: roster.length >= 2 ? 3 : 0,
    };
    const kinds = Object.keys(weights).filter((k) => k !== r.lastEvent);
    const kind = weights[forced] !== undefined ? forced : weightedPick(kinds, (k) => weights[k]);
    r.lastEvent = kind;
    const ev = { id: this.nextId('e'), kind, at: now, until: now + 3500 };
    if (kind === 'deadline') {
      for (const f of r.folders.values()) f.dueAt = Math.max(now + 4000, f.dueAt - 10000);
    } else if (kind === 'extension') {
      for (const f of r.folders.values()) f.dueAt += 12000;
    } else if (kind === 'printer') {
      r.printerUntil = now + PRINTER_MS;
      ev.until = r.printerUntil;
    } else if (kind === 'groupchat') {
      const everyone = this.orderedPlayers();
      for (const p of roster) {
        const others = everyone.filter((o) => o.id !== p.id);
        p.chat = shuffle(CHAT_LINES).slice(0, CHAT_BUBBLES).map((text, i) => ({
          id: i + 1, text, from: others.length ? pick(others).name : 'Group chat',
        }));
      }
    } else if (kind === 'wifi') {
      const target = this.players.get(forcedTarget) || pick(humans.length ? humans : roster);
      target.wifiUntil = now + WIFI_MS;
      ev.targetId = target.id;
      ev.targetName = target.name;
      ev.until = target.wifiUntil;
    } else if (kind === 'swap') {
      const before = new Map(roster.map((p) => [p.id, p.stations.join()]));
      for (let tries = 0; tries < 6; tries++) {
        this.assignStations(roster);
        if (roster.some((p) => before.get(p.id) !== p.stations.join())) break;
      }
      for (const p of roster) this.emit(p.id, { k: 'newJob', stations: p.stations.slice(), reason: 'swap' });
    }
    r.events.push(ev);
    this.emit('all', { k: 'event', kind, targetId: ev.targetId, targetName: ev.targetName });
    const gap = DIFFICULTY[r.difficulty].eventGap;
    r.nextEventAt = now + between(gap[0], gap[1]);
  }

  // ------------------------------------------------------------ bots
  tickBots(now) {
    const r = this.round;
    const diff = DIFFICULTY[r.difficulty];
    for (const b of this.players.values()) {
      if (!b.isBot) continue;
      const s = b.bot;
      if (b.chat.length) {
        if (now >= s.nextAt) { b.chat.shift(); s.nextAt = now + between(500, 900); this.touch(); }
        continue;
      }
      if (b.wifiUntil > now) continue;
      if (s.workingOn) {
        const f = r.folders.get(s.workingOn);
        if (!f || f.holderId !== b.id || f.ready || !b.stations.includes(f.steps[f.stepIndex])) {
          s.workingOn = null;
          continue;
        }
        if (now >= s.busyUntil) {
          this.advance(f, b, s.busyUntil - s.startedAt);
          s.workingOn = null;
          s.nextAt = now + between(350, 800);
        }
        continue;
      }
      if (now < s.nextAt) continue;
      const folders = b.desk.map((id) => r.folders.get(id)).filter(Boolean).sort((x, y) => x.dueAt - y.dueAt);
      const ready = folders.find((f) => f.ready);
      if (ready) {
        if (r.printerUntil > now) { s.nextAt = r.printerUntil + between(200, 700); continue; }
        this.submit(b, { folder: ready.id });
        s.nextAt = now + between(500, 1000);
        continue;
      }
      // A good teammate unblocks others first: pass along what we can't do.
      const other = folders.find((f) => !b.stations.includes(f.steps[f.stepIndex]));
      if (other) {
        const to = this.bestRecipient(other, this.roster().filter((p) => p.id !== b.id), { ownersOnly: true });
        if (to) {
          this.pass(b, { folder: other.id, to: to.id });
          s.nextAt = now + between(500, 1100);
          continue;
        }
      }
      const mine = folders.find((f) => b.stations.includes(f.steps[f.stepIndex]));
      if (mine) {
        s.workingOn = mine.id;
        s.startedAt = now;
        s.busyUntil = now + between(diff.botStep[0], diff.botStep[1]);
        this.touch();
        continue;
      }
      s.nextAt = now + 300;
    }
  }

  // ------------------------------------------------------------ clock
  tick() {
    const now = this.now();
    for (const p of [...this.players.values()]) {
      if (p.isBot || p.connected) continue;
      const gone = now - p.disconnectedAt;
      if (this.phase === 'lobby' || this.phase === 'results') {
        if (gone > LOBBY_DROP_MS) this.removePlayer(p.id);
      } else if (!p.away && gone > AWAY_AFTER_MS) {
        p.away = true;
        if (this.round) { this.redistribute(p); this.ensureCoverage(); }
        this.emit('all', { k: 'away', name: p.name });
      }
    }
    const host = this.players.get(this.hostId);
    if (!host || host.isBot || (!host.connected && now - host.disconnectedAt > HOST_HANDOFF_MS)) {
      const before = this.hostId;
      this.pickNewHost();
      if (before !== this.hostId && this.hostId) this.emit('all', { k: 'host', id: this.hostId });
    }
    if (this.phase === 'countdown' && now >= this.round.startAt) {
      this.phase = 'playing';
      this.emit('all', { k: 'start' });
    }
    if (this.phase === 'playing') this.tickRound(now);
  }

  tickRound(now) {
    const r = this.round;
    if (now >= r.endAt) { this.finishRound(); return; }
    for (const f of [...r.folders.values()]) {
      if (now < f.dueAt) continue;
      const holder = this.players.get(f.holderId);
      this.resolve(f, 'F', null);
      this.emit('all', { k: 'late', folder: f.id, title: f.title, emoji: f.emoji, holderId: f.holderId, holder: holder ? holder.name : '' });
    }
    const roster = this.roster();
    if (now >= r.nextSpawnAt && r.endAt - now > NO_SPAWN_TAIL_MS) {
      const cap = Math.max(3, roster.length * 2 + 1);
      if (roster.length && r.folders.size < cap) this.spawnFolder(now);
      if (r.burst > 0) {
        r.burst--;
        r.nextSpawnAt = now + 900;
      } else {
        r.nextSpawnAt = now + this.spawnInterval(now);
      }
    }
    if (now >= r.nextEventAt && r.endAt - now > NO_EVENT_TAIL_MS && roster.length) this.triggerEvent(now);
    const eventCount = r.events.length;
    r.events = r.events.filter((e) => e.until > now);
    if (r.events.length !== eventCount) this.touch();
    for (const p of this.players.values()) {
      if (p.wifiUntil && p.wifiUntil <= now) { p.wifiUntil = 0; this.touch(); }
    }
    this.tickBots(now);
  }

  // ------------------------------------------------------------ views
  viewFor(id) {
    const now = this.now();
    const me = this.players.get(id);
    const r = this.round;
    const view = {
      t: 'state',
      now,
      code: this.code,
      phase: this.phase,
      you: id,
      hostId: this.hostId,
      settings: this.settings,
      best: this.best ? round2(this.best.gpa) : null,
      rounds: this.roundsPlayed,
      players: this.orderedPlayers().map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar, color: p.color, isBot: p.isBot,
        connected: p.isBot || p.connected, away: p.away, stations: p.stations, load: p.desk.length,
        busy: !!(p.bot && p.bot.workingOn), wifi: p.wifiUntil > now, chat: p.chat.length > 0,
      })),
    };
    if (r && (this.phase === 'countdown' || this.phase === 'playing')) {
      const points = r.archive.reduce((s, a) => s + GRADE_POINTS[a.grade], 0);
      view.round = {
        startAt: r.startAt,
        endAt: r.endAt,
        length: r.length,
        difficulty: r.difficulty,
        printerUntil: r.printerUntil,
        folders: [...r.folders.values()].map((f) => ({
          id: f.id, kind: f.kind, title: f.title, emoji: f.emoji, topic: f.topic, steps: f.steps, stepIndex: f.stepIndex,
          ready: f.ready, holderId: f.holderId, dueAt: f.dueAt, total: f.total,
        })),
        events: r.events.map((e) => ({ id: e.id, kind: e.kind, at: e.at, until: e.until, targetId: e.targetId, targetName: e.targetName })),
        score: {
          gpa: r.archive.length ? round2(points / r.archive.length) : null,
          submitted: r.archive.filter((a) => a.grade !== 'F').length,
          late: r.archive.filter((a) => a.grade === 'F').length,
        },
        me: me ? {
          desk: me.desk.slice(),
          tasks: Object.fromEntries(me.desk
            .map((fid) => r.folders.get(fid))
            .filter((f) => f && !f.ready && f.task && me.stations.includes(f.steps[f.stepIndex]))
            .map((f) => [f.id, f.task])),
          wifiUntil: me.wifiUntil,
          chat: me.chat,
        } : null,
      };
    }
    if (this.phase === 'results') view.results = this.results;
    return view;
  }
}

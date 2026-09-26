// Due at 11:59 — client. Talks to the room over a WebSocket; the server is
// the source of truth and this file turns its state into screens and effects.
import qrcode from './lib/qrcode.mjs';
import { unlockAudio, sfx, music, haptic, HAPTIC, isMuted, setMuted, hapticsEnabled, setHaptics } from './audio.js';
import { buildSky, confettiAt, sparkle, rain, flyTo, shake, floatTextAt, initRipples, startStatic, stopStatic } from './fx.js';
import { openTask, closeTask, currentTask, updateTaskTimer } from './tasks.js';

// ------------------------------------------------------------ constants
const STATIONS = {
  research: { name: 'Research', emoji: '🔎', verb: 'Find sources', desc: 'Pick the sources you can actually trust.' },
  write: { name: 'Write', emoji: '✍️', verb: 'Write it', desc: 'Put the sentences in the right order.' },
  design: { name: 'Design', emoji: '🎨', verb: 'Design it', desc: 'Pick the right chart for the job.' },
  edit: { name: 'Edit', emoji: '✅', verb: 'Proofread', desc: 'Catch the typo before the professor does.' },
};
const COURSES = {
  poster: 'BIO 110', reflection: 'PSY 101', infographic: 'GEO 120', summary: 'LIT 105', essay: 'ENG 101',
  deck: 'BUS 201', lab: 'CHEM 150', presentation: 'COMM 210', final: 'CAPSTONE 499',
  makeover: 'ART 140', caption: 'DES 115', proofread: 'WRIT 100', citations: 'HIST 110',
};
const DIFFS = [
  { id: 'freshman', label: 'Freshman', blurb: 'Chill. Perfect for your first game.' },
  { id: 'sophomore', label: 'Sophomore', blurb: 'The normal amount of chaos.' },
  { id: 'junior', label: 'Junior', blurb: 'Tighter deadlines. Work lands on the wrong desk.' },
  { id: 'senior', label: 'Senior', blurb: 'Finals week. Good luck.' },
];
const LENGTHS = [{ id: 120, label: '2 min' }, { id: 180, label: '3 min' }, { id: 270, label: '4½ min' }];
const RIVALS = [
  { id: 'off', label: 'Off', name: '', blurb: 'No rivals. Just you against the clock.' },
  { id: 'easy', label: '😴 Easy', name: 'Easy', blurb: 'Race a lazy rival group. Easy to beat.' },
  { id: 'medium', label: '🙂 Medium', name: 'Medium', blurb: 'Race a solid rival group. A fair fight.' },
  { id: 'hard', label: '😈 Hard', name: 'Hard', blurb: 'Race The Overachievers at full power. Very hard to beat!' },
];
const EVENTS = {
  wifi: { emoji: '📶', title: 'Chaos: Wi-Fi "died"!', text: (fx, you) => (fx.targetId === you ? 'A pretend outage: you\'re back in 5 seconds.' : `${fx.targetName}'s Wi-Fi "died" (just the game). Cover for them!`) },
  deadline: { emoji: '📣', title: 'Deadline moved up!', text: () => 'The professor wants everything 8 seconds sooner.' },
  extension: { emoji: '🙏', title: 'Extension granted!', text: () => '+12 seconds on every assignment.' },
  swap: { emoji: '🔀', title: 'Roles swapped!', text: () => 'Everyone has a new job. Say yours out loud!' },
  groupchat: { emoji: '💬', title: 'The group chat exploded', text: () => 'Clear your notifications to get back to work.' },
  printer: { emoji: '🖨️', title: 'Printer jam!', text: () => 'Nobody can submit for 6 seconds.' },
  final: { emoji: '⏰', title: '30 seconds to midnight!', text: () => 'Submit everything you can. NOW.' },
};
const GRADE_COLORS = { A: 'var(--gA)', B: 'var(--gB)', C: 'var(--gC)', D: 'var(--gD)', F: 'var(--gF)', I: '#8a90bd' };
const FATAL = {
  4001: { emoji: '🗂️', title: 'Open in another tab', text: 'This room is open in another tab or window.', rejoin: 'Play in this tab' },
  4003: { emoji: '🚪', title: 'You were removed', text: 'The host removed you from the room.' },
  4004: { emoji: '🔍', title: 'Room not found', text: 'That room has closed. Start a new one!' },
  4008: { emoji: '😴', title: 'Room went quiet', text: 'The room closed after 20 quiet minutes.', rejoin: 'Rejoin' },
  4009: { emoji: '🈵', title: 'Room is full', text: 'This room already has 8 players.' },
};
const RING = 119.38; // circumference of the folder timer ring (r = 19)

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
};
// Seats are per tab: a refresh keeps your seat, a second tab joins as a new player.
const seat = {
  get(code) { try { return sessionStorage.getItem(`due1159.token.${code}`); } catch { return null; } },
  set(code, token) { try { sessionStorage.setItem(`due1159.token.${code}`, token); } catch {} },
};
function loadHints() {
  try { return JSON.parse(store.get('due1159.hints', '{}')) || {}; } catch { return {}; }
}

// ------------------------------------------------------------ state
const S = {
  name: store.get('due1159.name', ''),
  code: null,
  token: null,
  view: null,
  players: new Map(),
  folders: new Map(),
  ws: null,
  wsOpen: false,
  retry: 0,
  retryTimer: null,
  pingTimer: null,
  offset: 0,
  bestRtt: Infinity,
  fatal: null,
  screen: 'home',
  lastPhase: null,
  boardOpen: false,
  hints: loadHints(),
  musicPref: store.get('due1159.music', 'auto'),
  banner: null,
  bannerTimer: null,
  jobTimer: null,
  finalShown: false,
  lastSecond: null,
  cdLast: null,
  tension: -1,
  resultsKey: null,
  pickerFor: null,
  dismissed: new Set(),
  wakeLock: null,
  tilesFor: null,
  qrFor: null,
  hint: null,
};

// ------------------------------------------------------------ tiny DOM helpers
const $ = (sel, root = document) => root.querySelector(sel);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

// Update a list of keyed children in place so existing elements (and their
// animations) survive re-renders. Elements marked data-leaving are left alone.
function keyed(container, items, keyOf, create, update) {
  const existing = new Map();
  for (const child of container.children) if (child.dataset.key) existing.set(child.dataset.key, child);
  let cursor = null;
  for (const item of items) {
    const key = String(keyOf(item));
    let el = existing.get(key);
    if (!el) {
      el = create(item);
      el.dataset.key = key;
    }
    existing.delete(key);
    update(el, item);
    const want = cursor ? cursor.nextElementSibling : container.firstElementChild;
    if (want !== el) container.insertBefore(el, want);
    cursor = el;
  }
  for (const el of existing.values()) if (!el.dataset.leaving) el.remove();
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const serverNow = () => Date.now() + S.offset;
const hashStr = (s) => { let x = 7; for (const c of s) x = (x * 31 + c.charCodeAt(0)) | 0; return Math.abs(x); };
const me = () => (S.view ? S.players.get(S.view.you) : null);
const isHost = () => !!S.view && S.view.hostId === S.view.you;

function avatarEl(p, size = '') {
  const a = h('span', { class: `avatar ${size}`, style: { '--pc': p.color }, 'aria-hidden': 'true' }, p.avatar);
  if (p.isBot) a.append(h('span', { class: 'badge', text: '🤖' }));
  return a;
}
const gradePill = (g) => h('span', { class: `grade-pill g-${g}`, text: g });
function gpaColor(gpa) {
  if (gpa == null) return '';
  if (gpa >= 3.5) return 'var(--gA)';
  if (gpa >= 2.5) return 'var(--gB)';
  if (gpa >= 1.5) return 'var(--gC)';
  if (gpa >= 0.5) return 'var(--gD)';
  return 'var(--gF)';
}
function settingsSummary(settings) {
  const diff = DIFFS.find((d) => d.id === settings.difficulty);
  const len = LENGTHS.find((l) => l.id === settings.length);
  const rv = RIVALS.find((r) => r.id === settings.rival);
  const parts = [diff && diff.label, len && len.label];
  if (rv && rv.id !== 'off') parts.push(`${rv.name} rivals`);
  return parts.filter(Boolean).join(' · ');
}

function clockText(progress) {
  const mins = 20 * 60 + Math.min(239, Math.floor(progress * 239));
  let hours = Math.floor(mins / 60) % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${String(mins % 60).padStart(2, '0')}`;
}

// ------------------------------------------------------------ toasts + modal
function toast(content, kind = '') {
  const box = $('#toasts');
  const t = h('div', { class: `toast ${kind}` }, content);
  box.append(t);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

function showModal({ emoji, title, text, body, actions = [] }) {
  const m = $('#modal');
  m.innerHTML = '';
  m.hidden = false;
  const box = h('div', { class: 'card modal-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    emoji ? h('div', { class: 'm-emoji', text: emoji }) : null,
    h('h3', { text: title }),
    text ? h('p', { text }) : null,
    body || null,
    h('div', { class: 'modal-actions' }, actions.map((a) => h('button', {
      class: `btn ${a.primary ? 'primary' : 'secondary'} wide`, type: 'button',
      onclick: () => { hideModal(); sfx.tap(); if (a.onClick) a.onClick(); },
    }, a.label))));
  m.append(box);
  const first = box.querySelector('input, button');
  if (first) setTimeout(() => first.focus(), 30);
}
function hideModal() {
  const m = $('#modal');
  m.hidden = true;
  m.innerHTML = '';
}

// ------------------------------------------------------------ networking
function send(obj) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj));
}

function connectNow() {
  clearTimeout(S.retryTimer);
  if (S.ws) {
    S.ws.onclose = null;
    try { S.ws.close(); } catch {}
  }
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${S.code}`);
  S.ws = ws;
  ws.onopen = () => {
    S.wsOpen = true;
    S.retry = 0;
    send({ t: 'hello', token: S.token, name: S.name });
    startPing();
    $('#conn').hidden = true;
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    onMessage(m);
  };
  ws.onclose = (e) => {
    if (S.ws !== ws) return;
    S.wsOpen = false;
    stopPing();
    if (S.fatal || !S.code) return;
    if (FATAL[e.code]) { fatal(e.code); return; }
    $('#conn').hidden = false;
    S.retryTimer = setTimeout(connectNow, Math.min(5000, 350 * 2 ** S.retry++));
  };
}

function startPing() {
  stopPing();
  const ping = () => send({ t: 'ping', ts: Date.now() });
  ping();
  S.pingTimer = setInterval(ping, 5000);
}
function stopPing() {
  clearInterval(S.pingTimer);
  S.pingTimer = null;
}

function onMessage(m) {
  if (m.t === 'welcome') {
    S.token = m.token;
    seat.set(S.code, m.token);
    if (m.restarted) toast('🔄 The room restarted, so everyone is back in the lobby.', 'warn');
  } else if (m.t === 'state') {
    onState(m);
  } else if (m.t === 'pong') {
    const rtt = Date.now() - m.ts;
    if (rtt <= S.bestRtt * 1.3 || rtt < 120) {
      S.offset = m.now + rtt / 2 - Date.now();
      S.bestRtt = Math.min(S.bestRtt, rtt);
    }
  } else if (m.t === 'closed') {
    fatal(m.code, m.reason);
  }
}

function fatal(code, reason) {
  if (S.fatal) return;
  S.fatal = code;
  stopPing();
  clearTimeout(S.retryTimer);
  if (S.ws) {
    S.ws.onclose = null;
    try { S.ws.close(); } catch {}
  }
  $('#conn').hidden = true;
  if (code === 4000) { goHome(); return; }
  const info = FATAL[code] || { emoji: '⚠️', title: 'Disconnected', text: reason || 'Lost the connection to the room.' };
  const actions = [];
  if (info.rejoin) actions.push({ label: info.rejoin, primary: true, onClick: () => { S.fatal = null; connectNow(); } });
  actions.push({ label: 'Back to home', primary: !actions.length, onClick: goHome });
  showModal({ ...info, actions });
}

function goHome() {
  S.fatal = null;
  S.code = null;
  S.view = null;
  S.lastPhase = null;
  S.resultsKey = null;
  if (S.ws) {
    S.ws.onclose = null;
    try { S.ws.close(); } catch {}
    S.ws = null;
  }
  stopPing();
  closeTask(true);
  closePicker();
  hideGameOverlays();
  music.stop();
  releaseWakeLock();
  history.replaceState(null, '', '/');
  showScreen('home');
}

// ------------------------------------------------------------ state handling
function onState(view) {
  const prevPhase = S.lastPhase;
  S.view = view;
  S.players = new Map(view.players.map((p) => [p.id, p]));
  S.folders = new Map(view.round ? view.round.folders.map((f) => [f.id, f]) : []);
  if (S.bestRtt === Infinity) S.offset = view.now - Date.now();
  if (!S.name) {
    const mine = S.players.get(view.you);
    if (mine) { S.name = mine.name; store.set('due1159.name', mine.name); }
  }

  const screen = view.phase === 'lobby' ? 'lobby' : view.phase === 'results' ? 'results' : 'game';
  if (screen !== S.screen) showScreen(screen);
  if (view.phase !== prevPhase) onPhaseChange(view.phase, prevPhase, view);
  S.lastPhase = view.phase;
  // Effects run before rendering so leaving folders can still animate from where they are.
  if (view.fx) for (const fx of view.fx) handleFx(fx, view);
  render();
  checkOpenSheets(view);
}

function showScreen(name) {
  S.screen = name;
  for (const sc of document.querySelectorAll('.screen')) sc.classList.toggle('active', sc.id === `screen-${name}`);
}

function onPhaseChange(phase, prev, view) {
  if (phase === 'countdown') startCountdown(view);
  if (phase === 'playing') {
    if (prev === 'countdown') finishCountdown();
    else {
      const m = me();
      if (m) showJobCard(m.stations, 'intro');
    }
    S.finalShown = false;
    S.lastSecond = null;
    if (shouldPlayMusic()) music.start();
    requestWakeLock();
  }
  if (phase === 'results' || phase === 'lobby') {
    $('#countdown').hidden = true;
    closeTask(true);
    closePicker();
    hideGameOverlays();
    music.stop();
    releaseWakeLock();
    setTension(0);
    document.body.classList.remove('final');
  }
}

function checkOpenSheets(view) {
  const r = view.round;
  const cur = currentTask();
  if (cur && !cur.done) {
    const task = r && r.me ? r.me.tasks[cur.folderId] : null;
    if (!task || task.id !== cur.taskId) {
      closeTask();
      if (view.phase === 'playing') toast('That folder moved on.', 'warn');
    }
  }
  if (S.pickerFor && (!r || !r.me || !r.me.desk.includes(S.pickerFor))) closePicker();
}

// ------------------------------------------------------------ effects from the server
function handleFx(fx, view) {
  const you = view.you;
  switch (fx.k) {
    case 'incoming':
      sfx.arrive();
      haptic(HAPTIC.arrive);
      toast(fx.rescued ? `🛟 ${fx.from} dropped out. You got their ${fx.emoji} ${fx.title}` : `📨 ${fx.from} sent you ${fx.emoji} ${fx.title}`);
      break;
    case 'new':
      if (fx.to === you) {
        sfx.arrive();
        haptic(HAPTIC.arrive);
        toast(`📬 New assignment: ${fx.emoji} ${fx.title}`);
      }
      break;
    case 'sent': {
      sfx.send();
      haptic(HAPTIC.send);
      bumpHint('send');
      const card = deskCard(fx.folder);
      const chip = teamChip(fx.to);
      if (card) {
        card.dataset.leaving = '1';
        flyTo(card, chip || $('#team')).then(() => {
          card.remove();
          if (chip) {
            chip.classList.remove('catch');
            void chip.offsetWidth;
            chip.classList.add('catch');
          }
        });
      }
      break;
    }
    case 'submitted': {
      const mine = fx.byId === you;
      if (mine) {
        sfx.submit(fx.grade);
        haptic(HAPTIC.submit);
        bumpHint('submit');
        const card = deskCard(fx.folder);
        if (card) {
          card.dataset.leaving = '1';
          card.classList.remove('urgent', 'pending');
          card.append(h('div', { class: 'stamp', style: { '--sc': GRADE_COLORS[fx.grade] }, text: fx.grade }));
          card.classList.add('leaving');
          if (fx.grade === 'A') setTimeout(() => confettiAt(card, { count: 80 }), 260);
          else setTimeout(() => sparkle(card, '#ffffff'), 260);
          setTimeout(() => card.remove(), 1100);
        }
      } else {
        sfx.teamSubmit(fx.grade);
      }
      toast([gradePill(fx.grade), ` ${mine ? 'You' : fx.by} submitted ${fx.emoji} ${fx.title}`], fx.grade === 'A' || fx.grade === 'B' ? 'good' : '');
      break;
    }
    case 'late': {
      const mine = fx.holderId === you;
      sfx.late(mine);
      if (mine) {
        haptic(HAPTIC.late);
        shake();
        const card = deskCard(fx.folder);
        if (card) {
          card.dataset.leaving = '1';
          card.classList.add('burning');
          setTimeout(() => card.remove(), 1000);
        }
      }
      toast([gradePill('F'), ` ${fx.emoji} ${fx.title} was late${!mine && fx.holder ? ` (on ${fx.holder}'s desk)` : ''}!`], 'bad');
      break;
    }
    case 'stepDone':
      break;
    case 'event':
      showEvent(fx, view);
      break;
    case 'newJob':
      if (fx.reason === 'swap') setTimeout(() => showJobCard(fx.stations, 'swap'), 350);
      else showJobCard(fx.stations, 'cover', fx.added);
      break;
    case 'joined':
      if (fx.id !== you) {
        sfx.join();
        if (!fx.bot) toast(`👋 ${fx.name} joined${fx.late ? ' (late, typical)' : ''}`);
      }
      break;
    case 'left':
      sfx.leave();
      if (!fx.bot || view.phase !== 'lobby') toast(`👋 ${fx.name} left`);
      break;
    case 'away':
      toast(`💤 ${fx.name} dropped out. Their folders were shared out.`, 'warn');
      break;
    case 'back':
      toast(`🙌 ${fx.name} is back!`, 'good');
      break;
    case 'host':
      if (fx.id === you) toast('👑 You are the host now.', 'good');
      break;
    case 'lead': {
      const box = $('#versus');
      box.classList.remove('flash');
      void box.offsetWidth;
      box.classList.add('flash');
      if (fx.leader === 'you') {
        sfx.extension();
        haptic(HAPTIC.success);
        toast(`💪 Your group took the lead over ${fx.rival}!`, 'good');
      } else {
        sfx.late(false);
        haptic(HAPTIC.wrong);
        toast(`🤓 ${fx.rival} took the lead!`, 'warn');
      }
      break;
    }
    case 'err':
      handleError(fx);
      break;
    case 'stale':
      for (const c of document.querySelectorAll('.folder.pending')) c.classList.remove('pending');
      break;
    default:
      break;
  }
}

function handleError(fx) {
  for (const c of document.querySelectorAll('.folder.pending')) c.classList.remove('pending');
  const messages = {
    deskFull: `📚 ${fx.name}'s desk is full! Try someone else.`,
    away: `💤 ${fx.name} is offline right now.`,
    printer: '🖨️ The printer is jammed! Try again in a second.',
    blocked: "✋ You can't do that right now!",
    notYourJob: `That step needs ${STATIONS[fx.station] ? STATIONS[fx.station].emoji : ''} ${STATIONS[fx.station] ? STATIONS[fx.station].name : 'someone else'}.`,
  };
  sfx.wrong();
  haptic(HAPTIC.wrong);
  toast(messages[fx.code] || 'That did not work.', 'bad');
}

function deskCard(fid) {
  return document.querySelector(`#desk .folder[data-key="${fid}"]`);
}
function teamChip(pid) {
  return document.querySelector(`#team [data-key="${pid}"]`);
}

// ------------------------------------------------------------ rendering
function render() {
  if (!S.view) return;
  if (S.screen === 'lobby') renderLobby();
  else if (S.screen === 'game') renderGame();
  else if (S.screen === 'results') renderResults();
  updateSoundButtons();
}

// ---------- lobby
function renderLobby() {
  const v = S.view;
  const host = isHost();
  if (S.tilesFor !== v.code) {
    const tiles = $('#code-tiles');
    tiles.innerHTML = '';
    for (const ch of v.code) tiles.append(h('div', { class: 'code-tile', text: ch }));
    S.tilesFor = v.code;
    S.qrFor = null;
    $('#qr-card').hidden = true;
  }
  $('#player-count').textContent = `${v.players.length} of 8`;
  const list = $('#players');
  const empty = list.querySelector('.player.empty');
  if (empty) empty.remove();
  keyed(list, v.players, (p) => p.id, createPlayerCard, (el, p) => updatePlayerCard(el, p, v, host));
  if (v.players.length < 8) list.append(h('div', { class: 'player empty', text: '+ Invite a friend' }));

  $('#host-panel').hidden = !host;
  $('#wait-panel').hidden = host;
  if (host) {
    segmented($('#diff-seg'), DIFFS, v.settings.difficulty, (d) => send({ t: 'settings', difficulty: d.id }));
    segmented($('#len-seg'), LENGTHS, v.settings.length, (l) => send({ t: 'settings', length: l.id }));
    const diff = DIFFS.find((d) => d.id === v.settings.difficulty);
    $('#diff-blurb').textContent = diff ? diff.blurb : '';
    const rivalLevel = v.settings.rival || 'off';
    segmented($('#rival-seg'), RIVALS, rivalLevel, (r) => send({ t: 'settings', rival: r.id }));
    const rv = RIVALS.find((r) => r.id === rivalLevel);
    $('#rival-blurb').textContent = rv ? rv.blurb : '';
    const bots = v.players.filter((p) => p.isBot).length;
    const humans = v.players.length - bots;
    $('#add-bot').disabled = v.players.length >= 8;
    $('#remove-bot').disabled = bots === 0;
    const solo = humans === 1 && bots === 0;
    $('#solo-tip').hidden = !solo;
    $('#quick-btn').hidden = !solo;
    $('#start-btn').textContent = solo ? '🎒 Start solo (all 4 jobs)' : '🔔 Start the semester';
    $('#start-btn').classList.toggle('glow', !solo);
    $('#quick-btn').classList.toggle('primary', solo);
    $('#quick-btn').classList.toggle('glow', solo);
    $('#start-btn').classList.toggle('primary', !solo);
    $('#start-btn').classList.toggle('secondary', solo);
  } else {
    const hostPlayer = S.players.get(v.hostId);
    $('#wait-text').textContent = hostPlayer ? `Waiting for ${hostPlayer.name} to start` : 'Waiting for the host to start';
    $('#wait-settings').textContent = settingsSummary(v.settings);
  }
  const best = $('#best-ribbon');
  best.hidden = v.best == null;
  if (v.best != null) best.textContent = `🏆 Best group GPA this session: ${v.best.toFixed(2)}`;
  renderPrefs();
}

function createPlayerCard(p) {
  return h('div', { class: 'player' },
    avatarEl(p),
    h('div', { class: 'p-info' }, h('div', { class: 'p-name' }), h('div', { class: 'p-sub' })));
}

function updatePlayerCard(el, p, v, host) {
  const av = el.querySelector('.avatar');
  av.style.setProperty('--pc', p.color);
  el.classList.toggle('me', p.id === v.you);
  el.classList.toggle('off', !p.connected);
  el.querySelector('.p-name').textContent = p.name;
  const tags = [];
  if (p.id === v.hostId) tags.push('👑 Host');
  if (p.id === v.you) tags.push('You');
  if (p.isBot) tags.push('🤖 Bot');
  if (!p.connected) tags.push('Reconnecting…');
  el.querySelector('.p-sub').textContent = tags.join(' · ') || 'Ready';
  let btn = el.querySelector('.kick');
  const wantKick = host && p.id !== v.you;
  const wantEdit = p.id === v.you;
  if (wantKick || wantEdit) {
    if (!btn) {
      btn = h('button', { class: 'kick', type: 'button' });
      el.append(btn);
    }
    btn.textContent = wantEdit ? '✏️' : '✕';
    btn.setAttribute('aria-label', wantEdit ? 'Change your name' : `Remove ${p.name}`);
    btn.onclick = wantEdit ? renameModal : () => kickPlayer(p.id);
  } else if (btn) btn.remove();
}

function kickPlayer(id) {
  const p = S.players.get(id);
  if (!p) return;
  if (p.isBot) { send({ t: 'kick', id }); return; }
  showModal({
    emoji: '🚪', title: `Remove ${p.name}?`, text: 'They can rejoin with the room code.',
    actions: [{ label: 'Remove', primary: true, onClick: () => send({ t: 'kick', id }) }, { label: 'Cancel' }],
  });
}

function renameModal() {
  const mine = me();
  if (!mine) return;
  const input = h('input', { class: 'input', maxlength: '16', value: mine.name, 'aria-label': 'Your name', autocomplete: 'nickname' });
  const save = () => {
    const name = input.value.trim();
    if (!name) return;
    S.name = name;
    store.set('due1159.name', name);
    send({ t: 'rename', name });
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { save(); hideModal(); } });
  showModal({ emoji: '✏️', title: 'What should we call you?', body: input, actions: [{ label: 'Save', primary: true, onClick: save }, { label: 'Cancel' }] });
}

function segmented(container, items, current, onPick) {
  if (!container.children.length) {
    for (const it of items) {
      container.append(h('button', {
        type: 'button', dataset: { id: String(it.id) }, text: it.label,
        onclick: () => { sfx.tap(); haptic(HAPTIC.tap); onPick(it); },
      }));
    }
  }
  for (const b of container.children) {
    const on = b.dataset.id === String(current);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

function renderPrefs() {
  const musicOn = shouldPlayMusic();
  $('#pref-sound').textContent = isMuted() ? '🔇 Sounds: off' : '🔊 Sounds: on';
  $('#pref-music').textContent = musicOn ? '🎵 Music here: on' : '🎵 Music here: off';
  $('#pref-haptics').textContent = hapticsEnabled() ? '📳 Vibration: on' : '📴 Vibration: off';
  for (const [id, on] of [['#pref-sound', !isMuted()], ['#pref-music', musicOn], ['#pref-haptics', hapticsEnabled()]]) {
    $(id).classList.toggle('on', on);
    $(id).setAttribute('aria-pressed', String(on));
  }
}

function shouldPlayMusic() {
  if (S.musicPref === 'on') return true;
  if (S.musicPref === 'off') return false;
  return isHost(); // by default only the host's device plays music, so a room of phones stays in sync
}

// ---------- game
function renderGame() {
  const v = S.view;
  const r = v.round;
  if (!r) return;
  const mine = me();
  const gpaText = r.score.gpa == null ? '–' : r.score.gpa.toFixed(1);
  const gpaEl = $('#gpa-value');
  if (gpaEl.textContent !== gpaText) {
    gpaEl.textContent = gpaText;
    gpaEl.style.color = gpaColor(r.score.gpa);
    gpaEl.classList.remove('pop');
    void gpaEl.offsetWidth;
    gpaEl.classList.add('pop');
  }
  renderVersus(r);
  renderTeam(v);
  if (mine) renderJob(mine);
  renderDesk(v, r, mine);
  renderBoard(v, r);
  renderBlockers(r);
}

// Tug-of-war bar: your group's GPA against the rival group's.
function renderVersus(r) {
  const box = $('#versus');
  const rival = r.rival;
  box.hidden = !rival;
  if (!rival) return;
  const mine = r.score.gpa;
  const theirs = rival.gpa;
  const youText = mine == null ? '–' : mine.toFixed(2);
  const rivalText = theirs == null ? '–' : theirs.toFixed(2);
  if ($('#vs-you').textContent !== youText) $('#vs-you').textContent = youText;
  if ($('#vs-rival').textContent !== rivalText) $('#vs-rival').textContent = rivalText;
  const a = mine == null ? 0.5 : mine + 0.5;
  const b = theirs == null ? 0.5 : theirs + 0.5;
  const share = `${(a / (a + b)) * 100}%`;
  $('#vs-fill').style.width = share;
  box.querySelector('.vs-mid').style.left = share;
  box.classList.toggle('ahead', mine != null && theirs != null && mine > theirs);
  box.classList.toggle('behind', mine != null && theirs != null && theirs > mine);
}

function renderTeam(v) {
  const list = [...v.players].sort((a, b) => (a.id === v.you ? -1 : b.id === v.you ? 1 : 0));
  keyed($('#team'), list, (p) => p.id,
    (p) => h('div', { class: 'mate' }, avatarEl(p, 'sm'), h('span', { class: 'mate-name' }), h('span', { class: 'mate-jobs' })),
    (el, p) => {
      el.querySelector('.avatar').style.setProperty('--pc', p.color);
      el.classList.toggle('me', p.id === v.you);
      el.classList.toggle('off', !p.connected || p.away);
      el.classList.toggle('static', p.wifi);
      el.querySelector('.mate-name').textContent = p.id === v.you ? 'You' : p.name;
      const jobs = el.querySelector('.mate-jobs');
      const sig = `${p.stations.join()}|${p.load}`;
      if (jobs.dataset.sig !== sig) {
        jobs.dataset.sig = sig;
        jobs.innerHTML = '';
        jobs.append(p.stations.map((s) => STATIONS[s].emoji).join('') || '—');
        const load = h('span', { class: `mate-load${p.load >= 6 ? ' full' : ''}` });
        for (let i = 0; i < Math.min(p.load, 6); i++) load.append(h('i'));
        jobs.append(load);
      }
      const status = p.wifi ? '📶✖' : p.chat ? '💬' : (!p.connected || p.away) ? '💤' : p.busy ? '⚙️' : '';
      let st = el.querySelector('.status');
      if (status) {
        if (!st) { st = h('span', { class: 'status' }); el.append(st); }
        st.textContent = status;
      } else if (st) st.remove();
      el.setAttribute('aria-label', `${p.name}: ${p.stations.map((s) => STATIONS[s].name).join(' and ') || 'no job'}, ${p.load} folders`);
    });
}

function renderJob(mine) {
  const job = $('#job');
  const sig = mine.stations.join();
  if (job.dataset.sig === sig) return;
  const changed = job.dataset.sig != null && job.dataset.sig !== '';
  job.dataset.sig = sig;
  job.innerHTML = '';
  job.style.setProperty('--c', mine.stations[0] ? `var(--${mine.stations[0]})` : '#888');
  job.append(
    h('span', { class: 'job-label', text: mine.stations.length > 1 ? 'YOUR JOBS' : 'YOUR JOB' }),
    h('span', { class: 'job-names' }, mine.stations.map((s) => h('span', { class: `job-chip st-${s}`, text: `${STATIONS[s].emoji} ${STATIONS[s].name}` }))),
    h('button', { class: 'help-btn', type: 'button', 'data-help': '1', 'aria-label': 'How to play' }, '❓ How to play'));
  if (changed) {
    job.classList.remove('flash');
    void job.offsetWidth;
    job.classList.add('flash');
  }
}

function renderDesk(v, r, mine) {
  const desk = $('#desk');
  const ids = r.me ? r.me.desk : [];
  const folders = ids.map((id) => S.folders.get(id)).filter(Boolean);
  let empty = desk.querySelector('.desk-empty');
  if (!folders.length && !desk.querySelector('.folder[data-leaving]')) {
    if (!empty) {
      empty = h('div', { class: 'desk-empty' },
        h('span', { class: 'mug' }, h('span', { class: 'steam' }, h('i'), h('i'), h('i')), '☕'),
        h('b', { text: 'Your desk is clear.' }),
        h('span', { text: 'Shout what you need, or wait for work to land here.' }));
      desk.append(empty);
    }
  } else if (empty) empty.remove();
  keyed(desk, folders, (f) => f.id, createFolder, (el, f) => updateFolder(el, f, v, r, mine));
  placeHint();
}

function createFolder(f) {
  const el = h('article', { class: 'folder arrive', 'data-kind': COURSES[f.kind] || 'ASSIGNMENT' },
    h('div', { class: 'f-title' }, h('span', { class: 'f-emoji', text: f.emoji }), h('span', { text: f.title })),
    h('div', { class: 'f-topic', text: `${f.topic.emoji} ${f.topic.name}` }),
    h('div', { class: 'f-steps' }),
    h('div', { class: 'f-actions' }));
  const ring = h('div', { class: 'f-ring', 'aria-hidden': 'true' });
  ring.innerHTML = `<svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="19"/><circle class="fg" cx="22" cy="22" r="19" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg><span class="f-secs"></span>`;
  el.append(ring);
  el._fg = ring.querySelector('.fg');
  el._secs = ring.querySelector('.f-secs');
  el.style.setProperty('--tilt', `${(hashStr(f.id) % 5) - 2}deg`);
  el.addEventListener('animationend', (e) => { if (e.animationName === 'arrive') el.classList.remove('arrive'); });
  return el;
}

function updateFolder(el, f, v, r, mine) {
  const now = serverNow();
  const need = f.ready ? null : f.steps[f.stepIndex];
  const canDo = !!(need && mine && mine.stations.includes(need));
  const blocked = !!(r.me && (r.me.wifiUntil > now || r.me.chat.length > 0));
  const jammed = r.printerUntil > now;
  const owners = need && !canDo
    ? v.players.filter((p) => p.id !== v.you && p.stations.includes(need) && p.connected && !p.away).sort((a, b) => a.load - b.load)
    : [];
  el.classList.toggle('ready', f.ready);
  el.style.setProperty('--c', need ? `var(--${need})` : 'var(--good)');
  el.setAttribute('aria-label', `${f.title} about ${f.topic.name}`);

  const stepSig = `${f.stepIndex}|${f.ready}`;
  if (el.dataset.stepSig !== stepSig) {
    el.dataset.stepSig = stepSig;
    const steps = el.querySelector('.f-steps');
    steps.innerHTML = '';
    f.steps.forEach((s, i) => {
      if (i) steps.append(h('span', { class: 'step-arrow', text: '›' }));
      const state = f.ready || i < f.stepIndex ? 'done' : i === f.stepIndex ? 'now' : '';
      steps.append(h('span', { class: `step ${state}`, style: { '--c': `var(--${s})` }, title: STATIONS[s].name }, STATIONS[s].emoji));
    });
  }

  const hasTask = !!(r.me && r.me.tasks[f.id]);
  const sig = [f.stepIndex, f.ready, canDo, jammed, blocked, hasTask, owners.map((o) => `${o.id}:${o.load}`).join(',')].join('|');
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  el.classList.remove('pending');
  const actions = el.querySelector('.f-actions');
  actions.innerHTML = '';
  if (f.ready) {
    actions.append(h('button', {
      class: `btn submit${jammed ? ' jammed' : ''}`, type: 'button', disabled: jammed || blocked, dataset: { hint: 'submit' },
      onclick: () => doSubmit(f.id),
    }, jammed ? '🖨️ Printer jammed…' : '⬆️ Submit it!'));
  } else if (canDo) {
    const st = STATIONS[need];
    actions.append(h('button', {
      class: 'btn do', type: 'button', disabled: blocked || !hasTask, dataset: { hint: 'do' },
      onclick: () => doTask(f.id),
    }, `${st.emoji} ${st.verb}`));
  } else {
    const st = STATIONS[need];
    actions.append(h('div', { class: 'needs', text: owners.length ? `Needs ${st.emoji} ${st.name}. Send it to:` : `Needs ${st.emoji} ${st.name}, but nobody has that job right now.` }));
    owners.slice(0, 3).forEach((o, i) => {
      const full = o.load >= 6;
      actions.append(h('button', {
        class: `send-chip${i === 0 && !full ? ' best' : ''}`, type: 'button', disabled: blocked || full,
        dataset: i === 0 ? { hint: 'send' } : null, onclick: () => doPass(f.id, o.id),
      }, avatarEl(o, 'xs'), o.name, h('span', { class: 'load', text: full ? 'desk full' : o.load === 0 ? 'free' : `${o.load} 📁` })));
    });
    actions.append(h('button', { class: 'send-more', type: 'button', disabled: blocked, onclick: () => openPicker(f.id) }, owners.length ? 'Someone else…' : 'Pass it to…'));
  }
}

// One pulsing coach-mark at a time, for the first couple of games.
function placeHint() {
  const texts = { submit: '👈 Submit before it\'s late!', do: '👈 Tap to do your part', send: '👈 Pass it to them!' };
  let target = null;
  let kind = null;
  if (S.screen === 'game') {
    for (const k of ['submit', 'do', 'send']) {
      if ((S.hints[k] || 0) >= 2) continue;
      const btn = document.querySelector(`#desk .folder:not([data-leaving]) [data-hint="${k}"]:not(:disabled)`);
      if (btn) { target = btn; kind = k; break; }
    }
  }
  if (S.hint && S.hint.btn === target && S.hint.el.isConnected) return;
  if (S.hint) S.hint.el.remove();
  S.hint = null;
  if (!target) return;
  const tip = h('span', { class: 'hint', text: texts[kind], 'aria-hidden': 'true' });
  target.after(tip);
  S.hint = { btn: target, el: tip };
}

function bumpHint(kind) {
  S.hints[kind] = (S.hints[kind] || 0) + 1;
  store.set('due1159.hints', JSON.stringify(S.hints));
}

function renderBoard(v, r) {
  const wide = window.matchMedia('(min-width: 980px)').matches;
  const toggle = $('#board-toggle');
  toggle.textContent = `📋 Everyone's assignments (${r.folders.length}) ${S.boardOpen ? '▴' : '▾'}`;
  const drawer = $('#board-drawer');
  drawer.hidden = wide || !S.boardOpen;
  const host = wide ? $('#board') : drawer;
  if (!wide && !S.boardOpen) return;
  if (!host.querySelector('.board-list')) {
    host.innerHTML = '';
    host.append(
      h('div', { class: 'board-head' }, h('span', { text: 'All assignments' }), h('span', { class: 'score-line' })),
      h('div', { class: 'board-list board-card' }));
  }
  const score = host.querySelector('.score-line');
  const sSig = `${r.score.submitted}|${r.score.late}`;
  if (score.dataset.sig !== sSig) {
    score.dataset.sig = sSig;
    score.innerHTML = '';
    score.append(h('span', { class: 'grade-pill g-A', text: `✓${r.score.submitted}` }), h('span', { class: 'grade-pill g-F', text: `✗${r.score.late}` }));
  }
  const folders = [...r.folders].sort((a, b) => a.dueAt - b.dueAt);
  keyed(host.querySelector('.board-list'), folders, (f) => f.id,
    (f) => {
      const row = h('div', { class: 'board-row' },
        h('span', { class: 'b-emoji', text: f.emoji }),
        h('div', {}, h('div', { class: 'b-title', text: `${f.title} · ${f.topic.name}` }), h('div', { class: 'b-sub' })),
        h('span', { class: 'b-secs' }));
      row._secs = row.querySelector('.b-secs');
      return row;
    },
    (row, f) => {
      const holder = S.players.get(f.holderId);
      const sub = row.querySelector('.b-sub');
      const sig = `${f.holderId}|${f.stepIndex}|${f.ready}`;
      if (row.dataset.sig !== sig) {
        row.dataset.sig = sig;
        sub.innerHTML = '';
        if (holder) sub.append(avatarEl(holder, 'xs'), ` ${holder.id === v.you ? 'You' : holder.name} · `);
        const mini = h('span', { class: 'mini-steps' });
        f.steps.forEach((s, i) => mini.append(h('i', { class: f.ready || i < f.stepIndex ? 'done' : i === f.stepIndex ? 'now' : '' })));
        sub.append(mini, f.ready ? ' ready!' : '');
      }
      row.classList.toggle('mine', f.holderId === v.you);
    });
}

// Wi-Fi outage and group-chat overlays for this player.
function renderBlockers(r) {
  const mine = r.me;
  if (!mine) return;
  const now = serverNow();
  const wifi = $('#wifi');
  if (mine.wifiUntil > now && wifi.hidden) {
    wifi.hidden = false;
    S.wifiFrom = now;
    startStatic($('#static'));
    closeTask(true);
    closePicker();
  }
  const chat = $('#chat');
  const bubbles = mine.chat.filter((b) => !S.dismissed.has(b.id));
  if (mine.chat.length) {
    if (chat.hidden) {
      chat.hidden = false;
      chat.innerHTML = '';
      chat.append(h('div', { class: 'chat-title', text: '💬 The group chat exploded. Tap to clear it!' }));
      closeTask(true);
      closePicker();
    }
    const have = new Set([...chat.querySelectorAll('.bubble')].map((b) => Number(b.dataset.id)));
    for (const b of bubbles) {
      if (have.has(b.id)) continue;
      const node = h('button', { class: 'bubble', type: 'button', dataset: { id: String(b.id) }, 'aria-label': `Dismiss: ${b.text}` },
        h('span', { class: 'avatar xs', style: { '--pc': '#5aa9ff' }, text: '💬' }),
        h('span', {}, h('div', { class: 'b-from', text: b.from }), h('div', { class: 'b-text', text: b.text })),
        h('span', { class: 'b-x', text: '✕' }));
      node.addEventListener('click', () => {
        if (S.dismissed.has(b.id)) return;
        S.dismissed.add(b.id);
        sfx.pop();
        haptic(HAPTIC.tap);
        node.classList.add('gone');
        send({ t: 'dismiss', id: b.id });
        setTimeout(() => node.remove(), 300);
      });
      chat.append(node);
    }
  } else if (!chat.hidden) {
    chat.hidden = true;
    chat.innerHTML = '';
    S.dismissed.clear();
  }
}

function hideGameOverlays() {
  for (const id of ['#wifi', '#chat', '#jobcard', '#banner']) $(id).hidden = true;
  stopStatic();
  S.dismissed.clear();
  S.banner = null;
}

// ---------- actions
function doTask(fid) {
  const r = S.view && S.view.round;
  const task = r && r.me ? r.me.tasks[fid] : null;
  const f = S.folders.get(fid);
  if (!task || !f) return;
  sfx.tap();
  haptic(HAPTIC.tap);
  closePicker();
  openTask({
    folder: f,
    task,
    onDone: (ms) => { send({ t: 'done', folder: fid, task: task.id, ms: Math.round(ms) }); bumpHint('do'); },
    onWrong: () => send({ t: 'oops', folder: fid }),
  });
}

function doPass(fid, toId) {
  sfx.tap();
  haptic(HAPTIC.tap);
  closePicker();
  const card = deskCard(fid);
  if (card) card.classList.add('pending');
  send({ t: 'pass', folder: fid, to: toId });
}

function doSubmit(fid) {
  sfx.tap();
  haptic(HAPTIC.tap);
  const card = deskCard(fid);
  if (card) card.classList.add('pending');
  send({ t: 'submit', folder: fid });
}

function openPicker(fid) {
  const v = S.view;
  const f = S.folders.get(fid);
  if (!v || !f) return;
  sfx.tap();
  const need = f.ready ? null : f.steps[f.stepIndex];
  const el = $('#picker');
  el.innerHTML = '';
  el.className = 'sheet picker';
  el.style.setProperty('--c', need ? `var(--${need})` : 'var(--good)');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Pass this folder');
  S.pickerFor = fid;
  const mates = v.players.filter((p) => p.id !== v.you)
    .sort((a, b) => (Number(b.stations.includes(need)) - Number(a.stations.includes(need))) || a.load - b.load);
  el.append(
    h('div', { class: 'sheet-grip' }),
    h('div', { class: 'sheet-head' },
      h('div', {},
        h('div', { class: 'sheet-kicker', text: `${f.emoji} ${f.title}: ${f.topic.name}` }),
        h('h3', { class: 'sheet-prompt', text: need ? `Who gets it? It needs ${STATIONS[need].emoji} ${STATIONS[need].name}.` : 'Who should submit it?' })),
      h('button', { class: 'sheet-close', type: 'button', 'aria-label': 'Close', text: '✕', onclick: closePicker })));
  const list = h('div', { class: 'pick-list' });
  mates.forEach((p, i) => {
    const off = !p.connected || p.away;
    const full = p.load >= 6;
    const fits = need && p.stations.includes(need);
    list.append(h('button', {
      class: `pick${fits && i === 0 ? ' best' : ''}`, type: 'button', disabled: off || full, onclick: () => doPass(fid, p.id),
    },
    avatarEl(p, 'sm'),
    h('div', {}, h('div', { class: 'p-name', text: p.name }), h('div', { class: 'p-jobs', text: p.stations.map((s) => `${STATIONS[s].emoji} ${STATIONS[s].name}`).join(' · ') || 'No job' })),
    h('span', { class: 'p-load', text: off ? 'offline' : full ? 'desk full' : `${p.load} 📁` })));
  });
  if (!mates.length) list.append(h('p', { text: "You're the only one here. Do it yourself!" }));
  el.append(list);
  $('#sheet-backdrop').hidden = false;
  el.hidden = false;
  document.body.classList.add('sheet-open');
}

function closePicker() {
  const el = $('#picker');
  S.pickerFor = null;
  if (el.hidden) return;
  el.hidden = true;
  el.innerHTML = '';
  if (!currentTask()) {
    $('#sheet-backdrop').hidden = true;
    document.body.classList.remove('sheet-open');
  }
}

// ---------- countdown, job cards, events
function jobCard(stations, label) {
  const first = STATIONS[stations[0]];
  return h('div', { class: 'jobcard-inner', style: { '--c': stations[0] ? `var(--${stations[0]})` : '#888' } },
    h('span', { class: 'jc-label', text: label }),
    h('span', { class: 'jc-emoji', text: stations.map((s) => STATIONS[s].emoji).join(' ') || '🎓' }),
    h('span', { class: 'jc-name', text: stations.map((s) => STATIONS[s].name).join(' + ') || 'Student' }),
    h('span', { class: 'jc-desc', text: stations.length === 1 && first ? first.desc : stations.length > 1 ? 'You cover more than one job this round.' : '' }));
}

function startCountdown(view) {
  const el = $('#countdown');
  el.innerHTML = '';
  el.hidden = false;
  // Reset the HUD so last round's 11:5x doesn't flash behind the countdown.
  $('#clock-time').textContent = '8:00';
  $('#clock').classList.remove('late', 'panic');
  $('#night-fill').style.width = '0%';
  $('#moon').style.left = '3%';
  $('#gpa-value').textContent = '–';
  $('#gpa-value').style.color = '';
  $('#desk').innerHTML = '';
  S.finalShown = false;
  const mine = view.players.find((p) => p.id === view.you);
  const stations = mine ? mine.stations : [];
  el.append(h('div', { class: 'cd-wrap' },
    h('p', { class: 'cd-line', text: "It's 8:00 PM." }),
    h('p', { class: 'cd-line sub', text: 'The group project is due at 11:59. Talk to each other!' }),
    view.round && view.round.rival ? h('p', { class: 'cd-line sub cd-rival', text: `⚔️ Beat ${view.round.rival.name} 🤓 to the best GPA!` }) : null,
    h('div', { class: 'cd-num', id: 'cd-num' }),
    h('div', { class: 'cd-job' }, jobCard(stations, stations.length > 1 ? 'YOUR JOBS' : 'YOUR JOB'))));
  S.cdLast = null;
  sfx.whoosh();
  haptic(HAPTIC.arrive);
}

function updateCountdown(now, r) {
  const num = $('#cd-num');
  if (!num) return;
  const n = Math.ceil((r.startAt - now) / 1000);
  if (n >= 1 && n <= 3 && S.cdLast !== n) {
    S.cdLast = n;
    num.textContent = String(n);
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
    sfx.count();
    haptic(HAPTIC.count);
  }
}

function finishCountdown() {
  const el = $('#countdown');
  const num = $('#cd-num');
  sfx.go();
  haptic(HAPTIC.go);
  if (num) {
    num.textContent = 'GO!';
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
  }
  setTimeout(() => { el.hidden = true; el.innerHTML = ''; }, 550);
}

function showJobCard(stations, reason, added) {
  if (!stations || !stations.length) return;
  const el = $('#jobcard');
  el.innerHTML = '';
  const label = reason === 'swap' ? '🔀 YOUR NEW JOB' : reason === 'cover' ? '🆘 COVER THIS JOB TOO' : stations.length > 1 ? 'YOUR JOBS' : 'YOUR JOB';
  el.append(jobCard(reason === 'cover' && added ? [added] : stations, label));
  el.hidden = false;
  if (reason !== 'intro') { sfx.swap(); haptic(HAPTIC.event); }
  el.onclick = () => { el.hidden = true; };
  clearTimeout(S.jobTimer);
  S.jobTimer = setTimeout(() => { el.hidden = true; }, 2000);
}

function showEvent(fx, view) {
  const info = EVENTS[fx.kind];
  if (!info) return;
  const now = serverNow();
  const ev = view.round ? view.round.events.find((e) => e.kind === fx.kind) : null;
  const until = ev ? ev.until : now + 3500;
  const banner = $('#banner');
  banner.innerHTML = '';
  banner.className = `banner ev-${fx.kind}`;
  banner.setAttribute('role', 'status');
  banner.append(
    h('span', { class: 'ev-emoji', text: info.emoji }),
    h('div', {}, h('div', { class: 'ev-title', text: info.title }), h('div', { class: 'ev-text', text: info.text(fx, view.you) })),
    h('div', { class: 'ev-bar' }, h('i')));
  banner.hidden = false;
  S.banner = { from: now, until: Math.max(until, now + 2500) };
  haptic(HAPTIC.event);
  switch (fx.kind) {
    case 'deadline':
      sfx.alarm();
      shake(undefined, true);
      floatOnFolders('−8s', '#ff4d5e');
      break;
    case 'extension':
      sfx.extension();
      floatOnFolders('+12s', '#39d98a');
      break;
    case 'swap':
      sfx.swap();
      shake();
      break;
    case 'groupchat':
      sfx.chat();
      break;
    case 'printer':
      sfx.printer();
      shake();
      break;
    case 'wifi':
      sfx.static(1.6);
      if (fx.targetId === view.you) shake(undefined, true);
      break;
    case 'final':
      sfx.alarm();
      shake(undefined, true);
      break;
    default:
      break;
  }
  clearTimeout(S.bannerTimer);
  S.bannerTimer = setTimeout(hideBanner, clamp(S.banner.until - now, 2600, 7000));
}

function hideBanner() {
  const b = $('#banner');
  S.banner = null;
  if (b.hidden) return;
  b.classList.add('out');
  setTimeout(() => { b.hidden = true; b.classList.remove('out'); }, 350);
}

function floatOnFolders(text, color) {
  for (const card of document.querySelectorAll('#desk .folder:not([data-leaving])')) floatTextAt(card.querySelector('.f-ring'), text, color);
}

// ---------- results
function renderResults() {
  const v = S.view;
  const res = v.results;
  if (!res) return;
  const key = String(v.rounds);
  if (S.resultsKey !== key) {
    S.resultsKey = key;
    buildReport(v, res);
  }
  renderResultsActions(v, res);
}

function buildReport(v, res) {
  const wrap = $('#results');
  wrap.innerHTML = '';
  const maxCount = Math.max(1, ...Object.values(res.grades));
  const bars = h('div', { class: 'grade-bars' }, ['A', 'B', 'C', 'D', 'F'].map((g) => h('div', { class: 'gbar' },
    gradePill(g),
    h('div', { class: 'track' }, h('i', { style: { background: GRADE_COLORS[g] }, dataset: { w: String((res.grades[g] / maxCount) * 100) } })),
    h('span', { text: String(res.grades[g]) }))));
  const stats = h('div', { class: 'report-stats' },
    h('div', { class: 'rstat' }, h('b', { text: String(res.submitted) }), h('span', { text: 'Submitted' })),
    h('div', { class: 'rstat' }, h('b', { text: String(res.late) }), h('span', { text: 'Late (F)' })),
    h('div', { class: 'rstat' }, h('b', { text: String(res.unfinished) }), h('span', { text: 'Unfinished' })));
  const awards = h('div', { class: 'awards' }, res.awards.map((a, i) => h('div', { class: 'award', style: { '--pc': a.color, animationDelay: `${1.2 + i * 0.15}s` } },
    h('span', { class: 'a-emoji', text: a.emoji }),
    h('span', { class: 'a-title', text: a.title }),
    h('span', { class: 'a-name' }, avatarEl(a, 'xs'), a.playerId === v.you ? `${a.name} (you)` : a.name),
    h('span', { class: 'a-blurb', text: a.blurb }))));
  const transcript = h('ol', { class: 'transcript' }, res.transcript.length
    ? res.transcript.map((t, i) => h('li', { style: { animationDelay: `${1.4 + Math.min(i, 20) * 0.05}s` } },
      h('span', { text: t.emoji }),
      h('span', {}, `${t.title} · ${t.topic}`, h('div', { class: 't-by', text: t.by ? `submitted by ${t.by}` : 'nobody submitted it in time' })),
      gradePill(t.grade)))
    : h('li', {}, h('span', { text: '🫥' }), h('span', { text: 'Nothing was resolved this round.' }), h('span')));
  const report = h('div', { class: 'report' },
    h('div', { class: 'report-head' },
      h('div', { class: 'school', text: 'Night Owl University' }),
      h('h2', { text: 'Semester Report Card' }),
      h('div', { class: 'report-meta', text: `${settingsSummary({ difficulty: res.difficulty, length: res.length / 1000, rival: res.rival ? res.rival.level : 'off' })} · Room ${v.code}` })),
    h('div', { class: 'report-grade' },
      h('div', { class: 'big-stamp', style: { '--sc': GRADE_COLORS[res.letter] || '#888' }, text: res.letter }),
      h('div', { class: 'gpa-big' }, h('span', { class: 'n', id: 'gpa-count', text: '0.00' }), h('small', { text: 'GROUP GPA' }))),
    h('p', { class: 'headline', text: res.headline }),
    h('p', { class: 'quip', text: res.line }),
    res.newBest && v.rounds > 1 ? h('span', { class: 'new-best', text: '🏆 New best this session!' }) : null,
    bars,
    stats,
    h('h3', { text: 'Awards' }), awards,
    h('h3', { text: 'Transcript' }), transcript);
  if (res.rival) wrap.append(versusResult(res));
  wrap.append(report, h('div', { class: 'results-actions', id: 'results-actions' }));
  wrap.parentElement.scrollTop = 0;
  animateReport(res, report);
}

function versusResult(res) {
  const rv = res.rival;
  const level = RIVALS.find((r) => r.id === rv.level);
  const title = rv.outcome === 'win' ? `🏆 You beat ${rv.name}!` : rv.outcome === 'lose' ? `😤 ${rv.name} won this time` : `🤝 It's a tie with ${rv.name}!`;
  const sub = rv.outcome === 'lose' ? 'Rematch? Talk more and pass faster.' : rv.outcome === 'win' ? 'Your group had the better semester.' : 'Dead even. Play again to settle it!';
  return h('div', { class: `versus-result ${rv.outcome}` },
    h('div', { class: 'vr-title', text: title }),
    h('div', { class: 'vr-scores' },
      h('span', {}, '🙋 Your group ', h('b', { text: res.gpa.toFixed(2) })),
      h('span', { class: 'vr-vs', text: 'vs' }),
      h('span', {}, h('b', { text: rv.gpa.toFixed(2) }), ' 🤓 Rivals')),
    h('div', { class: 'vr-sub', text: `${level ? `${level.name} rivals · ` : ''}${sub}` }));
}

function animateReport(res, report) {
  // With rivals, winning the race decides the celebration; otherwise the letter grade does.
  const won = res.rival ? res.rival.outcome === 'win' : res.letter === 'A' || res.letter === 'B';
  const lost = res.rival ? res.rival.outcome === 'lose' : res.letter !== 'I';
  setTimeout(() => { sfx.stamp(); haptic(HAPTIC.submit); shake(report); }, 650);
  setTimeout(() => {
    if (won) { sfx.fanfare(); rain(); } else if (lost) sfx.wahwah();
  }, 1050);
  setTimeout(() => { for (const i of report.querySelectorAll('.track i')) i.style.width = `${i.dataset.w}%`; }, 300);
  const counter = report.querySelector('#gpa-count');
  const start = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - start) / 1300);
    counter.textContent = (res.gpa * (1 - Math.pow(1 - p, 3))).toFixed(2);
    counter.style.color = gpaColor(res.gpa * p);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderResultsActions(v, res) {
  const box = $('#results-actions');
  if (!box) return;
  const host = isHost();
  const sig = `${host}|${v.hostId}`;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = '';
  if (host) {
    box.append(
      h('button', { class: 'btn primary big glow', type: 'button', onclick: () => { sfx.tap(); send({ t: 'lobby' }); send({ t: 'start' }); } }, '🔁 Play again'),
      h('button', { class: 'btn secondary', type: 'button', onclick: () => { sfx.tap(); send({ t: 'lobby' }); } }, '⚙️ Change settings'));
  } else {
    const hostPlayer = S.players.get(v.hostId);
    box.append(h('div', { class: 'card wait-panel' }, h('span', { class: 'big-emoji', text: '☕' }), `Waiting for ${hostPlayer ? hostPlayer.name : 'the host'} to start the next round`, h('span', { class: 'dots' })));
  }
  box.append(
    h('button', { class: 'btn ghost', type: 'button', onclick: () => shareResults(res) }, '📣 Share our grade'),
    h('button', { class: 'btn ghost', type: 'button', onclick: confirmLeave }, '🚪 Leave room'));
}

async function shareResults(res) {
  sfx.tap();
  const text = `🎓 Our group got a ${res.gpa.toFixed(2)} GPA (${res.letter}) in Due at 11:59: ${res.submitted} assignments in before midnight. Can your group beat it? ${location.origin}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Due at 11:59', text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('📋 Copied! Paste it anywhere.', 'good');
  } catch {
    showModal({ emoji: '📣', title: 'Share your grade', text, actions: [{ label: 'Done', primary: true }] });
  }
}

// ------------------------------------------------------------ frame loop
function frame() {
  requestAnimationFrame(frame);
  const sheetOpen = !$('#sheet').hidden || !$('#picker').hidden;
  if (document.body.classList.contains('sheet-open') !== sheetOpen) document.body.classList.toggle('sheet-open', sheetOpen);
  const v = S.view;
  if (!v || !v.round || (v.phase !== 'playing' && v.phase !== 'countdown')) return;
  const r = v.round;
  const now = serverNow();
  if (v.phase === 'countdown') { updateCountdown(now, r); return; }

  const progress = clamp((now - r.startAt) / r.length, 0, 1);
  const left = r.endAt - now;
  const clockEl = $('#clock');
  const text = clockText(progress);
  const timeEl = $('#clock-time');
  if (timeEl.textContent !== text) timeEl.textContent = text;
  clockEl.classList.toggle('late', left < 60000);
  clockEl.classList.toggle('panic', left < 15000);
  $('#night-fill').style.width = `${progress * 100}%`;
  $('#moon').style.left = `${clamp(progress * 100, 3, 97)}%`;
  setTension(left < 60000 ? 1 - left / 60000 : 0);

  if (left <= 30000 && left > 0 && !S.finalShown) {
    S.finalShown = true;
    document.body.classList.add('final');
    showEvent({ kind: 'final' }, v);
  }
  const second = Math.ceil(left / 1000);
  let urgentMine = false;

  for (const card of $('#desk').children) {
    if (!card._fg || card.dataset.leaving) continue;
    const f = S.folders.get(card.dataset.key);
    if (!f) continue;
    const rem = f.dueAt - now;
    const frac = clamp(rem / f.total, 0, 1);
    card._fg.style.strokeDashoffset = String(RING * (1 - frac));
    const color = frac > 0.5 ? '#2fbf71' : frac > 0.25 ? '#f5a623' : '#ff4d5e';
    if (card._color !== color) { card._fg.style.stroke = color; card._color = color; }
    const secs = Math.max(0, Math.ceil(rem / 1000));
    if (card._secsVal !== secs) { card._secs.textContent = String(secs); card._secsVal = secs; }
    const urgent = secs <= 5;
    if (urgent) urgentMine = true;
    if (card.classList.contains('urgent') !== urgent) card.classList.toggle('urgent', urgent);
  }
  for (const row of document.querySelectorAll('.board-row')) {
    const f = S.folders.get(row.dataset.key);
    if (!f || !row._secs) continue;
    const secs = Math.max(0, Math.ceil((f.dueAt - now) / 1000));
    const t = `${secs}s`;
    if (row._secs.textContent !== t) row._secs.textContent = t;
    row.classList.toggle('urgent', secs <= 5);
  }

  const cur = currentTask();
  if (cur) {
    const f = S.folders.get(cur.folderId);
    if (f) updateTaskTimer(clamp((f.dueAt - now) / f.total, 0, 1), Math.max(0, Math.ceil((f.dueAt - now) / 1000)));
  }

  if (S.banner) {
    const bar = $('#banner .ev-bar i');
    if (bar) bar.style.transform = `scaleX(${clamp((S.banner.until - now) / (S.banner.until - S.banner.from), 0, 1)})`;
  }

  const wifi = $('#wifi');
  if (!wifi.hidden) {
    const until = r.me ? r.me.wifiUntil : 0;
    if (until <= now) {
      wifi.hidden = true;
      stopStatic();
      sfx.pop();
      toast('📶 Back online!', 'good');
    } else {
      $('#wifi-bar').style.width = `${clamp((now - S.wifiFrom) / Math.max(1, until - S.wifiFrom), 0, 1) * 100}%`;
      const secs = String(Math.max(1, Math.ceil((until - now) / 1000)));
      if ($('#wifi-secs').textContent !== secs) $('#wifi-secs').textContent = secs;
    }
  }

  // printer jam countdown on submit buttons
  if (r.printerUntil > now) {
    const jam = Math.ceil((r.printerUntil - now) / 1000);
    for (const b of document.querySelectorAll('#desk .btn.submit.jammed')) {
      const t = `🖨️ Jammed… ${jam}s`;
      if (b.textContent !== t) b.textContent = t;
    }
  } else if (document.querySelector('#desk .btn.submit.jammed')) {
    render();
  }

  if (second !== S.lastSecond) {
    S.lastSecond = second;
    if (left > 0 && left <= 10000) { sfx.tick(); haptic(HAPTIC.tick); }
    else if (urgentMine) { sfx.heartbeat(); haptic(HAPTIC.heartbeat); }
  }
}

function setTension(t) {
  const rounded = Math.round(t * 50) / 50;
  if (rounded === S.tension) return;
  S.tension = rounded;
  document.documentElement.style.setProperty('--tension', String(rounded));
  music.setTension(rounded);
}

// ------------------------------------------------------------ wake lock
async function requestWakeLock() {
  try {
    if (!('wakeLock' in navigator) || S.wakeLock || !S.view || S.view.phase !== 'playing') return;
    S.wakeLock = await navigator.wakeLock.request('screen');
    S.wakeLock.addEventListener('release', () => { S.wakeLock = null; });
  } catch {}
}
function releaseWakeLock() {
  try { if (S.wakeLock) S.wakeLock.release(); } catch {}
  S.wakeLock = null;
}

// ------------------------------------------------------------ home + rooms
function homeError(text) {
  const el = $('#home-error');
  el.textContent = text;
}

async function createRoom() {
  unlockAudio();
  const btn = $('#create-btn');
  btn.disabled = true;
  homeError('');
  try {
    const res = await fetch('/api/create', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.code) throw new Error(data.error || 'Could not create a room. Try again.');
    enterRoom(data.code);
  } catch (e) {
    homeError(e.message && !e.message.includes('fetch') ? e.message : 'Could not reach the game server. Check your connection.');
    sfx.wrong();
  } finally {
    btn.disabled = false;
  }
}

async function joinRoom(raw) {
  unlockAudio();
  const code = String(raw || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const input = $('#code-input');
  if (code.length !== 4) {
    homeError('Room codes are 4 letters.');
    shake(input);
    sfx.wrong();
    return;
  }
  const btn = $('#join-btn');
  btn.disabled = true;
  try {
    const res = await fetch(`/api/room/${code}`);
    const data = await res.json();
    if (!data.exists) {
      homeError(`No room called ${code}. Double-check the code?`);
      shake(input);
      sfx.wrong();
      return;
    }
    if (data.players >= 8 && !seat.get(code)) {
      homeError(`Room ${code} is full (8 players).`);
      sfx.wrong();
      return;
    }
    enterRoom(code);
  } catch {
    homeError('Could not reach the game server. Check your connection.');
  } finally {
    btn.disabled = false;
  }
}

function enterRoom(code) {
  S.code = code;
  S.fatal = null;
  S.token = seat.get(code);
  S.bestRtt = Infinity;
  S.tilesFor = null;
  S.resultsKey = null;
  history.replaceState(null, '', `/?room=${code}`);
  sfx.whoosh();
  connectNow();
}

function confirmLeave() {
  sfx.tap();
  const inRound = !!S.view && (S.view.phase === 'playing' || S.view.phase === 'countdown');
  showModal({
    emoji: '🚪',
    title: inRound ? 'Leave the game?' : 'Leave the room?',
    text: inRound ? 'Your folders will go to your teammates. You can rejoin with the room code.' : 'You can rejoin later with the room code.',
    actions: [{ label: 'Leave', primary: true, onClick: () => { send({ t: 'leave' }); setTimeout(goHome, 150); } }, { label: 'Stay' }],
  });
}

// ---------- instructions
const HELP_TABS = ['basics', 'jobs', 'chaos', 'grades'];

function openHelp(tab) {
  selectHelpTab(tab || S.helpTab || 'basics');
  $('#help-live').hidden = !(S.view && (S.view.phase === 'playing' || S.view.phase === 'countdown'));
  $('#help').hidden = false;
  sfx.tap();
  const active = document.querySelector('.help-tab.on');
  if (active) active.focus({ preventScroll: true });
}

function closeHelp() {
  $('#help').hidden = true;
}

function selectHelpTab(tab) {
  S.helpTab = tab;
  for (const b of document.querySelectorAll('.help-tab')) {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  for (const p of document.querySelectorAll('.help-panel')) p.hidden = p.dataset.panel !== tab;
  $('#help .help-card').scrollTop = 0;
}

async function invite() {
  sfx.tap();
  const url = `${location.origin}/?room=${S.code}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Due at 11:59', text: `Join my group project! Room ${S.code}`, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('🔗 Invite link copied!', 'good');
  } catch {
    showModal({ emoji: '🔗', title: 'Invite link', text: url, actions: [{ label: 'Done', primary: true }] });
  }
}

function toggleQr() {
  sfx.tap();
  const card = $('#qr-card');
  if (!card.hidden) { card.hidden = true; return; }
  if (S.qrFor !== S.code) {
    const qr = qrcode(0, 'M');
    qr.addData(`${location.origin}/?room=${S.code}`);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
    card.innerHTML = `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR code to join room ${S.code}"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#1b1830"/></svg><p>Scan to join room ${S.code}</p>`;
    S.qrFor = S.code;
  }
  card.hidden = false;
}

function toggleSound() {
  unlockAudio();
  setMuted(!isMuted());
  if (!isMuted()) sfx.pick();
  updateSoundButtons();
  if (S.screen === 'lobby') renderPrefs();
}
function updateSoundButtons() {
  for (const b of [$('#lobby-sound'), $('#game-sound')]) {
    const t = isMuted() ? '🔇' : '🔊';
    if (b.textContent !== t) b.textContent = t;
    b.setAttribute('aria-pressed', String(!isMuted()));
  }
}

// ------------------------------------------------------------ boot
function init() {
  buildSky();
  initRipples();
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#modal').hidden) hideModal();
    else if (!$('#help').hidden) closeHelp();
    else if (!$('#picker').hidden) closePicker();
    else if (currentTask()) closeTask();
    else if (!$('#jobcard').hidden) $('#jobcard').hidden = true;
  });

  const params = new URLSearchParams(location.search);
  const invited = (params.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

  const nameInput = $('#name-input');
  nameInput.value = S.name;
  nameInput.addEventListener('input', () => {
    S.name = nameInput.value.slice(0, 16).trim();
    store.set('due1159.name', S.name);
  });
  const codeInput = $('#code-input');
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    homeError('');
  });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(codeInput.value); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') (invited ? joinRoom(codeInput.value) : createRoom()); });
  $('#create-btn').addEventListener('click', createRoom);
  $('#join-btn').addEventListener('click', () => joinRoom(codeInput.value));
  if (invited.length === 4) {
    codeInput.value = invited;
    $('#join-banner').hidden = false;
    $('#join-banner-code').textContent = invited;
    $('#join-btn').classList.replace('secondary', 'primary');
    $('#create-btn').classList.replace('primary', 'secondary');
    $('#create-btn').classList.remove('big');
  }

  $('#lobby-leave').addEventListener('click', confirmLeave);
  $('#game-leave').addEventListener('click', confirmLeave);
  document.addEventListener('click', (e) => { if (e.target.closest('[data-help]')) openHelp(); });
  for (const b of document.querySelectorAll('.help-tab')) {
    b.addEventListener('click', () => { sfx.tap(); selectHelpTab(b.dataset.tab); });
  }
  $('#help .help-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = HELP_TABS.indexOf(S.helpTab || 'basics');
    const next = HELP_TABS[(i + (e.key === 'ArrowRight' ? 1 : HELP_TABS.length - 1)) % HELP_TABS.length];
    selectHelpTab(next);
    document.querySelector(`.help-tab[data-tab="${next}"]`).focus();
  });
  $('#help .help-close').addEventListener('click', () => { sfx.tap(); closeHelp(); });
  $('#help').addEventListener('click', (e) => { if (e.target.id === 'help') closeHelp(); });
  $('#lobby-sound').addEventListener('click', toggleSound);
  $('#game-sound').addEventListener('click', toggleSound);
  $('#invite-btn').addEventListener('click', invite);
  $('#qr-btn').addEventListener('click', toggleQr);
  $('#add-bot').addEventListener('click', () => { sfx.tap(); send({ t: 'addBot' }); });
  $('#remove-bot').addEventListener('click', () => { sfx.tap(); send({ t: 'removeBot' }); });
  $('#start-btn').addEventListener('click', () => { unlockAudio(); send({ t: 'start' }); });
  $('#quick-btn').addEventListener('click', () => { unlockAudio(); send({ t: 'quickplay' }); });
  $('#pref-sound').addEventListener('click', toggleSound);
  $('#pref-music').addEventListener('click', () => {
    S.musicPref = shouldPlayMusic() ? 'off' : 'on';
    store.set('due1159.music', S.musicPref);
    sfx.tap();
    renderPrefs();
  });
  $('#pref-haptics').addEventListener('click', () => {
    setHaptics(!hapticsEnabled());
    haptic(HAPTIC.success);
    sfx.tap();
    renderPrefs();
  });
  $('#board-toggle').addEventListener('click', () => {
    S.boardOpen = !S.boardOpen;
    sfx.tap();
    render();
  });
  $('#sheet-backdrop').addEventListener('click', () => { closePicker(); closeTask(); });
  window.addEventListener('resize', () => { if (S.screen === 'game') render(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (S.code && !S.fatal && (!S.ws || S.ws.readyState > 1)) connectNow();
    requestWakeLock();
  });

  updateSoundButtons();
  requestAnimationFrame(frame);

  // Refreshing inside a room drops you straight back in.
  if (invited.length === 4 && seat.get(invited)) enterRoom(invited);

  // Test hook for local development only.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') window.__due = { S, send };
}

init();

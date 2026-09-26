// Sound effects, the lo-fi study music, and haptics. Everything is synthesized
// with the Web Audio API, so there are no audio files to download.

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
};

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuffer = null;
let muted = store.get('due1159.muted', '0') === '1';
let hapticsOn = store.get('due1159.haptics', '1') === '1';

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(master);
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.85;
    sfxBus.connect(comp);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.55;
    musicBus.connect(comp);
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  store.set('due1159.muted', value ? '1' : '0');
  if (master) master.gain.setTargetAtTime(value ? 0 : 0.9, ctx.currentTime, 0.05);
}

// ------------------------------------------------------------ building blocks
function voice(freq, time, dur, { type = 'sine', vol = 0.2, attack = 0.005, slide = 0, bus = sfxBus, filter = 0 } = {}) {
  if (!ctx || muted) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), time + dur);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(vol, time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  let node = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    osc.connect(f);
    node = f;
  }
  node.connect(gain).connect(bus);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

function tone(freq, opts = {}) {
  if (!ctx) return;
  voice(freq, ctx.currentTime + (opts.at || 0), opts.dur || 0.15, opts);
}

function noiseAt(time, { dur = 0.2, vol = 0.2, type = 'bandpass', freq = 1000, q = 1, sweep = 0, bus = sfxBus } = {}) {
  if (!ctx || muted) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, time);
  f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, time + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(vol, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(time, Math.random() * 1.5);
  src.stop(time + dur + 0.05);
}

function noise(opts = {}) {
  if (!ctx) return;
  noiseAt(ctx.currentTime + (opts.at || 0), opts);
}

// ------------------------------------------------------------ effects
export const sfx = {
  tap() { tone(660, { type: 'triangle', dur: 0.05, vol: 0.07 }); },
  pick() { tone(880, { type: 'triangle', dur: 0.09, vol: 0.12 }); tone(1320, { type: 'sine', at: 0.04, dur: 0.08, vol: 0.06 }); },
  arrive() {
    noise({ dur: 0.2, vol: 0.12, freq: 2600, sweep: 700, q: 0.8 });
    tone(523, { at: 0.06, dur: 0.12, vol: 0.13 });
    tone(784, { at: 0.13, dur: 0.16, vol: 0.12 });
  },
  send() { noise({ dur: 0.32, vol: 0.2, freq: 400, sweep: 4200, q: 1.1 }); tone(392, { type: 'triangle', dur: 0.18, vol: 0.06, slide: 2 }); },
  success() { [784, 988, 1319].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.07, dur: 0.2, vol: 0.13 })); },
  wrong() { tone(150, { type: 'square', dur: 0.2, vol: 0.08, slide: 0.7 }); tone(110, { type: 'sawtooth', at: 0.05, dur: 0.18, vol: 0.05 }); },
  stamp() { tone(95, { dur: 0.28, vol: 0.45, slide: 0.45 }); noise({ dur: 0.09, vol: 0.28, type: 'lowpass', freq: 1300 }); },
  submit(grade) {
    this.stamp();
    const chords = { A: [523, 659, 784, 1047], B: [523, 659, 784], C: [440, 554, 659], D: [392, 466] };
    (chords[grade] || []).forEach((f, i) => tone(f, { type: 'triangle', at: 0.2 + i * 0.07, dur: 0.4, vol: 0.12 }));
  },
  teamSubmit(grade) {
    const top = { A: 1047, B: 880, C: 784, D: 659 }[grade] || 587;
    tone(top * 0.75, { type: 'sine', dur: 0.1, vol: 0.08 });
    tone(top, { type: 'sine', at: 0.08, dur: 0.16, vol: 0.08 });
  },
  late(mine) {
    const notes = mine ? [392, 370, 349, 311] : [330, 262];
    notes.forEach((f, i) => tone(f, { type: 'sawtooth', at: i * 0.2, dur: i === notes.length - 1 ? 0.6 : 0.2, vol: 0.06, slide: i === notes.length - 1 ? 0.85 : 1, filter: 1400 }));
  },
  alarm() {
    for (let i = 0; i < 4; i++) {
      tone(880, { type: 'square', at: i * 0.2, dur: 0.1, vol: 0.06, filter: 3000 });
      tone(660, { type: 'square', at: i * 0.2 + 0.1, dur: 0.1, vol: 0.06, filter: 3000 });
    }
  },
  extension() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { type: 'sine', at: i * 0.06, dur: 0.35, vol: 0.1 })); },
  swap() {
    [300, 450, 600, 900].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.06, dur: 0.14, vol: 0.09, slide: 1.25 }));
    noise({ dur: 0.35, vol: 0.1, freq: 800, sweep: 3200 });
  },
  chat() { [0, 0.14, 0.28].forEach((at) => { tone(1175, { at, dur: 0.07, vol: 0.09 }); tone(1568, { at: at + 0.05, dur: 0.09, vol: 0.09 }); }); },
  pop() { tone(520, { dur: 0.09, vol: 0.12, slide: 1.9 }); },
  static(dur = 1.2) { noise({ dur, vol: 0.05, type: 'highpass', freq: 2800 }); },
  printer() { for (let i = 0; i < 6; i++) noise({ at: i * 0.07, dur: 0.05, vol: 0.12, freq: 1800, q: 4 }); tone(90, { type: 'square', at: 0.45, dur: 0.25, vol: 0.06 }); },
  count() { tone(660, { type: 'square', dur: 0.13, vol: 0.07, filter: 2500 }); },
  go() {
    [523, 659, 784].forEach((f) => tone(f, { type: 'sawtooth', dur: 0.55, vol: 0.05, filter: 2600 }));
    tone(1047, { type: 'triangle', at: 0.06, dur: 0.5, vol: 0.09 });
  },
  tick() { tone(1850, { type: 'square', dur: 0.03, vol: 0.045, filter: 5000 }); },
  heartbeat() { tone(72, { dur: 0.13, vol: 0.3 }); tone(64, { at: 0.17, dur: 0.15, vol: 0.24 }); },
  fanfare() {
    [[523, 0], [659, 0.13], [784, 0.26], [1047, 0.42], [1319, 0.62]].forEach(([f, at]) => {
      tone(f, { type: 'triangle', at, dur: 0.45, vol: 0.12 });
      tone(f / 2, { type: 'sine', at, dur: 0.45, vol: 0.07 });
    });
  },
  wahwah() { [330, 311, 294, 262].forEach((f, i) => tone(f, { type: 'sawtooth', at: i * 0.32, dur: 0.34, vol: 0.05, slide: 0.94, filter: 1200 })); },
  join() { tone(700, { dur: 0.08, vol: 0.09 }); tone(1050, { at: 0.08, dur: 0.12, vol: 0.09 }); },
  leave() { tone(700, { dur: 0.08, vol: 0.07 }); tone(470, { at: 0.08, dur: 0.12, vol: 0.07 }); },
  whoosh() { noise({ dur: 0.4, vol: 0.14, freq: 300, sweep: 5000, q: 0.7 }); },
};

// ------------------------------------------------------------ lo-fi music
// A mellow four-chord loop. It speeds up and adds hi-hats and a ticking
// clock as the deadline gets close (setTension 0..1).
const CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]; // Fmaj7 Em7 Dm7 Cmaj7
const BASS = [41, 40, 38, 36];
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const loop = { on: false, timer: null, step: 0, next: 0, tension: 0 };

function kick(t) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + 0.35);
}

function scheduleStep(step, t, stepDur) {
  const bar = Math.floor(step / 16) % 4;
  const s = step % 16;
  const tension = loop.tension;
  if (s === 0) CHORDS[bar].forEach((m) => voice(midi(m), t, stepDur * 15.5, { type: 'triangle', vol: 0.028, attack: 0.08, bus: musicBus, filter: 1100 + tension * 1400 }));
  if (s === 0 || s === 10) kick(t);
  if (s === 4 || s === 12) {
    noiseAt(t, { dur: 0.16, vol: 0.12, freq: 1900, q: 0.9, bus: musicBus });
    voice(190, t, 0.1, { vol: 0.05, bus: musicBus });
  }
  const swing = s % 4 === 2 ? stepDur * 0.28 : 0;
  if (s % 2 === 0) noiseAt(t + swing, { dur: 0.04, vol: 0.035 + tension * 0.03, type: 'highpass', freq: 7000, bus: musicBus });
  if (tension > 0.55 && s % 2 === 1) noiseAt(t, { dur: 0.03, vol: 0.03, type: 'highpass', freq: 8000, bus: musicBus });
  if (s === 0 || s === 7 || s === 8) voice(midi(BASS[bar]), t, stepDur * 3, { type: 'sine', vol: 0.16, attack: 0.01, bus: musicBus });
  if (tension > 0.8 && s % 4 === 0) voice(s % 8 === 0 ? 1850 : 1400, t, 0.03, { type: 'square', vol: 0.03, bus: musicBus, filter: 5000 });
}

export const music = {
  get on() { return loop.on; },
  start() {
    if (loop.on || !ctx) return;
    loop.on = true;
    loop.step = 0;
    loop.next = ctx.currentTime + 0.1;
    musicBus.gain.setTargetAtTime(0.55, ctx.currentTime, 0.3);
    loop.timer = setInterval(() => {
      if (!ctx) return;
      const bpm = 84 + loop.tension * 30;
      const stepDur = 60 / bpm / 4;
      while (loop.next < ctx.currentTime + 0.15) {
        scheduleStep(loop.step, loop.next, stepDur);
        loop.next += stepDur;
        loop.step++;
      }
    }, 30);
  },
  stop() {
    if (!loop.on) return;
    loop.on = false;
    clearInterval(loop.timer);
    loop.timer = null;
    if (musicBus) musicBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
    setTimeout(() => { if (!loop.on && musicBus) musicBus.gain.value = 0.55; }, 900);
  },
  setTension(t) { loop.tension = Math.max(0, Math.min(1, t)); },
};

// ------------------------------------------------------------ haptics
// Android: the Vibration API. iPhone (iOS 18+): tapping a hidden switch
// control makes Safari play a tiny haptic tick.
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const hapticsEnabled = () => hapticsOn;
export function setHaptics(value) {
  hapticsOn = value;
  store.set('due1159.haptics', value ? '1' : '0');
}

function iosTick() {
  try {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  } catch {}
}

export function haptic(pattern) {
  if (!hapticsOn) return;
  // Browsers only allow vibration after the person has tapped the page once.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  if (typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(pattern); } catch {}
    return;
  }
  if (!isIOS) return;
  const taps = Array.isArray(pattern) ? Math.min(3, Math.ceil(pattern.length / 2)) : 1;
  for (let i = 0; i < taps; i++) setTimeout(iosTick, i * 110);
}

export const HAPTIC = {
  tap: 8,
  pick: 14,
  success: [16, 40, 26],
  wrong: [55, 45, 55],
  arrive: [18, 35, 18],
  send: 22,
  submit: [28, 40, 28, 40, 70],
  late: [160],
  event: [70, 50, 70, 50, 150],
  count: 20,
  go: [40, 30, 100],
  tick: 12,
  heartbeat: [30, 120, 30],
};

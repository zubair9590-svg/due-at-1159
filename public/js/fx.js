// Visual effects: the night sky, confetti, sparkles, flying folders,
// screen shake, floating "+12s" text and TV static.

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------ sky
export function buildSky() {
  const sky = document.getElementById('sky');
  const layer = (count, size, cls) => {
    const el = document.createElement('div');
    el.className = `stars ${cls}`;
    const shadows = [];
    for (let i = 0; i < count; i++) {
      shadows.push(`${(Math.random() * 100).toFixed(2)}vw ${(Math.random() * 100).toFixed(2)}vh 0 ${size}px rgba(255,255,255,${(0.35 + Math.random() * 0.65).toFixed(2)})`);
    }
    el.style.boxShadow = shadows.join(',');
    sky.appendChild(el);
  };
  layer(45, 0.5, 's1');
  layer(28, 1, 's2');
  layer(12, 1.6, 's3');
  const glow = document.createElement('div');
  glow.className = 'lamp-glow';
  sky.appendChild(glow);
  if (reducedMotion) return;
  for (let i = 0; i < 7; i++) {
    const paper = document.createElement('div');
    paper.className = 'paper-float';
    const scale = 0.55 + Math.random() * 0.7;
    paper.style.left = `${Math.random() * 92}vw`;
    paper.style.width = `${70 * scale}px`;
    paper.style.height = `${90 * scale}px`;
    paper.style.animationDuration = `${28 + Math.random() * 22}s`;
    paper.style.animationDelay = `${-Math.random() * 45}s`;
    sky.appendChild(paper);
  }
}

// ------------------------------------------------------------ confetti + sparkles
const canvas = document.getElementById('confetti');
const g = canvas.getContext('2d');
let particles = [];
let running = false;
let dpr = 1;
const COLORS = ['#FFD24D', '#FF7A6B', '#3FD3C6', '#9B8CFF', '#39D98A', '#5AA9FF', '#FF6FD8', '#FFB347'];

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

export function confetti(x, y, { count = 90, spread = 1, power = 1, colors = COLORS, gravity = 1 } = {}) {
  if (reducedMotion) return;
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * spread;
    const speed = (5 + Math.random() * 10) * power;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      g: (0.22 + Math.random() * 0.14) * gravity,
      w: 5 + Math.random() * 7,
      h: 7 + Math.random() * 9,
      r: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[i % colors.length],
      life: 0,
      max: 110 + Math.random() * 80,
      round: Math.random() < 0.3,
    });
  }
  if (!running) {
    running = true;
    requestAnimationFrame(step);
  }
}

function step() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter((p) => p.life < p.max && p.y < window.innerHeight + 60);
  for (const p of particles) {
    p.life++;
    p.vx *= 0.985;
    p.vy = p.vy * 0.985 + p.g;
    p.x += p.vx;
    p.y += p.vy;
    p.r += p.vr;
    g.save();
    g.globalAlpha = Math.min(1, (p.max - p.life) / 30);
    g.translate(p.x, p.y);
    g.rotate(p.r);
    g.fillStyle = p.color;
    if (p.round) {
      g.beginPath();
      g.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      g.fill();
    } else {
      g.scale(1, Math.cos(p.life * 0.17));
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    g.restore();
  }
  if (particles.length) requestAnimationFrame(step);
  else {
    running = false;
    g.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

export function confettiAt(el, opts) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  confetti(r.left + r.width / 2, r.top + r.height / 2, opts);
}

export function sparkle(el, color) {
  confettiAt(el, { count: 22, spread: 2, power: 0.5, gravity: 0.4, colors: [color || '#FFD24D', '#ffffff', '#FFF3B0'] });
}

export function rain() {
  if (reducedMotion) return;
  const w = window.innerWidth;
  for (let i = 0; i < 5; i++) {
    setTimeout(() => confetti(w * (0.1 + 0.2 * i), -20, { count: 40, spread: 0.6, power: 0.2, gravity: 0.7 }), i * 140);
  }
}

// ------------------------------------------------------------ motion helpers
export function flyTo(el, target, { scale = 0.22, duration = 560 } = {}) {
  if (!el || !target || reducedMotion) return Promise.resolve();
  const from = el.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const clone = el.cloneNode(true);
  clone.classList.add('flying');
  clone.classList.remove('arrive', 'urgent', 'shake');
  Object.assign(clone.style, {
    left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
  });
  document.body.appendChild(clone);
  el.style.visibility = 'hidden';
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const anim = clone.animate([
    { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
    { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) scale(${(1 + scale) / 1.8}) rotate(-14deg)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(10deg)`, opacity: 0.1 },
  ], { duration, easing: 'cubic-bezier(.45,0,.25,1)' });
  const done = () => clone.remove();
  return anim.finished.then(done, done);
}

export function shake(el = document.getElementById('app'), hard = false) {
  if (!el || reducedMotion) return;
  el.classList.remove('shake', 'shake-hard');
  void el.offsetWidth;
  el.classList.add(hard ? 'shake-hard' : 'shake');
  setTimeout(() => el.classList.remove('shake', 'shake-hard'), 650);
}

export function floatText(x, y, text, color = '#fff') {
  const d = document.createElement('div');
  d.className = 'float-text';
  d.textContent = text;
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  d.style.color = color;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1200);
}

export function floatTextAt(el, text, color) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  floatText(r.left + r.width / 2, r.top + 4, text, color);
}

// Material-style ripple on every .btn press.
export function initRipples() {
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn || btn.disabled) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.width = `${size}px`;
    s.style.height = `${size}px`;
    s.style.left = `${e.clientX - r.left - size / 2}px`;
    s.style.top = `${e.clientY - r.top - size / 2}px`;
    btn.appendChild(s);
    setTimeout(() => s.remove(), 600);
  }, { passive: true });
}

// ------------------------------------------------------------ TV static
let staticTimer = null;
export function startStatic(cnv) {
  stopStatic();
  const w = 120;
  const h = 210;
  cnv.width = w;
  cnv.height = h;
  const c = cnv.getContext('2d');
  const img = c.createImageData(w, h);
  const draw = () => {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  };
  draw();
  staticTimer = setInterval(draw, 70);
}
export function stopStatic() {
  if (staticTimer) clearInterval(staticTimer);
  staticTimer = null;
}

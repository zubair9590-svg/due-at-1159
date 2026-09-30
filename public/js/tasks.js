// The bottom sheet where you do one quick task for one step of a folder.
import { sfx, haptic, HAPTIC } from './audio.js';
import { sparkle, shake } from './fx.js';
import { CHART_SVG } from './charts.js';

// coach: the tip shown when a practice round opens this kind of task.
const HEAD = {
  research: { kicker: '🔎 Research', css: 'var(--research)', hex: '#4fc3f7', coach: 'Tip: tap the sources you can trust, like journals, textbooks and expert data. Skip blogs, memes and ads.' },
  write: { kicker: '✍️ Write', css: 'var(--write)', hex: '#ffb74d', coach: 'Tip: tap the sentences in reading order. Start with the one that introduces the topic.' },
  design: { kicker: '🎨 Design', css: 'var(--design)', hex: '#f48fb1', coach: 'Tip: change over time = line, compare = bar, parts = pie, where = map, in order = timeline, steps = flowchart, related = scatter, overlap = Venn.' },
  edit: { kicker: '✅ Edit', css: 'var(--edit)', hex: '#81c784', coach: 'Tip: one word is misspelled. Find it and tap it.' },
};
const PRAISE = ['Nice!', 'Nailed it!', 'Perfect!', 'Big brain!', 'A+ work!', 'Clean!'];

let cur = null;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export const currentTask = () => cur;

export function openTask({ folder, task, onDone, onWrong, coach = false }) {
  closeTask(true);
  const sheet = document.getElementById('sheet');
  const backdrop = document.getElementById('sheet-backdrop');
  const head = HEAD[task.station];
  sheet.innerHTML = '';
  sheet.className = 'sheet';
  sheet.style.setProperty('--c', head.css);
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', task.prompt);

  const top = el('div', 'sheet-head');
  const titles = el('div');
  titles.append(el('div', 'sheet-kicker', `${head.kicker} · ${folder.emoji} ${folder.title}: ${folder.topic.name}`));
  titles.append(el('h3', 'sheet-prompt', task.prompt));
  const close = el('button', 'sheet-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => { sfx.tap(); closeTask(); });
  top.append(titles, close);

  const meta = el('div', 'sheet-meta');
  const bar = el('div', 'bar');
  const fill = el('i');
  bar.append(fill);
  const secs = el('span', 'secs');
  meta.append(el('span', null, '⏱'), bar, secs);

  const body = el('div', 'task-body');
  const tip = el('p', 'tip');
  tip.setAttribute('aria-live', 'polite');
  sheet.append(el('div', 'sheet-grip'), top, meta, body, tip);

  const state = { folderId: folder.id, taskId: task.id, opened: performance.now(), done: false, lockUntil: 0, fill, secs };
  cur = state;

  const say = (text, good = false) => {
    tip.textContent = text;
    tip.classList.toggle('good', good);
    tip.classList.remove('coach');
  };
  if (coach) {
    tip.textContent = head.coach;
    tip.classList.add('coach');
  }
  const locked = () => state.done || performance.now() < state.lockUntil;
  const wrong = (node, text) => {
    sfx.wrong();
    haptic(HAPTIC.wrong);
    shake(node);
    say(text);
    state.lockUntil = performance.now() + 600;
    if (onWrong) onWrong();
  };
  const right = () => { sfx.pick(); haptic(HAPTIC.pick); };
  const finish = (node) => {
    if (state.done) return;
    state.done = true;
    sfx.success();
    haptic(HAPTIC.success);
    sparkle(node, head.hex);
    say(PRAISE[Math.floor(Math.random() * PRAISE.length)], true);
    onDone(performance.now() - state.opened);
    setTimeout(() => { if (cur === state) closeTask(); }, 480);
  };

  if (task.station === 'research') {
    const grid = el('div', 'sources');
    let picked = 0;
    for (const card of task.cards) {
      const b = el('button', 'source');
      b.type = 'button';
      b.append(el('span', 's-icon', card.icon), el('span', 's-text', card.text));
      b.addEventListener('click', () => {
        if (locked() || b.classList.contains('picked') || b.disabled) return;
        if (card.good) {
          b.classList.add('picked');
          picked++;
          if (picked >= task.need) finish(b);
          else { right(); say(`${task.need - picked} more to go`, true); }
        } else {
          b.classList.add('nope');
          b.disabled = true;
          wrong(b, card.tip || "That's not a source you can trust.");
        }
      });
      grid.append(b);
    }
    body.append(grid);
  } else if (task.station === 'write') {
    const para = el('div', 'paragraph');
    const list = el('div', 'strips');
    let next = 0;
    for (const strip of task.strips) {
      const b = el('button', 'strip');
      b.type = 'button';
      const n = el('span', 'n', '•');
      b.append(n, el('span', null, strip.text));
      b.addEventListener('click', () => {
        if (locked() || b.classList.contains('used')) return;
        if (strip.id === task.order[next]) {
          next++;
          n.textContent = String(next);
          b.classList.add('used');
          para.append(el('div', 'placed', strip.text));
          if (next >= task.order.length) finish(para);
          else right();
        } else {
          wrong(b, next === 0 ? 'Which sentence has to come first?' : 'Hmm. What logically comes next?');
        }
      });
      list.append(b);
    }
    body.append(para, list);
  } else if (task.station === 'design') {
    const grid = el('div', 'charts');
    for (const opt of task.options) {
      const b = el('button', 'chart-opt');
      b.type = 'button';
      b.innerHTML = CHART_SVG[opt.id] || '';
      b.append(el('span', null, opt.label));
      b.addEventListener('click', () => {
        if (locked() || b.disabled) return;
        if (opt.id === task.answer) {
          b.classList.add('right');
          finish(b);
        } else {
          b.classList.add('wrong');
          b.disabled = true;
          wrong(b, (task.tips && task.tips[opt.id]) || 'Not the best fit.');
        }
      });
      grid.append(b);
    }
    body.append(grid);
  } else {
    const sentence = el('div', 'sentence');
    task.words.forEach((word, i) => {
      const b = el('button', 'word', word);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (locked() || b.classList.contains('fixed')) return;
        if (i === task.answer) {
          b.classList.add('fixed');
          b.textContent = '';
          b.append(el('s', null, word), el('ins', null, task.fix));
          finish(b);
        } else {
          b.classList.remove('wrong');
          void b.offsetWidth;
          b.classList.add('wrong');
          wrong(b, "That one's spelled fine. Look closer!");
        }
      });
      sentence.append(b);
    });
    body.append(sentence);
  }

  backdrop.hidden = false;
  sheet.hidden = false;
  document.body.classList.add('sheet-open'); // moves notifications away from the answers
  const first = body.querySelector('button');
  if (first) first.focus({ preventScroll: true });
}

export function closeTask(immediate = false) {
  const sheet = document.getElementById('sheet');
  const backdrop = document.getElementById('sheet-backdrop');
  const wasOpen = !!cur || !sheet.hidden;
  cur = null;
  if (!wasOpen) return;
  if (document.getElementById('picker').hidden) {
    backdrop.hidden = true;
    document.body.classList.remove('sheet-open');
  }
  if (immediate) {
    sheet.hidden = true;
    sheet.innerHTML = '';
    return;
  }
  sheet.classList.add('closing');
  setTimeout(() => {
    if (cur) return; // a new task opened meanwhile
    sheet.hidden = true;
    sheet.classList.remove('closing');
    sheet.innerHTML = '';
  }, 240);
}

// Called every frame with how much time the folder has left.
export function updateTaskTimer(fraction, secondsLeft) {
  if (!cur) return;
  cur.fill.style.transform = `scaleX(${fraction})`;
  cur.fill.style.background = fraction > 0.5 ? 'var(--good)' : fraction > 0.25 ? '#f5a623' : 'var(--bad)';
  const text = `${secondsLeft}s`;
  if (cur.secs.textContent !== text) cur.secs.textContent = text;
}

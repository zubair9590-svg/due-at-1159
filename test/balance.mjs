// Balance check: simulates groups of realistic human players (plus bots) and
// prints the average GPA per difficulty. Run: node test/balance.mjs
import { Game, DESK_LIMIT } from '../src/game.js';

function simulate({ difficulty, humans, bots, length = 180, skill = 1 }) {
  const clock = { t: 1_000_000 };
  const game = new Game('SIMU', () => clock.t);
  const ids = [];
  for (let i = 0; i < humans; i++) ids.push(game.join({ name: `H${i}` }).player.id);
  for (let i = 0; i < bots; i++) game.addBot();
  game.handle(ids[0], { t: 'settings', difficulty, length });
  game.handle(ids[0], { t: 'start' });
  // Each human is busy until busyUntil; a task takes 2.5-5s, a pass ~1.2s, a submit ~0.8s.
  const busy = Object.fromEntries(ids.map((id) => [id, 0]));
  let guard = 0;
  while (game.phase !== 'results' && guard++ < 100000) {
    clock.t += 100;
    game.tick();
    for (const id of ids) {
      if (clock.t < busy[id]) continue;
      const v = game.viewFor(id);
      if (v.phase !== 'playing' || !v.round || !v.round.me) continue;
      const me = v.round.me;
      if (me.chat.length) { game.handle(id, { t: 'dismiss', id: me.chat[0].id }); busy[id] = clock.t + 500; continue; }
      if (me.wifiUntil > clock.t) continue;
      const folders = me.desk.map((fid) => v.round.folders.find((f) => f.id === fid)).filter(Boolean).sort((a, b) => a.dueAt - b.dueAt);
      const ready = folders.find((f) => f.ready);
      if (ready && v.round.printerUntil <= clock.t) { game.handle(id, { t: 'submit', folder: ready.id }); busy[id] = clock.t + 800 / skill; continue; }
      const mine = folders.find((f) => me.tasks[f.id]);
      if (mine) {
        const ms = (2500 + Math.random() * 2500) / skill;
        const task = me.tasks[mine.id];
        busy[id] = clock.t + ms;
        const fid = mine.id;
        // complete after the delay
        setTimeoutSim(clock, ms, () => game.handle(id, { t: 'done', folder: fid, task: task.id, ms }));
        continue;
      }
      const pass = folders.find((f) => !f.ready);
      if (pass) {
        const need = pass.steps[pass.stepIndex];
        const to = v.players.filter((p) => p.id !== id && p.stations.includes(need) && p.load < DESK_LIMIT && p.connected && !p.away).sort((a, b) => a.load - b.load)[0];
        if (to) { game.handle(id, { t: 'pass', folder: pass.id, to: to.id }); busy[id] = clock.t + 1200 / skill; }
      }
    }
    runTimers(clock);
    game.drainFx();
    game.drainCloses();
  }
  return game.results;
}

const timers = [];
function setTimeoutSim(clock, ms, fn) { timers.push({ at: clock.t + ms, fn }); }
function runTimers(clock) {
  for (let i = timers.length - 1; i >= 0; i--) {
    if (timers[i].at <= clock.t) { const t = timers.splice(i, 1)[0]; t.fn(); }
  }
}

const RUNS = 12;
for (const [label, humans, bots] of [['solo', 1, 0], ['solo+3 bots', 1, 3], ['4 humans', 4, 0], ['6 humans', 6, 0]]) {
  const row = [];
  for (const difficulty of ['freshman', 'sophomore', 'junior', 'senior']) {
    let gpa = 0;
    let sub = 0;
    let late = 0;
    for (let i = 0; i < RUNS; i++) {
      timers.length = 0;
      const r = simulate({ difficulty, humans, bots });
      gpa += r.gpa; sub += r.submitted; late += r.late;
    }
    row.push(`${difficulty.padEnd(9)} GPA ${(gpa / RUNS).toFixed(2)}  sub ${(sub / RUNS).toFixed(1).padStart(4)}  late ${(late / RUNS).toFixed(1).padStart(4)}`);
  }
  console.log(`\n${label}`);
  for (const line of row) console.log(`  ${line}`);
}

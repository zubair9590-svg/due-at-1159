// Tries candidate rival settings and prints the rival group's GPA.
// Run: node test/rival-tune.mjs
import { Game } from '../src/game.js';
import { BOT_LEVELS } from '../src/content.js';

const RUNS = 16;
function rivalGpa({ difficulty, size, key }) {
  let total = 0;
  for (let i = 0; i < RUNS; i++) {
    const clock = { t: 1_000_000 };
    const g = new Game('TUNE', () => clock.t);
    g.settings = { difficulty, length: 180, botLevel: key, rival: 'off' };
    for (let b = 0; b < size; b++) g.addBot();
    g.startCountdown();
    while (g.phase !== 'results') { clock.t += 100; g.tick(); g.drainFx(); }
    total += g.results.gpa;
  }
  return (total / RUNS).toFixed(2);
}

// Edit these to try new values; empty objects keep what content.js has.
const candidates = { easy: {}, medium: {}, hard: {} };
for (const [level, params] of Object.entries(candidates)) {
  Object.assign(BOT_LEVELS[`rival-${level}`], params);
}
for (const size of [1, 4]) {
  console.log(`size ${size}: difficulty   easy / medium / hard`);
  for (const difficulty of ['freshman', 'sophomore', 'junior', 'senior']) {
    const cells = ['easy', 'medium', 'hard'].map((level) => rivalGpa({ difficulty, size, key: `rival-${level}` }));
    console.log(`  ${difficulty.padEnd(10)} ${cells.join(' / ')}`);
  }
}

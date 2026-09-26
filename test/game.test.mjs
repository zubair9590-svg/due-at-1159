// Plays whole rounds against the game engine with a fake clock and checks
// that the state always stays consistent. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, DESK_LIMIT } from '../src/game.js';
import { makeTask, TOPICS, STATION_IDS, DIFFICULTY } from '../src/content.js';

function makeClock(start = 1_000_000) {
  const clock = { t: start };
  clock.now = () => clock.t;
  return clock;
}

// A simple "human" that plays sensibly using only what its view shows.
function humanAct(game, id, clock) {
  const v = game.viewFor(id);
  if (v.phase !== 'playing' || !v.round || !v.round.me) return;
  const me = v.round.me;
  if (me.chat.length) { game.handle(id, { t: 'dismiss', id: me.chat[0].id }); return; }
  if (me.wifiUntil > clock.t) return;
  for (const fid of me.desk) {
    const f = v.round.folders.find((x) => x.id === fid);
    assert.ok(f, `desk folder ${fid} is on the board`);
    if (f.ready) {
      if (v.round.printerUntil > clock.t) continue;
      game.handle(id, { t: 'submit', folder: fid });
      return;
    }
    const task = me.tasks[fid];
    if (task) { game.handle(id, { t: 'done', folder: fid, task: task.id, ms: 2500 }); return; }
    const need = f.steps[f.stepIndex];
    const to = v.players.find((p) => p.id !== id && p.stations.includes(need) && p.load < DESK_LIMIT && p.connected && !p.away);
    if (to) { game.handle(id, { t: 'pass', folder: fid, to: to.id }); return; }
  }
}

function checkInvariants(game) {
  if (!game.round || game.phase !== 'playing') return;
  const seen = new Set();
  for (const p of game.players.values()) {
    for (const fid of p.desk) {
      assert.ok(game.round.folders.has(fid), `desk of ${p.name} holds a live folder`);
      assert.ok(!seen.has(fid), `folder ${fid} is on exactly one desk`);
      seen.add(fid);
      assert.equal(game.round.folders.get(fid).holderId, p.id);
    }
  }
  for (const f of game.round.folders.values()) assert.ok(seen.has(f.id), `live folder ${f.id} sits on a desk`);
  // A player who just dropped keeps their job for a short grace period.
  const covering = [...game.players.values()].filter((p) => p.isBot || !p.away);
  if (covering.length) {
    for (const s of STATION_IDS) assert.ok(covering.some((p) => p.stations.includes(s)), `someone covers ${s}`);
  }
}

function runRound(game, clock, humans, { stepMs = 200, onStep } = {}) {
  let guard = 0;
  while (game.phase !== 'results' && guard++ < 20000) {
    clock.t += stepMs;
    game.tick();
    if (guard % 3 === 0) {
      for (const id of humans) if (game.players.get(id)?.connected) humanAct(game, id, clock);
    }
    if (onStep) onStep(guard);
    checkInvariants(game);
    game.drainFx();
    game.drainCloses();
  }
  assert.equal(game.phase, 'results', 'round finished');
}

test('tasks are well formed for every station, topic and difficulty', () => {
  for (const diff of Object.keys(DIFFICULTY)) {
    for (const topic of [...TOPICS, null]) {
      for (const station of STATION_IDS) {
        for (let i = 0; i < 5; i++) {
          const t = makeTask(station, topic, diff, 't1');
          assert.equal(t.station, station);
          if (station === 'research') {
            assert.equal(t.cards.filter((c) => c.good).length, 2);
            assert.equal(t.cards.length, DIFFICULTY[diff].researchOptions);
          } else if (station === 'write') {
            assert.equal(t.strips.length, 3);
            assert.ok(!t.strips.every((s, idx) => s.id === t.order[idx]), 'write task is not pre-solved');
          } else if (station === 'design') {
            assert.ok(t.options.some((o) => o.id === t.answer));
            assert.equal(new Set(t.options.map((o) => o.id)).size, 4);
          } else {
            assert.ok(t.answer >= 0 && t.answer < t.words.length);
            const shown = t.words[t.answer].replace(/[^A-Za-z]/g, '');
            assert.notEqual(shown.toLowerCase(), t.fix.toLowerCase(), 'the typo differs from the fix');
          }
        }
      }
    }
  }
});

test('every topic edit sentence contains a word we can misspell', () => {
  for (const topic of TOPICS) {
    for (let i = 0; i < 20; i++) {
      const t = makeTask('edit', topic, 'sophomore', 'x');
      assert.ok(t.words.length > 2, topic.id);
    }
  }
});

test('quick play: one human plus bots finishes a full round with sane results', () => {
  const clock = makeClock();
  const game = new Game('ABCD', clock.now);
  const { player } = game.join({ name: 'Zubair' });
  assert.equal(game.hostId, player.id);
  game.handle(player.id, { t: 'quickplay' });
  assert.equal(game.players.size, 4);
  assert.equal(game.phase, 'countdown');
  runRound(game, clock, [player.id]);
  const r = game.results;
  assert.ok(r.transcript.length > 5, `assignments were resolved (${r.transcript.length})`);
  assert.ok(r.submitted > 0, 'some work got submitted');
  assert.ok(r.gpa >= 0 && r.gpa <= 4);
  assert.equal(r.awards.length, 4);
  const awardIds = r.awards.map((a) => a.id).filter((id) => id !== 'support');
  assert.equal(new Set(awardIds).size, awardIds.length, 'each award goes to one player');
  // back to the lobby and play again
  game.handle(player.id, { t: 'lobby' });
  assert.equal(game.phase, 'lobby');
  game.handle(player.id, { t: 'start' });
  runRound(game, clock, [player.id]);
});

test('every difficulty and length works with 1 to 8 players', () => {
  for (const difficulty of Object.keys(DIFFICULTY)) {
    for (const size of [1, 2, 3, 5, 8]) {
      const clock = makeClock();
      const game = new Game('WXYZ', clock.now);
      const humans = [];
      for (let i = 0; i < Math.min(size, 3); i++) humans.push(game.join({ name: `P${i}` }).player.id);
      for (let i = humans.length; i < size; i++) game.addBot();
      game.handle(humans[0], { t: 'settings', difficulty, length: 120 });
      game.handle(humans[0], { t: 'start' });
      runRound(game, clock, humans);
      assert.ok(game.results.transcript.length > 0, `${difficulty} with ${size} players resolved work`);
    }
  }
});

test('drop-outs, reconnects, late joins and host hand-off keep the game consistent', () => {
  const clock = makeClock();
  const game = new Game('QRST', clock.now);
  const a = game.join({ name: 'Ann' }).player;
  const b = game.join({ name: 'Ben' }).player;
  const c = game.join({ name: 'Cy' }).player;
  game.handle(a.id, { t: 'start' });
  let late = null;
  runRound(game, clock, [a.id, b.id, c.id], {
    onStep(i) {
      if (i === 150) game.disconnect(a.id); // the host drops mid-round
      if (i === 200) {
        assert.equal(game.players.get(a.id).away, true, 'dropped player is marked away');
        assert.equal(game.players.get(a.id).desk.length, 0, 'their work moved to teammates');
        assert.notEqual(game.hostId, a.id, 'host handed off');
      }
      if (i === 260) {
        const back = game.join({ token: a.token, name: 'Ann' });
        assert.equal(back.rejoined, true);
        assert.equal(back.player.id, a.id);
      }
      if (i === 300) late = game.join({ name: 'Late Larry' }).player;
      if (i === 320) assert.ok(late.stations.length === 1, 'late joiner got a job');
      if (i === 400) game.removePlayer(c.id);
    },
  });
  assert.ok(game.results.transcript.length > 0);
});

test('host controls are host-only and lobby-only', () => {
  const clock = makeClock();
  const game = new Game('LMNP', clock.now);
  const host = game.join({ name: 'Host' }).player;
  const guest = game.join({ name: 'Guest' }).player;
  game.handle(guest.id, { t: 'addBot' });
  assert.equal(game.players.size, 2, 'guests cannot add bots');
  game.handle(host.id, { t: 'addBot' });
  assert.equal(game.players.size, 3);
  game.handle(guest.id, { t: 'start' });
  assert.equal(game.phase, 'lobby', 'guests cannot start');
  game.handle(host.id, { t: 'kick', id: guest.id });
  assert.ok(!game.players.has(guest.id));
  assert.deepEqual(game.drainCloses().map((c) => c.id), [guest.id]);
  // names are cleaned and made unique
  const dup = game.join({ name: '  <b>Host</b>  ' }).player;
  assert.equal(dup.name, 'bHost/b');
  const dup2 = game.join({ name: 'Host' }).player;
  assert.equal(dup2.name, 'Host 2');
});

test('bot difficulty changes how fast the bots work', () => {
  const avgTaskMs = {};
  for (const botLevel of ['easy', 'medium', 'hard']) {
    let ms = 0;
    let tasks = 0;
    for (let i = 0; i < 3; i++) {
      const clock = makeClock();
      const game = new Game('BOTS', clock.now);
      const host = game.join({ name: 'Host' }).player;
      game.handle(host.id, { t: 'settings', botLevel, length: 120 });
      game.handle(host.id, { t: 'settings', botLevel: 'impossible' }); // ignored
      assert.equal(game.settings.botLevel, botLevel);
      for (let b = 0; b < 3; b++) game.addBot();
      game.handle(host.id, { t: 'start' });
      runRound(game, clock, [host.id]);
      assert.equal(game.results.botLevel, botLevel);
      assert.equal(game.results.bots, 3);
      for (const p of game.players.values()) {
        if (p.isBot) { ms += p.stats.taskMs; tasks += p.stats.tasks; }
      }
    }
    assert.ok(tasks > 0, `${botLevel} bots did some work`);
    avgTaskMs[botLevel] = Math.round(ms / tasks);
  }
  assert.ok(avgTaskMs.easy < avgTaskMs.medium && avgTaskMs.medium < avgTaskMs.hard, `average bot task time: ${JSON.stringify(avgTaskMs)}`);
});

test('rival groups race you, get stronger by level, and the report card names a winner', () => {
  const avg = {};
  for (const level of ['easy', 'medium', 'hard']) {
    let gpa = 0;
    for (let i = 0; i < 4; i++) {
      const clock = makeClock();
      const game = new Game('RIVA', clock.now);
      const host = game.join({ name: 'Host' }).player;
      game.handle(host.id, { t: 'settings', rival: level, length: 120 });
      game.handle(host.id, { t: 'settings', rival: 'impossible' }); // ignored
      assert.equal(game.settings.rival, level);
      game.handle(host.id, { t: 'quickplay' });
      assert.ok(game.rival, 'a rival group was created');
      assert.equal(game.rival.players.size, 4, 'the rival group matches our group size');
      let sawRival = false;
      runRound(game, clock, [host.id], {
        onStep(step) {
          if (step % 50) return;
          const v = game.viewFor(host.id);
          if (v.round && v.round.rival && v.round.rival.name) sawRival = true;
        },
      });
      assert.ok(sawRival, 'players can see the rival score during the round');
      const r = game.results.rival;
      assert.ok(r && ['win', 'lose', 'tie'].includes(r.outcome), 'the report card names a winner');
      assert.equal(r.level, level);
      gpa += r.gpa;
    }
    avg[level] = gpa / 4;
  }
  assert.ok(avg.easy < avg.medium && avg.medium < avg.hard, `rival GPA by level: ${JSON.stringify(avg)}`);

  // Rivals can be switched off.
  const clock = makeClock();
  const game = new Game('SOLO', clock.now);
  const host = game.join({ name: 'Host' }).player;
  game.handle(host.id, { t: 'settings', rival: 'off' });
  game.handle(host.id, { t: 'start' });
  assert.equal(game.rival, null);
  runRound(game, clock, [host.id]);
  assert.equal(game.results.rival, null);
});

test('rooms cap at 8 players and bots make room for humans in the lobby', () => {
  const clock = makeClock();
  const game = new Game('FULL', clock.now);
  const host = game.join({ name: 'Host' }).player;
  for (let i = 0; i < 7; i++) game.handle(host.id, { t: 'addBot' });
  assert.equal(game.players.size, 8);
  const extra = game.join({ name: 'Friend' });
  assert.ok(extra.player, 'a bot stepped aside for a human');
  assert.equal(game.players.size, 8);
  for (let i = 0; i < 7; i++) game.join({ name: `H${i}` });
  assert.equal(game.join({ name: 'Too many' }).error, 'full');
});

// Smoke test against a deployed copy: creates a room, joins it over a
// WebSocket, starts a quick-play round and waits for the first assignment.
// Usage: node test/smoke-live.mjs https://your-worker.workers.dev
const base = process.argv[2];
if (!base) {
  console.error('Usage: node test/smoke-live.mjs <url>');
  process.exit(1);
}

const page = await fetch(base);
console.log('page:', page.status, (await page.text()).includes('Due at 11:59') ? 'looks right' : 'unexpected content');

const created = await fetch(`${base}/api/create`, { method: 'POST' });
const { code } = await created.json();
console.log('room created:', code);

const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws/${code}`);
const seen = new Set();
const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timed out; saw ${[...seen].join(', ')}`)), 20000);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: 'Smoke Test' }));
  ws.onerror = (e) => reject(new Error(`socket error ${e.message || ''}`));
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.t === 'welcome') { seen.add('welcome'); ws.send(JSON.stringify({ t: 'quickplay' })); }
    if (m.t === 'state') {
      seen.add(`phase:${m.phase}`);
      if (m.phase === 'playing' && m.round && m.round.folders.length) {
        clearTimeout(timer);
        console.log(`round running with ${m.players.length} players; first assignment: ${m.round.folders[0].emoji} ${m.round.folders[0].title}`);
        ws.send(JSON.stringify({ t: 'leave' }));
        resolve();
      }
    }
  };
});
await done;
ws.close();
console.log('live smoke test passed:', [...seen].join(' → '));
process.exit(0);

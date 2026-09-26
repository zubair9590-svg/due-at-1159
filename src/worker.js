// Entry point: serves the static site, creates rooms and routes each
// room's WebSocket to its Durable Object.
import { Room } from './room.js';

export { Room };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: easy to read aloud
const NO_STORE = { 'cache-control': 'no-store' };

function randomCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

function roomStub(env, code) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/create') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = randomCode();
        const res = await roomStub(env, code).fetch(`https://room/claim/${code}`, { method: 'POST' });
        if (res.status === 200) return Response.json({ code }, { headers: NO_STORE });
      }
      return Response.json({ error: 'Could not find a free room code. Try again.' }, { status: 503, headers: NO_STORE });
    }

    let match = path.match(/^\/api\/room\/([A-Za-z]{4})$/);
    if (match) {
      const code = match[1].toUpperCase();
      return roomStub(env, code).fetch(`https://room/peek/${code}`);
    }

    match = path.match(/^\/ws\/([A-Za-z]{4})$/);
    if (match) {
      const code = match[1].toUpperCase();
      return roomStub(env, code).fetch(new Request(`https://room/ws/${code}`, request));
    }

    return env.ASSETS.fetch(request);
  },
};

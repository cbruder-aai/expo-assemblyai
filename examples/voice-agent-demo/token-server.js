/* eslint-disable no-console */
// Backend token server for the Dream Journal app.
//
// This is the ONE piece that must run on a server you control. It holds your
// AssemblyAI API key and mints short-lived ("ephemeral") tokens that the app
// redeems to open a streaming / voice-agent WebSocket. The key never leaves
// this process — it is never sent to the app or the browser.
//
// ┌─────────────┐  GET /streaming-token    ┌──────────────┐  Authorization: <API key>  ┌────────────┐
// │  Dream app  │ ───────────────────────▶ │ this server  │ ─────────────────────────▶ │ AssemblyAI │
// │ (client)    │ ◀─────────────────────── │ (holds key)  │ ◀───────── { token } ────── │            │
// └─────────────┘        { token }         └──────────────┘                             └────────────┘
//
// ── WHERE TO PUT YOUR API KEY ─────────────────────────────────────────────
// Put it in `.env` (next to this file) as:
//
//     ASSEMBLYAI_API_KEY=your_real_key_here
//
// then run `npm run token-server` (it loads `.env` automatically). `.env` is
// git-ignored, so the key is never committed. Alternatively, set the env var
// directly — e.g. on a host like Render/Railway/Fly, add ASSEMBLYAI_API_KEY as
// a secret. Get a key at https://www.assemblyai.com/app/api-keys.
// ──────────────────────────────────────────────────────────────────────────

const http = require('node:http');

const API_KEY = process.env.ASSEMBLYAI_API_KEY;
const PORT = Number(process.env.PORT) || 8787;

// Optional: comma-separated list of allowed origins for CORS. Defaults to `*`
// so the local web demo (http://localhost:8081) works out of the box. In
// production, set ALLOWED_ORIGIN to your app's origin.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

if (!API_KEY) {
  console.error(
    '\n✗ ASSEMBLYAI_API_KEY is not set.\n' +
      "  Add it to examples/voice-agent-demo/.env  (copy .env.example if you haven't):\n\n" +
      '      ASSEMBLYAI_API_KEY=your_real_key_here\n\n' +
      '  Get a key at https://www.assemblyai.com/app/api-keys\n'
  );
  process.exit(1);
}

/** Mint a Universal-Streaming (speech-to-text) token. Valid ~60s to connect. */
async function mintStreamingToken() {
  const params = new URLSearchParams({
    expires_in_seconds: '60',
    max_session_duration_seconds: '3600',
  });
  const res = await fetch(`https://streaming.assemblyai.com/v3/token?${params}`, {
    headers: { Authorization: API_KEY },
  });
  if (!res.ok) throw new Error(`streaming token ${res.status}: ${await res.text()}`);
  return (await res.json()).token;
}

/**
 * Mint a Voice Agent token for a bidirectional (two-way audio) session.
 * `expires_in_seconds` is required by the API (the redemption window, max 600).
 */
async function mintVoiceAgentToken() {
  const params = new URLSearchParams({
    expires_in_seconds: '60',
    max_session_duration_seconds: '3600',
  });
  const res = await fetch(`https://agents.assemblyai.com/v1/token?${params}`, {
    headers: { Authorization: API_KEY },
  });
  if (!res.ok) throw new Error(`voice-agent token ${res.status}: ${await res.text()}`);
  return (await res.json()).token;
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  // CORS so the web demo can call this dev server from another origin.
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const path = (req.url || '').split('?')[0];

  try {
    if (path === '/health') {
      json(res, 200, { ok: true, service: 'dream-journal-token-server' });
    } else if (path === '/streaming-token') {
      json(res, 200, { token: await mintStreamingToken() });
    } else if (path === '/voice-agent-token') {
      json(res, 200, { token: await mintVoiceAgentToken() });
    } else {
      json(res, 404, { error: `no route for ${path}` });
    }
  } catch (err) {
    console.error(err);
    json(res, 502, { error: String(err instanceof Error ? err.message : err) });
  }
});

server.listen(PORT, () => {
  console.log(`\n✓ Token server listening on http://localhost:${PORT}`);
  console.log('  Routes: GET /health · GET /streaming-token · GET /voice-agent-token');
  console.log(`  API key loaded (…${API_KEY.slice(-4)}). CORS origin: ${ALLOWED_ORIGIN}\n`);
});

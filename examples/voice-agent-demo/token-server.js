/* eslint-disable no-console */
// Minimal reference token server for the demo.
//
// This is the piece that MUST live on a server you control: it holds your
// AssemblyAI API key and mints short-lived tokens the app redeems. Never put the
// key in the app itself. Run it with:
//
//   ASSEMBLYAI_API_KEY=your_key node token-server.js
//
// Then set EXPO_PUBLIC_TOKEN_ENDPOINT=http://localhost:8787 in the app's .env.

const http = require('node:http');

const API_KEY = process.env.ASSEMBLYAI_API_KEY;
const PORT = process.env.PORT || 8787;

if (!API_KEY) {
  console.error('Set ASSEMBLYAI_API_KEY before starting the token server.');
  process.exit(1);
}

async function mintStreamingToken() {
  const params = new URLSearchParams({ expires_in_seconds: '60', max_session_duration_seconds: '3600' });
  const res = await fetch(`https://streaming.assemblyai.com/v3/token?${params}`, {
    headers: { Authorization: API_KEY },
  });
  if (!res.ok) throw new Error(`streaming token ${res.status}: ${await res.text()}`);
  return (await res.json()).token;
}

async function mintVoiceAgentToken() {
  const res = await fetch('https://agents.assemblyai.com/v1/token', {
    headers: { Authorization: API_KEY },
  });
  if (!res.ok) throw new Error(`voice-agent token ${res.status}: ${await res.text()}`);
  return (await res.json()).token;
}

const server = http.createServer(async (req, res) => {
  // CORS so the web demo (localhost:8081) can call this dev server.
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    let token;
    if (req.url?.startsWith('/streaming-token')) token = await mintStreamingToken();
    else if (req.url?.startsWith('/voice-agent-token')) token = await mintVoiceAgentToken();
    else {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ token }));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, () => console.log(`Token server on http://localhost:${PORT}`));

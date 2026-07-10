# AssemblyAI Voice — example app

A branded Expo app demonstrating [`expo-assemblyai`](../../) with two screens:

- **Voice Agent** — a full two-way spoken conversation (`useVoiceAgent`): mic streams up, the
  agent's synthesized voice plays back, barge-in interrupts it, and a `get_current_time` tool
  shows function calling.
- **Live Transcription** — real-time speech-to-text with partial + final turns
  (`useStreamingTranscription`).

It consumes the SDK locally via `file:../..`.

## Run it

You need a backend that mints ephemeral tokens (never put your API key in the app). A minimal
one ships here as `token-server.js`.

```bash
npm install --legacy-peer-deps

# terminal 1 — the token minter (holds your key)
ASSEMBLYAI_API_KEY=your_key npm run token-server

# terminal 2 — the app
cp .env.example .env          # points at http://localhost:8787
npm run web                   # runs in the browser, no native build needed
```

The **web** target works with no native build because the SDK ships a Web Audio fallback.

## Run on a device (native two-way audio)

The SDK ships a native module, so iOS/Android need a dev build (not Expo Go):

```bash
npx expo prebuild            # generates ios/ + android/, applies the config plugin
npx expo run:ios             # or run:android
```

Set `EXPO_PUBLIC_TOKEN_ENDPOINT` in `.env` to a token server reachable from the device (your
LAN IP, not `localhost`).

## Where things are

| File | What |
| --- | --- |
| `App.tsx` | Branded shell + tab switcher |
| `src/screens/VoiceAgentScreen.tsx` | `useVoiceAgent` demo |
| `src/screens/LiveTranscriptionScreen.tsx` | `useStreamingTranscription` demo |
| `src/config.ts` | Token providers (point at your backend) |
| `token-server.js` | Reference token minter (server-side key) |
| `metro.config.js` | Resolves the `file:../..` SDK link |

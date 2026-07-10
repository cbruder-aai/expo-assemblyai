# AssemblyAI - Dream Journal — example app

A branded Expo app built on [`expo-assemblyai`](../../): a **dream journal** you write by typing
or by speaking, with an always-available **voice companion** that knows your journal.

- **List + Calendar views** — one dream entry per day, browsable as a feed or on a month grid
  (dots mark days with an entry). Stored locally with AsyncStorage.
- **Dream entry** — type it, or tap **Dictate** to fill the entry with live speech-to-text
  (`useStreamingTranscription`).
- **Voice companion** (mic FAB, reachable from any screen) — a full two-way spoken conversation
  (`useVoiceAgent`). The session is seeded with your journal, so asks like *"compare today's
  dream to yesterday's"* or *"what themes keep coming up?"* resolve against your real entries.

It consumes the SDK locally via `file:../..`.

## Run it

You need a backend that mints ephemeral tokens (never put your API key in the app). A real,
ready-to-run one ships here as `token-server.js`.

```bash
npm install --legacy-peer-deps

# 1. Put your AssemblyAI API key in .env (git-ignored) — this is the ONLY place it goes:
cp .env.example .env
#    then edit .env and set:  ASSEMBLYAI_API_KEY=your_real_key
#    (get one at https://www.assemblyai.com/app/api-keys)

# terminal 1 — the token minter (reads .env, holds your key)
npm run token-server          # ✓ listening on http://localhost:8787

# terminal 2 — the app (also reads .env for EXPO_PUBLIC_TOKEN_ENDPOINT)
npm run web                   # runs in the browser, no native build needed
```

Sanity-check the backend any time with `curl localhost:8787/health`. The API key lives only in
this server process — the app just calls `/streaming-token` and `/voice-agent-token` for
short-lived tokens (see `src/config.ts`). Deploying? Set `ASSEMBLYAI_API_KEY` as a secret on the
host instead of shipping `.env`.

The **web** target works with no native build because the SDK ships a Web Audio fallback, and
AsyncStorage falls back to `localStorage`.

## Run on a device (native two-way audio)

The SDK ships a native module and this app adds AsyncStorage, so iOS/Android need a dev build
(not Expo Go). Re-run prebuild so the newly added native dependency is linked:

```bash
npx expo prebuild            # generates ios/ + android/, links native deps
npx expo run:ios             # or run:android
```

Set `EXPO_PUBLIC_TOKEN_ENDPOINT` in `.env` to a token server reachable from the device (your
LAN IP, not `localhost`).

## How the journal reaches the voice agent

When you open the companion, `src/prompt.ts` builds the Voice Agent **system prompt** from your
entries (each tagged with its date and a relative label like *yesterday*). The whole recent
journal is embedded inline, so any reference resolves without a tool round-trip. See
`src/components/VoiceAgentModal.tsx`.

## Where things are

| File | What |
| --- | --- |
| `App.tsx` | Shell: List/Calendar tabs, editor modal, voice FAB + modal |
| `src/screens/JournalListScreen.tsx` | Dream feed, newest first |
| `src/screens/CalendarScreen.tsx` | Month grid with entry markers |
| `src/components/DreamEditorModal.tsx` | Type or dictate a day's dream (`useStreamingTranscription`) |
| `src/components/VoiceAgentModal.tsx` | Journal-aware voice companion (`useVoiceAgent`) |
| `src/context/DreamsContext.tsx` | Load/persist/CRUD dreams |
| `src/storage/dreams.ts` | AsyncStorage read/write |
| `src/prompt.ts` | Builds the journal-seeded system prompt |
| `src/config.ts` | Token providers (point at your backend) |
| `token-server.js` | Reference token minter (server-side key) |
| `metro.config.js` | Resolves the `file:../..` SDK link |

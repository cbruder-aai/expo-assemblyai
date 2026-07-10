<div align="center">

# expo-assemblyai

**Two-way voice for React Native & Expo, powered by [AssemblyAI](https://www.assemblyai.com).**

Stream the mic up, hear the agent talk back — one hook. Plus live speech-to-text,
async transcription, Audio Intelligence, and the LLM Gateway.

![platforms](https://img.shields.io/badge/iOS%20·%20Android%20·%20Web-15%2B-00d8ef?style=flat-square)
![powered by AssemblyAI](https://img.shields.io/badge/powered%20by-AssemblyAI-f32a91?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-3ddc97?style=flat-square)

</div>

## Why

AssemblyAI had no first-party React Native SDK and no two-way mobile audio story, so
mobile teams hand-rolled WebSocket bridges or forked someone else's audio module. This is
the "just import a hook" path — the native mic/echo-cancellation/playback plumbing is done
for you, and the transport is typed.

```tsx
import { useVoiceAgent } from 'expo-assemblyai';

function Assistant() {
  const agent = useVoiceAgent({
    token: getToken, // ← your backend mints an ephemeral token
    session: { greeting: 'Hi! How can I help?', systemPrompt: 'You are helpful and concise.' },
  });

  return (
    <Button
      title={agent.status === 'idle' ? 'Talk' : 'Stop'}
      onPress={agent.status === 'idle' ? agent.start : agent.stop}
    />
  );
}
```

That's a full spoken conversation: mic capture with echo cancellation, the agent's
synthesized voice played back through the speaker, barge-in when the user interrupts, and
tool calls routed to your handler.

## Install

```bash
npx expo install expo-assemblyai
```

Add the config plugin (sets up microphone permission + background audio) in `app.json`:

```json
{
  "expo": {
    "plugins": [
      ["expo-assemblyai", { "microphonePermission": "We use the mic for voice chat." }]
    ]
  }
}
```

Then create a dev build — this ships a native module, so **Expo Go can't load it** (web
works with a Web Audio fallback):

```bash
npx expo prebuild
npx expo run:ios   # or run:android
```

## Security: never ship your API key

A leaked key bills to your account. Streaming and voice-agent sessions use **ephemeral
tokens** minted by *your* backend. The SDK takes a `TokenProvider` everywhere it connects:

```ts
// app: hand the SDK a function that calls YOUR server
const getToken = async () => (await fetch('https://api.example.com/aai-token')).json().then((r) => r.token);

// your server (Node): mint a short-lived token with the raw key
import { createStreamingToken } from 'expo-assemblyai';
app.get('/aai-token', async (_req, res) => {
  res.json({ token: await createStreamingToken(process.env.ASSEMBLYAI_API_KEY) });
});
```

The async REST + LLM Gateway APIs have **no** client-token flow — run `RestClient` /
`LlmGateway` on your server, or point their `baseUrl` at a proxy you control.

## What's in the box

| Capability | Hook | Client |
| --- | --- | --- |
| **Two-way voice agent** (mic ↔ synthesized speech, tools, barge-in) | `useVoiceAgent` | `VoiceAgent` |
| **Live speech-to-text** (partial + final turns, diarization) | `useStreamingTranscription` | `StreamingTranscriber` |
| **Microphone permission** | `useMicrophonePermissions` | — |
| **Async transcription + Audio Intelligence** (sentiment, PII redaction, entities, …) | — | `RestClient` |
| **LLM Gateway** (OpenAI-compatible chat over 25+ models) | — | `LlmGateway` |
| **Full-duplex native audio** (AEC, resampling, metering) | — | `AudioSession` |

Everything is built on the `AudioSession` seam, so you can drop down to the clients when a
hook isn't enough, or inject a fake session in tests.

## Live transcription example

```tsx
import { useStreamingTranscription } from 'expo-assemblyai';

const { transcript, partialTranscript, isListening, start, stop } =
  useStreamingTranscription({ token: getToken, keytermsPrompt: ['AssemblyAI', 'Expo'] });
```

## Async transcription (server-side / via proxy)

```ts
import { RestClient } from 'expo-assemblyai';

const client = new RestClient({ apiKey: process.env.ASSEMBLYAI_API_KEY }); // server only!
const t = await client.transcribe({
  audio_url: 'https://example.com/clip.mp3',
  speaker_labels: true,
  sentiment_analysis: true,
});
console.log(t.text);
```

## Example app

A branded, runnable demo lives in [`examples/voice-agent-demo`](./examples/voice-agent-demo)
— a voice agent and a live-transcription screen. It runs on web with no native build:

```bash
cd examples/voice-agent-demo
npm install
ASSEMBLYAI_API_KEY=your_key npm run token-server   # in one terminal
npm run web                                         # in another
```

## Platform support

| | iOS | Android | Web |
| --- | --- | --- | --- |
| Echo cancellation | Voice-processing IO | `VOICE_COMMUNICATION` + `AcousticEchoCanceler` | `getUserMedia` constraint |
| Native build required | ✅ (dev client) | ✅ (dev client) | ❌ (Web Audio fallback) |

## Docs & provenance

The architecture is documented in [`AGENTS.md`](./AGENTS.md). It borrows DX lessons from
[Blurt](https://github.com/AssemblyAI/blurt), AssemblyAI's open-source macOS dictation app —
the injectable capture/token seams, connection warm-up, and volume metering — adapted from
one-way dictation to two-way streaming.

## License

MIT © AssemblyAI

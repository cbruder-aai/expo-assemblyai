# AGENTS.md

This file is the canonical agent guide for working with this repository.

## What this is

`expo-assemblyai` is a React Native / Expo SDK for [AssemblyAI](https://www.assemblyai.com). It gives mobile (and web) apps **bidirectional, two-way streaming audio** — stream the microphone up and play the agent's synthesized voice back over one WebSocket — plus live speech-to-text, async transcription, Audio Intelligence, and the LLM Gateway. The headline use case is a spoken **voice agent**: the user talks, the agent talks back, tools get called, all hands-free.

It exists to close a real gap: AssemblyAI has had no first-party React Native SDK and no two-way mobile audio story, so mobile developers hand-rolled WebSocket bridges or reached for a competitor's module. This is the "just import a hook" path, modeled on how Expo documents RevenueCat/Stripe/Sentry.

Three layers, low to high:

- **Native audio** (`ios/`, `android/`, surfaced in JS as `AudioSession`) — an Expo Module (Swift + Kotlin) that does the unglamorous hard part: full-duplex mic capture and speaker playback with **Acoustic Echo Cancellation**, resampling, base64 framing, and volume metering. This is the part developers keep forking other libraries to get.
- **Clients** (`src/client/`) — pure-TypeScript, dependency-free wrappers over the AssemblyAI WebSocket/REST APIs: `StreamingTranscriber`, `VoiceAgent`, `RestClient`, `LlmGateway`. They own the transport; they do not touch hardware.
- **Hooks** (`src/hooks/`) — `useVoiceAgent`, `useStreamingTranscription`, `useMicrophonePermissions`. They wire the audio seam to a client and expose React state.

The example app lives in `examples/voice-agent-demo/` (a real, latest Expo app that consumes the SDK).

## The security model — read this first

**Never ship an AssemblyAI API key in the app.** A leaked key bills to your account.

- **Streaming & Voice Agent** support short-lived **ephemeral tokens**. Your backend holds the key, calls the token endpoint, and hands the client a token good for one session. The SDK takes a `TokenProvider` (`() => Promise<string>`) everywhere a session connects — see `src/client/tokens.ts`. `createStreamingToken(apiKey)` / `createVoiceAgentToken(apiKey)` are exported for your **backend** to use (they take the raw key).
- **Async REST + LLM Gateway have _no_ client token flow.** `RestClient` / `LlmGateway` must run on a server, or route through a proxy you control (pass `baseUrl`, leave `apiKey` unset). This constraint is load-bearing — don't add a "just pass your API key in the app" convenience path.

This mirrors Blurt's `APIKeyGateway` seam: the client depends on an injectable secret source, never a hardcoded key.

## Architecture

```text
                         ┌───────────────────────────────────────────┐
   native mic  ──chunk──▶│  AudioSession (seam over the Expo module)   │
   (PCM16, AEC)          │  onMicrophoneData / onInputVolume / play()  │
                         └───────────────┬─────────────────────────────┘
                                         │ base64 chunks
                          ┌──────────────▼───────────────┐
   useVoiceAgent  ───────▶│  VoiceAgent (wss agents/v1/ws)│──▶ reply.audio (base64) ──▶ AudioSession.play()
   useStreaming…  ───────▶│  StreamingTranscriber (v3/ws) │──▶ Turn events ──▶ React state
                          └──────────────┬───────────────┘
                                         │ ephemeral token
                          ┌──────────────▼───────────────┐
                          │  TokenProvider → your backend │──▶ GET /v3/token | /v1/token
                          └───────────────────────────────┘
```

### The AudioSession seam

`src/audio/AudioSession.ts` defines the `AudioSession` interface and `NativeAudioSession` (its production impl over the native module). Everything — clients, hooks, tests — depends on the **interface**, not the raw native module. This is Blurt's `MicCaptureProtocol` lesson applied: a narrow, injectable seam so the transcription/agent logic is unit-testable against a fake and so the web build and test doubles slot in cleanly. When adding a native capability, extend the interface first, then implement it in `NativeAudioSession`, the Swift module, the Kotlin module, and the web module — all four, in sync.

### Native audio: why AVAudioEngine / AudioRecord, not a recorder

Blurt (a dictation app) records a whole utterance to a WAV file with `AVAudioRecorder`, then sends it once. **This SDK cannot do that** — two-way audio needs the mic and speaker open *simultaneously*, with the far-end (agent) audio cancelled out of the near-end (mic) signal in real time. So:

- **iOS** (`ios/TwoWayAudioEngine.swift`): `AVAudioEngine` with **voice-processing IO** (`setVoiceProcessingEnabled(true)`) + `.voiceChat` session mode → Apple's AEC/AGC/NS. A tap resamples to the target rate, frames chunks, base64-encodes. A player node schedules decoded agent audio through the same graph the AEC references.
- **Android** (`android/.../TwoWayAudioEngine.kt`): `AudioRecord` on `VOICE_COMMUNICATION` (platform pre-processing) + an explicit `AcousticEchoCanceler`/`NoiseSuppressor` effect, and a streaming `AudioTrack` for playback.

Do **not** replace these with a record-to-file path — it defeats the entire purpose.

### Audio wire formats (do not drift from these)

| Path | Encoding | Sample rate | Framing |
| --- | --- | --- | --- |
| Universal Streaming (up) | `pcm_s16le` (default) | 16000 | **raw binary** WS frames, 50–1000ms each |
| Voice Agent input (up) | `audio/pcm` | **24000** (μ-law/A-law = 8000) | **base64** inside `{type:'input.audio'}` JSON |
| Voice Agent output (down) | `audio/pcm` | **24000** | **base64** inside `{type:'reply.audio'}` JSON |

The two APIs frame audio differently on purpose (binary vs base64-in-JSON) — `StreamingTranscriber.sendAudioBase64` converts to binary; `VoiceAgent.sendAudioBase64` wraps in JSON. The native mic always emits **base64 PCM16**; each client adapts. Set the native `inputSampleRate` to match the API you're using (16k for streaming, 24k for the agent) — the hooks do this for you.

## Message protocol quick reference

- **Universal Streaming** (`wss://streaming.assemblyai.com/v3/ws`): one polymorphic `Turn` message carries both partial and final results — distinguish via `end_of_turn`, `turn_is_formatted`, and per-word `word_is_final`. Lifecycle: `Begin` → `Turn`* → `Termination`. Client control JSON: `UpdateConfiguration`, `ForceEndpoint`, `Terminate`, `KeepAlive`.
- **Voice Agent** (`wss://agents.assemblyai.com/v1/ws`): dotted message types. First client message must be `session.update`. Server → client: `session.ready`, `input.speech.started/stopped`, `transcript.user.delta`/`transcript.user`, `reply.started`, `reply.audio` (the TTS audio), `transcript.agent`, `reply.done`, `tool.call`, `session.error`, `session.ended`. Client → server: `input.audio`, `tool.result`, `reply.create`, `session.update`, `session.end`.
- **Barge-in**: on `input.speech.started`, call `AudioSession.clearPlayback()` to stop the agent mid-sentence. `useVoiceAgent` does this unless `disableBargeIn` is set.

## Common commands

```bash
npm install                 # install SDK dev deps (expo-module-scripts, expo-modules-core)
npm run build               # compile src/ → build/ (expo-module build)
npm run lint                # expo-module lint (eslint)
npx tsc --noEmit            # typecheck the SDK
npm test                    # jest via expo-module test

# Example app (examples/voice-agent-demo)
cd examples/voice-agent-demo
npm run web                 # runs in the browser using the Web Audio fallback (no native build)
npx expo prebuild           # generate ios/ + android/ (required — custom native module)
npx expo run:ios            # dev client on a simulator/device
```

## Working without native tooling (Linux / web sandboxes / CI)

The TypeScript layer (`src/`) builds and typechecks anywhere Node runs — it has no native dependency at compile time. The Swift/Kotlin native modules and the example's native build require macOS + Xcode (iOS) or the Android SDK, and **cannot be verified in a Linux/web sandbox**. What you can still do there: edit and typecheck all of `src/`, run the JS unit tests, and run the example on **web** (the `ExpoAssemblyAIModule.web.ts` Web Audio fallback means the demo actually works in a browser). What NOT to do: claim an iOS/Android build passed from a sandbox — flag that device verification is required.

## Conventions

- **TypeScript, strict.** `tsconfig.json` extends `expo-module-scripts/tsconfig.base` with `strict` + `noUncheckedIndexedAccess`. Keep the tree typeclean.
- **The clients are dependency-free and platform-agnostic.** `src/client/*` uses only `WebSocket`, `fetch`, and base64 helpers — no `expo-*` imports, no React. This keeps them testable in plain Node and reusable outside RN. Don't import native or React code into `src/client/`.
- **Native surface stays tiny.** The WebSocket lives in JS, not native. The native module only moves PCM in/out of hardware. Resist pushing transport into Swift/Kotlin — it triples the maintenance and breaks the single-source-of-truth for the protocol.
- **Keep the four platforms in sync.** A change to the native contract touches: `AudioSession` (interface), `ios/`, `android/`, and `ExpoAssemblyAIModule.web.ts`. The event/function names in `ExpoAssemblyAIModule.types.ts` are the contract.
- **Two-space indent** (matches the Expo/Prettier default and Blurt's `.editorconfig`).

## Things deliberately not here

- **No record-to-file capture path.** See "why AVAudioEngine" above.
- **No API key in client code.** Streaming/agent use ephemeral tokens; REST/LLM route through a proxy. Don't add a client-key convenience.
- **No transport in native code.** WebSocket handling is JS-only, shared across platforms.
- **No bundled backend.** Token minting and REST proxying are the app author's responsibility (documented in the README and example). The SDK ships the client half only.

## Provenance

The architecture borrows hard-won lessons from [Blurt](https://github.com/AssemblyAI/blurt), AssemblyAI's open-source macOS dictation app: the injectable capture seam (`MicCaptureProtocol` → `AudioSession`), the injectable key/token gateway (`APIKeyGateway` → `TokenProvider`), connection warm-up for latency, and volume-metering for voice UI. Blurt is one-way/synchronous (dictation); this SDK is two-way/streaming (agents) — so the audio engine and transport are new, but the DX discipline is inherited.

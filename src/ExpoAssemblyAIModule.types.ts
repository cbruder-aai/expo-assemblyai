/**
 * Shared types for the native two-way audio module and the JS clients.
 *
 * The field names here are a contract with the native side
 * (`ios/ExpoAssemblyAIModule.swift`, `android/.../ExpoAssemblyAIModule.kt`) —
 * keep them in sync.
 */

/** Audio session geometry handed to the native engine at `initialize`. */
export type AudioSessionConfig = {
  /**
   * Mic capture rate in Hz. Universal Streaming defaults to 16000; the Voice
   * Agent API expects 24000 for `audio/pcm`. Defaults to 16000.
   */
  inputSampleRate?: number;
  /**
   * Playback rate in Hz for agent audio. Voice Agent `audio/pcm` output is
   * 24000 (μ-law/A-law is 8000). Defaults to 24000.
   */
  outputSampleRate?: number;
  /**
   * Enable platform Acoustic Echo Cancellation (voice-processing IO on iOS,
   * `VOICE_COMMUNICATION` + `AcousticEchoCanceler` on Android). Required for
   * two-way audio so the agent's voice isn't fed back into the mic. Defaults to true.
   */
  enableEchoCancellation?: boolean;
  /**
   * Size of each emitted mic chunk in milliseconds. Universal Streaming accepts
   * 50–1000ms frames; 100ms is a good latency/overhead balance. Defaults to 100.
   */
  chunkDurationMs?: number;
};

/** Result of a microphone permission query/request. Mirrors expo-modules-core PermissionResponse. */
export type PermissionResponse = {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied' | 'undetermined';
};

/** Payload of the `onMicrophoneData` event: one base64-encoded PCM16 mono chunk. */
export type MicrophoneDataEvent = { data: string };
/** Payload of the `onInputVolume` / `onOutputVolume` events: a normalized 0…1 level. */
export type VolumeEvent = { level: number };
/** Payload of the `onError` event. */
export type AudioErrorEvent = { message: string };

/** The native module's event map (used to type the emitter). */
export type ExpoAssemblyAIModuleEvents = {
  onMicrophoneData: (event: MicrophoneDataEvent) => void;
  onInputVolume: (event: VolumeEvent) => void;
  onOutputVolume: (event: VolumeEvent) => void;
  onPlaybackFinished: () => void;
  onError: (event: AudioErrorEvent) => void;
};

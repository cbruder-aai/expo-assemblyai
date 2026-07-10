import type { EventSubscription } from 'expo-modules-core';

import NativeModule from '../ExpoAssemblyAIModule';
import type {
  AudioErrorEvent,
  AudioSessionConfig,
  MicrophoneDataEvent,
  PermissionResponse,
  VolumeEvent,
} from '../ExpoAssemblyAIModule.types';

const DEFAULTS: Required<AudioSessionConfig> = {
  inputSampleRate: 16_000,
  outputSampleRate: 24_000,
  enableEchoCancellation: true,
  chunkDurationMs: 100,
};

/**
 * The seam every client and hook depends on for hardware audio.
 *
 * Modeled on Blurt's `MicCaptureProtocol`: a narrow, injectable interface so the
 * transcription/agent logic can be unit-tested against a fake and so web / test
 * doubles slot in without touching the WebSocket code. `NativeAudioSession` is
 * the production implementation over the Expo native module; tests inject their own.
 */
export interface AudioSession {
  configure(config?: AudioSessionConfig): Promise<void>;
  /** Begin mic capture (and open the speaker path). Requires mic permission. */
  start(): Promise<void>;
  stop(): Promise<void>;
  setMuted(muted: boolean): void;

  /** Play one base64 PCM16 chunk of agent audio at the configured output rate. */
  play(base64Chunk: string): void;
  /** Barge-in: drop all queued agent audio immediately. */
  clearPlayback(): void;

  onMicrophoneData(listener: (chunk: string) => void): EventSubscription;
  onInputVolume(listener: (level: number) => void): EventSubscription;
  onOutputVolume(listener: (level: number) => void): EventSubscription;
  onPlaybackFinished(listener: () => void): EventSubscription;
  onError(listener: (message: string) => void): EventSubscription;

  requestPermissions(): Promise<PermissionResponse>;
  getPermissions(): PermissionResponse;
}

/** Production `AudioSession` backed by the native (or web) Expo module. */
export class NativeAudioSession implements AudioSession {
  async configure(config: AudioSessionConfig = {}): Promise<void> {
    await NativeModule.initialize({ ...DEFAULTS, ...stripUndefined(config) });
  }
  start(): Promise<void> {
    return NativeModule.start();
  }
  stop(): Promise<void> {
    return NativeModule.stop();
  }
  setMuted(muted: boolean): void {
    NativeModule.setMuted(muted);
  }
  play(base64Chunk: string): void {
    NativeModule.enqueuePlayback(base64Chunk);
  }
  clearPlayback(): void {
    NativeModule.clearPlayback();
  }

  onMicrophoneData(listener: (chunk: string) => void): EventSubscription {
    return NativeModule.addListener('onMicrophoneData', (e: MicrophoneDataEvent) => listener(e.data));
  }
  onInputVolume(listener: (level: number) => void): EventSubscription {
    return NativeModule.addListener('onInputVolume', (e: VolumeEvent) => listener(e.level));
  }
  onOutputVolume(listener: (level: number) => void): EventSubscription {
    return NativeModule.addListener('onOutputVolume', (e: VolumeEvent) => listener(e.level));
  }
  onPlaybackFinished(listener: () => void): EventSubscription {
    return NativeModule.addListener('onPlaybackFinished', listener);
  }
  onError(listener: (message: string) => void): EventSubscription {
    return NativeModule.addListener('onError', (e: AudioErrorEvent) => listener(e.message));
  }

  requestPermissions(): Promise<PermissionResponse> {
    return NativeModule.requestRecordingPermissionsAsync();
  }
  getPermissions(): PermissionResponse {
    return NativeModule.getRecordingPermissionsAsync();
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** The default shared session used by hooks when none is injected. */
export const sharedAudioSession: AudioSession = new NativeAudioSession();

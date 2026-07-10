import { NativeModule, requireNativeModule } from 'expo-modules-core';

import type {
  AudioSessionConfig,
  ExpoAssemblyAIModuleEvents,
  PermissionResponse,
} from './ExpoAssemblyAIModule.types';

/**
 * Typed handle to the native two-way audio module.
 *
 * This is the raw bridge. App code should not use it directly — go through
 * {@link NativeAudioSession} (`src/audio/AudioSession.ts`), the seam the clients
 * and hooks depend on, so the transport can be stubbed in tests and swapped on web.
 */
declare class ExpoAssemblyAIModule extends NativeModule<ExpoAssemblyAIModuleEvents> {
  requestRecordingPermissionsAsync(): Promise<PermissionResponse>;
  getRecordingPermissionsAsync(): PermissionResponse;

  initialize(options: Required<AudioSessionConfig>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  setMuted(muted: boolean): void;

  /** Enqueue agent audio (base64 PCM16 at the configured output rate) for playback. */
  enqueuePlayback(base64: string): void;
  /** Barge-in: drop everything queued so the agent stops speaking immediately. */
  clearPlayback(): void;
}

export default requireNativeModule<ExpoAssemblyAIModule>('ExpoAssemblyAI');

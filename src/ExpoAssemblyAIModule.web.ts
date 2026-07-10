import { NativeModule, registerWebModule } from 'expo-modules-core';

import { decodeBase64 } from './client/emitter';
import type {
  AudioSessionConfig,
  ExpoAssemblyAIModuleEvents,
  PermissionResponse,
} from './ExpoAssemblyAIModule.types';

/**
 * Web implementation of the two-way audio module using the Web Audio API.
 *
 * The native iOS/Android modules get platform AEC for free; browsers do not, so
 * we rely on `getUserMedia`'s `echoCancellation` constraint. Capture downsamples
 * the AudioContext rate to the configured input rate and emits base64 PCM16;
 * playback schedules decoded PCM16 buffers on the same context. This keeps
 * `expo-assemblyai` working under react-native-web and in Expo Go's web target.
 */
class ExpoAssemblyAIWebModule extends NativeModule<ExpoAssemblyAIModuleEvents> {
  private config: Required<AudioSessionConfig> = {
    inputSampleRate: 16_000,
    outputSampleRate: 24_000,
    enableEchoCancellation: true,
    chunkDurationMs: 100,
  };
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private muted = false;
  private playhead = 0;
  private pending: Float32Array[] = [];

  async requestRecordingPermissionsAsync(): Promise<PermissionResponse> {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      return { granted: true, canAskAgain: true, status: 'granted' };
    } catch {
      return { granted: false, canAskAgain: true, status: 'denied' };
    }
  }

  getRecordingPermissionsAsync(): PermissionResponse {
    return { granted: false, canAskAgain: true, status: 'undetermined' };
  }

  async initialize(options: Required<AudioSessionConfig>): Promise<void> {
    this.config = options;
  }

  async start(): Promise<void> {
    this.context = new AudioContext();
    this.playhead = this.context.currentTime;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: this.config.enableEchoCancellation,
        noiseSuppression: this.config.enableEchoCancellation,
        channelCount: 1,
      },
    });
    this.source = this.context.createMediaStreamSource(this.stream);
    // ScriptProcessorNode is deprecated but needs no external worklet file, which
    // keeps this module self-contained. Swap for an AudioWorklet if you ship one.
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => this.onAudio(e.inputBuffer.getChannelData(0));
    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  async stop(): Promise<void> {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.context?.close();
    this.context = this.stream = this.processor = this.source = null;
    this.pending = [];
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  enqueuePlayback(base64: string): void {
    if (!this.context) return;
    const pcm = base64ToInt16(base64);
    const float = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) float[i] = (pcm[i] ?? 0) / 32768;
    const buffer = this.context.createBuffer(1, float.length, this.config.outputSampleRate);
    buffer.copyToChannel(float, 0);
    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.connect(this.context.destination);
    const now = this.context.currentTime;
    this.playhead = Math.max(this.playhead, now);
    node.start(this.playhead);
    this.playhead += buffer.duration;
    this.emit('onOutputVolume', { level: rms(float) });
    node.onended = () => {
      if (this.context && this.playhead <= this.context.currentTime + 0.02) {
        this.emit('onPlaybackFinished');
      }
    };
  }

  clearPlayback(): void {
    this.playhead = this.context?.currentTime ?? 0;
  }

  private onAudio(input: Float32Array): void {
    this.emit('onInputVolume', { level: this.muted ? 0 : rms(input) });
    if (this.muted || !this.context) return;
    const downsampled = downsample(input, this.context.sampleRate, this.config.inputSampleRate);
    this.pending.push(downsampled);
    const samplesPerChunk = (this.config.inputSampleRate * this.config.chunkDurationMs) / 1000;
    let total = this.pending.reduce((n, a) => n + a.length, 0);
    while (total >= samplesPerChunk) {
      const merged = mergeFloat(this.pending, samplesPerChunk);
      this.pending = merged.rest.length ? [merged.rest] : [];
      total = merged.rest.length;
      this.emit('onMicrophoneData', { data: int16ToBase64(floatToInt16(merged.chunk)) });
    }
  }
}

function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += (samples[i] ?? 0) ** 2;
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return input.slice();
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = input[Math.floor(i * ratio)] ?? 0;
  return out;
}

function mergeFloat(chunks: Float32Array[], take: number): { chunk: Float32Array; rest: Float32Array } {
  const all = new Float32Array(chunks.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return { chunk: all.slice(0, take), rest: all.slice(take) };
}

function floatToInt16(float: Float32Array): Int16Array {
  const out = new Int16Array(float.length);
  for (let i = 0; i < float.length; i++) {
    const s = Math.max(-1, Math.min(1, float[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  const g = globalThis as { btoa?: (s: string) => string; Buffer?: any };
  return typeof g.btoa === 'function' ? g.btoa(binary) : g.Buffer.from(binary, 'binary').toString('base64');
}

function base64ToInt16(base64: string): Int16Array {
  const binary = decodeBase64(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export default registerWebModule(ExpoAssemblyAIWebModule, 'ExpoAssemblyAI');

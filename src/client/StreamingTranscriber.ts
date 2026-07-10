import { TypedEmitter, base64ToBytes, closeSocket } from './emitter';
import type { TokenProvider } from './tokens';

/** A single word inside a {@link StreamingTurn}. */
export type StreamingWord = {
  text: string;
  start: number;
  end: number;
  confidence: number;
  word_is_final: boolean;
  speaker?: string;
};

/**
 * A `Turn` message from Universal Streaming. Partial vs final is conveyed by the
 * fields, not by separate message types: `end_of_turn` marks the turn complete,
 * `turn_is_formatted` marks the punctuated/cased version, and each word carries
 * `word_is_final`.
 */
export type StreamingTurn = {
  turn_order: number;
  turn_is_formatted: boolean;
  end_of_turn: boolean;
  transcript: string;
  end_of_turn_confidence: number;
  words: StreamingWord[];
  utterance?: string;
  language_code?: string;
  language_confidence?: number;
  speaker_label?: string;
};

export type StreamingBegin = { id: string; expires_at: number };
export type StreamingTermination = {
  audio_duration_seconds: number;
  session_duration_seconds: number;
};

type StreamingEvents = {
  open: (begin: StreamingBegin) => void;
  /** Fires on every Turn message — inspect `end_of_turn` / `turn_is_formatted`. */
  turn: (turn: StreamingTurn) => void;
  /** Convenience: fires only when `end_of_turn` is true. */
  finalTurn: (turn: StreamingTurn) => void;
  error: (error: Error) => void;
  close: (info: { code: number; reason: string } & Partial<StreamingTermination>) => void;
};

export type StreamingTranscriberOptions = {
  /** Ephemeral token source (from your backend). See {@link TokenProvider}. */
  token: TokenProvider;
  /** Mic capture rate, must match the audio you send. Default 16000. */
  sampleRate?: number;
  encoding?: 'pcm_s16le' | 'pcm_mulaw';
  /** Ask the server for punctuated/cased final transcripts. Default true. */
  formatTurns?: boolean;
  speechModel?: 'universal-streaming-english' | 'universal-streaming-multilingual';
  /** Words/phrases to bias recognition toward (names, jargon). */
  keytermsPrompt?: string[];
  /** Enable streaming diarization (speaker labels on turns/words). */
  speakerLabels?: boolean;
  endOfTurnConfidenceThreshold?: number;
  minTurnSilenceMs?: number;
  maxTurnSilenceMs?: number;
  useEU?: boolean;
};

/**
 * Live speech-to-text over the Universal Streaming WebSocket.
 *
 * Audio goes up as **raw binary frames** (50–1000ms of PCM each). Feed it the
 * base64 chunks from the native mic via {@link sendAudioBase64}; it base64-decodes
 * each chunk and sends it as one binary frame (the native layer already sizes the
 * chunks via `chunkDurationMs`, so the client does not re-frame). The server
 * replies with `Turn` messages surfaced as `turn` events.
 *
 * ```ts
 * const stt = new StreamingTranscriber({ token: getToken });
 * stt.on('turn', (t) => setLive(t.transcript));
 * stt.on('finalTurn', (t) => commit(t.transcript));
 * await stt.connect();
 * session.onMicrophoneData((chunk) => stt.sendAudioBase64(chunk));
 * ```
 */
export class StreamingTranscriber extends TypedEmitter<StreamingEvents> {
  private ws: WebSocket | null = null;
  private readonly options: StreamingTranscriberOptions;
  private termination?: StreamingTermination;

  constructor(options: StreamingTranscriberOptions) {
    super();
    this.options = options;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === 1; // OPEN
  }

  /** Open the socket. Resolves once the server sends `Begin`. */
  async connect(): Promise<void> {
    const token = await this.options.token();
    const host = this.options.useEU ? 'streaming.eu.assemblyai.com' : 'streaming.assemblyai.com';
    const params = new URLSearchParams({
      token,
      sample_rate: String(this.options.sampleRate ?? 16_000),
      encoding: this.options.encoding ?? 'pcm_s16le',
      format_turns: String(this.options.formatTurns ?? true),
      speech_model: this.options.speechModel ?? 'universal-streaming-english',
    });
    if (this.options.keytermsPrompt?.length) {
      params.set('keyterms_prompt', JSON.stringify(this.options.keytermsPrompt));
    }
    if (this.options.speakerLabels) params.set('speaker_labels', 'true');
    if (this.options.endOfTurnConfidenceThreshold != null) {
      params.set('end_of_turn_confidence_threshold', String(this.options.endOfTurnConfidenceThreshold));
    }
    if (this.options.minTurnSilenceMs != null) params.set('min_turn_silence', String(this.options.minTurnSilenceMs));
    if (this.options.maxTurnSilenceMs != null) params.set('max_turn_silence', String(this.options.maxTurnSilenceMs));

    const ws = new WebSocket(`wss://${host}/v3/ws?${params}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    return new Promise((resolve, reject) => {
      let opened = false;
      ws.onmessage = (event) => {
        const msg = JSON.parse(typeof event.data === 'string' ? event.data : '{}');
        switch (msg.type) {
          case 'Begin':
            opened = true;
            this.emit('open', { id: msg.id, expires_at: msg.expires_at });
            resolve();
            break;
          case 'Turn':
            this.emit('turn', msg as StreamingTurn);
            if (msg.end_of_turn) this.emit('finalTurn', msg as StreamingTurn);
            break;
          case 'Termination':
            this.termination = msg as StreamingTermination;
            break;
        }
      };
      ws.onerror = () => {
        const err = new Error('Universal Streaming socket error');
        this.emit('error', err);
        if (!opened) reject(err);
      };
      ws.onclose = (e) => {
        this.emit('close', { code: e.code, reason: e.reason, ...this.termination });
        this.ws = null;
      };
    });
  }

  /** Send one base64 PCM chunk (from the native mic) as a binary frame. */
  sendAudioBase64(base64: string): void {
    if (!this.isConnected) return;
    const bytes = base64ToBytes(base64);
    this.ws!.send(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }

  /** Send raw PCM bytes directly (if you already have an ArrayBuffer). */
  sendAudio(bytes: ArrayBuffer): void {
    if (this.isConnected) this.ws!.send(bytes);
  }

  /** Force the current turn to end now (e.g. on a push-to-talk release). */
  forceEndpoint(): void {
    this.send({ type: 'ForceEndpoint' });
  }

  updateConfiguration(config: {
    end_of_turn_confidence_threshold?: number;
    min_turn_silence?: number;
    max_turn_silence?: number;
  }): void {
    this.send({ type: 'UpdateConfiguration', ...config });
  }

  /**
   * Gracefully end the session; the server replies with `Termination` then closes.
   *
   * Resolves once the socket has actually closed, so any `close` listener (which
   * carries the `Termination` payload: audio/session duration) still fires before
   * teardown. Listeners are removed only after that, not synchronously.
   */
  async close(): Promise<void> {
    this.send({ type: 'Terminate' });
    await closeSocket(this.ws);
    this.removeAllListeners();
  }

  private send(message: object): void {
    if (this.isConnected) this.ws!.send(JSON.stringify(message));
  }
}

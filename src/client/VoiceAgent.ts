import { TypedEmitter } from './emitter';
import type { TokenProvider } from './tokens';

/** A function tool the agent can call. `parameters` is JSON Schema, passed to the LLM verbatim. */
export type AgentTool = {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execution_mode?: 'interactive' | 'hold';
  timeout_seconds?: number;
};

export type AudioEncoding = 'audio/pcm' | 'audio/pcmu' | 'audio/pcma';

/** Inline agent configuration sent in the first `session.update`. */
export type AgentSessionConfig = {
  /** Use a stored agent by id. Mutually exclusive with the inline fields below. */
  agentId?: string;
  systemPrompt?: string;
  /** Spoken verbatim (not run through the LLM) when the session opens. Immutable after ready. */
  greeting?: string;
  keyterms?: string[];
  /** Input audio encoding. `audio/pcm` = PCM16 @ 24kHz. Default audio/pcm. */
  inputEncoding?: AudioEncoding;
  /** Output audio encoding for the agent's voice. Default audio/pcm (24kHz). */
  outputEncoding?: AudioEncoding;
  voice?: string;
  /** Output volume 0–100 (omit for native level). */
  volume?: number;
  turnDetection?: {
    vadThreshold?: number;
    minSilenceMs?: number;
    maxSilenceMs?: number;
    /** Allow the user to interrupt the agent (barge-in). Default true. */
    interruptResponse?: boolean;
  };
  tools?: AgentTool[];
};

export type AgentToolCall = { call_id: string; name: string; arguments: Record<string, unknown> };

type VoiceAgentEvents = {
  ready: (info: { sessionId: string }) => void;
  userTranscriptDelta: (text: string) => void;
  userTranscript: (info: { text: string; itemId: string }) => void;
  speechStarted: () => void;
  speechStopped: () => void;
  replyStarted: (info: { replyId: string }) => void;
  /** Agent voice audio (base64, output encoding) — play it immediately. */
  agentAudio: (base64: string) => void;
  agentTranscript: (info: { text: string; replyId: string; interrupted: boolean }) => void;
  replyDone: (info: { status: 'completed' | 'interrupted' }) => void;
  toolCall: (call: AgentToolCall) => void;
  error: (error: { code: string; message: string }) => void;
  ended: (info: { sessionDurationSeconds: number; audioDurationSeconds: number | null }) => void;
  close: (info: { code: number; reason: string }) => void;
};

export type VoiceAgentOptions = {
  /** Ephemeral token source (from your backend). See {@link TokenProvider}. */
  token: TokenProvider;
  session: AgentSessionConfig;
};

/**
 * Bidirectional voice agent over the AssemblyAI Voice Agent WebSocket.
 *
 * This is the two-way piece the brainstorm is about: you stream mic audio up
 * (`input.audio`, base64) and the server streams the agent's synthesized speech
 * back (`reply.audio`, base64) over the same socket, plus transcripts and tool
 * calls. Wire {@link sendAudioBase64} to the native mic and the `agentAudio`
 * event to native playback and you have a full spoken conversation.
 *
 * ```ts
 * const agent = new VoiceAgent({ token: getToken, session: { greeting: 'Hey!', systemPrompt } });
 * agent.on('agentAudio', (b64) => session.play(b64));
 * agent.on('speechStarted', () => session.clearPlayback()); // barge-in
 * agent.on('toolCall', async (call) => agent.sendToolResult(call.call_id, await run(call)));
 * await agent.connect();
 * session.onMicrophoneData((chunk) => agent.sendAudioBase64(chunk));
 * ```
 */
export class VoiceAgent extends TypedEmitter<VoiceAgentEvents> {
  private ws: WebSocket | null = null;
  private readonly options: VoiceAgentOptions;

  constructor(options: VoiceAgentOptions) {
    super();
    this.options = options;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === 1;
  }

  /** Open the socket and send the initial `session.update`. Resolves on `session.ready`. */
  async connect(): Promise<void> {
    const token = await this.options.token();
    const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(token)}`);
    this.ws = ws;

    return new Promise((resolve, reject) => {
      let ready = false;
      ws.onopen = () => this.send({ type: 'session.update', session: this.buildSession() });
      ws.onmessage = (event) => {
        const msg = JSON.parse(typeof event.data === 'string' ? event.data : '{}');
        this.dispatch(msg, () => {
          ready = true;
          resolve();
        });
      };
      ws.onerror = () => {
        const err = { code: 'connection_error', message: 'Voice Agent socket error' };
        this.emit('error', err);
        if (!ready) reject(new Error(err.message));
      };
      ws.onclose = (e) => {
        this.emit('close', { code: e.code, reason: e.reason });
        this.ws = null;
      };
    });
  }

  private dispatch(msg: any, onReady: () => void): void {
    switch (msg.type) {
      case 'session.ready':
        this.emit('ready', { sessionId: msg.session_id });
        onReady();
        break;
      case 'transcript.user.delta':
        this.emit('userTranscriptDelta', msg.text);
        break;
      case 'transcript.user':
        this.emit('userTranscript', { text: msg.text, itemId: msg.item_id });
        break;
      case 'input.speech.started':
        this.emit('speechStarted');
        break;
      case 'input.speech.stopped':
        this.emit('speechStopped');
        break;
      case 'reply.started':
        this.emit('replyStarted', { replyId: msg.reply_id });
        break;
      case 'reply.audio':
        this.emit('agentAudio', msg.data);
        break;
      case 'transcript.agent':
        this.emit('agentTranscript', {
          text: msg.text,
          replyId: msg.reply_id,
          interrupted: msg.interrupted,
        });
        break;
      case 'reply.done':
        this.emit('replyDone', { status: msg.status ?? 'completed' });
        break;
      case 'tool.call':
        this.emit('toolCall', { call_id: msg.call_id, name: msg.name, arguments: msg.arguments });
        break;
      case 'session.ended':
        this.emit('ended', {
          sessionDurationSeconds: msg.session_duration_seconds,
          audioDurationSeconds: msg.audio_duration_seconds ?? null,
        });
        break;
      case 'session.error':
      case 'error':
        this.emit('error', { code: msg.code, message: msg.message });
        break;
    }
  }

  /** Send one base64 audio chunk (from the native mic) up to the agent. */
  sendAudioBase64(base64: string): void {
    this.send({ type: 'input.audio', audio: base64 });
  }

  /** Return a tool result. Call after `replyDone`; `result` is JSON-stringified. */
  sendToolResult(callId: string, result: unknown): void {
    this.send({
      type: 'tool.result',
      call_id: callId,
      result: typeof result === 'string' ? result : JSON.stringify(result),
    });
  }

  /** Nudge the agent to generate a reply (e.g. a status update during a `hold` tool). */
  createReply(instructions?: string): void {
    this.send({ type: 'reply.create', ...(instructions ? { instructions } : {}) });
  }

  /** Update mutable session fields mid-conversation (system prompt, turn detection, volume). */
  updateSession(session: Partial<AgentSessionConfig>): void {
    this.send({ type: 'session.update', session: this.buildSession(session) });
  }

  /** Cleanly end the session (non-resumable); server replies `session.ended` then closes. */
  async end(): Promise<void> {
    this.send({ type: 'session.end' });
    this.ws?.close();
    this.removeAllListeners();
  }

  private buildSession(overrides: Partial<AgentSessionConfig> = {}): Record<string, unknown> {
    const c = { ...this.options.session, ...overrides };
    if (c.agentId) return { agent_id: c.agentId };
    const session: Record<string, unknown> = {};
    if (c.systemPrompt != null) session.system_prompt = c.systemPrompt;
    if (c.greeting != null) session.greeting = c.greeting;
    const input: Record<string, unknown> = {};
    if (c.inputEncoding) input.format = { encoding: c.inputEncoding };
    if (c.keyterms?.length) input.keyterms = c.keyterms;
    if (c.turnDetection) {
      input.turn_detection = stripUndefined({
        vad_threshold: c.turnDetection.vadThreshold,
        min_silence: c.turnDetection.minSilenceMs,
        max_silence: c.turnDetection.maxSilenceMs,
        interrupt_response: c.turnDetection.interruptResponse,
      });
    }
    if (Object.keys(input).length) session.input = input;
    const output: Record<string, unknown> = {};
    if (c.voice) output.voice = c.voice;
    if (c.outputEncoding) output.format = { encoding: c.outputEncoding };
    if (c.volume != null) output.volume = c.volume;
    if (Object.keys(output).length) session.output = output;
    if (c.tools?.length) session.tools = c.tools;
    return session;
  }

  private send(message: object): void {
    if (this.isConnected) this.ws!.send(JSON.stringify(message));
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

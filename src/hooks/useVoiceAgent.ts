import { useCallback, useRef, useState } from 'react';

import { sharedAudioSession, type AudioSession } from '../audio/AudioSession';
import { VoiceAgent, type AgentToolCall, type VoiceAgentOptions } from '../client/VoiceAgent';

export type VoiceAgentStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error' | 'ended';

/** One line of the conversation, oldest-appended-last. Render these as chat bubbles. */
export type TranscriptMessage = {
  /** Stable key: the server `itemId` (user) or `replyId` (agent). */
  id: string;
  role: 'user' | 'agent';
  text: string;
  /** False while the user's turn is still being transcribed (live deltas). */
  isFinal: boolean;
};

export type UseVoiceAgentOptions = VoiceAgentOptions & {
  /**
   * Handle a tool call and return its result. The hook sends the result back to
   * the agent for you. Throwing here reports an error result.
   */
  onToolCall?: (call: AgentToolCall) => Promise<unknown> | unknown;
  /** Disable automatic barge-in (stop agent playback when the user starts talking). Default false. */
  disableBargeIn?: boolean;
};

export type UseVoiceAgentResult = {
  status: VoiceAgentStatus;
  /**
   * The full conversation so far, in order (oldest first, newest last). Each
   * turn is its own message; the in-progress user turn updates live as it's
   * transcribed. Render as a scrollable list of chat bubbles.
   */
  messages: TranscriptMessage[];
  /** The user's latest transcribed utterance (updates live). */
  userTranscript: string;
  /** The agent's latest spoken response text. */
  agentTranscript: string;
  isAgentSpeaking: boolean;
  inputLevel: number;
  outputLevel: number;
  isMuted: boolean;
  error: { code: string; message: string } | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  setMuted: (muted: boolean) => void;
};

/**
 * A full spoken conversation in one hook.
 *
 * Streams the mic to the AssemblyAI Voice Agent, plays the agent's synthesized
 * replies back through the device speaker (with echo cancellation so the agent
 * doesn't hear itself), handles barge-in, and routes tool calls to your handler.
 *
 * ```tsx
 * const agent = useVoiceAgent({
 *   token: getToken,
 *   session: { greeting: 'Hi! How can I help?', systemPrompt: 'You are a helpful assistant.' },
 *   onToolCall: async (call) => (call.name === 'get_time' ? { now: Date.now() } : {}),
 * });
 * <Button title={agent.status === 'idle' ? 'Start' : 'Stop'}
 *   onPress={agent.status === 'idle' ? agent.start : agent.stop} />
 * ```
 */
export function useVoiceAgent(
  options: UseVoiceAgentOptions,
  session: AudioSession = sharedAudioSession
): UseVoiceAgentResult {
  const [status, setStatus] = useState<VoiceAgentStatus>('idle');
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [userTranscript, setUserTranscript] = useState('');
  const [agentTranscript, setAgentTranscript] = useState('');
  const [isAgentSpeaking, setAgentSpeaking] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [isMuted, setMutedState] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const agentRef = useRef<VoiceAgent | null>(null);
  const subsRef = useRef<{ remove: () => void }[]>([]);
  const pendingUserId = useRef(0);

  const start = useCallback(async () => {
    if (agentRef.current) return;
    setError(null);
    setMessages([]);
    setStatus('connecting');
    try {
      const permission = session.getPermissions();
      if (!permission.granted && !(await session.requestPermissions()).granted) {
        throw new Error('Microphone permission denied');
      }

      const outputRate = options.session.outputEncoding === undefined ? 24_000 : sampleRateFor(options.session.outputEncoding);
      const inputRate = options.session.inputEncoding === undefined ? 24_000 : sampleRateFor(options.session.inputEncoding);

      const agent = new VoiceAgent(options);
      agentRef.current = agent;

      agent.on('agentAudio', (b64) => session.play(b64));
      agent.on('replyStarted', () => {
        setAgentSpeaking(true);
        setStatus('speaking');
      });
      agent.on('replyDone', () => {
        setAgentSpeaking(false);
        setStatus('listening');
      });
      agent.on('userTranscriptDelta', (text) => {
        setUserTranscript(text);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          // Live deltas replace the current, not-yet-final user bubble; a new
          // turn (last message final or from the agent) starts a fresh one.
          if (last && last.role === 'user' && !last.isFinal) {
            return [...prev.slice(0, -1), { ...last, text }];
          }
          if (!text) return prev; // don't open an empty bubble on a stray empty delta
          return [...prev, { id: `pending-${++pendingUserId.current}`, role: 'user', text, isFinal: false }];
        });
      });
      agent.on('userTranscript', ({ text, itemId }) => {
        setUserTranscript(text);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const finalized: TranscriptMessage = { id: itemId, role: 'user', text, isFinal: true };
          if (last && last.role === 'user' && !last.isFinal) {
            return [...prev.slice(0, -1), finalized];
          }
          return [...prev, finalized];
        });
      });
      agent.on('agentTranscript', ({ text, replyId }) => {
        setAgentTranscript(text);
        setMessages((prev) => {
          // One reply can arrive in pieces; upsert by replyId rather than duplicate.
          const idx = prev.findIndex((m) => m.role === 'agent' && m.id === replyId);
          const msg: TranscriptMessage = { id: replyId, role: 'agent', text, isFinal: true };
          if (idx === -1) return [...prev, msg];
          const next = [...prev];
          next[idx] = msg;
          return next;
        });
      });
      agent.on('speechStarted', () => {
        if (!options.disableBargeIn) session.clearPlayback();
      });
      agent.on('toolCall', async (call) => {
        if (!options.onToolCall) return;
        try {
          agent.sendToolResult(call.call_id, await options.onToolCall(call));
        } catch (err) {
          agent.sendToolResult(call.call_id, { error: err instanceof Error ? err.message : String(err) });
        }
      });
      agent.on('error', (e) => {
        setError(e);
        setStatus('error');
      });
      agent.on('ended', () => setStatus('ended'));

      await session.configure({ inputSampleRate: inputRate, outputSampleRate: outputRate });
      await agent.connect();
      await session.start();

      subsRef.current = [
        session.onMicrophoneData((chunk) => agent.sendAudioBase64(chunk)),
        session.onInputVolume(setInputLevel),
        session.onOutputVolume(setOutputLevel),
        session.onError((message) => {
          setError({ code: 'audio_error', message });
          setStatus('error');
        }),
      ];
      setStatus('listening');
    } catch (err) {
      setError({ code: 'start_failed', message: err instanceof Error ? err.message : String(err) });
      setStatus('error');
      agentRef.current = null;
    }
  }, [options, session]);

  const stop = useCallback(async () => {
    subsRef.current.forEach((s) => s.remove());
    subsRef.current = [];
    await session.stop();
    await agentRef.current?.end();
    agentRef.current = null;
    setStatus('idle');
    setAgentSpeaking(false);
    setInputLevel(0);
    setOutputLevel(0);
  }, [session]);

  const setMuted = useCallback(
    (muted: boolean) => {
      session.setMuted(muted);
      setMutedState(muted);
    },
    [session]
  );

  return {
    status,
    messages,
    userTranscript,
    agentTranscript,
    isAgentSpeaking,
    inputLevel,
    outputLevel,
    isMuted,
    error,
    start,
    stop,
    setMuted,
  };
}

function sampleRateFor(encoding: 'audio/pcm' | 'audio/pcmu' | 'audio/pcma'): number {
  return encoding === 'audio/pcm' ? 24_000 : 8_000;
}

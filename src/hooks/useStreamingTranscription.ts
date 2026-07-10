import { useCallback, useRef, useState } from 'react';

import { sharedAudioSession, type AudioSession } from '../audio/AudioSession';
import {
  StreamingTranscriber,
  type StreamingTranscriberOptions,
  type StreamingTurn,
} from '../client/StreamingTranscriber';

export type UseStreamingTranscriptionResult = {
  /** Committed text from all finalized turns, joined. */
  transcript: string;
  /** The live, not-yet-final turn text (updates rapidly while speaking). */
  partialTranscript: string;
  turns: StreamingTurn[];
  isListening: boolean;
  inputLevel: number;
  error: Error | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

/**
 * Live speech-to-text in one hook: mic → Universal Streaming → transcript state.
 *
 * ```tsx
 * const { transcript, partialTranscript, isListening, start, stop } =
 *   useStreamingTranscription({ token: getToken });
 * ```
 *
 * Pass your own {@link AudioSession} as the second arg to inject a fake in tests.
 */
export function useStreamingTranscription(
  options: StreamingTranscriberOptions,
  session: AudioSession = sharedAudioSession
): UseStreamingTranscriptionResult {
  const [transcript, setTranscript] = useState('');
  const [partialTranscript, setPartial] = useState('');
  const [turns, setTurns] = useState<StreamingTurn[]>([]);
  const [isListening, setListening] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const transcriberRef = useRef<StreamingTranscriber | null>(null);
  const subsRef = useRef<{ remove: () => void }[]>([]);

  const start = useCallback(async () => {
    if (transcriberRef.current) return;
    setError(null);
    setTranscript('');
    setPartial('');
    setTurns([]);
    try {
      const permission = session.getPermissions();
      if (!permission.granted) {
        const requested = await session.requestPermissions();
        if (!requested.granted) throw new Error('Microphone permission denied');
      }

      const transcriber = new StreamingTranscriber(options);
      transcriberRef.current = transcriber;

      transcriber.on('turn', (turn) => {
        if (turn.end_of_turn) {
          setTurns((prev) => [...prev, turn]);
          setTranscript((prev) => (prev ? `${prev} ${turn.transcript}` : turn.transcript));
          setPartial('');
        } else {
          setPartial(turn.transcript);
        }
      });
      transcriber.on('error', setError);

      await session.configure({ inputSampleRate: options.sampleRate ?? 16_000 });
      await transcriber.connect();
      await session.start();

      subsRef.current = [
        session.onMicrophoneData((chunk) => transcriber.sendAudioBase64(chunk)),
        session.onInputVolume(setInputLevel),
        session.onError((message) => setError(new Error(message))),
      ];
      setListening(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      transcriberRef.current = null;
    }
  }, [options, session]);

  const stop = useCallback(async () => {
    subsRef.current.forEach((s) => s.remove());
    subsRef.current = [];
    await session.stop();
    await transcriberRef.current?.close();
    transcriberRef.current = null;
    setListening(false);
    setInputLevel(0);
  }, [session]);

  return { transcript, partialTranscript, turns, isListening, inputLevel, error, start, stop };
}

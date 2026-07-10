import { StreamingTranscriber } from '../StreamingTranscriber';
import { FakeWebSocket, installFakeWebSocket, tick } from './fakes';

const token = async () => 'test-token';

async function connected(options = {}): Promise<{ stt: StreamingTranscriber; ws: FakeWebSocket }> {
  const stt = new StreamingTranscriber({ token, ...options });
  const p = stt.connect();
  await tick(); // let the token promise resolve so the socket is constructed
  const ws = FakeWebSocket.last;
  ws.open();
  ws.message({ type: 'Begin', id: 'sess-1', expires_at: 123 });
  await p;
  return { stt, ws };
}

beforeEach(() => installFakeWebSocket());

describe('StreamingTranscriber.connect', () => {
  it('resolves on Begin and emits open with the session id', async () => {
    const stt = new StreamingTranscriber({ token });
    const opened: unknown[] = [];
    stt.on('open', (b) => opened.push(b));
    const p = stt.connect();
    await tick();
    FakeWebSocket.last.open();
    FakeWebSocket.last.message({ type: 'Begin', id: 'sess-1', expires_at: 999 });
    await p;
    expect(opened).toEqual([{ id: 'sess-1', expires_at: 999 }]);
    expect(stt.isConnected).toBe(true);
  });

  it('builds the URL with token, sample rate, and keyterms', async () => {
    const { ws } = await connected({ sampleRate: 8000, keytermsPrompt: ['AssemblyAI', 'Expo'] });
    const url = new URL(ws.url);
    expect(url.protocol).toBe('wss:');
    expect(url.searchParams.get('token')).toBe('test-token');
    expect(url.searchParams.get('sample_rate')).toBe('8000');
    expect(JSON.parse(url.searchParams.get('keyterms_prompt')!)).toEqual(['AssemblyAI', 'Expo']);
  });

  it('uses the EU host when useEU is set', async () => {
    const { ws } = await connected({ useEU: true });
    expect(new URL(ws.url).host).toBe('streaming.eu.assemblyai.com');
  });

  it('rejects if the socket errors before opening', async () => {
    const stt = new StreamingTranscriber({ token });
    const p = stt.connect();
    await tick();
    FakeWebSocket.last.error();
    await expect(p).rejects.toThrow(/socket error/i);
  });
});

describe('StreamingTranscriber turns', () => {
  it('routes partial vs final turns', async () => {
    const stt = new StreamingTranscriber({ token });
    const turns: string[] = [];
    const finals: string[] = [];
    stt.on('turn', (t) => turns.push(t.transcript));
    stt.on('finalTurn', (t) => finals.push(t.transcript));
    const p = stt.connect();
    await tick();
    const ws = FakeWebSocket.last;
    ws.open();
    ws.message({ type: 'Begin', id: 's', expires_at: 1 });
    await p;

    ws.message({ type: 'Turn', transcript: 'hello', end_of_turn: false });
    ws.message({ type: 'Turn', transcript: 'hello world', end_of_turn: true });
    expect(turns).toEqual(['hello', 'hello world']);
    expect(finals).toEqual(['hello world']);
  });
});

describe('StreamingTranscriber.sendAudioBase64', () => {
  it('decodes base64 to a binary frame', async () => {
    const { stt, ws } = await connected();
    stt.sendAudioBase64('AAECAw=='); // bytes 0,1,2,3
    const frame = ws.sent.find((s) => s instanceof ArrayBuffer) as ArrayBuffer;
    expect(Array.from(new Uint8Array(frame))).toEqual([0, 1, 2, 3]);
  });

  it('is a no-op when not connected', () => {
    const stt = new StreamingTranscriber({ token });
    expect(() => stt.sendAudioBase64('AAECAw==')).not.toThrow();
  });
});

describe('StreamingTranscriber control messages', () => {
  it('forceEndpoint and updateConfiguration send the right JSON', async () => {
    const { stt, ws } = await connected();
    stt.forceEndpoint();
    stt.updateConfiguration({ min_turn_silence: 200 });
    expect(ws.sentJson()).toEqual([
      { type: 'ForceEndpoint' },
      { type: 'UpdateConfiguration', min_turn_silence: 200 },
    ]);
  });
});

describe('StreamingTranscriber.close (regression: close event must still fire)', () => {
  it('sends Terminate and still delivers the close event with the termination payload', async () => {
    const { stt, ws } = await connected();
    const closes: any[] = [];
    stt.on('close', (info) => closes.push(info));

    // Server sends Termination just before the socket closes.
    ws.message({ type: 'Termination', audio_duration_seconds: 12, session_duration_seconds: 30 });
    await stt.close();

    expect(ws.sentJson()).toContainEqual({ type: 'Terminate' });
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({
      audio_duration_seconds: 12,
      session_duration_seconds: 30,
    });
  });
});

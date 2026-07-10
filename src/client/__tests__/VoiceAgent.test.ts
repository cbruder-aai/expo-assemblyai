import { VoiceAgent, type AgentSessionConfig } from '../VoiceAgent';
import { FakeWebSocket, installFakeWebSocket, tick } from './fakes';

const token = async () => 'agent-token';

async function ready(session: AgentSessionConfig = { systemPrompt: 'be helpful' }): Promise<{
  agent: VoiceAgent;
  ws: FakeWebSocket;
}> {
  const agent = new VoiceAgent({ token, session });
  const p = agent.connect();
  await tick();
  const ws = FakeWebSocket.last;
  ws.open(); // triggers the initial session.update
  ws.message({ type: 'session.ready', session_id: 'sess-1' });
  await p;
  return { agent, ws };
}

beforeEach(() => installFakeWebSocket());

describe('VoiceAgent.connect', () => {
  it('sends session.update on open and resolves on session.ready', async () => {
    const agent = new VoiceAgent({ token, session: { systemPrompt: 'hi' } });
    const readies: unknown[] = [];
    agent.on('ready', (info) => readies.push(info));
    const p = agent.connect();
    await tick();
    const ws = FakeWebSocket.last;
    ws.open();
    expect(ws.sentJson()[0].type).toBe('session.update');
    ws.message({ type: 'session.ready', session_id: 'sess-1' });
    await p;
    expect(readies).toEqual([{ sessionId: 'sess-1' }]);
    expect(agent.isConnected).toBe(true);
  });

  it('passes the token in the URL', async () => {
    const { ws } = await ready();
    expect(new URL(ws.url).searchParams.get('token')).toBe('agent-token');
  });
});

describe('VoiceAgent.buildSession', () => {
  it('maps camelCase config to the snake_case wire format', async () => {
    const { ws } = await ready({
      systemPrompt: 'be nice',
      greeting: 'hello',
      voice: 'nova',
      volume: 80,
      keyterms: ['AssemblyAI'],
      turnDetection: { vadThreshold: 0.5, minSilenceMs: 100, interruptResponse: false },
    });
    const session = ws.sentJson()[0].session;
    expect(session.system_prompt).toBe('be nice');
    expect(session.greeting).toBe('hello');
    expect(session.input.keyterms).toEqual(['AssemblyAI']);
    expect(session.input.turn_detection).toEqual({
      vad_threshold: 0.5,
      min_silence: 100,
      interrupt_response: false,
    });
    expect(session.output.voice).toBe('nova');
    expect(session.output.volume).toBe(80);
  });

  it('uses a stored agent id exclusively when agentId is set', async () => {
    const { ws } = await ready({ agentId: 'agent_123', systemPrompt: 'ignored' });
    expect(ws.sentJson()[0].session).toEqual({ agent_id: 'agent_123' });
  });
});

describe('VoiceAgent message dispatch', () => {
  it('emits agentAudio, toolCall, transcripts, and ended', async () => {
    const agent = new VoiceAgent({ token, session: {} });
    const audio: string[] = [];
    const tools: unknown[] = [];
    const userDeltas: string[] = [];
    const ended: unknown[] = [];
    agent.on('agentAudio', (b64) => audio.push(b64));
    agent.on('toolCall', (c) => tools.push(c));
    agent.on('userTranscriptDelta', (t) => userDeltas.push(t));
    agent.on('ended', (e) => ended.push(e));

    const p = agent.connect();
    await tick();
    const ws = FakeWebSocket.last;
    ws.open();
    ws.message({ type: 'session.ready', session_id: 's' });
    await p;

    ws.message({ type: 'reply.audio', data: 'BASE64AUDIO' });
    ws.message({ type: 'transcript.user.delta', text: 'hel' });
    ws.message({ type: 'tool.call', call_id: 'c1', name: 'get_time', arguments: { tz: 'UTC' } });
    ws.message({ type: 'session.ended', session_duration_seconds: 42, audio_duration_seconds: 40 });

    expect(audio).toEqual(['BASE64AUDIO']);
    expect(userDeltas).toEqual(['hel']);
    expect(tools).toEqual([{ call_id: 'c1', name: 'get_time', arguments: { tz: 'UTC' } }]);
    expect(ended).toEqual([{ sessionDurationSeconds: 42, audioDurationSeconds: 40 }]);
  });
});

describe('VoiceAgent send helpers', () => {
  it('wraps mic audio in an input.audio message', async () => {
    const { agent, ws } = await ready();
    agent.sendAudioBase64('CHUNK');
    expect(ws.lastSentJson()).toEqual({ type: 'input.audio', audio: 'CHUNK' });
  });

  it('JSON-stringifies non-string tool results', async () => {
    const { agent, ws } = await ready();
    agent.sendToolResult('c1', { ok: true });
    expect(ws.lastSentJson()).toEqual({
      type: 'tool.result',
      call_id: 'c1',
      result: JSON.stringify({ ok: true }),
    });
  });

  it('passes through a string tool result unchanged', async () => {
    const { agent, ws } = await ready();
    agent.sendToolResult('c2', 'plain');
    expect(ws.lastSentJson().result).toBe('plain');
  });
});

describe('VoiceAgent.end (regression: ended/close must still fire)', () => {
  it('sends session.end and still delivers the close event', async () => {
    const { agent, ws } = await ready();
    const closes: unknown[] = [];
    agent.on('close', (info) => closes.push(info));
    await agent.end();
    expect(ws.sentJson()).toContainEqual({ type: 'session.end' });
    expect(closes).toHaveLength(1);
  });
});

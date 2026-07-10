import { createStreamingToken, createVoiceAgentToken } from '../tokens';
import { fakeResponse } from './fakes';

function mockFetch(): jest.Mock {
  const fn = jest.fn();
  (globalThis as { fetch?: unknown }).fetch = fn;
  return fn;
}

describe('createStreamingToken', () => {
  it('calls the streaming token endpoint with the API key and returns the token', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(fakeResponse({ token: 'tok_123' }));
    const token = await createStreamingToken('my-key');
    expect(token).toBe('tok_123');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/streaming\.assemblyai\.com\/v3\/token\?/);
    expect(url).toContain('expires_in_seconds=60');
    expect(init.headers.Authorization).toBe('my-key');
  });

  it('honors custom expiry and the EU region', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(fakeResponse({ token: 'tok' }));
    await createStreamingToken('k', { expiresInSeconds: 120, useEU: true });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('streaming.eu.assemblyai.com');
    expect(url).toContain('expires_in_seconds=120');
  });

  it('throws on a non-OK response', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(fakeResponse('forbidden', { ok: false, status: 403 }));
    await expect(createStreamingToken('k')).rejects.toThrow(/403.*forbidden/);
  });
});

describe('createVoiceAgentToken', () => {
  it('calls the agents token endpoint with the required expiry and returns the token', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(fakeResponse({ token: 'agent_tok' }));
    const token = await createVoiceAgentToken('my-key');
    expect(token).toBe('agent_tok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/agents\.assemblyai\.com\/v1\/token\?/);
    // expires_in_seconds is required by the API (a 422 otherwise), so it must be sent.
    expect(url).toContain('expires_in_seconds=60');
    expect(init.headers.Authorization).toBe('my-key');
  });

  it('honors a custom expiry', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(fakeResponse({ token: 'agent_tok' }));
    await createVoiceAgentToken('my-key', { expiresInSeconds: 300 });
    expect(fetchMock.mock.calls[0][0]).toContain('expires_in_seconds=300');
  });

  it('throws on a non-OK response', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(fakeResponse('nope', { ok: false, status: 500 }));
    await expect(createVoiceAgentToken('k')).rejects.toThrow(/500/);
  });
});

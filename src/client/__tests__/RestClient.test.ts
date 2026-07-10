import { RestClient } from '../RestClient';
import { fakeResponse } from './fakes';

function mockFetch(): jest.Mock {
  const fn = jest.fn();
  (globalThis as { fetch?: unknown }).fetch = fn;
  return fn;
}

describe('RestClient basics', () => {
  it('defaults to the US host and sends the API key as Authorization', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(fakeResponse({ upload_url: 'https://cdn/x' }));
    const client = new RestClient({ apiKey: 'secret' });
    const url = await client.uploadFile(new Uint8Array([1, 2, 3]));
    expect(url).toBe('https://cdn/x');
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://api.assemblyai.com/v2/upload');
    expect(init.headers.Authorization).toBe('secret');
  });

  it('uses the EU host when useEU is set', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(fakeResponse({ id: 't1', status: 'queued' }));
    const client = new RestClient({ apiKey: 'secret', useEU: true });
    await client.submit({ audio_url: 'https://a/b.mp3' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.eu.assemblyai.com/v2/transcript');
  });

  it('omits Authorization when no apiKey is given (proxy mode)', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(fakeResponse({ id: 't1', status: 'queued' }));
    const client = new RestClient({ baseUrl: 'https://my-proxy.example' });
    await client.submit({ audio_url: 'https://a/b.mp3' });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('throws with status and body on a failed request', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(fakeResponse('nope', { ok: false, status: 401 }));
    const client = new RestClient({ apiKey: 'bad' });
    await expect(client.get('t1')).rejects.toThrow(/401.*nope/);
  });
});

describe('RestClient.transcribe polling', () => {
  it('polls until completed', async () => {
    const fetchMock = mockFetch();
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ id: 't1', status: 'queued' })) // submit
      .mockResolvedValueOnce(fakeResponse({ id: 't1', status: 'processing' })) // get #1
      .mockResolvedValueOnce(fakeResponse({ id: 't1', status: 'completed', text: 'hi' })); // get #2
    const client = new RestClient({ apiKey: 'k' });
    const t = await client.transcribe({ audio_url: 'https://a/b.mp3' }, { pollIntervalMs: 1 });
    expect(t.text).toBe('hi');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws when the transcript status is error', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(fakeResponse({ id: 't1', status: 'error', error: 'bad audio' }));
    const client = new RestClient({ apiKey: 'k' });
    await expect(
      client.transcribe({ audio_url: 'https://a/b.mp3' }, { pollIntervalMs: 1 })
    ).rejects.toThrow('bad audio');
  });

  it('rejects with a timeout instead of polling forever', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(fakeResponse({ id: 't1', status: 'processing' }));
    const client = new RestClient({ apiKey: 'k' });
    await expect(
      client.transcribe({ audio_url: 'https://a/b.mp3' }, { timeoutMs: 0 })
    ).rejects.toThrow(/timed out/);
  });
});

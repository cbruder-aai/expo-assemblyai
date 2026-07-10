/**
 * Async (pre-recorded) transcription + Audio Intelligence.
 *
 * ⚠️ Unlike streaming, these endpoints have **no ephemeral-token flow** — they
 * require the raw API key. Do not embed your key in a shipped app. Two safe uses:
 *
 * 1. Point `baseUrl` at *your* proxy that injects the key server-side, and leave
 *    `apiKey` unset. This is the recommended setup for a mobile app.
 * 2. Pass `apiKey` when running this on a server / in a trusted backend.
 *
 * If you set neither, requests will be unauthenticated and fail.
 */
export type RestClientOptions = {
  /** Raw API key — server-side / trusted contexts only. */
  apiKey?: string;
  /** Base URL. Defaults to AssemblyAI; set to your proxy for mobile use. */
  baseUrl?: string;
  useEU?: boolean;
};

/** Audio Intelligence + core STT parameters. Passed through to `POST /v2/transcript`. */
export type TranscribeParams = {
  audio_url: string;
  speaker_labels?: boolean;
  language_detection?: boolean;
  language_code?: string;
  punctuate?: boolean;
  format_text?: boolean;
  multichannel?: boolean;
  keyterms_prompt?: string[];
  // Audio Intelligence toggles:
  sentiment_analysis?: boolean;
  entity_detection?: boolean;
  redact_pii?: boolean;
  redact_pii_policies?: string[];
  content_safety?: boolean;
  iab_categories?: boolean;
  auto_highlights?: boolean;
  webhook_url?: string;
  [key: string]: unknown;
};

export type Transcript = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  error?: string;
  [key: string]: unknown;
};

export class RestClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(options: RestClientOptions = {}) {
    this.baseUrl =
      options.baseUrl ?? (options.useEU ? 'https://api.eu.assemblyai.com' : 'https://api.assemblyai.com');
    this.headers = options.apiKey ? { Authorization: options.apiKey } : {};
  }

  /** Upload a local audio file (bytes) and get back a temporary `upload_url`. */
  async uploadFile(bytes: ArrayBuffer | Uint8Array): Promise<string> {
    const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const res = await fetch(`${this.baseUrl}/v2/upload`, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/octet-stream' },
      body: body as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(`upload failed (${res.status}): ${await res.text()}`);
    return ((await res.json()) as { upload_url: string }).upload_url;
  }

  /** Submit a transcription job. Returns immediately with status `queued`. */
  async submit(params: TranscribeParams): Promise<Transcript> {
    const res = await fetch(`${this.baseUrl}/v2/transcript`, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`transcript submit failed (${res.status}): ${await res.text()}`);
    return (await res.json()) as Transcript;
  }

  async get(transcriptId: string): Promise<Transcript> {
    const res = await fetch(`${this.baseUrl}/v2/transcript/${transcriptId}`, { headers: this.headers });
    if (!res.ok) throw new Error(`transcript get failed (${res.status}): ${await res.text()}`);
    return (await res.json()) as Transcript;
  }

  /**
   * Submit and poll until the transcript is `completed` or `error`.
   *
   * Polling is bounded by `timeoutMs` (default 10 minutes) so a job that never
   * finishes rejects instead of looping forever. Raise it for long files.
   */
  async transcribe(
    params: TranscribeParams,
    options: { pollIntervalMs?: number; timeoutMs?: number } = {}
  ): Promise<Transcript> {
    const pollIntervalMs = options.pollIntervalMs ?? 3_000;
    const timeoutMs = options.timeoutMs ?? 600_000;
    const deadline = Date.now() + timeoutMs;
    let t = await this.submit(params);
    while (t.status !== 'completed' && t.status !== 'error') {
      if (Date.now() >= deadline) {
        throw new Error(`transcription timed out after ${timeoutMs}ms (id ${t.id}, status ${t.status})`);
      }
      await delay(pollIntervalMs);
      t = await this.get(t.id);
    }
    if (t.status === 'error') throw new Error(t.error ?? 'transcription failed');
    return t;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

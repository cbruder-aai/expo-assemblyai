/**
 * Ephemeral token plumbing.
 *
 * **Never ship your AssemblyAI API key in a mobile app.** A leaked key bills to
 * your account. The streaming and voice-agent APIs support short-lived tokens
 * minted server-side: your backend holds the key, calls AssemblyAI's token
 * endpoint, and hands the client a token that is good for one session.
 *
 * The async REST flow (upload / transcribe / poll) has **no** client token — those
 * calls must run on your server or a trusted proxy (see {@link RestClient}).
 *
 * This mirrors Blurt's `APIKeyGateway` seam: the client depends on an injectable
 * token source, not on a hardcoded secret.
 */

/**
 * Supplies a fresh token whenever a streaming/agent session connects. Implement
 * this by calling *your* backend, which calls AssemblyAI with your API key.
 *
 * ```ts
 * const getToken: TokenProvider = async () => {
 *   const res = await fetch('https://api.example.com/assemblyai/token');
 *   const { token } = await res.json();
 *   return token;
 * };
 * ```
 */
export type TokenProvider = () => Promise<string>;

export type StreamingTokenOptions = {
  /** Redemption window in seconds (1–600). The token must open a socket within this. Default 60. */
  expiresInSeconds?: number;
  /** Max streaming session length in seconds (60–10800). Default 10800 (3h). */
  maxSessionDurationSeconds?: number;
  /** Use the EU region endpoints. */
  useEU?: boolean;
};

/**
 * Mint a Universal Streaming token by calling AssemblyAI directly with an API key.
 *
 * ⚠️ For **server-side use only** (a backend route, an Expo API route, a serverless
 * function) — it takes your raw API key. Do not call this from app code with a
 * real key baked in. It's exported so your backend can `import` it too, and so
 * examples/tests can run against a dev key.
 *
 * Endpoint: `GET https://streaming.assemblyai.com/v3/token`.
 */
export async function createStreamingToken(
  apiKey: string,
  options: StreamingTokenOptions = {}
): Promise<string> {
  const host = options.useEU ? 'streaming.eu.assemblyai.com' : 'streaming.assemblyai.com';
  const params = new URLSearchParams({
    expires_in_seconds: String(options.expiresInSeconds ?? 60),
    max_session_duration_seconds: String(options.maxSessionDurationSeconds ?? 10_800),
  });
  const res = await fetch(`https://${host}/v3/token?${params}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    throw new Error(`Failed to mint streaming token (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { token: string };
  return body.token;
}

/**
 * Mint a Voice Agent token. ⚠️ Server-side only — same warning as above.
 * Endpoint: `GET https://agents.assemblyai.com/v1/token`. Each token is one-time use.
 */
export async function createVoiceAgentToken(apiKey: string): Promise<string> {
  const res = await fetch('https://agents.assemblyai.com/v1/token', {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    throw new Error(`Failed to mint voice-agent token (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { token: string };
  return body.token;
}

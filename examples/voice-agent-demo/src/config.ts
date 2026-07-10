import type { TokenProvider } from 'expo-assemblyai';

/**
 * Where the app fetches ephemeral tokens from. This MUST point at a backend you
 * control that holds your AssemblyAI API key and mints short-lived tokens — never
 * put the key in the app. See `token-server.js` in this folder for a minimal
 * reference server, and set EXPO_PUBLIC_TOKEN_ENDPOINT in `.env`.
 */
const TOKEN_ENDPOINT =
  process.env.EXPO_PUBLIC_TOKEN_ENDPOINT ?? 'http://localhost:8787';

/** Streaming-token provider — calls your backend's `/streaming-token` route. */
export const streamingToken: TokenProvider = async () => {
  const res = await fetch(`${TOKEN_ENDPOINT}/streaming-token`);
  if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
  return (await res.json()).token;
};

/** Voice-agent-token provider — calls your backend's `/voice-agent-token` route. */
export const voiceAgentToken: TokenProvider = async () => {
  const res = await fetch(`${TOKEN_ENDPOINT}/voice-agent-token`);
  if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
  return (await res.json()).token;
};

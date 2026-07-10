/** Minimal typed event emitter shared by the streaming clients. */
export class TypedEmitter<Events extends Record<string, (...args: any[]) => void>> {
  private listeners: { [K in keyof Events]?: Set<Events[K]> } = {};

  on<K extends keyof Events>(event: K, listener: Events[K]): () => void {
    (this.listeners[event] ??= new Set()).add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Events[K]): void {
    this.listeners[event]?.delete(listener);
  }

  protected emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    this.listeners[event]?.forEach((l) => {
      try {
        l(...args);
      } catch (err) {
        // A throwing listener must not tear down the socket loop.
        // eslint-disable-next-line no-console
        console.error(`[expo-assemblyai] listener for "${String(event)}" threw`, err);
      }
    });
  }

  protected removeAllListeners(): void {
    this.listeners = {};
  }
}

/** base64 → Uint8Array, for sending native mic chunks as binary WS frames. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = decodeBase64(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Runtime-agnostic base64 decode (RN Hermes / browser `atob`, Node `Buffer` fallback). */
export function decodeBase64(base64: string): string {
  const g = globalThis as { atob?: (s: string) => string; Buffer?: any };
  if (typeof g.atob === 'function') return g.atob(base64);
  return g.Buffer.from(base64, 'base64').toString('binary');
}

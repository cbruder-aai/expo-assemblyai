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

/**
 * Close a WebSocket and resolve once it has actually closed (or after a short
 * grace period if the server never sends a close frame).
 *
 * Callers use this before removing their listeners so the socket's `onclose`
 * handler — which emits the client's `close`/`ended` event with the final
 * termination payload — still runs while listeners are attached. Wrapping the
 * existing `onclose` preserves whatever the client registered in `connect()`.
 */
export function closeSocket(ws: WebSocket | null, graceMs = 2_000): Promise<void> {
  // 3 === WebSocket.CLOSED. Nothing to wait for if it's gone or already closed.
  if (!ws || ws.readyState === 3) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(finish, graceMs);
    const prevOnClose = ws.onclose;
    ws.onclose = (event) => {
      clearTimeout(timer);
      prevOnClose?.call(ws, event);
      finish();
    };
    ws.close();
  });
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

/**
 * Test doubles for the client suite.
 *
 * `FakeWebSocket` models the browser/RN `WebSocket` surface the clients use
 * (`binaryType`, `on*` handlers, `send`, `close`) and lets a test drive the
 * lifecycle (`open`, `message`, `error`) and inspect what was sent. Install it as
 * the global `WebSocket` before constructing a client.
 */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static get last(): FakeWebSocket {
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    if (!ws) throw new Error('no FakeWebSocket has been constructed yet');
    return ws;
  }
  static reset(): void {
    FakeWebSocket.instances = [];
  }

  url: string;
  binaryType = 'blob';
  readyState = 0; // CONNECTING
  sent: unknown[] = [];
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 2; // CLOSING
    // Real sockets fire onclose asynchronously — faithfully deferring it here is
    // what makes the close()/end() teardown regression tests meaningful (sync
    // teardown would swallow the event only in the async case).
    setTimeout(() => {
      this.readyState = 3; // CLOSED
      this.onclose?.({ code: 1000, reason: 'client closed' });
    }, 0);
  }

  // --- test drivers ---

  /** Simulate the socket opening (server accepted the connection). */
  open(): void {
    this.readyState = 1; // OPEN
    this.onopen?.({});
  }

  /** Deliver a server message (objects are JSON-stringified, matching the wire). */
  message(data: unknown): void {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }

  error(): void {
    this.onerror?.({});
  }

  /** The most recent message the client sent, parsed from JSON. */
  lastSentJson(): any {
    const raw = this.sent[this.sent.length - 1];
    return JSON.parse(String(raw));
  }

  /** All JSON messages the client sent (skips binary frames). */
  sentJson(): any[] {
    return this.sent
      .filter((s): s is string => typeof s === 'string')
      .map((s) => JSON.parse(s));
  }
}

/** Install FakeWebSocket as the global `WebSocket` and clear prior instances. */
export function installFakeWebSocket(): void {
  FakeWebSocket.reset();
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
}

/** Flush pending microtasks so an in-flight `connect()` builds its socket. */
export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A minimal `fetch` Response stand-in. */
export function fakeResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

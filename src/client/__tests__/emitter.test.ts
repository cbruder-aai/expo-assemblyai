import { TypedEmitter, base64ToBytes, decodeBase64, closeSocket } from '../emitter';

class Bus extends TypedEmitter<{ evt: (n: number) => void }> {
  fire(n: number): void {
    this.emit('evt', n);
  }
  clear(): void {
    this.removeAllListeners();
  }
}

describe('TypedEmitter', () => {
  it('delivers events to registered listeners', () => {
    const bus = new Bus();
    const seen: number[] = [];
    bus.on('evt', (n) => seen.push(n));
    bus.fire(1);
    bus.fire(2);
    expect(seen).toEqual([1, 2]);
  });

  it('on() returns an unsubscribe function', () => {
    const bus = new Bus();
    const seen: number[] = [];
    const off = bus.on('evt', (n) => seen.push(n));
    bus.fire(1);
    off();
    bus.fire(2);
    expect(seen).toEqual([1]);
  });

  it('off() removes a specific listener', () => {
    const bus = new Bus();
    const seen: number[] = [];
    const listener = (n: number) => seen.push(n);
    bus.on('evt', listener);
    bus.off('evt', listener);
    bus.fire(1);
    expect(seen).toEqual([]);
  });

  it('isolates a throwing listener so others still run', () => {
    const bus = new Bus();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const seen: number[] = [];
    bus.on('evt', () => {
      throw new Error('boom');
    });
    bus.on('evt', (n) => seen.push(n));
    bus.fire(7);
    expect(seen).toEqual([7]); // second listener unaffected by the first throwing
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('removeAllListeners() drops everything', () => {
    const bus = new Bus();
    const seen: number[] = [];
    bus.on('evt', (n) => seen.push(n));
    bus.clear();
    bus.fire(1);
    expect(seen).toEqual([]);
  });
});

describe('base64 helpers', () => {
  it('round-trips bytes through base64', () => {
    const b64 = 'AAECAw=='; // bytes 0,1,2,3
    expect(Array.from(base64ToBytes(b64))).toEqual([0, 1, 2, 3]);
  });

  it('decodeBase64 yields a binary string', () => {
    expect(decodeBase64('AAECAw==').length).toBe(4);
  });
});

describe('closeSocket', () => {
  it('resolves immediately when the socket is null', async () => {
    await expect(closeSocket(null)).resolves.toBeUndefined();
  });

  it('resolves immediately when the socket is already closed', async () => {
    const ws = { readyState: 3, close: jest.fn() } as unknown as WebSocket;
    await expect(closeSocket(ws)).resolves.toBeUndefined();
    expect((ws as unknown as { close: jest.Mock }).close).not.toHaveBeenCalled();
  });

  it('closes the socket and runs the previous onclose before resolving', async () => {
    const order: string[] = [];
    const ws: { readyState: number; onclose: ((e: unknown) => void) | null; close: () => void } = {
      readyState: 1,
      onclose: () => order.push('prev-onclose'),
      close() {
        // Simulate the browser firing onclose synchronously on close().
        ws.onclose?.({ code: 1000, reason: '' });
      },
    };

    await closeSocket(ws as unknown as WebSocket);
    order.push('resolved');
    expect(order).toEqual(['prev-onclose', 'resolved']); // prev handler ran first
  });

  it('resolves after the grace period if the socket never closes', async () => {
    jest.useFakeTimers();
    const ws = { readyState: 1, onclose: null, close: () => {} } as unknown as WebSocket;
    const p = closeSocket(ws, 50);
    let settled = false;
    p.then(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    jest.advanceTimersByTime(50);
    await p;
    expect(settled).toBe(true);
    jest.useRealTimers();
  });
});

import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('cloudflare:sockets', () => ({ connect: mocks.connect }));
import { workerSocketFactory } from '@/worker/smtp';

describe('Cloudflare SMTP socket', () => {
  it.each([false, true])('uses the real Cloudflare connection API (TLS=%s)', async (tls) => {
    const secure = { readable: new ReadableStream(), writable: new WritableStream() };
    const socket = { readable: new ReadableStream(), writable: new WritableStream(), startTls: vi.fn(() => secure) };
    mocks.connect.mockReturnValue(socket);
    const result = await workerSocketFactory.connect('smtp.gmail.com', tls ? 465 : 587, { tls });
    expect(mocks.connect).toHaveBeenCalledWith({ hostname: 'smtp.gmail.com', port: tls ? 465 : 587 }, {
      secureTransport: tls ? 'on' : 'starttls', allowHalfOpen: false,
    });
    expect(result.readable).toBe(socket.readable);
    expect((await result.startTls!()).readable).toBe(secure.readable);
  });
});

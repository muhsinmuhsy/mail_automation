import { connect } from 'cloudflare:sockets';
import type { SocketFactory, SmtpSocket } from '../lib/email/providers/smtp/transport';

function wrap(socket: ReturnType<typeof connect>): SmtpSocket {
  return {
    readable: socket.readable,
    writable: socket.writable,
    startTls: () => wrap(socket.startTls()),
  };
}

export const workerSocketFactory: SocketFactory = {
  connect(host, port, options) {
    return wrap(connect({ hostname: host, port }, {
      secureTransport: options?.tls ? 'on' : 'starttls',
      allowHalfOpen: false,
    }));
  },
};

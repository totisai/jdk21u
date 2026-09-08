#!/usr/bin/env node
// Robust WebSocket -> POSIX-socket relay for the wasm JVM.
//
// Speaks Emscripten's websocket_to_posix_proxy wire protocol, but uses the `ws`
// library for WebSocket framing (so control frames / fragmentation / masking are
// handled correctly) and node `net`/`dns` for the real TCP + DNS. This replaces
// Emscripten's hand-rolled C relay, whose parser chokes on some client frames.
//
// Usage: node tcp-relay.cjs [port]           (default 8114)

const net = require('net');
const dns = require('dns');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.argv[2] || '8114', 10);
const DEBUG = process.env.RELAY_DEBUG === '1';
const log = (...a) => { if (DEBUG) console.error('[relay]', ...a); };

// POSIX socket message ids (from websocket_to_posix_proxy.c)
const MSG = {
  SOCKET: 1, SOCKETPAIR: 2, SHUTDOWN: 3, BIND: 4, CONNECT: 5, LISTEN: 6,
  ACCEPT: 7, GETSOCKNAME: 8, GETPEERNAME: 9, SEND: 10, RECV: 11, SENDTO: 12,
  RECVFROM: 13, SENDMSG: 14, RECVMSG: 15, GETSOCKOPT: 16, SETSOCKOPT: 17,
  GETADDRINFO: 18, GETNAMEINFO: 19,
  POLL: 100,   // custom: forwarded from our patched client poll()
};
const POLLIN = 0x001, POLLOUT = 0x004, POLLERR = 0x008, POLLHUP = 0x010, POLLNVAL = 0x020;
const AF_INET = 2, ECONNREFUSED = 111, EHOSTUNREACH = 113, ENOTCONN = 107,
      EAGAIN = 11, EADDRINUSE = 98, EINVAL = 22;

// A 16-byte musl sockaddr_in: family(u16 LE), port(u16 BE), addr(4 BE), zero(8).
function makeSockaddrIn(ip, port) {
  const b = Buffer.alloc(16);
  b.writeUInt16LE(AF_INET, 0);
  b.writeUInt16BE(port & 0xffff, 2);
  const parts = ip.split('.');
  for (let i = 0; i < 4; i++) b[4 + i] = parseInt(parts[i], 10) & 0xff;
  return b;
}
function parseSockaddrIn(buf, off) {
  const port = buf.readUInt16BE(off + 2);
  const ip = `${buf[off + 4]}.${buf[off + 5]}.${buf[off + 6]}.${buf[off + 7]}`;
  return { ip, port };
}
function cstr(buf, off, max) {
  let end = off;
  const lim = Math.min(off + max, buf.length);
  while (end < lim && buf[end] !== 0) end++;
  return buf.toString('utf8', off, end);
}

const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });
wss.on('listening', () => console.error(`tcp-relay listening on ws://127.0.0.1:${PORT}/`));

wss.on('connection', (ws) => {
  log('client connected');
  const socks = new Map();      // fd -> state
  // Allocate socket fds in a high range so they never collide with the wasm
  // module's own MEMFS file descriptors; the client routes any fd >= this base
  // to the bridge (see BRIDGE_FD_BASE in wsps.c).
  let nextFd = 1000000;
  const pollWaiters = [];       // pending blocking poll() calls

  const evalPoll = (items) => {
    let ready = 0; const revents = [];
    for (const { fd, events } of items) {
      const s = socks.get(fd);
      let re = 0;
      if (!s) re = POLLNVAL;
      else if (s.server) {
        // A listening socket is "readable" when a connection is pending accept().
        if ((events & POLLIN) && s.acceptQueue.length > 0) re |= POLLIN;
      }
      else {
        const readable = s.buf.length > 0 || s.ended || s.error;
        const writable = s.pair || s.connected;
        if ((events & POLLIN) && readable) re |= POLLIN;
        if ((events & POLLOUT) && writable) re |= POLLOUT;
        if (s.error) re |= POLLERR;
      }
      revents.push(re);
      if (re) ready++;
    }
    return { ready, revents };
  };
  const checkPollWaiters = () => {
    for (let i = pollWaiters.length - 1; i >= 0; i--) {
      const w = pollWaiters[i];
      const { ready, revents } = evalPoll(w.items);
      if (ready > 0) {
        pollWaiters.splice(i, 1);
        if (w.timer) clearTimeout(w.timer);
        w.send(ready, revents);
      }
    }
  };
  const notify = (fd) => { serviceRecv(fd); checkPollWaiters(); };

  const reply = (buf) => { if (ws.readyState === ws.OPEN) ws.send(buf); };
  const replyRC = (callId, ret, errno = 0) => {
    const b = Buffer.alloc(12);
    b.writeInt32LE(callId, 0); b.writeInt32LE(ret | 0, 4); b.writeInt32LE(errno | 0, 8);
    reply(b);
  };

  // Fulfil a pending blocking recv() from a socket's buffer / EOF / error.
  const serviceRecv = (fd) => {
    const s = socks.get(fd);
    if (!s || !s.recvWaiter) return;
    if (s.buf.length > 0) {
      const w = s.recvWaiter; s.recvWaiter = null;
      const n = Math.min(w.length, s.buf.length);
      const data = s.buf.subarray(0, n);
      s.buf = s.buf.subarray(n);
      const out = Buffer.alloc(12 + n);
      out.writeInt32LE(w.callId, 0); out.writeInt32LE(n, 4); out.writeInt32LE(0, 8);
      data.copy(out, 12);
      log('serviceRecv -> reply callId', w.callId, 'n', n, 'totalBytes', out.length, 'wsOpen', ws.readyState === ws.OPEN);
      reply(out);
    } else if (s.ended) {
      const w = s.recvWaiter; s.recvWaiter = null;
      replyRC(w.callId, 0, 0);           // 0 bytes => EOF
    } else if (s.error) {
      const w = s.recvWaiter; s.recvWaiter = null;
      replyRC(w.callId, -1, ENOTCONN);
    }
  };

  ws.on('message', (data, isBinary) => {
    if (!isBinary) return;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buf.length < 8) return;
    const callId = buf.readInt32LE(0);
    const fn = buf.readInt32LE(4);
    log('msg fn=' + fn + ' callId=' + callId + ' len=' + buf.length);

    switch (fn) {
      case MSG.SOCKET: {
        const fd = nextFd++;
        socks.set(fd, { sock: null, buf: Buffer.alloc(0), ended: false, error: null,
                        recvWaiter: null, connected: false });
        log('socket ->', fd);
        replyRC(callId, fd, 0);
        break;
      }
      case MSG.SOCKETPAIR: {
        // In-memory connected pair (used by the JVM's NIO self-pipe / poller wakeup):
        // writing to one appends to the other's recv buffer.
        const a = nextFd++, b = nextFd++;
        socks.set(a, { pair: true, peerFd: b, buf: Buffer.alloc(0), ended: false, recvWaiter: null });
        socks.set(b, { pair: true, peerFd: a, buf: Buffer.alloc(0), ended: false, recvWaiter: null });
        log('socketpair ->', a, b);
        const out = Buffer.alloc(20);
        out.writeInt32LE(callId, 0); out.writeInt32LE(0, 4); out.writeInt32LE(0, 8);
        out.writeInt32LE(a, 12); out.writeInt32LE(b, 16);
        reply(out);
        break;
      }
      case MSG.CONNECT: {
        const fd = buf.readInt32LE(8);
        const addrLen = buf.readUInt32LE(12);
        const { ip, port } = parseSockaddrIn(buf, 16);
        const s = socks.get(fd);
        if (!s) { replyRC(callId, -1, ENOTCONN); break; }
        log('connect', fd, '->', ip + ':' + port);
        const sock = net.connect({ host: ip, port }, () => {
          s.connected = true;
          log('connected', fd, '->', ip + ':' + port);
          replyRC(callId, 0, 0);
          checkPollWaiters();     // socket is now writable
        });
        s.sock = sock;
        sock.on('data', (d) => { s.buf = Buffer.concat([s.buf, d]); notify(fd); });
        sock.on('end', () => { s.ended = true; notify(fd); });
        sock.on('close', () => { s.ended = true; notify(fd); });
        sock.on('error', (e) => {
          log('sock error', fd, e.code);
          if (!s.connected) { replyRC(callId, -1, ECONNREFUSED); s.connected = 'failed'; }
          else { s.error = e; notify(fd); }
        });
        break;
      }
      case MSG.BIND: {
        // Real server socket bound on the relay host's loopback. Records the
        // requested address; the actual listen() happens on LISTEN.
        const fd = buf.readInt32LE(8);
        const { ip, port } = parseSockaddrIn(buf, 16);
        const s = socks.get(fd);
        if (!s) { replyRC(callId, -1, ENOTCONN); break; }
        s.boundHost = (ip === '0.0.0.0') ? '127.0.0.1' : ip;
        s.boundPort = port;
        log('bind', fd, '->', s.boundHost + ':' + port);
        replyRC(callId, 0, 0);
        break;
      }
      case MSG.LISTEN: {
        const fd = buf.readInt32LE(8);
        const s = socks.get(fd);
        if (!s) { replyRC(callId, -1, ENOTCONN); break; }
        s.acceptQueue = s.acceptQueue || [];
        const server = net.createServer((conn) => {
          // Wrap each accepted connection as a normal relay socket fd.
          const cfd = nextFd++;
          const cs = { sock: conn, buf: Buffer.alloc(0), ended: false, error: null,
                       recvWaiter: null, connected: true };
          socks.set(cfd, cs);
          conn.on('data', (d) => { cs.buf = Buffer.concat([cs.buf, d]); notify(cfd); });
          conn.on('end', () => { cs.ended = true; notify(cfd); });
          conn.on('close', () => { cs.ended = true; notify(cfd); });
          conn.on('error', (e) => { cs.error = e; notify(cfd); });
          s.acceptQueue.push(cfd);
          checkPollWaiters();          // wake a selector waiting for OP_ACCEPT
        });
        s.server = server;
        server.on('error', (e) => {
          log('listen error', fd, e.code);
          if (!s.listening) replyRC(callId, -1, e.code === 'EADDRINUSE' ? EADDRINUSE : EINVAL);
        });
        server.listen(s.boundPort || 0, s.boundHost || '127.0.0.1', () => {
          s.listening = true;
          s.boundPort = server.address().port;   // resolve ephemeral (0) to real port
          log('listen', fd, 'on', (s.boundHost || '127.0.0.1') + ':' + s.boundPort);
          replyRC(callId, 0, 0);
        });
        break;
      }
      case MSG.ACCEPT: {
        const fd = buf.readInt32LE(8);
        const s = socks.get(fd);
        if (!s || !s.server) { replyRC(callId, -1, EINVAL); break; }
        const q = s.acceptQueue || [];
        if (q.length === 0) { replyRC(callId, -1, EAGAIN); break; }   // non-blocking: nothing yet
        const cfd = q.shift();
        const cs = socks.get(cfd);
        const peer = (cs && cs.sock && cs.sock.remoteAddress)
          ? makeSockaddrIn(cs.sock.remoteAddress.replace(/^::ffff:/, ''), cs.sock.remotePort || 0)
          : makeSockaddrIn('127.0.0.1', 0);
        const out = Buffer.alloc(16 + peer.length);
        out.writeInt32LE(callId, 0); out.writeInt32LE(cfd, 4); out.writeInt32LE(0, 8);
        out.writeInt32LE(peer.length, 12); peer.copy(out, 16);
        reply(out);
        break;
      }
      case MSG.SEND: {
        const fd = buf.readInt32LE(8);
        const length = buf.readUInt32LE(12);
        const payload = buf.subarray(20, 20 + length);
        const s = socks.get(fd);
        if (!s) { replyRC(callId, -1, ENOTCONN); break; }
        if (s.pair) {
          const peer = socks.get(s.peerFd);
          if (peer) { peer.buf = Buffer.concat([peer.buf, Buffer.from(payload)]); notify(s.peerFd); }
          replyRC(callId, length, 0);
          break;
        }
        if (!s.sock) { replyRC(callId, -1, ENOTCONN); break; }
        s.sock.write(Buffer.from(payload));
        log('send', fd, length, 'bytes');
        replyRC(callId, length, 0);
        break;
      }
      case MSG.RECV: {
        const fd = buf.readInt32LE(8);
        const length = buf.readUInt32LE(12);
        const s = socks.get(fd);
        if (!s) { replyRC(callId, -1, ENOTCONN); break; }
        log('recv', fd, 'want', length, 'have', s.buf.length, s.pair ? '(pair)' : '');
        s.recvWaiter = { callId, length };
        serviceRecv(fd);   // fulfils now if data/eof already available; else waits
        break;
      }
      case MSG.GETSOCKOPT: {
        // Java checks SO_ERROR after connect; report success (0).
        const out = Buffer.alloc(16 + 4);
        out.writeInt32LE(callId, 0); out.writeInt32LE(0, 4); out.writeInt32LE(0, 8);
        out.writeInt32LE(4, 12); out.writeInt32LE(0, 16);   // option_len=4, value=0
        reply(out);
        break;
      }
      case MSG.SETSOCKOPT:
        replyRC(callId, 0, 0);
        break;
      case MSG.SHUTDOWN: {
        const fd = buf.readInt32LE(8);
        const s = socks.get(fd);
        if (s && s.pair) {
          const peer = socks.get(s.peerFd);
          if (peer) { peer.ended = true; notify(s.peerFd); }
        } else if (s && s.sock) { try { s.sock.destroy(); } catch (e) {} }
        replyRC(callId, 0, 0);
        break;
      }
      case MSG.GETSOCKNAME:
      case MSG.GETPEERNAME: {
        const fd = buf.readInt32LE(8);
        const s = socks.get(fd);
        let sa = Buffer.alloc(16);
        if (s && s.server && fn === MSG.GETSOCKNAME) {
          // Bound server socket: report its real loopback address + port so the
          // app (e.g. a single-instance lock) can record the port it bound.
          sa = makeSockaddrIn(s.boundHost || '127.0.0.1', s.boundPort || 0);
        } else if (s && s.sock) {
          const a = (fn === MSG.GETPEERNAME)
            ? { address: s.sock.remoteAddress, port: s.sock.remotePort }
            : { address: s.sock.localAddress, port: s.sock.localPort };
          if (a.address) sa = makeSockaddrIn(a.address.replace(/^::ffff:/, ''), a.port || 0);
        }
        const out = Buffer.alloc(16 + sa.length);
        out.writeInt32LE(callId, 0); out.writeInt32LE(0, 4); out.writeInt32LE(0, 8);
        out.writeInt32LE(sa.length, 12); sa.copy(out, 16);
        reply(out);
        break;
      }
      case MSG.GETADDRINFO: {
        const node = cstr(buf, 8, 2048);
        const service = cstr(buf, 8 + 2048, 128);
        const hasHints = buf.readInt32LE(8 + 2048 + 128);
        const aiSocktype = buf.readInt32LE(8 + 2048 + 128 + 8);
        log('getaddrinfo', node, service);
        dns.lookup(node, { all: true, family: 4 }, (err, addrs) => {
          if (err || !addrs || addrs.length === 0) {
            const r = Buffer.alloc(12 + 2048 + 4);
            r.writeInt32LE(callId, 0); r.writeInt32LE(-2 /*EAI_NONAME*/, 4); r.writeInt32LE(0, 8);
            reply(r);
            return;
          }
          const socktype = 1, proto = 6;   // STREAM/TCP (HTTP)
          void hasHints; void aiSocktype;
          const port = parseInt(service, 10) || 0;
          const entries = addrs.map((a) => {
            const sa = makeSockaddrIn(a.address, port);
            const e = Buffer.alloc(20 + sa.length);
            e.writeInt32LE(0, 0); e.writeInt32LE(AF_INET, 4); e.writeInt32LE(socktype, 8);
            e.writeInt32LE(proto, 12); e.writeInt32LE(sa.length, 16); sa.copy(e, 20);
            return e;
          });
          const addrBlock = Buffer.concat(entries);
          const r = Buffer.alloc(12 + 2048 + 4 + addrBlock.length);
          r.writeInt32LE(callId, 0); r.writeInt32LE(0, 4); r.writeInt32LE(0, 8);
          r.write(node, 12, 'utf8');                      // ai_canonname
          r.writeInt32LE(entries.length, 12 + 2048);      // addrCount
          addrBlock.copy(r, 12 + 2048 + 4);
          reply(r);
        });
        break;
      }
      case MSG.POLL: {
        const timeout = buf.readInt32LE(8);
        const nfds = buf.readInt32LE(12);
        const items = [];
        for (let i = 0; i < nfds; i++)
          items.push({ fd: buf.readInt32LE(16 + i * 8), events: buf.readInt32LE(20 + i * 8) });
        const sendPoll = (ready, revents) => {
          const out = Buffer.alloc(12 + nfds * 4);
          out.writeInt32LE(callId, 0); out.writeInt32LE(ready, 4); out.writeInt32LE(0, 8);
          for (let i = 0; i < nfds; i++) out.writeInt32LE(revents[i] || 0, 12 + i * 4);
          reply(out);
        };
        const r = evalPoll(items);
        if (r.ready > 0 || timeout === 0) { sendPoll(r.ready, r.revents); break; }
        const w = { items, send: sendPoll, timer: null };
        if (timeout > 0) w.timer = setTimeout(() => {
          const idx = pollWaiters.indexOf(w); if (idx >= 0) pollWaiters.splice(idx, 1);
          const rr = evalPoll(items); sendPoll(rr.ready, rr.revents);
        }, timeout);
        pollWaiters.push(w);
        break;
      }
      default:
        log('unhandled fn', fn);
        replyRC(callId, -1, 0);
        break;
    }
  });

  ws.on('close', () => {
    for (const s of socks.values()) {
      if (s.sock) { try { s.sock.destroy(); } catch (e) {} }
      if (s.server) { try { s.server.close(); } catch (e) {} }
    }
    socks.clear();
    log('client disconnected');
  });
  ws.on('error', (e) => log('ws error', e.message));
});

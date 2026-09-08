// emunet.js — browser/node client for the in-sandbox loopback TCP stack.
// Talks to the emunet_* exports from framework/net/emunet.c: connect to a port a
// server inside the JVM has bound, then send/recv bytes through the shared scratch
// buffer (avoids depending on an exported _malloc). No network, no relay.

export class EmuSocket {
  constructor(mod, fd) { this.mod = mod; this.fd = fd; this._buf = mod._emunet_buf(); this._cap = mod._emunet_buf_size(); }

  // Send a Uint8Array. Returns bytes accepted (may be < data.length if the ring is full).
  send(data) {
    const n = Math.min(data.length, this._cap);
    this.mod.HEAPU8.set(data.subarray(0, n), this._buf);
    return this.mod._emunet_send_buf(this.fd, n);
  }

  // Write the whole buffer, retrying if the ring back-pressures.
  async sendAll(data) {
    let off = 0;
    while (off < data.length) {
      const n = this.send(data.subarray(off));
      if (n > 0) off += n;
      else await sleep(1);
    }
  }

  // Try to read once. Returns a Uint8Array (possibly empty), or null at EOF.
  recv() {
    const n = this.mod._emunet_recv_buf(this.fd);
    if (n === 0) return null;              // peer closed
    if (n < 0) return new Uint8Array(0);   // nothing yet
    return this.mod.HEAPU8.slice(this._buf, this._buf + n);
  }

  readable() { return this.mod._emunet_readable(this.fd); }
  close() { this.mod._emunet_close(this.fd); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Open a loopback connection to 127.0.0.1:<port>, retrying while the server binds.
export async function emuConnect(mod, port, { retries = 200, wait = 25 } = {}) {
  for (let i = 0; i < retries; i++) {
    const fd = mod._emunet_connect(0x7f000001, port);
    if (fd >= 0) return new EmuSocket(mod, fd);
    await sleep(wait);
  }
  throw new Error(`emuConnect: nothing listening on port ${port}`);
}

// Read a full response. Ends on EOF, or a short idle after data starts flowing on a
// kept-alive connection. Two-phase idle: patient for the first byte (the interpreter
// can be slow to respond), then a short trailing idle once bytes arrive.
export async function readToEnd(sock, { firstByteMax = 20000, trailingIdle = 300 } = {}) {
  const chunks = []; let idle = 0; let started = false;
  for (;;) {
    const c = sock.recv();
    if (c === null) break;                              // EOF
    if (c.length === 0) {                               // nothing available yet
      await sleep(2); idle += 2;
      if (idle >= (started ? trailingIdle : firstByteMax)) break;
      continue;
    }
    chunks.push(c); started = true; idle = 0;
  }
  return joinBytes(chunks);
}

const enc = new TextEncoder();
const dec = new TextDecoder();

// A fetch()-like helper: open a connection, send a raw HTTP/1.1 request, read the
// whole response, and parse it into { status, statusText, headers, body }.
export async function jvmFetch(mod, { port = 8080, method = 'GET', path = '/', headers = {}, body = null } = {}) {
  const bodyBytes = body == null ? null : (typeof body === 'string' ? enc.encode(body) : body);
  const h = { Host: `127.0.0.1:${port}`, ...headers };
  return emuSend(mod, { port, method, path, headers: h, body: bodyBytes });
}

// Concatenate byte chunks into one Uint8Array.
function joinBytes(chunks) {
  let n = 0; for (const c of chunks) n += c.length;
  const out = new Uint8Array(n); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// Low-level: send a request with EXACTLY the given headers (no auto Host/etc.), used
// by transports that sign their own headers (the AWS SDK handler). `headers` is an
// object; `body` is a Uint8Array/string or null. Returns the parsed response.
export async function emuSend(mod, { port = 8000, method = 'GET', path = '/', headers = {}, body = null }) {
  const sock = await emuConnect(mod, port);
  try {
    const bodyBytes = body == null ? new Uint8Array(0) : (typeof body === 'string' ? enc.encode(body) : body);
    // Drop Expect: 100-continue (no interim handshake; body sent inline). Never in
    // S3's SignedHeaders, so signing is unaffected.
    const h = {};
    for (const k of Object.keys(headers)) if (k.toLowerCase() !== 'expect') h[k] = headers[k];
    const has = (k) => Object.keys(h).some(x => x.toLowerCase() === k);
    if (bodyBytes.length && !has('content-length')) h['Content-Length'] = String(bodyBytes.length);
    let req = `${method} ${path} HTTP/1.1\r\n`;
    for (const k of Object.keys(h)) req += `${k}: ${h[k]}\r\n`;
    req += '\r\n';
    const head = enc.encode(req);
    const full = new Uint8Array(head.length + bodyBytes.length);
    full.set(head, 0); full.set(bodyBytes, head.length);
    await sock.sendAll(full);
    return parseHttp(await readToEnd(sock));
  } finally {
    sock.close();
  }
}

export function parseHttp(bytes) {
  // Skip any interim 1xx responses (e.g. "HTTP/1.1 100 Continue\r\n\r\n") that a
  // server may emit before the final response.
  for (;;) {
    const s = indexOfCRLFCRLF(bytes);
    if (s < 0) break;
    const firstLine = dec.decode(bytes.subarray(0, bytes.indexOf(13)));
    if (/^HTTP\/\d\.\d\s+1\d\d\b/.test(firstLine)) bytes = bytes.subarray(s + 4);
    else break;
  }
  const sep = indexOfCRLFCRLF(bytes);
  const headText = dec.decode(bytes.subarray(0, sep < 0 ? bytes.length : sep));
  const body = sep < 0 ? new Uint8Array(0) : bytes.subarray(sep + 4);
  const lines = headText.split('\r\n');
  const status = lines[0] || '';
  const m = status.match(/^HTTP\/\d\.\d\s+(\d+)\s*(.*)$/);
  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const idx = lines[i].indexOf(':');
    if (idx > 0) headers[lines[i].slice(0, idx).trim().toLowerCase()] = lines[i].slice(idx + 1).trim();
  }
  const decoded = /chunked/i.test(headers['transfer-encoding'] || '') ? dechunk(body) : body;
  return {
    status: m ? parseInt(m[1], 10) : 0,
    statusText: m ? m[2] : '',
    headers,
    body: decoded,
    text: () => dec.decode(decoded),
  };
}

// Decode HTTP/1.1 chunked transfer-encoding into a single body buffer.
function dechunk(b) {
  const out = [];
  let i = 0;
  while (i < b.length) {
    let j = i;
    while (j + 1 < b.length && !(b[j] === 13 && b[j + 1] === 10)) j++;   // find CRLF
    const sizeLine = dec.decode(b.subarray(i, j)).trim();
    const size = parseInt(sizeLine.split(';')[0], 16);
    if (!Number.isFinite(size) || size === 0) break;                    // last chunk
    const start = j + 2;
    out.push(b.subarray(start, start + size));
    i = start + size + 2;                                               // skip chunk + CRLF
  }
  let total = 0; for (const c of out) total += c.length;
  const res = new Uint8Array(total);
  let off = 0; for (const c of out) { res.set(c, off); off += c.length; }
  return res;
}

function indexOfCRLFCRLF(b) {
  for (let i = 0; i + 3 < b.length; i++)
    if (b[i] === 13 && b[i + 1] === 10 && b[i + 2] === 13 && b[i + 3] === 10) return i;
  return -1;
}

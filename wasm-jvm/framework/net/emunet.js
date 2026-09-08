// emunet.js — browser (and node) client for the in-sandbox loopback TCP stack.
//
// The wasm JVM exports (via EMSCRIPTEN_KEEPALIVE, see framework/net/emunet.c):
//   emunet_connect(ip, port) -> fd        open a loopback connection to a bound port
//   emunet_send_buf(fd, len)  -> n         send `len` bytes from the shared scratch buffer
//   emunet_recv_buf(fd)       -> n|0|-1    recv into scratch: n>0 bytes, 0 EOF, -1 empty
//   emunet_readable(fd)       -> n|0|-2|-1 bytes ready / none / peer-closed / bad fd
//   emunet_close(fd)          -> 0
//   emunet_buf()/emunet_buf_size()         the shared scratch buffer (module heap)
//
// This makes the browser a genuine TCP client of a server running INSIDE the JVM —
// no network, no relay. Bytes are copied through the shared scratch buffer so we
// never depend on _malloc being exported.

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

// Open a loopback connection to 127.0.0.1:<port> inside the JVM.
// Retries briefly so a just-booted server has time to bind.
export async function emuConnect(mod, port, { retries = 200, wait = 25 } = {}) {
  for (let i = 0; i < retries; i++) {
    const fd = mod._emunet_connect(0x7f000001, port);
    if (fd >= 0) return new EmuSocket(mod, fd);
    await sleep(wait);
  }
  throw new Error(`emuConnect: nothing listening on port ${port}`);
}

// Read from `sock` until the peer closes, concatenating all bytes. `idleMax` bounds
// how long we keep polling after the last byte before giving up (ms).
export async function readToEnd(sock, { idleMax = 5000 } = {}) {
  const chunks = [];
  let idle = 0;
  for (;;) {
    const c = sock.recv();
    if (c === null) break;                 // EOF
    if (c.length === 0) {                   // nothing yet
      await sleep(2); idle += 2;
      if (idle >= idleMax) break;
      continue;
    }
    chunks.push(c); idle = 0;
  }
  let total = 0; for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0; for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

// A fetch()-like helper: open a connection, send a raw HTTP/1.1 request, read the
// whole response, and parse it into { status, statusText, headers, body }.
export async function jvmFetch(mod, { port = 8080, method = 'GET', path = '/', headers = {}, body = null } = {}) {
  const sock = await emuConnect(mod, port);
  try {
    const bodyBytes = body == null ? null : (typeof body === 'string' ? enc.encode(body) : body);
    const h = { Host: `127.0.0.1:${port}`, Connection: 'close', ...headers };
    if (bodyBytes) h['Content-Length'] = String(bodyBytes.length);
    let req = `${method} ${path} HTTP/1.1\r\n`;
    for (const k of Object.keys(h)) req += `${k}: ${h[k]}\r\n`;
    req += '\r\n';
    await sock.sendAll(enc.encode(req));
    if (bodyBytes) await sock.sendAll(bodyBytes);
    const raw = await readToEnd(sock);
    return parseHttp(raw);
  } finally {
    sock.close();
  }
}

function parseHttp(bytes) {
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

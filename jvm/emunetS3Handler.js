// emunetS3Handler.js — an AWS SDK v3 HttpHandler that transports over the emunet
// loopback instead of the network. Plug it into @aws-sdk/client-s3 so the browser
// (or Node) talks to TinyS3 running inside the wasm JVM: the SDK does all the
// SigV4 signing, XML, and multipart; we just carry the bytes in-process.
//
//   import { S3Client } from '@aws-sdk/client-s3';
//   import { emunetHttpHandler } from './emunetS3Handler.js';
//   const s3 = new S3Client({
//     endpoint: 'http://127.0.0.1:8000', region: 'us-east-1', forcePathStyle: true,
//     credentials: { accessKeyId: 'admin', secretAccessKey: 'password' },
//     requestHandler: emunetHttpHandler(mod),
//   });

import { emuSend } from './emunet.js';

const enc = new TextEncoder();

function concat(chunks) {
  let n = 0; for (const c of chunks) n += c.length;
  const out = new Uint8Array(n); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// Normalise any SDK request body (string | Uint8Array | ArrayBuffer | Blob |
// web ReadableStream | Node Readable) to a Uint8Array.
async function toBytes(body) {
  if (body == null) return new Uint8Array(0);
  if (typeof body === 'string') return enc.encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof Blob !== 'undefined' && body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (typeof body.getReader === 'function') {           // web ReadableStream
    const r = body.getReader(); const chunks = [];
    for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
    return concat(chunks);
  }
  if (typeof body.on === 'function') {                   // Node Readable
    return await new Promise((res, rej) => {
      const chunks = [];
      body.on('data', d => chunks.push(new Uint8Array(d)));
      body.on('end', () => res(concat(chunks)));
      body.on('error', rej);
    });
  }
  if (body.byteLength != null) return new Uint8Array(body);
  throw new Error('emunetS3Handler: unsupported request body type');
}

// Node's AWS-SDK stream collector requires a Readable; the browser's accepts a
// Uint8Array. Return the right shape for the environment.
let NodeReadable = null;
const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);
async function toResponseBody(bytes) {
  if (!isNode) return bytes;   // browser SDK stream collector accepts a Uint8Array
  if (!NodeReadable) ({ Readable: NodeReadable } = await import('node:stream'));
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  const buf = Buffer.from(u.buffer, u.byteOffset, u.byteLength);
  const s = new NodeReadable({ read() {} });
  s.push(buf); s.push(null);   // one chunk, then EOF
  return s;
}

function queryString(query) {
  if (!query) return '';
  const parts = [];
  for (const k of Object.keys(query)) {
    const v = query[k];
    if (v == null) { parts.push(encodeURIComponent(k)); continue; }
    if (Array.isArray(v)) { for (const item of v) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(item)}`); }
    else parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? '?' + parts.join('&') : '';
}

// Returns an object implementing the SDK's HttpHandler.handle(request) contract.
export function emunetHttpHandler(mod) {
  return {
    async handle(request) {
      const port = Number(request.port) || 8000;
      const path = (request.path || '/') + queryString(request.query);
      const bodyBytes = await toBytes(request.body);
      // request.headers already carries the signed host + x-amz-* + authorization.
      const res = await emuSend(mod, { port, method: request.method, path, headers: request.headers, body: bodyBytes });
      // The SDK deserializers read statusCode/headers/body. The browser stream
      // collector accepts a Uint8Array directly; Node's wants a Readable, so wrap it.
      return { response: { statusCode: res.status, headers: res.headers, body: await toResponseBody(res.body) } };
    },
    // Some SDK middlewares probe these; harmless no-ops.
    updateHttpClientConfig() {},
    httpHandlerConfigs() { return {}; },
  };
}

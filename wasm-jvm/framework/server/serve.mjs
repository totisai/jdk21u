import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const mt = { '.js':'text/javascript', '.mjs':'text/javascript', '.wasm':'application/wasm',
  '.html':'text/html', '.data':'application/octet-stream', '.json':'application/json',
  '.jar':'application/java-archive', '.css':'text/css' };
// Big immutable artifacts — cache hard so reloads don't re-download ~78 MB.
const immutable = new Set(['.wasm', '.data', '.jar']);
const longCache = /\.(worker\.js|metadata)$/;

http.createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/jit-swing.html';
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  let st;
  try { st = await stat(file); if (!st.isFile()) throw 0; }
  catch { res.statusCode = 404; res.end('404 ' + p); return; }

  // cross-origin isolation (required for SharedArrayBuffer / threads)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  const ext = path.extname(p);
  res.setHeader('Content-Type', mt[ext] || 'application/octet-stream');
  if (immutable.has(ext) || longCache.test(p))
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  else
    res.setHeader('Cache-Control', 'no-cache');   // html/js: revalidate so edits show
  res.setHeader('Accept-Ranges', 'bytes');

  // HTTP range support (lets the browser fetch big files in parallel chunks)
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m[1] ? parseInt(m[1]) : 0;
    let end = m[2] ? parseInt(m[2]) : st.size - 1;
    if (start > end || end >= st.size) { res.statusCode = 416; res.end(); return; }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
    res.setHeader('Content-Length', end - start + 1);
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.setHeader('Content-Length', st.size);
  if (req.method === 'HEAD') { res.end(); return; }
  // stream (don't buffer 69 MB into memory and block other requests)
  createReadStream(file).pipe(res).on('error', () => res.destroy());
}).listen(8130, () => console.log('serving', root, 'on 8130'));

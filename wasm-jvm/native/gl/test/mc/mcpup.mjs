/*
 * Run the Minecraft experiment on the wasm JVM HEADLESSLY via Puppeteer.
 * Serves the built web/ dir (jvmgl.js/.wasm/.data/.worker.js) with the COOP/COEP
 * headers pthreads need, plus a headless driver page, and launches Chrome with a
 * software WebGL backend (SwiftShader) so the OffscreenCanvas-on-a-worker GL path
 * works without a GPU. Streams the JVM's console (the [lwjgl]/[wgl] traces + any
 * errors) and screenshots whatever renders.
 *
 * Usage: node mcpup.mjs [seconds]     (default 150)
 */
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync, createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, '../../../../..');
const WEB = path.join(REPO, 'jdk21/build/emscripten-wasm32-zero-release/web');
const WEB2 = path.join(REPO, 'build/emscripten-wasm32-zero-release/web');
const webdir = existsSync(path.join(WEB, 'jvmgl.js')) ? WEB
             : existsSync(path.join(WEB2, 'jvmgl.js')) ? WEB2 : null;
const OUT = path.join(DIR, 'out');
const SECONDS = parseInt(process.argv[2] || '150', 10);
const MIME = { '.html':'text/html', '.js':'text/javascript', '.wasm':'application/wasm',
               '.data':'application/octet-stream', '.mjs':'text/javascript' };

if (!webdir) { console.error('Cannot find built web/jvmgl.js — run wasm-jvm/native/gl/relink-gl.sh first'); process.exit(2); }

function findChrome() {
  const base = path.join(process.env.HOME, '.cache/puppeteer/chrome');
  if (!existsSync(base)) return null;
  for (const v of readdirSync(base).sort().reverse()) {
    const p = path.join(base, v, 'chrome-mac-arm64', 'Google Chrome for Testing.app',
                         'Contents/MacOS/Google Chrome for Testing');
    if (existsSync(p)) return p;
  }
  return null;
}

function serve() {
  const srv = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const file = url === '/' || url === '/mc-headless.html'
      ? path.join(DIR, 'mc-headless.html') : path.join(webdir, url);
    // pthreads require a cross-origin-isolated context
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    try {
      const st = statSync(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
                           'Content-Length': st.size });
      createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  return new Promise(r => srv.listen(0, () => r({ srv, port: srv.address().port })));
}

const chrome = findChrome();
if (!chrome) { console.error('No cached Chrome-for-Testing found'); process.exit(2); }
await mkdir(OUT, { recursive: true });

const { srv, port } = await serve();
const browser = await puppeteer.launch({
  executablePath: chrome, headless: true, protocolTimeout: (SECONDS + 60) * 1000,
  args: [
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--enable-webgl', '--no-sandbox', '--enable-features=SharedArrayBuffer',
    '--disable-dev-shm-usage',
  ],
});

const seen = new Set();
function pipe(tag, text) {
  // de-noise repetitive lines, surface everything else live
  const key = tag + text;
  if (/^warning: unsupported syscall/.test(text)) return;
  console.log(`  ${tag} ${text}`);
}

try {
  const page = await browser.newPage();
  page.setDefaultTimeout((SECONDS + 30) * 1000);
  page.on('console', m => pipe('[c]', m.text()));
  page.on('pageerror', e => pipe('[pageerror]', e.message));
  page.on('error', e => pipe('[error]', e.message));
  // dedicated-worker pool (pthreads) — count, don't spam
  let workers = 0;
  page.on('workercreated', () => { workers++; });

  console.log(`Serving ${webdir} on :${port}; booting MC headless for up to ${SECONDS}s (SwiftShader)…`);
  await page.goto(`http://localhost:${port}/mc-headless.html`, { waitUntil: 'load', timeout: 60000 });

  // stream the JVM log as it grows, until done or timeout
  const start = Date.now();
  let printed = 0;
  while ((Date.now() - start) / 1000 < SECONDS) {
    const st = await page.evaluate('({n: window.__log.length, f: window.__frames, dims: window.__frameDims, done: window.__done})');
    for (let i = printed; i < st.n; i++) {
      const line = await page.evaluate('window.__log[' + i + ']');
      pipe('[jvm]', line);
    }
    printed = st.n;
    if (st.done) { console.log(`  [done] frames=${st.f} dims=${JSON.stringify(st.dims)}`); }
    await new Promise(r => setTimeout(r, 1000));
  }

  const st = await page.evaluate('({f: window.__frames, dims: window.__frameDims})');
  console.log(`\n== summary == frames rendered: ${st.f}, frame dims: ${JSON.stringify(st.dims)}`);
  const shot = path.join(OUT, 'mc_headless.png');
  await page.screenshot({ path: shot });
  console.log('screenshot -> ' + shot);
} finally {
  await browser.close();
  srv.close();
}

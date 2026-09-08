/* Verify IDBFS persistence: launch twice with the SAME browser profile; run 1
 * writes a marker, run 2 must read it back (proving IndexedDB survives reloads). */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync, createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, '../../../../..');
const webdir = ['jdk/build/emscripten-wasm32-zero-release/web', 'build/emscripten-wasm32-zero-release/web']
  .map(p => path.join(REPO, p)).find(p => existsSync(path.join(p, 'jvmgl.js')));
const MIME = { '.html':'text/html', '.js':'text/javascript', '.wasm':'application/wasm', '.data':'application/octet-stream' };
const PROFILE = '/tmp/wasmjvm-persist-profile';

function findChrome() {
  const base = path.join(process.env.HOME, '.cache/puppeteer/chrome');
  for (const v of readdirSync(base).sort().reverse()) {
    const p = path.join(base, v, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents/MacOS/Google Chrome for Testing');
    if (existsSync(p)) return p;
  }
}
function serve() {
  const srv = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const file = url === '/' ? path.join(DIR, 'persist-test.html') : path.join(webdir, url);
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    try { const st = statSync(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size });
      createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  return new Promise(r => srv.listen(0, () => r({ srv, port: srv.address().port })));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(port) {
  const browser = await puppeteer.launch({
    executablePath: findChrome(), headless: true, userDataDir: PROFILE, protocolTimeout: 120000,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction("window.__persist && window.__persist !== 'pending'", { timeout: 90000 });
    return await page.evaluate('window.__persist');
  } finally { await browser.close(); }
}

const { srv, port } = await serve();
try {
  const r1 = await run(port);
  const r2 = await run(port);
  console.log('run 1:', r1);
  console.log('run 2:', r2);
  const pass = r1 === 'MISS-wrote' && r2.startsWith('HIT:');
  console.log(pass ? 'PASS — IDBFS persists across reloads' : 'FAIL — no persistence');
  process.exitCode = pass ? 0 : 1;
} finally { srv.close(); }

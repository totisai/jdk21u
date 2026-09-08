/*
 * Headless input test: boot MC, wait for the menu, then inject mouse move + click
 * via /work/ctrl and screenshot before/after to verify controls work.
 * Usage: node mcinput.mjs
 */
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync, createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, '../../../../..');
const webdir = ['jdk21/build/emscripten-wasm32-zero-release/web']
  .map(p => path.join(REPO, p)).find(p => existsSync(path.join(p, 'jvmgl.js')));
const OUT = path.join(DIR, 'out');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.wasm':'application/wasm', '.data':'application/octet-stream' };

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
    const file = url === '/' || url === '/mc-headless.html' ? path.join(DIR, 'mc-headless.html') : path.join(webdir, url);
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

const { srv, port } = await serve();
await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true, protocolTimeout: 240000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  page.on('console', m => { const t = m.text(); if (/getPending|nextEvent|ctrl size|send err|Exception/i.test(t)) console.log('  [c]', t); });
  await page.goto(`http://localhost:${port}/mc-headless.html`, { waitUntil: 'load', timeout: 60000 });

  // wait until MC is rendering its own 854x480 frames
  console.log('booting MC…');
  for (let i = 0; i < 150; i++) {
    const st = await page.evaluate('({d: window.__frameDims, f: window.__frames})');
    if (st.d && st.d[0] === 854 && st.f > 5) break;
    await sleep(1000);
  }
  await sleep(3000);
  await page.screenshot({ path: path.join(OUT, 'in_0_menu.png') });
  console.log('menu captured; injecting hover + click on Singleplayer…');

  // Singleplayer button center ~ (427, 195) on the 854x480 canvas
  const bx = 427, by = 195;
  for (let i = 0; i < 6; i++) { await page.evaluate(`window.__send(6, ${bx}, ${by})`); await sleep(120); }
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'in_1_hover.png') });   // button should highlight

  await page.evaluate(`window.__send(1, ${bx}, ${by})`); await sleep(120);
  await page.evaluate(`window.__send(3, ${bx}, ${by})`); await sleep(2500);
  await page.screenshot({ path: path.join(OUT, 'in_2_click.png') });   // should navigate to world-select
  console.log('done — see out/in_0_menu.png, in_1_hover.png, in_2_click.png');
} finally {
  await browser.close(); srv.close();
}

/*
 * Puppeteer stress + pixel test for the wgl.c GL1->WebGL translator.
 * Renders many scenes (split, ortho, texture, blend, depth, rotation animation,
 * a large batch) through the REAL WebGL path in headless Chrome (SwiftShader —
 * deterministic, no GPU), asserts pixel colours, and saves PNG images + an
 * animation contact sheet to ./out for inspection.
 */
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'out');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.wasm':'application/wasm' };

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
  const srv = http.createServer(async (req, res) => {
    try {
      const f = path.join(DIR, req.url === '/' ? 'harness.html' : req.url.split('?')[0]);
      const body = await readFile(f);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  return new Promise(r => srv.listen(0, () => r({ srv, port: srv.address().port })));
}
function near(got, want, tol = 6) {
  for (let s = 24; s >= 0; s -= 8) if (Math.abs(((got>>>s)&255) - ((want>>>s)&255)) > tol) return false;
  return true;
}
const hex = v => '0x' + (v>>>0).toString(16).padStart(8, '0');
const C = { red:0xFF0000FF, green:0x00FF00FF, blue:0x0000FFFF, yellow:0xFFFF00FF,
            magenta:0xFF00FFFF, black:0x000000FF, olive:0x808000FF };

const chrome = findChrome();
if (!chrome) { console.error('No cached Chrome-for-Testing found (npx puppeteer browsers install chrome)'); process.exit(2); }
await mkdir(OUT, { recursive: true });

const { srv, port } = await serve();
const browser = await puppeteer.launch({
  executablePath: chrome, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
});
let fails = 0, checks = 0;
const check = (name, cond, extra='') => { checks++; console.log(`  ${cond?'ok  ':'FAIL'} ${name}${extra}`); if (!cond) fails++; };

async function savePng(page, dataUrl, file) {
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  await writeFile(path.join(OUT, file), Buffer.from(b64, 'base64'));
}

try {
  const page = await browser.newPage();
  page.on('console', m => { const t = m.text(); if (/error|MISS|shader err/i.test(t)) console.log('  [page]', t); });
  await page.goto(`http://localhost:${port}/harness.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.wgl && window.wgl.ready', { timeout: 15000 });
  await page.evaluate('window.wgl.init(128,128)');

  console.log('== wgl.c real-WebGL stress + pixel tests (SwiftShader, 128x128) ==');

  // helper: run a scene fn (string of JS) then sample points -> array of pixels
  const run = (js, pts) => page.evaluate(`(()=>{ ${js}; return ${JSON.stringify(pts)}.map(p=>window.wgl.rp(p[0],p[1])); })()`);

  // 1. split
  let px = await run('window.wgl.scene()', [[32,64],[96,64]]);
  check('split: left red',   near(px[0], C.red),   ` ${hex(px[0])}`);
  check('split: right green', near(px[1], C.green), ` ${hex(px[1])}`);
  await savePng(page, await page.evaluate('window.wgl.png()'), 'scene_split.png');

  // 2. ortho
  px = await run('window.wgl.sceneOrtho(128,128)', [[96,96],[32,32]]);
  check('ortho: quad magenta', near(px[0], C.magenta), ` ${hex(px[0])}`);
  check('ortho: outside black', near(px[1], C.black),  ` ${hex(px[1])}`);
  await savePng(page, await page.evaluate('window.wgl.png()'), 'scene_ortho.png');

  // 3. texture: 2x2 (red,green / blue,yellow) — one texel per screen quadrant
  px = await run('window.wgl.sceneTexture()', [[32,32],[96,32],[32,96],[96,96]]);
  check('texture: BL red',    near(px[0], C.red),    ` ${hex(px[0])}`);
  check('texture: BR green',  near(px[1], C.green),  ` ${hex(px[1])}`);
  check('texture: TL blue',   near(px[2], C.blue),   ` ${hex(px[2])}`);
  check('texture: TR yellow', near(px[3], C.yellow), ` ${hex(px[3])}`);
  await savePng(page, await page.evaluate('window.wgl.png()'), 'scene_texture.png');

  // 4. blend: opaque red under 50% green -> olive
  px = await run('window.wgl.sceneBlend()', [[64,64]]);
  check('blend: 50% green over red = olive', near(px[0], C.olive, 10), ` ${hex(px[0])}`);
  await savePng(page, await page.evaluate('window.wgl.png()'), 'scene_blend.png');

  // 5. depth: near red drawn first, far green after -> red survives
  px = await run('window.wgl.sceneDepth()', [[64,64]]);
  check('depth: near occludes far (red wins)', near(px[0], C.red), ` ${hex(px[0])}`);
  await savePng(page, await page.evaluate('window.wgl.png()'), 'scene_depth.png');

  // 6. animation: yellow square rotates 0 -> 180 (right side -> left side)
  let a0 = await run('window.wgl.anim(0)',   [[106,64],[22,64]]);
  let a1 = await run('window.wgl.anim(180)', [[106,64],[22,64]]);
  check('anim@0:   square on the right',  near(a0[0], C.yellow, 40), ` ${hex(a0[0])}`);
  check('anim@0:   left side empty',      !near(a0[1], C.yellow, 40), ` ${hex(a0[1])}`);
  check('anim@180: right side empty',     !near(a1[0], C.yellow, 40), ` ${hex(a1[0])}`);
  check('anim@180: square moved to left', near(a1[1], C.yellow, 40), ` ${hex(a1[1])}`);
  await savePng(page, await page.evaluate('window.wgl.animSheet(12)'), 'anim_sheet.png');

  // 7. stress: 64x64 = 4096 quads (16384 verts) in one draw call
  px = await run('window.wgl.sceneStress(64)', [[97,33]]);
  check('stress: 4096-quad batch, cell colour correct', near(px[0], 0xBF4040FF), ` ${hex(px[0])}`);
  await savePng(page, await page.evaluate('window.wgl.png()'), 'scene_stress.png');

} finally {
  await browser.close();
  srv.close();
}

console.log(`\n${checks} checks, ${fails} failures — images in test/webgl/out/`);
console.log(fails === 0 ? 'PASS' : 'FAIL');
process.exit(fails === 0 ? 0 : 1);

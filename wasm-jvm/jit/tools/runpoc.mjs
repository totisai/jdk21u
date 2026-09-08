// Headless DemoSwing repro: boot the (monolithic) jvm-awt.js, stage the JarApp harness
// + demo-swing.jar + the PoC's vmopts/props, and run JarApp. JarApp's paint thread
// paints DemoSwing to /work/frame.bin continuously (the exact framebuffer-Graphics path
// the browser uses) — so under JITALL the browser's crashing paint methods JIT here too,
// without a display. Catches the _fast_iload-unmasked javaCalls.cpp:473 crash headlessly.
//   node runpoc.mjs                (env: JITALL, WASMJIT_DENY, WASMJIT_OSR)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const JDK = process.env.JDK || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = path.join(JDK, 'build/emscripten-wasm32-zero-release/web');
const POC = path.join(JDK, 'wasm-jvm/examples/poc');
const createJVM = require(path.join(WEB, 'jvm-awt.js'));

const stage = [
  ['/app/JarApp.class',                 path.join(POC, 'out/JarApp.class')],
  ['/app/JarApp$1.class',               path.join(POC, 'out/JarApp$1.class')],
  ['/app/CmdGraphics2D.class',          path.join(POC, 'out/CmdGraphics2D.class')],
  ['/app/CmdGraphics2D$Rec.class',      path.join(POC, 'out/CmdGraphics2D$Rec.class')],
  ['/app/MemoryPreferences.class',      path.join(POC, 'out/MemoryPreferences.class')],
  ['/app/MemoryPreferencesFactory.class', path.join(POC, 'out/MemoryPreferencesFactory.class')],
  ['/app/lib/demo-swing.jar',           path.join(WEB, 'poc/demo-swing.jar')],
];

let out = '';
const log = (s) => { out += s + '\n'; process.stdout.write(s + '\n'); };
let MOD = null;
const done = new Promise((resolve) => {
  createJVM({
    arguments: ['JarApp'],
    locateFile: (p) => path.join(WEB, p),
    print: log, printErr: log,
    preRun: [(M) => {
      MOD = M;
      M.ENV = M.ENV || {};
      if (process.env.JITALL === '1') M.ENV.WASMJIT_ALL = '1';
      if (process.env.WASMJIT_DENY) M.ENV.WASMJIT_DENY = process.env.WASMJIT_DENY;
      if (process.env.WASMJIT_OSR === '1') M.ENV.WASMJIT_OSR = '1';
      if (process.env.WASMJIT_TRACE === '1') M.ENV.WASMJIT_TRACE = '1';
      try { M.FS.mkdir('/work'); } catch (e) {}
      const mk = (d) => { let p=''; for (const s of d.split('/')) { if(!s) continue; p+='/'+s; try{M.FS.mkdir(p);}catch(e){} } };
      mk('/app/lib');
      M.FS.writeFile('/work/classpath', '/app:/app/lib/demo-swing.jar');
      M.FS.writeFile('/work/addmods', 'ALL-SYSTEM');
      M.FS.writeFile('/work/vmopts',
        '-Dpoc.viewportW=800\n-Dpoc.viewportH=600\n-Djava.awt.headless=false\n' +
        '-Dsun.java2d.wasm.screenWidth=800\n-Dsun.java2d.wasm.screenHeight=600\n' +
        '-Djava.util.prefs.PreferencesFactory=MemoryPreferencesFactory\n' +
        '--add-opens=java.base/java.nio=ALL-UNNAMED\n');
      for (const [dst, srcp] of stage) M.FS.writeFile(dst, readFileSync(srcp));
    }],
    onExit: () => resolve(),
  }).catch((e) => { log('[runpoc] createJVM error: ' + e); resolve(); });
});
// Inject a stream of mouse events into the /work/ctrl SPSC ring, driving the EDT
// event-dispatch path (mouse move/press/release -> hit-testing -> dispatch) which the
// headless paint loop never exercises. This is where the browser crashed on a click.
let ring = null, edx = 40, edy = 30, dir = 7, injected = 0;
const push = (state, a, b) => {
  const M = MOD; if (!M || !M.HEAP32) return;
  if (!ring) { try {
    const info = M.FS.readFile('/work/ctrlinfo', { encoding:'utf8' }).trim().split(/\s+/).map(Number);
    if (info.length === 2 && info[0] > 0) { const h = info[0] >> 2; ring = { h, t: h+1, rec: h+3, cap: info[1] }; }
  } catch (_) {} }
  if (!ring) return;
  const H = M.HEAP32, head = Atomics.load(H, ring.h), tail = Atomics.load(H, ring.t);
  if (head - tail < ring.cap) { const base = ring.rec + (head % ring.cap) * 3;
    H[base] = state|0; H[base+1] = a|0; H[base+2] = b|0; Atomics.store(H, ring.h, head+1); }
};
const injector = setInterval(() => {
  // move + click around; also hammer the "Click me" button area (~top-left toolbar).
  edx += dir; if (edx > 700 || edx < 20) dir = -dir;
  push(6, edx, edy);            // move
  push(1, 30, 30); push(3, 30, 30);   // press+release on the toolbar button
  push(1, edx, edy); push(3, edx, edy);
  push(4, 65 + (injected % 26), 97 + (injected % 26));  // keystrokes into the editor
  injected++;
}, 4);

const timer = new Promise((r) => setTimeout(() => { log('[runpoc] TIMER (no crash; injected=' + injected + ')'); r(); }, 60000));
await Promise.race([done, timer]);
clearInterval(injector);
console.log('\n[runpoc] end');
process.exit(0);

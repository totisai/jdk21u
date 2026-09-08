// Headless AWT/Swing JIT runner — like runjit.mjs but boots jvm-awt.js with
// java.desktop and headless=true, so a Swing program that fires events (button
// doClick) exercises the AWT event-dispatch path under the JIT without a browser.
//   node runawt.mjs <File.java> [MainClass]   (env: JITALL, WASMJIT_DENY, WASMJIT_OSR)
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
const require = createRequire(import.meta.url);

const JDK  = process.env.JDK  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB  = path.join(JDK, 'build/emscripten-wasm32-zero-release/web');
const BOOT = process.env.BOOT || '/opt/homebrew/Cellar/openjdk@21/21.0.9/libexec/openjdk.jdk/Contents/Home';

const javaFile = process.argv[2];
if (!javaFile) { console.error('usage: node runawt.mjs <File.java> [MainClass]'); process.exit(2); }
const srcTxt = readFileSync(javaFile, 'utf8');
const pub = (srcTxt.match(/public\s+(?:final\s+)?class\s+([A-Za-z_$][\w$]*)/) || [])[1];
const mainClass = process.argv[3] || pub || path.basename(javaFile).replace(/\.java$/, '');
const outDir = mkdtempSync(path.join(os.tmpdir(), 'runawt-'));
const srcName = (pub || mainClass) + '.java';
execSync(`cp "${javaFile}" "${path.join(outDir, srcName)}" && "${BOOT}/bin/javac" -d "${outDir}" "${path.join(outDir, srcName)}"`, { stdio: 'inherit' });
const classes = [];
(function walk(d, rel){ for (const e of readdirSync(d, { withFileTypes: true })) {
  const r = rel ? rel + '/' + e.name : e.name;
  if (e.isDirectory()) walk(path.join(d, e.name), r);
  else if (e.name.endsWith('.class')) classes.push([r, readFileSync(path.join(d, e.name))]);
} })(outDir, '');

const createJVM = require(path.join(WEB, 'jvm-awt.js'));
let out = '';
const log = (s) => { out += s + '\n'; process.stdout.write(s + '\n'); };

const done = new Promise((resolve) => {
  createJVM({
    arguments: [mainClass],
    locateFile: (p) => path.join(WEB, p),
    print: log, printErr: log,
    preRun: [(M) => {
      M.ENV = M.ENV || {};
      if (process.env.JITALL === '1') M.ENV.WASMJIT_ALL = '1';
      if (process.env.WASMJIT_LOG === '1') M.ENV.WASMJIT_LOG = '1';
      if (process.env.WASMJIT_DENY) M.ENV.WASMJIT_DENY = process.env.WASMJIT_DENY;
      if (process.env.WASMJIT_OSR === '1') M.ENV.WASMJIT_OSR = '1';
      try { M.FS.mkdir('/work'); } catch (e) {}
      try { M.FS.mkdir('/app'); } catch (e) {}
      M.FS.writeFile('/work/classpath', '/app');
      M.FS.writeFile('/work/addmods', 'java.desktop,java.datatransfer,java.xml,java.prefs,java.logging,jdk.unsupported');
      M.FS.writeFile('/work/vmopts', '-Djava.awt.headless=true\n-Djava.util.prefs.PreferencesFactory=MemoryPreferencesFactory\n');
      for (const [rel, bytes] of classes) {
        const dir = rel.lastIndexOf('/') >= 0 ? '/app/' + rel.slice(0, rel.lastIndexOf('/')) : null;
        if (dir) { let p = ''; for (const s of dir.split('/')) { if (!s) continue; p += '/' + s; try { M.FS.mkdir(p); } catch (e) {} } }
        M.FS.writeFile('/app/' + rel, bytes);
      }
    }],
    onExit: () => resolve(),
  }).catch((e) => { log('[runawt] createJVM error: ' + e); resolve(); });
});
const timeout = new Promise((r) => setTimeout(() => { log('[runawt] TIMEOUT'); r(); }, 90000));
await Promise.race([done, timeout]);
console.log('\n[runawt] done (' + mainClass + ')');
process.exit(0);

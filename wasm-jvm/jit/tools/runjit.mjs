// Headless JIT differential-test runner.
//
//   node runjit.mjs <File.java> [MainClass]        (env: JITALL=1, WASMJIT_LOG=1)
//
// Compiles a test .java with the host javac, boots the monolithic jvm-base.js in
// node, stages the classes into MEMFS, and runs MainClass. The *Diff benches name
// their JIT'd methods jit* (compiled by default) and interpret their p* twins, so
// a single run is a jit-vs-interpreter differential; the runner exits non-zero
// unless the program prints "ALL PASS".
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

const javaFile  = process.argv[2];
if (!javaFile) { console.error('usage: node runjit.mjs <File.java> [MainClass]'); process.exit(2); }

// The bench files are named *Diff.java but declare `public class <X>`; javac needs
// the file named <X>.java, so copy the source under its public-class name first.
const src = readFileSync(javaFile, 'utf8');
const pub = (src.match(/public\s+(?:final\s+)?class\s+([A-Za-z_$][\w$]*)/) || [])[1];
const mainClass = process.argv[3] || pub || path.basename(javaFile).replace(/\.java$/, '');
const outDir = mkdtempSync(path.join(os.tmpdir(), 'runjit-'));
const srcName = (pub || mainClass) + '.java';
execSync(`cp "${javaFile}" "${path.join(outDir, srcName)}" && "${BOOT}/bin/javac" -d "${outDir}" "${path.join(outDir, srcName)}"`, { stdio: 'inherit' });
const classes = [];
(function walk(d, rel){ for (const e of readdirSync(d, { withFileTypes: true })) {
  const r = rel ? rel + '/' + e.name : e.name;
  if (e.isDirectory()) walk(path.join(d, e.name), r);
  else if (e.name.endsWith('.class')) classes.push([r, readFileSync(path.join(d, e.name))]);
} })(outDir, '');

const createJVM = require(path.join(WEB, 'jvm-base.js'));
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
      if (process.env.WASMJIT_DBG === '1') M.ENV.WASMJIT_DBG = '1';
      if (process.env.WASMJIT_DENY) M.ENV.WASMJIT_DENY = process.env.WASMJIT_DENY;
      if (process.env.WASMJIT_OSR === '1') M.ENV.WASMJIT_OSR = '1';
      try { M.FS.mkdir('/work'); } catch (e) {}
      try { M.FS.mkdir('/app'); } catch (e) {}
      M.FS.writeFile('/work/classpath', '/app');
      for (const [rel, bytes] of classes) {
        const dir = rel.lastIndexOf('/') >= 0 ? '/app/' + rel.slice(0, rel.lastIndexOf('/')) : null;
        if (dir) { let p = ''; for (const s of dir.split('/')) { if (!s) continue; p += '/' + s; try { M.FS.mkdir(p); } catch (e) {} } }
        M.FS.writeFile('/app/' + rel, bytes);
      }
    }],
    onExit: () => resolve(),
  }).catch((e) => { log('[runjit] createJVM error: ' + e); resolve(); });
});

const timeout = new Promise((r) => setTimeout(() => { log('[runjit] TIMEOUT'); r(); }, 60000));
await Promise.race([done, timeout]);
// A bench passes if it emits a positive self-verification signal and no failure signal.
// Positive: "ALL PASS", "RESULT PASS", a lone "match=true" (diff/stress benches), or
// equal checksums "chk=X/X" (perf benches like PerfCompare). Negative: match=false,
// FAILURES=, an uncaught exception, a timeout, or a bare FAIL token in the app output.
const scrub = out.replace(/match=(true|false)/g, '').replace(/\[runjit\][^\n]*/g, '');
const failed = /match=false|FAILURES=|Exception in thread|TIMEOUT|RESULT FAIL/.test(out) || /\bFAIL\b/.test(scrub);
const chkOk  = /chk=([0-9a-fA-F]+)\/\1\b/.test(out);
const passed = /ALL PASS|RESULT PASS/.test(out) || (/match=true/.test(out) && !/match=false/.test(out)) || chkOk;
const pass = passed && !failed;
console.log('\n[runjit] ' + (pass ? 'PASS' : 'FAIL') + ' (' + mainClass + ')');
process.exit(pass ? 0 : 1);

#!/usr/bin/env bash
# Assemble the GitHub Pages runtime assets (jvm/) from a wasm build.
#
# Two self-contained monolithic bundles, both booting in the browser:
#   jvmawt.*   -> Swing/Java2D demo (swing.html)
#   jvm-base.* -> live javac REPL   (repl.html; has jdk.compiler + the Runner driver)
# Each .data is shipped gzipped and decompressed in the browser via
# DecompressionStream, handed to the runtime with Module.getPreloadedPackage.
#
# IMPORTANT — FFI fix: emsdk 3.1.45 + current hoodmane libffi emit an ffi_call_js
# that marshals 64-bit values through BigInt64Array (HEAPU64) assuming 8-byte
# alignment of the cif slots, which are only 4-byte aligned on wasm32 -> every
# i64 native call mismarshals and boot deadlocks at JNI_CreateJavaVM. The build
# that works reads the halves via HEAPU32 and rebuilds the BigInt. We copy that
# known-good ffi_call_js / ffi_prep_closure_loc_js from jvmawt.js (same emsdk
# output) into jvm-base.js. Proper fix: rebuild libffi so it emits the aligned
# variant; until then this post-link patch is required.
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JDK="$(cd "$HERE/../.." && pwd)"
WEB="$JDK/build/emscripten-wasm32-zero-release/web"
OUT="$HERE/jvm"
mkdir -p "$OUT"

# Swing (AWT) bundle.
cp "$WEB/screen.js" "$OUT/"   # reusable input+render module used by swing.html/gl.html
cp "$WEB/jvmawt.js" "$WEB/jvmawt.wasm" "$WEB/jvmawt.worker.js" "$OUT/"
gzip -9 -c "$WEB/jvmawt.data" > "$OUT/jvmawt.data.gz"

# REPL (base) bundle.
cp "$WEB/jvm-base.js" "$WEB/jvm-base.wasm" "$WEB/jvm-base.worker.js" "$OUT/"
gzip -9 -c "$WEB/jvm-base.data" > "$OUT/jvm-base.data.gz"

# 3D / WebGL (gl) bundle for the GLDemo spinning triangle.
cp "$WEB/jvmgl.js" "$WEB/jvmgl.wasm" "$WEB/jvmgl.worker.js" "$OUT/"
gzip -9 -c "$WEB/jvmgl.data" > "$OUT/jvmgl.data.gz"

# Apply the FFI fix to the shipped jvm-base.js (see note above). No-op if the
# working variant is already present.
node --input-type=module - "$WEB/jvmawt.js" "$OUT/jvm-base.js" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const good = readFileSync(process.argv[2],'utf8').split('\n');
const path = process.argv[3];
let tgt = readFileSync(path,'utf8').split('\n');
let n=0;
for (const sig of ['function ffi_call_js(', 'function ffi_prep_closure_loc_js(']) {
  const g = good.find(l=>l.trimStart().startsWith(sig));
  const i = tgt.findIndex(l=>l.trimStart().startsWith(sig));
  if (g && i>=0 && tgt[i].trimStart()!==g.trimStart()) { tgt[i]=tgt[i].match(/^\s*/)[0]+g.trimStart(); n++; }
}
writeFileSync(path, tgt.join('\n'));
console.error('ffi patch: replaced '+n+' function(s) in jvm-base.js');
NODE

echo "assembled $OUT ($(du -sh "$OUT" | cut -f1))"

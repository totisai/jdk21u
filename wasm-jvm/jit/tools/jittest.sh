#!/usr/bin/env bash
# One-command JIT test cycle: rebuild the wasm libjvm (picks up wasmJit.cpp edits),
# relink jvm-base, then run a bench .java through the differential runner.
#
#   bash jittest.sh wasm-jvm/jit/bench/M4Diff.java [MainClass]
#   JITALL=1 bash jittest.sh <bench>          # force WASMJIT_ALL
#   SKIP_BUILD=1 bash jittest.sh <bench>      # just re-run (no rebuild)
set -e
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../env.sh"
cd "$JDK"
if [ "${SKIP_BUILD:-0}" != 1 ]; then
  echo "[jittest] make hotspot…"
  make hotspot STATIC_LIBS=true CONF=emscripten-wasm32-zero-release >/tmp/jt-hs.log 2>&1 || { echo HOTSPOT_FAIL; tail -20 /tmp/jt-hs.log; exit 1; }
  echo "[jittest] relink jvm-base…"
  bash wasm-jvm/framework/build/build-jvm.sh base >/tmp/jt-base.log 2>&1 || { echo BASE_FAIL; tail -20 /tmp/jt-base.log; exit 1; }
fi
node wasm-jvm/jit/tools/runjit.mjs "$1" "$2" 2>&1 | grep -vE "warning: unsupported syscall|\[wasmjit\] compiled |Unknown module: java.desktop"

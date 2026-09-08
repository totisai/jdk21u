#!/usr/bin/env bash
# Run every differential/stress bench under JITALL and report PASS/FAIL/CRASH.
# Usage: bash suite.sh            (JITALL, all benches)
#        MODE=eager bash suite.sh (eager jit* mode)
#        bash suite.sh Foo Bar    (only named benches)
set -u
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."   # -> repo root
BENCH=wasm-jvm/jit/bench
export JITALL=${JITALL:-1}
[ "${MODE:-}" = eager ] && export JITALL=0
TO=""; command -v gtimeout >/dev/null && TO="gtimeout 150"; command -v timeout >/dev/null && TO="timeout 150"
sel=("$@")
pass=0; fail=0; failed=()
for f in $BENCH/*.java; do
  b=$(basename "$f" .java)
  if [ ${#sel[@]} -gt 0 ]; then skip=1; for s in "${sel[@]}"; do [ "$s" = "$b" ] && skip=0; done; [ $skip = 1 ] && continue; fi
  # AwtRepro needs java.desktop/AWT, which the base-tier jvm-base.js artifact does not
  # contain; it is only runnable against the awt artifact. Skip it in the base suite.
  [ "$b" = AwtRepro ] && { echo "skip  $b (needs awt artifact)"; continue; }
  out=$($TO node wasm-jvm/jit/tools/runjit.mjs "$f" 2>&1)
  ok=0; echo "$out" | grep -qE "ALL PASS|match=true|RESULT PASS|\[runjit\] PASS" && ok=1
  # hard failure: wrong result, uncaught crash, or a checksum mismatch (NOT a recovered
  # instantiate-failure, which degrades to the interpreter and is a separate WARN below).
  hard=0; echo "$out" | grep -qE "match=false|FAILURES=|Exception in thread|RESULT FAIL|\[runjit\] FAIL \(" && hard=1
  # a "table index"/trap that wasn't recovered (process died) is hard
  echo "$out" | grep -qE "table index is out of bounds" && ! echo "$out" | grep -qE "ALL PASS|match=true" && hard=1
  warn=""; echo "$out" | grep -qE "instantiate failed|CompileError" && warn=" [WARN: latent instantiate-fail]"
  if [ $ok = 1 ] && [ $hard = 0 ]; then echo "pass  $b$warn"; pass=$((pass+1));
  else echo "FAIL  $b$warn   ::  $(echo "$out" | grep -iE 'FAILURES|table index|Exception|RESULT FAIL' | head -1)"; fail=$((fail+1)); failed+=("$b"); fi
done
echo "----"
echo "PASS=$pass FAIL=$fail"
[ $fail -gt 0 ] && echo "FAILED: ${failed[*]}"

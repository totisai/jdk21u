#!/usr/bin/env bash
# Unit-test the wgl.c GL1->WebGL translator with mocked GLES2 (no GPU/context).
# Preference: build to wasm with emcc and run under Node (matches the target
# runtime). Falls back to a native cc build if emcc/node aren't on PATH.
set -eu
cd "$(dirname "${BASH_SOURCE[0]}")"

if command -v emcc >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    echo "[test] emcc + node"
    # NB: .js (CommonJS) auto-runs main; .mjs would need importing.
    emcc -DWGL_TEST -O1 -Wall test_wgl.c mockgl.c -o /tmp/test_wgl.js \
        -sENVIRONMENT=node -sEXIT_RUNTIME=1
    node /tmp/test_wgl.js
elif command -v cc >/dev/null 2>&1; then
    echo "[test] native cc"
    cc -DWGL_TEST -O1 -Wall test_wgl.c mockgl.c -lm -o /tmp/test_wgl
    /tmp/test_wgl
else
    echo "no emcc/node or cc available" >&2; exit 2
fi

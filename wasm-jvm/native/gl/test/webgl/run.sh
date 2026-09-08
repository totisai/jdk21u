#!/usr/bin/env bash
# Real-WebGL pixel test: build the wgl.c harness with emcc, then render it in a
# headless Chrome (SwiftShader) via Puppeteer and assert the pixels.
# Prereqs: emsdk (emcc) on PATH; `npm install` in this dir (puppeteer-core);
# a cached Chrome-for-Testing (~/.cache/puppeteer). See README.md.
set -eu
cd "$(dirname "${BASH_SOURCE[0]}")"

emcc -DWGL_NO_JNI -O2 harness.c -lGL -o harness.js \
    -sEXPORTED_FUNCTIONS=_h_init,_h_scene,_h_scene_ortho,_h_scene_texture,_h_scene_blend,_h_scene_depth,_h_anim,_h_scene_stress,_h_readpixel \
    -sEXPORTED_RUNTIME_METHODS=cwrap,ccall \
    -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web

node puptest.mjs

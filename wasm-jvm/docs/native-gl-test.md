# wgl.c GL1→WebGL translator — tests

Two complementary layers test the translator (`../wgl.c`) without the JVM:

## 1. Mock unit tests (Node/native, no GPU) — `run.sh`

The translator is deterministic: a sequence of GL1 immediate-mode calls maps to a
specific sequence of GLES2 calls + matrices. `test_wgl.c` `#include`s `wgl.c`
(white-box — inspects the internal matrix stacks and vertex buffer) and asserts
the emitted GLES2 calls against **mocked** GLES2 (`mockgl.c`). Fast, hermetic,
runs anywhere.

```bash
bash run.sh          # emcc + node (falls back to native cc)
```

Covers: matrix math (ortho/translate/scale/push-pop), QUADS→triangles expansion,
vertex packing, ubyte→float color, texture-enable→shader uniform, glEnable
forwarding, matrix upload on draw, getFunctionAddress routing.

## 2. Real-WebGL pixel tests (Puppeteer + SwiftShader) — `webgl/run.sh`

Renders through the **real** WebGL path in a headless browser and asserts actual
pixels — catching what mocks can't (shader compiles, transforms land geometry in
the right place, colors interpolate on the GPU). Uses software rendering
(SwiftShader via ANGLE) so it's deterministic and needs no GPU.

```bash
cd webgl
npm install          # once — puppeteer-core (uses a cached Chrome-for-Testing)
bash run.sh          # emcc harness + node puptest.mjs
```

- `harness.c` includes `wgl.c` (`WGL_NO_JNI`) and draws deterministic scenes to a
  normal `<canvas>`: split (positions+colour), ortho quad (projection), 2×2
  texture map, alpha blend, depth test, rotation animation, and a 4096-quad batch
  (stress). Exposes `h_init/h_scene*/h_anim/h_scene_stress/h_readpixel`.
- `harness.html` loads the wasm and exposes `window.wgl` (run scene, read pixel,
  grab PNG, build an animation contact sheet).
- `puptest.mjs` serves the page, launches headless Chrome with
  `--use-angle=swiftshader --enable-unsafe-swiftshader`, asserts pixel colours for
  every scene (15 checks), and writes PNGs + an animation sheet to `out/`.

Requires a cached Chrome-for-Testing under `~/.cache/puppeteer` (Puppeteer
downloads it on first `npx puppeteer browsers install chrome`). `node_modules/`
and the built `harness.js/.wasm` are git-ignored.

## Why these can't test the full JVM/LWJGL path
The JVM display backend (`lwjgl.c`) is inherently WebGL-context- and
OffscreenCanvas-bound and runs on a proxied pthread — that path is verified
browser-in-the-loop. These tests isolate the reusable GL translation core, which
is where the rendering logic lives.

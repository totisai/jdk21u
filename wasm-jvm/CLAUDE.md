# CLAUDE.md — wasm-jvm

Guidance for Claude Code when working in `wasm-jvm/` (OpenJDK 21 → WebAssembly).

This directory is a **browser JVM platform**, not a demo: a HotSpot Zero VM
cross-compiled to `wasm32-unknown-emscripten` (Emscripten), a bytecode→wasm JIT,
an embeddable SDK, the native AWT/GL port, and example apps. The JIT **compiler
itself** lives in the JDK tree — the subtree `src/hotspot/share/interpreter/wasm/`
(core, compiler, assembler, and runtime sources + matching `.hpp`), hooked from
`bytecodeInterpreter.cpp` — not under `wasm-jvm/`.

**The port also modifies ~60 files in the JDK tree itself** (HotSpot OS layer, NIO/AWT
overlays, build system, the JIT hook). Those cannot move; they are indexed in
`docs/jdk-touchpoints.md` — keep it updated when you add/remove a JDK-tree hook.
Regenerate the list with `git diff --name-status jdk-21.0.5-ga..HEAD -- src make`.

## Layout (one concern per top-level dir)

- `env.sh` — shared toolchain/config (JDK, BUILD, BOOT, BOOTMODS, emsdk). **Every
  build script sources it as `../../env.sh`** (they are all two levels deep).
- `framework/` — the integration kernel / SDK to embed the VM in any app:
  `wasmjvm.js` (import this), `kernel/` (`launcher_web.c`, `wsps.c`), `build/`
  (`build-jvm.sh`, `build-packs.sh`), `net/` (`tcp-relay.cjs`, `relay.mjs`),
  `server/` (`serve.mjs`).
- `native/` — port internals: `awt/` (Swing/Java2D→canvas native + overlays),
  `gl/` (WebGL/LWJGL/OpenAL native + `test/`).
- `jit/` — JIT dev-kit: `reference/` (`jitc.c`, `spike.c`), `bench/`, `tools/`
  (`bootprobe.mjs`, `jitshot.mjs` — headless-Chrome harnesses, need puppeteer-core
  in `jit/tools/node_modules`).
- `examples/` — runnable apps, each drives `framework/wasmjvm.js`: `poc/` (flagship),
  `compile-run/`, `swing/`, `minecraft/`, `gl/`, `snippets/`.
- `docs/` — **ALL documentation lives here** (flat, descriptive filenames). This
  replaces the per-folder `PORTING-SUMMARY.md` convention for this platform: record
  decisions in the matching `docs/*.md`, not scattered in code folders.
  `docs/README.md` is the index.

## Build & run

```bash
source wasm-jvm/env.sh
# rebuild the wasm libjvm (includes the JIT) after editing src/hotspot:
make hotspot STATIC_LIBS=true CONF=emscripten-wasm32-zero-release
# link an artifact (PACKS=1 = empty .data, packs are the sole source):
PACKS=1 bash wasm-jvm/framework/build/build-jvm.sh awt        # default (no sockets)
NET=1 PACKS=1 bash wasm-jvm/framework/build/build-jvm.sh awt  # -> jvm-awt-net.js
bash wasm-jvm/framework/build/build-packs.sh [module...]      # per-module data packs
( cd build/<conf>/web && node serve.mjs )                     # COOP/COEP dev server
```

Headless verify: `cd wasm-jvm/jit/tools && node bootprobe.mjs` (env `URL=`, `JIT=`,
`POLLS=`, `?net=1&auto=1&url=` for the networking self-test).

## Non-obvious rules (see docs/ for detail)

- **Packs vs monolithic are mutually exclusive.** A packs-based page needs a
  `PACKS=1` (empty-`.data`) artifact; a monolithic `.data` double-stages module
  paths and throws `mknod` EEXIST → boot freeze. (`docs/example-poc.md`)
- **Networking is a separate artifact** (`jvm-awt-net.js`, socket proxy) selected
  only when a relay is configured — the socket-proxy build blocks at boot with no
  relay bridge. Use `framework/net/tcp-relay.cjs` (DNS + multi-target). Prefer raw
  sockets over `HttpURLConnection` (its keep-alive path hangs). (`docs/networking.md`)
- **Lazy module loading** (CheerpJ-style) is the PoC default: only a small boot set
  is downloaded; other modules are fetched on first use. (`docs/example-poc.md`)
- The JIT hot path in `wasm/core/wasmJit.cpp` must stay lock-free for ineligible/warming
  methods — a global mutex per dispatch melts down across emscripten pthreads.
- `tcp-relay.cjs` is `.cjs` on purpose: `framework/net/package.json` is
  `type: module`, so a `.js` CommonJS relay would fail.

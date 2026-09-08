# wasm-jvm — OpenJDK 21 → WebAssembly, in the browser

A real **HotSpot Zero JVM** cross-compiled to `wasm32-unknown-emscripten` that runs
actual Java apps (Swing/AWT + Java2D, WebGL, real TCP networking) in the browser,
plus a **bytecode → WebAssembly JIT**, an **embeddable SDK**, and example apps.

> All documentation lives in this `docs/` folder. Each file below is a section of
> the whole; start here.

## Repository layout

```
wasm-jvm/
├── env.sh                 shared toolchain/config sourced by every build script
├── framework/             ══ the integration kernel / SDK (embed the VM in any app) ══
│   ├── wasmjvm.js         the SDK you import  →  docs/framework.md
│   ├── kernel/            launcher_web.c (JNI launcher) · wsps.c (WebSocket→POSIX sockets)
│   ├── build/             env-driven build system: build-jvm.sh · build-packs.sh
│   ├── net/               tcp-relay.cjs (DNS+multi-target) · relay.mjs (single-target)
│   └── server/            serve.mjs (COOP/COEP dev server for SharedArrayBuffer)
├── native/                ══ platform-port internals (how artifacts get native libs) ══
│   ├── awt/               Swing/AWT/Java2D → canvas: build-*.sh · overlays · stubs
│   └── gl/                WebGL/LWJGL/OpenAL: *.c · gen-*.py · relink-*.sh · test/
├── jit/                   ══ the JIT dev-kit (compiler itself lives in src/hotspot) ══
│   ├── reference/         jitc.c (C reference compiler) · spike.c (mechanism spike)
│   ├── bench/             *Diff / *Stress micro-benchmarks
│   ├── tools/             bootprobe.mjs · jitshot.mjs (headless Chrome harnesses)
│   └── jit-swing.html
├── examples/              ══ runnable apps (each drives framework/wasmjvm.js) ══
│   ├── poc/               flagship desktop PoC (Swing IDE + fetch-a-website)
│   ├── compile-run/       live in-VM javac (edit → compile → run)
│   ├── swing/             RealSwing · Ball · WindowApp · MiniBrowser
│   ├── minecraft/ · gl/   LWJGL / WebGL demos
│   └── snippets/          minimal framework-usage HTML pages
└── docs/                  ← you are here
```

The **JIT compiler itself** is in the JDK tree, not here:
`src/hotspot/share/interpreter/wasm/` (core, compiler, assembler, and runtime
sources + matching `.hpp`), hooked from `bytecodeInterpreter.cpp`. See [jit.md](jit.md).

## Documentation index

| Area | Docs |
|------|------|
| JDK-tree hook points (the port's footprint) | [jdk-touchpoints.md](jdk-touchpoints.md) |
| Embedding the VM (the SDK) | [framework.md](framework.md) |
| Networking (relays, socket proxy) | [networking.md](networking.md) |
| JIT compiler | [jit.md](jit.md) · [jit-milestones.md](jit-milestones.md) · [jit-bench.md](jit-bench.md) · [jit-runtime-completion.md](jit-runtime-completion.md) |
| AWT/Java2D native port | [native-awt-build.md](native-awt-build.md) |
| WebGL/LWJGL native port | [native-gl.md](native-gl.md) · [native-gl-test.md](native-gl-test.md) |
| Examples | [example-poc.md](example-poc.md) · [example-minecraft.md](example-minecraft.md) |

## Quickstart (the flagship PoC)

```bash
source wasm-jvm/env.sh                                   # toolchain + paths
PACKS=1 bash wasm-jvm/framework/build/build-jvm.sh awt   # link the default artifact
bash wasm-jvm/framework/build/build-packs.sh             # per-module JDK data packs
( cd build/<conf>/web && node serve.mjs )                # COOP/COEP dev server
# open  http://localhost:<port>/poc/index.html   (lazy module loading + JIT on)
```

Optional real networking (the demo can fetch a live website):

```bash
NODE_PATH=wasm-jvm/framework/net/node_modules node wasm-jvm/framework/net/tcp-relay.cjs 8114
# then open the PoC with ?net=1   (see networking.md)
```

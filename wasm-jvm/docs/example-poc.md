# Desktop PoC — run a Swing/AWT jar (or folder) in the browser

A working proof-of-concept that boots a **real OpenJDK-21 JVM (HotSpot Zero →
WebAssembly)** in a browser tab, renders an arbitrary **Swing/AWT** application to
a **full-viewport canvas**, and forwards **keyboard + mouse + wheel** as genuine
AWT events — no app-specific code baked in.

```
open  http://localhost:8130/poc/
```

## What it does

The launch card offers three paths:

- **▶ Select JAR(s)** — pick one or more application `.jar`s from disk. Their bytes
  are copied into the JVM filesystem under `/app/lib/`, and each goes on the classpath.
- **📁 Select folder** — pick a whole *exploded* app directory (an unpacked app:
  `lib/*.jar` + resources + loose `.class`es). Every file is written to
  `/app/user/<same relative path>` (structure preserved); the folder root, every
  subdirectory, and every jar go on the classpath.
- **Run bundled demo** — `demo-swing.jar`, a real Swing app (menu bar, toolbar
  click-counter, a typeable code editor, a drag-to-draw scribble panel) to verify
  the render + input pipeline end-to-end.
- **Main class** field — optional override (written to `/work/mainclass`), for apps
  whose main class isn't declared in a jar manifest (e.g. launched via a script).

The app fills the **entire browser viewport at its real pixel size** (the JVM's
virtual screen and the canvas are sized to `window.innerWidth × innerHeight`).

## Pieces

| File | Role |
|------|------|
| `poc/index.html` (served at `$BUILD/web/poc/`) | Full-viewport canvas + file/folder pickers; drives the `WasmJVM` SDK (`awt` tier). |
| `JarApp.java` → `launcher.jar` | The **generic driver** staged into the VM. Runs any jar/folder's `Main-Class`, then publishes frames and pumps input. |
| `wasmjvm.js` | The framework SDK (extended here with `app.files` = arbitrary staged files). |
| `demo/DemoSwing.java` → `demo-swing.jar` | The bundled sample Swing app. |

### `JarApp` — the generic driver (public API only, no `sun.awt`)

1. **Resolve the app**: read the full classpath from `/work/fullcp`, collect every
   jar (recursively) + directory, and pick the main class from
   `/work/mainclass` → first jar manifest `Main-Class`.
2. **Publisher thread** (~30 fps): snapshot every showing `java.awt.Window` into one
   viewport-sized RGBA buffer → `/work/frame.bin` (+ `/work/seq`). The page blits it.
3. **Input thread**: read new lines from `/work/ctrl` (the SDK's
   `"seq state a b"` wire format) from a persisted byte offset, translate to real
   `MouseEvent` / `MouseWheelEvent` / `KeyEvent`, and post them to the EDT so genuine
   listeners fire (`getDeepestComponentAt` → `dispatchEvent`).
4. **Maximizer**: stretch the app's top `Frame` to the full viewport.
5. Load the main class through a `URLClassLoader` over the whole classpath and invoke
   `main(String[])`; keep the process alive for the GUI.

## Build / run (the latest build)

```bash
source wasm-jvm/env.sh
# 1. rebuild the wasm libjvm after any src/hotspot change (picks up the JIT etc.)
make hotspot STATIC_LIBS=true CONF=emscripten-wasm32-zero-release
# 2. relink the artifact the PoC loads — PACKS=1 (empty .data; the modular packs are
#    the sole source). NET=1 additionally emits jvm-awt-net.js for ?net=1.
PACKS=1 bash wasm-jvm/framework/build/build-jvm.sh awt
NET=1 PACKS=1 bash wasm-jvm/framework/build/build-jvm.sh awt
# 3. (only if a JDK module or the demo/app changed) repackage the packs:
#    bash wasm-jvm/framework/build/build-packs.sh [module...]
# 4. serve $BUILD/web with COOP/COEP (required for SharedArrayBuffer / threads)
( cd $BUILD/web && node serve.mjs )    # http://localhost:8130/poc/index.html
# 5. optional networking: node wasm-jvm/framework/net/tcp-relay.cjs 8114  (then ?net=1)
```

The PoC drives a **PACKS=1** artifact (empty `.data`) plus the modular `packs/` with
**lazy-FS on by default**: only a small Swing boot set is downloaded, the rest fetched
on first touch. (A *monolithic* `.data` would double-stage module paths already
provided by packs and throw `mknod` EEXIST — packs and monolithic are mutually
exclusive.) JIT is on by default; ineligible methods interpret (mixed-mode is always
correct).

### Fresh every run (caching)

The artifact `.js` and its `.wasm`/`.worker.js` siblings are fetched separately, so a
browser can otherwise pair a **fresh `.js` with a stale cached `.wasm`** from an earlier
build — a `LinkError` (e.g. *"import emscripten_websocket_close … requires a callable"*).
The SDK prevents this by tagging every artifact URL with a **per-page-load version token**
(`RUNTIME_LOAD_ID`), so each run loads a consistent, fresh set and starts from scratch;
the token is stable within a page so repeated Runs still hit the cache. Override with
`runtime.cacheBust: false` (disable) or a fixed string (pin to a build for cross-run
caching). The dev server (`serve.mjs`) also sends `Cache-Control: no-cache`. If you ever
see a stale-artifact `LinkError`, just reload — the new page-load token re-fetches a
matching set. (After a rebuild, redeploy `wasmjvm.js` to `$BUILD/web/{,poc/}`.)

## Known limits (current runtime stage)

- **Performance.** Code runs in HotSpot **Zero**, with the bytecode→wasm JIT on by
  default (it now covers all primitive types, the object model, virtual/interface
  calls, exceptions, and synchronization — see `jit.md`). There is **no OSR/tiering
  yet**, so a method only JITs at entry: long loops that began interpreting stay
  interpreted (C5). Steady-state is still largely interpreter-bound for Swing.
- **The launcher classpath caps at ~900 bytes** (`launcher_web.c`), so the *full*
  app classpath is passed to `JarApp` via `/work/fullcp` instead; the launcher's own
  classpath is a short bootstrap that just loads `JarApp`.
- **Big folders** are read fully into memory then into MEMFS — fine for moderate
  apps, heavy for hundreds of MB.
- **IntelliJ-scale apps won't boot** yet (modules/native breadth beyond current
  coverage). The pipeline is generic; moderate Swing apps are the realistic target.
- The virtual screen is fixed once at boot to the viewport size; live window resize
  isn't reflowed (would need dynamic `WasmGraphicsEnvironment` screen resize).

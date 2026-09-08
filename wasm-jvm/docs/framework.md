# WasmJVM — integration kernel for the OpenJDK-21 → WebAssembly runtime

Embed a real JVM in any web app and run Java — from a **jar**, from **source
compiled at runtime**, or a **main class** already on the classpath — with
**networking**, **persistent storage**, and **viewport/rendering** (Swing/AWT and
WebGL) all configured declaratively.

```js
import { WasmJVM } from './wasmjvm.js';

const jvm = new WasmJVM({
  app: { source: 'public class Main { public static void main(String[] a){ System.out.println("hi from wasm"); } }' },
  onStdout: line => console.log(line),
});
await jvm.start();
```

## Architecture (three layers)

```
Host app  ──►  WasmJVM (wasmjvm.js)         the SDK you import
                    │  writes /work/* control files, wires canvas + input,
                    │  mounts IDBFS, connects the socket bridge
                    ▼
              jvm-<tier>.js (+ .wasm/.data/.worker.js)   the runtime artifact
                    │  JDK 21 + HotSpot Zero + native libs, baked in
                    ▼
              launcher_web.c   the kernel: reads /work/*, builds JVM options,
                               creates the VM, invokes main(String[])
```

Nothing app-specific is baked into an artifact — the launcher reads its whole
configuration at run time from small files under `/work`, so **one artifact hosts
any app**.

## Capability tiers (many small artifacts)

Distribution has **two independent axes** — a small **native core** (the code) and
shared **data packs** (the JDK files). The SDK selects both automatically.

### Native cores (the code)
Pick the smallest tier that covers what you need; the `.wasm` is only a few MB
because the JDK files live in packs, not baked in.

| Tier | Artifact | Adds | Runs | ~wasm |
|------|----------|------|------|-------|
| `base` | `jvm-base.js` | java.base natives | plain Java, in-VM `javac`, jars | 6 MB |
| `awt`  | `jvm-awt.js`  | libawt + fontmanager | Swing/AWT/Java2D → canvas | 8 MB |
| `gl`   | `jvm-gl.js`   | GL1→WebGL translator + LWJGL | WebGL, LWJGL, Minecraft | 9 MB |
| `net`  | `jvm-net.js`  | corrected socket proxy (`wsps.c`) | real TCP/HTTP (needs a relay) | 9 MB |

`gl` is a superset of `awt`. **`net` is separate**: real sockets require
`-sPROXY_POSIX_SOCKETS`, which rewires every socket and conflicts with the WebGL
build's NIO self-pipe — so networking + Minecraft can't share one binary. All
tiers export the **same factory** `createJVM`, so the SDK is tier-agnostic.

### Data packs (the JDK files, shared + cached)
The JDK files are split into composable packs the SDK fetches on demand and
mounts into the filesystem before boot — **browser-cached, so `java.base` is
downloaded once across every tier and every app**, not baked into each artifact.

| Pack | Contents | ~size | Loaded when |
|------|----------|-------|-------------|
| `core`     | java.base + boot support + framework `/app` | 28 MB | always |
| `compiler` | jdk.compiler + friends | 8 MB | compiling source, or `jdk.compiler` requested |
| `desktop`  | java.desktop + fonts | 32 MB | any Swing/AWT/WebGL (`awt`/`gl` tier) |

So a CLI app downloads `jvm-base.wasm` (6 MB) + `core` (28 MB); a Swing app adds
`desktop`; a second app on the same origin re-uses the cached `core`/`desktop`
and only fetches its ~8 MB `.wasm`.

The SDK derives packs from the config; override with `runtime.packs: ['core',…]`
and point at them with `runtime.packsPath` (default: `packs/` next to the artifact).
It also composes `--add-modules` to match the loaded packs, so the boot layer
never asks for a module that wasn't fetched.

Build: `framework/build/build-packs.sh` (the packs, once) and
`PACKS=1 framework/build/build-jvm.sh <base|awt|gl|net>` (the data-less cores). Omit
`PACKS=1` for a single monolithic artifact with everything baked in.

## Initializing the JVM (host requirements)

1. **Serve the artifacts** (`jvm-<tier>.js`, `.wasm`, `.worker.js`) **and the
   `packs/` directory** (`core.data`, `desktop.data`, … + their `.metadata`), with
   **cross-origin isolation** — the wasm build uses threads (`SharedArrayBuffer`),
   which the browser only allows under:
   ```
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Embedder-Policy: require-corp
   ```
   (`framework/server/serve.mjs` sets these.)
2. **Import the SDK** (`wasmjvm.js`, an ES module, zero deps) and call `start()`.
3. Point `runtime.basePath` at the directory serving the artifacts (default: same
   dir as the page).

Under **Node**, artifacts load via `require`; for networking set
`globalThis.WebSocket = require('ws')` before `start()`.

## Integrating in your app (end-to-end)

### 1. Build the pieces (once)
From a configured JDK-wasm build (`$BUILD` = `build/emscripten-wasm32-zero-release`):
```bash
cd wasm-jvm/framework/build
bash build-packs.sh                     # → $BUILD/web/packs/{core,compiler,desktop}.data(+.metadata)
PACKS=1 bash build-jvm.sh base          # → $BUILD/web/jvm-base.{js,wasm,worker.js}
PACKS=1 bash build-jvm.sh awt           # (build only the tiers you deploy)
PACKS=1 bash build-jvm.sh gl
PACKS=1 bash build-jvm.sh net
```

### 2. Deploy this layout to your web server
Everything is static. Put the SDK, the core(s) you need, and the `packs/` dir under
one directory (say `/jvm/`), plus your app's jars:
```
/jvm/
  wasmjvm.js                 the SDK (import this)
  jvm-awt.js  jvm-awt.wasm  jvm-awt.worker.js     one core per tier you use
  jvm-gl.js   …                                    (base / awt / gl / net)
  packs/
    core.data      core.data.metadata             java.base + boot + /app  (always)
    compiler.data  compiler.data.metadata          jdk.compiler            (compiling)
    desktop.data   desktop.data.metadata           java.desktop + fonts    (GUI)
  app.jar                     your application jar(s)
```
`.data`/`.wasm` are large and immutable — serve them with long cache lifetimes so
`core.data` is fetched once and reused across visits and apps.

### 3. Serve with cross-origin isolation
The runtime uses threads, so the server **must** send:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
(Any static host works — nginx/Apache/CDN/Workers — as long as it sets these two
headers. `wasm-jvm/framework/server/serve.mjs` is a 15-line reference.)

### 4. Embed in a page
```html
<script type="module">
import { WasmJVM } from '/jvm/wasmjvm.js';
await new WasmJVM({
  runtime: { basePath: '/jvm/' },        // finds the core + packs/ here
  app: { mainClass: 'com.example.App', jars: ['/jvm/app.jar'] },
  render: { canvas: '#screen', viewport: 'fill', mode: 'awt', input: true },
  onStdout: console.log,
}).start();
</script>
```
That's the whole integration: the SDK picks the tier, fetches only the packs this
config needs (here `core` + `desktop`), mounts them, and runs your jar. No build
step per app, no server-side code.

### Recipes by app type
| App | tier (auto) | packs fetched | notes |
|-----|-------------|---------------|-------|
| CLI / compute jar | `base` | core | no `render` block |
| Compile & run source | `base` | core + compiler | `app.source` instead of `jars` |
| Swing / AWT GUI | `awt` | core + desktop | `render.mode:'awt'` |
| OpenGL / LWJGL / game | `gl` | core + desktop | `render.mode:'gl'` |
| Networking (HTTP/sockets) | `net` | core (+compiler) | `network.enabled` + run `tcp-relay.cjs` |

You never name packs or tiers — they follow from `app`, `render`, and `network`.
Override only if you want to: `runtime.tier`, `runtime.packs`, `runtime.packsPath`.

## Configuration reference

```js
new WasmJVM({
  // ── which artifact ──────────────────────────────────────────────
  runtime: '/jvm-gl.js',            // explicit URL, OR:
  runtime: { basePath: '/jvm/', tier: 'gl' },   // dir + optional forced tier
                                    // (omit entirely → SDK auto-selects the tier)

  // ── the application (mix as needed) ─────────────────────────────
  app: {
    mainClass: 'com.example.Main',  // class to run (default Hello)
    args: ['--flag', 'value'],      // → main(String[])
    jars: [                         // staged into MEMFS before launch:
      '/libs/app.jar',              //   URL
      { path: '/app/mc/client.jar', url: '/mc/client.jar' },  // URL → explicit path
      { name: 'x.jar', bytes: uint8 },                        // in-memory bytes
    ],
    classpath: ['/app', '/app/lib'],// default: /app + dirs of staged jars
    source: 'public class Main{...}',// OR compile+run this (mainClass becomes Runner)
    uselib: '/app/springlib',       //   extra classpath dir for the compiler
  },

  // ── viewport / rendering ────────────────────────────────────────
  render: {
    canvas: '#screen',              // element or selector (created if omitted)
    width: 854, height: 480,        // render-buffer resolution (see viewport below)
    mode: 'gl',                     // 'gl' | 'awt' | 'headless'
    viewport: 'fill',               // 'fill' = occupy the whole browser window
    fit: 'contain',                 // 'contain' letterboxes · 'fill' stretches
    input: true, mousemove: true,   // bind mouse + keyboard → JVM
  },

  // ── networking (net tier) ───────────────────────────────────────
  network: { enabled: true, relay: 'ws://localhost:8114/' },

  // ── persistent storage (IndexedDB via IDBFS) ────────────────────
  storage: { enabled: true, mount: '/home/web_user', flushMs: 4000 },

  // ── JVM tuning ──────────────────────────────────────────────────
  addModules: ['java.desktop', 'jdk.compiler'],
  vmOptions:  ['-Xmx256m', '-Dfoo=bar'],

  // ── lifecycle / IO ──────────────────────────────────────────────
  onStdout: line => {}, onStderr: line => {}, onExit: code => {}, onReady: () => {},
});
```

### Methods
- `await start()` — boot the VM and run the app.
- `send(ev)` — inject input: `{type:'key',keyCode,charCode}` · `{type:'pointer',state,x,y}` · `{type:'wheel',dy}`.
- `writeFile(path, bytes)` / `readFile(path, opts)` — MEMFS access.
- `await syncStorage()` — flush persistent storage to IndexedDB now.
- `stop()` — stop the render loop and flush storage.

## The three ways to run an app

**A jar** — stage it and name its main class:
```js
new WasmJVM({ app: { mainClass: 'com.acme.App', jars: ['/apps/acme.jar'] } });
```

**Source compiled at runtime** — uses the bundled `Runner` (in-VM `javac`); extra
libraries can be added with `uselib` (their jars are exploded onto the classpath):
```js
new WasmJVM({ app: { source: mySource, uselib: '/app/springlib' },
              addModules: ['jdk.compiler','java.compiler','jdk.zipfs','jdk.internal.opt'] });
```

**A class already on the classpath** (baked into `/app` at build time):
```js
new WasmJVM({ app: { mainClass: 'Ball' }, render: { mode: 'awt', canvas: '#c' } });
```

### Whole-browser viewport

Set `render.viewport: 'fill'` and the canvas occupies the entire window
(`position:fixed; inset:0`), tracking window resizes automatically. `render.width/
height` (the render-buffer resolution) default to the window size; the app owns its
internal resolution and `fit` scales that buffer to the viewport (`'contain'`
letterboxes, `'fill'` stretches edge-to-edge).

```js
new WasmJVM({
  runtime: { basePath: '/', tier: 'gl' },
  app: { mainClass: 'MCLaunch', jars: [ /* … */ ] },
  render: { canvas: '#screen', viewport: 'fill', mode: 'gl', input: true },
});
```

## Swing / AWT and WebGL

Both are the same idea — pick `render.mode`:
- **`awt`** — the app draws with AWT/Java2D/Swing; the runtime blits CPU frames to
  a 2-D canvas. Mouse/keyboard are forwarded. (`jvm-awt.js` or `jvm-gl.js`.)
- **`gl`** — the app (LWJGL/Minecraft) renders with OpenGL; the GL1→WebGL
  translator commits frames straight to the canvas (id `glsurface`). (`jvm-gl.js`.)
- **`headless`** — no canvas; stdout only.

## Networking

Real TCP is tunneled over one WebSocket to a native relay that does the actual
sockets + DNS. Requires the `net` tier and a running relay:
```bash
node wasm-jvm/framework/net/tcp-relay.cjs 8114
```
```js
new WasmJVM({ app: { source: httpDemo }, network: { enabled: true, relay: 'ws://localhost:8114/' } });
```
See [networking.md](networking.md) for the wire protocol and the relay.

## Persistent storage

`storage.enabled` mounts IndexedDB (via IDBFS) at `storage.mount`
(default `/home/web_user`, the JVM's `user.home`), hydrates it on boot, and flushes
periodically + on page unload. Call `syncStorage()` to flush on demand. This is
what lets Minecraft worlds and app files survive reloads.

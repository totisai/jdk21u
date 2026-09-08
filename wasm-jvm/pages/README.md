# OpenJDK 21 on WebAssembly — GitHub Pages app

A static site that runs OpenJDK 21 (HotSpot Zero + bytecode→wasm JIT) entirely in
the browser. Both demos boot and run client-side — no server.

- **`repl.html`** — live `javac` REPL: edit Java, compile it with the in-VM
  compiler, and run it. The VM stays **warm** — a resident `ReplServer` driver
  (`framework/kernel/ReplServer.java`, baked into `/app`) loops on a `/work/req`
  counter, so the first run boots (~5s) and later runs are ~1s.
- **`swing.html`** — a Swing/Java2D app rendered onto an HTML canvas by the JVM's
  AWT peers. Boots in ~2s.
- **`gl.html`** — a 3D/WebGL demo: Java issues OpenGL calls through JNI, a GL→WebGL
  translator renders a spinning triangle to a canvas (the Minecraft-port path).
- **`integrate.html`** — integration guide: how to embed the JVM in your own app.
- **`index.html`** — landing page linking everything.

The Swing and 3D pages use the framework's reusable `jvm/screen.js` (`Screen`) to
present frames AND forward mouse/keyboard to the running app over `/work/ctrl`.

## What's here

```
index.html repl.html swing.html   the pages
assets/site.css                    shared styles
coi-serviceworker.js               injects COOP/COEP so SharedArrayBuffer works on Pages
jvm/jvm-base.* + jvm-base.data.gz  REPL runtime (has jdk.compiler + the Runner driver)
jvm/jvmawt.*   + jvmawt.data.gz    Swing runtime (AWT/Java2D)
build-pages-assets.sh              regenerates jvm/ from a local wasm build
```

Each page loads its bundle directly, decompresses the gzipped `.data` with
`DecompressionStream`, and hands the bytes to the runtime via
`Module.getPreloadedPackage`. Cross-origin isolation (required for the JVM's wasm
threads) is established at runtime by `coi-serviceworker.js`, so this works on
GitHub Pages despite Pages not setting COOP/COEP headers. Both demos verified
booting and running in Chrome.

## The FFI fix (why a patch step exists)

emsdk 3.1.45 with the current hoodmane libffi emits an `ffi_call_js` that marshals
64-bit values through `BigInt64Array` (`HEAPU64`), assuming 8-byte-aligned cif
slots. On wasm32 those slots are 4-byte aligned, so every `i64` native call
mismarshals and boot **deadlocks at `JNI_CreateJavaVM`**. The variant that works
reads the halves via `HEAPU32` and rebuilds the BigInt. `build-pages-assets.sh`
copies that known-good `ffi_call_js` into `jvm-base.js` after linking. The proper
fix is to rebuild libffi so it emits the aligned variant.

## Publishing to GitHub Pages

`.github/workflows/pages.yml` uploads this folder (Pages source = "GitHub
Actions"). Enable it under **Settings → Pages → Source: GitHub Actions**, then
push. The committed `jvm/` assets make the published site work out of the box.

## Rebuilding the assets

`./build-pages-assets.sh` regenerates `jvm/` from `build/.../web/{jvmawt,jvm-base}.*`
(produced by `framework/build/build-jvm.sh awt` / `build-jvm.sh base`), applying
the FFI patch. Raw uncompressed `.data` files are gitignored; the `.gz` are committed.

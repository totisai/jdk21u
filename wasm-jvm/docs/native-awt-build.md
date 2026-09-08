# Building the wasm AWT/Swing JVM (`jvm-awt.js`)

This directory builds a **monolithic HotSpot Zero JVM for `wasm32-unknown-emscripten`
with AWT/Java2D + Swing**, rendering to an HTML `<canvas>`. It powers the demos in
`index.html` (shapes, text, interactive ball, a windowed app with keyboard, and a
Swing HTML browser).

Everything here layers on top of the base JDK→wasm port — see
[jdk-touchpoints.md](jdk-touchpoints.md) for the VM port's footprint in the JDK tree.

> The scripts are driven by **`env.sh`** — edit it to match your machine. It sets
> `JDK`, `BUILD`, `EMSDK_ENV` (Emscripten 3.1.45), `FFI` (libffi.a for wasm),
> `BOOT` (a JDK 21 that compiles the overlays), and `BOOTMODS` (a throwaway copy
> of the boot JDK's exploded modules we overlay patched classes into).

## Prerequisites (produced by the base port)

- **Emscripten 3.1.45** SDK (`$EMSDK_ENV`). `emcc`, `llvm-nm` on PATH after sourcing.
- **libffi** cross-compiled for wasm32 → `$FFI/lib/libffi.a`.
- **A configured JDK build** at `$BUILD` (`emscripten-wasm32-zero-release`) with the
  java.base native static objects and the Zero `libjvm` objects built
  (`support/native/java.base/*/static/*.o`, `hotspot/variant-zero/libjvm/objs/static/*.o`).
- **Boot JDK 21** (`$BOOT`) to compile the Java overlay classes.
- **`$BOOTMODS`** — exploded boot `java.desktop`/`java.base`/`java.datatransfer`/
  `java.prefs`/`java.xml`. Our target's `java.desktop` doesn't fully compile, so we
  ship the boot JDK's classes and overlay a handful of patched ones on top.
- freetype + harfbuzz come from **Emscripten ports** (`-sUSE_FREETYPE=1
  -sUSE_HARFBUZZ=1`) — no manual cross-compile.
- Node with the `ws` package (for the optional networking relay under Node).

## The pieces we add to a stock java.desktop

**Java overlays** — `src/java.desktop/emscripten/classes/sun/awt/`, compiled by
`build-overlays.sh` into `$BOOTMODS/java.desktop`:
- `PlatformGraphicsInfo` — platform hook (non-headless; returns our GE + Toolkit).
- `WasmGraphicsEnvironment` / `WasmGraphicsDevice` / `WasmGraphicsConfiguration`
  — a single virtual screen so real windows can exist.
- `WasmToolkit` (extends `SunToolkit`) — real toolkit; window-peer factory.
- `WasmWindowPeer` — a `FramePeer` that paints into a shared screen buffer.
- `WasmKeyboardFocusManagerPeer` — trivial focus peer.

**Patched boot classes** (applied as overlays, see `overlays/`):
- `CFontManager` (`overlays/CFontManager.patch`) — map logical fonts to the bundled
  Roboto and let `cloneStyledFont` alias freetype file fonts (macOS CFont-only otherwise).
- `OperatingSystem` + `PlatformProps` (java.base) — the enum has no `EMSCRIPTEN`
  and the OS string is inlined, so we recompile them mapped to `macos`.
  (These java.base overlays are dropped into `jdk/modules/java.base` in `$BUILD`.)

**Native stubs** — `awt_headless_stubs.c`: empty `initIDs` for the AWT component/
event classes, `CFontManager` CoreText no-ops, `Font.initIDs`, `closeSplashScreen`.

**Fonts** — `Roboto-Regular.ttf` (Apache-2.0) at `$BUILD/jdk/lib/fonts/Roboto.ttf`
+ a minimal `fontconfig.properties` (this dir) at `$BUILD/jdk/lib/`, selected via
`-Dsun.awt.fontconfig=` in `launcher_web.c`.

## Build order

```bash
cd wasm-jvm/native/awt

# 0. one-time: fonts + fontconfig in the image
mkdir -p "$BUILD/jdk/lib/fonts"
cp <roboto>/Roboto-Regular.ttf "$BUILD/jdk/lib/fonts/Roboto.ttf"
cp fontconfig.properties "$BUILD/jdk/lib/fontconfig.properties"

# 1. JNI headers for java.desktop (bypasses the make X11 transitive-compile issue)
bash gen-headers.sh

# 2. native libraries  ->  $BUILD/awtobj/  and  $BUILD/fontobj/
bash build-libawt.sh          # libawt (shapes/Java2D loops) + unix initIDs/awt_Mlib
bash build-mlib-headless.sh   # libmlib_image + libawt_headless
bash build-fontmanager.sh     # libfontmanager against the freetype/harfbuzz ports

# 3. Java overlays -> $BOOTMODS ; native stubs + symtab
bash build-overlays.sh
bash rebuild-stubs.sh         # compiles awt_headless_stubs.c + regenerates symtab.o

# 4. app classes into $BUILD/web/app  (compiled with the boot JDK, --release 21)
"$BOOT/bin/javac" --release 21 -d "$BUILD/web/app" awtprobe/*.java

# 5. link the monolithic JVM
bash relink.sh                # -> $BUILD/web/jvm-awt.js (+ .wasm + .data)
```

After changing:
- **an overlay class** → `build-overlays.sh` then `relink.sh`.
- **a native stub / any *obj** → `rebuild-stubs.sh` then `relink.sh`.
- **an app class** (`awtprobe/*.java`) → recompile it into `web/app` then `relink.sh`.
- **native font/awt sources** → the relevant `build-*.sh`, then `rebuild-stubs.sh`
  (the symtab must pick up new `Java_*`), then `relink.sh`.

## Run

```bash
cd "$BUILD/web"
node serve.mjs            # static server with COOP/COEP (pthreads need cross-origin isolation)
# open http://localhost:8130/  and pick a template
```

**Networking (the HTML browser's real-URL fetch):** the link includes the
WebSocket→POSIX-socket bridge (`wsps.c`, `-sPROXY_POSIX_SOCKETS -lwebsocket.js`,
`--wrap=read/write/close/readv/writev`). Start the relay and it works for plain
`http://`:

```bash
node wasm-jvm/framework/net/tcp-relay.cjs 8114
```

The demo writes `ws://localhost:8114/` to `/work/bridge`; `launcher_web.c` connects
it before Java runs. HTTPS (e.g. google.com) needs the `cacerts` truststore
packaged and won't render in JEditorPane regardless — plain `http://` pages only.

## Key link flags (why they're there)

| flag | reason |
|---|---|
| `-sPROXY_TO_PTHREAD -pthread` | run the VM off the browser main thread |
| `-sINITIAL_MEMORY=1536MB -sSTACK_SIZE=8MB` | heap for the JVM + AWT |
| `-sWASM_BIGINT` | i64 across the JS boundary (libffi) |
| `-sERROR_ON_UNDEFINED_SYMBOLS=0` | tolerate the few unreferenced native stubs |
| `-sMODULARIZE -sEXPORT_NAME=createJVM -sEXPORTED_RUNTIME_METHODS=FS,callMain` | JS factory + MEMFS access |
| `-sUSE_FREETYPE=1 -sUSE_HARFBUZZ=1` | text rendering |
| `-sPROXY_POSIX_SOCKETS -lwebsocket.js` + `--wrap=*` + `wsps.c` | TCP over a WebSocket relay |
| `--preload-file …@/jdk/…` | the exploded JDK modules + tzdb/jvm.cfg/fonts/app into MEMFS |

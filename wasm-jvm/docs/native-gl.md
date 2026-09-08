# WebGL from the wasm JVM

Proof that the wasm HotSpot JVM can drive **WebGL**: `GLDemo.java` declares native
methods; `wgl.c` implements them as JNI shims over **Emscripten GL (GLES2)** →
a real WebGL context on a worker-owned OffscreenCanvas. It draws a spinning
triangle (modern shader + VBO), `glReadPixels` copies the frame into a Java
`byte[]`, and the app publishes it to `/work/frame.bin` — the browser blits it
through the same pixel→canvas pipeline used for the Java2D demos (no OffscreenCanvas
*presentation*, which is fragile under `PROXY_TO_PTHREAD`).

## Build & run

    bash wasm-jvm/native/gl/relink-gl.sh          # -> build/.../web/jvmgl.js (+ .wasm + .data)
    cd build/.../web && node serve.mjs      # then open http://localhost:8130/
    # pick the "WebGL: spinning triangle (PoC)" template

Key link flags (vs the AWT build): `-lGL -sOFFSCREENCANVAS_SUPPORT=1
-sOFFSCREENCANVASES_TO_PTHREAD='#glsurface'`. The page has a hidden
`<canvas id="glsurface">` that Emscripten transfers to the JVM's worker for the
GL context. The GL variant uses its own factory `createJVMGL` and its own symtab
(includes the `Java_GLDemo_*` natives + `JNI_OnLoad_wgl`).

## Confirmed working (in-browser)

    [wgl] create_context(#glsurface) -> handle=<nonzero>
    [wgl] GL_VERSION=OpenGL ES 2.0 (WebGL 1.0 (OpenGL ES 2.0 Chromium)), RENDERER=WebKit WebGL
    [wgl] program+vbo ready
    -> a spinning, colour-interpolated triangle on the canvas.

## Toward Minecraft

Old Minecraft (1.x) uses **immediate-mode / fixed-function OpenGL 1.x**
(`glBegin`/`glVertex`, display lists, matrix stack). WebGL has none of it.
Emscripten's `-sLEGACY_GL_EMULATION=1` synthesizes it over WebGL, but in this setup
it currently crashes on the first call (`Cannot read properties of null`) — the
emulation path needs debugging, or MC's renderer would need translating to modern
GL. The pipeline proven here (JVM→WebGL) is the foundation either way. LWJGL's
`Display`/`Keyboard`/`Mouse` also need an "Emscripten platform" fork (the
`LinkageError: Unknown platform: Emscripten` from the Minecraft experiment).

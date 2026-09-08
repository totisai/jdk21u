# Minecraft experiment jar

The Minecraft `client.jar` is **not** committed (proprietary). Download it and
place it at `$BUILD/web/app/mc/client.jar` so the `/app` preload picks it up:

    curl -L "https://piston-data.mojang.com/v1/objects/4a2fac7504182a97dcbcd7560c6392d7c8139928/client.jar" \
      -o "$BUILD/web/app/mc/client.jar"

`MCLaunch.java` loads it via a URLClassLoader and tries to launch
`net.minecraft.client.Minecraft`. The wasm JVM loads and links Minecraft's own
bytecode (1109 classes) fine, then fails at `org/lwjgl/LWJGLException` — Minecraft
renders and reads input through **LWJGL/OpenGL**, not AWT/Java2D, so it cannot
draw to the canvas. This is the honest boundary of a Java2D-only wasm JVM.

## Optional: add the LWJGL jar to move the wall

Drop LWJGL 2's jar next to client.jar to prove the point — the class wall
disappears but the *native* wall appears:

    curl -L "https://repo1.maven.org/maven2/org/lwjgl/lwjgl/lwjgl/2.9.3/lwjgl-2.9.3.jar" \
      -o "$BUILD/web/app/mc/lwjgl.jar"

MC also uses `org.lwjgl.util.glu.GLU` (perspective/ortho helpers), which lives in
the separate LWJGL utility jar — add it too:

    curl -L "https://repo1.maven.org/maven2/org/lwjgl/lwjgl/lwjgl_util/2.9.3/lwjgl_util-2.9.3.jar" \
      -o "$BUILD/web/app/mc/lwjgl_util.jar"

The wasm LWJGL backend (`wasm-jvm/native/gl/`) then carries MC through platform
detection, native load, `Display.create()`, and full GL capability init.
Rebuild jvmgl (`wasm-jvm/native/gl/relink-gl.sh`) after adding/removing jars — the
`/app` preload is baked into `jvmgl.data` at link time.

Result: `net.minecraft.client.Minecraft` and `org.lwjgl.opengl.Display` now load,
but `org.lwjgl.Sys` (which `System.loadLibrary("lwjgl")`s the native) fails with
`LinkageError: Unknown platform: Emscripten` — LWJGL can't even name a native for
wasm. A real port needs LWJGL's native recompiled to wasm calling Emscripten GL,
plus legacy fixed-function-GL emulation over WebGL for MC 1.x's immediate-mode
rendering. MCLaunch auto-includes every *.jar in this dir.

# JDK-tree touch points — the port's footprint outside `wasm-jvm/`

The `wasm-jvm/` reorg only moved the *platform* code (SDK, native build, JIT dev-kit,
examples). The **hook points inside the JDK source tree cannot move** — they live where
they integrate with HotSpot, java.base, java.desktop, and the build. This file is the
index of every one of them, so the port's JDK footprint is reviewable (for rebasing
onto a newer JDK, or upstreaming).

Authoritative and regenerable — everything below is the diff vs the GA base:

```bash
git diff --name-status jdk-21.0.5-ga..HEAD -- src make | grep -v wasm-jvm/
```

As of this writing: **23 new files + 37 modified upstream files = 60 touch points.**

---

## The JIT compiler (the headline addition)

| File | Role |
|------|------|
| `src/hotspot/share/interpreter/wasm/` (new subtree: `core/wasmJit.cpp`, `compiler/wasmCompiler.cpp`, `compiler/wasmResolver.cpp`, `assembler/wasmAssembler.cpp`, `assembler/wasmBytecodes.cpp`, `wasmRuntime.cpp`) | the whole baseline bytecode→wasm JIT — see [jit.md](jit.md) for its internal structure |
| matching `.hpp` headers in `src/hotspot/share/interpreter/wasm/` (new) | public interface (`compiled_entry` / `describe` / `invoke`) |
| `src/hotspot/share/interpreter/zero/bytecodeInterpreter.cpp` (mod) | **the hook**: at `method_entry`, calls `WasmJit::compiled_entry` and runs the wasm instead of interpreting |
| `src/hotspot/share/runtime/javaThread.{hpp,cpp}` (mod) | per-thread `_wasmjit_oops` shadow stack so JIT'd code's object refs are GC-visible |

## New emscripten platform layers (drop-in `*/emscripten/classes` overlays)

The build selects these via `--with-source-directory`-style module overlays; nothing
upstream is edited.

**java.base — NIO / filesystem (8):** `sun/nio/ch/{DefaultAsynchronousChannelProvider,
DefaultPollerProvider,DefaultSelectorProvider,FileDispatcherImpl}` ·
`sun/nio/fs/{DefaultFileSystemProvider,EmscriptenFileSystem,EmscriptenFileSystemProvider,
EmscriptenFileStore}` — a MEMFS-backed NIO provider (no real poll/async syscalls).

**java.desktop — AWT/Java2D peer layer (11):** `sun/awt/{WasmToolkit,WasmWindowPeer,
WasmGraphicsEnvironment,WasmGraphicsDevice,WasmGraphicsConfiguration,WasmSurfaceManagerFactory,
WasmKeyboardFocusManagerPeer,PlatformGraphicsInfo,PostEventQueue}` · Windows-L&F stubs
`com/sun/java/swing/plaf/windows/{WindowsLookAndFeel,WindowsTreeUI}` — Swing/Java2D
rendered to a canvas framebuffer.

**jdk.internal.le (1):** `jdk/internal/org/jline/terminal/impl/jna/JDKNativePty.java` — pty stub.

**native header (1):** `src/java.desktop/emscripten/native/include/machine/endian.h`.

## Modified upstream files, by subsystem (37)

**Build system (8)** — target detection, flags, static-libjvm, headless/desktop libs:
`make/autoconf/{platform.m4,flags-cflags.m4,libraries.m4,lib-freetype.m4}` ·
`make/hotspot/lib/CompileJvm.gmk` · `make/modules/java.base/lib/CoreLibraries.gmk` ·
`make/modules/java.desktop/Java.gmk` · `make/common/modules/LauncherCommon.gmk`.

**HotSpot OS / platform layer (10)** — emscripten under the bsd_zero port (threads, time,
memory, no attach/perf, ELF stack decode):
`os/bsd/{os_bsd,osThread_bsd,attachListener_bsd,os_perf_bsd}.cpp` ·
`os/posix/os_posix.cpp` · `os_cpu/bsd_zero/os_bsd_zero.cpp` ·
`share/runtime/{os.cpp,safepointMechanism.cpp}` ·
`share/utilities/{decoder_elf.cpp,elfFile.hpp}`.

**HotSpot classfile / core (3)** — STATIC_BUILD bypasses + single-thread-safe container:
`share/classfile/{classLoader.cpp,verifier.cpp}` · `share/utilities/concurrentHashTable.hpp`.

**java.base — native + classes (14)** — OS detection, no-subprocess, socket/NIO/net stubs
for a syscall-less sandbox:
`share/classes/jdk/internal/util/OperatingSystem.java` ·
`unix/classes/java/lang/ProcessImpl.java` ·
`unix/classes/sun/nio/fs/UnixConstants.java.template` ·
`share/native/libjava/jio.c` · `share/native/libjli/jli_util.h` ·
`unix/native/libjava/{TimeZone_md.c,jni_util_md.c}` ·
`unix/native/libnet/{NetworkInterface.c,portconfig.c}` ·
`unix/native/libnio/ch/{Net.c,UnixDispatcher.c}` ·
`unix/native/libnio/fs/UnixNativeDispatcher.c`.

**jdk.net (1):** `share/classes/jdk/net/ExtendedSocketOptions.java` — options no-op'd.

---

## Conventions

- Prefer an `#ifdef __EMSCRIPTEN__` guard in an upstream file over a fork, and a
  `*/emscripten/classes` **overlay** over editing a shared Java class, so the diff vs
  upstream stays minimal and rebaseable.
- Find all guarded sites: `grep -rIl "__EMSCRIPTEN__" src` (plus the files above that
  branch on `STATIC_BUILD` or platform macros).
- When you add or remove a JDK-tree hook, update this file (it is the porting summary
  for the JDK tree — the `docs/native-*` files cover only the native library builds).

# wasm-jvm

OpenJDK 21 (HotSpot Zero) cross-compiled to WebAssembly — a real JVM that runs
Swing/AWT, WebGL, and networked Java apps in the browser, with a bytecode→wasm
JIT and an embeddable SDK.

**All documentation is in [`docs/`](docs/README.md).** Start there for the
repository layout, the SDK guide, the JIT, the native port, and the examples.

Quick map: [`framework/`](framework/) is the SDK + build system, [`native/`](native/)
is the AWT/GL port internals, [`jit/`](jit/) is the JIT dev-kit (the compiler itself
is the subtree `src/hotspot/share/interpreter/wasm/`), and [`examples/`](examples/) holds
the runnable apps.

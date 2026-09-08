# OpenJDK 21 → WebAssembly (this fork)

This fork compiles the **HotSpot Zero VM to WebAssembly** and adds an
**interpreter-level bytecode → WebAssembly JIT for Java 21**: hot methods are
translated to a fresh wasm module at run time and called in place of interpretation.
The result runs real Java — Swing/AWT via Java2D, WebGL, and TCP networking —
entirely client-side in the browser.

- Code & docs: [`wasm-jvm/`](wasm-jvm/) · the JIT internals in [`wasm-jvm/docs/jit.md`](wasm-jvm/docs/jit.md)
- Live showcase (with a runnable interpreter-vs-JIT benchmark): <https://totisai.github.io/jdk21u/>

Everything below is the standard OpenJDK README.

---

# Welcome to the JDK!

For build instructions please see the
[online documentation](https://openjdk.org/groups/build/doc/building.html),
or either of these files:

- [doc/building.html](doc/building.html) (html version)
- [doc/building.md](doc/building.md) (markdown version)

See <https://openjdk.org/> for more information about the OpenJDK
Community and the JDK and see <https://bugs.openjdk.org> for JDK issue
tracking.

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

# Welcome to OpenJDK 21 Updates!

The JDK 21 Updates project uses two GitHub repositories.
Updates are continuously developed in the repository [jdk21u-dev](https://github.com/openjdk/jdk21u-dev). This is the repository usually targeted by contributors.
The [jdk21u](https://github.com/openjdk/jdk21u) repository is used for rampdown of the update releases of jdk21u and only accepts critical changes that must make the next release during rampdown. (You probably do not want to target jdk21u).

For more OpenJDK 21 updates specific information such as timelines and contribution guidelines see the [project wiki page](https://wiki.openjdk.org/display/JDKUpdates/JDK+21u/).

For build instructions please see the
[online documentation](https://openjdk.org/groups/build/doc/building.html),
or either of these files:

- [doc/building.html](doc/building.html) (html version)
- [doc/building.md](doc/building.md) (markdown version)

See <https://openjdk.org/> for more information about the OpenJDK
Community and the JDK and see <https://bugs.openjdk.org> for JDK issue
tracking.

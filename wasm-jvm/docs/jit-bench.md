# WasmJit micro-benchmark

`JitBench.java` runs a heavy straight-line integer kernel (~60 ops) in a tight
interpreted loop, comparing two byte-identical methods:
- `jitKernel` — name starts with `jit`, so WasmJit compiles it to a WebAssembly
  module at run time and the interpreter dispatches to that.
- `plainKernel` — interpreted normally.

## Run (Node, JIT-enabled jvm-base)
    javac --release 21 -d /tmp/jb JitBench.java
    # stage /tmp/jb/JitBench.class into /app and run mainClass JitBench with a
    # program arg = iteration count (see wasm-jvm/jit for the harness).

## Result (HotSpot Zero, wasm32, Node)
    iters=10000000  checksum match=true
    JIT (wasm)   : 1417 ms
    interpreter  : 8397 ms
    speedup      : ~6x

Note: this is bounded by the fixed per-call interpreter overhead (invoke +
frame setup), which is identical for both — only the method *body* is
accelerated. Methods with loops (once branch support lands) run entirely as
wasm and should show a much larger speedup.

## With control flow (loops)

`JitLoopBench.java` — a ~10-op-per-iteration loop over 40M iterations, JIT'd
entirely to wasm vs interpreted:

    n=40000000  checksum match=true
    JIT (wasm)   : 164 ms
    interpreter  : 1972 ms
    speedup      : 12x

The whole loop runs as one wasm function (dispatch loop + `select` for branches),
so there's no per-bytecode interpreter dispatch — hence the much larger win than
the straight-line case.

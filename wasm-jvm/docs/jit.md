# WasmJit — a baseline Java-bytecode → WebAssembly JIT for the Zero interpreter

The Zero VM is a pure interpreter (no JIT — you can't emit machine code in the
Wasm sandbox). WasmJit compiles hot Java methods to a **fresh WebAssembly module
at run time**, installs the function in the indirect table, and the interpreter
calls that instead of interpreting.

## How it works
- `src/hotspot/share/interpreter/wasm/` — the compiler + runtime install, split
  across `core/wasmJit.cpp`, `compiler/wasmCompiler.cpp`, `compiler/wasmResolver.cpp`,
  `assembler/wasmAssembler.cpp`, `assembler/wasmBytecodes.cpp`, and `wasmRuntime.cpp`
  (+ matching `.hpp`).
  At `method_entry` the interpreter asks `WasmJit::compiled_entry(m)`; for an
  eligible method it emits wasm, `new WebAssembly.Module` + `addFunction`, caches
  the table index per `Method`, and returns it. The hook (`bytecodeInterpreter.cpp`,
  `case method_entry`) reads the args from the frame, calls the wasm, pushes the
  result, and jumps to `handle_return` (like `ireturn`).
- JVM and Wasm are both stack machines, so arithmetic maps ~1:1 (`iadd`→`i32.add`).
- Control flow uses a **dispatch loop**: each basic block becomes
  `if (i32.eq $bb b) { <block>; $bb = next; br $L }` inside a wasm `loop`;
  conditional branches pick the next block with `select`. Handles loops + if/else.

## Scope & safety (current — audited against the code, not the original v1 prose)

Far beyond the integer-only v1. Verified by the differential benches under
`jit/bench/` (each JITs its `jit*` methods and interprets `p*` twins → a single run
is a jit-vs-interpreter oracle; run with `jit/tools/runjit.mjs`). **All pass.**

**Supported today:**
- **All primitive types** — int/long/float/double ALU, compares (`lcmp`/`fcmp`/`dcmp`,
  NaN-correct), every conversion, numeric `ldc`/`ldc2_w`. Integer `div`/`rem` throw
  `ArithmeticException` on /0 and handle the MIN/-1 overflow inline.
- **Control flow** — if/if_icmp/if_acmp/ifnull/ifnonnull, `goto`/`goto_w`,
  `tableswitch`/`lookupswitch`, loops (dispatch-loop), full stack shuffles.
- **Objects & arrays** — instance & static fields (primitive **and reference**, with
  the SerialGC card-mark write barrier), `aaload`/`aastore` (+ ArrayStore check),
  primitive arrays (+ bounds→`ArrayIndexOutOfBounds`), `arraylength`, `new`,
  `newarray`/`anewarray` (+ `NegativeArraySize`), `checkcast`/`instanceof`
  (+`ClassCastException`), `athrow`, `aload`/`astore` of oops.
- **Calls** — `invokestatic`, `invokespecial`, `invokevirtual` (vtable),
  `invokeinterface` (itable), one uniform i64-widened ABI into JIT'd/interpreted callees.
- **GC safety** — oops from frame locals are re-read from the GC-scanned frame slot on
  every `aload` (no oop-maps); produced oops (`new`/getfield) use a GC-scanned spill
  array; loops emit a per-back-edge safepoint poll.

Gate: methods named `jit*` by default; `WASMJIT_ALL=1` JITs every eligible method.
Synchronized/native/abstract methods bail; so do the gaps below.

## Still missing (the honest remainder toward C6 — see jit-runtime-completion.md)
Note: in-method `try/catch` **is** supported — every throw site dispatches via
`wasmjit_handler_bci` to an in-JIT handler block (or propagates if none); verified by
`TryCatchDiff` (catches ArithmeticException/NPE/AIOOBE in JIT'd code). `wide` is done
(`WideDiff`).

**Coverage gaps (method still falls back):** `invokedynamic` (lambdas, string-concat),
static-synchronized methods (Class-mirror monitor), and object
`ldc` (String/Class literals). `jsr`/`ret`/`jsr_w` are a documented permanent bail
(never emitted by javac ≥6).

**Performance tier (C5) — largely not started:** **OSR** (a loop that began
interpreting never migrates to JIT), tiering + background compilation (compile is a
synchronous first-call pause), a relooper for structured control flow (vs the
dispatch loop), and optimization (inlining, register/local allocation, check
elimination, intrinsics) + deopt.

**Proof (C6):** a forced 100%-opcode audit, in-browser jtreg-with-JIT conformance,
differential fuzzing, and a measured "≈0 interpreter time on hot paths".

## Results
- **Straight-line kernel** (60 ops, 10M calls): ~6× over the interpreter.
- **Loop kernel** (`JitLoopBench`, 40M-iter loop): **~12×** — the whole loop runs
  as one wasm function.
- **Swing/AWT app in JIT mode** (`jit-swing.html`, `WASMJIT_ALL=1`): the Ball
  Swing app renders correctly at 37 fps while the JIT compiles real JDK methods
  (`Math.floorMod`, `Integer.hashCode`, `Long.stringSize`, AQS lock helpers, …).
  See `jit-bench.md`. Run the differential suite headless with `jit/tools/runjit.mjs`
  (or `jittest.sh` to rebuild + test); all `jit/bench/*Diff.java` pass under the
  default gate and `WASMJIT_ALL=1`.

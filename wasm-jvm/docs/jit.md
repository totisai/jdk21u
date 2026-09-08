# WasmJit — a baseline Java-bytecode → WebAssembly JIT for the Zero interpreter

The Zero VM is a pure interpreter (no JIT — you can't emit machine code in the
Wasm sandbox). WasmJit compiles hot Java methods to a **fresh WebAssembly module
at run time**, installs the function in the indirect table, and the interpreter
calls that instead of interpreting.

## How it works
- `src/hotspot/share/interpreter/wasm/` — the compiler + runtime install, split by
  concern (see [Compiler internals](#compiler-internals) below) across `core/`,
  `compiler/`, `assembler/`, and the `wasmRuntime.cpp` install path (+ matching `.hpp`).
  At `method_entry` the interpreter asks `WasmJit::compiled_entry(m)`; for an
  eligible method it emits wasm, `new WebAssembly.Module` + `addFunction`, caches
  the table index per `Method`, and returns it. The hook (`bytecodeInterpreter.cpp`,
  `case method_entry`) reads the args from the frame, calls the wasm, pushes the
  result, and jumps to `handle_return` (like `ireturn`).
- JVM and Wasm are both stack machines, so arithmetic maps ~1:1 (`iadd`→`i32.add`).
- Control flow uses a **dispatch loop**: each basic block becomes
  `if (i32.eq $bb b) { <block>; $bb = next; br $L }` inside a wasm `loop`;
  conditional branches pick the next block with `select`. Handles loops + if/else.

## Compiler internals

The compiler is organised as a small pipeline of per-concern translation units
rather than one monolith. A compile threads a **compile context** (`Ctx`,
`compiler/wasmContext.hpp`) — the method, its constant pool, the local/oop layout,
the operand value-type stack, spill bookkeeping, and a `bail` flag — through three
stages, all writing wasm into a growable byte buffer (`Buf`).

```
bytecode ─▶ analysis ──▶ emit (per-op) ──▶ module assembly ─▶ wasm module bytes
             (Ctx)         (Ctx, Buf)          (Buf)
```

| Unit | File | Responsibility |
|------|------|----------------|
| **Driver** | `core/wasmJit.cpp` | eligibility gate, orchestration, `WebAssembly.Module` + `addFunction`, per-`Method` table-index cache. Kept lock-free on the ineligible/warming hot path (a global mutex per dispatch melts down across emscripten pthreads). |
| **Analysis** | `compiler/wasmAnalysis.cpp` | pre-passes over the bytecode: `classify_locals` (wasm local types), `analyze_oop_slots` (which slots hold oops → GC-scanned spill array), and `compile_cf`, which lays out the basic-block **dispatch loop** and the per-throw-site exception handler dispatch. |
| **Stack map** | `compiler/wasmStackmap.cpp` | operand-stack modelling: `op_consumed` (entries a throwing op pops) and `stack_delta` (net operand-stack delta, in JVM words) — used to keep the value-type stack and spill state correct across ops. |
| **Emit** | `compiler/wasmEmit.cpp` | the per-bytecode translation: `emit_op` (the main opcode switch) plus helpers for field access, calls, allocation, `ldc`, synchronization unlock, intrinsics, and the operand value-type stack (`vpush`/`vpop`). |
| **Resolver** | `compiler/wasmResolver.cpp` | constant-pool / callee resolution behind the call and field-access emitters. |
| **Assembler** | `assembler/wasmAssembler.cpp` | the `Buf` byte buffer, LEB128 primitives, the **instruction emitters**, and `emit_module` (wraps the compiled body in a complete wasm module: type, function, memory, and code sections). |
| **Opcode table** | `assembler/wasmOpcodes.hpp` | `enum WOp` — every opcode the backend emits, named per the wasm core spec, valued at its encoded byte. |
| **Bytecodes** | `assembler/wasmBytecodes.hpp/.cpp` | JVM-side decode helpers (instruction length, branch detection, branch target). |

The two compiler-internal headers make the boundaries explicit:
`compiler/wasmCompiler.hpp` is the **public** entry (what the driver calls:
`classify_locals`, `analyze_oop_slots`, `compile_cf`), while
`compiler/wasmCompilerInternal.hpp` holds the cross-unit calls the stages make to
one another (`emit_op`, `op_consumed`, `stack_delta`, `vpush`/`vpop`, …) so the
per-concern `.cpp` files need not be one translation unit.

### The emitter layer (MacroAssembler-style)

Emit sites do not write raw opcode bytes. The assembler exposes a named,
composite emitter for each instruction (much like a HotSpot `MacroAssembler`), so
a translation reads as the wasm it produces:

```cpp
// null check on the top-of-stack oop, then load a field:
tee_local(c, x->TMPI);          // keep the oop
bput(c, op_i32_eqz);            // oop == 0 ?
if_void(c);                     //   if null:
  emit_call(c, Imp::THROW_NPE); //     throw NPE
  emit_exc(x, c, pc);           //     dispatch/propagate
emit_end(c);
get_local(c, x->TMPI);
mem_op(c, op_i32_load, 2, off); // i32.load  align=2  offset=off
```

Single-byte ALU/compare/conversion ops go through `bput(c, op_*)` with a named
`WOp`; multi-byte idioms have dedicated emitters — `i32_const`/`i64_const`,
`emit_call`, `mem_op` (load/store + `{align, offset}`), the structured-control
forms `if_void`/`if_type`/`block_void`/`loop_void`/`emit_else`/`emit_end`,
`br`/`br_if`, `ret`, `drop`, and `trunc_sat`. Because each `WOp` equals its encoded
byte, adopting a name is byte-identical — the [differential benches](jit-bench.md)
are the guarantee (all pass after the refactor).

One subtlety the emitters exist to hide: the value-type bytes (`i32`=`0x7f`,
`i64`=`0x7e`, …) that a `block`/`if`/`loop` takes as a blocktype **collide** with
arithmetic opcodes (`i64.mul`=`0x7e`). `if_type(c, vt_i64)` names the blocktype
case so the two never get confused.

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

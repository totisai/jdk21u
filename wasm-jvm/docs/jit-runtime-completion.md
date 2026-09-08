# Complete Runtime — every opcode JIT'd, no Zero penalty for hot code

**Goal.** A browser JVM where (a) **every JVM bytecode** has a JIT implementation,
(b) **hot code never executes in the Zero interpreter** (tiering + OSR), (c) the
JIT'd code is genuinely fast (structured control flow + optimization), and
(d) it's proven correct (conformance + differential fuzzing). The interpreter
remains only as the always-correct cold-start / deopt fallback — never the
steady-state executor of a hot path.

Numbering continues the JIT work; the safe-envelope milestones (M1–M6, done) are
in [`jit-milestones.md`](jit-milestones.md). This file is the completion path: **C0–C6**.

---

## Opcode coverage matrix

| Group | Opcodes | Status |
|---|---|---|
| consts / push / ldc-numeric | `nop`,`aconst_null`,`*const_*`,`bipush`,`sipush`,`ldc`/`ldc_w`/`ldc2_w`(num) | ✅ (`nop` in C0) |
| loads / stores (incl. `aload`/`astore`) | `[ilfda]load(_n)`, `[ilfda]store(_n)` | ✅ |
| primitive array load/store + length | `[ilfdbcs]aload`/`store`, `arraylength` | ✅ |
| arithmetic / logic / shift / convert / iinc | `[ilfd]add…`, `[il]and/or/xor/sh*`, `[ilfd]neg`, `i2b…`, `iinc` | ✅ (`[il]div/rem` bail → **C4.1**) |
| compares / branches | `[lfd]cmp*`, `if<cond>`, `if_icmp<cond>`, `goto` | ✅ |
| null/ref branches | `ifnull`,`ifnonnull`,`if_acmpeq/ne` | **C0.1** |
| stack shuffles | `pop`,`dup` ✅ · `pop2`,`dup_x1/x2`,`dup2(_x1/x2)`,`swap` | **C0.2** |
| wide branch / switches | `goto_w`,`tableswitch`,`lookupswitch` | **C0.3** |
| returns | `[ilfda]return`,`return` | ✅ |
| static-field / static-call | `get/putstatic`(prim), `invokestatic`(prim) | ✅ |
| instance-field (prim) | `get/putfield`(prim) | ✅ |
| **object fields / arrays** | `get/putfield`(ref), `get/putstatic`(ref), `aaload`,`aastore` | ✅ (C2.1) |
| **allocation** | `new`,`newarray`,`anewarray`,`multianewarray` | ✅ (C2.2) |
| **type checks** | `instanceof`,`checkcast` | ✅ (C2.3) |
| **virtual/interface/dynamic calls** | `invokevirtual`,`invokespecial`,`invokeinterface`,`invokedynamic` | ✅ (C3) |
| ldc object constants | `ldc`/`ldc_w` String/Class (MethodHandle/MethodType bail) | ✅ (C2.3) |
| **exceptions** | `athrow`, try/catch dispatch, unwinding | ✅ (C4.1) |
| **synchronization** | `monitorenter`,`monitorexit`, synchronized methods | ✅ (C4.2) |
| legacy | `wide` ✅ (C4.3) · `jsr`/`ret`/`jsr_w` (bail — not emitted by javac ≥ 6) | ✅ (C4.3) |

---

## Milestones

### C0 — finish the safe envelope (no new infrastructure, all GC-safe)
Object refs stay transient (compared/shuffled, never held across a safepoint), so
these need nothing beyond the current model.
- **C0.1** ref branches: `ifnull`,`ifnonnull`,`if_acmpeq/ne`; `nop`.
- **C0.2** full stack family: `pop2`,`dup_x1`,`dup_x2`,`dup2`,`dup2_x1`,`dup2_x2`,`swap`
  (needs category-2 aware, type-tracked shuffles).
- **C0.3** `goto_w`, `tableswitch`, `lookupswitch` (multi-way → compute target block;
  dispatch-loop set-`$bb`).

### ✅ C1 — the enabler: GC-visible oops  [done]
Solved **without a new GC root**: JIT modules import the shared linear memory and
receive the interpreter frame's `locals` base as a trailing param; every `aload`
**re-reads the object ref from the GC-scanned frame slot** (`locals[-slot]`)
instead of caching it in a wasm local. So an oop is never live in a wasm frame
across a safepoint — a moving GC that relocates it updates the frame slot (via the
method's existing entry oop-map), and the next `aload` sees the new address. The
poll-free / has-call gate is **removed** (only handler-free remains, for the NPE
early-return model → C4). invokestatic to object-arg callees bails (no frame to
re-read from). Verified: `C1Stress.java` — an object arg held across a 30M-iteration
loop returns the exact result (42×30M) while another thread hammers `System.gc()`
to relocate it; matches the interpreter, no corruption, no deadlock.
Note: this covers oops that *originate* in frame locals (args). NEW oops
(object `getfield`, `new`) don't have a frame slot and still need the spill array —
built with C2.

### ✅ C2 — object model (all heap opcodes)  [done; dep: C1]
All three sub-milestones are implemented in `wasmCompiler.cpp::emit_op` and gated in
the leader scan; each has a differential bench (`C2ObjFieldDiff`, `C2ObjArrayDiff`,
`C2CheckcastDiff`, `C2InstanceofDiff`, `MultiArrDiff`, `LdcObjDiff`). Object stores go
through the barriered `$putfield`/`$aastore` helpers; `new` uses the spill-slot idiom
(`new_spill[pc]`) to survive the ctor allocation safepoint.
- **C2.1** reference fields + object arrays: `get/putfield`(ref), `get/putstatic`(ref),
  `aaload`,`aastore` — **with the SerialGC write barrier (card mark) on every oop
  store**, and the `aastore` array-store type check (→ `ArrayStoreException`).
- **C2.2** allocation: `new`,`newarray`,`anewarray`,`multianewarray` via a runtime
  alloc helper (TLAB fast path + slow path); the new oop is spilled across the
  allocation safepoint.
- **C2.3** `instanceof`,`checkcast` (→ `ClassCastException`); `ldc` String/Class.

### ✅ C3 — calls (every invoke)  [done; dep: C1, C2]
All invokes route through the uniform `emit_invoke` → `$invoke` (JavaCalls) ABI, which
Handle-izes oop args/receivers and marshals the i64-widened result. `invokestatic`'s
old baked-`Method*` fast path was retired (see `resolve_static_callee` → always general
path) after its produced-oop-across-GC safepoint window (#16); everything now uses the
frame-safe path. Benches: `ObjCallDiff`, `ObjArgDiff`, `ObjRetDiff`, `VfinalDiff`,
`M3Diff`, `IndyDiff`, `IndyLambdaDiff`.
- **C3.1** generalize `invokestatic`: object/long/double args + **object returns**.
- **C3.2** `invokespecial` / `invokevirtual` (vtable) / `invokeinterface` (itable):
  resolve, receiver null-check, dispatch, one uniform call ABI into JIT'd,
  interpreted, or native callees (arg/return marshaling incl. oops).
- **C3.3** `invokedynamic` + MethodHandle linkage (bootstrap method, call site,
  lambda metafactory, string-concat).

### ✅ C4 — exceptions, synchronization, legacy (complete control flow)  [done; dep: C1]
In-method handler dispatch (`emit_exc` + `$handler_bci`/`$take_exception`), `athrow`,
monitors (`$monitorenter`/`$monitorexit` + synchronized-method prologue/`emit_sync_unlock`),
the `wide` prefix, and restored `idiv/irem/ldiv/lrem` (inline zero + MIN/-1 overflow
checks) are all implemented. The handler-free gate is removed for methods with a
handler table. Benches: `TryCatchDiff`, `SyncDiff`, `SyncMT`/`SyncMethodMT`/`SyncStaticMT`,
`WideDiff`. Remaining hardening lives in C6 (in-browser conformance).
- **C4.1** full exceptions: `athrow`; try/catch **handler-table dispatch inside
  JIT'd code**; unwinding through JIT frames (Wasm EH, or the prototyped
  pending-exception + typed-unwind model generalized). **Removes the handler-free
  gate.** Restore `idiv/irem/ldiv/lrem` (throw `ArithmeticException`, handle MIN/-1).
- **C4.2** synchronization: `monitorenter`/`monitorexit` + synchronized methods
  (fast-path lock, inflation slow-path, unlock-on-exception).
- **C4.3** `wide` prefix; document `jsr`/`ret`/`jsr_w` as bail (legacy, unused).

### C5 — no Zero penalty (performance)  [dep: C1–C4]
- **C5.1** tiering + OSR + background compile: invocation/back-edge counters,
  compile hot methods off-thread, **on-stack replacement** so long-running loops
  migrate from interpreter to JIT mid-execution. ⇒ hot code never stays in Zero.
- **C5.2** structured control flow: replace the br-free dispatch loop with a
  relooper (reducible CFGs → natural wasm `block`/`loop`/`if`; irreducible →
  dispatch fallback). Removes per-basic-block dispatch overhead.
- **C5.3** optimization: inlining (small/hot callees), value/local allocation,
  constant folding, null/bounds/cast-check elimination, escape analysis (stack
  allocation); **deopt** to make speculative opts safe.
- **C5.4** intrinsics: `System.arraycopy`, `Math.*`, `String` ops, `Object.hashCode`,
  `Arrays.*`, `Unsafe`, array fill/compare — HotSpot-style fast paths.

### C6 — completeness & proof
- **C6.1** 100% opcode audit: a matrix test that forces every standard bytecode
  through the JIT; no silent bail except the two documented legacy ops.
- **C6.2** conformance: `jtreg` tier1+ green **in-browser with the JIT forced on**;
  differential fuzzing (interpreter oracle vs JIT) in CI.
- **C6.3** Zero-free proof: instrument steady-state execution of real workloads
  (Swing app, a compute benchmark, a real jar) and confirm hot methods are JIT'd —
  **~0 interpreter time on hot paths.**

---

## Critical path

```
C0 (parallel, no deps) ─┐
                        ├─► C1 (oop-spill) ─► C2 ─► C3
C6.2 harness (early) ───┘                 └─► C4      ─► C5 ─► C6.1/C6.3
```

C1 is the one architectural unlock; C6.2's harness should exist before C2 so every
object/call/exception milestone lands verified. C5 is what turns "all opcodes
work" into "no performance issue from Zero".

## Definition of done
- Every JVM bytecode has a JIT implementation (only `jsr`/`ret`/`jsr_w` documented
  as bail — not emitted by modern javac).
- Tiering + OSR ⇒ no hot method executes in Zero; measured steady-state
  interpreter time on hot paths ≈ 0.
- `jtreg` tier1 green in-browser with the JIT enabled; differential fuzz clean.
- Real apps show JIT'd hot paths and no Zero bottleneck; JIT'd code uses structured
  control flow and core intrinsics.

# WasmJit milestones

Baseline (done) → full method-level JIT. Ordered by dependency and value.

## ✅ Done — baseline, mixed-mode
Runtime Wasm codegen + install + interpreter dispatch · per-method cache ·
**integer** ALU (`+ - * / %`, bitwise, shifts, `i2b/c/s`, `iinc`) · **control
flow** (loops + if/else via a dispatch loop) · operand-stack verification + safe
bailout · `static (I*)I` calling convention · `WASMJIT_ALL` mode.
Result: a Swing app boots in JIT mode; ~6–12× on eligible methods.

## ✅ M1 — Wide numeric types (long / float / double)  [done]
Typed value stack + per-slot typed wasm locals (i32/i64/f32/f64); `l*`/`f*`/`d*`
ALU, `lcmp`/`fcmpl/g`/`dcmpl/g` (NaN-correct via `select`), `lconst`/`fconst`/
`dconst`/`ldc`/`ldc2_w` (constant-pool read), and all int/long/float/double
conversions (`i2l`,`l2i`,`i2f`,`f2i`,…, saturating `trunc_sat` for f→i to match
Java's clamp/NaN semantics). Calling convention: an **i64-widened uniform ABI** —
every JIT'd fn has type `(i64 × nargs) → i64`; the hook widens each arg to an
i64 bit-pattern and narrows the i64 result, so one `addFunction` signature covers
any type mix (no per-signature C casts, no memory imports). A prologue converts
each i64 param into its typed local. Verified: `M1Diff.java` — 11/11 JIT-vs-
interpreter differential cases (long loop, long bitops, `lcmp`, double poly, float
mul, i↔l/d conversions, int regression) all match. Also fixed a `classify_locals`
infinite loop on unsupported opcodes (which had hung `WASMJIT_ALL` boot).
`ldiv`/`lrem` still bail (div-by-zero trap — M4). Deps: none.

## M2 — Object model + GC  ⚠ the wall  [primitive statics done; instance/objects remain]
✅ **getstatic/putstatic of primitive fields.** Resolved from the CP cache
(`f1_as_klass`/`f2_as_index`/`flag_state`, non-volatile, when already resolved —
else transient bail) and baked as `(Klass*, offset, typecode)`. Access goes
through runtime helpers `wasmjit_getstatic/putstatic` that fetch `klass->
java_mirror()` and deref the primitive **entirely C-side** — so **no oop ever
lives in the JIT frame → GC-safe without oop-maps**, and no null check (statics
have no receiver). All 8 primitive type codes (int/long/float/double/byte/char/
short/bool). Verified: `M2Diff.java` — int/long/float/double statics + a static
in a loop match the interpreter ×40; byte/char/short truncation verified separately.
Remaining (the actual wall): **instance** `get/putfield` (receiver oop + null
check → needs an M4 NPE slice), `new`/arrays, `aload/astore` — JIT frames would
then hold oops, so this needs **oop-maps** for the *moving* SerialGC (or a
provably poll-free/handler-free subset). Difficulty: high. Deps: M4 for null checks.

## M3 — Method calls (`invoke*`)  [static-primitive done; virtual/object remain]
✅ **invokestatic of primitive static callees.** At compile time the callee is
read from the CP cache (`entry_at(native_u2)->f1_as_method()`, only if already
resolved — else a **transient** bail that retries after one interpreted run, vs a
permanent bail for uncompilable callees) and **force-compiled**; its table index
is already a C-callable i64-ABI fn ptr, so the JIT'd caller spills args to i64
temps and calls the runtime helper `wasmjit_invoke_static(fnptr, a0..a7, nargs)`
→ `wasmjit_call` — **no VM re-entry, no oops, GC-safe.** A recursion guard (`-2`
sentinel) breaks compile cycles. Verified: `M3Diff.java` — callers JIT-compile and
match the interpreter over 40 iterations (int/long/double, nested calls, a
call-in-loop); real JDK methods (`stringSize`, `hashCode`, `reverseBytes`, …) also
JIT under `WASMJIT_ALL`.
Remaining: `invokevirtual`/`special`/`interface` (vtable/itable + receiver oop →
needs M2), object/long/... args to non-JIT'd callees, `invokedynamic`.
Difficulty: high. Deps: M2 for virtual/object.

## M4 — Exceptions & unwinding  [NPE-on-null slice done; rest remains]
✅ **NPE on null getfield** (with **M2 instance getfield** of primitive fields).
`aload*`/object args (oop as an i32 address), then `getfield` (incl. the
interpreter's rewritten `_fast_[bcdfils]getfield` forms) emits an inline null
check: on null it calls `wasmjit_throw_npe` (sets a pending NPE) and returns
immediately; the interpreter hook checks `has_pending_exception()` after the JIT
call and `goto handle_exception`. Read goes through `wasmjit_getfield` (C-side
deref). **GC/NPE safety** via a compile-time gate: object-using methods are JIT'd
only when **poll-free** (no back-edge, no call → no safepoint while an oop is live
→ no oop-maps needed) **and handler-free** (an NPE always propagates, so the
early-return is correct). Verified: `M4Diff.java` — int/long/float/double instance
getters (incl. two-receiver) match the interpreter ×40, and `jitGetX(null)` throws
NPE from the JIT'd check exactly as the interpreter does. Also fixed two latent
`instr_len` mislabels (fstore/dstore) found along the way.
✅ **putfield** of primitive instance fields (same null-check→NPE + poll-free/
handler-free gate): value widened + spilled, receiver null-checked, then
`wasmjit_putfield` writes C-side. Handles the interpreter's rewritten
`_fast_[bzcdfils]putfield` **and** `_fast_aload_0` (the aload_0 rewrite that had
blocked setters). Verified: `M2PutfieldDiff.java` — int/long/float/double/byte/
short setters JIT and match the interpreter ×40, `jitSetI(null)` throws NPE.
✅ **Primitive array access + ArrayIndexOutOfBounds.** `arraylength`, `iaload`…
`saload`, `iastore`…`sastore` (object `aaload`/`aastore` excluded). Each emits an
inline null check (NPE) + bounds check (`idx<0 | idx>=len` → `wasmjit_throw_aioobe`),
then reads/writes via `wasmjit_arraylength`/`aload`/`astore` C-side (`bastore`
masks boolean[] correctly). Same poll-free/handler-free GC gate — so array-in-a-
loop correctly bails (would need oop-maps). Also added **void-return** methods
(`TV`; hook pushes nothing; void `invokestatic` drops the dummy result). Verified:
`M2ArrayDiff.java` — length + int/long/double/byte/char loads and int/byte void
stores JIT and match ×40; `jitIget(null)`→NPE, `jitIset(a,99,..)`→AIOOBE from the
JIT'd checks.
The wall (needs **oop-maps** for the moving GC): `new`/`newarray` (allocated oop
survives an allocation safepoint), object fields/array elements, and any oop live
across a loop/call. Plus `athrow`/try-catch/unwinding, `invokevirtual`/interface.

## ✅ M5 — Safepoints  [done]
JIT'd modules now carry an **import section**: `env.p` = a safepoint poll wired to
the exported C helper `wasmjit_poll()` (mirrors the interpreter's
`RETURN_SAFEPOINT`: `SafepointMechanism::should_process` → `ThreadInVMfromJava`
transition). Loop methods emit `call $poll` per dispatch-loop iteration (gated on
a detected back-edge). Safe for M1's primitive-only scope — JIT frames hold no
oops. This establishes the **import plumbing** M2/M3/M4 build on. Verified:
`GcStress.java` — a JIT'd 20M-iteration loop runs while another thread hammers
`System.gc()`; it completes with a matching checksum and **no deadlock** (without
the poll, GC could never reach its safepoint → hang). Deps: import plumbing ✓.

## M6 — Deopt & tiering  [tiering-lite done; deopt/OSR remain]
✅ **Hotness counters:** per-method invocation counter; `WASMJIT_ALL` methods
compile only after `WASMJIT_HOT_THRESHOLD` (20) calls, so cold JDK methods aren't
wastefully compiled on first touch; explicit `jit*` methods stay eager (threshold
1). Verified: a non-`jit` method stays interpreted at 5 calls, compiles at 50.
Remaining: **deopt** (roll back to interpreter at a bytecode with reconstructed
locals/stack) for class redefinition/unloading + uncommon traps; **OSR** for
long-running loops. Those deps: M2 (frame-state maps).

## M7 — Background compiler thread
Compile off the executing thread (today: synchronous first-call pause); resolve
the cross-thread `WebAssembly.Table`/`addFunction` (worker install vs main-thread
proxy). Difficulty: medium. Deps: none functionally.

## M8 — Optimization
Values in wasm locals with real allocation (+ oop maps), **inlining** hot callees,
natural wasm loops for reducible CFGs (vs the dispatch loop), constant folding,
null/bounds-check elimination. Difficulty: high, open-ended. Deps: M2.

---

**Critical path to "most of a Swing app JIT-compiled":** import plumbing → **M5 +
M2 + M3 + M4**. M1 is parallel; M6–M8 are refinement. **M2's GC oop-maps and M3's
call ABI are the two hardest, highest-leverage pieces.**

**Cross-cutting:** a differential-test harness (JIT vs interpreter oracle) + a
jtreg subset under `WASMJIT_ALL=1`, so each milestone lands verifiably.

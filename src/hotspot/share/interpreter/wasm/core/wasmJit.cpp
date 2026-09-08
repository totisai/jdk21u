/*
 * WasmJit — baseline bytecode -> WebAssembly JIT for the Zero interpreter.
 * See wasmJit.hpp. Active only on the Emscripten target.
 *
 * M1: typed values (int/long/float/double) via an i64-widened uniform ABI —
 * every JIT'd function has type (i64 x nargs) -> i64. The interpreter hook
 * widens each argument to an i64 bit-pattern and narrows the i64 result back to
 * the method's return type, so a single addFunction signature ('j'+'j'*nargs)
 * covers any mix of arg types without per-signature C function-pointer casts.
 * Inside the body, a prologue converts each i64 param into a typed wasm local.
 */
#include "precompiled.hpp"
#include "interpreter/wasm/wasmJit.hpp"
#include "interpreter/wasm/assembler/wasmBytecodes.hpp"
#include "interpreter/wasm/assembler/wasmAssembler.hpp"
#include "interpreter/wasm/compiler/wasmResolver.hpp"
#include "interpreter/wasm/compiler/wasmCompiler.hpp"
#include "interpreter/wasm/wasmRuntime.hpp"
#include "interpreter/wasm/core/wasmDriver.hpp"
using namespace wasm;
#include "oops/method.hpp"
#include "oops/symbol.hpp"
#include "oops/constantPool.hpp"
#include "oops/cpCache.hpp"
#include "oops/cpCache.inline.hpp"
#include "oops/oop.inline.hpp"
#include "oops/typeArrayOop.inline.hpp"
#include "oops/typeArrayKlass.hpp"
#include "oops/objArrayOop.inline.hpp"
#include "oops/objArrayKlass.hpp"
#include "oops/instanceKlass.hpp"
#include "oops/klassVtable.hpp"
#include "memory/oopFactory.hpp"
#include "utilities/bytes.hpp"
#include "utilities/exceptions.hpp"
#include "classfile/vmSymbols.hpp"
#include "runtime/interfaceSupport.inline.hpp"
#include "runtime/safepointMechanism.inline.hpp"
#include "runtime/javaThread.hpp"
#include "runtime/javaCalls.hpp"
#include "runtime/handles.inline.hpp"
#include "runtime/synchronizer.hpp"
#include "memory/resourceArea.hpp"
#include "runtime/signature.hpp"
#include "utilities/ostream.hpp"

#ifdef __EMSCRIPTEN__

#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <pthread.h>

// thread-local index cache below. count drives hotness-based (M6) compilation.
struct JitEntry { Method* m; intptr_t fn; bool valid; bool eager;
                  int count; uint8_t nargs; uint8_t rettype; uint8_t at[8];
                  uint8_t* bytes; int blen;
                  int* osr_blk; uint8_t osr_ok; int osr_count; };  // OSR: bci->block map + eligibility
// Open-addressed (linear-probe) cache keyed exactly by Method*. Unlike a
// direct-mapped table, a compiled/eligible entry is never evicted by a colliding
// method, so app methods aren't starved by the JDK method flood under WASMJIT_ALL.
static const int CACHE_N = 32768;
static JitEntry _cache[CACHE_N];
// Guards all mutation of the shared cache (slot claim, eligibility, compile). The
// hot path (already-compiled method) is lock-free -- see compiled_entry. `valid`
// is published with release and read with acquire so a lock-free reader never sees
// a half-initialised entry.
static pthread_mutex_t g_jit_lock = PTHREAD_MUTEX_INITIALIZER;
static JitEntry* cache_slot(Method* m) {
  unsigned h = (unsigned)(((uintptr_t)m) >> 3) % CACHE_N;
  for (int i = 0; i < 128; i++) {
    JitEntry& e = _cache[(h + i) % CACHE_N];
    bool v = __atomic_load_n(&e.valid, __ATOMIC_ACQUIRE);
    if (v && e.m == m) return &e;         // existing entry
    if (!v) return &e;                    // first empty slot -> claim for this method
  }
  return &_cache[h];                       // table crowded (rare): fall back, may thrash
}

// Compile threshold for WASMJIT_ALL (broad) methods: only compile once hot, so
// cold JDK methods aren't wastefully compiled on first touch. Explicit jit*
// methods compile eagerly (threshold 1) so they always exercise the JIT.
// Compile only after a method is genuinely hot. Kept high enough that the JDK's
// one-shot bootstrap methods (hot only during startup) aren't wastefully compiled
// -- each compile is a synchronous new WebAssembly.Module, so a low threshold turns
// boot into a compile storm. Truly hot code (loops, per-frame paint) far exceeds it.
static const int WASMJIT_HOT_THRESHOLD = 100;

// Call a JIT'd function (all-i64 params, i64 result) via an arity switch. n is
// the total param count = method args + 1 (the trailing frame-base param).
typedef uint64_t U_;
uint64_t wasmjit_call(intptr_t fn, int n, uint64_t* a) {
  switch (n) {
    case 0: return ((U_(*)())fn)();
    case 1: return ((U_(*)(U_))fn)(a[0]);
    case 2: return ((U_(*)(U_,U_))fn)(a[0],a[1]);
    case 3: return ((U_(*)(U_,U_,U_))fn)(a[0],a[1],a[2]);
    case 4: return ((U_(*)(U_,U_,U_,U_))fn)(a[0],a[1],a[2],a[3]);
    case 5: return ((U_(*)(U_,U_,U_,U_,U_))fn)(a[0],a[1],a[2],a[3],a[4]);
    case 6: return ((U_(*)(U_,U_,U_,U_,U_,U_))fn)(a[0],a[1],a[2],a[3],a[4],a[5]);
    case 7: return ((U_(*)(U_,U_,U_,U_,U_,U_,U_))fn)(a[0],a[1],a[2],a[3],a[4],a[5],a[6]);
    case 8: return ((U_(*)(U_,U_,U_,U_,U_,U_,U_,U_))fn)(a[0],a[1],a[2],a[3],a[4],a[5],a[6],a[7]);
    // Eligibility caps method args at 8, so the installed function has at most
    // nargs+1 = 9 params (the trailing localsbase). Each arity must be called with
    // the EXACT param count or wasm traps "function signature mismatch".
    case 9: return ((U_(*)(U_,U_,U_,U_,U_,U_,U_,U_,U_))fn)(a[0],a[1],a[2],a[3],a[4],a[5],a[6],a[7],a[8]);
    default: {  // unreachable (n<=9); keep a 10-arg fallback for safety
      typedef uint64_t (*F10)(U_,U_,U_,U_,U_,U_,U_,U_,U_,U_);
      uint64_t z[10]={0,0,0,0,0,0,0,0,0,0}; for(int i=0;i<n&&i<10;i++) z[i]=a[i];
      return ((F10)fn)(z[0],z[1],z[2],z[3],z[4],z[5],z[6],z[7],z[8],z[9]);
    }
  }
}

// Fallback when a static callee can't be installed into this thread's table (should
// be vanishingly rare -- the module bytes are shared and the table grows). Invokes
// the static method through the VM instead. Only primitive-arg statics reach here.
static void check_eligible(Method* m, JitEntry& e) {
  uint8_t argtype[16]; int argslot[16]; int nargs=0, rettype=TI;
  bool eligible = false, eager = false;
  // Static and instance methods are eligible (instance = leading `this` object arg via
  // parse_sig). Synchronized methods lock `this` (instance) or the Class mirror (static)
  // in the prologue. native/abstract still bail.
  if (!m->is_native() && !m->is_abstract() &&
      parse_sig(m, argtype, argslot, &nargs, &rettype) && nargs <= 8) {
    static int jit_all = -1;
    if (jit_all < 0) { const char* ev = ::getenv("WASMJIT_ALL"); jit_all = (ev && ev[0]=='1') ? 1 : 0; }
    Symbol* name = m->name();
    const char* nm = (const char*)name->bytes();
    bool named = (name->utf8_length() >= 3 && nm[0]=='j' && nm[1]=='i' && nm[2]=='t');
    if (named || jit_all) {
      eligible = true; eager = named;
      if (!named) {
        Symbol* holder = m->method_holder()->name();
        if (holder->starts_with("java/") ||
            holder->starts_with("jdk/") ||
            holder->starts_with("sun/")) {
          eligible = false;
        }
      }
    }
  }
  // Debug bisect: WASMJIT_DENY=<substr> forces any method whose "holder.name" contains
  // <substr> to bail (interpret). Used to isolate a miscompiled method.
  if (eligible) {
    static const char* deny = nullptr; static int checked = 0;
    if (!checked) { deny = ::getenv("WASMJIT_DENY"); checked = 1; }
    if (deny && deny[0]) {
      char buf[512];
      os::snprintf(buf, sizeof(buf), "%s.%s", m->method_holder()->name()->as_C_string(),
                   m->name()->as_C_string());
      if (::strstr(buf, deny) != nullptr) eligible = false;
    }
  }
  e.m = m; e.eager = eager; e.count = 0;
  e.fn = eligible ? 0 : -1;
  e.bytes = nullptr; e.blen = 0;
  e.nargs = (uint8_t)nargs; e.rettype = (uint8_t)rettype;
  for (int i=0;i<nargs && i<8;i++) e.at[i] = argtype[i];
  __atomic_store_n(&e.valid, true, __ATOMIC_RELEASE);   // publish last (lock-free readers)
}

// Compile m and install. Returns 0 on success (and sets e.fn to the table index),
// 2 if compilation transiently failed (an invokestatic callee isn't resolved yet
// -> worth retrying after an interpreted run), or 1 on permanent failure.
static int do_compile(Method* m, JitEntry& e) {
  uint8_t argtype[16]; int argslot[16]; int nargs=0, rettype=TI;
  if (!(parse_sig(m, argtype, argslot, &nargs, &rettype) && nargs <= 8)) return 1;
  // Object return from a SYNCHRONIZED method: the result oop sits on the wasm stack
  // while emit_sync_unlock's monitorexit runs, which can safepoint and move it. Bail.
  if (rettype == TA && m->is_synchronized()) return 1;
  int maxlocals = m->max_locals();
  uint8_t* ltype = (uint8_t*)malloc(maxlocals?maxlocals:1);
  if (!classify_locals(m->code_base(), m->code_size(), maxlocals, argtype, argslot, nargs, ltype)) {
    free(ltype); return 1;
  }
  Ctx x; x.base = nargs + 1; x.maxlocals = maxlocals; x.ltype = ltype;   // +1 for localsbase param
  x.cp = m->constants(); x.method = m;
  x.sync_method = m->is_synchronized();   // instance-only (static sync bailed at eligibility)
  x.BB = x.base + maxlocals; x.TMPI = x.BB+1; x.TMPJ = x.BB+2; x.TMPJ2 = x.BB+3;
  x.TMPF = x.BB+4; x.TMPF2 = x.BB+5; x.TMPD = x.BB+6; x.TMPD2 = x.BB+7;
  x.ARG0 = x.BB+8; x.TMPI2 = x.BB+16; x.SH0 = x.BB+17; x.LB = x.BB+21; x.SB = x.BB+22;
  x.slot_kind = (uint8_t*)malloc(maxlocals?maxlocals:1);
  x.spill_idx = (int*)malloc((maxlocals?maxlocals:1)*sizeof(int));
  x.n_spill = 0;
  if (!analyze_oop_slots(m->code_base(), m->code_size(), maxlocals, argtype, argslot, nargs,
                         x.slot_kind, x.spill_idx, &x.n_spill)) {
    free(x.slot_kind); free(x.spill_idx); free(ltype); return 1;
  }
  // Assign a spill slot to each `new` site (fresh object survives the ctor call).
  int csize = m->code_size();
  x.new_spill = (int*)malloc(sizeof(int)*(csize?csize:1));
  for (int i=0;i<csize;i++) x.new_spill[i] = -1;
  { const uint8_t* bc = m->code_base();
    for (int pc=0; pc<csize; ) { int L = instr_len(bc,pc); if (!L) break;
      if (bc[pc]==0xbb) x.new_spill[pc] = x.n_spill++;
      pc += L; } }
  Buf code = {};
  x.osr_blk = nullptr;
  int bad = compile_cf(&x, m->code_base(), m->code_size(), &code);
  // OSR eligibility: has a loop, not synchronized, and no astore'd object local (those
  // live in the GC-spill array, which is empty at an on-stack entry; frame-arg object
  // locals are re-read from the frame, so they are fine). Keep the bci->block map.
  e.osr_blk = nullptr; e.osr_ok = 0; e.osr_count = 0;
  if (bad == 0) {
    static int osr = -1;
    if (osr < 0) { const char* ev = ::getenv("WASMJIT_OSR"); osr = (ev && ev[0]=='1') ? 1 : 0; }
    bool spilled_local = false;
    for (int k=0;k<maxlocals;k++) if (x.slot_kind[k]==2) { spilled_local = true; break; }
    if (osr && x.has_backedge && !x.sync_method && !spilled_local && x.osr_blk) {
      e.osr_blk = x.osr_blk; e.osr_ok = 1; x.osr_blk = nullptr;   // ownership -> JitEntry
    }
  }
  if (x.osr_blk) { free(x.osr_blk); x.osr_blk = nullptr; }        // not kept
  int status = 1;
  if (bad == -2) {
    status = 2;                                    // transient: unresolved callee
  } else if (bad == 0) {
    Buf mod = {};
    emit_module(&mod, code.p, code.n, &x, argtype, argslot, nargs, rettype);
    // Keep the module bytes (shared) so any thread can instantiate them into its
    // own table on demand. Ownership transfers to the cache entry. Publish e.fn=1
    // with release AFTER bytes/blen so a lock-free reader that sees "compiled" also
    // sees valid bytes.
    e.bytes = mod.p; e.blen = mod.n;
    __atomic_store_n(&e.fn, (intptr_t)1, __ATOMIC_RELEASE);
    status = 0;
    // Per-compile logging is opt-in (WASMJIT_LOG=1): under WASMJIT_ALL, boot
    // compiles hundreds of methods, and a print per compile floods the host's
    // stdout/log pipe (and any UI attached to it).
    static int jit_log = -1;
    if (jit_log < 0) { const char* ev = ::getenv("WASMJIT_LOG"); jit_log = (ev && ev[0]=='1') ? 1 : 0; }
    if (jit_log) tty->print_cr("[wasmjit] compiled %s%s -> wasm module (%d bytes)",
                  m->name()->as_C_string(), m->signature()->as_C_string(), mod.n);
  }
  free(code.p); free(ltype); free(x.slot_kind); free(x.spill_idx); free(x.new_spill);
  return status;
}

// Force-compile m's wasm bytes now (used for invokestatic callees at caller-compile
// time, so the callee is installable on demand). Returns 1 if bytes are ready, 0 if
// ineligible / failed / mid-compile. The -2 sentinel breaks compile cycles.
int wasmjit_force_compile(Method* m) {
  JitEntry& e = *cache_slot(m);
  if (!e.valid || e.m != m) check_eligible(m, e);
  if (e.fn == 1) return 1;        // bytes already compiled
  if (e.fn != 0) return 0;        // -1 ineligible/failed, or -2 in-progress
  e.fn = -2;                      // mark in-progress (recursion guard)
  int st = do_compile(m, e);      // sets e.bytes/e.blen and e.fn=1 on success
  if (st == 0) return 1;
  // Transient (unresolved callee): keep warming and retry on later calls, up to
  // a cap so a call site that never resolves stops re-attempting.
  if (st == 2 && e.count < WASMJIT_HOT_THRESHOLD + 64) { e.fn = 0; return 0; }
  e.fn = -1;                      // permanent (or transient give-up)
  return 0;
}

// ---- per-thread instantiation -------------------------------------------------
// addFunction() installs a JIT'd function into the CALLING thread's indirect table
// and returns an index valid only on that thread (each pthread worker has its own
// table). So the module BYTES are compiled once and shared, but every thread
// instantiates them into its own table on first use, caching the index in a
// thread-local map. This lets JIT'd code run on ANY Java thread (the Swing EDT, the
// AWT paint/publisher thread, app worker threads), not just a single owner.
struct TLIdx { Method* m; int idx; };
static const int TL_N = 8192;
static thread_local TLIdx* tl_cache = nullptr;

int wasmjit_thread_index(Method* m) {
  JitEntry& e = *cache_slot(m);
  if (e.m != m || __atomic_load_n(&e.fn, __ATOMIC_ACQUIRE) != (intptr_t)1 || e.bytes == nullptr) return 0;
  if (tl_cache == nullptr) {
    tl_cache = (TLIdx*)calloc(TL_N, sizeof(TLIdx));
    if (tl_cache == nullptr) return 0;
  }
  unsigned h = (unsigned)(((uintptr_t)m) >> 3) % TL_N;
  TLIdx* slot = nullptr;
  for (int i = 0; i < 64; i++) {
    TLIdx& c = tl_cache[(h + i) % TL_N];
    if (c.m == m) return c.idx > 0 ? c.idx : 0;  // cached: table index, or 0 (install failed -> interpret)
    if (c.m == nullptr) { slot = &c; break; }
  }
  int idx = wasm_jit_install((int)(intptr_t)e.bytes, e.blen, e.nargs);  // this thread's table
  // Cache the outcome either way. If instantiate fails (e.g. a miscompile produced
  // invalid wasm the browser rejects), record idx=-1 so this thread never re-attempts
  // it -- the method degrades to the interpreter instead of re-installing (and re-logging
  // the CompileError) on every call, which would starve the app.
  if (slot != nullptr) { slot->m = m; slot->idx = (idx > 0) ? idx : -1; }
  return idx > 0 ? idx : 0;
}

intptr_t WasmJit::compiled_entry(Method* m) {
  // JIT'd code + its VM helpers (alloc/invoke/poll) assume execution in
  // _thread_in_Java. Only run it when the entering thread is genuinely in that
  // state (a thread mid VM-operation must keep interpreting).
  if (JavaThread::current()->thread_state() != _thread_in_Java) return 0;
  // Lock-free hot path for any *known* method (valid slot). Crucially this must
  // cover the common non-compiled states too: an ineligible method (fn<0) and a
  // still-warming one (fn==0) are hit on essentially every interpreter dispatch,
  // and taking the global mutex on each was fine under a native futex but melts
  // down under emscripten's Atomics.wait mutex once several pthreads contend --
  // JNI_CreateJavaVM never finished in-browser. Only first-touch (claim slot +
  // eligibility) and the one-shot compile take the lock now.
  { JitEntry& e = *cache_slot(m);
    if (__atomic_load_n(&e.valid, __ATOMIC_ACQUIRE) && e.m == m) {
      intptr_t fn = __atomic_load_n(&e.fn, __ATOMIC_ACQUIRE);
      if (fn == 1) return wasmjit_thread_index(m);   // compiled
      if (fn < 0) return 0;                           // ineligible / failed
      // Warming (fn==0): bump the counter lock-free; only the call that crosses
      // the threshold drops into the locked slow path to compile once.
      int threshold = e.eager ? 1 : WASMJIT_HOT_THRESHOLD;
      if (__atomic_add_fetch(&e.count, 1, __ATOMIC_RELAXED) < threshold) return 0;
    }
  }
  // Slow path: first-touch eligibility for an unknown method, or the compile once
  // a warming method crosses its threshold. Serialize cache mutation + codegen.
  bool ready = false;
  pthread_mutex_lock(&g_jit_lock);
  { JitEntry& e = *cache_slot(m);
    if (!e.valid || e.m != m) check_eligible(m, e);
    if (e.fn == 1) ready = true;
    else if (e.fn >= 0) {                             // eligible, warming (M6)
      int threshold = e.eager ? 1 : WASMJIT_HOT_THRESHOLD;
      if (++e.count >= threshold && wasmjit_force_compile(m)) ready = true;
    }
  }
  pthread_mutex_unlock(&g_jit_lock);
  return ready ? wasmjit_thread_index(m) : 0;         // instantiate outside the lock
}

// OSR: called from the interpreter on a taken back-edge. `bci` is the branch target (the
// loop head). Returns that bci's JIT block index (>=0) if the method is compiled AND
// OSR-eligible AND the bci is a block leader with an empty stack; else -1. Counts hot
// back-edges and triggers a compile once past the threshold. The caller then fetches the
// entry with compiled_entry and enters at the returned block via the OSR slot.
static const int WASMJIT_OSR_THRESHOLD = 1000;
int WasmJit::osr_ready(Method* m, int bci) {
  static int osr = -1;
  if (osr < 0) { const char* ev = ::getenv("WASMJIT_OSR"); osr = (ev && ev[0]=='1') ? 1 : 0; }
  if (!osr) return -1;                               // OSR off: no per-back-edge cost
  if (JavaThread::current()->thread_state() != _thread_in_Java) return -1;
  { JitEntry& e = *cache_slot(m);
    if (__atomic_load_n(&e.valid, __ATOMIC_ACQUIRE) && e.m == m) {
      intptr_t fn = __atomic_load_n(&e.fn, __ATOMIC_ACQUIRE);
      if (fn == 1) {                                  // compiled
        if (!e.osr_ok || e.osr_blk == nullptr || bci < 0) return -1;
        int blk = e.osr_blk[bci];
        if (blk > 0) { static int lg=-1; if(lg<0){const char* ev=::getenv("WASMJIT_LOG"); lg=(ev&&ev[0]=='1')?1:0;}
          if(lg) tty->print_cr("[wasmjit] OSR entry %s @bci %d block %d", m->name()->as_C_string(), bci, blk); }
        return blk;                                   // >=0 iff bci is a block leader
      }
      if (fn < 0) return -1;                          // ineligible / failed
    }
  }
  pthread_mutex_lock(&g_jit_lock);                    // warming: count + compile-when-hot
  { JitEntry& e = *cache_slot(m);
    if (!e.valid || e.m != m) check_eligible(m, e);
    if (e.fn == 0 && ++e.osr_count >= WASMJIT_OSR_THRESHOLD) wasmjit_force_compile(m);
  }
  pthread_mutex_unlock(&g_jit_lock);
  return -1;                                          // not ready yet (retry next back-edge)
}

int WasmJit::describe(Method* m, unsigned char* argtypes_out, unsigned char* rettype_out) {
  JitEntry& e = *cache_slot(m);
  if (e.m != m || __atomic_load_n(&e.fn, __ATOMIC_ACQUIRE) != (intptr_t)1) return -1;   // only after compile
  for (int i=0;i<e.nargs;i++) argtypes_out[i] = e.at[i];
  *rettype_out = e.rettype;
  return e.nargs;
}

uint64_t WasmJit::invoke(intptr_t fn, int nargs, uint64_t* args) {
  return wasmjit_call(fn, nargs, args);
}

#else  // !__EMSCRIPTEN__

intptr_t WasmJit::compiled_entry(Method*) { return 0; }
int WasmJit::describe(Method*, unsigned char*, unsigned char*) { return -1; }
uint64_t WasmJit::invoke(intptr_t, int, uint64_t*) { return 0; }

#endif

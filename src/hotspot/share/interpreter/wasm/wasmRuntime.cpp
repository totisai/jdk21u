/*
 * WasmJit — JIT->VM runtime ABI implementation (extern "C" helpers + EM_JS install).
 * See interpreter/wasm/wasmRuntime.hpp.
 */
#include "precompiled.hpp"
#include "interpreter/wasm/wasmJit.hpp"
#include "interpreter/wasm/assembler/wasmBytecodes.hpp"
#include "interpreter/wasm/assembler/wasmAssembler.hpp"
#include "interpreter/wasm/compiler/wasmResolver.hpp"
#include "interpreter/wasm/compiler/wasmCompiler.hpp"
#include "interpreter/wasm/core/wasmDriver.hpp"
#include "oops/method.hpp"
#include "oops/symbol.hpp"
#include "memory/universe.hpp"
#include "oops/constantPool.hpp"
#include "oops/cpCache.hpp"
#include "oops/cpCache.inline.hpp"
#include "oops/resolvedIndyEntry.hpp"
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
#include "interpreter/wasm/wasmRuntime.hpp"
#include "interpreter/wasm/compiler/wasmContext.hpp"   // InvokeDesc
#include "interpreter/wasm/core/wasmDriver.hpp"        // thread_index, wasmjit_call
using namespace wasm;
// M5 safepoint poll: JIT'd loops import and call this at back-edges. Mirrors the
// interpreter's RETURN_SAFEPOINT. Safe for M1's primitive-only scope (JIT frames
// hold no oops, so a safepoint here has no roots to miss). Exported so the
// per-module importObject in wasm_jit_install can wire it up.
extern "C" EMSCRIPTEN_KEEPALIVE void wasmjit_poll() {
  JavaThread* t = JavaThread::current();
  // The poll assumes execution in _thread_in_Java (JIT'd code entered from the
  // interpreter). If the thread is already in another state (e.g. a thread mid
  // VM operation that happens to run a JIT'd method), the ThreadInVMfromJava
  // transition would be illegal -- and such a thread is already safepoint-aware
  // through its own state machinery, so skipping the poll is safe.
  if (t->thread_state() != _thread_in_Java) return;
  if (SafepointMechanism::should_process(t)) {
    ThreadInVMfromJava tiv(t);   // the state transition processes the safepoint
  }
}

// Forward decls: the compiler (below, in an anon namespace) resolves and
// force-compiles invokestatic callees, both implemented near the bottom.
static uint64_t wasmjit_invoke_static_slow(Method* m, uint64_t* a, int nargs);   // VM fallback

// M2 static-field helpers (exported, imported by JIT'd modules). The mirror oop
// is fetched and dereferenced entirely on the C side, so no oop ever lives in the
// JIT frame -> GC-safe without oop-maps. Type codes: 0=int 1=long 2=float 3=double
// 4=byte 5=char 6=short 7=bool.
extern "C" EMSCRIPTEN_KEEPALIVE uint64_t wasmjit_getstatic(intptr_t klass, int off, int tc);
extern "C" EMSCRIPTEN_KEEPALIVE void     wasmjit_putstatic(intptr_t klass, int off, int tc, uint64_t v);

// M2/M4: read a primitive instance field (oop already null-checked by the caller),
// and throw a pending NullPointerException. Only used in poll-free/handler-free
// methods, so no oop is live across a safepoint and an NPE always propagates.
extern "C" EMSCRIPTEN_KEEPALIVE uint64_t wasmjit_getfield(int oopaddr, int off, int tc);
extern "C" EMSCRIPTEN_KEEPALIVE void     wasmjit_putfield(int oopaddr, int off, int tc, uint64_t v);
extern "C" EMSCRIPTEN_KEEPALIVE int      wasmjit_ldc_oop(int cpptr, int idx);
extern "C" EMSCRIPTEN_KEEPALIVE void     wasmjit_throw_npe();
// M2 arrays (primitive elements). tc: 0=int 1=long 2=float 3=double 4=byte 5=char 6=short 7=bool
extern "C" EMSCRIPTEN_KEEPALIVE int      wasmjit_arraylength(int arr);
extern "C" EMSCRIPTEN_KEEPALIVE uint64_t wasmjit_aload(int arr, int idx, int tc);
extern "C" EMSCRIPTEN_KEEPALIVE void     wasmjit_astore(int arr, int idx, int tc, uint64_t v);
extern "C" EMSCRIPTEN_KEEPALIVE int      wasmjit_aastore(int arr, int idx, uint64_t v);
extern "C" EMSCRIPTEN_KEEPALIVE void     wasmjit_throw_aioobe(int idx);


// Instantiate the module bytes and install export "f" into the indirect table.
// Signature is all-i64 ('j') params + i64 result (WASM_BIGINT is enabled).
EM_JS(int, wasm_jit_install, (int ptr, int len, int nargs), {
  try {
    var mod = new WebAssembly.Module(HEAPU8.slice(ptr, ptr + len));
    // Import the VM helpers as the RAW wasm exports (wasmExports[...]), not the JS
    // export wrappers. A raw wasm function used as an import is called wasm->wasm
    // (no JS trampoline, no i64<->BigInt marshaling), so hot-path helpers -- the
    // per-back-edge safepoint poll above all -- don't pay a JS boundary crossing.
    // env.m is the shared linear memory (GC-safe frame re-reads). Signatures match
    // the exported C functions exactly, so the import types validate directly.
    var X = wasmExports;
    var imports = { e: {
      m: wasmMemory,
      p: X['wasmjit_poll'],
      i: X['wasmjit_invoke_static'],
      g: X['wasmjit_getstatic'],
      s: X['wasmjit_putstatic'],
      F: X['wasmjit_getfield'],
      N: X['wasmjit_throw_npe'],
      U: X['wasmjit_putfield'],
      l: X['wasmjit_arraylength'],
      a: X['wasmjit_aload'],
      r: X['wasmjit_astore'],
      b: X['wasmjit_throw_aioobe'],
      o: X['wasmjit_instanceof'],
      c: X['wasmjit_checkcast'],
      A: X['wasmjit_aastore'],
      E: X['wasmjit_oop_enter'],
      L: X['wasmjit_oop_leave'],
      w: X['wasmjit_newarray'],
      W: X['wasmjit_anewarray'],
      z: X['wasmjit_throw_nase'],
      v: X['wasmjit_invoke'],
      x: X['wasmjit_pending'],
      n: X['wasmjit_new'],
      H: X['wasmjit_handler_bci'],
      T: X['wasmjit_take_exception'],
      R: X['wasmjit_athrow'],
      D: X['wasmjit_throw_arith'],
      y: X['wasmjit_multianewarray'],
      Y: X['wasmjit_monitorenter'],
      Z: X['wasmjit_monitorexit'],
      C: X['wasmjit_ldc_oop'],
      k: X['wasmjit_invokedynamic'],
      q: X['wasmjit_osr_bb'],
      e: X['wasmjit_frem'],
      d: X['wasmjit_drem'],
      G: X['wasmjit_static_monitorenter'],
      M: X['wasmjit_static_monitorexit']
    } };
    var inst = new WebAssembly.Instance(mod, imports);
    var sig = 'j'; for (var i = 0; i <= nargs; i++) sig += 'j';   // nargs + localsbase
    return addFunction(inst.exports.f, sig);
  } catch (e) { out('[wasmjit] instantiate failed: ' + e); return 0; }
});

// ---------- eligibility + cache ----------
// fn is a STATE marker (not a table index anymore, so entries are thread-agnostic):
//   1 = compiled: `bytes`/`blen` hold the wasm module, ready to instantiate on any
//       thread;  0 = eligible but still warming up;  -1 = ineligible / failed;
//       -2 = compile in progress (recursion guard).
// The module bytes are shared (C heap is the shared wasm memory); each thread
// instantiates them into ITS OWN indirect-function table on first use -- see the
static uint64_t wasmjit_invoke_static_slow(Method* m, uint64_t* a, int nargs) {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  HandleMark hm(t);
  methodHandle mh(t, m);
  JavaCallArguments args;
  Symbol* sig = m->signature();
  SignatureStream ss(sig);
  int w = 0;
  for (; !ss.at_return_type(); ss.next(), w++) {
    switch (ss.type()) {
      case T_BOOLEAN: case T_BYTE: case T_CHAR: case T_SHORT: case T_INT:
        args.push_int((jint)(uint32_t)a[w]); break;
      case T_LONG:   args.push_long((jlong)a[w]); break;
      case T_FLOAT:  { uint32_t b=(uint32_t)a[w]; jfloat f; memcpy(&f,&b,4); args.push_float(f); } break;
      case T_DOUBLE: { jdouble dd; memcpy(&dd,&a[w],8); args.push_double(dd); } break;
      default: break;   // no object args on this path
    }
  }
  BasicType rt = ss.type();
  JavaValue result(rt);
  JavaCalls::call(&result, mh, &args, t);   // non-virtual: works for static
  if (t->has_pending_exception()) return 0;
  switch (rt) {
    case T_BOOLEAN: case T_BYTE: case T_CHAR: case T_SHORT: case T_INT:
      return (uint64_t)(uint32_t)result.get_jint();
    case T_LONG:   return (uint64_t)result.get_jlong();
    case T_FLOAT:  { jfloat f=result.get_jfloat(); uint32_t b; memcpy(&b,&f,4); return b; }
    case T_DOUBLE: { jdouble dd=result.get_jdouble(); uint64_t b; memcpy(&b,&dd,8); return b; }
    default: return 0;   // void
  }
}

// M3 static-call helper imported by JIT'd modules: invoke a JIT-compiled callee
// with the widened args. No VM re-entry, no oops -> GC-safe.
//
// `fnptr` is the callee Method* (baked at caller-compile time), NOT a table index:
// table indices are per-thread, so we resolve THIS thread's index for the callee
// (installing the shared module into this thread's table on first use). That lets
// a method compiled on one thread call into JIT'd callees on any other thread.
extern "C" EMSCRIPTEN_KEEPALIVE uint64_t wasmjit_invoke_static(
    int fnptr, uint64_t a0, uint64_t a1, uint64_t a2, uint64_t a3,
    uint64_t a4, uint64_t a5, uint64_t a6, uint64_t a7, int nargs) {
  uint64_t a[10] = { a0,a1,a2,a3,a4,a5,a6,a7,0,0 };
  a[nargs] = 0;
  Method* callee = (Method*)(uintptr_t)(uint32_t)fnptr;
  int idx = wasmjit_thread_index(callee);
  if (idx <= 0) return wasmjit_invoke_static_slow(callee, a, nargs);   // install failed: VM call
  return wasmjit_call((intptr_t)idx, nargs+1, a);
}

// M2: read/write a primitive static field. The mirror oop is fetched and
// dereferenced here (C side) so no oop lives in the JIT frame. Non-volatile only.
extern "C" EMSCRIPTEN_KEEPALIVE uint64_t wasmjit_getstatic(intptr_t klass, int off, int tc) {
  oop m = ((Klass*)klass)->java_mirror();
  switch (tc) {
    case 0: return (uint64_t)(uint32_t)(jint)m->int_field(off);
    case 1: return (uint64_t)(jlong)m->long_field(off);
    case 2: { jfloat f = m->float_field(off); uint32_t b; memcpy(&b,&f,4); return b; }
    case 3: { jdouble d = m->double_field(off); uint64_t b; memcpy(&b,&d,8); return b; }
    case 4: return (uint64_t)(uint32_t)(jint)m->byte_field(off);
    case 5: return (uint64_t)(uint32_t)(jint)m->char_field(off);
    case 6: return (uint64_t)(uint32_t)(jint)m->short_field(off);
    case 7: return (uint64_t)(uint32_t)(jint)m->bool_field(off);
    default: return 0;
  }
}
extern "C" EMSCRIPTEN_KEEPALIVE void wasmjit_putstatic(intptr_t klass, int off, int tc, uint64_t v) {
  oop m = ((Klass*)klass)->java_mirror();
  switch (tc) {
    case 0: m->int_field_put(off, (jint)(uint32_t)v); break;
    case 1: m->long_field_put(off, (jlong)v); break;
    case 2: { uint32_t b=(uint32_t)v; jfloat f; memcpy(&f,&b,4); m->float_field_put(off,f); } break;
    case 3: { jdouble d; memcpy(&d,&v,8); m->double_field_put(off,d); } break;
    case 4: m->byte_field_put(off, (jbyte)v); break;
    case 5: m->char_field_put(off, (jchar)v); break;
    case 6: m->short_field_put(off, (jshort)v); break;
    case 7: m->bool_field_put(off, (jboolean)(v & 1)); break;
  }
}

// Read a primitive instance field (receiver already null-checked in JIT'd code).
extern "C" EMSCRIPTEN_KEEPALIVE uint64_t wasmjit_getfield(int oopaddr, int off, int tc) {
  oop o = cast_to_oop((intptr_t)(uint32_t)oopaddr);
  switch (tc) {
    case 0: return (uint64_t)(uint32_t)(jint)o->int_field(off);
    case 1: return (uint64_t)(jlong)o->long_field(off);
    case 2: { jfloat f = o->float_field(off); uint32_t b; memcpy(&b,&f,4); return b; }
    case 3: { jdouble d = o->double_field(off); uint64_t b; memcpy(&b,&d,8); return b; }
    case 4: return (uint64_t)(uint32_t)(jint)o->byte_field(off);
    case 5: return (uint64_t)(uint32_t)(jint)o->char_field(off);
    case 6: return (uint64_t)(uint32_t)(jint)o->short_field(off);
    case 7: return (uint64_t)(uint32_t)(jint)o->bool_field(off);
    case 8: return (uint64_t)(uint32_t)(intptr_t)(void*)o->obj_field(off);  // object field -> oop addr
    default: return 0;
  }
}
// Write an instance field (receiver already null-checked in JIT'd code). tc 8 is
// an object field: obj_field_put carries the SerialGC write barrier (card mark).
extern "C" EMSCRIPTEN_KEEPALIVE void wasmjit_putfield(int oopaddr, int off, int tc, uint64_t v) {
  oop o = cast_to_oop((intptr_t)(uint32_t)oopaddr);
  switch (tc) {
    case 0: o->int_field_put(off, (jint)(uint32_t)v); break;
    case 1: o->long_field_put(off, (jlong)v); break;
    case 2: { uint32_t b=(uint32_t)v; jfloat f; memcpy(&f,&b,4); o->float_field_put(off,f); } break;
    case 3: { jdouble d; memcpy(&d,&v,8); o->double_field_put(off,d); } break;
    case 4: o->byte_field_put(off, (jbyte)v); break;
    case 5: o->char_field_put(off, (jchar)v); break;
    case 6: o->short_field_put(off, (jshort)v); break;
    case 7: o->bool_field_put(off, (jboolean)(v & 1)); break;
    case 8: o->obj_field_put(off, cast_to_oop((intptr_t)(uint32_t)v)); break;  // object field + barrier
  }
}
// Object ldc: resolve a String or Class constant to its oop (interned String / klass
// mirror). `pool_index` is a constant-pool index. javac emits object ldc in two live
// forms -- raw `ldc`/`ldc_w` (operand IS the pool index) and, when the Rewriter quickens
// it, `fast_aldc`/`_w` (operand is a resolved-references index, which the compiler maps
// back to the pool index via object_to_cp_index). Both funnel here. resolve_possibly_
// cached_constant_at reads the cached oop or resolves-and-caches. The compiler restricts
// this to String/Class tags, so resolution is cheap and runs no arbitrary Java. Class
// resolution can throw (CNFE); a pending exception -> return 0 and the JIT'd code
// dispatches/propagates. The returned oop is a produced oop, consumed by the caller like
// getfield-object / wasmjit_new.
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_ldc_oop(int cpptr, int pool_index) {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  ConstantPool* cp = (ConstantPool*)(intptr_t)(uint32_t)cpptr;
  // Reference-cached constants (String/MethodHandle/MethodType/Dynamic) live in the
  // resolved_references array and MUST be resolved via the object-cache index.
  // resolve_constant_at() passes _no_index_sentinel as that index, so string_at_impl
  // reads resolved_reference_at(-1) out of bounds and returns garbage (silently, since
  // the guarding assert is a no-op in a product build). resolve_possibly_cached_
  // constant_at() derives the correct object index via cp_to_object_index() -> the
  // proper cache slot. Class ldc has no object-cache entry -> the plain resolver.
  constantTag tg = cp->tag_at(pool_index);
  oop result = (tg.is_string() || tg.is_method_handle() || tg.is_method_type()
                || tg.is_dynamic_constant())
             ? cp->resolve_possibly_cached_constant_at(pool_index, t)
             : cp->resolve_constant_at(pool_index, t);
  if (t->has_pending_exception()) return 0;
  if (result == Universe::the_null_sentinel()) result = nullptr;
  return (int)(intptr_t)(void*) result;
}
// OSR: read and clear the current thread's pending OSR entry block. The JIT prologue of
// a method with a back-edge calls this to decide where to begin (0 = normal method entry;
// >0 = a mid-method block set by the interpreter's back-edge OSR transfer).
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_osr_bb() {
  JavaThread* t = JavaThread::current();
  int b = t->_wasmjit_osr_bb; t->_wasmjit_osr_bb = 0; return b;
}
// Java float/double remainder (frem/drem 0x72/0x73): a - b*trunc(a/b) with IEEE special
// cases -- exactly C fmod. wasm has no such instruction, so call out (no thread state
// needed; pure math). NaN/inf/zero handled by fmod per JLS 15.17.3.
extern "C" EMSCRIPTEN_KEEPALIVE float  wasmjit_frem(float a, float b)  { return fmodf(a, b); }
extern "C" EMSCRIPTEN_KEEPALIVE double wasmjit_drem(double a, double b) { return fmod(a, b); }
// oop-spill area (C2): reserve n slots on the per-thread GC-scanned spill stack,
// null them, and return the byte address of the reserved region (stable for the
// frame's lifetime -- the array is never realloc'd). leave() pops the frame.
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_oop_enter(int n) {
  JavaThread* t = JavaThread::current();
  if (t->_wasmjit_oops == nullptr) {
    t->_wasmjit_oops_cap = 65536;
    t->_wasmjit_oops = (oop*) malloc(t->_wasmjit_oops_cap * sizeof(oop));
    t->_wasmjit_oops_top = 0;
  }
  int base = t->_wasmjit_oops_top;
  if (base + n > t->_wasmjit_oops_cap) return 0;   // overflow (pathological nesting)
  for (int i = 0; i < n; i++) t->_wasmjit_oops[base + i] = nullptr;
  t->_wasmjit_oops_top = base + n;
  return (int)(intptr_t)(void*) &t->_wasmjit_oops[base];
}
extern "C" EMSCRIPTEN_KEEPALIVE void wasmjit_oop_leave(int n) {
  JavaThread::current()->_wasmjit_oops_top -= n;
}
// Set a pending NullPointerException on the current thread; the JIT'd method
// then returns immediately and the interpreter propagates it.
extern "C" EMSCRIPTEN_KEEPALIVE void wasmjit_throw_npe() {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);   // VM work (allocates the exception) must run in-VM
  Exceptions::_throw_msg(t, __FILE__, __LINE__, vmSymbols::java_lang_NullPointerException(), nullptr);
}
// instanceof: null -> 0, else subtype check. No allocation/safepoint -> the oop
// (frame-read, transient) is never live across a GC.
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_instanceof(int oopaddr, int klassptr) {
  if (oopaddr == 0) return 0;
  Klass* target = (Klass*)(intptr_t)(uint32_t)klassptr;
  Klass* ok = cast_to_oop((intptr_t)(uint32_t)oopaddr)->klass();
  return (ok == target || ok->is_subtype_of(target)) ? 1 : 0;
}
// checkcast: null or subtype -> 0 (ok); else set pending ClassCastException and
// return 1 so the JIT'd code stops before any further side effect.
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_checkcast(int oopaddr, int klassptr) {
  if (oopaddr == 0) return 0;
  Klass* target = (Klass*)(intptr_t)(uint32_t)klassptr;
  Klass* ok = cast_to_oop((intptr_t)(uint32_t)oopaddr)->klass();
  if (ok == target || ok->is_subtype_of(target)) return 0;
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  Exceptions::_throw_msg(t, __FILE__, __LINE__, vmSymbols::java_lang_ClassCastException(), nullptr);
  return 1;
}
// Array allocation (C2). Count is >= 0 (the JIT checks < 0 -> NegativeArraySize).
// Returns the array oop, or 0 with a pending exception (OOM). May GC: the only
// live JIT-frame oops (args in the frame, astore'd locals in the spill array) are
// scanned, and the fresh array oop is astore'd (spilled) right after.
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_newarray(int atype, int count) {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  typeArrayOop a = oopFactory::new_typeArray((BasicType)atype, count, t);
  if (t->has_pending_exception()) return 0;
  return (int)(intptr_t)(void*) a;
}
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_anewarray(int element_klass, int count) {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  objArrayOop a = oopFactory::new_objArray((Klass*)(intptr_t)(uint32_t)element_klass, count, t);
  if (t->has_pending_exception()) return 0;
  return (int)(intptr_t)(void*) a;
}
// C4.2 monitorenter/monitorexit (synchronized BLOCKS). jni_enter/jni_exit lock via
// the inflated ObjectMonitor -- no interpreter-frame BasicLock needed. The oop is
// Handle-ized before enter() (which blocks at a safepoint), so a moving GC is safe.
// jni_exit tolerates a non-owner/pending-exception (the unlock-on-throw path). The
// caller guarantees non-null (inline null->NPE check). Returns 1 if it left a
// pending exception (e.g. OOM from inflate), else 0.
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_monitorenter(int oopaddr) {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  Handle h(t, (oop)(intptr_t)(uint32_t)oopaddr);
  ObjectSynchronizer::jni_enter(h, t);
  return t->has_pending_exception() ? 1 : 0;
}
// static-synchronized: lock/unlock the holder's Class mirror (there is no `this`). The
// klass ptr is baked (metaspace, stable); the mirror is fetched + Handle-ized here, so a
// moving GC across enter/exit is safe. Returns 1 if enter left a pending exception.
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_static_monitorenter(int klassptr) {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  Handle h(t, ((Klass*)(intptr_t)(uint32_t)klassptr)->java_mirror());
  ObjectSynchronizer::jni_enter(h, t);
  return t->has_pending_exception() ? 1 : 0;
}
extern "C" EMSCRIPTEN_KEEPALIVE void wasmjit_static_monitorexit(int klassptr) {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  Handle h(t, ((Klass*)(intptr_t)(uint32_t)klassptr)->java_mirror());
  ObjectSynchronizer::jni_exit(h(), t);
}
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_monitorexit(int oopaddr) {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  ObjectSynchronizer::jni_exit((oop)(intptr_t)(uint32_t)oopaddr, t);
  return t->has_pending_exception() ? 1 : 0;
}
// C2.2 multianewarray (currently 2 dimensions): allocate a[d0][d1] of the resolved
// array klass. Throws NegativeArraySize on a negative dim (-> pending, return 0).
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_multianewarray(int klassptr, int ndims,
    int d0, int d1, int d2, int d3) {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  jint dims[4] = { d0, d1, d2, d3 };   // JIT bails ndims>4 at compile time
  Klass* k = (Klass*)(intptr_t)(uint32_t)klassptr;
  oop a = ArrayKlass::cast(k)->multi_allocate(ndims, dims, t);
  if (t->has_pending_exception()) return 0;
  return (int)(intptr_t)(void*) a;
}
extern "C" EMSCRIPTEN_KEEPALIVE void wasmjit_throw_nase() {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  Exceptions::_throw_msg(t, __FILE__, __LINE__, vmSymbols::java_lang_NegativeArraySizeException(), nullptr);
}
extern "C" EMSCRIPTEN_KEEPALIVE void wasmjit_throw_aioobe(int idx) {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  char msg[32]; jio_snprintf(msg, sizeof(msg), "Index %d", idx);
  Exceptions::_throw_msg(t, __FILE__, __LINE__,
                         vmSymbols::java_lang_ArrayIndexOutOfBoundsException(), msg);
}
// Primitive array element access (arr already null-checked + bounds-checked in
// JIT'd code). No oop lives across a safepoint (poll-free/handler-free gate).
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_arraylength(int arr) {
  return arrayOop(cast_to_oop((intptr_t)(uint32_t)arr))->length();
}
extern "C" EMSCRIPTEN_KEEPALIVE uint64_t wasmjit_aload(int arr, int idx, int tc) {
  typeArrayOop a = typeArrayOop(cast_to_oop((intptr_t)(uint32_t)arr));
  switch (tc) {
    case 0: return (uint64_t)(uint32_t)(jint)a->int_at(idx);
    case 1: return (uint64_t)(jlong)a->long_at(idx);
    case 2: { jfloat f = a->float_at(idx); uint32_t b; memcpy(&b,&f,4); return b; }
    case 3: { jdouble d = a->double_at(idx); uint64_t b; memcpy(&b,&d,8); return b; }
    case 4: return (uint64_t)(uint32_t)(jint)a->byte_at(idx);
    case 5: return (uint64_t)(uint32_t)(jint)a->char_at(idx);
    case 6: return (uint64_t)(uint32_t)(jint)a->short_at(idx);
    case 7: return (uint64_t)(uint32_t)(jint)a->bool_at(idx);
    case 8: { objArrayOop oa = objArrayOop(cast_to_oop((intptr_t)(uint32_t)arr));  // aaload
             return (uint64_t)(uint32_t)(intptr_t)(void*)oa->obj_at(idx); }
    default: return 0;
  }
}
// aastore: array-store type check (-> ArrayStoreException, returns 1) then a
// barriered oop store. arr already null-checked + bounds-checked in JIT'd code.
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_aastore(int arr, int idx, uint64_t v) {
  objArrayOop a = objArrayOop(cast_to_oop((intptr_t)(uint32_t)arr));
  oop val = cast_to_oop((intptr_t)(uint32_t)v);
  if (val != nullptr) {
    Klass* et = ObjArrayKlass::cast(a->klass())->element_klass();
    Klass* vk = val->klass();
    if (vk != et && !vk->is_subtype_of(et)) {
      JavaThread* t = JavaThread::current();
      ThreadInVMfromJava __tiv(t);
      Exceptions::_throw_msg(t, __FILE__, __LINE__, vmSymbols::java_lang_ArrayStoreException(), nullptr);
      return 1;
    }
  }
  a->obj_at_put(idx, val);   // includes the SerialGC write barrier
  return 0;
}
extern "C" EMSCRIPTEN_KEEPALIVE void wasmjit_astore(int arr, int idx, int tc, uint64_t v) {
  typeArrayOop a = typeArrayOop(cast_to_oop((intptr_t)(uint32_t)arr));
  switch (tc) {
    case 0: a->int_at_put(idx, (jint)(uint32_t)v); break;
    case 1: a->long_at_put(idx, (jlong)v); break;
    case 2: { uint32_t b=(uint32_t)v; jfloat f; memcpy(&f,&b,4); a->float_at_put(idx,f); } break;
    case 3: { jdouble d; memcpy(&d,&v,8); a->double_at_put(idx,d); } break;
    case 4: // bastore serves byte[] and boolean[]; the latter masks to 0/1
      if (TypeArrayKlass::cast(a->klass())->element_type() == T_BOOLEAN)
        a->bool_at_put(idx, (jboolean)(v & 1));
      else a->byte_at_put(idx, (jbyte)v);
      break;
    case 5: a->char_at_put(idx, (jchar)v); break;
    case 6: a->short_at_put(idx, (jshort)v); break;
    case 7: a->bool_at_put(idx, (jboolean)(v & 1)); break;
  }
}

// ---- C3: general invoke ----
// Select the concrete target for invokeinterface on receiver class `rk`, mirroring
// the Zero interpreter's _invokeinterface case. Returns nullptr with a pending
// exception (ICCE/AME) on error.
static Method* wasmjit_select_itable(ConstantPoolCacheEntry* cache, Klass* rk, JavaThread* t) {
  if (cache->is_forced_virtual()) {                    // java.lang.Object method via interface
    if (cache->is_vfinal()) return cache->f2_as_vfinal_method();
    return (Method*) rk->method_at_vtable(cache->f2_as_index());
  }
  if (cache->is_vfinal()) {                            // private interface method
    Klass* resolved_klass = cache->f1_as_klass();
    if (!rk->is_subtype_of(resolved_klass)) {
      Exceptions::_throw_msg(t, __FILE__, __LINE__,
        vmSymbols::java_lang_IncompatibleClassChangeError(), nullptr);
      return nullptr;
    }
    return cache->f2_as_vfinal_method();
  }
  Method* interface_method = cache->f2_as_interface_method();
  InstanceKlass* iclass = interface_method->method_holder();
  InstanceKlass* int2 = (InstanceKlass*) rk;
  Klass* refc = cache->f1_as_klass();
  { itableOffsetEntry* scan = (itableOffsetEntry*) int2->start_of_itable();
    for (; scan->interface_klass() != nullptr; scan++) if (scan->interface_klass() == refc) break;
    if (scan->interface_klass() == nullptr) {
      Exceptions::_throw_msg(t, __FILE__, __LINE__,
        vmSymbols::java_lang_IncompatibleClassChangeError(), nullptr);
      return nullptr;
    }
  }
  itableOffsetEntry* ki = (itableOffsetEntry*) int2->start_of_itable();
  int i; for (i = 0; i < int2->itable_length(); i++, ki++) if (ki->interface_klass() == iclass) break;
  if (i == int2->itable_length()) {
    Exceptions::_throw_msg(t, __FILE__, __LINE__,
      vmSymbols::java_lang_IncompatibleClassChangeError(), nullptr);
    return nullptr;
  }
  int mindex = interface_method->itable_index();
  itableMethodEntry* im = ki->first_method_entry(rk);
  Method* callee = im[mindex].method();
  if (callee == nullptr) {
    Exceptions::_throw_msg(t, __FILE__, __LINE__,
      vmSymbols::java_lang_AbstractMethodError(), nullptr);
    return nullptr;
  }
  return callee;
}

// Reserve n nulled slots on the per-thread shadow stack; returns the base index, or
// -1 on overflow/OOM. The shadow stack is a GC root (JavaThread::oops_do), so any oop
// stored in [base, base+n) survives — and is relocated in place by — a safepoint/GC.
// Only the owning thread mutates its own shadow stack, and GC scans it only while the
// thread is parked at a safepoint, so writing it from _thread_in_Java is race-free.
static int wasmjit_shadow_reserve(JavaThread* t, int n) {
  if (t->_wasmjit_oops == nullptr) {
    t->_wasmjit_oops_cap = 65536;
    t->_wasmjit_oops = (oop*) malloc(t->_wasmjit_oops_cap * sizeof(oop));
    t->_wasmjit_oops_top = 0;
  }
  if (t->_wasmjit_oops_top + n > t->_wasmjit_oops_cap) return -1;
  int b = t->_wasmjit_oops_top;
  for (int i = 0; i < n; i++) t->_wasmjit_oops[b + i] = nullptr;
  t->_wasmjit_oops_top = b + n;
  return b;
}

// Marshal args from the widened i64 words (one per JIT-stack value; a[0] is the
// receiver) into a JavaCallArguments, rooting every oop in a Handle BEFORE any
// resolution/allocation that could GC, then dispatch. Returns the widened result,
// or 0 with a pending exception (the JIT then early-returns).
//
// GC-safety: the oop words in aw[] were copied out of the caller's wasm frame and are
// not otherwise scanned. Both the entry transition (_thread_in_Java -> _thread_in_vm)
// and the exit transition can block at a safepoint for a concurrent (moving) GC. So we
// root the oop ARGS in the shadow stack BEFORE entering VM state, read the relocated
// values back once in-VM, and stash the RESULT oop in the shadow stack BEFORE leaving
// VM state, reading it back after the exit transition. Without this, aw[] / the result
// go stale across those safepoints and we Handle-ize (or return) dangling pointers.
static uint64_t wasmjit_invoke_common(InvokeDesc* d, uint64_t* aw) {
  JavaThread* t = JavaThread::current();
  Symbol* sig = d->sig;
  // kind 3 = invokestatic: no receiver, args start at aw[0]. Otherwise aw[0] is the
  // receiver and params start at aw[1].
  bool is_static = (d->kind == 3);
  int base = is_static ? 0 : 1;

  // Collect oop-arg positions (SignatureStream neither allocates nor safepoints, so this
  // is safe while still _thread_in_Java) and root them, plus one trailing result slot.
  int oidx[18]; int noop = 0;
  if (!is_static) oidx[noop++] = 0;
  { int w = base;
    for (SignatureStream ss(sig); !ss.at_return_type(); ss.next(), w++)
      if (is_reference_type(ss.type())) oidx[noop++] = w; }
  int sbase = wasmjit_shadow_reserve(t, noop + 1);   // +1 = result slot
  if (sbase >= 0)
    for (int i = 0; i < noop; i++)
      t->_wasmjit_oops[sbase + i] = cast_to_oop((intptr_t)(uint32_t)aw[oidx[i]]);

  BasicType rt = T_VOID;
  uint64_t prim = 0;
  bool oop_result = false;
  {
    ThreadInVMfromJava __tiv(t);   // JavaCalls + arg rooting must run in-VM (safepoint-safe)
    HandleMark hm(t);
    // Read the (possibly relocated) arg oops back out of the shadow stack.
    if (sbase >= 0)
      for (int i = 0; i < noop; i++)
        aw[oidx[i]] = (uint64_t)(uint32_t)(intptr_t)(void*) t->_wasmjit_oops[sbase + i];

    Handle receiver;
    if (!is_static) {
      receiver = Handle(t, cast_to_oop((intptr_t)(uint32_t)aw[0]));
      if (receiver.is_null()) {
        Exceptions::_throw_msg(t, __FILE__, __LINE__, vmSymbols::java_lang_NullPointerException(), nullptr);
        if (sbase >= 0) t->_wasmjit_oops_top = sbase;
        return 0;
      }
    }
    Handle oh[16];                              // pre-root oop args (GC-safe)
    { int w = base;
      for (SignatureStream ss(sig); !ss.at_return_type(); ss.next(), w++)
        if (is_reference_type(ss.type())) oh[w] = Handle(t, cast_to_oop((intptr_t)(uint32_t)aw[w]));
    }
    JavaCallArguments args;
    if (!is_static) args.push_oop(receiver);
    SignatureStream ss(sig);
    for (int w = base; !ss.at_return_type(); ss.next(), w++) {
      switch (ss.type()) {
        case T_BOOLEAN: case T_BYTE: case T_CHAR: case T_SHORT: case T_INT:
          args.push_int((jint)(uint32_t)aw[w]); break;
        case T_LONG:   args.push_long((jlong)aw[w]); break;
        case T_FLOAT:  { uint32_t b=(uint32_t)aw[w]; jfloat f; memcpy(&f,&b,4); args.push_float(f); } break;
        case T_DOUBLE: { jdouble dd; memcpy(&dd,&aw[w],8); args.push_double(dd); } break;
        case T_OBJECT: case T_ARRAY: args.push_oop(oh[w]); break;
        default: break;
      }
    }
    rt = ss.type();   // now positioned at the return type
    JavaValue result(rt);
    // Resolve the concrete target on the receiver's actual class, then call it
    // directly (JavaCalls::call is non-virtual -- the dispatch already happened).
    Method* target = nullptr;
    if (is_static || d->kind == 0) {
      target = d->direct;                                          // static / special / vfinal
    } else if (d->kind == 1) {
      target = (Method*) receiver->klass()->method_at_vtable(d->vindex);  // non-final invokevirtual
    } else {
      target = wasmjit_select_itable(d->entry, receiver->klass(), t);     // invokeinterface
      if (target == nullptr) { if (sbase >= 0) t->_wasmjit_oops_top = sbase; return 0; }  // pending ICCE/AME
    }
    methodHandle mh(t, target);
    JavaCalls::call(&result, mh, &args, t);
    if (t->has_pending_exception()) { if (sbase >= 0) t->_wasmjit_oops_top = sbase; return 0; }
    switch (rt) {
      case T_BOOLEAN: case T_BYTE: case T_CHAR: case T_SHORT: case T_INT:
        prim = (uint64_t)(uint32_t)result.get_jint(); break;
      case T_LONG:   prim = (uint64_t)result.get_jlong(); break;
      case T_FLOAT:  { jfloat f=result.get_jfloat(); uint32_t b; memcpy(&b,&f,4); prim = b; } break;
      case T_DOUBLE: { jdouble dd=result.get_jdouble(); uint64_t b; memcpy(&b,&dd,8); prim = b; } break;
      case T_OBJECT: case T_ARRAY:
        oop_result = true;
        if (sbase >= 0) t->_wasmjit_oops[sbase + noop] = result.get_oop();   // root across exit safepoint
        else prim = (uint64_t)(uint32_t)(intptr_t)(void*)result.get_oop();
        break;
      default: break;   // void
    }
  }   // __tiv destructor: transition back to Java (may safepoint; result slot relocated)

  uint64_t ret = prim;
  if (oop_result && sbase >= 0)
    ret = (uint64_t)(uint32_t)(intptr_t)(void*) t->_wasmjit_oops[sbase + noop];
  if (sbase >= 0) t->_wasmjit_oops_top = sbase;   // release the region (still no safepoint before return)
  return ret;
}
// 1 if the current thread has a pending exception (the JIT checks this after any
// call that can throw, then early-returns so the interpreter hook propagates it).
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_pending() {
  return JavaThread::current()->has_pending_exception() ? 1 : 0;
}
extern "C" EMSCRIPTEN_KEEPALIVE uint64_t wasmjit_invoke(int descptr,
    uint64_t a0, uint64_t a1, uint64_t a2, uint64_t a3,
    uint64_t a4, uint64_t a5, uint64_t a6, uint64_t a7, int nwords) {
  (void)nwords;   // trailing param present only to reuse the invoke_static type (type2)
  uint64_t aw[16] = { a0,a1,a2,a3,a4,a5,a6,a7,0,0,0,0,0,0,0,0 };
  return wasmjit_invoke_common((InvokeDesc*)(intptr_t)(uint32_t)descptr, aw);
}
// invokedynamic: the call site is already resolved (JIT gates on it), so fetch the
// linked adapter + appendix from the ResolvedIndyEntry and JavaCall the adapter with
// [dynamic args..., appendix]. Mirrors the Zero interpreter's _invokedynamic handler
// (which pushes the appendix then calls the adapter). Every oop arg + the appendix are
// Handle-rooted before the call. Returns 0 with pending exception on throw.
extern "C" EMSCRIPTEN_KEEPALIVE uint64_t wasmjit_invokedynamic(int descptr,
    uint64_t a0, uint64_t a1, uint64_t a2, uint64_t a3,
    uint64_t a4, uint64_t a5, uint64_t a6, uint64_t a7, int nargs) {
  (void)nargs;
  JavaThread* t = JavaThread::current();
  IndyDesc* d = (IndyDesc*)(intptr_t)(uint32_t)descptr;
  ConstantPool* cp = d->cp;
  int entry_idx = ConstantPool::decode_invokedynamic_index(d->which);
  uint64_t aw[8] = { a0,a1,a2,a3,a4,a5,a6,a7 };
  Symbol* sig = cp->signature_ref_at(d->which, Bytecodes::_invokedynamic);  // call-site (args)ret

  // Root the dynamic-arg oops in the shadow stack before the in-VM transition below
  // (which may safepoint for a concurrent moving GC), plus one trailing result slot.
  // See wasmjit_invoke_common for why aw[] would otherwise go stale. (The appendix is
  // fetched fresh AFTER the transition, so it needs no pre-rooting.)
  int oidx[18]; int noop = 0;
  { int w = 0;
    for (SignatureStream ss(sig); !ss.at_return_type(); ss.next(), w++)
      if (is_reference_type(ss.type())) oidx[noop++] = w; }
  int sbase = wasmjit_shadow_reserve(t, noop + 1);   // +1 = result slot
  if (sbase >= 0)
    for (int i = 0; i < noop; i++)
      t->_wasmjit_oops[sbase + i] = cast_to_oop((intptr_t)(uint32_t)aw[oidx[i]]);

  BasicType rt = T_VOID;
  uint64_t prim = 0;
  bool oop_result = false;
  {
    ThreadInVMfromJava __tiv(t);
    HandleMark hm(t);
    if (sbase >= 0)
      for (int i = 0; i < noop; i++)
        aw[oidx[i]] = (uint64_t)(uint32_t)(intptr_t)(void*) t->_wasmjit_oops[sbase + i];

    ResolvedIndyEntry* e = cp->resolved_indy_entry_at(entry_idx);
    Method* invoker = e->method();                     // the resolved adapter (static)
    Handle oh[16];                                     // pre-root oop dynamic args
    { int w = 0;
      for (SignatureStream ss(sig); !ss.at_return_type(); ss.next(), w++)
        if (is_reference_type(ss.type())) oh[w] = Handle(t, cast_to_oop((intptr_t)(uint32_t)aw[w])); }
    Handle appendix;
    if (e->has_appendix()) appendix = Handle(t, cp->resolved_reference_from_indy(entry_idx));
    JavaCallArguments args;
    { SignatureStream ss(sig); int w = 0;
      for (; !ss.at_return_type(); ss.next(), w++) {
        switch (ss.type()) {
          case T_BOOLEAN: case T_BYTE: case T_CHAR: case T_SHORT: case T_INT:
            args.push_int((jint)(uint32_t)aw[w]); break;
          case T_LONG:   args.push_long((jlong)aw[w]); break;
          case T_FLOAT:  { uint32_t b=(uint32_t)aw[w]; jfloat f; memcpy(&f,&b,4); args.push_float(f); } break;
          case T_DOUBLE: { jdouble dd; memcpy(&dd,&aw[w],8); args.push_double(dd); } break;
          case T_OBJECT: case T_ARRAY: args.push_oop(oh[w]); break;
          default: break;
        }
      } }
    if (e->has_appendix()) args.push_oop(appendix);    // appendix is the adapter's last arg
    SignatureStream rss(sig); while (!rss.at_return_type()) rss.next();
    rt = rss.type();
    JavaValue result(rt);
    JavaCalls::call(&result, methodHandle(t, invoker), &args, t);
    if (t->has_pending_exception()) { if (sbase >= 0) t->_wasmjit_oops_top = sbase; return 0; }
    switch (rt) {
      case T_BOOLEAN: case T_BYTE: case T_CHAR: case T_SHORT: case T_INT:
        prim = (uint64_t)(uint32_t)result.get_jint(); break;
      case T_LONG:   prim = (uint64_t)result.get_jlong(); break;
      case T_FLOAT:  { jfloat f=result.get_jfloat(); uint32_t b; memcpy(&b,&f,4); prim = b; } break;
      case T_DOUBLE: { jdouble dd=result.get_jdouble(); uint64_t b; memcpy(&b,&dd,8); prim = b; } break;
      case T_OBJECT: case T_ARRAY:
        oop_result = true;
        if (sbase >= 0) t->_wasmjit_oops[sbase + noop] = result.get_oop();
        else prim = (uint64_t)(uint32_t)(intptr_t)(void*)result.get_oop();
        break;
      default: break;   // void
    }
  }   // __tiv destructor: transition back to Java (may safepoint; result slot relocated)

  uint64_t ret = prim;
  if (oop_result && sbase >= 0)
    ret = (uint64_t)(uint32_t)(intptr_t)(void*) t->_wasmjit_oops[sbase + noop];
  if (sbase >= 0) t->_wasmjit_oops_top = sbase;
  return ret;
}
// Allocate an uninitialized instance of the resolved klass for `new` (klassptr =
// baked Klass*). May GC (only pre-existing scanned oops are live); the fresh oop
// is spilled by the JIT right after. Returns 0 with pending exception on failure.
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_new(int klassptr) {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  InstanceKlass* ik = InstanceKlass::cast((Klass*)(intptr_t)(uint32_t)klassptr);
  oop obj = ik->allocate_instance(t);
  if (t->has_pending_exception()) return 0;
  return (int)(intptr_t)(void*) obj;
}

// ---- C4: exceptions ----
// Look up the handler bci for the pending exception thrown at `bci` in method
// `methodptr`, mirroring the interpreter. Keeps the exception pending (the JIT's
// handler prologue takes it). Returns the handler bci, or -1 to propagate.
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_handler_bci(int methodptr, int bci) {
  JavaThread* t = JavaThread::current();
  if (!t->has_pending_exception()) return -1;
  Method* m = (Method*)(intptr_t)(uint32_t)methodptr;
  Handle ex(t, t->pending_exception());
  t->clear_pending_exception();                 // lookup may run <clinit> of catch types
  methodHandle mh(t, m);
  int hbci;
  { ThreadInVMfromJava __tiv(t);                // the lookup can load classes / safepoint
    hbci = Method::fast_exception_handler_bci_for(mh, ex->klass(), bci, t); }
  if (t->has_pending_exception()) {             // exception during lookup -> propagate that one
    return -1;
  }
  t->set_pending_exception(ex(), nullptr, 0);   // restore for the handler prologue / propagation
  return hbci;
}
// Take (and clear) the pending exception oop for a handler prologue.
extern "C" EMSCRIPTEN_KEEPALIVE int wasmjit_take_exception() {
  JavaThread* t = JavaThread::current();
  oop ex = t->pending_exception();
  t->clear_pending_exception();
  return (int)(intptr_t)(void*) ex;
}
// Divide/remainder by zero -> ArithmeticException. The JIT then dispatches.
extern "C" EMSCRIPTEN_KEEPALIVE void wasmjit_throw_arith() {
  JavaThread* t = JavaThread::current();
  ThreadInVMfromJava __tiv(t);
  Exceptions::_throw_msg(t, __FILE__, __LINE__, vmSymbols::java_lang_ArithmeticException(), "/ by zero");
}
// athrow: null receiver -> NPE, else set the oop pending. The JIT then dispatches.
extern "C" EMSCRIPTEN_KEEPALIVE void wasmjit_athrow(int oopaddr) {
  JavaThread* t = JavaThread::current();
  if (oopaddr == 0) {
    ThreadInVMfromJava __tiv(t);
    Exceptions::_throw_msg(t, __FILE__, __LINE__, vmSymbols::java_lang_NullPointerException(), nullptr);
    return;
  }
  t->set_pending_exception(cast_to_oop((intptr_t)(uint32_t)oopaddr), nullptr, 0);
}

#endif // __EMSCRIPTEN__

/*
 * WasmJit — the per-method compile context (Ctx) and the C3 call-site descriptor
 * (InvokeDesc), shared by the resolver, compiler, assembler, and runtime layers.
 * See interpreter/wasm/wasmJit.hpp.
 */
#ifndef SHARE_INTERPRETER_WASM_COMPILER_WASMCONTEXT_HPP
#define SHARE_INTERPRETER_WASM_COMPILER_WASMCONTEXT_HPP

#include "interpreter/wasm/assembler/wasmBytecodes.hpp"   // value-type tags
#include "oops/method.hpp"
#include "oops/constantPool.hpp"
#include "oops/cpCache.hpp"

namespace wasm {

// C3 call-site descriptor (baked into the module as an i32 ptr).
//   kind 0 = direct  (invokespecial / vfinal invokevirtual): `direct` is the target.
//   kind 1 = vtable  (non-final invokevirtual): dispatch via receiver vtable[vindex].
//   kind 2 = interface (invokeinterface): itable dispatch via the baked cache entry.
struct InvokeDesc { int kind; Method* direct; Symbol* sig; int vindex; ConstantPoolCacheEntry* entry; };
// invokedynamic: the compiling method's constant pool + the (encoded, negative) per-
// instruction index, baked so the runtime helper can fetch the resolved adapter+appendix.
struct IndyDesc { ConstantPool* cp; int which; };

// Compile context: local index base (params occupy 0..nargs-1) + slot types + temps.
struct Ctx {
  int base;              // = nargs; java local k -> wasm local base+k
  int maxlocals;
  const uint8_t* ltype;  // wasm value type per java slot (i32/i64/f32/f64)
  ConstantPool* cp;
  Method* method;        // caller, for resolving invokestatic callees (M3)
  // temp local indices
  uint32_t BB, TMPI, TMPJ, TMPJ2, TMPF, TMPF2, TMPD, TMPD2;
  uint32_t ARG0;         // ARG0..ARG7: i64 arg-spill temps for invokestatic
  uint32_t TMPI2;        // second i32 temp (array index)
  uint32_t SH0;          // SH0..SH3: i64 stack-shuffle temps (any value widened to i64)
  uint32_t LB;           // i32: interpreter frame `locals` base (for GC-safe oop re-reads)
  // per-block operand value-type stack (for dup/pop discrimination)
  int* vt; int vn;
  bool has_backedge;     // set by compile_cf if the method contains a loop
  bool uses_oop;         // set if the method loads/derefs an object (getfield/aload)
  bool has_call;         // set if the method has an invokestatic
  bool produces_oop;     // set if a raw (non-frame) oop is produced (checkcast/...)
  bool has_alloc;        // set if the method has a newarray/anewarray (a safepoint)
  bool bail;             // set during emit if a GC-unsafe stack shape is seen (-> interpreter)
  // per-slot object-local kind: 0 = not an object local; 1 = frame (object arg,
  // re-read from locals[]); 2 = spill (astore'd -> GC-scanned oop-spill array).
  uint8_t* slot_kind; int* spill_idx; int n_spill; uint32_t SB;
  // C2.2 `new`: per-site oop-spill slot (pc -> spill index, else -1). The fresh
  // object is stored here and reloaded after the constructor safepoint.
  int* new_spill; int skip_dup;
  int* vspill;           // parallel to vt: spill slot backing a stack oop, else -1
  // C4 exceptions: in-JIT try/catch handler dispatch.
  bool has_handlers;     // method has an exception table we can dispatch (else propagate)
  bool sync_method;      // ACC_SYNCHRONIZED instance method: lock `this` in the prologue,
                         // unlock on every return + the exception-propagate path (C4.2)
  int* blk_of;           // pc -> block index (for handler dispatch targets)
  int* osr_blk;          // OSR: transferred blk_of (bci->block) kept for the JitEntry, or null
  int vn0;               // operand-stack depth at the current op's entry (leftover check)
};

} // namespace wasm

#endif // SHARE_INTERPRETER_WASM_COMPILER_WASMCONTEXT_HPP

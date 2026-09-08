/*
 * WasmJit — bytecode -> WebAssembly code emission: emit_op (the per-bytecode
 * translator) and its helpers + the operand value-type stack. See wasmCompiler.hpp.
 */
#include "precompiled.hpp"
#include "interpreter/wasm/wasmJit.hpp"
#include "interpreter/wasm/assembler/wasmBytecodes.hpp"
#include "interpreter/wasm/assembler/wasmAssembler.hpp"
#include "interpreter/wasm/compiler/wasmResolver.hpp"
#include "interpreter/wasm/core/wasmDriver.hpp"
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
#include "interpreter/wasm/compiler/wasmCompiler.hpp"
#include "interpreter/wasm/core/wasmImports.hpp"
#include "interpreter/wasm/compiler/wasmCompilerInternal.hpp"
#ifdef __EMSCRIPTEN__
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
namespace wasm {


// Emit an exception/early return: pop the oop-spill frame (if any), push a dummy
// i64 result, and return. Every return path must go through here.
static void emit_early_return(Ctx* x, Buf* c){
  emit_sync_unlock(x, c);                                                              // sync method: unlock before propagating
  if (x->n_spill > 0) { i32_const(c,x->n_spill); emit_call(c,Imp::OOP_LEAVE); }  // call $leave
  i64_const(c,0); ret(c);                                            // i64.const 0; return
}
// C4: on a pending exception, either dispatch to an in-method handler or propagate.
// Called from inside a single op-level `if` (so `br 3` reaches the dispatch loop).
// The leftover expression stack must be empty for a clean unwind (else bail).
static void emit_exc(Ctx* x, Buf* c, int pc){
  const uint8_t* bc = x->method->code_base();
  if (!x->has_handlers) { emit_early_return(x, c); return; }
  if (x->vn0 - op_consumed(x, bc, pc) != 0) x->bail = true;   // non-empty leftover -> can't unwind
  i32_const(c,(int32_t)(intptr_t)x->method);
  i32_const(c,pc);
  emit_call(c,Imp::HANDLER_BCI);                                   // call $handler_bci -> i32 hbci
  tee_local(c, x->TMPI);
  i32_const(c,0); bput(c,op_i32_lt_s);                      // hbci < 0 ?
  if_void(c);                                 // if (<0) propagate
    emit_early_return(x, c);
  emit_else(c);                                               // else dispatch to handler block
    { int n = x->method->exception_table_length();
      ExceptionTableElement* et = x->method->exception_table_start();
      for (int i=0;i<n;i++) {
        int H = et[i].handler_pc;
        bool dup = false; for (int j=0;j<i;j++) if ((int)et[j].handler_pc==H) { dup=true; break; }
        if (dup) continue;
        get_local(c,x->TMPI); i32_const(c,H); bput(c,op_i32_eq);   // hbci == H ?
        if_void(c);
          i32_const(c,x->blk_of[H]); set_local(c,x->BB);
        emit_end(c);
      }
    }
    br(c,3);                                  // br loop (dispatch)
  emit_end(c);                                               // end if(<0)
}
// aload: object args live in the frame (locals[-slot] = LB-slot*4, re-read for GC);
// astore'd object locals live in the GC-scanned spill array (SB+idx*4).
static void emit_aload(Ctx* x, Buf* c, int slot){
  if (x->slot_kind[slot] == 2) { get_local(c,x->SB); i32_const(c,x->spill_idx[slot]*4); bput(c,op_i32_add); }
  else                         { get_local(c,x->LB); i32_const(c,slot*4);              bput(c,op_i32_sub); }
  mem_op(c,op_i32_load,2,0);   // i32.load
  vpush(x, TA);
}
// C4.2 synchronized method: unlock `this` (slot 0) at a return/propagate point.
// Loads `this` directly (no value-model mutation — this runs at exits) and calls
// $monitorexit, dropping its pending flag (we are already returning/unwinding).
void emit_sync_unlock(Ctx* x, Buf* c) {
  if (!x->sync_method) return;
  if (x->method->is_static()) {                       // static sync: unlock the Class mirror
    i32_const(c,(int32_t)(intptr_t)x->method->method_holder());
    emit_call(c,Imp::SMONEXIT);              // call $static_monitorexit (void)
    return;
  }
  if (x->slot_kind[0] == 2) { get_local(c,x->SB); i32_const(c,x->spill_idx[0]*4); bput(c,op_i32_add); }
  else                      { get_local(c,x->LB); i32_const(c,0); bput(c,op_i32_sub); }
  mem_op(c,op_i32_load,2,0);   // i32.load -> this oop
  emit_call(c,Imp::MONITOREXIT);                // call $monitorexit -> i32
  drop(c);                            // drop the pending flag
}
static void emit_astore(Ctx* x, Buf* c, int slot){
  set_local(c, x->TMPI);                                                  // spill the value (oop)
  get_local(c, x->SB); i32_const(c,x->spill_idx[slot]*4); bput(c,op_i32_add);  // addr = SB + idx*4
  get_local(c, x->TMPI);
  mem_op(c,op_i32_store,2,0);   // i32.store
  vpop(x);
}


// value-type produced/consumed helpers for the operand type stack
void vpush(Ctx* x, int t){ x->vspill[x->vn]=-1; x->vt[x->vn++]=t; }
void vpush_spilled(Ctx* x, int slot){ x->vspill[x->vn]=slot; x->vt[x->vn++]=TA; }
int  vpop(Ctx* x){ return x->vn>0 ? x->vt[--x->vn] : TI; }

// Object ldc (String/Class): resolve the constant-pool entry to its oop via a helper
// and push it (a produced oop). Shared by raw ldc/ldc_w (0x12/0x13) and fast_aldc/_w
// (0xe6/0xe7); the caller passes the pool index. Class resolution can throw -> oop==0
// dispatches/propagates like new/checkcast.
static void emit_ldc_oop(Ctx* x, Buf* c, int pool_index, int pc) {
  i32_const(c,(int32_t)(intptr_t)x->cp);   // cp ptr (metaspace, non-moving)
  i32_const(c,pool_index);                // constant-pool index
  emit_call(c,Imp::LDC_OOP);               // call $ldc_oop -> i32 oop
  tee_local(c, x->TMPI); bput(c,op_i32_eqz);              // tee; oop==0 (pending, e.g. CNFE) ?
  if_void(c); emit_exc(x, c, pc); emit_end(c);
  get_local(c, x->TMPI); vpush(x,TA);               // produced oop on stack
}

// Emit an instance-field read: the receiver oop is already on the wasm+value stack
// (pushed by the caller). idx_pos locates the cpCache index (1 for getfield; 2 for the
// fused _fast_*access_0). Null-checks, then a single typed load at (oop + off).
static void emit_getfield(Ctx* x, Buf* c, const uint8_t* bc, int pc, int idx_pos) {
  int off, tc, wt;
  resolve_instance_field(x, bc, pc, false, &off, &tc, &wt, idx_pos);   // validated in leader scan
  tee_local(c, x->TMPI);                        // save oop, keep on stack
  bput(c,op_i32_eqz);                                 // i32.eqz  (oop == null?)
  if_void(c);                   // if (null)
    emit_call(c,Imp::THROW_NPE);                    //   call $throw_npe (import 5)
    emit_exc(x, c, pc);       //   dispatch/propagate
  emit_end(c);                                 // end if
  get_local(c, x->TMPI);                        // oop addr (non-null)
  switch (tc) {
    case 0: mem_op(c,op_i32_load,2,off); break;   // i32.load     (int)
    case 1: mem_op(c,op_i64_load,3,off); break;   // i64.load     (long)
    case 2: mem_op(c,op_f32_load,2,off); break;   // f32.load     (float)
    case 3: mem_op(c,op_f64_load,3,off); break;   // f64.load     (double)
    case 4: mem_op(c,op_i32_load8_s,0,off); break;   // i32.load8_s  (byte)
    case 5: mem_op(c,op_i32_load16_u,1,off); break;   // i32.load16_u (char)
    case 6: mem_op(c,op_i32_load16_s,1,off); break;   // i32.load16_s (short)
    case 7: mem_op(c,op_i32_load8_u,0,off); break;   // i32.load8_u  (bool)
    case 8: mem_op(c,op_i32_load,2,off); break;   // i32.load     (object -> oop addr)
    default:                                                  // (shouldn't happen) helper fallback
      i32_const(c,off); i32_const(c,tc); emit_call(c,Imp::GETFIELD);
      switch (wt) { case TI: case TA: bput(c,op_i32_wrap_i64); break; case TF: bput(c,op_i32_wrap_i64); bput(c,op_f32_reinterpret_i32); break;
                    case TD: bput(c,op_f64_reinterpret_i64); break; default: break; }
      break;
  }
  vpop(x); vpush(x, wt);                        // popped obj, pushed field value
}

// Emit a general call via JavaCalls (invoke_common): resolve a baked InvokeDesc, pop the
// receiver+args (or just args, for kind-3 invokestatic) into ARG temps, call $invoke,
// dispatch a pending exception, then push the result. Shared by invokevirtual/special/
// interface/vfinal and the object-arg invokestatic fallback (op selects the kind).
static void emit_invoke(Ctx* x, Buf* c, const uint8_t* bc, int pc, uint8_t op) {
  InvokeDesc* d; int nw, rt, aw;
  resolve_invoke(x, bc, pc, op, &d, &nw, &rt, &aw);   // validated in leader scan
  // GC-safety: no untagged oop may remain live on the wasm operand stack below the nw
  // call values across the call. A `new`-spilled oop (vspill>=0) is allowed iff it is
  // the single entry right below the args and the callee is void (dropped+reloaded).
  int below = x->vn - nw, carriedS = -1;
  for (int k = 0; k < below; k++) if (x->vt[k]==TA) {
    if (x->vspill[k] < 0) { x->bail = true; }
    else if (k == below-1 && rt == TV && carriedS < 0) carriedS = x->vspill[k];
    else x->bail = true;
  }
  for (int j = nw-1; j >= 0; j--) { int vtp = vpop(x); widen_i64(c, vtp); set_local(c, x->ARG0 + j); }
  i32_const(c,(int32_t)(intptr_t)d);          // descptr (i32)
  for (int j=0;j<8;j++){ if (j<nw) get_local(c,x->ARG0+j); else { i64_const(c,0);} }
  i32_const(c,nw);                            // nwords (dummy, reuses type2)
  emit_call(c,Imp::INVOKE);                            // call $invoke -> i64
  set_local(c, x->TMPJ);                               // stash result
  emit_call(c,Imp::PENDING);                            // call $pending -> i32
  if_void(c); emit_exc(x,c,pc); emit_end(c);   // if pending: dispatch/propagate
  if (carriedS >= 0) {                                 // refresh the carried `new` oop (now top)
    drop(c);                                      // drop the stale wasm value
    get_local(c,x->SB); i32_const(c,carriedS*4); bput(c,op_i32_add);
    mem_op(c,op_i32_load,2,0);             // i32.load (reload moved oop)
  }
  if (rt != TV) { get_local(c, x->TMPJ); narrow_i64(c, rt); vpush(x, rt); }
}

// Unified static-call intrinsic (C5.4): inline hot java.lang.{Math,Integer,Long} methods
// as wasm ops instead of a call. Single source of truth for BOTH phases:
//   * classify-only (c == nullptr): used by the leader scan / stack_delta / op_consumed,
//     which run before emit and have no valid value stack -- so the op type is taken from
//     the callee SIGNATURE, not x->vt. Fills *argwords (JVM words consumed) and *rettype.
//     Returns 1 if this site is an inlinable intrinsic (even for a NATIVE callee like
//     Math.sqrt, which resolve_invoke would otherwise bail -> the whole method).
//   * emit (c != nullptr): emit the inline wasm and update the value stack; returns 1.
// Returns 0 if the site is not a recognized intrinsic (fall through to the call path).
// All operands are primitive -> no oop in the frame -> GC-safe.
int wasm_intrinsic(Ctx* x, Buf* c, const uint8_t* bc, int pc, int* argwords, int* rettype) {
  ConstantPoolCache* cpc = x->method->constants()->cache();
  if (cpc == nullptr) return 0;
  int idx = Bytes::get_native_u2((address)(bc+pc+1));
  ConstantPoolCacheEntry* e = cpc->entry_at(idx);
  if (!e->is_resolved(Bytecodes::_invokestatic)) return 0;   // unresolved -> let the call path retry
  Method* m = e->f1_as_method();
  if (m == nullptr || !m->is_static()) return 0;
  Symbol* h = m->method_holder()->name();
  Symbol* nm = m->name();
  // Derive arg words + return + the (single distinct) primitive op-type from the signature,
  // so classify and emit agree without touching the value stack.
  uint8_t at[16]; int as[16], na = 0, rt = TI;
  if (!parse_sig(m, at, as, &na, &rt) || na < 1 || na > 2) return 0;
  int t = at[na-1];                                  // op type (min/max share both params' type)
  int aw = 0; for (int i=0;i<na;i++) aw += type_words(at[i]);

  int single = 0;        // a single wasm opcode (may change type: fixed up by the tail)
  bool wrap_i32 = false; // append i32.wrap_i64 (Long bit-ops return int)
  int minmax = 0;        // 1=min, 2=max, 3=abs: custom compare/select sequences
  bool recognized = false;
  if (h->equals("java/lang/Math", 14)) {
    if (t==TD && na==1) {                                          // f64.sqrt/floor/ceil/nearest
      if (nm->equals("sqrt",4)) single=0x9f;
      else if (nm->equals("floor",5)) single=0x9c;
      else if (nm->equals("ceil",4)) single=0x9b;                 // f64.ceil (0x9b; 0x9d is trunc)
      else if (nm->equals("rint",4)) single=0x9e;                 // f64.nearest == round-half-even
    }
    if (!single && na==2 && nm->equals("copySign",8) && (t==TF||t==TD)) single=(t==TF)?0x98:0xa6;
    if (!single && (t==TI||t==TJ||t==TF||t==TD)) {                // min/max/abs (custom sequences)
      if (nm->equals("min",3)) minmax=1; else if (nm->equals("max",3)) minmax=2;
      else if (nm->equals("abs",3)) minmax=3;
    }
    recognized = single || minmax;
  } else if (h->equals("java/lang/Integer", 17) && na==1 && t==TI) {
    if (nm->equals("bitCount",8)) single=0x69;                         // i32.popcnt
    else if (nm->equals("numberOfLeadingZeros",20)) single=0x67;       // i32.clz
    else if (nm->equals("numberOfTrailingZeros",21)) single=0x68;      // i32.ctz
    recognized = single!=0;
  } else if (h->equals("java/lang/Long", 14) && na==1 && t==TJ) {
    if (nm->equals("bitCount",8)) single=0x7b;                         // i64.popcnt
    else if (nm->equals("numberOfLeadingZeros",20)) single=0x79;       // i64.clz
    else if (nm->equals("numberOfTrailingZeros",21)) single=0x7a;      // i64.ctz
    if (single) wrap_i32=true;                                          // returns int
    recognized = single!=0;
  } else if (h->equals("java/lang/Float", 15) && na==1) {              // bit-exact reinterprets
    if (t==TF && nm->equals("floatToRawIntBits",17)) single=0xbc;      // i32.reinterpret_f32
    else if (t==TI && nm->equals("intBitsToFloat",14)) single=0xbe;    // f32.reinterpret_i32
    recognized = single!=0;
  } else if (h->equals("java/lang/Double", 16) && na==1) {
    if (t==TD && nm->equals("doubleToRawLongBits",19)) single=0xbd;    // i64.reinterpret_f64
    else if (t==TJ && nm->equals("longBitsToDouble",16)) single=0xbf;  // f64.reinterpret_i64
    recognized = single!=0;
  }
  if (!recognized) return 0;
  if (argwords) { *argwords=aw; *rettype=rt; }
  if (c == nullptr) return 1;                        // classify only (no value stack yet)

  if (minmax) {                                      // NaN + signed-zero + MIN_VALUE semantics
    bool isMin=(minmax==1), isAbs=(minmax==3);
    if (isAbs) {
      switch (t) {
        case TF: bput(c,op_f32_abs); break;                // f32.abs
        case TD: bput(c,op_f64_abs); break;                // f64.abs
        case TI: set_local(c,x->TMPI);
                 i32_const(c,0); get_local(c,x->TMPI); bput(c,op_i32_sub);
                 get_local(c,x->TMPI);
                 get_local(c,x->TMPI); i32_const(c,0); bput(c,op_i32_lt_s);
                 bput(c,op_select); break;
        case TJ: set_local(c,x->TMPJ);
                 i64_const(c,0); get_local(c,x->TMPJ); bput(c,op_i64_sub);
                 get_local(c,x->TMPJ);
                 get_local(c,x->TMPJ); i64_const(c,0); bput(c,op_i64_lt_s);
                 bput(c,op_select); break;
      }
      return 1;                                      // 1 in 1 out: vstack unchanged
    }
    switch (t) {                                     // min/max: 2 args -> 1
      case TF: bput(c, isMin?0x96:0x97); vpop(x); return 1;
      case TD: bput(c, isMin?0xa4:0xa5); vpop(x); return 1;
      case TI: { int cmp = isMin?0x48:0x4a;
        set_local(c,x->TMPI2); set_local(c,x->TMPI);
        get_local(c,x->TMPI); get_local(c,x->TMPI2);
        get_local(c,x->TMPI); get_local(c,x->TMPI2); bput(c,cmp);
        bput(c,op_select); vpop(x); return 1; }
      case TJ: { int cmp = isMin?0x53:0x55;
        set_local(c,x->TMPJ2); set_local(c,x->TMPJ);
        get_local(c,x->TMPJ); get_local(c,x->TMPJ2);
        get_local(c,x->TMPJ); get_local(c,x->TMPJ2); bput(c,cmp);
        bput(c,op_select); vpop(x); return 1; }
    }
    return 1;
  }
  // Single-op intrinsics (may change type: e.g. Long bit-ops J->I, reinterprets F<->I):
  bput(c, single);
  if (wrap_i32) bput(c,op_i32_wrap_i64);                        // i64 result -> int
  for (int i=0;i<na;i++) vpop(x);
  vpush(x, rt);                                      // result type from the signature
  return 1;
}

// Emit a straight-line (non-control-flow) opcode. Updates the value-type stack.
void emit_op(Ctx* x, Buf* c, const uint8_t* bc, int pc) {
  uint8_t op = bc[pc]; int b = x->base;
  x->vn0 = x->vn;                                            // operand depth at op entry (C4 leftover check)
  if (op==0x59 && x->skip_dup>0) { x->skip_dup--; return; }  // `new`-idiom dup already materialized
  switch (op) {
    case 0x00: break;                                    // nop
    case 0x01: i32_const(c,0); vpush(x,TA); break;  // aconst_null (null oop = 0)
    // ---- int ----
    case 0x02: i32_const(c,-1); vpush(x,TI); break;
    case 0x03: case 0x04: case 0x05: case 0x06: case 0x07: case 0x08:
      i32_const(c,op-0x03); vpush(x,TI); break;
    case 0x10: i32_const(c,(int8_t)bc[pc+1]); vpush(x,TI); break;
    case 0x11: i32_const(c,(int16_t)((bc[pc+1]<<8)|bc[pc+2])); vpush(x,TI); break;
    case 0x1a: case 0x1b: case 0x1c: case 0x1d: get_local(c,b+op-0x1a); vpush(x,TI); break;
    case 0x15: get_local(c,b+bc[pc+1]); vpush(x,TI); break;
    case 0x3b: case 0x3c: case 0x3d: case 0x3e: set_local(c,b+op-0x3b); vpop(x); break;
    case 0x36: set_local(c,b+bc[pc+1]); vpop(x); break;
    case 0x60: bput(c,op_i32_add); vpop(x); break; case 0x64: bput(c,op_i32_sub); vpop(x); break;
    case 0x68: bput(c,op_i32_mul); vpop(x); break;
    // idiv/irem: divisor==0 -> ArithmeticException; INT_MIN/-1 overflow handled inline
    case 0x6c: case 0x70: {
      set_local(c, x->TMPI2); set_local(c, x->TMPI); vpop(x); vpop(x);   // b=TMPI2, a=TMPI
      get_local(c, x->TMPI2); bput(c,op_i32_eqz);                              // b == 0 ?
      if_void(c);
        emit_call(c,Imp::THROW_ARITH); emit_exc(x, c, pc);                    // throw_arith + dispatch
      emit_end(c);
      get_local(c, x->TMPI); i32_const(c,(int32_t)0x80000000); bput(c,op_i32_eq);   // a==INT_MIN
      get_local(c, x->TMPI2); i32_const(c,-1); bput(c,op_i32_eq); bput(c,op_i32_and);      // && b==-1
      if_type(c,vt_i32);                                        // if (overflow) -> i32
        if (op==0x6c) { i32_const(c,(int32_t)0x80000000); }     // idiv -> INT_MIN
        else          { i32_const(c,0); }                       // irem -> 0
      emit_else(c);
        get_local(c, x->TMPI); get_local(c, x->TMPI2); bput(c, op==0x6c ? 0x6d : 0x6f);  // div_s/rem_s
      emit_end(c);
      vpush(x, TI);
    } break;
    // ldiv/lrem (i64): same as above with 64-bit ops
    case 0x6d: case 0x71: {
      set_local(c, x->TMPJ2); set_local(c, x->TMPJ); vpop(x); vpop(x);   // b=TMPJ2, a=TMPJ
      get_local(c, x->TMPJ2); bput(c,op_i64_eqz);                              // i64.eqz (b==0)
      if_void(c);
        emit_call(c,Imp::THROW_ARITH); emit_exc(x, c, pc);
      emit_end(c);
      get_local(c, x->TMPJ); i64_const(c,(int64_t)INT64_MIN); bput(c,op_i64_eq);     // a==MIN64
      get_local(c, x->TMPJ2); i64_const(c,-1); bput(c,op_i64_eq); bput(c,op_i32_and);       // && b==-1
      if_type(c,vt_i64);                                        // if (overflow) -> i64
        if (op==0x6d) { i64_const(c,(int64_t)INT64_MIN); }
        else          { i64_const(c,0); }
      emit_else(c);
        get_local(c, x->TMPJ); get_local(c, x->TMPJ2); bput(c, op==0x6d ? 0x7f : 0x81);  // i64 div_s/rem_s
      emit_end(c);
      vpush(x, TJ);
    } break;
    // ---- wide prefix (C4.3): primitive load/store/iinc with a 16-bit local index ----
    case 0xc4: {
      uint8_t s = bc[pc+1]; int wi = (bc[pc+2]<<8)|bc[pc+3];
      switch (s) {
        case 0x15: get_local(c,b+wi); vpush(x,TI); break;                 // wide iload
        case 0x16: get_local(c,b+wi); vpush(x,TJ); break;                 // wide lload
        case 0x17: get_local(c,b+wi); vpush(x,TF); break;                 // wide fload
        case 0x18: get_local(c,b+wi); vpush(x,TD); break;                 // wide dload
        case 0x36: set_local(c,b+wi); vpop(x); break;                     // wide istore
        case 0x37: set_local(c,b+wi); vpop(x); break;                     // wide lstore
        case 0x38: set_local(c,b+wi); vpop(x); break;                     // wide fstore
        case 0x39: set_local(c,b+wi); vpop(x); break;                     // wide dstore
        case 0x19: emit_aload(x, c, wi); break;                           // wide aload (object)
        case 0x3a: emit_astore(x, c, wi); break;                          // wide astore (object)
        case 0x84: { int cst = (int16_t)((bc[pc+4]<<8)|bc[pc+5]);         // wide iinc
                     get_local(c,b+wi); i32_const(c,cst); bput(c,op_i32_add); set_local(c,b+wi); break; }
        default: x->bail = true; break;
      }
    } break;
    case 0x74: i32_const(c,-1); bput(c,op_i32_mul); break;           // ineg
    case 0x84: get_local(c,b+bc[pc+1]); i32_const(c,(int8_t)bc[pc+2]);
               bput(c,op_i32_add); set_local(c,b+bc[pc+1]); break;            // iinc
    case 0x7e: bput(c,op_i32_and); vpop(x); break; case 0x80: bput(c,op_i32_or); vpop(x); break;
    case 0x82: bput(c,op_i32_xor); vpop(x); break;
    case 0x78: bput(c,op_i32_shl); vpop(x); break; case 0x7a: bput(c,op_i32_shr_s); vpop(x); break;
    case 0x7c: bput(c,op_i32_shr_u); vpop(x); break;
    case 0x91: i32_const(c,24); bput(c,op_i32_shl); i32_const(c,24); bput(c,op_i32_shr_s); break; // i2b
    case 0x92: i32_const(c,0xffff); bput(c,op_i32_and); break;       // i2c
    case 0x93: i32_const(c,16); bput(c,op_i32_shl); i32_const(c,16); bput(c,op_i32_shr_s); break; // i2s
    case 0x57: drop(c); vpop(x); break;                           // pop
    case 0x59: { int t=x->vn?x->vt[x->vn-1]:TI; uint32_t tmp=(t==TF)?x->TMPF:x->TMPI;
                 tee_local(c,tmp); get_local(c,tmp); vpush(x,t); } break;
    // ---- stack shuffles (C0.2): spill involved values to i64 temps, re-push ----
    case 0x58: {                                     // pop2
      int ta = x->vt[x->vn-1];
      if (ta==TJ||ta==TD) { drop(c); vpop(x); }
      else { drop(c); drop(c); vpop(x); vpop(x); }
    } break;
    case 0x5f: {                                     // swap (two cat-1)
      int ta=x->vt[x->vn-1], tb=x->vt[x->vn-2];
      widen_i64(c,ta); set_local(c,x->SH0);
      widen_i64(c,tb); set_local(c,x->SH0+1);
      get_local(c,x->SH0);   narrow_i64(c,ta);       // push a
      get_local(c,x->SH0+1); narrow_i64(c,tb);       // push b
      vpop(x); vpop(x); vpush(x,ta); vpush(x,tb);
    } break;
    case 0x5a: {                                     // dup_x1: [b,a]->[a,b,a]
      int ta=x->vt[x->vn-1], tb=x->vt[x->vn-2];
      widen_i64(c,ta); set_local(c,x->SH0);
      widen_i64(c,tb); set_local(c,x->SH0+1);
      get_local(c,x->SH0);   narrow_i64(c,ta);       // a
      get_local(c,x->SH0+1); narrow_i64(c,tb);       // b
      get_local(c,x->SH0);   narrow_i64(c,ta);       // a
      vpop(x); vpop(x); vpush(x,ta); vpush(x,tb); vpush(x,ta);
    } break;
    case 0x5b: {                                     // dup_x2
      int ta=x->vt[x->vn-1], tb=x->vt[x->vn-2];
      if (tb==TJ||tb==TD) {                          // form2: [w,a]->[a,w,a]
        widen_i64(c,ta); set_local(c,x->SH0);
        widen_i64(c,tb); set_local(c,x->SH0+1);
        get_local(c,x->SH0);   narrow_i64(c,ta);
        get_local(c,x->SH0+1); narrow_i64(c,tb);
        get_local(c,x->SH0);   narrow_i64(c,ta);
        vpop(x); vpop(x); vpush(x,ta); vpush(x,tb); vpush(x,ta);
      } else {                                       // form1: [c,b,a]->[a,c,b,a]
        int tc=x->vt[x->vn-3];
        widen_i64(c,ta); set_local(c,x->SH0);
        widen_i64(c,tb); set_local(c,x->SH0+1);
        widen_i64(c,tc); set_local(c,x->SH0+2);
        get_local(c,x->SH0);   narrow_i64(c,ta);
        get_local(c,x->SH0+2); narrow_i64(c,tc);
        get_local(c,x->SH0+1); narrow_i64(c,tb);
        get_local(c,x->SH0);   narrow_i64(c,ta);
        vpop(x); vpop(x); vpop(x); vpush(x,ta); vpush(x,tc); vpush(x,tb); vpush(x,ta);
      }
    } break;
    case 0x5c: {                                     // dup2
      int ta=x->vt[x->vn-1];
      if (ta==TJ||ta==TD) {                          // [w]->[w,w]
        widen_i64(c,ta); set_local(c,x->SH0);
        get_local(c,x->SH0); narrow_i64(c,ta);
        get_local(c,x->SH0); narrow_i64(c,ta);
        vpop(x); vpush(x,ta); vpush(x,ta);
      } else {                                       // [b,a]->[b,a,b,a]
        int tb=x->vt[x->vn-2];
        widen_i64(c,ta); set_local(c,x->SH0);
        widen_i64(c,tb); set_local(c,x->SH0+1);
        get_local(c,x->SH0+1); narrow_i64(c,tb);
        get_local(c,x->SH0);   narrow_i64(c,ta);
        get_local(c,x->SH0+1); narrow_i64(c,tb);
        get_local(c,x->SH0);   narrow_i64(c,ta);
        vpop(x); vpop(x); vpush(x,tb); vpush(x,ta); vpush(x,tb); vpush(x,ta);
      }
    } break;
    case 0x5d: {                                     // dup2_x1
      int ta=x->vt[x->vn-1];
      if (ta==TJ||ta==TD) {                          // [c,w]->[w,c,w]
        int tcv=x->vt[x->vn-2];
        widen_i64(c,ta);  set_local(c,x->SH0);
        widen_i64(c,tcv); set_local(c,x->SH0+1);
        get_local(c,x->SH0);   narrow_i64(c,ta);
        get_local(c,x->SH0+1); narrow_i64(c,tcv);
        get_local(c,x->SH0);   narrow_i64(c,ta);
        vpop(x); vpop(x); vpush(x,ta); vpush(x,tcv); vpush(x,ta);
      } else {                                       // [c,b,a]->[b,a,c,b,a]
        int tb=x->vt[x->vn-2], tcv=x->vt[x->vn-3];
        widen_i64(c,ta);  set_local(c,x->SH0);
        widen_i64(c,tb);  set_local(c,x->SH0+1);
        widen_i64(c,tcv); set_local(c,x->SH0+2);
        get_local(c,x->SH0+1); narrow_i64(c,tb);
        get_local(c,x->SH0);   narrow_i64(c,ta);
        get_local(c,x->SH0+2); narrow_i64(c,tcv);
        get_local(c,x->SH0+1); narrow_i64(c,tb);
        get_local(c,x->SH0);   narrow_i64(c,ta);
        vpop(x); vpop(x); vpop(x); vpush(x,tb); vpush(x,ta); vpush(x,tcv); vpush(x,tb); vpush(x,ta);
      }
    } break;
    case 0x5e: {                                     // dup2_x2 (4 category forms)
      int ta=x->vt[x->vn-1];
      bool a2 = (ta==TJ||ta==TD);
      if (a2) {
        int tb=x->vt[x->vn-2];
        if (tb==TJ||tb==TD) {                        // form 4: [b2,a2]->[a2,b2,a2]
          widen_i64(c,ta); set_local(c,x->SH0); widen_i64(c,tb); set_local(c,x->SH0+1);
          get_local(c,x->SH0); narrow_i64(c,ta); get_local(c,x->SH0+1); narrow_i64(c,tb);
          get_local(c,x->SH0); narrow_i64(c,ta);
          vpop(x);vpop(x); vpush(x,ta);vpush(x,tb);vpush(x,ta);
        } else {                                     // form 2: [c,b,a2]->[a2,c,b,a2]
          int tcv=x->vt[x->vn-3];
          widen_i64(c,ta); set_local(c,x->SH0); widen_i64(c,tb); set_local(c,x->SH0+1); widen_i64(c,tcv); set_local(c,x->SH0+2);
          get_local(c,x->SH0);   narrow_i64(c,ta);
          get_local(c,x->SH0+2); narrow_i64(c,tcv);
          get_local(c,x->SH0+1); narrow_i64(c,tb);
          get_local(c,x->SH0);   narrow_i64(c,ta);
          vpop(x);vpop(x);vpop(x); vpush(x,ta);vpush(x,tcv);vpush(x,tb);vpush(x,ta);
        }
      } else {
        int tb=x->vt[x->vn-2], tcv=x->vt[x->vn-3];
        if (tcv==TJ||tcv==TD) {                      // form 3: [c2,b,a]->[b,a,c2,b,a]
          widen_i64(c,ta); set_local(c,x->SH0); widen_i64(c,tb); set_local(c,x->SH0+1); widen_i64(c,tcv); set_local(c,x->SH0+2);
          get_local(c,x->SH0+1); narrow_i64(c,tb);
          get_local(c,x->SH0);   narrow_i64(c,ta);
          get_local(c,x->SH0+2); narrow_i64(c,tcv);
          get_local(c,x->SH0+1); narrow_i64(c,tb);
          get_local(c,x->SH0);   narrow_i64(c,ta);
          vpop(x);vpop(x);vpop(x); vpush(x,tb);vpush(x,ta);vpush(x,tcv);vpush(x,tb);vpush(x,ta);
        } else {                                     // form 1: [d,c,b,a]->[b,a,d,c,b,a] (4 cat-1)
          int td=x->vt[x->vn-4];
          widen_i64(c,ta); set_local(c,x->SH0); widen_i64(c,tb); set_local(c,x->SH0+1);
          widen_i64(c,tcv); set_local(c,x->SH0+2); widen_i64(c,td); set_local(c,x->SH0+3);
          get_local(c,x->SH0+1); narrow_i64(c,tb);
          get_local(c,x->SH0);   narrow_i64(c,ta);
          get_local(c,x->SH0+3); narrow_i64(c,td);
          get_local(c,x->SH0+2); narrow_i64(c,tcv);
          get_local(c,x->SH0+1); narrow_i64(c,tb);
          get_local(c,x->SH0);   narrow_i64(c,ta);
          vpop(x);vpop(x);vpop(x);vpop(x); vpush(x,tb);vpush(x,ta);vpush(x,td);vpush(x,tcv);vpush(x,tb);vpush(x,ta);
        }
      }
    } break;

    // ---- long ----
    case 0x09: case 0x0a: i64_const(c,op-0x09); vpush(x,TJ); break;
    case 0x1e: case 0x1f: case 0x20: case 0x21: get_local(c,b+op-0x1e); vpush(x,TJ); break;
    case 0x16: get_local(c,b+bc[pc+1]); vpush(x,TJ); break;
    case 0x3f: case 0x40: case 0x41: case 0x42: set_local(c,b+op-0x3f); vpop(x); break;
    case 0x37: set_local(c,b+bc[pc+1]); vpop(x); break;
    case 0x61: bput(c,op_i64_add); vpop(x); break; case 0x65: bput(c,op_i64_sub); vpop(x); break;
    case 0x69: bput(c,op_i64_mul); vpop(x); break;
    case 0x75: i64_const(c,-1); bput(c,op_i64_mul); break;           // lneg (*-1)
    case 0x7f: bput(c,op_i64_and); vpop(x); break; case 0x81: bput(c,op_i64_or); vpop(x); break;
    case 0x83: bput(c,op_i64_xor); vpop(x); break;
    case 0x79: bput(c,op_i64_extend_i32_u); bput(c,op_i64_shl); vpop(x); break;              // lshl (extend shift, i64.shl)
    case 0x7b: bput(c,op_i64_extend_i32_u); bput(c,op_i64_shr_s); vpop(x); break;              // lshr
    case 0x7d: bput(c,op_i64_extend_i32_u); bput(c,op_i64_shr_u); vpop(x); break;              // lushr
    case 0x94:                                                          // lcmp
      set_local(c,x->TMPJ2); set_local(c,x->TMPJ);
      get_local(c,x->TMPJ); get_local(c,x->TMPJ2); bput(c,op_i64_gt_s);        // i64.gt_s
      get_local(c,x->TMPJ); get_local(c,x->TMPJ2); bput(c,op_i64_lt_s);        // i64.lt_s
      bput(c,op_i32_sub); vpop(x); vpop(x); vpush(x,TI); break;               // i32.sub

    // ---- float ----
    case 0x0b: case 0x0c: case 0x0d: { float f=(float)(op-0x0b); uint32_t u; memcpy(&u,&f,4);
      bput(c,op_f32_const); bput(c,u&0xff); bput(c,(u>>8)&0xff); bput(c,(u>>16)&0xff); bput(c,(u>>24)&0xff); vpush(x,TF); } break;
    case 0x22: case 0x23: case 0x24: case 0x25: get_local(c,b+op-0x22); vpush(x,TF); break;
    case 0x17: get_local(c,b+bc[pc+1]); vpush(x,TF); break;
    case 0x43: case 0x44: case 0x45: case 0x46: set_local(c,b+op-0x43); vpop(x); break;
    case 0x38: set_local(c,b+bc[pc+1]); vpop(x); break;
    case 0x62: bput(c,op_f32_add); vpop(x); break; case 0x66: bput(c,op_f32_sub); vpop(x); break;
    case 0x6a: bput(c,op_f32_mul); vpop(x); break; case 0x6e: bput(c,op_f32_div); vpop(x); break;
    case 0x72: emit_call(c,Imp::FREM); vpop(x); break;         // frem -> fmodf helper
    case 0x76: bput(c,op_f32_neg); break;                                    // fneg
    case 0x95: case 0x96:                                              // fcmpl/fcmpg
      set_local(c,x->TMPF2); set_local(c,x->TMPF);
      i32_const(c,op==0x96 ? 1 : -1);                         // true value (NaN result)
      get_local(c,x->TMPF); get_local(c,x->TMPF2); bput(c,op_f32_gt);        // a>b (f32.gt)
      get_local(c,x->TMPF); get_local(c,x->TMPF2); bput(c,op_f32_lt);        // a<b (f32.lt)
      bput(c,op_i32_sub);                                                     // base = gt-lt
      get_local(c,x->TMPF); get_local(c,x->TMPF); bput(c,op_f32_ne);         // a!=a
      get_local(c,x->TMPF2); get_local(c,x->TMPF2); bput(c,op_f32_ne);       // b!=b
      bput(c,op_i32_or);                                                     // uno = or
      bput(c,op_select); vpop(x); vpop(x); vpush(x,TI); break;               // select(true, base, uno)

    // ---- double ----
    case 0x0e: case 0x0f: { double d=(double)(op-0x0e); uint64_t u; memcpy(&u,&d,8);
      bput(c,op_f64_const); for(int k=0;k<8;k++) bput(c,(u>>(8*k))&0xff); vpush(x,TD); } break;
    case 0x26: case 0x27: case 0x28: case 0x29: get_local(c,b+op-0x26); vpush(x,TD); break;
    case 0x18: get_local(c,b+bc[pc+1]); vpush(x,TD); break;
    case 0x47: case 0x48: case 0x49: case 0x4a: set_local(c,b+op-0x47); vpop(x); break;
    case 0x39: set_local(c,b+bc[pc+1]); vpop(x); break;
    case 0x63: bput(c,op_f64_add); vpop(x); break; case 0x67: bput(c,op_f64_sub); vpop(x); break;
    case 0x6b: bput(c,op_f64_mul); vpop(x); break; case 0x6f: bput(c,op_f64_div); vpop(x); break;
    case 0x73: emit_call(c,Imp::DREM); vpop(x); break;         // drem -> fmod helper
    case 0x77: bput(c,op_f64_neg); break;                                    // dneg
    case 0x97: case 0x98:                                              // dcmpl/dcmpg
      set_local(c,x->TMPD2); set_local(c,x->TMPD);
      i32_const(c,op==0x98 ? 1 : -1);
      get_local(c,x->TMPD); get_local(c,x->TMPD2); bput(c,op_f64_gt);        // a>b (f64.gt)
      get_local(c,x->TMPD); get_local(c,x->TMPD2); bput(c,op_f64_lt);        // a<b (f64.lt)
      bput(c,op_i32_sub);
      get_local(c,x->TMPD); get_local(c,x->TMPD); bput(c,op_f64_ne);         // a!=a
      get_local(c,x->TMPD2); get_local(c,x->TMPD2); bput(c,op_f64_ne);       // b!=b
      bput(c,op_i32_or);
      bput(c,op_select); vpop(x); vpop(x); vpush(x,TI); break;

    // ---- ldc / ldc2_w ----
    case 0x12: case 0x13: {                                            // ldc / ldc_w (int or float)
      int idx = (op==0x12) ? bc[pc+1] : ((bc[pc+1]<<8)|bc[pc+2]);
      constantTag t = x->cp->tag_at(idx);
      if (t.is_int()) { i32_const(c,x->cp->int_at(idx)); vpush(x,TI); }
      else if (t.is_float()) { float f=x->cp->float_at(idx); uint32_t u; memcpy(&u,&f,4);
             bput(c,op_f32_const); for(int k=0;k<4;k++) bput(c,(u>>(8*k))&0xff); vpush(x,TF); }
      else emit_ldc_oop(x, c, idx, pc);                 // raw object ldc: operand IS the pool index
    } break;
    // ---- fast_aldc / fast_aldc_w (0xe6/0xe7): object ldc (String/Class) quickened from
    //      ldc by the Rewriter. Operand is a resolved-references index -> pool index. ----
    case 0xe6: case 0xe7: {
      int ri = (op==0xe6) ? bc[pc+1] : (bc[pc+1] | (bc[pc+2]<<8));   // native u2 (little-endian)
      emit_ldc_oop(x, c, x->cp->object_to_cp_index(ri), pc);
    } break;
    case 0x14: {                                                       // ldc2_w (long or double)
      int idx = (bc[pc+1]<<8)|bc[pc+2];
      constantTag t = x->cp->tag_at(idx);
      if (t.is_long()) { i64_const(c,x->cp->long_at(idx)); vpush(x,TJ); }
      else { double d=x->cp->double_at(idx); uint64_t u; memcpy(&u,&d,8);
             bput(c,op_f64_const); for(int k=0;k<8;k++) bput(c,(u>>(8*k))&0xff); vpush(x,TD); }
    } break;

    // ---- conversions ----
    case 0x85: bput(c,op_i64_extend_i32_s); vpop(x); vpush(x,TJ); break;              // i2l
    case 0x88: bput(c,op_i32_wrap_i64); vpop(x); vpush(x,TI); break;              // l2i
    case 0x87: bput(c,op_f64_convert_i32_s); vpop(x); vpush(x,TD); break;              // i2d
    case 0x8e: trunc_sat(c,ts_i32_trunc_f64_s); vpop(x); vpush(x,TI); break;// d2i (trunc_sat)
    case 0x8d: bput(c,op_f64_promote_f32); vpop(x); vpush(x,TD); break;              // f2d
    case 0x90: bput(c,op_f32_demote_f64); vpop(x); vpush(x,TF); break;             // d2f
    case 0x8c: trunc_sat(c,ts_i64_trunc_f32_s); vpop(x); vpush(x,TJ); break;// f2l (trunc_sat)
    case 0x89: bput(c,op_f32_convert_i64_s); vpop(x); vpush(x,TF); break;             // l2f
    case 0x8a: bput(c,op_f64_convert_i64_s); vpop(x); vpush(x,TD); break;             // l2d
    case 0x8f: trunc_sat(c,ts_i64_trunc_f64_s); vpop(x); vpush(x,TJ); break;// d2l (trunc_sat)
    case 0x86: bput(c,op_f32_convert_i32_s); vpop(x); vpush(x,TF); break;             // i2f
    case 0x8b: trunc_sat(c,ts_i32_trunc_f32_s); vpop(x); vpush(x,TI); break;// f2i (trunc_sat)

    // ---- aload/astore (C1/C2): object args re-read from frame locals[-slot];
    // astore'd object locals live in the GC-scanned oop-spill array. ----
    case 0x2a: case 0x2b: case 0x2c: case 0x2d: emit_aload(x,c,op-0x2a); break;
    case Bytecodes::_fast_aload_0: emit_aload(x,c,0); break;
    case 0x19: emit_aload(x,c,bc[pc+1]); break;
    case 0x4b: case 0x4c: case 0x4d: case 0x4e: emit_astore(x,c,op-0x4b); break;
    case 0x3a: emit_astore(x,c,bc[pc+1]); break;

    // ---- getfield (M2 instance): null-check receiver, then read primitive field ----
    case 0xb4:
    case Bytecodes::_fast_agetfield:
    case Bytecodes::_fast_bgetfield: case Bytecodes::_fast_cgetfield:
    case Bytecodes::_fast_dgetfield: case Bytecodes::_fast_fgetfield:
    case Bytecodes::_fast_igetfield: case Bytecodes::_fast_lgetfield:
    case Bytecodes::_fast_sgetfield:
      // The receiver oop is already on the stack; the offset/type are compile-time
      // constants (a single typed load, no C helper). Object fields load the oop addr
      // (no read barrier); produced-oop GC handling is unchanged (leader-gated).
      emit_getfield(x, c, bc, pc, 1); break;
    // ---- fused this.field (RewriteFrequentPairs): aload_0; getfield -> one opcode.
    //      Load `this` (frame oop, slot 0) then read the field; cpCache index at pc+2. ----
    case Bytecodes::_fast_iaccess_0:
    case Bytecodes::_fast_aaccess_0:
    case Bytecodes::_fast_faccess_0:
      emit_aload(x, c, 0);                           // push `this` (local slot 0)
      emit_getfield(x, c, bc, pc, 2); break;

    // ---- putfield (M2 instance): null-check receiver, then write primitive field ----
    case 0xb5:
    case Bytecodes::_fast_aputfield:
    case Bytecodes::_fast_bputfield: case Bytecodes::_fast_zputfield:
    case Bytecodes::_fast_cputfield: case Bytecodes::_fast_dputfield:
    case Bytecodes::_fast_fputfield: case Bytecodes::_fast_iputfield:
    case Bytecodes::_fast_lputfield: case Bytecodes::_fast_sputfield: {
      int off, tc, wt;
      resolve_instance_field(x, bc, pc, true, &off, &tc, &wt);   // validated in leader scan
      switch (wt) {                                 // widen value (top of stack) to i64
        case TI: case TA: bput(c,op_i64_extend_i32_s); break;      // int or oop addr: extend
        case TJ: break;
        case TF: bput(c,op_i32_reinterpret_f32); bput(c,op_i64_extend_i32_u); break;
        case TD: bput(c,op_i64_reinterpret_f64); break;
      }
      set_local(c, x->TMPJ);                        // spill value; obj now on top
      tee_local(c, x->TMPI);                        // save oop, keep on stack
      bput(c,op_i32_eqz);                                 // i32.eqz
      if_void(c);                   // if (null)
        emit_call(c,Imp::THROW_NPE);                    //   call $throw_npe
        emit_exc(x, c, pc);       //   dispatch/propagate
      emit_end(c);
      if (tc == 8) {
        // Object field: keep the helper -- obj_field_put carries the SerialGC
        // write barrier (card mark), which an inline store would skip.
        get_local(c, x->TMPI);
        i32_const(c,off); i32_const(c,tc); get_local(c, x->TMPJ);
        emit_call(c,Imp::PUTFIELD);                    // call $putfield (import 6)
      } else {
        // Inline the primitive store as a single typed wasm store at (oop + off).
        // The value was widened to i64 in TMPJ above; narrow it back per type.
        get_local(c, x->TMPI);                      // oop addr
        get_local(c, x->TMPJ);                      // value (i64)
        switch (tc) {
          case 0: bput(c,op_i32_wrap_i64); mem_op(c,op_i32_store,2,off); break;              // wrap; i32.store
          case 1:              mem_op(c,op_i64_store,3,off); break;               // i64.store
          case 2: bput(c,op_i32_wrap_i64); bput(c,op_f32_reinterpret_i32); mem_op(c,op_f32_store,2,off); break; // wrap; f32.reinterpret; f32.store
          case 3:              bput(c,op_f64_reinterpret_i64); mem_op(c,op_f64_store,3,off); break;   // f64.reinterpret; f64.store
          case 4: case 7: bput(c,op_i32_wrap_i64); mem_op(c,op_i32_store8,0,off); break;       // wrap; i32.store8 (byte/bool)
          case 5: case 6: bput(c,op_i32_wrap_i64); mem_op(c,op_i32_store16,1,off); break;       // wrap; i32.store16 (char/short)
          // tc is 0..7 here (object put handled above); no other case reaches this.
        }
      }
      vpop(x); vpop(x);                             // popped value + obj
    } break;

    // ---- instanceof (C2): null->0 else subtype check (oop consumed, GC-safe) ----
    case 0xc1: {
      intptr_t k = resolve_klass(x, bc, pc);        // validated in leader scan
      i32_const(c,(int32_t)k);             // target klass const
      emit_call(c,Imp::INSTANCEOF);                     // call $instanceof (import 11) -> i32
      vpop(x); vpush(x, TI);
    } break;
    // ---- checkcast (C2): verify, throw CCE + early-return on failure, else pass through ----
    case 0xc0: {
      intptr_t k = resolve_klass(x, bc, pc);
      tee_local(c, x->TMPI);                        // keep oop on stack, save copy
      i32_const(c,(int32_t)k);
      emit_call(c,Imp::CHECKCAST);                     // call $checkcast(oop,klass) -> i32 (1=threw)
      if_void(c);                   // if (threw)
        emit_exc(x, c, pc);       //   dispatch/propagate (CCE)
      emit_end(c);
      get_local(c, x->TMPI);                        // checked oop back on stack (same value)
      // vt unchanged: TA in -> TA out
    } break;

    // ---- new (C2.2): allocate instance, spill across the ctor safepoint ----
    // Canonical javac idiom `new C; dup; <args>; invokespecial <init>`: the fresh
    // oop is stored to a GC-scanned spill slot and both stack copies are tagged
    // with it; the result copy is reloaded after the (void) constructor call.
    case 0xbb: {
      Klass* k = (Klass*)resolve_klass(x, bc, pc);
      int S = x->new_spill[pc];
      i32_const(c,(int32_t)(intptr_t)k);   // klassptr
      emit_call(c,Imp::NEW);                      // call $new -> i32 oop
      tee_local(c, x->TMPI); bput(c,op_i32_eqz);           // tee oop; oop==0 (OOM/pending) ?
      if_void(c); emit_exc(x, c, pc); emit_end(c);
      // store oop -> spill slot S (SB + S*4)
      get_local(c,x->SB); i32_const(c,S*4); bput(c,op_i32_add); get_local(c,x->TMPI);
      mem_op(c,op_i32_store,2,0);         // i32.store
      // push the two idiom copies (new + its dup), both backed by spill slot S
      get_local(c,x->TMPI); vpush_spilled(x,S);
      get_local(c,x->TMPI); vpush_spilled(x,S);
      x->skip_dup = 1;                               // the following `dup` is already materialized
    } break;

    // ---- newarray/anewarray (C2): size check, allocate, oop is astore'd next ----
    case 0xbc: case 0xbd: {
      tee_local(c, x->TMPI);                        // count
      i32_const(c,0); bput(c,op_i32_lt_s);        // count < 0 ?
      if_void(c);
        emit_call(c,Imp::THROW_NASE);                   // call $throw_nase
        emit_exc(x, c, pc);
      emit_end(c);
      if (op==0xbc) { i32_const(c,bc[pc+1]); get_local(c,x->TMPI); emit_call(c,Imp::NEWARRAY); }      // newarray(atype,count)
      else { i32_const(c,(int32_t)resolve_klass(x,bc,pc)); get_local(c,x->TMPI); emit_call(c,Imp::ANEWARRAY); } // anewarray(klass,count)
      tee_local(c, x->TMPI); bput(c,op_i32_eqz);          // tee oop; oop == 0 ? (OOM)
      if_void(c);
        emit_exc(x, c, pc);
      emit_end(c);
      get_local(c, x->TMPI);                        // array oop on stack
      vpop(x); vpush(x, TA);
    } break;

    // ---- multianewarray (C2.2, 2D): allocate a[d0][d1], oop is astore'd next ----
    case 0xc5: {                                     // multianewarray, 1..4 dims (>4 bailed)
      int nd = bc[pc+3];
      uint32_t dslot[4] = { x->TMPI, x->TMPI2, x->SH0, x->SH0+1 };
      for (int j = nd-1; j >= 0; j--) { set_local(c, dslot[j]); vpop(x); }  // pop top-first -> d[nd-1..0]
      i32_const(c,(int32_t)resolve_klass(x,bc,pc));   // array klassptr
      i32_const(c,nd);                       // ndims
      for (int j=0;j<4;j++) { if (j<nd) get_local(c,dslot[j]); else { i32_const(c,0); } }  // d0..d3
      emit_call(c,Imp::MULTIANEWARRAY);                       // call $multianewarray -> i32 oop
      tee_local(c, x->TMPI); bput(c,op_i32_eqz);           // tee oop; oop == 0 ? (NASE/OOM/pending)
      if_void(c); emit_exc(x, c, pc); emit_end(c);
      get_local(c, x->TMPI);                          // array oop on stack (astore'd next)
      vpush(x, TA);
    } break;

    // ---- monitorenter/monitorexit (C4.2): lock/unlock via jni_enter/jni_exit ----
    case 0xc2: case 0xc3: {
      set_local(c, x->TMPI); vpop(x);                 // object ref -> TMPI
      get_local(c, x->TMPI); bput(c,op_i32_eqz);            // ref == 0 ?
      if_void(c);
        emit_call(c,Imp::THROW_NPE);                       // call $throw_npe (import 5)
        emit_exc(x, c, pc);
      emit_end(c);
      get_local(c, x->TMPI);
      emit_call(c,op==0xc2 ? Imp::MONITORENTER : Imp::MONITOREXIT);      // call $monitorenter/$monitorexit -> i32 (1=pending)
      if_void(c);                      // if (pending) dispatch/propagate
        emit_exc(x, c, pc);
      emit_end(c);
    } break;

    // ---- getstatic/putstatic (M2): primitive static field via runtime helper ----
    case 0xb2: {                                    // getstatic -> call $getstatic (import 2)
      intptr_t k; int off, tc, wt;
      resolve_static_field(x, bc, pc, false, &k, &off, &tc, &wt);   // validated in leader scan
      i32_const(c,(int32_t)k); i32_const(c,off); i32_const(c,tc);
      emit_call(c,Imp::GETSTATIC);                       // -> i64
      switch (wt) {                                  // narrow to wasm type
        case TI: bput(c,op_i32_wrap_i64); break;
        case TJ: break;
        case TF: bput(c,op_i32_wrap_i64); bput(c,op_f32_reinterpret_i32); break;
        case TD: bput(c,op_f64_reinterpret_i64); break;
      }
      vpush(x, wt);
    } break;
    case 0xb3: {                                    // putstatic -> call $putstatic (import 3)
      intptr_t k; int off, tc, wt;
      resolve_static_field(x, bc, pc, true, &k, &off, &tc, &wt);
      switch (wt) {                                  // widen value on stack to i64
        case TI: bput(c,op_i64_extend_i32_s); break;
        case TJ: break;
        case TF: bput(c,op_i32_reinterpret_f32); bput(c,op_i64_extend_i32_u); break;
        case TD: bput(c,op_i64_reinterpret_f64); break;
      }
      set_local(c, x->TMPJ);                          // spill widened value
      i32_const(c,(int32_t)k); i32_const(c,off); i32_const(c,tc);
      get_local(c, x->TMPJ);
      emit_call(c,Imp::PUTSTATIC);                        // call $putstatic -> ()
      vpop(x);
    } break;

    // ---- athrow (C4): set the exception pending, then dispatch/propagate ----
    case 0xbf: {
      set_local(c, x->TMPI); vpop(x);               // exception oop off stack
      get_local(c, x->TMPI); emit_call(c,Imp::ATHROW);   // call $athrow (NPE if null, else set pending)
      i32_const(c,1); if_void(c);  // if(1): match nesting so emit_exc's br 3 is right
        emit_exc(x, c, pc);
      emit_end(c);
    } break;

    // ---- arraylength (M2): null-check, read length ----
    case 0xbe: {
      tee_local(c, x->TMPI); bput(c,op_i32_eqz);
      if_void(c);
        emit_call(c,Imp::THROW_NPE); emit_exc(x, c, pc);
      emit_end(c);
      get_local(c, x->TMPI); emit_call(c,Imp::ARRAYLENGTH);   // call $arraylength -> i32
      vpop(x); vpush(x,TI);
    } break;

    // ---- array load: null-check, bounds-check, read element (tc 8 = object) ----
    case 0x2e: case 0x2f: case 0x30: case 0x31: case 0x32: case 0x33: case 0x34: case 0x35: {
      int tc, wt; array_elem(op, &tc, &wt);
      set_local(c, x->TMPI2);                   // idx
      set_local(c, x->TMPI);                    // arr
      get_local(c, x->TMPI); bput(c,op_i32_eqz);      // null check
      if_void(c);
        emit_call(c,Imp::THROW_NPE); emit_exc(x, c, pc);
      emit_end(c);
      get_local(c, x->TMPI2); i32_const(c,0); bput(c,op_i32_lt_s);        // idx < 0
      get_local(c, x->TMPI2); get_local(c, x->TMPI); emit_call(c,Imp::ARRAYLENGTH); bput(c,op_i32_ge_s);  // idx >= len
      bput(c,op_i32_or);                             // out of bounds?
      if_void(c);
        get_local(c, x->TMPI2); emit_call(c,Imp::THROW_AIOOBE); emit_exc(x, c, pc);
      emit_end(c);
      get_local(c, x->TMPI); get_local(c, x->TMPI2); i32_const(c,tc);
      emit_call(c,Imp::ALOAD);                   // call $aload -> i64
      switch (wt) { case TI: case TA: bput(c,op_i32_wrap_i64); break; case TJ: break;
                    case TF: bput(c,op_i32_wrap_i64); bput(c,op_f32_reinterpret_i32); break; case TD: bput(c,op_f64_reinterpret_i64); break; }
      vpop(x); vpop(x); vpush(x, wt);
    } break;

    // ---- aastore: null/bounds check, array-store type check + barriered oop store ----
    case 0x53: {
      bput(c,op_i64_extend_i32_s); set_local(c, x->TMPJ);      // widen value (oop) to i64, spill
      set_local(c, x->TMPI2);                   // idx
      set_local(c, x->TMPI);                    // arr
      get_local(c, x->TMPI); bput(c,op_i32_eqz);      // null check arr
      if_void(c);
        emit_call(c,Imp::THROW_NPE); emit_exc(x, c, pc);
      emit_end(c);
      get_local(c, x->TMPI2); i32_const(c,0); bput(c,op_i32_lt_s);        // idx < 0
      get_local(c, x->TMPI2); get_local(c, x->TMPI); emit_call(c,Imp::ARRAYLENGTH); bput(c,op_i32_ge_s);  // idx >= len
      bput(c,op_i32_or);
      if_void(c);
        get_local(c, x->TMPI2); emit_call(c,Imp::THROW_AIOOBE); emit_exc(x, c, pc);
      emit_end(c);
      get_local(c, x->TMPI); get_local(c, x->TMPI2); get_local(c, x->TMPJ);  // arr, idx, val(i64)
      emit_call(c,Imp::AASTORE);                  // call $aastore(arr,idx,val) -> i32 (1=ASE thrown)
      if_void(c);                // if (threw)
        emit_exc(x, c, pc);   // ASE dispatch
      emit_end(c);
      vpop(x); vpop(x); vpop(x);
    } break;

    // ---- primitive array store: null-check, bounds-check, write element ----
    case 0x4f: case 0x50: case 0x51: case 0x52: case 0x54: case 0x55: case 0x56: {
      int tc, wt; array_elem(op, &tc, &wt);
      switch (wt) { case TI: bput(c,op_i64_extend_i32_s); break; case TJ: break;
                    case TF: bput(c,op_i32_reinterpret_f32); bput(c,op_i64_extend_i32_u); break; case TD: bput(c,op_i64_reinterpret_f64); break; }
      set_local(c, x->TMPJ);                    // value (i64)
      set_local(c, x->TMPI2);                   // idx
      set_local(c, x->TMPI);                    // arr
      get_local(c, x->TMPI); bput(c,op_i32_eqz);      // null check
      if_void(c);
        emit_call(c,Imp::THROW_NPE); emit_exc(x, c, pc);
      emit_end(c);
      get_local(c, x->TMPI2); i32_const(c,0); bput(c,op_i32_lt_s);
      get_local(c, x->TMPI2); get_local(c, x->TMPI); emit_call(c,Imp::ARRAYLENGTH); bput(c,op_i32_ge_s);
      bput(c,op_i32_or);
      if_void(c);
        get_local(c, x->TMPI2); emit_call(c,Imp::THROW_AIOOBE); emit_exc(x, c, pc);
      emit_end(c);
      get_local(c, x->TMPI); get_local(c, x->TMPI2); i32_const(c,tc); get_local(c, x->TMPJ);
      emit_call(c,Imp::ASTORE);                   // call $astore
      vpop(x); vpop(x); vpop(x);
    } break;

    // ---- invoke virtual/special/interface (C3): general call via JavaCalls ----
    case 0xb6: case 0xb7: case 0xb9: case 0xe3:     // invokevirtual/special/interface + vfinal fast
      emit_invoke(x, c, bc, pc, op); break;

    // ---- invokestatic: inline the Math/Integer/Long intrinsics, else route through
    //      the general JavaCalls path (kind 3) for full frame / GC / localsbase safety.
    case 0xb8: {
      if (wasm_intrinsic(x, c, bc, pc, nullptr, nullptr)) break;   // Math/Integer/Long -> inline wasm
      emit_invoke(x, c, bc, pc, 0xb8);
    } break;

    // ---- invokedynamic (C3.3): string concat / lambda. The call site is resolved
    //      (gated in the leader scan); call the linked adapter with [dynamic args,
    //      appendix] via wasmjit_invokedynamic. ----
    case 0xba: {
      IndyDesc* d; int nw, rt, aw;
      resolve_indy(x, bc, pc, &d, &nw, &rt, &aw);   // validated in leader scan
      // GC-safety: no oop may remain live on the wasm stack below the nw dynamic args.
      int below = x->vn - nw;
      for (int k = 0; k < below; k++) if (x->vt[k]==TA) x->bail = true;
      for (int j = nw-1; j >= 0; j--) { int vtp = vpop(x); widen_i64(c, vtp); set_local(c, x->ARG0 + j); }
      i32_const(c,(int32_t)(intptr_t)d);          // IndyDesc* (i32)
      for (int j=0;j<8;j++){ if (j<nw) get_local(c,x->ARG0+j); else { i64_const(c,0);} }
      i32_const(c,nw);                            // nargs
      emit_call(c,Imp::INVOKEDYNAMIC);                    // call $invokedynamic -> i64
      set_local(c, x->TMPJ);                               // stash result
      emit_call(c,Imp::PENDING);                            // call $pending -> i32
      if_void(c); emit_exc(x,c,pc); emit_end(c);   // if pending: dispatch/propagate
      if (rt != TV) { get_local(c, x->TMPJ); narrow_i64(c, rt); vpush(x, rt); }
    } break;
    default: break;
  }
}
} // namespace wasm
#endif // __EMSCRIPTEN__

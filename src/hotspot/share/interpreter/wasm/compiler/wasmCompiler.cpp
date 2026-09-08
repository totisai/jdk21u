/*
 * WasmJit — compiler core implementation. See interpreter/wasm/compiler/wasmCompiler.hpp.
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
#ifdef __EMSCRIPTEN__
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
namespace wasm {


// Emit an exception/early return: pop the oop-spill frame (if any), push a dummy
// i64 result, and return. Every return path must go through here.
static void emit_sync_unlock(Ctx* x, Buf* c);   // fwd (defined after emit_aload)
static void emit_early_return(Ctx* x, Buf* c){
  emit_sync_unlock(x, c);                                                              // sync method: unlock before propagating
  if (x->n_spill > 0) { bput(c,0x41); sleb(c,x->n_spill); bput(c,0x10); uleb(c,Imp::OOP_LEAVE); }  // call $leave
  bput(c,0x42); bput(c,0x00); bput(c,0x0f);                                            // i64.const 0; return
}
static void vpush(Ctx* x, int t);
static int  vpop(Ctx* x);
// C5.4 static-call intrinsic (Math/Integer/Long): classify (c==nullptr) or emit (c!=nullptr).
static int  wasm_intrinsic(Ctx* x, Buf* c, const uint8_t* bc, int pc, int* argwords, int* rettype);
// Operand entries a potentially-throwing op pops before it could throw.
static int op_consumed(Ctx* x, const uint8_t* bc, int pc){
  uint8_t op = bc[pc];
  if (op==0xbe) return 1;                              // arraylength
  if (op>=0x2e && op<=0x35) return 2;                  // Xaload
  if (op>=0x4f && op<=0x56) return 3;                  // Xastore
  if (is_getfield(op)) return 1;
  if (is_putfield(op)) return 2;
  if (op==0xc0) return 1;                              // checkcast
  if (op==0xbb) return 0;                              // new
  if (op==0xbc||op==0xbd) return 1;                    // newarray/anewarray
  if (op==0xc5) return bc[pc+3];                        // multianewarray: ndims counts
  if (op==0xc2||op==0xc3) return 1;                     // monitorenter/monitorexit: the object ref
  if (op==0xbf) return 1;                              // athrow
  if (op==0x6c||op==0x70||op==0x6d||op==0x71) return 2; // idiv/irem/ldiv/lrem
  if (op==0xb6||op==0xb7||op==0xb9||op==0xe3) {        // invoke (incl. vfinal fast): receiver+args
    InvokeDesc* d; int nw, rt, aw; if (resolve_invoke(x, bc, pc, op, &d, &nw, &rt, &aw)==0) return nw;
  }
  if (op==0xb8) {                                      // invokestatic: args (no receiver)
    int iaw, irt;
    if (wasm_intrinsic(x, nullptr, bc, pc, &iaw, &irt)) return iaw;   // inlined intrinsic
    InvokeDesc* d; int nw, rt, aw;                      // general path (object args)
    if (resolve_invoke(x, bc, pc, 0xb8, &d, &nw, &rt, &aw)==0) return nw;
  }
  if (op==0xba) {                                       // invokedynamic: dynamic args (no receiver)
    IndyDesc* d; int nw, rt, aw;
    if (resolve_indy(x, bc, pc, &d, &nw, &rt, &aw)==0) return nw;
  }
  return 0;
}
// C4: on a pending exception, either dispatch to an in-method handler or propagate.
// Called from inside a single op-level `if` (so `br 3` reaches the dispatch loop).
// The leftover expression stack must be empty for a clean unwind (else bail).
static void emit_exc(Ctx* x, Buf* c, int pc){
  const uint8_t* bc = x->method->code_base();
  if (!x->has_handlers) { emit_early_return(x, c); return; }
  if (x->vn0 - op_consumed(x, bc, pc) != 0) x->bail = true;   // non-empty leftover -> can't unwind
  bput(c,0x41); sleb(c,(int32_t)(intptr_t)x->method);
  bput(c,0x41); sleb(c,pc);
  bput(c,0x10); uleb(c,Imp::HANDLER_BCI);                                   // call $handler_bci -> i32 hbci
  tee_local(c, x->TMPI);
  bput(c,0x41); sleb(c,0); bput(c,0x48);                      // hbci < 0 ?
  bput(c,0x04); bput(c,0x40);                                 // if (<0) propagate
    emit_early_return(x, c);
  bput(c,0x05);                                               // else dispatch to handler block
    { int n = x->method->exception_table_length();
      ExceptionTableElement* et = x->method->exception_table_start();
      for (int i=0;i<n;i++) {
        int H = et[i].handler_pc;
        bool dup = false; for (int j=0;j<i;j++) if ((int)et[j].handler_pc==H) { dup=true; break; }
        if (dup) continue;
        get_local(c,x->TMPI); bput(c,0x41); sleb(c,H); bput(c,0x46);   // hbci == H ?
        bput(c,0x04); bput(c,0x40);
          bput(c,0x41); sleb(c, x->blk_of[H]); set_local(c,x->BB);
        bput(c,0x0b);
      }
    }
    bput(c,0x0c); uleb(c,3);                                  // br loop (dispatch)
  bput(c,0x0b);                                               // end if(<0)
}
// aload: object args live in the frame (locals[-slot] = LB-slot*4, re-read for GC);
// astore'd object locals live in the GC-scanned spill array (SB+idx*4).
static void emit_aload(Ctx* x, Buf* c, int slot){
  if (x->slot_kind[slot] == 2) { get_local(c,x->SB); bput(c,0x41); sleb(c,x->spill_idx[slot]*4); bput(c,0x6a); }
  else                         { get_local(c,x->LB); bput(c,0x41); sleb(c,slot*4);              bput(c,0x6b); }
  bput(c,0x28); bput(c,0x02); bput(c,0);   // i32.load
  vpush(x, TA);
}
// C4.2 synchronized method: unlock `this` (slot 0) at a return/propagate point.
// Loads `this` directly (no value-model mutation — this runs at exits) and calls
// $monitorexit, dropping its pending flag (we are already returning/unwinding).
static void emit_sync_unlock(Ctx* x, Buf* c) {
  if (!x->sync_method) return;
  if (x->method->is_static()) {                       // static sync: unlock the Class mirror
    bput(c,0x41); sleb(c,(int32_t)(intptr_t)x->method->method_holder());
    bput(c,0x10); uleb(c,Imp::SMONEXIT);              // call $static_monitorexit (void)
    return;
  }
  if (x->slot_kind[0] == 2) { get_local(c,x->SB); bput(c,0x41); sleb(c,x->spill_idx[0]*4); bput(c,0x6a); }
  else                      { get_local(c,x->LB); bput(c,0x41); sleb(c,0); bput(c,0x6b); }
  bput(c,0x28); bput(c,0x02); bput(c,0);   // i32.load -> this oop
  bput(c,0x10); uleb(c,Imp::MONITOREXIT);                // call $monitorexit -> i32
  bput(c,0x1a);                            // drop the pending flag
}
static void emit_astore(Ctx* x, Buf* c, int slot){
  set_local(c, x->TMPI);                                                  // spill the value (oop)
  get_local(c, x->SB); bput(c,0x41); sleb(c, x->spill_idx[slot]*4); bput(c,0x6a);  // addr = SB + idx*4
  get_local(c, x->TMPI);
  bput(c,0x36); bput(c,0x02); bput(c,0);   // i32.store
  vpop(x);
}

// Operand-stack delta in JVM words.
static int stack_delta(Ctx* x, const uint8_t* bc, int pc) {
  uint8_t op = bc[pc];
  if (op == 0xc4) {                                // wide: same net stack delta as the sub-op
    switch (bc[pc+1]) { case 0x15: case 0x17: case 0x19: return +1;   // iload/fload/aload
                        case 0x16: case 0x18: return +2;   // lload/dload
                        case 0x36: case 0x38: case 0x3a: return -1;   // istore/fstore/astore
                        case 0x37: case 0x39: return -2;   // lstore/dstore
                        case 0x84: return 0; }             // iinc
    return -1000;
  }
  if (op == 0xc5) return 1 - bc[pc+3];             // multianewarray: pop ndims counts, push 1 array
  if (op == 0xc2 || op == 0xc3) return -1;         // monitorenter/monitorexit: pop the object ref
  if (op == 0xb8) {                                // invokestatic: ret words - arg words
    int iaw, irt;
    if (wasm_intrinsic(x, nullptr, bc, pc, &iaw, &irt)) return type_words(irt) - iaw;  // inlined intrinsic
    InvokeDesc* d; int nw, rt, aw;                  // general path (object args): ret - args
    if (resolve_invoke(x, bc, pc, 0xb8, &d, &nw, &rt, &aw) != 0) return -1000;
    return type_words(rt) - aw;
  }
  if (op == 0xb6 || op == 0xb7 || op == 0xb9 || op == 0xe3) {  // invoke (incl. vfinal fast): ret - (recv+args)
    InvokeDesc* d; int nw, rt, aw;
    if (resolve_invoke(x, bc, pc, op, &d, &nw, &rt, &aw) != 0) return -1000;
    return type_words(rt) - aw;
  }
  if (op == 0xba) {                                // invokedynamic: ret - dynamic args
    IndyDesc* d; int nw, rt, aw;
    if (resolve_indy(x, bc, pc, &d, &nw, &rt, &aw) != 0) return -1000;
    return type_words(rt) - aw;
  }
  if (op == 0xb2 || op == 0xb3) {                  // getstatic (+words) / putstatic (-words)
    intptr_t k; int off, tc, wt;
    if (resolve_static_field(x, bc, pc, op==0xb3, &k, &off, &tc, &wt) != 0) return -1000;
    return (op==0xb2 ? +1 : -1) * type_words(wt);
  }
  if (is_getfield(op)) {                            // getfield: pop obj(1), push field(words)
    int off, tc, wt;
    if (resolve_instance_field(x, bc, pc, false, &off, &tc, &wt) != 0) return -1000;
    return type_words(wt) - 1;
  }
  if (is_putfield(op)) {                            // putfield: pop obj(1) + value(words)
    int off, tc, wt;
    if (resolve_instance_field(x, bc, pc, true, &off, &tc, &wt) != 0) return -1000;
    return -(1 + type_words(wt));
  }
  if (is_switch(op)) return -1;                      // table/lookupswitch pop index
  switch (op) {                                      // stack shuffles (JVM words)
    case 0x58: return -2;   // pop2
    case 0x5a: case 0x5b: return +1;  // dup_x1/dup_x2
    case 0x5c: case 0x5d: case 0x5e: return +2;  // dup2/dup2_x1/dup2_x2
    case 0x5f: return 0;    // swap
    default: break;
  }
  if (op == 0xbe) return 0;                          // arraylength: [arr]->[len]
  if (op == 0xbf) return -1;                         // athrow: pops the exception (then unwinds)
  if (is_aload_elem(op))  { int tc,wt; array_elem(op,&tc,&wt); return type_words(wt) - 2; }
  if (is_astore_elem(op)) { int tc,wt; array_elem(op,&tc,&wt); return -(2 + type_words(wt)); }
  switch (op) {
    // +1 word: iconst/bipush/sipush/iload*/fconst/fload*/ldc/dup
    case 0x02: case 0x03: case 0x04: case 0x05: case 0x06: case 0x07: case 0x08:
    case 0x10: case 0x11: case 0x15: case 0x1a: case 0x1b: case 0x1c: case 0x1d:
    case 0x0b: case 0x0c: case 0x0d: case 0x17: case 0x22: case 0x23: case 0x24: case 0x25:
    case 0x12: case 0x13: case 0x59:
    case 0xe6: case 0xe7:                             // fast_aldc/_w (object ldc) -> +1 oop
    case Bytecodes::_fast_iaccess_0:                  // fused this.field (int/oop/float) -> +1
    case Bytecodes::_fast_aaccess_0: case Bytecodes::_fast_faccess_0:
    case 0x19: case 0x2a: case 0x2b: case 0x2c: case 0x2d:
    case 0x01:                                  // aconst_null
    case 0xbb:                                   // new (pushes the fresh object ref)
    case Bytecodes::_fast_aload_0: return +1;   // aload* (object)
    // +2 words: lconst/lload*/dconst/dload*/ldc2_w
    case 0x09: case 0x0a: case 0x16: case 0x1e: case 0x1f: case 0x20: case 0x21:
    case 0x0e: case 0x0f: case 0x18: case 0x26: case 0x27: case 0x28: case 0x29:
    case 0x14: return +2;
    // -1 word: istore*/fstore*/pop/ifxx/ireturn/freturn/iadd../fadd../fcmp
    case 0x3b: case 0x3c: case 0x3d: case 0x3e: case 0x36:
    case 0x38: case 0x43: case 0x44: case 0x45: case 0x46:
    case 0x3a: case 0x4b: case 0x4c: case 0x4d: case 0x4e:   // astore* (object)
    case 0x57: case 0xac: case 0xae: case 0xb0:   // pop/ireturn/freturn/areturn
    case 0x60: case 0x64: case 0x68: case 0x7e: case 0x80: case 0x82:
    case 0x6c: case 0x70:                          // idiv irem
    case 0x78: case 0x7a: case 0x7c:
    case 0x62: case 0x66: case 0x6a: case 0x6e: case 0x72: case 0x95: case 0x96:  // +frem
    case 0x99: case 0x9a: case 0x9b: case 0x9c: case 0x9d: case 0x9e:
    case 0xc6: case 0xc7: return -1;               // ifnull/ifnonnull
    // -2 words: lstore*/dstore*/lreturn/dreturn/if_icmp/ladd../dadd..
    case 0x37: case 0x3f: case 0x40: case 0x41: case 0x42:
    case 0x39: case 0x47: case 0x48: case 0x49: case 0x4a:
    case 0xad: case 0xaf:
    case 0x9f: case 0xa0: case 0xa1: case 0xa2: case 0xa3: case 0xa4:
    case 0xa5: case 0xa6:                          // if_acmpeq/ne
    case 0x61: case 0x65: case 0x69: case 0x7f: case 0x81: case 0x83:
    case 0x6d: case 0x71:                          // ldiv lrem
    case 0x63: case 0x67: case 0x6b: case 0x73: case 0x77: case 0x75: return -2;  // +drem
    // long/double shifts: pop i64+i32 push i64 => -1
    case 0x79: case 0x7b: case 0x7d: return -1;
    // lcmp/dcmp: pop 2 cat-2 push 1 int => -3
    case 0x94: case 0x97: case 0x98: return -3;
    // conversions
    case 0x85: return +1;  // i2l
    case 0x88: return -1;  // l2i
    case 0x87: return +1;  // i2d
    case 0x8e: return -1;  // d2i
    case 0x8d: return +1;  // f2d
    case 0x90: return -1;  // d2f
    case 0x8c: return +1;  // f2l
    case 0x89: return -1;  // l2f
    case 0x8a: return  0;  // l2d
    case 0x8f: return  0;  // d2l
    case 0x86: return  0;  // i2f
    case 0x8b: return  0;  // f2i
    default: return 0;     // ineg/lneg/fneg/dneg/i2b/c/s/iinc/goto/return(void)
  }
}

// value-type produced/consumed helpers for the operand type stack
static void vpush(Ctx* x, int t){ x->vspill[x->vn]=-1; x->vt[x->vn++]=t; }
static void vpush_spilled(Ctx* x, int slot){ x->vspill[x->vn]=slot; x->vt[x->vn++]=TA; }
static int  vpop(Ctx* x){ return x->vn>0 ? x->vt[--x->vn] : TI; }

// Object ldc (String/Class): resolve the constant-pool entry to its oop via a helper
// and push it (a produced oop). Shared by raw ldc/ldc_w (0x12/0x13) and fast_aldc/_w
// (0xe6/0xe7); the caller passes the pool index. Class resolution can throw -> oop==0
// dispatches/propagates like new/checkcast.
static void emit_ldc_oop(Ctx* x, Buf* c, int pool_index, int pc) {
  bput(c,0x41); sleb(c,(int32_t)(intptr_t)x->cp);   // cp ptr (metaspace, non-moving)
  bput(c,0x41); sleb(c, pool_index);                // constant-pool index
  bput(c,0x10); uleb(c,Imp::LDC_OOP);               // call $ldc_oop -> i32 oop
  tee_local(c, x->TMPI); bput(c,0x45);              // tee; oop==0 (pending, e.g. CNFE) ?
  bput(c,0x04); bput(c,0x40); emit_exc(x, c, pc); bput(c,0x0b);
  get_local(c, x->TMPI); vpush(x,TA);               // produced oop on stack
}

// Emit an instance-field read: the receiver oop is already on the wasm+value stack
// (pushed by the caller). idx_pos locates the cpCache index (1 for getfield; 2 for the
// fused _fast_*access_0). Null-checks, then a single typed load at (oop + off).
static void emit_getfield(Ctx* x, Buf* c, const uint8_t* bc, int pc, int idx_pos) {
  int off, tc, wt;
  resolve_instance_field(x, bc, pc, false, &off, &tc, &wt, idx_pos);   // validated in leader scan
  tee_local(c, x->TMPI);                        // save oop, keep on stack
  bput(c,0x45);                                 // i32.eqz  (oop == null?)
  bput(c,0x04); bput(c,0x40);                   // if (null)
    bput(c,0x10); uleb(c,Imp::THROW_NPE);                    //   call $throw_npe (import 5)
    emit_exc(x, c, pc);       //   dispatch/propagate
  bput(c,0x0b);                                 // end if
  get_local(c, x->TMPI);                        // oop addr (non-null)
  switch (tc) {
    case 0: bput(c,0x28); bput(c,0x02); uleb(c,off); break;   // i32.load     (int)
    case 1: bput(c,0x29); bput(c,0x03); uleb(c,off); break;   // i64.load     (long)
    case 2: bput(c,0x2a); bput(c,0x02); uleb(c,off); break;   // f32.load     (float)
    case 3: bput(c,0x2b); bput(c,0x03); uleb(c,off); break;   // f64.load     (double)
    case 4: bput(c,0x2c); bput(c,0x00); uleb(c,off); break;   // i32.load8_s  (byte)
    case 5: bput(c,0x2f); bput(c,0x01); uleb(c,off); break;   // i32.load16_u (char)
    case 6: bput(c,0x2e); bput(c,0x01); uleb(c,off); break;   // i32.load16_s (short)
    case 7: bput(c,0x2d); bput(c,0x00); uleb(c,off); break;   // i32.load8_u  (bool)
    case 8: bput(c,0x28); bput(c,0x02); uleb(c,off); break;   // i32.load     (object -> oop addr)
    default:                                                  // (shouldn't happen) helper fallback
      bput(c,0x41); sleb(c,off); bput(c,0x41); sleb(c,tc); bput(c,0x10); uleb(c,Imp::GETFIELD);
      switch (wt) { case TI: case TA: bput(c,0xa7); break; case TF: bput(c,0xa7); bput(c,0xbe); break;
                    case TD: bput(c,0xbf); break; default: break; }
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
  bput(c,0x41); sleb(c,(int32_t)(intptr_t)d);          // descptr (i32)
  for (int j=0;j<8;j++){ if (j<nw) get_local(c,x->ARG0+j); else { bput(c,0x42); sleb(c,0);} }
  bput(c,0x41); sleb(c,nw);                            // nwords (dummy, reuses type2)
  bput(c,0x10); uleb(c,Imp::INVOKE);                            // call $invoke -> i64
  set_local(c, x->TMPJ);                               // stash result
  bput(c,0x10); uleb(c,Imp::PENDING);                            // call $pending -> i32
  bput(c,0x04); bput(c,0x40); emit_exc(x,c,pc); bput(c,0x0b);   // if pending: dispatch/propagate
  if (carriedS >= 0) {                                 // refresh the carried `new` oop (now top)
    bput(c,0x1a);                                      // drop the stale wasm value
    get_local(c,x->SB); bput(c,0x41); sleb(c,carriedS*4); bput(c,0x6a);
    bput(c,0x28); bput(c,0x02); bput(c,0);             // i32.load (reload moved oop)
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
static int wasm_intrinsic(Ctx* x, Buf* c, const uint8_t* bc, int pc, int* argwords, int* rettype) {
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
        case TF: bput(c,0x8b); break;                // f32.abs
        case TD: bput(c,0x99); break;                // f64.abs
        case TI: set_local(c,x->TMPI);
                 bput(c,0x41); sleb(c,0); get_local(c,x->TMPI); bput(c,0x6b);
                 get_local(c,x->TMPI);
                 get_local(c,x->TMPI); bput(c,0x41); sleb(c,0); bput(c,0x48);
                 bput(c,0x1b); break;
        case TJ: set_local(c,x->TMPJ);
                 bput(c,0x42); sleb(c,0); get_local(c,x->TMPJ); bput(c,0x7d);
                 get_local(c,x->TMPJ);
                 get_local(c,x->TMPJ); bput(c,0x42); sleb(c,0); bput(c,0x53);
                 bput(c,0x1b); break;
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
        bput(c,0x1b); vpop(x); return 1; }
      case TJ: { int cmp = isMin?0x53:0x55;
        set_local(c,x->TMPJ2); set_local(c,x->TMPJ);
        get_local(c,x->TMPJ); get_local(c,x->TMPJ2);
        get_local(c,x->TMPJ); get_local(c,x->TMPJ2); bput(c,cmp);
        bput(c,0x1b); vpop(x); return 1; }
    }
    return 1;
  }
  // Single-op intrinsics (may change type: e.g. Long bit-ops J->I, reinterprets F<->I):
  bput(c, single);
  if (wrap_i32) bput(c,0xa7);                        // i64 result -> int
  for (int i=0;i<na;i++) vpop(x);
  vpush(x, rt);                                      // result type from the signature
  return 1;
}

// Emit a straight-line (non-control-flow) opcode. Updates the value-type stack.
static void emit_op(Ctx* x, Buf* c, const uint8_t* bc, int pc) {
  uint8_t op = bc[pc]; int b = x->base;
  x->vn0 = x->vn;                                            // operand depth at op entry (C4 leftover check)
  if (op==0x59 && x->skip_dup>0) { x->skip_dup--; return; }  // `new`-idiom dup already materialized
  switch (op) {
    case 0x00: break;                                    // nop
    case 0x01: bput(c,0x41); sleb(c,0); vpush(x,TA); break;  // aconst_null (null oop = 0)
    // ---- int ----
    case 0x02: bput(c,0x41); sleb(c,-1); vpush(x,TI); break;
    case 0x03: case 0x04: case 0x05: case 0x06: case 0x07: case 0x08:
      bput(c,0x41); sleb(c,op-0x03); vpush(x,TI); break;
    case 0x10: bput(c,0x41); sleb(c,(int8_t)bc[pc+1]); vpush(x,TI); break;
    case 0x11: bput(c,0x41); sleb(c,(int16_t)((bc[pc+1]<<8)|bc[pc+2])); vpush(x,TI); break;
    case 0x1a: case 0x1b: case 0x1c: case 0x1d: get_local(c,b+op-0x1a); vpush(x,TI); break;
    case 0x15: get_local(c,b+bc[pc+1]); vpush(x,TI); break;
    case 0x3b: case 0x3c: case 0x3d: case 0x3e: set_local(c,b+op-0x3b); vpop(x); break;
    case 0x36: set_local(c,b+bc[pc+1]); vpop(x); break;
    case 0x60: bput(c,0x6a); vpop(x); break; case 0x64: bput(c,0x6b); vpop(x); break;
    case 0x68: bput(c,0x6c); vpop(x); break;
    // idiv/irem: divisor==0 -> ArithmeticException; INT_MIN/-1 overflow handled inline
    case 0x6c: case 0x70: {
      set_local(c, x->TMPI2); set_local(c, x->TMPI); vpop(x); vpop(x);   // b=TMPI2, a=TMPI
      get_local(c, x->TMPI2); bput(c,0x45);                              // b == 0 ?
      bput(c,0x04); bput(c,0x40);
        bput(c,0x10); uleb(c,Imp::THROW_ARITH); emit_exc(x, c, pc);                    // throw_arith + dispatch
      bput(c,0x0b);
      get_local(c, x->TMPI); bput(c,0x41); sleb(c,(int32_t)0x80000000); bput(c,0x46);   // a==INT_MIN
      get_local(c, x->TMPI2); bput(c,0x41); sleb(c,-1); bput(c,0x46); bput(c,0x71);      // && b==-1
      bput(c,0x04); bput(c,0x7f);                                        // if (overflow) -> i32
        if (op==0x6c) { bput(c,0x41); sleb(c,(int32_t)0x80000000); }     // idiv -> INT_MIN
        else          { bput(c,0x41); sleb(c,0); }                       // irem -> 0
      bput(c,0x05);
        get_local(c, x->TMPI); get_local(c, x->TMPI2); bput(c, op==0x6c ? 0x6d : 0x6f);  // div_s/rem_s
      bput(c,0x0b);
      vpush(x, TI);
    } break;
    // ldiv/lrem (i64): same as above with 64-bit ops
    case 0x6d: case 0x71: {
      set_local(c, x->TMPJ2); set_local(c, x->TMPJ); vpop(x); vpop(x);   // b=TMPJ2, a=TMPJ
      get_local(c, x->TMPJ2); bput(c,0x50);                              // i64.eqz (b==0)
      bput(c,0x04); bput(c,0x40);
        bput(c,0x10); uleb(c,Imp::THROW_ARITH); emit_exc(x, c, pc);
      bput(c,0x0b);
      get_local(c, x->TMPJ); bput(c,0x42); sleb(c,(int64_t)INT64_MIN); bput(c,0x51);     // a==MIN64
      get_local(c, x->TMPJ2); bput(c,0x42); sleb(c,-1); bput(c,0x51); bput(c,0x71);       // && b==-1
      bput(c,0x04); bput(c,0x7e);                                        // if (overflow) -> i64
        if (op==0x6d) { bput(c,0x42); sleb(c,(int64_t)INT64_MIN); }
        else          { bput(c,0x42); sleb(c,0); }
      bput(c,0x05);
        get_local(c, x->TMPJ); get_local(c, x->TMPJ2); bput(c, op==0x6d ? 0x7f : 0x81);  // i64 div_s/rem_s
      bput(c,0x0b);
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
                     get_local(c,b+wi); bput(c,0x41); sleb(c,cst); bput(c,0x6a); set_local(c,b+wi); break; }
        default: x->bail = true; break;
      }
    } break;
    case 0x74: bput(c,0x41); sleb(c,-1); bput(c,0x6c); break;           // ineg
    case 0x84: get_local(c,b+bc[pc+1]); bput(c,0x41); sleb(c,(int8_t)bc[pc+2]);
               bput(c,0x6a); set_local(c,b+bc[pc+1]); break;            // iinc
    case 0x7e: bput(c,0x71); vpop(x); break; case 0x80: bput(c,0x72); vpop(x); break;
    case 0x82: bput(c,0x73); vpop(x); break;
    case 0x78: bput(c,0x74); vpop(x); break; case 0x7a: bput(c,0x75); vpop(x); break;
    case 0x7c: bput(c,0x76); vpop(x); break;
    case 0x91: bput(c,0x41); sleb(c,24); bput(c,0x74); bput(c,0x41); sleb(c,24); bput(c,0x75); break; // i2b
    case 0x92: bput(c,0x41); sleb(c,0xffff); bput(c,0x71); break;       // i2c
    case 0x93: bput(c,0x41); sleb(c,16); bput(c,0x74); bput(c,0x41); sleb(c,16); bput(c,0x75); break; // i2s
    case 0x57: bput(c,0x1a); vpop(x); break;                           // pop
    case 0x59: { int t=x->vn?x->vt[x->vn-1]:TI; uint32_t tmp=(t==TF)?x->TMPF:x->TMPI;
                 tee_local(c,tmp); get_local(c,tmp); vpush(x,t); } break;
    // ---- stack shuffles (C0.2): spill involved values to i64 temps, re-push ----
    case 0x58: {                                     // pop2
      int ta = x->vt[x->vn-1];
      if (ta==TJ||ta==TD) { bput(c,0x1a); vpop(x); }
      else { bput(c,0x1a); bput(c,0x1a); vpop(x); vpop(x); }
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
    case 0x09: case 0x0a: bput(c,0x42); sleb(c,op-0x09); vpush(x,TJ); break;
    case 0x1e: case 0x1f: case 0x20: case 0x21: get_local(c,b+op-0x1e); vpush(x,TJ); break;
    case 0x16: get_local(c,b+bc[pc+1]); vpush(x,TJ); break;
    case 0x3f: case 0x40: case 0x41: case 0x42: set_local(c,b+op-0x3f); vpop(x); break;
    case 0x37: set_local(c,b+bc[pc+1]); vpop(x); break;
    case 0x61: bput(c,0x7c); vpop(x); break; case 0x65: bput(c,0x7d); vpop(x); break;
    case 0x69: bput(c,0x7e); vpop(x); break;
    case 0x75: bput(c,0x42); sleb(c,-1); bput(c,0x7e); break;           // lneg (*-1)
    case 0x7f: bput(c,0x83); vpop(x); break; case 0x81: bput(c,0x84); vpop(x); break;
    case 0x83: bput(c,0x85); vpop(x); break;
    case 0x79: bput(c,0xad); bput(c,0x86); vpop(x); break;              // lshl (extend shift, i64.shl)
    case 0x7b: bput(c,0xad); bput(c,0x87); vpop(x); break;              // lshr
    case 0x7d: bput(c,0xad); bput(c,0x88); vpop(x); break;              // lushr
    case 0x94:                                                          // lcmp
      set_local(c,x->TMPJ2); set_local(c,x->TMPJ);
      get_local(c,x->TMPJ); get_local(c,x->TMPJ2); bput(c,0x55);        // i64.gt_s
      get_local(c,x->TMPJ); get_local(c,x->TMPJ2); bput(c,0x53);        // i64.lt_s
      bput(c,0x6b); vpop(x); vpop(x); vpush(x,TI); break;               // i32.sub

    // ---- float ----
    case 0x0b: case 0x0c: case 0x0d: { float f=(float)(op-0x0b); uint32_t u; memcpy(&u,&f,4);
      bput(c,0x43); bput(c,u&0xff); bput(c,(u>>8)&0xff); bput(c,(u>>16)&0xff); bput(c,(u>>24)&0xff); vpush(x,TF); } break;
    case 0x22: case 0x23: case 0x24: case 0x25: get_local(c,b+op-0x22); vpush(x,TF); break;
    case 0x17: get_local(c,b+bc[pc+1]); vpush(x,TF); break;
    case 0x43: case 0x44: case 0x45: case 0x46: set_local(c,b+op-0x43); vpop(x); break;
    case 0x38: set_local(c,b+bc[pc+1]); vpop(x); break;
    case 0x62: bput(c,0x92); vpop(x); break; case 0x66: bput(c,0x93); vpop(x); break;
    case 0x6a: bput(c,0x94); vpop(x); break; case 0x6e: bput(c,0x95); vpop(x); break;
    case 0x72: bput(c,0x10); uleb(c,Imp::FREM); vpop(x); break;         // frem -> fmodf helper
    case 0x76: bput(c,0x8c); break;                                    // fneg
    case 0x95: case 0x96:                                              // fcmpl/fcmpg
      set_local(c,x->TMPF2); set_local(c,x->TMPF);
      bput(c,0x41); sleb(c, op==0x96 ? 1 : -1);                         // true value (NaN result)
      get_local(c,x->TMPF); get_local(c,x->TMPF2); bput(c,0x5e);        // a>b (f32.gt)
      get_local(c,x->TMPF); get_local(c,x->TMPF2); bput(c,0x5d);        // a<b (f32.lt)
      bput(c,0x6b);                                                     // base = gt-lt
      get_local(c,x->TMPF); get_local(c,x->TMPF); bput(c,0x5c);         // a!=a
      get_local(c,x->TMPF2); get_local(c,x->TMPF2); bput(c,0x5c);       // b!=b
      bput(c,0x72);                                                     // uno = or
      bput(c,0x1b); vpop(x); vpop(x); vpush(x,TI); break;               // select(true, base, uno)

    // ---- double ----
    case 0x0e: case 0x0f: { double d=(double)(op-0x0e); uint64_t u; memcpy(&u,&d,8);
      bput(c,0x44); for(int k=0;k<8;k++) bput(c,(u>>(8*k))&0xff); vpush(x,TD); } break;
    case 0x26: case 0x27: case 0x28: case 0x29: get_local(c,b+op-0x26); vpush(x,TD); break;
    case 0x18: get_local(c,b+bc[pc+1]); vpush(x,TD); break;
    case 0x47: case 0x48: case 0x49: case 0x4a: set_local(c,b+op-0x47); vpop(x); break;
    case 0x39: set_local(c,b+bc[pc+1]); vpop(x); break;
    case 0x63: bput(c,0xa0); vpop(x); break; case 0x67: bput(c,0xa1); vpop(x); break;
    case 0x6b: bput(c,0xa2); vpop(x); break; case 0x6f: bput(c,0xa3); vpop(x); break;
    case 0x73: bput(c,0x10); uleb(c,Imp::DREM); vpop(x); break;         // drem -> fmod helper
    case 0x77: bput(c,0x9a); break;                                    // dneg
    case 0x97: case 0x98:                                              // dcmpl/dcmpg
      set_local(c,x->TMPD2); set_local(c,x->TMPD);
      bput(c,0x41); sleb(c, op==0x98 ? 1 : -1);
      get_local(c,x->TMPD); get_local(c,x->TMPD2); bput(c,0x64);        // a>b (f64.gt)
      get_local(c,x->TMPD); get_local(c,x->TMPD2); bput(c,0x63);        // a<b (f64.lt)
      bput(c,0x6b);
      get_local(c,x->TMPD); get_local(c,x->TMPD); bput(c,0x62);         // a!=a
      get_local(c,x->TMPD2); get_local(c,x->TMPD2); bput(c,0x62);       // b!=b
      bput(c,0x72);
      bput(c,0x1b); vpop(x); vpop(x); vpush(x,TI); break;

    // ---- ldc / ldc2_w ----
    case 0x12: case 0x13: {                                            // ldc / ldc_w (int or float)
      int idx = (op==0x12) ? bc[pc+1] : ((bc[pc+1]<<8)|bc[pc+2]);
      constantTag t = x->cp->tag_at(idx);
      if (t.is_int()) { bput(c,0x41); sleb(c, x->cp->int_at(idx)); vpush(x,TI); }
      else if (t.is_float()) { float f=x->cp->float_at(idx); uint32_t u; memcpy(&u,&f,4);
             bput(c,0x43); for(int k=0;k<4;k++) bput(c,(u>>(8*k))&0xff); vpush(x,TF); }
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
      if (t.is_long()) { bput(c,0x42); sleb(c, x->cp->long_at(idx)); vpush(x,TJ); }
      else { double d=x->cp->double_at(idx); uint64_t u; memcpy(&u,&d,8);
             bput(c,0x44); for(int k=0;k<8;k++) bput(c,(u>>(8*k))&0xff); vpush(x,TD); }
    } break;

    // ---- conversions ----
    case 0x85: bput(c,0xac); vpop(x); vpush(x,TJ); break;              // i2l
    case 0x88: bput(c,0xa7); vpop(x); vpush(x,TI); break;              // l2i
    case 0x87: bput(c,0xb7); vpop(x); vpush(x,TD); break;              // i2d
    case 0x8e: bput(c,0xfc); bput(c,0x02); vpop(x); vpush(x,TI); break;// d2i (trunc_sat)
    case 0x8d: bput(c,0xbb); vpop(x); vpush(x,TD); break;              // f2d
    case 0x90: bput(c,0xb6); vpop(x); vpush(x,TF); break;             // d2f
    case 0x8c: bput(c,0xfc); bput(c,0x04); vpop(x); vpush(x,TJ); break;// f2l (trunc_sat)
    case 0x89: bput(c,0xb4); vpop(x); vpush(x,TF); break;             // l2f
    case 0x8a: bput(c,0xb9); vpop(x); vpush(x,TD); break;             // l2d
    case 0x8f: bput(c,0xfc); bput(c,0x06); vpop(x); vpush(x,TJ); break;// d2l (trunc_sat)
    case 0x86: bput(c,0xb2); vpop(x); vpush(x,TF); break;             // i2f
    case 0x8b: bput(c,0xfc); bput(c,0x00); vpop(x); vpush(x,TI); break;// f2i (trunc_sat)

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
        case TI: case TA: bput(c,0xac); break;      // int or oop addr: extend
        case TJ: break;
        case TF: bput(c,0xbc); bput(c,0xad); break;
        case TD: bput(c,0xbd); break;
      }
      set_local(c, x->TMPJ);                        // spill value; obj now on top
      tee_local(c, x->TMPI);                        // save oop, keep on stack
      bput(c,0x45);                                 // i32.eqz
      bput(c,0x04); bput(c,0x40);                   // if (null)
        bput(c,0x10); uleb(c,Imp::THROW_NPE);                    //   call $throw_npe
        emit_exc(x, c, pc);       //   dispatch/propagate
      bput(c,0x0b);
      if (tc == 8) {
        // Object field: keep the helper -- obj_field_put carries the SerialGC
        // write barrier (card mark), which an inline store would skip.
        get_local(c, x->TMPI);
        bput(c,0x41); sleb(c,off); bput(c,0x41); sleb(c,tc); get_local(c, x->TMPJ);
        bput(c,0x10); uleb(c,Imp::PUTFIELD);                    // call $putfield (import 6)
      } else {
        // Inline the primitive store as a single typed wasm store at (oop + off).
        // The value was widened to i64 in TMPJ above; narrow it back per type.
        get_local(c, x->TMPI);                      // oop addr
        get_local(c, x->TMPJ);                      // value (i64)
        switch (tc) {
          case 0: bput(c,0xa7); bput(c,0x36); bput(c,0x02); uleb(c,off); break;              // wrap; i32.store
          case 1:              bput(c,0x37); bput(c,0x03); uleb(c,off); break;               // i64.store
          case 2: bput(c,0xa7); bput(c,0xbe); bput(c,0x38); bput(c,0x02); uleb(c,off); break; // wrap; f32.reinterpret; f32.store
          case 3:              bput(c,0xbf); bput(c,0x39); bput(c,0x03); uleb(c,off); break;   // f64.reinterpret; f64.store
          case 4: case 7: bput(c,0xa7); bput(c,0x3a); bput(c,0x00); uleb(c,off); break;       // wrap; i32.store8 (byte/bool)
          case 5: case 6: bput(c,0xa7); bput(c,0x3b); bput(c,0x01); uleb(c,off); break;       // wrap; i32.store16 (char/short)
          // tc is 0..7 here (object put handled above); no other case reaches this.
        }
      }
      vpop(x); vpop(x);                             // popped value + obj
    } break;

    // ---- instanceof (C2): null->0 else subtype check (oop consumed, GC-safe) ----
    case 0xc1: {
      intptr_t k = resolve_klass(x, bc, pc);        // validated in leader scan
      bput(c,0x41); sleb(c,(int32_t)k);             // target klass const
      bput(c,0x10); uleb(c,Imp::INSTANCEOF);                     // call $instanceof (import 11) -> i32
      vpop(x); vpush(x, TI);
    } break;
    // ---- checkcast (C2): verify, throw CCE + early-return on failure, else pass through ----
    case 0xc0: {
      intptr_t k = resolve_klass(x, bc, pc);
      tee_local(c, x->TMPI);                        // keep oop on stack, save copy
      bput(c,0x41); sleb(c,(int32_t)k);
      bput(c,0x10); uleb(c,Imp::CHECKCAST);                     // call $checkcast(oop,klass) -> i32 (1=threw)
      bput(c,0x04); bput(c,0x40);                   // if (threw)
        emit_exc(x, c, pc);       //   dispatch/propagate (CCE)
      bput(c,0x0b);
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
      bput(c,0x41); sleb(c,(int32_t)(intptr_t)k);   // klassptr
      bput(c,0x10); uleb(c,Imp::NEW);                      // call $new -> i32 oop
      tee_local(c, x->TMPI); bput(c,0x45);           // tee oop; oop==0 (OOM/pending) ?
      bput(c,0x04); bput(c,0x40); emit_exc(x, c, pc); bput(c,0x0b);
      // store oop -> spill slot S (SB + S*4)
      get_local(c,x->SB); bput(c,0x41); sleb(c,S*4); bput(c,0x6a); get_local(c,x->TMPI);
      bput(c,0x36); bput(c,0x02); bput(c,0);         // i32.store
      // push the two idiom copies (new + its dup), both backed by spill slot S
      get_local(c,x->TMPI); vpush_spilled(x,S);
      get_local(c,x->TMPI); vpush_spilled(x,S);
      x->skip_dup = 1;                               // the following `dup` is already materialized
    } break;

    // ---- newarray/anewarray (C2): size check, allocate, oop is astore'd next ----
    case 0xbc: case 0xbd: {
      tee_local(c, x->TMPI);                        // count
      bput(c,0x41); sleb(c,0); bput(c,0x48);        // count < 0 ?
      bput(c,0x04); bput(c,0x40);
        bput(c,0x10); uleb(c,Imp::THROW_NASE);                   // call $throw_nase
        emit_exc(x, c, pc);
      bput(c,0x0b);
      if (op==0xbc) { bput(c,0x41); sleb(c,bc[pc+1]); get_local(c,x->TMPI); bput(c,0x10); uleb(c,Imp::NEWARRAY); }      // newarray(atype,count)
      else { bput(c,0x41); sleb(c,(int32_t)resolve_klass(x,bc,pc)); get_local(c,x->TMPI); bput(c,0x10); uleb(c,Imp::ANEWARRAY); } // anewarray(klass,count)
      tee_local(c, x->TMPI); bput(c,0x45);          // tee oop; oop == 0 ? (OOM)
      bput(c,0x04); bput(c,0x40);
        emit_exc(x, c, pc);
      bput(c,0x0b);
      get_local(c, x->TMPI);                        // array oop on stack
      vpop(x); vpush(x, TA);
    } break;

    // ---- multianewarray (C2.2, 2D): allocate a[d0][d1], oop is astore'd next ----
    case 0xc5: {                                     // multianewarray, 1..4 dims (>4 bailed)
      int nd = bc[pc+3];
      uint32_t dslot[4] = { x->TMPI, x->TMPI2, x->SH0, x->SH0+1 };
      for (int j = nd-1; j >= 0; j--) { set_local(c, dslot[j]); vpop(x); }  // pop top-first -> d[nd-1..0]
      bput(c,0x41); sleb(c,(int32_t)resolve_klass(x,bc,pc));   // array klassptr
      bput(c,0x41); sleb(c,nd);                       // ndims
      for (int j=0;j<4;j++) { if (j<nd) get_local(c,dslot[j]); else { bput(c,0x41); sleb(c,0); } }  // d0..d3
      bput(c,0x10); uleb(c,Imp::MULTIANEWARRAY);                       // call $multianewarray -> i32 oop
      tee_local(c, x->TMPI); bput(c,0x45);           // tee oop; oop == 0 ? (NASE/OOM/pending)
      bput(c,0x04); bput(c,0x40); emit_exc(x, c, pc); bput(c,0x0b);
      get_local(c, x->TMPI);                          // array oop on stack (astore'd next)
      vpush(x, TA);
    } break;

    // ---- monitorenter/monitorexit (C4.2): lock/unlock via jni_enter/jni_exit ----
    case 0xc2: case 0xc3: {
      set_local(c, x->TMPI); vpop(x);                 // object ref -> TMPI
      get_local(c, x->TMPI); bput(c,0x45);            // ref == 0 ?
      bput(c,0x04); bput(c,0x40);
        bput(c,0x10); uleb(c,Imp::THROW_NPE);                       // call $throw_npe (import 5)
        emit_exc(x, c, pc);
      bput(c,0x0b);
      get_local(c, x->TMPI);
      bput(c,0x10); uleb(c, op==0xc2 ? Imp::MONITORENTER : Imp::MONITOREXIT);      // call $monitorenter/$monitorexit -> i32 (1=pending)
      bput(c,0x04); bput(c,0x40);                      // if (pending) dispatch/propagate
        emit_exc(x, c, pc);
      bput(c,0x0b);
    } break;

    // ---- getstatic/putstatic (M2): primitive static field via runtime helper ----
    case 0xb2: {                                    // getstatic -> call $getstatic (import 2)
      intptr_t k; int off, tc, wt;
      resolve_static_field(x, bc, pc, false, &k, &off, &tc, &wt);   // validated in leader scan
      bput(c,0x41); sleb(c,(int32_t)k); bput(c,0x41); sleb(c,off); bput(c,0x41); sleb(c,tc);
      bput(c,0x10); uleb(c,Imp::GETSTATIC);                       // -> i64
      switch (wt) {                                  // narrow to wasm type
        case TI: bput(c,0xa7); break;
        case TJ: break;
        case TF: bput(c,0xa7); bput(c,0xbe); break;
        case TD: bput(c,0xbf); break;
      }
      vpush(x, wt);
    } break;
    case 0xb3: {                                    // putstatic -> call $putstatic (import 3)
      intptr_t k; int off, tc, wt;
      resolve_static_field(x, bc, pc, true, &k, &off, &tc, &wt);
      switch (wt) {                                  // widen value on stack to i64
        case TI: bput(c,0xac); break;
        case TJ: break;
        case TF: bput(c,0xbc); bput(c,0xad); break;
        case TD: bput(c,0xbd); break;
      }
      set_local(c, x->TMPJ);                          // spill widened value
      bput(c,0x41); sleb(c,(int32_t)k); bput(c,0x41); sleb(c,off); bput(c,0x41); sleb(c,tc);
      get_local(c, x->TMPJ);
      bput(c,0x10); uleb(c,Imp::PUTSTATIC);                        // call $putstatic -> ()
      vpop(x);
    } break;

    // ---- athrow (C4): set the exception pending, then dispatch/propagate ----
    case 0xbf: {
      set_local(c, x->TMPI); vpop(x);               // exception oop off stack
      get_local(c, x->TMPI); bput(c,0x10); uleb(c,Imp::ATHROW);   // call $athrow (NPE if null, else set pending)
      bput(c,0x41); sleb(c,1); bput(c,0x04); bput(c,0x40);  // if(1): match nesting so emit_exc's br 3 is right
        emit_exc(x, c, pc);
      bput(c,0x0b);
    } break;

    // ---- arraylength (M2): null-check, read length ----
    case 0xbe: {
      tee_local(c, x->TMPI); bput(c,0x45);
      bput(c,0x04); bput(c,0x40);
        bput(c,0x10); uleb(c,Imp::THROW_NPE); emit_exc(x, c, pc);
      bput(c,0x0b);
      get_local(c, x->TMPI); bput(c,0x10); uleb(c,Imp::ARRAYLENGTH);   // call $arraylength -> i32
      vpop(x); vpush(x,TI);
    } break;

    // ---- array load: null-check, bounds-check, read element (tc 8 = object) ----
    case 0x2e: case 0x2f: case 0x30: case 0x31: case 0x32: case 0x33: case 0x34: case 0x35: {
      int tc, wt; array_elem(op, &tc, &wt);
      set_local(c, x->TMPI2);                   // idx
      set_local(c, x->TMPI);                    // arr
      get_local(c, x->TMPI); bput(c,0x45);      // null check
      bput(c,0x04); bput(c,0x40);
        bput(c,0x10); uleb(c,Imp::THROW_NPE); emit_exc(x, c, pc);
      bput(c,0x0b);
      get_local(c, x->TMPI2); bput(c,0x41); sleb(c,0); bput(c,0x48);        // idx < 0
      get_local(c, x->TMPI2); get_local(c, x->TMPI); bput(c,0x10); uleb(c,Imp::ARRAYLENGTH); bput(c,0x4e);  // idx >= len
      bput(c,0x72);                             // out of bounds?
      bput(c,0x04); bput(c,0x40);
        get_local(c, x->TMPI2); bput(c,0x10); uleb(c,Imp::THROW_AIOOBE); emit_exc(x, c, pc);
      bput(c,0x0b);
      get_local(c, x->TMPI); get_local(c, x->TMPI2); bput(c,0x41); sleb(c,tc);
      bput(c,0x10); uleb(c,Imp::ALOAD);                   // call $aload -> i64
      switch (wt) { case TI: case TA: bput(c,0xa7); break; case TJ: break;
                    case TF: bput(c,0xa7); bput(c,0xbe); break; case TD: bput(c,0xbf); break; }
      vpop(x); vpop(x); vpush(x, wt);
    } break;

    // ---- aastore: null/bounds check, array-store type check + barriered oop store ----
    case 0x53: {
      bput(c,0xac); set_local(c, x->TMPJ);      // widen value (oop) to i64, spill
      set_local(c, x->TMPI2);                   // idx
      set_local(c, x->TMPI);                    // arr
      get_local(c, x->TMPI); bput(c,0x45);      // null check arr
      bput(c,0x04); bput(c,0x40);
        bput(c,0x10); uleb(c,Imp::THROW_NPE); emit_exc(x, c, pc);
      bput(c,0x0b);
      get_local(c, x->TMPI2); bput(c,0x41); sleb(c,0); bput(c,0x48);        // idx < 0
      get_local(c, x->TMPI2); get_local(c, x->TMPI); bput(c,0x10); uleb(c,Imp::ARRAYLENGTH); bput(c,0x4e);  // idx >= len
      bput(c,0x72);
      bput(c,0x04); bput(c,0x40);
        get_local(c, x->TMPI2); bput(c,0x10); uleb(c,Imp::THROW_AIOOBE); emit_exc(x, c, pc);
      bput(c,0x0b);
      get_local(c, x->TMPI); get_local(c, x->TMPI2); get_local(c, x->TMPJ);  // arr, idx, val(i64)
      bput(c,0x10); uleb(c,Imp::AASTORE);                  // call $aastore(arr,idx,val) -> i32 (1=ASE thrown)
      bput(c,0x04); bput(c,0x40);                // if (threw)
        emit_exc(x, c, pc);   // ASE dispatch
      bput(c,0x0b);
      vpop(x); vpop(x); vpop(x);
    } break;

    // ---- primitive array store: null-check, bounds-check, write element ----
    case 0x4f: case 0x50: case 0x51: case 0x52: case 0x54: case 0x55: case 0x56: {
      int tc, wt; array_elem(op, &tc, &wt);
      switch (wt) { case TI: bput(c,0xac); break; case TJ: break;
                    case TF: bput(c,0xbc); bput(c,0xad); break; case TD: bput(c,0xbd); break; }
      set_local(c, x->TMPJ);                    // value (i64)
      set_local(c, x->TMPI2);                   // idx
      set_local(c, x->TMPI);                    // arr
      get_local(c, x->TMPI); bput(c,0x45);      // null check
      bput(c,0x04); bput(c,0x40);
        bput(c,0x10); uleb(c,Imp::THROW_NPE); emit_exc(x, c, pc);
      bput(c,0x0b);
      get_local(c, x->TMPI2); bput(c,0x41); sleb(c,0); bput(c,0x48);
      get_local(c, x->TMPI2); get_local(c, x->TMPI); bput(c,0x10); uleb(c,Imp::ARRAYLENGTH); bput(c,0x4e);
      bput(c,0x72);
      bput(c,0x04); bput(c,0x40);
        get_local(c, x->TMPI2); bput(c,0x10); uleb(c,Imp::THROW_AIOOBE); emit_exc(x, c, pc);
      bput(c,0x0b);
      get_local(c, x->TMPI); get_local(c, x->TMPI2); bput(c,0x41); sleb(c,tc); get_local(c, x->TMPJ);
      bput(c,0x10); uleb(c,Imp::ASTORE);                   // call $astore
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
      bput(c,0x41); sleb(c,(int32_t)(intptr_t)d);          // IndyDesc* (i32)
      for (int j=0;j<8;j++){ if (j<nw) get_local(c,x->ARG0+j); else { bput(c,0x42); sleb(c,0);} }
      bput(c,0x41); sleb(c,nw);                            // nargs
      bput(c,0x10); uleb(c,Imp::INVOKEDYNAMIC);                    // call $invokedynamic -> i64
      set_local(c, x->TMPJ);                               // stash result
      bput(c,0x10); uleb(c,Imp::PENDING);                            // call $pending -> i32
      bput(c,0x04); bput(c,0x40); emit_exc(x,c,pc); bput(c,0x0b);   // if pending: dispatch/propagate
      if (rt != TV) { get_local(c, x->TMPJ); narrow_i64(c, rt); vpush(x, rt); }
    } break;
    default: break;
  }
}
bool classify_locals(const uint8_t* bc, int bclen, int maxlocals,
                            const uint8_t* argtype, const int* argslot, int nargs,
                            uint8_t* ltype /*out, size maxlocals*/) {
  int8_t* seen = (int8_t*)malloc(maxlocals?maxlocals:1); memset(seen,-1,maxlocals);
  for (int i=0;i<nargs;i++) { seen[argslot[i]] = argtype[i]; }
  for (int pc=0; pc<bclen; ) {
    int L = instr_len(bc,pc);
    if (!L) { free(seen); return false; }   // unsupported opcode -> bail (compile_cf would too)
    uint8_t op = bc[pc]; int idx=-1, t=-1;
    if (op>=0x3b&&op<=0x3e){ idx=op-0x3b; t=TI; }
    else if (op==0x36){ idx=bc[pc+1]; t=TI; }
    else if (op>=0x3f&&op<=0x42){ idx=op-0x3f; t=TJ; }
    else if (op==0x37){ idx=bc[pc+1]; t=TJ; }
    else if (op>=0x43&&op<=0x46){ idx=op-0x43; t=TF; }
    else if (op==0x38){ idx=bc[pc+1]; t=TF; }
    else if (op>=0x47&&op<=0x4a){ idx=op-0x47; t=TD; }
    else if (op==0x39){ idx=bc[pc+1]; t=TD; }
    else if (op>=0x4b&&op<=0x4e){ idx=op-0x4b; t=TA; }   // astore_0..3 (object)
    else if (op==0x3a){ idx=bc[pc+1]; t=TA; }            // astore (object)
    else if (op==0xc4){ uint8_t s=bc[pc+1]; int wi=(bc[pc+2]<<8)|bc[pc+3];  // wide store: type the slot
      if(s==0x36){idx=wi;t=TI;} else if(s==0x37){idx=wi;t=TJ;}
      else if(s==0x38){idx=wi;t=TF;} else if(s==0x39){idx=wi;t=TD;}
      else if(s==0x3a){idx=wi;t=TA;} }                          // wide astore (object)
    if (idx>=0 && idx<maxlocals) {
      if (seen[idx]>=0 && seen[idx]!=t) { free(seen); return false; }
      seen[idx]=t;
    }
    pc += L;
  }
  for (int k=0;k<maxlocals;k++) ltype[k] = wasm_valtype(seen[k]<0 ? TI : seen[k]);
  free(seen);
  return true;
}

// Classify object-local slots: 1 = frame (object arg, re-read from locals[]),
// 2 = spill (astore'd -> GC-scanned spill array). Bails (false) if an object-arg
// slot is also astore'd (reassignment mixes frame + spill homes).
bool analyze_oop_slots(const uint8_t* bc, int bclen, int maxlocals,
                              const uint8_t* argtype, const int* argslot, int nargs,
                              uint8_t* slot_kind, int* spill_idx, int* n_spill_out) {
  for (int k=0;k<maxlocals;k++){ slot_kind[k]=0; spill_idx[k]=-1; }
  for (int i=0;i<nargs;i++) if (argtype[i]==TA) slot_kind[argslot[i]]=1;
  for (int pc=0; pc<bclen; ) {
    int L = instr_len(bc,pc); if (!L) return false;
    uint8_t op = bc[pc]; int idx=-1;
    if (op==0x3a) idx=bc[pc+1]; else if (op>=0x4b&&op<=0x4e) idx=op-0x4b;   // astore
    else if (op==0xc4 && bc[pc+1]==0x3a) idx=(bc[pc+2]<<8)|bc[pc+3];        // wide astore (object)
    if (idx>=0 && idx<maxlocals) {
      if (slot_kind[idx]==1) return false;                 // arg reassignment -> bail
      slot_kind[idx]=2;
    }
    pc += L;
  }
  int n=0;
  for (int k=0;k<maxlocals;k++) if (slot_kind[k]==2) spill_idx[k]=n++;
  *n_spill_out = n;
  return true;
}

// Compile a whole method Code to a wasm body via a br-free dispatch loop.
// Returns 0 on success; else the unsupported opcode (>0), or -1 for an
// unsupported control-flow/verification shape (bail -> interpreter).
int compile_cf(Ctx* x, const uint8_t* bc, int bclen, Buf* out) {
  char* leader = (char*)calloc(bclen+1, 1);
  leader[0] = 1;
  x->has_backedge = false; x->uses_oop = false; x->has_call = false;
  x->produces_oop = false; x->has_alloc = false; x->bail = false;
  for (int pc = 0; pc < bclen; ) {
    int L = instr_len(bc, pc);
    if (!L) { free(leader); return bc[pc]; }
    uint8_t o = bc[pc];
    if (o==0x19 || (o>=0x2a && o<=0x2d) || o==Bytecodes::_fast_aload_0
        || o==0x3a || (o>=0x4b && o<=0x4e)           // astore*
        || is_getfield(o) || is_putfield(o)
        || o==0xbe || is_aload_elem(o) || is_astore_elem(o)
        || (o==0xc4 && (bc[pc+1]==0x19 || bc[pc+1]==0x3a))) x->uses_oop = true;  // wide aload/astore
    if (o==0x32) x->produces_oop = true;             // aaload -> raw oop element
    if (o == 0xb8) {                                 // invokestatic
      x->has_call = true;
      int iaw, irt;
      if (wasm_intrinsic(x, nullptr, bc, pc, &iaw, &irt)) {
        // Inlined intrinsic (Math/Integer/Long): no call, no oops, no bail -- even for a
        // NATIVE callee like Math.sqrt (which resolve_invoke would otherwise reject).
      } else {                                        // general JavaCalls path (kind 3)
        InvokeDesc* d; int nw, rt, aw;
        int gs = resolve_invoke(x, bc, pc, 0xb8, &d, &nw, &rt, &aw);
        if (gs == 2) { free(leader); return -2; }      // transient (unresolved) -> retry later
        if (gs != 0) { free(leader); return -1; }
        x->uses_oop = true;                            // oop args Handle-ized by invoke_common
        if (rt == TA) x->produces_oop = true;          // object return -> raw oop
      }
    }
    if (o == 0xb6 || o == 0xb7 || o == 0xb9 || o == 0xe3) {   // invoke v/s/i + vfinal fast (C3)
      x->has_call = true; x->uses_oop = true;        // receiver oop + call safepoint
      InvokeDesc* d; int nw, rt, aw;
      int st = resolve_invoke(x, bc, pc, o, &d, &nw, &rt, &aw);
      if (st == 2) { free(leader); return -2; }
      if (st != 0) { free(leader); return -1; }
      if (rt == TA) x->produces_oop = true;          // object return -> raw oop
    }
    if (o == 0xba) {                                 // invokedynamic (C3.3): string concat / lambda
      x->has_call = true; x->uses_oop = true;
      IndyDesc* d; int nw, rt, aw;
      int st = resolve_indy(x, bc, pc, &d, &nw, &rt, &aw);
      if (st == 2) { free(leader); return -2; }      // bootstrap not resolved yet -> retry
      if (st != 0) { free(leader); return -1; }
      if (rt == TA) x->produces_oop = true;          // object return (e.g. String) -> raw oop
    }
    if (o == 0xb2 || o == 0xb3) {                    // getstatic/putstatic: primitive only
      intptr_t k; int off, tc, wt;
      int st = resolve_static_field(x, bc, pc, o==0xb3, &k, &off, &tc, &wt);
      if (st == 2) { free(leader); return -2; }
      if (st != 0) { free(leader); return -1; }
    }
    if (is_getfield(o) || is_putfield(o)) {          // get/putfield (prim or object field)
      int off, tc, wt;
      int st = resolve_instance_field(x, bc, pc, is_putfield(o), &off, &tc, &wt);
      if (st == 2) { free(leader); return -2; }
      if (st != 0) { free(leader); return -1; }
      if (is_getfield(o) && wt == TA) x->produces_oop = true;   // object getfield -> raw oop
    }
    if (o==Bytecodes::_fast_iaccess_0 || o==Bytecodes::_fast_aaccess_0 ||
        o==Bytecodes::_fast_faccess_0) {             // fused this.field: resolve (index at pc+2)
      x->uses_oop = true;                            // reads `this` (frame oop, slot 0)
      int off, tc, wt;
      int st = resolve_instance_field(x, bc, pc, false, &off, &tc, &wt, 2);
      if (st == 2) { free(leader); return -2; }
      if (st != 0) { free(leader); return -1; }
      if (wt == TA) x->produces_oop = true;          // object field (aaccess_0) -> raw oop
    }
    if (o==0xbb) {                                   // new: class resolved + canonical dup idiom
      if (resolve_klass(x, bc, pc) == 0) { free(leader); return -2; }
      Klass* k = (Klass*)resolve_klass(x, bc, pc);
      if (!k->is_instance_klass()) { free(leader); return -1; }   // array 'new' is newarray/anewarray
      int nx = pc + 3;                               // require `new; dup` (javac's object-init idiom)
      if (nx >= bclen || bc[nx] != 0x59) { free(leader); return -1; }
      x->has_alloc = true; x->uses_oop = true;
    }
    if (o==0xc1) {                                   // instanceof: class must be resolved
      if (resolve_klass(x, bc, pc) == 0) { free(leader); return -2; }
    }
    if (o==0xc0) {                                   // checkcast: class resolved; produces a raw oop
      if (resolve_klass(x, bc, pc) == 0) { free(leader); return -2; }
      x->produces_oop = true; x->uses_oop = true;    // CCE early-return -> handler-free
    }
    if (o==0xbc || o==0xbd) {                        // newarray/anewarray: allocation
      x->has_alloc = true; x->uses_oop = true;       // NASE/OOM early-return -> handler-free
      if (o==0xbd && resolve_klass(x, bc, pc) == 0) { free(leader); return -2; }
      int nx = pc + L; uint8_t no = (nx < bclen) ? bc[nx] : 0;  // require astore right after ->
      if (!(no==0x3a || (no>=0x4b && no<=0x4e))) { free(leader); return -1; }  // new oop -> spill slot
    }
    if (o==0xc5) {                                   // multianewarray, 1..4 dims
      if (bc[pc+3] < 1 || bc[pc+3] > 4) { free(leader); return -1; }  // >4D bails (helper takes 4)
      if (resolve_klass(x, bc, pc) == 0) { free(leader); return -2; }
      x->has_alloc = true; x->uses_oop = true;
      int nx = pc + L; uint8_t no = (nx < bclen) ? bc[nx] : 0;   // require astore right after
      if (!(no==0x3a || (no>=0x4b && no<=0x4e))) { free(leader); return -1; }
    }
    if (o==0xc2 || o==0xc3) {                         // monitorenter/monitorexit (C4.2)
      x->has_alloc = true; x->uses_oop = true;        // enter() blocks -> a safepoint (gate produced oops)
    }
    if (o==0x14) {                                   // ldc2_w: long/double only
      int idx = (bc[pc+1]<<8)|bc[pc+2];
      constantTag t = x->cp->tag_at(idx);
      if (!(t.is_long() || t.is_double())) { free(leader); return -1; }
    }
    // ldc/ldc_w (raw, 0x12/0x13, pool index) and fast_aldc/_w (0xe6/0xe7, ref index):
    // numeric stays numeric; a String/Class constant is a produced oop resolved by the
    // helper. javac leaves object ldc raw OR quickens it to fast_aldc -- handle both.
    if (o==0x12 || o==0x13 || o==0xe6 || o==0xe7) {
      int cpi;
      if (o==0x12) cpi = bc[pc+1];
      else if (o==0x13) cpi = (bc[pc+1]<<8)|bc[pc+2];
      else cpi = x->cp->object_to_cp_index((o==0xe6) ? bc[pc+1] : (bc[pc+1]|(bc[pc+2]<<8)));
      constantTag t = x->cp->tag_at(cpi);
      if (o==0xe6 || o==0xe7 || (!t.is_int() && !t.is_float())) {   // fast_aldc is always object
        if (t.is_string() || t.is_klass() || t.is_unresolved_klass()) {
          x->produces_oop = true; x->uses_oop = true; // resolved to an oop by the helper
        } else { free(leader); return -1; }          // MethodHandle/MethodType/dynamic -> bail
      }
    }
    if (is_switch(bc[pc])) {
      int p = switch_pad(pc), base = pc+1+p, ntgt, toff;
      int def = pc + s4be(bc, base);
      if (def < 0 || def > bclen) { free(leader); return -1; }
      if (def <= pc) x->has_backedge = true; leader[def] = 1;
      if (bc[pc]==0xaa) { int low=s4be(bc,base+4), high=s4be(bc,base+8); ntgt=high-low+1; toff=base+12; }
      else              { ntgt=s4be(bc,base+4); toff=base+8; }
      for (int j=0;j<ntgt;j++) {
        int t = pc + s4be(bc, toff + (bc[pc]==0xaa ? j*4 : j*8+4));
        if (t < 0 || t > bclen) { free(leader); return -1; }
        if (t <= pc) x->has_backedge = true; leader[t] = 1;
      }
      if (pc + L <= bclen) leader[pc + L] = 1;
    } else if (is_branch(bc[pc])) {
      int tgt = branch_target(bc, pc);
      if (tgt < 0 || tgt > bclen) { free(leader); return -1; }
      if (tgt <= pc) x->has_backedge = true;         // loop -> needs safepoint poll
      leader[tgt] = 1; if (pc + L <= bclen) leader[pc + L] = 1;
    } else if (is_return(bc[pc])) {
      if (pc + L < bclen) leader[pc + L] = 1;
    }
    pc += L;
  }
  // C4: exception handlers. Mark each handler_pc as a block leader and require its
  // first op to immediately consume the exception oop (astore/pop -> no safepoint
  // between take_exception and the store, so the oop is GC-safe). We dispatch to
  // handlers in-JIT; on no match we propagate to the caller.
  x->has_handlers = false;
  { int n = x->method->exception_table_length();
    ExceptionTableElement* et = x->method->exception_table_start();
    for (int i=0;i<n;i++) {
      int H = et[i].handler_pc;
      if (H < 0 || H >= bclen) { free(leader); return -1; }
      leader[H] = 1;
      uint8_t fo = bc[H];
      if (!(fo==0x3a || (fo>=0x4b && fo<=0x4e) || fo==0x57)) { free(leader); return -1; }
    }
    if (n > 0) x->has_handlers = true;
  }
  // A produced (raw, non-frame) oop lives only on the operand stack. The empty-
  // stack-at-boundary rule keeps it from crossing a back-edge, and the invoke emit
  // rejects a raw oop stranded *below* a call's args (while oop args/receivers are
  // Handle-ized by wasmjit_invoke_common). So a produced oop crossing a call is
  // handled locally — only an allocation safepoint (new/newarray/multianewarray),
  // which has no such per-op check, still needs the whole-method bail.
  if (x->produces_oop && x->has_alloc) { free(leader); return -1; }
  // Operand stack must be empty (in JVM words) at every block boundary -- except a
  // handler entry, which begins with the exception oop (depth 1).
  { char* is_h = (char*)calloc(bclen+1,1);
    int hn = x->method->exception_table_length();
    ExceptionTableElement* het = x->method->exception_table_start();
    for (int i=0;i<hn;i++) is_h[het[i].handler_pc] = 1;
    int depth = 0;
    for (int pc = 0; pc < bclen; ) {
      if (pc != 0 && leader[pc]) {
        if (is_h[pc]) depth = 1;                             // exception entry
        else if (depth != 0) { free(is_h); free(leader); return -1; }
      }
      uint8_t op = bc[pc];
      if (op == 0xbf) {                                      // athrow: pops exception, then unwinds
        depth = 0;
      } else if (is_branch(op) || is_switch(op)) {
        depth += stack_delta(x,bc,pc);
        if (depth != 0 || depth < 0) { free(is_h); free(leader); return -1; }
      } else if (is_return(op)) {
        depth = 0;
      } else {
        depth += stack_delta(x,bc,pc);
        if (depth < 0) { free(is_h); free(leader); return -1; }
      }
      pc += instr_len(bc, pc);
    }
    free(is_h);
  }

  int nblocks = 0;
  int* blk_of = (int*)malloc(sizeof(int)*(bclen+1));
  for (int pc = 0; pc <= bclen; pc++) blk_of[pc] = -1;
  for (int pc = 0; pc <= bclen; pc++) if (leader[pc]) blk_of[pc] = nblocks++;

  int* vtbuf = (int*)malloc(sizeof(int)*(bclen+8));
  int* vspillbuf = (int*)malloc(sizeof(int)*(bclen+8));
  x->vt = vtbuf; x->vspill = vspillbuf; x->skip_dup = 0; x->blk_of = blk_of;
  // set of handler-start pcs (their blocks begin with the exception oop pushed)
  char* is_hstart = (char*)calloc(bclen+1,1);
  { int hn = x->method->exception_table_length();
    ExceptionTableElement* het = x->method->exception_table_start();
    for (int i=0;i<hn;i++) is_hstart[het[i].handler_pc] = 1; }

  Buf body = {};
  bput(&body, 0x03); bput(&body, 0x40);          // loop (void)
  if (x->has_backedge) { bput(&body,0x10); uleb(&body,Imp::POLL); }  // call $poll (import 0) per iteration
  int cur = 0;
  for (int pc = 0; pc < bclen; ) {
    if (!leader[pc]) { pc += instr_len(bc, pc); continue; }
    get_local(&body,x->BB); bput(&body,0x41); sleb(&body,cur); bput(&body,0x46);
    bput(&body,0x04); bput(&body,0x40);          // if (i32.eq $bb cur)
    int blkend = pc; do { blkend += instr_len(bc, blkend); } while (blkend < bclen && !leader[blkend]);
    int lastpc = pc; while (lastpc + instr_len(bc,lastpc) < blkend) lastpc += instr_len(bc,lastpc);
    x->vn = 0;
    if (is_hstart[pc]) {                              // handler entry: take the exception oop
      bput(&body,0x10); uleb(&body,Imp::TAKE_EXCEPTION);              // call $take_exception -> i32 oop
      vpush(x, TA);                                  // (first op is astore/pop -> consumed immediately)
    }
    for (int p = pc; p < blkend; ) {
      uint8_t op = bc[p]; int L = instr_len(bc, p);
      if (is_switch(op)) {
        // set $bb from the index via a linear compare chain, then br to loop top
        int pd = switch_pad(p), base = p+1+pd, ntgt, toff, low=0;
        set_local(&body, x->TMPI);                   // index
        bput(&body,0x41); sleb(&body, blk_of[p + s4be(bc,base)]);  // default
        set_local(&body, x->BB);
        if (op==0xaa) { low=s4be(bc,base+4); int high=s4be(bc,base+8); ntgt=high-low+1; toff=base+12; }
        else          { ntgt=s4be(bc,base+4); toff=base+8; }
        for (int j=0;j<ntgt;j++) {
          int matchv = (op==0xaa) ? low+j : s4be(bc, toff+j*8);
          int tpc = p + s4be(bc, toff + (op==0xaa ? j*4 : j*8+4));
          get_local(&body, x->TMPI); bput(&body,0x41); sleb(&body,matchv); bput(&body,0x46); // idx==match
          bput(&body,0x04); bput(&body,0x40);
            bput(&body,0x41); sleb(&body, blk_of[tpc]); set_local(&body,x->BB);
          bput(&body,0x0b);
        }
        bput(&body,0x0c); uleb(&body,1);             // br loop
      } else if (is_branch(op)) {
        int tgt = blk_of[branch_target(bc, p)], fall = blk_of[p + L];
        if (op == 0xa7 || op == 0xc8) { bput(&body,0x41); sleb(&body,tgt); }
        else { emit_cond(&body, op);
               set_local(&body,x->TMPI);
               bput(&body,0x41); sleb(&body,tgt); bput(&body,0x41); sleb(&body,fall);
               get_local(&body,x->TMPI); bput(&body,0x1b); }
        set_local(&body,x->BB); bput(&body,0x0c); uleb(&body,1);
      } else if (is_return(op)) {
        emit_sync_unlock(x, &body);                // sync method: unlock `this` before returning (result stays on stack)
        if (x->n_spill > 0) {                      // pop the oop-spill frame (result stays below n)
          bput(&body,0x41); sleb(&body,x->n_spill); bput(&body,0x10); uleb(&body,Imp::OOP_LEAVE);
        }
        switch (op) {                              // widen result to i64 to match fn type
          case 0xac: bput(&body,0xac); break;      // ireturn: i64.extend_i32_s
          case 0xb0: bput(&body,0xad); break;      // areturn: i64.extend_i32_u (oop addr)
          case 0xad: break;                        // lreturn: already i64
          case 0xae: bput(&body,0xbc); bput(&body,0xad); break; // freturn: reinterpret + extend_u
          case 0xaf: bput(&body,0xbd); break;      // dreturn: i64.reinterpret_f64
          case 0xb1: bput(&body,0x42); sleb(&body,0); break;    // return void: push 0
        }
        bput(&body,0x0f);
      } else {
        emit_op(x, &body, bc, p);
      }
      p += L;
    }
    if (!is_branch(bc[lastpc]) && !is_return(bc[lastpc]) && !is_switch(bc[lastpc])) {
      bput(&body,0x41); sleb(&body, blk_of[blkend]);
      set_local(&body,x->BB); bput(&body,0x0c); uleb(&body,1);
    }
    bput(&body,0x0b);                            // end if
    cur++; pc = blkend;
  }
  bput(&body,0x0b); bput(&body,0x00);            // end loop; unreachable
  free(is_hstart);
  if (x->bail) { free(body.p); free(leader); free(blk_of); free(vtbuf); free(vspillbuf); return -1; }
  *out = body; free(leader); free(vtbuf); free(vspillbuf);
  x->osr_blk = blk_of;   // OSR: keep the bci->block map (ownership passes to do_compile)
  return 0;
}

// Emit the module: type (i64 x nargs)->i64, one function, export "f".
// argtype/argslot describe args; rettype the return; ltype the slot types.

} // namespace wasm
#endif // __EMSCRIPTEN__

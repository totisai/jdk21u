/*
 * WasmJit — local/oop analysis passes and basic-block control-flow assembly
 * (classify_locals, analyze_oop_slots, compile_cf). See wasmCompiler.hpp.
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
  loop_void(&body);                              // loop (void)
  if (x->has_backedge) { emit_call(&body,Imp::POLL); }  // call $poll (import 0) per iteration
  int cur = 0;
  for (int pc = 0; pc < bclen; ) {
    if (!leader[pc]) { pc += instr_len(bc, pc); continue; }
    get_local(&body,x->BB); i32_const(&body,cur); bput(&body,op_i32_eq);
    if_void(&body);          // if (i32.eq $bb cur)
    int blkend = pc; do { blkend += instr_len(bc, blkend); } while (blkend < bclen && !leader[blkend]);
    int lastpc = pc; while (lastpc + instr_len(bc,lastpc) < blkend) lastpc += instr_len(bc,lastpc);
    x->vn = 0;
    if (is_hstart[pc]) {                              // handler entry: take the exception oop
      emit_call(&body,Imp::TAKE_EXCEPTION);              // call $take_exception -> i32 oop
      vpush(x, TA);                                  // (first op is astore/pop -> consumed immediately)
    }
    for (int p = pc; p < blkend; ) {
      uint8_t op = bc[p]; int L = instr_len(bc, p);
      if (is_switch(op)) {
        // set $bb from the index via a linear compare chain, then br to loop top
        int pd = switch_pad(p), base = p+1+pd, ntgt, toff, low=0;
        set_local(&body, x->TMPI);                   // index
        i32_const(&body,blk_of[p + s4be(bc,base)]);  // default
        set_local(&body, x->BB);
        if (op==0xaa) { low=s4be(bc,base+4); int high=s4be(bc,base+8); ntgt=high-low+1; toff=base+12; }
        else          { ntgt=s4be(bc,base+4); toff=base+8; }
        for (int j=0;j<ntgt;j++) {
          int matchv = (op==0xaa) ? low+j : s4be(bc, toff+j*8);
          int tpc = p + s4be(bc, toff + (op==0xaa ? j*4 : j*8+4));
          get_local(&body, x->TMPI); i32_const(&body,matchv); bput(&body,op_i32_eq); // idx==match
          if_void(&body);
            i32_const(&body,blk_of[tpc]); set_local(&body,x->BB);
          emit_end(&body);
        }
        br(&body,1);             // br loop
      } else if (is_branch(op)) {
        int tgt = blk_of[branch_target(bc, p)], fall = blk_of[p + L];
        if (op == 0xa7 || op == 0xc8) { i32_const(&body,tgt); }
        else { emit_cond(&body, op);
               set_local(&body,x->TMPI);
               i32_const(&body,tgt); i32_const(&body,fall);
               get_local(&body,x->TMPI); bput(&body,op_select); }
        set_local(&body,x->BB); br(&body,1);
      } else if (is_return(op)) {
        emit_sync_unlock(x, &body);                // sync method: unlock `this` before returning (result stays on stack)
        if (x->n_spill > 0) {                      // pop the oop-spill frame (result stays below n)
          i32_const(&body,x->n_spill); emit_call(&body,Imp::OOP_LEAVE);
        }
        switch (op) {                              // widen result to i64 to match fn type
          case 0xac: bput(&body,op_i64_extend_i32_s); break;      // ireturn: i64.extend_i32_s
          case 0xb0: bput(&body,op_i64_extend_i32_u); break;      // areturn: i64.extend_i32_u (oop addr)
          case 0xad: break;                        // lreturn: already i64
          case 0xae: bput(&body,op_i32_reinterpret_f32); bput(&body,op_i64_extend_i32_u); break; // freturn: reinterpret + extend_u
          case 0xaf: bput(&body,op_i64_reinterpret_f64); break;      // dreturn: i64.reinterpret_f64
          case 0xb1: i64_const(&body,0); break;    // return void: push 0
        }
        ret(&body);
      } else {
        emit_op(x, &body, bc, p);
      }
      p += L;
    }
    if (!is_branch(bc[lastpc]) && !is_return(bc[lastpc]) && !is_switch(bc[lastpc])) {
      i32_const(&body,blk_of[blkend]);
      set_local(&body,x->BB); br(&body,1);
    }
    emit_end(&body);                            // end if
    cur++; pc = blkend;
  }
  emit_end(&body); bput(&body,op_unreachable);            // end loop; unreachable
  free(is_hstart);
  if (x->bail) { free(body.p); free(leader); free(blk_of); free(vtbuf); free(vspillbuf); return -1; }
  *out = body; free(leader); free(vtbuf); free(vspillbuf);
  x->osr_blk = blk_of;   // OSR: keep the bci->block map (ownership passes to do_compile)
  return 0;
}

} // namespace wasm
#endif // __EMSCRIPTEN__

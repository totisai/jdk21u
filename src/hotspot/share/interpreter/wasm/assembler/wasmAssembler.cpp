/*
 * WasmJit — WebAssembly assembler implementation (Buf/LEB/opcode encoding + module
 * assembly). See interpreter/wasm/assembler/wasmAssembler.hpp.
 */
#include "precompiled.hpp"
#ifdef __EMSCRIPTEN__
#include "interpreter/wasm/assembler/wasmAssembler.hpp"
#include "interpreter/wasm/core/wasmImports.hpp"
#include <stdlib.h>
#include <string.h>

namespace wasm {

uint8_t wasm_valtype(int t){ switch(t){case TJ:return 0x7e;case TF:return 0x7d;case TD:return 0x7c;default:return 0x7f;} }
int type_words(int t){ if(t==TV) return 0; return (t==TJ||t==TD)?2:1; }

void bput(Buf* b, uint8_t x){ if(b->n==b->cap){ b->cap=b->cap?b->cap*2:64; b->p=(uint8_t*)realloc(b->p,b->cap);} b->p[b->n++]=x; }
void bputs(Buf* b, const uint8_t* s, int n){ for(int i=0;i<n;i++) bput(b,s[i]); }
void uleb(Buf* b, uint32_t v){ do{ uint8_t x=v&0x7f; v>>=7; if(v) x|=0x80; bput(b,x);}while(v); }
void sleb(Buf* b, int64_t v){ int more=1; while(more){ uint8_t x=v&0x7f; v>>=7; if((v==0&&!(x&0x40))||(v==-1&&(x&0x40))) more=0; else x|=0x80; bput(b,x);} }

void get_local(Buf* c, uint32_t idx){ bput(c,op_local_get); uleb(c,idx); }
void set_local(Buf* c, uint32_t idx){ bput(c,op_local_set); uleb(c,idx); }
void tee_local(Buf* c, uint32_t idx){ bput(c,op_local_tee); uleb(c,idx); }

void i32_const(Buf* c, int32_t v){ bput(c,op_i32_const); sleb(c,v); }
void i64_const(Buf* c, int64_t v){ bput(c,op_i64_const); sleb(c,v); }
void emit_call(Buf* c, uint32_t func){ bput(c,op_call); uleb(c,func); }

// A memory load/store: opcode followed by its {align, offset} immediates.
void mem_op(Buf* c, WOp op, uint32_t align, uint32_t offset){ bput(c,op); uleb(c,align); uleb(c,offset); }

// Structured control flow. The block/if/loop forms all take an empty ([]->[])
// blocktype, which is how this backend uses them.
void trunc_sat(Buf* c, uint8_t sel){ bput(c,op_trunc_sat_prefix); bput(c,sel); }
void if_void(Buf* c){ bput(c,op_if); bput(c,bt_void); }
void if_type(Buf* c, uint8_t blocktype){ bput(c,op_if); bput(c,blocktype); }
void block_void(Buf* c){ bput(c,op_block); bput(c,bt_void); }
void loop_void(Buf* c){ bput(c,op_loop); bput(c,bt_void); }
void emit_else(Buf* c){ bput(c,op_else); }
void emit_end(Buf* c){ bput(c,op_end); }
void br(Buf* c, uint32_t depth){ bput(c,op_br); uleb(c,depth); }
void br_if(Buf* c, uint32_t depth){ bput(c,op_br_if); uleb(c,depth); }
void ret(Buf* c){ bput(c,op_return); }
void drop(Buf* c){ bput(c,op_drop); }
// widen top-of-stack value of type t to i64, or narrow an i64 back to type t
// (round-trips exactly: wrap recovers the low 32 bits regardless of extension).
void widen_i64(Buf* c, int t){ switch(t){ case TJ: break; case TF: bput(c,0xbc); bput(c,0xad); break;
  case TD: bput(c,0xbd); break; default: bput(c,0xac); break; } }        // TI/TA
void narrow_i64(Buf* c, int t){ switch(t){ case TJ: break; case TF: bput(c,0xa7); bput(c,0xbe); break;
  case TD: bput(c,0xbf); break; default: bput(c,0xa7); break; } }        // TI/TA

void emit_cond(Buf* c, uint8_t op) {
  switch (op) {
    case 0x99: bput(c,0x41); sleb(c,0); bput(c,0x46); break;
    case 0x9a: bput(c,0x41); sleb(c,0); bput(c,0x47); break;
    case 0x9b: bput(c,0x41); sleb(c,0); bput(c,0x48); break;
    case 0x9c: bput(c,0x41); sleb(c,0); bput(c,0x4e); break;
    case 0x9d: bput(c,0x41); sleb(c,0); bput(c,0x4a); break;
    case 0x9e: bput(c,0x41); sleb(c,0); bput(c,0x4c); break;
    case 0x9f: bput(c,0x46); break; case 0xa0: bput(c,0x47); break; case 0xa1: bput(c,0x48); break;
    case 0xa2: bput(c,0x4e); break; case 0xa3: bput(c,0x4a); break; case 0xa4: bput(c,0x4c); break;
    case 0xc6: bput(c,0x41); sleb(c,0); bput(c,0x46); break;   // ifnull   == (ref==0)
    case 0xc7: bput(c,0x41); sleb(c,0); bput(c,0x47); break;   // ifnonnull== (ref!=0)
    case 0xa5: bput(c,0x46); break;                           // if_acmpeq (i32.eq)
    case 0xa6: bput(c,0x47); break;                           // if_acmpne (i32.ne)
  }
}

int emit_module(Buf* out, const uint8_t* body, int bodylen, Ctx* x,
                       const uint8_t* argtype, const int* argslot, int nargs, int rettype) {
  const uint8_t hdr[]={0,0x61,0x73,0x6d,1,0,0,0}; bputs(out,hdr,8);
  // types: 0 = ()->() (poll); 1 = (i64 x nargs)->i64 (our fn);
  // 2 = (i32,i64x8,i32)->i64 (invoke); 3 = (i32,i32,i32)->i64 (getstatic);
  // 4 = (i32,i32,i32,i64)->() (putstatic)
  Buf t={}; uleb(&t,14);
  bput(&t,0x60); bput(&t,0); bput(&t,0);                    // type0 ()->()
  // type1: (i64 x nargs, i64 localsbase) -> i64  (the extra param is the frame base)
  bput(&t,0x60); uleb(&t,nargs+1); for(int i=0;i<nargs+1;i++) bput(&t,0x7e); bput(&t,1); bput(&t,0x7e);
  bput(&t,0x60); uleb(&t,10); bput(&t,0x7f); for(int i=0;i<8;i++) bput(&t,0x7e); bput(&t,0x7f);
  bput(&t,1); bput(&t,0x7e);                                // type2 -> i64
  bput(&t,0x60); uleb(&t,3); bput(&t,0x7f); bput(&t,0x7f); bput(&t,0x7f); bput(&t,1); bput(&t,0x7e); // type3 -> i64
  bput(&t,0x60); uleb(&t,4); bput(&t,0x7f); bput(&t,0x7f); bput(&t,0x7f); bput(&t,0x7e); bput(&t,0);  // type4 -> ()
  bput(&t,0x60); uleb(&t,1); bput(&t,0x7f); bput(&t,1); bput(&t,0x7f);   // type5 (i32)->i32
  bput(&t,0x60); uleb(&t,1); bput(&t,0x7f); bput(&t,0);                  // type6 (i32)->()
  bput(&t,0x60); uleb(&t,2); bput(&t,0x7f); bput(&t,0x7f); bput(&t,1); bput(&t,0x7f); // type7 (i32,i32)->i32
  bput(&t,0x60); uleb(&t,3); bput(&t,0x7f); bput(&t,0x7f); bput(&t,0x7e); bput(&t,1); bput(&t,0x7f); // type8 (i32,i32,i64)->i32
  bput(&t,0x60); uleb(&t,0); bput(&t,1); bput(&t,0x7f);                  // type9 ()->i32 (pending)
  bput(&t,0x60); uleb(&t,4); bput(&t,0x7f); bput(&t,0x7f); bput(&t,0x7f); bput(&t,0x7f); bput(&t,1); bput(&t,0x7f); // type10 (i32x4)->i32
  bput(&t,0x60); uleb(&t,2); bput(&t,0x7d); bput(&t,0x7d); bput(&t,1); bput(&t,0x7d);  // type11 (f32,f32)->f32
  bput(&t,0x60); uleb(&t,2); bput(&t,0x7c); bput(&t,0x7c); bput(&t,1); bput(&t,0x7c);  // type12 (f64,f64)->f64
  bput(&t,0x60); uleb(&t,6); for(int i=0;i<6;i++) bput(&t,0x7f); bput(&t,1); bput(&t,0x7f); // type13 (i32x6)->i32
  bput(out,1); uleb(out,t.n); bputs(out,t.p,t.n); free(t.p);
  // imports: p:0 i:1 g:2 s:3 F:4(getfield) N:5(npe) U:6(putfield)
  //          l:7(arraylength,type5) a:8(aload,type3) r:9(astore,type4) b:10(aioobe,type6)
  Buf im={}; uleb(&im, 1 + IMPORT_COUNT);   // 1 memory import + the function imports
  bput(&im,1); bput(&im,'e'); bput(&im,1); bput(&im,'m'); bput(&im,0x02);       // import memory
  bput(&im,0x03); uleb(&im,0); uleb(&im,65536);                                 // shared, min 0, max 4GB
  // function imports, in Imp order (the single source of truth: core/wasmImports.hpp).
  // The declaration order here IS the function index the compiler calls (`call Imp::X`).
  for (int k = 0; k < IMPORT_COUNT; k++) {
    bput(&im,1); bput(&im,'e'); bput(&im,1); bput(&im, kImports[k].name); bput(&im,0x00); uleb(&im, kImports[k].type);
  }
  bput(out,2); uleb(out,im.n); bputs(out,im.p,im.n); free(im.p);
  // function section: our function has type1 -> function index IMPORT_COUNT
  bput(out,3); bput(out,2); bput(out,1); bput(out,1);   // 1 function of type1
  // export "f" = function index IMPORT_COUNT (after all imports)
  bput(out,7); bput(out,5); bput(out,1); bput(out,1); bput(out,'f'); bput(out,0); bput(out, IMPORT_COUNT);  // function index = past all imports
  // code section
  Buf fn={};
  // locals decl: java slots (typed) + BB(i32) + TMPI(i32) + TMPJ,TMPJ2(i64) + TMPF,TMPF2(f32) + TMPD,TMPD2(f64)
  bput(&fn, 0); int declpos = fn.n - 1;   // we will rewrite the run count below
  // emit one run per local (count=1) to allow arbitrary per-index types
  int runs = 0;
  for (int k=0;k<x->maxlocals;k++){ bput(&fn,1); bput(&fn, x->ltype[k]); runs++; }
  bput(&fn,1); bput(&fn,0x7f); runs++;                       // BB
  bput(&fn,1); bput(&fn,0x7f); runs++;                       // TMPI
  bput(&fn,1); bput(&fn,0x7e); runs++;                       // TMPJ
  bput(&fn,1); bput(&fn,0x7e); runs++;                       // TMPJ2
  bput(&fn,1); bput(&fn,0x7d); runs++;                       // TMPF
  bput(&fn,1); bput(&fn,0x7d); runs++;                       // TMPF2
  bput(&fn,1); bput(&fn,0x7c); runs++;                       // TMPD
  bput(&fn,1); bput(&fn,0x7c); runs++;                       // TMPD2
  for (int j=0;j<8;j++){ bput(&fn,1); bput(&fn,0x7e); runs++; }  // ARG0..ARG7 (i64)
  bput(&fn,1); bput(&fn,0x7f); runs++;                       // TMPI2 (i32, array index)
  for (int j=0;j<4;j++){ bput(&fn,1); bput(&fn,0x7e); runs++; }  // SH0..SH3 (i64, shuffle)
  bput(&fn,1); bput(&fn,0x7f); runs++;                       // LB (i32, frame base)
  bput(&fn,1); bput(&fn,0x7f); runs++;                       // SB (i32, oop-spill region base)
  // rewrite run count (runs < 128 for our method sizes)
  fn.p[declpos] = (uint8_t)runs;
  // prologue: convert each i64 param into its typed java-slot local. Object args
  // (TA) are NOT cached -- they're re-read from the frame local on each aload.
  for (int i=0;i<nargs;i++) {
    int slot = argslot[i]; int t = argtype[i];
    if (t == TA) continue;
    get_local(&fn, i);                                       // i64 param
    switch (t) {
      case TI: bput(&fn,0xa7); break;                        // i32.wrap_i64
      case TJ: break;                                        // already i64
      case TF: bput(&fn,0xa7); bput(&fn,0xbe); break;        // wrap then f32.reinterpret_i32
      case TD: bput(&fn,0xbf); break;                        // f64.reinterpret_i64
    }
    set_local(&fn, x->base + slot);
  }
  get_local(&fn, nargs); bput(&fn,0xa7); set_local(&fn, x->LB);  // localsbase -> LB (i32)
  if (x->n_spill > 0) {                                          // reserve the oop-spill frame
    bput(&fn,0x41); sleb(&fn, x->n_spill); bput(&fn,0x10); uleb(&fn,Imp::OOP_ENTER); set_local(&fn, x->SB);
  }
  if (x->sync_method) {                                          // C4.2: lock on entry
    if (x->method->is_static()) {                                // static sync: lock the Class mirror
      bput(&fn,0x41); sleb(&fn,(int32_t)(intptr_t)x->method->method_holder());
      bput(&fn,0x10); uleb(&fn,Imp::SMONENTER);                                 // call $static_monitorenter -> i32
    } else {                                                     // instance sync: lock `this`
    if (x->slot_kind[0]==2) { get_local(&fn,x->SB); bput(&fn,0x41); sleb(&fn,x->spill_idx[0]*4); bput(&fn,0x6a); }
    else                    { get_local(&fn,x->LB); bput(&fn,0x41); sleb(&fn,0); bput(&fn,0x6b); }
    bput(&fn,0x28); bput(&fn,0x02); bput(&fn,0);                 // i32.load -> this oop
    bput(&fn,0x10); uleb(&fn,Imp::MONITORENTER);                                // call $monitorenter -> i32 (1=pending)
    }
    bput(&fn,0x04); bput(&fn,0x40);                              // if (pending: OOM at lock entry)
      if (x->n_spill>0){ bput(&fn,0x41); sleb(&fn,x->n_spill); bput(&fn,0x10); uleb(&fn,Imp::OOP_LEAVE); }  // $leave
      bput(&fn,0x42); bput(&fn,0x00); bput(&fn,0x0f);            // i64.const 0; return (propagate)
    bput(&fn,0x0b);
  }
  // OSR: a method with a back-edge may be entered mid-loop. Read the interpreter's
  // requested entry block (0 = normal method entry) into BB before the dispatch loop.
  // Gated on WASMJIT_OSR so non-OSR builds pay no per-entry cost. Sync methods are never
  // OSR'd (the interpreter already holds the monitor), so skip the read for them.
  { static int osr=-1; if(osr<0){const char* e=::getenv("WASMJIT_OSR"); osr=(e&&e[0]=='1')?1:0;}
    if (osr && x->has_backedge && !x->sync_method) {
      bput(&fn,0x10); uleb(&fn,Imp::OSR_BB); set_local(&fn, x->BB);
      // OSR entry (BB != 0) jumps straight to the loop block, skipping block 0 which
      // initializes the non-arg locals. Restore EVERY live primitive local from the
      // interpreter frame so the resumed loop sees the interpreter's values (not
      // wasm-zero). Object locals are re-read from the frame on each aload (C1), so
      // skip them here. Frame layout (bytecodeInterpreter_zero.hpp): int/float slot k
      // at LB-k*4; long/double 8 bytes at LB-(k+1)*4. JIT models a long/double as one
      // wasm local at base+k. Only runs on the OSR path -> normal entry pays nothing.
      get_local(&fn, x->BB);                                    // BB != 0 ?
      bput(&fn,0x04); bput(&fn,0x40);                           // if (OSR entry)
      for (int k = 0; k < x->maxlocals; k++) {
        if (x->slot_kind[k] != 0) continue;                    // object slot: aload re-reads it
        uint8_t t = x->ltype[k];
        int woff = (t==0x7e || t==0x7c) ? (k+1)*4 : k*4;       // long/double are 8 bytes at -(k+1)
        get_local(&fn, x->LB); bput(&fn,0x41); sleb(&fn, woff); bput(&fn,0x6b);   // LB - woff
        switch (t) {                                          // frame slots are 4-byte aligned
          case 0x7f: bput(&fn,0x28); bput(&fn,0x02); bput(&fn,0); break;  // i32.load
          case 0x7e: bput(&fn,0x29); bput(&fn,0x02); bput(&fn,0); break;  // i64.load (align 4)
          case 0x7d: bput(&fn,0x2a); bput(&fn,0x02); bput(&fn,0); break;  // f32.load
          case 0x7c: bput(&fn,0x2b); bput(&fn,0x02); bput(&fn,0); break;  // f64.load (align 4)
          default:   bput(&fn,0x28); bput(&fn,0x02); bput(&fn,0); break;  // (i32 fallback)
        }
        set_local(&fn, x->base + k);
      }
      bput(&fn,0x0b);                                           // end if
    } }
  bputs(&fn, body, bodylen);
  // Note: bodies end with `unreachable`; each return path widens+returns below.
  bput(&fn,0x0b);
  Buf sec={}; bput(&sec,1); uleb(&sec,fn.n); bputs(&sec,fn.p,fn.n);
  bput(out,0x0a); uleb(out,sec.n); bputs(out,sec.p,sec.n);
  free(fn.p); free(sec.p);
  (void)rettype;
  return out->n;
}

} // namespace wasm
#endif // __EMSCRIPTEN__

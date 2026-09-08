/*
 * WasmJit — JVM bytecode decode helpers (instruction length, branch/switch/return
 * classification, array-element typing). Pure functions over a bytecode array; no
 * VM state. Part of the interpreter/wasm/ WASM JIT (see interpreter/wasm/wasmJit.hpp).
 */
#include "precompiled.hpp"
#ifdef __EMSCRIPTEN__
#include "interpreter/wasm/assembler/wasmBytecodes.hpp"
#include "interpreter/bytecodes.hpp"

namespace wasm {

int32_t s4be(const uint8_t* bc, int off){
  return (int32_t)((bc[off]<<24)|(bc[off+1]<<16)|(bc[off+2]<<8)|bc[off+3]); }
int switch_pad(int pc){ return (4 - ((pc+1) & 3)) & 3; }  // 0-3 alignment padding
int instr_len(const uint8_t* bc, int pc) {
  uint8_t op = bc[pc];
  if (op == 0xaa) { int p=switch_pad(pc); int base=pc+1+p;      // tableswitch
    int low=s4be(bc,base+4), high=s4be(bc,base+8); return 1+p+12+(high-low+1)*4; }
  if (op == 0xab) { int p=switch_pad(pc); int base=pc+1+p;      // lookupswitch
    int npairs=s4be(bc,base+4); return 1+p+8+npairs*8; }
  if (op == 0xc8) return 5;                                     // goto_w
  if (op == 0xb9) return 5;                                     // invokeinterface (index u2, count, 0)
  if (op == 0xba) return 5;                                     // invokedynamic (index u4)
  if (op == 0xc4) {                                             // wide prefix (C4.3, primitive only)
    uint8_t s = bc[pc+1];
    if (s == 0x84) return 6;                                    // wide iinc: op sub idx(2) const(2)
    if (s==0x15||s==0x16||s==0x17||s==0x18||s==0x36||s==0x37||s==0x38||s==0x39   // [ilfd]load/store
        || s==0x19 || s==0x3a) return 4;                        // wide aload/astore (object)
    return 0;                                                   // wide ret (legacy) -> bail
  }
  if (op == 0xc5) return 4;                                     // multianewarray: cpindex(2) + ndims(1)
  if (op==Bytecodes::_fast_iaccess_0 || op==Bytecodes::_fast_aaccess_0 ||
      op==Bytecodes::_fast_faccess_0) return 4;                 // fused aload_0;getfield (b_JJ)
  if (op == 0xc2 || op == 0xc3) return 1;                       // monitorenter / monitorexit
  switch (op) {
    // int const/load/store/alu, dup/pop, i2b/c/s
    case 0x02: case 0x03: case 0x04: case 0x05: case 0x06: case 0x07: case 0x08:
    case 0x1a: case 0x1b: case 0x1c: case 0x1d:
    case 0x3b: case 0x3c: case 0x3d: case 0x3e:
    case 0x59: case 0x57:
    case 0x60: case 0x64: case 0x68: case 0x74:   // iadd isub imul ineg
    case 0x6c: case 0x70:                          // idiv irem (C4.1: div-by-zero -> ArithmeticException)
    case 0x7e: case 0x80: case 0x82: case 0x78: case 0x7a: case 0x7c:
    case 0x91: case 0x92: case 0x93:
    case 0xac:                                     // ireturn
    // long const/load/store/alu/cmp/return  (ldiv 0x6d, lrem 0x71 bail)
    case 0x09: case 0x0a:
    case 0x1e: case 0x1f: case 0x20: case 0x21:
    case 0x3f: case 0x40: case 0x41: case 0x42:
    case 0x61: case 0x65: case 0x69: case 0x75:
    case 0x6d: case 0x71:                          // ldiv lrem (C4.1)
    case 0x7f: case 0x81: case 0x83: case 0x79: case 0x7b: case 0x7d:
    case 0x94: case 0xad:
    // float const/load/store/alu/cmp/return
    case 0x0b: case 0x0c: case 0x0d:
    case 0x22: case 0x23: case 0x24: case 0x25:
    case 0x43: case 0x44: case 0x45: case 0x46:    // fstore_0..3 (were mis-listed as 0x47..0x4a)
    case 0x62: case 0x66: case 0x6a: case 0x6e: case 0x72: case 0x76:   // +frem
    case 0x95: case 0x96: case 0xae:
    // double const/load/store/alu/cmp/return
    case 0x0e: case 0x0f:
    case 0x26: case 0x27: case 0x28: case 0x29:
    case 0x47: case 0x48: case 0x49: case 0x4a:    // dstore_0..3 (were mis-listed as 0x4b..0x4e)
    case 0x63: case 0x67: case 0x6b: case 0x6f: case 0x73: case 0x77:   // +drem
    case 0x97: case 0x98: case 0xaf:
    // conversions
    case 0x85: case 0x86: case 0x87: case 0x88: case 0x89: case 0x8a:
    case 0x8b: case 0x8c: case 0x8d: case 0x8e: case 0x8f: case 0x90:
    case 0x2a: case 0x2b: case 0x2c: case 0x2d:    // aload_0..3 (object refs, M2)
    case 0x4b: case 0x4c: case 0x4d: case 0x4e:    // astore_0..3 (object, C2 spill)
    case Bytecodes::_fast_aload_0:                 // rewritten aload_0
    case 0x2e: case 0x2f: case 0x30: case 0x31:    // iaload/laload/faload/daload
    case 0x32: case 0x33: case 0x34: case 0x35:    // aaload/baload/caload/saload
    case 0x4f: case 0x50: case 0x51: case 0x52:    // iastore/lastore/fastore/dastore
    case 0x53: case 0x54: case 0x55: case 0x56:    // aastore/bastore/castore/sastore
    case 0xbe:                                     // arraylength
    case 0xbf:                                     // athrow (C4)
    case 0x00:                                     // nop
    case 0x01:                                     // aconst_null
    case 0x58: case 0x5a: case 0x5b: case 0x5c: case 0x5d: case 0x5e: case 0x5f:  // pop2/dup_x1/x2/dup2/dup2_x1/dup2_x2/swap
    case 0xb0:                                     // areturn (object return)
    case 0xb1:                                     // return (void)
      return 1;
    case 0xb2: case 0xb3:                           // getstatic/putstatic (M2)
    case 0xb4: case 0xb5:                           // get/putfield (M2 instance)
    case Bytecodes::_fast_agetfield: case Bytecodes::_fast_aputfield:  // object fields (C2)
    case Bytecodes::_fast_bgetfield: case Bytecodes::_fast_cgetfield:  // rewritten fast forms
    case Bytecodes::_fast_dgetfield: case Bytecodes::_fast_fgetfield:
    case Bytecodes::_fast_igetfield: case Bytecodes::_fast_lgetfield:
    case Bytecodes::_fast_sgetfield:
    case Bytecodes::_fast_bputfield: case Bytecodes::_fast_zputfield:
    case Bytecodes::_fast_cputfield: case Bytecodes::_fast_dputfield:
    case Bytecodes::_fast_fputfield: case Bytecodes::_fast_iputfield:
    case Bytecodes::_fast_lputfield: case Bytecodes::_fast_sputfield:
    case 0xc0:                                     // checkcast (C2)
    case 0xc1:                                     // instanceof (C2)
    case 0xbd:                                     // anewarray (CP index)
    case 0xbb:                                     // new (CP index -> object alloc)
    case 0xb6: case 0xb7:                           // invokevirtual / invokespecial (C3)
    case 0xe3:                                      // fast_invokevfinal (rewritten invokevirtual)
    case 0xb8: return 3;                            // invokestatic (M3)
    case 0x19: case 0x3a:                          // aload / astore (wide index)
    case 0xbc:                                     // newarray (atype byte)
    case 0x10: case 0x15: case 0x36:
    case 0x16: case 0x37: case 0x17: case 0x38: case 0x18: case 0x39:  // wide-index l/f/d load/store
    case 0x12:                                     // ldc
    case 0xe6:                                     // fast_aldc (object ldc, u1 ref index)
      return 2;
    case 0x11: case 0x84:
    case 0x13: case 0x14:                          // ldc_w, ldc2_w
    case 0xe7:                                     // fast_aldc_w (object ldc, u2 ref index)
    case 0x99: case 0x9a: case 0x9b: case 0x9c: case 0x9d: case 0x9e:
    case 0x9f: case 0xa0: case 0xa1: case 0xa2: case 0xa3: case 0xa4:
    case 0xa5: case 0xa6:                          // if_acmpeq/ne (C0.1)
    case 0xc6: case 0xc7:                          // ifnull/ifnonnull (C0.1)
    case 0xa7:
      return 3;
    default: return 0;
  }
}
// getfield, including the interpreter's rewritten fast forms (same operand +
// cache entry). _fast_agetfield (object) is excluded — we bail on object fields.
bool is_getfield(uint8_t op){
  return op==0xb4 || op==Bytecodes::_fast_agetfield ||
         (op>=Bytecodes::_fast_bgetfield && op<=Bytecodes::_fast_sgetfield);
}
bool is_putfield(uint8_t op){
  return op==0xb5 || op==Bytecodes::_fast_aputfield ||
         (op>=Bytecodes::_fast_bputfield && op<=Bytecodes::_fast_sputfield);
}
// array load/store (aaload 0x32 / aastore 0x53 are the object-element forms)
bool is_aload_elem(uint8_t op){ return (op>=0x2e&&op<=0x35); }        // 0x2e..0x35 (incl aaload)
bool is_astore_elem(uint8_t op){ return (op>=0x4f&&op<=0x56); }       // 0x4f..0x56 (incl aastore)
// element typecode and wasm value type for an array op (tc 8 = object element)
void array_elem(uint8_t op, int* tc, int* wt) {
  switch (op) {
    case 0x2e: case 0x4f: *tc=0; *wt=TI; break;  // i
    case 0x2f: case 0x50: *tc=1; *wt=TJ; break;  // l
    case 0x30: case 0x51: *tc=2; *wt=TF; break;  // f
    case 0x31: case 0x52: *tc=3; *wt=TD; break;  // d
    case 0x32: case 0x53: *tc=8; *wt=TA; break;  // a (object)
    case 0x33: case 0x54: *tc=4; *wt=TI; break;  // b (byte/bool)
    case 0x34: case 0x55: *tc=5; *wt=TI; break;  // c
    default:              *tc=6; *wt=TI; break;  // s (0x35/0x56)
  }
}
int is_branch(uint8_t op){ return (op>=0x99 && op<=0xa6) || op==0xa7 || op==0xc6 || op==0xc7 || op==0xc8; }
int is_switch(uint8_t op){ return op==0xaa || op==0xab; }   // table/lookupswitch
// target pc of a (non-switch) branch: goto_w has a 4-byte offset, others 2-byte.
int branch_target(const uint8_t* bc, int pc){
  return (bc[pc]==0xc8) ? pc + s4be(bc, pc+1) : pc + (int16_t)((bc[pc+1]<<8)|bc[pc+2]); }
int is_return(uint8_t op){ return op==0xac||op==0xad||op==0xae||op==0xaf||op==0xb0||op==0xb1; }  // +areturn

} // namespace wasm
#endif // __EMSCRIPTEN__

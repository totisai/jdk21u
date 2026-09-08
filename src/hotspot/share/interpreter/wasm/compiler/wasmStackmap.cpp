/*
 * WasmJit — operand-stack modelling: how many entries a bytecode consumes
 * (op_consumed) and its net operand-stack delta (stack_delta). See wasmCompiler.hpp.
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

// C5.4 static-call intrinsic (Math/Integer/Long): classify (c==nullptr) or emit (c!=nullptr).
// Operand entries a potentially-throwing op pops before it could throw.
int op_consumed(Ctx* x, const uint8_t* bc, int pc){
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

// Operand-stack delta in JVM words.
int stack_delta(Ctx* x, const uint8_t* bc, int pc) {
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

} // namespace wasm
#endif // __EMSCRIPTEN__

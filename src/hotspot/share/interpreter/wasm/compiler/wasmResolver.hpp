/*
 * WasmJit — constant-pool resolution + signature parsing. Reads the resolved
 * CP-cache to describe fields, static/virtual/interface call sites, klasses, and
 * method signatures for the compiler. See interpreter/wasm/wasmJit.hpp.
 */
#ifndef SHARE_INTERPRETER_WASM_COMPILER_WASMRESOLVER_HPP
#define SHARE_INTERPRETER_WASM_COMPILER_WASMRESOLVER_HPP

#include "interpreter/wasm/compiler/wasmContext.hpp"   // Ctx, InvokeDesc

namespace wasm {
  bool     parse_sig(Method* m, uint8_t* argtype, int* argslot, int* nargs_out, int* rettype_out);
  int      sig_to_jit_types(Symbol* sig, int* nparams, int* rettype, int* pwords);
  intptr_t resolve_klass(Ctx* x, const uint8_t* bc, int pc);
  int      resolve_static_field(Ctx* x, const uint8_t* bc, int pc, bool put,
                                intptr_t* klass, int* offset, int* typecode, int* wasmtype);
  // idx_pos: byte offset of the cpCache index after pc (1 for get/putfield; 2 for the
  // fused _fast_*access_0 forms, whose first operand byte is the original aload_0).
  int      resolve_instance_field(Ctx* x, const uint8_t* bc, int pc, bool put,
                                  int* offset, int* typecode, int* wasmtype, int idx_pos = 1);
  int      resolve_invoke(Ctx* x, const uint8_t* bc, int pc, uint8_t op,
                          InvokeDesc** descp, int* nwords, int* rettype, int* argwords);
  // invokedynamic: gate on the call site being resolved (else 2=transient), parse the
  // call-site signature for the dynamic-arg count/return type, bake an IndyDesc.
  int      resolve_indy(Ctx* x, const uint8_t* bc, int pc,
                        IndyDesc** descp, int* nwords, int* rettype, int* argwords);
}

#endif // SHARE_INTERPRETER_WASM_COMPILER_WASMRESOLVER_HPP

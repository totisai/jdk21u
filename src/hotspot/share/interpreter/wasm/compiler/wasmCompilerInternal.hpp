/*
 * WasmJit — compiler-internal interface shared between the compiler translation
 * units (emit / stackmap / analysis). These are not part of the public compiler
 * API (see wasmCompiler.hpp); they exist only so the per-concern .cpp files can
 * call one another without merging back into a single translation unit.
 */
#ifndef SHARE_INTERPRETER_WASM_COMPILER_WASMCOMPILERINTERNAL_HPP
#define SHARE_INTERPRETER_WASM_COMPILER_WASMCOMPILERINTERNAL_HPP

#include "interpreter/wasm/compiler/wasmContext.hpp"     // Ctx
#include "interpreter/wasm/assembler/wasmAssembler.hpp"  // Buf

namespace wasm {

  // Operand-stack modelling (wasmStackmap.cpp).
  int  op_consumed(Ctx* x, const uint8_t* bc, int pc);   // entries a throwing op pops
  int  stack_delta(Ctx* x, const uint8_t* bc, int pc);   // net operand-stack delta, JVM words

  // Per-block operand value-type stack (wasmEmit.cpp).
  void vpush(Ctx* x, int t);
  void vpush_spilled(Ctx* x, int slot);
  int  vpop(Ctx* x);

  // Code emission (wasmEmit.cpp).
  void emit_op(Ctx* x, Buf* c, const uint8_t* bc, int pc);   // translate one bytecode
  void emit_sync_unlock(Ctx* x, Buf* c);                     // synchronized-method unlock
  int  wasm_intrinsic(Ctx* x, Buf* c, const uint8_t* bc, int pc, int* argwords, int* rettype);

} // namespace wasm

#endif // SHARE_INTERPRETER_WASM_COMPILER_WASMCOMPILERINTERNAL_HPP

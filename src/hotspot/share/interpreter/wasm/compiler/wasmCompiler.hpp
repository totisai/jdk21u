/*
 * WasmJit — public interface of the bytecode -> WebAssembly compiler, driven by the
 * core driver (do_compile). The implementation is split by concern across:
 *   wasmEmit.cpp      per-bytecode translation (emit_op) + operand value-type stack
 *   wasmStackmap.cpp  operand-stack modelling (op_consumed, stack_delta)
 *   wasmAnalysis.cpp  local/oop analysis passes + control-flow assembly (below)
 * Cross-unit calls between those go through wasmCompilerInternal.hpp.
 * See interpreter/wasm/wasmJit.hpp.
 */
#ifndef SHARE_INTERPRETER_WASM_COMPILER_WASMCOMPILER_HPP
#define SHARE_INTERPRETER_WASM_COMPILER_WASMCOMPILER_HPP

#include "interpreter/wasm/compiler/wasmContext.hpp"
#include "interpreter/wasm/assembler/wasmAssembler.hpp"   // Buf

namespace wasm {
  bool classify_locals(const uint8_t* bc, int bclen, int maxlocals,
                       const uint8_t* argtype, const int* argslot, int nargs, uint8_t* ltype);
  bool analyze_oop_slots(const uint8_t* bc, int bclen, int maxlocals,
                         const uint8_t* argtype, const int* argslot, int nargs,
                         uint8_t* slot_kind, int* spill_idx, int* n_spill_out);
  int  compile_cf(Ctx* x, const uint8_t* bc, int bclen, Buf* out);
}

#endif // SHARE_INTERPRETER_WASM_COMPILER_WASMCOMPILER_HPP

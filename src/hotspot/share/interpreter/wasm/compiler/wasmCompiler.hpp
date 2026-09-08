/*
 * WasmJit — the bytecode -> WebAssembly compiler core: operand-stack modelling,
 * per-opcode translation (emit_op), basic-block control-flow assembly (compile_cf),
 * and the local/oop analysis passes. Entry points below are driven by the core
 * driver (do_compile). See interpreter/wasm/wasmJit.hpp.
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

/*
 * WasmJit — JVM bytecode decode helpers. Pure functions over a bytecode array,
 * shared by the compiler and assembler layers. See interpreter/wasm/wasmJit.hpp.
 */
#ifndef SHARE_INTERPRETER_WASM_ASSEMBLER_WASMBYTECODES_HPP
#define SHARE_INTERPRETER_WASM_ASSEMBLER_WASMBYTECODES_HPP

#include "utilities/globalDefinitions.hpp"

namespace wasm {
  // JIT value-type tags (JVM operand/local types), shared across all layers.
  enum { TI=0, TJ=1, TF=2, TD=3, TA=4, TV=5 };   // int long float double object void

  int32_t s4be(const uint8_t* bc, int off);
  int     switch_pad(int pc);
  int     instr_len(const uint8_t* bc, int pc);     // 0 => opcode unsupported (method bails)
  bool    is_getfield(uint8_t op);
  bool    is_putfield(uint8_t op);
  bool    is_aload_elem(uint8_t op);
  bool    is_astore_elem(uint8_t op);
  void    array_elem(uint8_t op, int* tc, int* wt);
  int     is_branch(uint8_t op);
  int     is_switch(uint8_t op);
  int     branch_target(const uint8_t* bc, int pc);
  int     is_return(uint8_t op);
}

#endif // SHARE_INTERPRETER_WASM_ASSEMBLER_WASMBYTECODES_HPP

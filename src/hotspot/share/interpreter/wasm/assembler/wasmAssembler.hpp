/*
 * WasmJit — the WebAssembly assembler: a growable byte buffer (Buf), LEB128/opcode
 * encoding primitives, and full module assembly (emit_module). VM-agnostic except
 * that emit_module reads a compile context for the function's locals/spill layout.
 * See interpreter/wasm/wasmJit.hpp.
 */
#ifndef SHARE_INTERPRETER_WASM_ASSEMBLER_WASMASSEMBLER_HPP
#define SHARE_INTERPRETER_WASM_ASSEMBLER_WASMASSEMBLER_HPP

#include "interpreter/wasm/compiler/wasmContext.hpp"   // Ctx (emit_module)

namespace wasm {

  struct Buf { uint8_t* p; int n, cap; };

  uint8_t wasm_valtype(int t);
  int     type_words(int t);
  void    bput(Buf* b, uint8_t x);
  void    bputs(Buf* b, const uint8_t* s, int n);
  void    uleb(Buf* b, uint32_t v);
  void    sleb(Buf* b, int64_t v);
  void    get_local(Buf* c, uint32_t idx);
  void    set_local(Buf* c, uint32_t idx);
  void    tee_local(Buf* c, uint32_t idx);
  void    widen_i64(Buf* c, int t);
  void    narrow_i64(Buf* c, int t);
  void    emit_cond(Buf* c, uint8_t op);
  // Assemble the whole wasm module around the compiled function body.
  int     emit_module(Buf* out, const uint8_t* body, int bodylen, Ctx* x,
                      const uint8_t* argtype, const int* argslot, int nargs, int rettype);

}

#endif // SHARE_INTERPRETER_WASM_ASSEMBLER_WASMASSEMBLER_HPP

/*
 * WasmJit — the WebAssembly assembler: a growable byte buffer (Buf), LEB128
 * primitives, per-instruction emitters over the opcode table (wasmOpcodes.hpp),
 * and full module assembly (emit_module). VM-agnostic except that emit_module
 * reads a compile context for the function's locals/spill layout.
 * See interpreter/wasm/wasmJit.hpp.
 */
#ifndef SHARE_INTERPRETER_WASM_ASSEMBLER_WASMASSEMBLER_HPP
#define SHARE_INTERPRETER_WASM_ASSEMBLER_WASMASSEMBLER_HPP

#include "interpreter/wasm/compiler/wasmContext.hpp"   // Ctx (emit_module)
#include "interpreter/wasm/assembler/wasmOpcodes.hpp"   // WOp

namespace wasm {

  struct Buf { uint8_t* p; int n, cap; };

  uint8_t wasm_valtype(int t);
  int     type_words(int t);

  // Low-level encoding primitives.
  void    bput(Buf* b, uint8_t x);
  void    bputs(Buf* b, const uint8_t* s, int n);
  void    uleb(Buf* b, uint32_t v);
  void    sleb(Buf* b, int64_t v);

  // Instruction emitters (each appends one complete instruction, immediates and
  // all). Prefer these to raw bput sequences so call sites read as wasm ops.
  void    get_local(Buf* c, uint32_t idx);
  void    set_local(Buf* c, uint32_t idx);
  void    tee_local(Buf* c, uint32_t idx);
  void    i32_const(Buf* c, int32_t v);
  void    i64_const(Buf* c, int64_t v);
  void    emit_call(Buf* c, uint32_t func);
  void    mem_op(Buf* c, WOp op, uint32_t align, uint32_t offset);   // load/store
  void    trunc_sat(Buf* c, uint8_t sel);                            // 0xFC sel
  void    if_void(Buf* c);                                           // if []->[]
  void    if_type(Buf* c, uint8_t blocktype);                        // if []->[t]
  void    block_void(Buf* c);                                        // block []->[]
  void    loop_void(Buf* c);                                         // loop []->[]
  void    emit_else(Buf* c);
  void    emit_end(Buf* c);
  void    br(Buf* c, uint32_t depth);
  void    br_if(Buf* c, uint32_t depth);
  void    ret(Buf* c);
  void    drop(Buf* c);
  void    widen_i64(Buf* c, int t);
  void    narrow_i64(Buf* c, int t);
  void    emit_cond(Buf* c, uint8_t op);
  // Assemble the whole wasm module around the compiled function body.
  int     emit_module(Buf* out, const uint8_t* body, int bodylen, Ctx* x,
                      const uint8_t* argtype, const int* argslot, int nargs, int rettype);

}

#endif // SHARE_INTERPRETER_WASM_ASSEMBLER_WASMASSEMBLER_HPP

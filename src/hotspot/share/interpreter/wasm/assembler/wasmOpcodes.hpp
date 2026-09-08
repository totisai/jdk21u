/*
 * WasmJit — WebAssembly instruction opcodes.
 *
 * The single authoritative table mapping every opcode this backend emits to its
 * name from the WebAssembly core specification (Binary Format, section 5.4). Each
 * enumerator's value IS the encoded byte, so `bput(c, WOp::i32_add)` is exactly
 * `bput(c, 0x6a)` — naming only, never a behaviour change.
 *
 * Only opcodes actually emitted by the compiler are listed; extend from the spec
 * when new instructions are used. Multi-byte instructions whose leading byte is a
 * prefix (the 0xFC saturating-conversion family) carry the prefix here and their
 * second byte as an immediate (see wasmAssembler's trunc_sat helper).
 *
 * See interpreter/wasm/assembler/wasmAssembler.hpp.
 */
#ifndef SHARE_INTERPRETER_WASM_ASSEMBLER_WASMOPCODES_HPP
#define SHARE_INTERPRETER_WASM_ASSEMBLER_WASMOPCODES_HPP

namespace wasm {

enum WOp : uint8_t {
  // Control flow.
  op_unreachable   = 0x00,
  op_nop           = 0x01,
  op_block         = 0x02,
  op_loop          = 0x03,
  op_if            = 0x04,
  op_else          = 0x05,
  op_end           = 0x0b,
  op_br            = 0x0c,
  op_br_if         = 0x0d,
  op_return        = 0x0f,
  op_call          = 0x10,

  // Blocktype immediates (not instructions): the result type of a structured
  // block. bt_void is the empty type; the others reuse the value-type encoding.
  bt_void          = 0x40,
  vt_f64           = 0x7c,
  vt_f32           = 0x7d,
  vt_i64           = 0x7e,
  vt_i32           = 0x7f,

  // Parametric.
  op_drop          = 0x1a,
  op_select        = 0x1b,

  // Variable access.
  op_local_get     = 0x20,
  op_local_set     = 0x21,
  op_local_tee     = 0x22,

  // Memory access (each carries {align, offset} immediates).
  op_i32_load      = 0x28,
  op_i64_load      = 0x29,
  op_f32_load      = 0x2a,
  op_f64_load      = 0x2b,
  op_i32_load8_s   = 0x2c,
  op_i32_load8_u   = 0x2d,
  op_i32_load16_s  = 0x2e,
  op_i32_load16_u  = 0x2f,
  op_i32_store     = 0x36,
  op_i64_store     = 0x37,
  op_f32_store     = 0x38,
  op_f64_store     = 0x39,
  op_i32_store8    = 0x3a,
  op_i32_store16   = 0x3b,

  // Numeric constants. i32/i64 carry a LEB immediate; f32/f64 carry the raw
  // 4-/8-byte little-endian value.
  op_i32_const     = 0x41,
  op_i64_const     = 0x42,
  op_f32_const     = 0x43,
  op_f64_const     = 0x44,

  // i32 comparison.
  op_i32_eqz       = 0x45,
  op_i32_eq        = 0x46,
  op_i32_ne        = 0x47,
  op_i32_lt_s      = 0x48,
  op_i32_gt_s      = 0x4a,
  op_i32_le_s      = 0x4c,
  op_i32_ge_s      = 0x4e,

  // i64 comparison.
  op_i64_eqz       = 0x50,
  op_i64_eq        = 0x51,
  op_i64_lt_s      = 0x53,
  op_i64_gt_s      = 0x55,

  // f32 / f64 comparison.
  op_f32_ne        = 0x5c,
  op_f32_lt        = 0x5d,
  op_f32_gt        = 0x5e,
  op_f64_ne        = 0x62,
  op_f64_lt        = 0x63,
  op_f64_gt        = 0x64,

  // i32 arithmetic / bitwise.
  op_i32_add       = 0x6a,
  op_i32_sub       = 0x6b,
  op_i32_mul       = 0x6c,
  op_i32_and       = 0x71,
  op_i32_or        = 0x72,
  op_i32_xor       = 0x73,
  op_i32_shl       = 0x74,
  op_i32_shr_s     = 0x75,
  op_i32_shr_u     = 0x76,

  // i64 arithmetic / bitwise.
  op_i64_add       = 0x7c,
  op_i64_sub       = 0x7d,
  op_i64_mul       = 0x7e,
  op_i64_and       = 0x83,
  op_i64_or        = 0x84,
  op_i64_xor       = 0x85,
  op_i64_shl       = 0x86,
  op_i64_shr_s     = 0x87,
  op_i64_shr_u     = 0x88,

  // f32 / f64 arithmetic.
  op_f32_abs       = 0x8b,
  op_f32_neg       = 0x8c,
  op_f64_abs       = 0x99,
  op_f32_add       = 0x92,
  op_f32_sub       = 0x93,
  op_f32_mul       = 0x94,
  op_f32_div       = 0x95,
  op_f64_neg       = 0x9a,
  op_f64_add       = 0xa0,
  op_f64_sub       = 0xa1,
  op_f64_mul       = 0xa2,
  op_f64_div       = 0xa3,

  // Conversions.
  op_i32_wrap_i64        = 0xa7,
  op_i64_extend_i32_s    = 0xac,
  op_i64_extend_i32_u    = 0xad,
  op_f32_convert_i32_s   = 0xb2,
  op_f32_convert_i64_s   = 0xb4,
  op_f32_demote_f64      = 0xb6,
  op_f64_convert_i32_s   = 0xb7,
  op_f64_convert_i64_s   = 0xb9,
  op_f64_promote_f32     = 0xbb,
  op_i32_reinterpret_f32 = 0xbc,
  op_i64_reinterpret_f64 = 0xbd,
  op_f32_reinterpret_i32 = 0xbe,
  op_f64_reinterpret_i64 = 0xbf,

  // Saturating truncation: the prefix 0xFC followed by a selector immediate.
  op_trunc_sat_prefix    = 0xfc,
  ts_i32_trunc_f32_s     = 0x00,   // f2i
  ts_i32_trunc_f64_s     = 0x02,   // d2i
  ts_i64_trunc_f32_s     = 0x04,   // f2l
  ts_i64_trunc_f64_s     = 0x06,   // d2l
};

} // namespace wasm

#endif // SHARE_INTERPRETER_WASM_ASSEMBLER_WASMOPCODES_HPP

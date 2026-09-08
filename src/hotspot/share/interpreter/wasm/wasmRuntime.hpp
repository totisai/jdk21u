/*
 * WasmJit — the JIT -> VM runtime ABI. These extern "C" helpers are imported by
 * every JIT'd wasm module (field/array/alloc/typecheck/monitor/exception/invoke
 * callbacks); wasm_jit_install instantiates a module and installs its function into
 * the per-thread indirect table. See interpreter/wasm/wasmJit.hpp for the map of the
 * two ABIs. Only wasm_jit_install is called from C++ (by the core driver).
 */
#ifndef SHARE_INTERPRETER_WASM_WASMRUNTIME_HPP
#define SHARE_INTERPRETER_WASM_WASMRUNTIME_HPP

extern "C" int wasm_jit_install(int ptr, int len, int nargs);  // instantiate + addFunction (EM_JS)

#endif // SHARE_INTERPRETER_WASM_WASMRUNTIME_HPP

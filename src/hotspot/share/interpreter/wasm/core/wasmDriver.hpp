/*
 * WasmJit — driver primitives shared across layers: per-thread module installation
 * and hot-method compilation. Defined in core (interpreter/wasm/wasmJit.cpp); called
 * by the compiler/resolver (force-compile an invokestatic callee) and the runtime
 * (dispatch into a per-thread-installed function). See interpreter/wasm/wasmJit.hpp.
 *
 * Declared at global scope (not namespace wasm) so both namespaced and extern "C"
 * callers reach them with the same unqualified name.
 */
#ifndef SHARE_INTERPRETER_WASM_CORE_WASMDRIVER_HPP
#define SHARE_INTERPRETER_WASM_CORE_WASMDRIVER_HPP

#include "utilities/globalDefinitions.hpp"

class Method;

int      wasmjit_force_compile(Method* m);           // 1 if wasm bytes are ready, else 0
int      wasmjit_thread_index(Method* m);            // this thread's table index for m (installs on demand)
uint64_t wasmjit_call(intptr_t fn, int n, uint64_t* a);

#endif // SHARE_INTERPRETER_WASM_CORE_WASMDRIVER_HPP

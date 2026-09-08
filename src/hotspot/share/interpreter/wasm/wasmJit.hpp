/*
 * WasmJit — a baseline JIT for the HotSpot Zero interpreter that compiles Java
 * bytecode to a fresh WebAssembly module at run time (Emscripten target) and calls
 * it instead of interpreting. This header is the ENTIRE public interface HotSpot
 * uses; the implementation is layered under interpreter/wasm/ (see wasmJit.cpp for
 * how the layers fit together):
 *
 *   core/       wasmJit.cpp     the driver: per-Method cache, eligibility, do_compile,
 *                               per-thread install; implements the class below.
 *               wasmDriver.hpp  driver primitives shared with other layers.
 *               wasmImports.hpp the single import-descriptor table (VM helpers a JIT'd
 *                               module imports) — drives the compiler + assembler.
 *   compiler/   wasmCompiler    bytecode -> wasm translation (emit_op, compile_cf, …)
 *               wasmResolver    constant-pool resolution + signature parsing
 *               wasmContext.hpp the per-method compile context (Ctx) + call descriptor
 *   assembler/  wasmAssembler   wasm byte/LEB/opcode encoding + module assembly
 *               wasmBytecodes   JVM bytecode decode helpers + value-type tags
 *   wasmRuntime (root)          the JIT->VM ABI: the extern "C" helpers a JIT'd module
 *                               calls back into, plus wasm_jit_install (EM_JS).
 *
 * Two ABIs: interpreter->JIT is the three methods below (called from
 * zero/bytecodeInterpreter.cpp); JIT->VM is wasmRuntime. GC visibility of oops in
 * JIT'd frames is handled via a per-thread shadow stack (JavaThread::_wasmjit_oops).
 *
 * Scope: static + instance methods over all primitive types, the object model
 * (fields, arrays, new, checkcast/instanceof), virtual/interface calls, exceptions
 * with in-method try/catch, and synchronization. Ineligible methods fall back to the
 * interpreter (mixed-mode is always correct). Gate: methods named "jit*", or all
 * eligible methods under -Dwasmjit or WASMJIT_ALL=1. See docs/jit.md.
 */
#ifndef SHARE_INTERPRETER_WASM_WASMJIT_HPP
#define SHARE_INTERPRETER_WASM_WASMJIT_HPP

#include "memory/allStatic.hpp"
#include "utilities/globalDefinitions.hpp"

class Method;

class WasmJit : AllStatic {
 public:
  // Returns a callable wasm function-pointer index for m (usable as a C function
  // pointer), or 0 if m is not JIT-eligible / compilation failed. Cached per Method.
  // JIT'd functions use the i64-widened ABI: type (i64 x nargs) -> i64.
  static intptr_t compiled_entry(Method* m);

  // If m is JIT'd, fills argtypes_out[nargs] and *rettype_out with value-type
  // tags (0=int,1=long,2=float,3=double) and returns nargs; else returns -1.
  static int describe(Method* m, unsigned char* argtypes_out, unsigned char* rettype_out);

  // Invoke a JIT'd function fn with nargs i64-widened args; returns the i64 result.
  static uint64_t invoke(intptr_t fn, int nargs, uint64_t* args);

  // OSR: on a taken back-edge to `bci`, returns that bci's JIT block index (>=0) if the
  // method is compiled and OSR-eligible; else -1 (also counts hotness + triggers compile).
  static int osr_ready(Method* m, int bci);
};

#endif // SHARE_INTERPRETER_WASM_WASMJIT_HPP

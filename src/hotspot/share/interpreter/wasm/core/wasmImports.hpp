/*
 * WasmJit — the import-descriptor table: the single source of truth for the VM
 * helpers a JIT'd module imports. One table drives all three sites that must agree:
 *   1. the compiler (emit_op) — `call <Imp::X>` uses the enum index;
 *   2. the assembler (emit_module) — emits the import section by iterating this table,
 *      so the declaration order == the function index the compiler calls;
 *   3. the runtime (wasm_jit_install EM_JS) — provides each helper by its `name`.
 * Add an import in ONE place here; the compiler index, module bytes, and function
 * index stay in sync automatically. See interpreter/wasm/wasmJit.hpp.
 */
#ifndef SHARE_INTERPRETER_WASM_CORE_WASMIMPORTS_HPP
#define SHARE_INTERPRETER_WASM_CORE_WASMIMPORTS_HPP

#include "utilities/globalDefinitions.hpp"

namespace wasm {

  // Function-import indices (also the order in the module's import section). The
  // compiler emits `call Imp::<name>`; keep this in lock-step with kImports below.
  enum Imp {
    POLL = 0, INVOKE_STATIC, GETSTATIC, PUTSTATIC, GETFIELD, THROW_NPE, PUTFIELD,
    ARRAYLENGTH, ALOAD, ASTORE, THROW_AIOOBE, INSTANCEOF, CHECKCAST, AASTORE,
    OOP_ENTER, OOP_LEAVE, NEWARRAY, ANEWARRAY, THROW_NASE, INVOKE, PENDING, NEW,
    HANDLER_BCI, TAKE_EXCEPTION, ATHROW, THROW_ARITH, MULTIANEWARRAY,
    MONITORENTER, MONITOREXIT, LDC_OOP, INVOKEDYNAMIC, OSR_BB, FREM, DREM,
    SMONENTER, SMONEXIT,
    IMPORT_COUNT
  };

  // Per-import: the one-char import name (module "e") and the wasm type index in the
  // module's type section. Indexed by Imp; order == the emitted import order.
  struct ImportDesc { char name; uint8_t type; };
  static const ImportDesc kImports[] = {
    /* POLL           */ { 'p', 0 },   // ()->()
    /* INVOKE_STATIC  */ { 'i', 2 },
    /* GETSTATIC      */ { 'g', 3 },
    /* PUTSTATIC      */ { 's', 4 },
    /* GETFIELD       */ { 'F', 3 },
    /* THROW_NPE      */ { 'N', 0 },
    /* PUTFIELD       */ { 'U', 4 },
    /* ARRAYLENGTH    */ { 'l', 5 },
    /* ALOAD          */ { 'a', 3 },
    /* ASTORE         */ { 'r', 4 },
    /* THROW_AIOOBE   */ { 'b', 6 },
    /* INSTANCEOF     */ { 'o', 7 },
    /* CHECKCAST      */ { 'c', 7 },
    /* AASTORE        */ { 'A', 8 },
    /* OOP_ENTER      */ { 'E', 5 },
    /* OOP_LEAVE      */ { 'L', 6 },
    /* NEWARRAY       */ { 'w', 7 },
    /* ANEWARRAY      */ { 'W', 7 },
    /* THROW_NASE     */ { 'z', 0 },
    /* INVOKE         */ { 'v', 2 },
    /* PENDING        */ { 'x', 9 },
    /* NEW            */ { 'n', 5 },
    /* HANDLER_BCI    */ { 'H', 7 },
    /* TAKE_EXCEPTION */ { 'T', 9 },
    /* ATHROW         */ { 'R', 6 },
    /* THROW_ARITH    */ { 'D', 0 },
    /* MULTIANEWARRAY */ { 'y', 13 },   // (klassptr,ndims,d0..d3)->oop
    /* MONITORENTER   */ { 'Y', 5 },
    /* MONITOREXIT    */ { 'Z', 5 },
    /* LDC_OOP        */ { 'C', 7 },   // (cp,index)->oop: resolve String/Class literal
    /* INVOKEDYNAMIC  */ { 'k', 2 },   // (IndyDesc*,a0..a7,nargs)->i64
    /* OSR_BB         */ { 'q', 9 },   // ()->i32: read+clear the pending OSR entry block
    /* FREM           */ { 'e', 11 },  // (f32,f32)->f32: Java float remainder (fmodf)
    /* DREM           */ { 'd', 12 },  // (f64,f64)->f64: Java double remainder (fmod)
    /* SMONENTER      */ { 'G', 5 },   // (klassptr)->i32: lock the Class mirror (static sync)
                                       // NOTE: field 'm' is the memory import -- never reuse it
    /* SMONEXIT       */ { 'M', 6 },   // (klassptr)->(): unlock the Class mirror
  };
  STATIC_ASSERT(sizeof(kImports) / sizeof(kImports[0]) == IMPORT_COUNT);

}

#endif // SHARE_INTERPRETER_WASM_CORE_WASMIMPORTS_HPP

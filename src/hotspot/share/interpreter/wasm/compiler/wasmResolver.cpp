/*
 * WasmJit — constant-pool resolution + signature parsing (implementation).
 * See interpreter/wasm/compiler/wasmResolver.hpp.
 */
#include "precompiled.hpp"
#ifdef __EMSCRIPTEN__
#include "interpreter/wasm/compiler/wasmResolver.hpp"
#include "interpreter/wasm/assembler/wasmAssembler.hpp"   // type_words
#include "interpreter/wasm/core/wasmDriver.hpp"        // wasmjit_force_compile (invokestatic pre-compile)
#include "classfile/vmSymbols.hpp"
#include "oops/klass.inline.hpp"
#include "oops/cpCache.inline.hpp"
#include "oops/resolvedIndyEntry.hpp"
#include "runtime/signature.hpp"
#include "utilities/bytes.hpp"

namespace wasm {

// Resolve a getstatic/putstatic (put=true) at pc to a primitive static field.
// Returns 0 and fills klass/offset/typecode/wasmtype; 2 if not resolved yet
// (transient); 1 if volatile or an object field (permanent bail).
int resolve_static_field(Ctx* x, const uint8_t* bc, int pc, bool put,
                                intptr_t* klass, int* offset, int* typecode, int* wasmtype) {
  ConstantPoolCache* cpc = x->method->constants()->cache();
  if (cpc == nullptr) return 1;
  int index = Bytes::get_native_u2((address)(bc+pc+1));
  ConstantPoolCacheEntry* e = cpc->entry_at(index);
  Bytecodes::Code code = put ? Bytecodes::_putstatic : Bytecodes::_getstatic;
  if (!e->is_resolved(code)) return 2;
  if (e->is_volatile()) return 1;                 // keep it simple: no volatile
  Klass* k = e->f1_as_klass();
  if (k == nullptr) return 1;
  int tc, wt;
  switch (e->flag_state()) {
    case btos: tc=4; wt=TI; break;  case ztos: tc=7; wt=TI; break;
    case ctos: tc=5; wt=TI; break;  case stos: tc=6; wt=TI; break;
    case itos: tc=0; wt=TI; break;  case ltos: tc=1; wt=TJ; break;
    case ftos: tc=2; wt=TF; break;  case dtos: tc=3; wt=TD; break;
    default: return 1;                             // atos (object) etc. -> bail
  }
  *klass = (intptr_t)k; *offset = e->f2_as_index(); *typecode = tc; *wasmtype = wt;
  return 0;
}

// Resolve a get/putfield (put=true) at pc to a primitive instance field.
// Returns 0 + offset/typecode/wasmtype; 2 if unresolved (transient); 1 if
// volatile or object field.
int resolve_instance_field(Ctx* x, const uint8_t* bc, int pc, bool put,
                                  int* offset, int* typecode, int* wasmtype, int idx_pos) {
  ConstantPoolCache* cpc = x->method->constants()->cache();
  if (cpc == nullptr) return 1;
  int index = Bytes::get_native_u2((address)(bc+pc+idx_pos));
  ConstantPoolCacheEntry* e = cpc->entry_at(index);
  // Resolved iff this side's bytecode slot is set (to _getfield/_putfield OR a
  // rewritten _fast_* form). is_resolved(code) only matches the exact code, which
  // fails once the interpreter rewrites the entry to a fast form -> use != 0.
  if ((put ? e->bytecode_2() : e->bytecode_1()) == (Bytecodes::Code)0) return 2;
  if (e->is_volatile()) return 1;
  int tc, wt;
  switch (e->flag_state()) {
    case btos: tc=4; wt=TI; break;  case ztos: tc=7; wt=TI; break;
    case ctos: tc=5; wt=TI; break;  case stos: tc=6; wt=TI; break;
    case itos: tc=0; wt=TI; break;  case ltos: tc=1; wt=TJ; break;
    case ftos: tc=2; wt=TF; break;  case dtos: tc=3; wt=TD; break;
    case atos: tc=8; wt=TA; break;                 // object field (C2)
    default: return 1;
  }
  *offset = e->f2_as_index(); *typecode = tc; *wasmtype = wt;
  return 0;
}

// Resolve the target Klass* of an instanceof/checkcast (raw CP index, big-endian).
// Returns 0 if the class isn't resolved yet (transient bail).
intptr_t resolve_klass(Ctx* x, const uint8_t* bc, int pc) {
  int index = (bc[pc+1]<<8) | bc[pc+2];
  ConstantPool* cp = x->cp;
  if (!cp->tag_at(index).is_klass()) return 0;   // unresolved -> transient
  return (intptr_t) cp->resolved_klass_at(index);
}

// Resolve an invoke at pc. Fills *descp (baked InvokeDesc*), *nwords (receiver +
// param JIT-stack-values), *rettype (JIT type). Returns 0 ok / 2 transient / 1 bail.
// Handles virtual, special, interface, vfinal-fast, and static dispatch.
int sig_to_jit_types(Symbol* sig, int* nparams, int* rettype, int* pwords);
int resolve_invoke(Ctx* x, const uint8_t* bc, int pc, uint8_t op,
                          InvokeDesc** descp, int* nwords, int* rettype, int* argwords) {
  ConstantPoolCache* cpc = x->method->constants()->cache();
  if (cpc == nullptr) return 1;
  int index = Bytes::get_native_u2((address)(bc+pc+1));
  ConstantPoolCacheEntry* e = cpc->entry_at(index);
  ConstantPool* cp = x->method->constants();
  Method* target = nullptr; int kind = 0, vindex = 0;
  Bytecodes::Code code;
  if (op == 0xb7) {                                     // invokespecial (direct)
    code = Bytecodes::_invokespecial;
    if (!e->is_resolved(code)) return 2;
    target = e->f1_as_method(); kind = 0;
  } else if (op == 0xb6 || op == Bytecodes::_fast_invokevfinal) {   // invokevirtual / vfinal fast form
    code = Bytecodes::_invokevirtual;                  // both resolve under _invokevirtual
    if (!e->is_resolved(code)) return 2;
    if (e->is_vfinal()) { target = e->f2_as_vfinal_method(); kind = 0; }
    else { vindex = e->f2_as_index(); kind = 1; }      // non-final: vtable dispatch
  } else if (op == 0xb9) {                              // invokeinterface
    code = Bytecodes::_invokeinterface;
    if (!e->is_resolved(code)) return 2;
    kind = 2;                                           // itable dispatch (runtime)
  } else if (op == 0xb8) {                              // invokestatic (general path: object args)
    code = Bytecodes::_invokestatic;
    if (!e->is_resolved(code)) return 2;
    target = e->f1_as_method(); kind = 3;               // no receiver, direct static call
  } else {
    return 1;                                           // invokedynamic -> later
  }
  if ((kind == 0 || kind == 3) && (target == nullptr || target->is_native() || target->is_abstract())) return 1;
  Symbol* sig = cp->signature_ref_at(index, code);      // works for all kinds (no concrete target)
  int np, rt, pw;
  if (!sig_to_jit_types(sig, &np, &rt, &pw)) return 1;
  int recv = (kind == 3) ? 0 : 1;                       // invokestatic has no receiver
  if (recv + np > 8) return 1;                          // receiver + params must fit a0..a7
  InvokeDesc* d = (InvokeDesc*) malloc(sizeof(InvokeDesc));
  d->kind = kind; d->direct = target; d->sig = sig; d->vindex = vindex; d->entry = e;
  *descp = d; *nwords = recv + np; *rettype = rt; *argwords = recv + pw;
  return 0;
}

int resolve_indy(Ctx* x, const uint8_t* bc, int pc, IndyDesc** descp, int* nwords, int* rettype, int* argwords) {
  ConstantPool* cp = x->method->constants();
  if (cp->cache() == nullptr) return 1;
  int which = (int) Bytes::get_native_u4((address)(bc+pc+1));   // encoded (negative) index
  if (!ConstantPool::is_invokedynamic_index(which)) return 1;
  ResolvedIndyEntry* e = cp->resolved_indy_entry_at(ConstantPool::decode_invokedynamic_index(which));
  if (!e->is_resolved()) return 2;                     // bootstrap not run yet -> retry after interp
  Method* invoker = e->method();
  // The adapter is called with [dynamic args, appendix] and no separate receiver, so it
  // must be static (LambdaForm invokers / MethodHandle linkers are). Bail otherwise.
  if (invoker == nullptr || invoker->is_abstract() || !invoker->is_static()) return 1;
  Symbol* sig = cp->signature_ref_at(which, Bytecodes::_invokedynamic);   // call-site (args)ret
  int np, rt, pw;
  if (!sig_to_jit_types(sig, &np, &rt, &pw)) return 1;
  if (np > 8) return 1;                                // dynamic args must fit a0..a7
  IndyDesc* d = (IndyDesc*) malloc(sizeof(IndyDesc));
  d->cp = cp; d->which = which;
  *descp = d; *nwords = np; *rettype = rt; *argwords = pw;
  return 0;
}
// Count params (one JIT stack value each), their JVM words, + the return type.
int sig_to_jit_types(Symbol* sig, int* nparams, int* rettype, int* pwords) {
  const char* s = (const char*)sig->bytes(); int len = sig->utf8_length();
  if (len < 2 || s[0] != '(') return 0;
  int i = 1, n = 0, words = 0;
  while (i < len && s[i] != ')') {
    switch (s[i]) {
      case 'J': case 'D': words++; /*fallthrough*/
      case 'I': case 'Z': case 'B': case 'C': case 'S': case 'F': i++; break;
      case 'L': while (i<len && s[i]!=';') i++; i++; break;
      case '[': while (i<len && s[i]=='[') i++;
                if (i<len && s[i]=='L') { while (i<len && s[i]!=';') i++; } i++; break;
      default: return 0;
    }
    n++; words++;
  }
  if (i >= len || s[i] != ')') return 0;
  i++;
  int rt;
  switch (s[i]) {
    case 'I': case 'Z': case 'B': case 'C': case 'S': rt=TI; break;
    case 'J': rt=TJ; break; case 'F': rt=TF; break; case 'D': rt=TD; break;
    case 'V': rt=TV; break;
    case 'L': case '[': rt=TA; break;
    default: return 0;
  }
  *nparams = n; *rettype = rt; *pwords = words;
  return 1;
}

bool parse_sig(Method* m, uint8_t* argtype /*[16]*/, int* argslot /*[16]*/,
                      int* nargs_out, int* rettype_out) {
  Symbol* sig = m->signature();
  const char* s = (const char*)sig->bytes();
  int len = sig->utf8_length();
  if (len < 3 || s[0] != '(') return false;
  int i = 1, n = 0, slot = 0;
  // Instance methods: local slot 0 is the implicit `this` receiver (an object).
  // Model it as a leading object arg -- the JIT re-reads it from the GC-scanned
  // frame slot on each aload_0 (C1), so it's GC-safe with no oop-map.
  if (!m->is_static()) { argtype[0]=TA; argslot[0]=0; n=1; slot=1; }
  while (i < len && s[i] != ')') {
    int t;
    switch (s[i]) {
      case 'I': case 'Z': case 'B': case 'C': case 'S': t=TI; i++; break;
      case 'J': t=TJ; i++; break; case 'F': t=TF; i++; break; case 'D': t=TD; i++; break;
      case 'L': t=TA; while (i<len && s[i]!=';') i++; i++; break;   // object -> TA
      case '[': t=TA; while (i<len && s[i]=='[') i++;               // array -> TA
                if (i<len && s[i]=='L') { while (i<len && s[i]!=';') i++; } i++; break;
      default: return false;
    }
    if (n >= 16) return false;
    argtype[n]=t; argslot[n]=slot; slot += type_words(t); n++;
  }
  if (i >= len || s[i] != ')') return false;
  i++;
  int rt;
  switch (s[i]) {
    case 'I': case 'Z': case 'B': case 'C': case 'S': rt=TI; break;
    case 'J': rt=TJ; break; case 'F': rt=TF; break; case 'D': rt=TD; break;
    case 'V': rt=TV; break;    // void return supported (dummy i64 result)
    case 'L': case '[': rt=TA; break;   // object/array return -> oop addr (areturn)
    default: return false;
  }
  *nargs_out = n; *rettype_out = rt;
  return true;
}

} // namespace wasm
#endif // __EMSCRIPTEN__

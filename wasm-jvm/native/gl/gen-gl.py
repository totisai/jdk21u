#!/usr/bin/env python3
"""
Generate the LWJGL 2 native GL dispatch layer for the wasm JVM.

LWJGL 2's org.lwjgl.opengl.GL* classes are generated from templates; each GL
entry point becomes a native `nglXxx(args..., long functionPointer)` whose C
implementation (normally in liblwjgl.so) simply calls through the pointer. We
don't ship LWJGL's natives, so we synthesize them: for every ngl* native in the
requested GL classes we emit a JNI wrapper that casts the trailing `long` to the
GL function type and calls it. The pointer itself comes from our wgl_getproc()
(GLContext.ngetFunctionAddress) — real GLES2 entry points where they exist, our
fixed-function emulation (wgl.c) where GLES2 lacks them.

This is framework-general: point it at any GL* class list and it covers them.

Usage: gen-gl.py <lwjgl.jar> <out.c> <Class> [<Class> ...]
       (Class = simple name under org.lwjgl.opengl, e.g. GL11 GL12 GL13)
"""
import re, subprocess, sys

# Java primitive -> (C param type as received by JNI, C type in the fn-pointer
# prototype, expression to convert the received arg for the through-call).
# 'long' is special-cased (pointer vs function-pointer).
PRIM = {
    'void':    ('void',     'void',          None),
    'int':     ('jint',     'int',           '(int){a}'),
    'float':   ('jfloat',   'float',         '(float){a}'),
    'double':  ('jdouble',  'double',        '(double){a}'),
    'boolean': ('jboolean', 'unsigned char', '(unsigned char){a}'),
    'short':   ('jshort',   'short',         '(short){a}'),
    'byte':    ('jbyte',    'signed char',   '(signed char){a}'),
    'char':    ('jchar',    'unsigned short','(unsigned short){a}'),
}

NAT_RE = re.compile(r'static\s+native\s+(\S+)\s+(n\w+)\s*\((.*?)\)\s*;')

def jni_mangle(name):
    return name.replace('_', '_1')

def desc_frag(jtype):
    # JNI overload descriptor fragment for a parameter type
    return {'int':'I','float':'F','double':'D','boolean':'Z','long':'J',
            'short':'S','byte':'B','char':'C'}[jtype]

def gen_class(jar, simple):
    fqcn = 'org.lwjgl.opengl.' + simple
    out = subprocess.run(['javap','-p','-classpath',jar,fqcn],
                         capture_output=True, text=True)
    methods = []
    for m in NAT_RE.finditer(out.stdout):
        ret, name, args = m.group(1), m.group(2), m.group(3).strip()
        arglist = [a.strip() for a in args.split(',')] if args else []
        methods.append((ret, name, arglist))
    # detect overloaded simple names -> need JNI signature mangling
    from collections import Counter
    counts = Counter(n for _, n, _ in methods)
    lines = []
    skipped = []
    sym_prefix = 'Java_org_lwjgl_opengl_' + jni_mangle(simple) + '_'
    known = set(PRIM) | {'long'}
    stubs = {}   # glname -> (retproto, tuple(proto_types))  for typed no-op fallbacks
    for ret, name, arglist in methods:
        # trailing long is the function pointer
        assert arglist and arglist[-1] == 'long', f'{name}: expected trailing long, got {arglist}'
        # skip entry points touching non-primitive types (e.g. ByteBuffer map
        # variants) — not in GLES2 and not used by the target apps
        if ret not in known or any(t not in known for t in arglist):
            skipped.append(name)
            # still give it a non-null address: LWJGL's capability init only checks
            # the pointer is present, and we don't route calls through it (no ngl
            # wrapper). A trivial void() stub suffices — it's never called.
            glname = name[1:] if name.startswith('n') else name
            stubs.setdefault(glname, ('void', ()))
            continue
        params = arglist[:-1]
        # build JNI param decls, through-call proto types, and call args
        jni_decl = ['JNIEnv* env', 'jclass cls']
        proto_types = []
        call_args = []
        for i, t in enumerate(params):
            a = f'a{i}'
            if t == 'long':                 # a buffer / pointer address
                jni_decl.append(f'jlong {a}')
                proto_types.append('void*')
                call_args.append(f'(void*)(intptr_t){a}')
            else:
                cj, cp, conv = PRIM[t]
                jni_decl.append(f'{cj} {a}')
                proto_types.append(cp)
                call_args.append(conv.format(a=a))
        jni_decl.append('jlong fp')
        # return handling
        if ret == 'void':
            cret, retproto, pre, post = 'void', 'void', '', ''
        elif ret == 'long':
            cret, retproto, pre, post = 'jlong', 'intptr_t', 'return (jlong)', ''
        else:
            cj, cp, _ = PRIM[ret]
            cret, retproto, pre, post = cj, cp, f'return ({cj})', ''
        proto = f'{retproto} (*)({", ".join(proto_types) if proto_types else "void"})'
        sym = sym_prefix + jni_mangle(name)
        if counts[name] > 1:                # overloaded -> append descriptor
            desc = ''.join(desc_frag(t) for t in arglist)  # includes trailing J
            sym += '__' + desc.replace('_', '_1')
        body = f'{pre}(({proto})(intptr_t)fp)({", ".join(call_args)});'
        lines.append(f'JNIEXPORT {cret} JNICALL {sym}('
                     + ', '.join(jni_decl) + ') { ' + body + ' }')
        # record a typed no-op stub keyed by the GL entry-point name (ngl* -> gl*)
        glname = name[1:] if name.startswith('n') else name
        stubs.setdefault(glname, (retproto, tuple(proto_types)))
    if skipped:
        sys.stderr.write(f'  {simple}: skipped {len(skipped)} non-primitive '
                         f'entry points ({", ".join(skipped[:6])}...)\n')
    return lines, len(methods) - len(skipped), stubs

def main():
    jar, outc = sys.argv[1], sys.argv[2]
    classes = sys.argv[3:]
    all_lines, total = [], 0
    all_stubs = {}
    for c in classes:
        lines, n, stubs = gen_class(jar, c)
        all_lines.append(f'/* ---- {c}: {n} entry points ---- */')
        all_lines.extend(lines)
        total += n
        for k, v in stubs.items(): all_stubs.setdefault(k, v)

    # Typed no-op stubs for every GL entry point, so LWJGL's ContextCapabilities
    # finds a non-null (correctly-typed) address for each required GL11 function
    # even where our translator doesn't yet emulate it. Rendering-critical ones are
    # overridden by wgl.c's emu_* (higher priority in wgl_getproc); the rest are
    # harmless no-ops. Signatures match the through-call prototypes exactly, so the
    # generated ngl* wrappers call them without a wasm signature mismatch.
    stub_lines, tbl = [], []
    for gl, (retp, protos) in sorted(all_stubs.items()):
        params = ', '.join(f'{t} a{i}' for i, t in enumerate(protos)) or 'void'
        ret = '' if retp == 'void' else 'return 0;'
        stub_lines.append(f'static {retp} wgls_{gl}({params}) {{ {ret} }}')
        tbl.append(f'  {{"{gl}", (void*)wgls_{gl}}},')

    with open(outc, 'w') as f:
        f.write('/* GENERATED by gen-gl.py — do not edit. LWJGL 2 GL native dispatch. */\n')
        f.write('#include <jni.h>\n#include <stdint.h>\n#include <string.h>\n\n')
        f.write('\n'.join(all_lines))
        f.write('\n\n/* ---- typed no-op fallback stubs (%d) ---- */\n' % len(all_stubs))
        f.write('\n'.join(stub_lines))
        f.write('\nstatic const struct { const char* n; void* f; } wgl_stub_tbl[] = {\n')
        f.write('\n'.join(tbl))
        f.write('\n};\n')
        f.write('void* wgl_gen_stub(const char* name) {\n')
        f.write('  for (unsigned i = 0; i < sizeof(wgl_stub_tbl)/sizeof(wgl_stub_tbl[0]); i++)\n')
        f.write('    if (!strcmp(name, wgl_stub_tbl[i].n)) return wgl_stub_tbl[i].f;\n')
        f.write('  return 0;\n}\n')
    sys.stderr.write(f'  {len(all_stubs)} typed fallback stubs\n')
    sys.stderr.write(f'gen-gl.py: {total} GL native wrappers -> {outc}\n')

if __name__ == '__main__':
    main()

/*
 * JIT spike: prove we can, at run time from inside a wasm module, build a fresh
 * WebAssembly module (bytes emitted in C), instantiate it, install its function
 * into the indirect table, and call it through a C function pointer.
 *
 * This is the mechanism a bytecode->wasm JIT needs. Here we hand-emit the wasm
 * for `int f(int a,int b){ return a+b; }` and call f(3,4), expecting 7.
 */
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

/* ---- tiny growable byte buffer ---- */
typedef struct { uint8_t* p; int n, cap; } Buf;
static void bput(Buf* b, uint8_t x) {
    if (b->n == b->cap) { b->cap = b->cap ? b->cap*2 : 64; b->p = realloc(b->p, b->cap); }
    b->p[b->n++] = x;
}
static void bputs(Buf* b, const uint8_t* s, int len) { for (int i=0;i<len;i++) bput(b,s[i]); }

/* Emit a complete 1-function module. `code` is the function body (no locals decl,
 * no trailing end). params/results are i32 counts. Export name is "f". */
static int emit_module(Buf* out, const uint8_t* code, int codelen, int nparams, int nresults) {
    /* magic + version */
    const uint8_t hdr[] = {0x00,0x61,0x73,0x6d, 0x01,0x00,0x00,0x00};
    bputs(out, hdr, 8);

    /* Type section (1): one functype (nparams i32) -> (nresults i32) */
    Buf t = {0}; bput(&t, 0x60); bput(&t, nparams); for(int i=0;i<nparams;i++) bput(&t,0x7f);
    bput(&t, nresults); for(int i=0;i<nresults;i++) bput(&t,0x7f);
    bput(out, 0x01); bput(out, t.n+1); bput(out, 0x01); bputs(out, t.p, t.n); free(t.p);

    /* Function section (3): one function, type index 0 */
    bput(out, 0x03); bput(out, 0x02); bput(out, 0x01); bput(out, 0x00);

    /* Export section (7): export "f" as func 0  (contents: 01 01 'f' 00 00 = 5 bytes) */
    bput(out, 0x07); bput(out, 0x05); bput(out, 0x01);
    bput(out, 0x01); bput(out, 'f'); bput(out, 0x00); bput(out, 0x00);

    /* Code section (10): vec of code entries; each = body_size | locals | expr | end.
     * contents = count(1) + body_size(1) + body(N)  -> section size = N+2 */
    Buf body = {0}; bput(&body, 0x00); bputs(&body, code, codelen); bput(&body, 0x0b);
    bput(out, 0x0a); bput(out, body.n+2); bput(out, 0x01); bput(out, body.n);
    bputs(out, body.p, body.n); free(body.p);
    return out->n;
}

/* Instantiate the module bytes and install export "f" into the table; returns a
 * callable function-pointer index (0 on failure). sig: return+params, e.g. "iii". */
EM_JS(int, wasm_install, (int ptr, int len, const char* sig), {
    try {
        var bytes = HEAPU8.slice(ptr, ptr + len);
        var mod = new WebAssembly.Module(bytes);
        var inst = new WebAssembly.Instance(mod, {});
        return addFunction(inst.exports.f, UTF8ToString(sig));
    } catch (e) {
        out('[jit] instantiate failed: ' + e);
        return 0;
    }
});

typedef int (*add_fn)(int, int);

int main(void) {
    /* body: local.get 0 ; local.get 1 ; i32.add */
    uint8_t code[] = {0x20,0x00, 0x20,0x01, 0x6a};
    Buf m = {0};
    int len = emit_module(&m, code, sizeof(code), 2, 1);
    printf("[jit] emitted %d-byte wasm module for add(a,b)\n", len);

    int idx = wasm_install((int)(intptr_t)m.p, len, "iii");
    if (!idx) { printf("[jit] install failed\n"); return 1; }
    printf("[jit] installed at table index %d\n", idx);

    add_fn f = (add_fn)(intptr_t)idx;
    int r = f(3, 4);
    printf("[jit] JIT'd add(3,4) = %d  (expected 7)  -> %s\n", r, r==7 ? "PASS" : "FAIL");
    return r == 7 ? 0 : 1;
}

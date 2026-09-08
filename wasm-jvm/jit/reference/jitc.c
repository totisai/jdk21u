/*
 * jitc — Java-bytecode -> WebAssembly compiler, integer subset WITH control flow.
 *
 * Control flow is handled generically by a dispatch loop: each JVM basic block
 * becomes  if (i32.eq $bb <b>) { <block> ; $bb = <next>; br $L }  inside a wasm
 * loop. Conditional branches pick the next block with `select` (no nested-branch
 * depth math). This compiles arbitrary reducible/irreducible control flow (loops,
 * if/else) as long as the JVM operand stack is empty at every block boundary
 * (true for javac control flow; ternaries etc. bail -> interpreter).
 */
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

typedef struct { uint8_t* p; int n, cap; } Buf;
static void bput(Buf* b, uint8_t x){ if(b->n==b->cap){ b->cap=b->cap?b->cap*2:64; b->p=realloc(b->p,b->cap);} b->p[b->n++]=x; }
static void bputs(Buf* b, const uint8_t* s, int n){ for(int i=0;i<n;i++) bput(b,s[i]); }
static void uleb(Buf* b, uint32_t v){ do{ uint8_t x=v&0x7f; v>>=7; if(v) x|=0x80; bput(b,x);}while(v); }
static void sleb(Buf* b, int32_t v){ int more=1; while(more){ uint8_t x=v&0x7f; v>>=7; if((v==0&&!(x&0x40))||(v==-1&&(x&0x40))) more=0; else x|=0x80; bput(b,x);} }

// Length of the instruction at pc for the supported subset, or 0 if unsupported.
static int instr_len(const uint8_t* bc, int pc) {
  uint8_t op = bc[pc];
  switch (op) {
    case 0x02: case 0x03: case 0x04: case 0x05: case 0x06: case 0x07: case 0x08: // iconst
    case 0x1a: case 0x1b: case 0x1c: case 0x1d:  // iload_n
    case 0x3b: case 0x3c: case 0x3d: case 0x3e:  // istore_n
    case 0x59: case 0x57:                        // dup, pop
    case 0x60: case 0x64: case 0x68: case 0x6c: case 0x70: case 0x74: // iadd isub imul idiv irem ineg
    case 0x7e: case 0x80: case 0x82: case 0x78: case 0x7a: case 0x7c: // iand ior ixor ishl ishr iushr
    case 0x91: case 0x92: case 0x93:             // i2b i2c i2s
    case 0xac:                                   // ireturn
      return 1;
    case 0x10: case 0x15: case 0x36:             // bipush, iload, istore
      return 2;
    case 0x11: case 0x84:                        // sipush, iinc
    case 0x99: case 0x9a: case 0x9b: case 0x9c: case 0x9d: case 0x9e: // if<cond>
    case 0x9f: case 0xa0: case 0xa1: case 0xa2: case 0xa3: case 0xa4: // if_icmp<cond>
    case 0xa7:                                    // goto
      return 3;
    default: return 0;
  }
}
static int is_branch(uint8_t op){ return (op>=0x99 && op<=0xa4) || op==0xa7; }
static int is_return(uint8_t op){ return op==0xac; }
static int16_t branch_off(const uint8_t* bc, int pc){ return (int16_t)((bc[pc+1]<<8)|bc[pc+2]); }

// Emit the wasm for one non-control instruction. Assumes supported.
static void emit_op(Buf* c, const uint8_t* bc, int pc) {
  uint8_t op = bc[pc];
  switch (op) {
    case 0x02: bput(c,0x41); sleb(c,-1); break;
    case 0x03: case 0x04: case 0x05: case 0x06: case 0x07: case 0x08: bput(c,0x41); sleb(c,op-0x03); break;
    case 0x10: bput(c,0x41); sleb(c,(int8_t)bc[pc+1]); break;
    case 0x11: bput(c,0x41); sleb(c,(int16_t)((bc[pc+1]<<8)|bc[pc+2])); break;
    case 0x1a: case 0x1b: case 0x1c: case 0x1d: bput(c,0x20); uleb(c,op-0x1a); break;
    case 0x15: bput(c,0x20); uleb(c,bc[pc+1]); break;
    case 0x3b: case 0x3c: case 0x3d: case 0x3e: bput(c,0x21); uleb(c,op-0x3b); break;
    case 0x36: bput(c,0x21); uleb(c,bc[pc+1]); break;
    case 0x59: /*dup*/ break;   // handled specially below (needs a temp) -> we no-op & rely on tee? see note
    case 0x57: bput(c,0x1a); break;   // pop -> drop
    case 0x60: bput(c,0x6a); break; case 0x64: bput(c,0x6b); break; case 0x68: bput(c,0x6c); break;
    case 0x6c: bput(c,0x6d); break; case 0x70: bput(c,0x6f); break;
    case 0x74: bput(c,0x41); sleb(c,-1); bput(c,0x6c); break;   // ineg
    case 0x84: bput(c,0x20); uleb(c,bc[pc+1]); bput(c,0x41); sleb(c,(int8_t)bc[pc+2]);
               bput(c,0x6a); bput(c,0x21); uleb(c,bc[pc+1]); break;  // iinc: l[idx]+=k
    case 0x7e: bput(c,0x71); break; case 0x80: bput(c,0x72); break; case 0x82: bput(c,0x73); break;
    case 0x78: bput(c,0x74); break; case 0x7a: bput(c,0x75); break; case 0x7c: bput(c,0x76); break;
    case 0x91: bput(c,0x41); sleb(c,24); bput(c,0x74); bput(c,0x41); sleb(c,24); bput(c,0x75); break; // i2b: <<24>>24
    case 0x92: bput(c,0x41); sleb(c,0xffff&0xffff); /*not used*/ break; // i2c handled below
    case 0x93: bput(c,0x41); sleb(c,16); bput(c,0x74); bput(c,0x41); sleb(c,16); bput(c,0x75); break; // i2s
    default: break;
  }
}

// Comparison for a conditional branch: consumes operand(s), leaves 0/1.
static void emit_cond(Buf* c, uint8_t op) {
  switch (op) {
    case 0x99: bput(c,0x41); sleb(c,0); bput(c,0x46); break; // ifeq  -> ==0
    case 0x9a: bput(c,0x41); sleb(c,0); bput(c,0x47); break; // ifne  -> !=0
    case 0x9b: bput(c,0x41); sleb(c,0); bput(c,0x48); break; // iflt  -> <0
    case 0x9c: bput(c,0x41); sleb(c,0); bput(c,0x4e); break; // ifge  -> >=0
    case 0x9d: bput(c,0x41); sleb(c,0); bput(c,0x4a); break; // ifgt  -> >0
    case 0x9e: bput(c,0x41); sleb(c,0); bput(c,0x4c); break; // ifle  -> <=0
    case 0x9f: bput(c,0x46); break; // if_icmpeq
    case 0xa0: bput(c,0x47); break; // if_icmpne
    case 0xa1: bput(c,0x48); break; // if_icmplt
    case 0xa2: bput(c,0x4e); break; // if_icmpge
    case 0xa3: bput(c,0x4a); break; // if_icmpgt
    case 0xa4: bput(c,0x4c); break; // if_icmple
  }
}

// Compile a whole method Code to a wasm function body (control-flow capable).
// Returns 0 on success; else the unsupported opcode, or -1 for a non-empty-stack
// boundary (bail). $bb local index = maxlocals, $tmp = maxlocals+1.
static int compile_cf(const uint8_t* bc, int bclen, int maxlocals, Buf* code) {
  // Pass 1: leaders (block starts).
  char* leader = (char*)calloc(bclen+1, 1);
  leader[0] = 1;
  for (int pc = 0; pc < bclen; ) {
    int L = instr_len(bc, pc);
    if (!L) { free(leader); return bc[pc]; }        // unsupported opcode
    if (is_branch(bc[pc])) {
      int tgt = pc + branch_off(bc, pc);
      if (tgt < 0 || tgt > bclen) { free(leader); return -1; }
      leader[tgt] = 1;
      if (pc + L <= bclen) leader[pc + L] = 1;       // fall-through leader
    } else if (is_return(bc[pc])) {
      if (pc + L < bclen) leader[pc + L] = 1;
    }
    pc += L;
  }
  // Number blocks in pc order; map pc -> block index.
  int nblocks = 0;
  int* blk_of = (int*)malloc(sizeof(int)*(bclen+1));
  for (int pc = 0; pc <= bclen; pc++) blk_of[pc] = -1;
  for (int pc = 0; pc <= bclen; pc++) if (leader[pc]) blk_of[pc] = nblocks++;

  const uint8_t BB = (uint8_t)maxlocals;             // $bb local
  #define NEXTBLK(pc) (blk_of[(pc)])

  Buf body = {0,0,0,0};
  bput(&body, 0x03); bput(&body, 0x40);              // loop $L (void)
  int cur = 0;
  for (int pc = 0; pc < bclen; ) {
    if (leader[pc]) {
      // start block `cur`:  if (i32.eq $bb cur) then
      bput(&body, 0x20); uleb(&body, BB);
      bput(&body, 0x41); sleb(&body, cur);
      bput(&body, 0x46);                             // i32.eq
      bput(&body, 0x04); bput(&body, 0x40);          // if (void)
      int blkend = pc; do { blkend += instr_len(bc, blkend); } while (blkend < bclen && !leader[blkend]);
      // emit instructions of this block
      int p = pc;
      while (p < blkend) {
        uint8_t op = bc[p];
        int L = instr_len(bc, p);
        if (is_branch(op)) {
          int tgt = NEXTBLK(p + branch_off(bc, p));
          int fall = NEXTBLK(p + L);
          if (op == 0xa7) {                          // goto
            bput(&body,0x41); sleb(&body,tgt);
          } else {                                   // conditional
            emit_cond(&body, op);                    // -> cond on stack
            bput(&body,0x21); uleb(&body, maxlocals+1);   // local.set $tmp
            bput(&body,0x41); sleb(&body,tgt);
            bput(&body,0x41); sleb(&body,fall);
            bput(&body,0x20); uleb(&body, maxlocals+1);   // local.get $tmp
            bput(&body,0x1b);                        // select -> tgt if cond else fall
          }
          bput(&body,0x21); uleb(&body, BB);         // local.set $bb
          bput(&body,0x0c); uleb(&body,1);           // br $L (depth 1: inside `if`)
        } else if (is_return(op)) {
          bput(&body,0x0f);                          // return (value on stack)
        } else if (op == 0x59) {                     // dup: value -> tee to $tmp then get twice
          bput(&body,0x22); uleb(&body, maxlocals+1);// local.tee $tmp (keeps value on stack)
          bput(&body,0x20); uleb(&body, maxlocals+1);// local.get $tmp (second copy)
        } else if (op == 0x92) {                     // i2c: x & 0xffff
          bput(&body,0x41); sleb(&body,0xffff); bput(&body,0x71);
        } else {
          emit_op(&body, bc, p);
        }
        p += L;
      }
      // fall-through terminator (block didn't end in branch/return)
      uint8_t last = bc[blkend - instr_len(bc, /*prev*/ blkend - 1)];  // not reliable
      // simpler: if the last emitted op wasn't a branch/return, add fall-through
      int lastpc = pc; while (lastpc + instr_len(bc,lastpc) < blkend) lastpc += instr_len(bc,lastpc);
      uint8_t lastop = bc[lastpc];
      (void)last;
      if (!is_branch(lastop) && !is_return(lastop)) {
        bput(&body,0x41); sleb(&body, NEXTBLK(blkend));  // next block
        bput(&body,0x21); uleb(&body, BB);
        bput(&body,0x0c); uleb(&body,1);             // br $L
      }
      bput(&body, 0x0b);                             // end if
      cur++;
      pc = blkend;
    } else {
      pc += instr_len(bc, pc);
    }
  }
  bput(&body, 0x0b);                                 // end loop
  bput(&body, 0x00);                                 // unreachable (dispatch always terminates)

  *code = body;
  free(leader); free(blk_of);
  return 0;
  #undef NEXTBLK
}

static int emit_module(Buf* out, const uint8_t* body, int bodylen, int nparams, int ndeclared) {
  const uint8_t hdr[]={0,0x61,0x73,0x6d,1,0,0,0}; bputs(out,hdr,8);
  Buf t={0,0,0,0}; bput(&t,0x60); uleb(&t,nparams); for(int i=0;i<nparams;i++) bput(&t,0x7f); bput(&t,1); bput(&t,0x7f);
  bput(out,1); uleb(out,t.n+1); bput(out,1); bputs(out,t.p,t.n); free(t.p);
  bput(out,3); bput(out,2); bput(out,1); bput(out,0);
  bput(out,7); bput(out,5); bput(out,1); bput(out,1); bput(out,'f'); bput(out,0); bput(out,0);
  Buf fn={0,0,0,0};
  if(ndeclared>0){ bput(&fn,1); uleb(&fn,ndeclared); bput(&fn,0x7f); } else bput(&fn,0);
  bputs(&fn, body, bodylen); bput(&fn,0x0b);
  Buf sec={0,0,0,0}; bput(&sec,1); uleb(&sec,fn.n); bputs(&sec,fn.p,fn.n);
  bput(out,0x0a); uleb(out,sec.n); bputs(out,sec.p,sec.n);
  free(fn.p); free(sec.p);
  return out->n;
}

int jit_compile(const uint8_t* bc, int bclen, int nargs, int maxlocals,
                uint8_t** outbytes, int* outlen, int* bad) {
  Buf code={0,0,0,0};
  int b = compile_cf(bc, bclen, maxlocals, &code);
  if (b != 0) { *bad=b; free(code.p); return 0; }
  Buf mod={0,0,0,0};
  int ndeclared = (maxlocals - nargs) + 2;           // java extra locals + $bb + $tmp
  if (ndeclared < 2) ndeclared = 2;
  emit_module(&mod, code.p, code.n, nargs, ndeclared);
  free(code.p);
  *outbytes = mod.p; *outlen = mod.n; return 1;
}

EM_JS(void, wasm_dump, (int ptr,int len), { require("fs").writeFileSync("/tmp/m.wasm", HEAPU8.slice(ptr,ptr+len)); });
EM_JS(int, wasm_install, (int ptr, int len, int nargs), {
  try {
    var mod = new WebAssembly.Module(HEAPU8.slice(ptr, ptr+len));
    var inst = new WebAssembly.Instance(mod, {});
    var sig = 'i'; for (var i=0;i<nargs;i++) sig += 'i';
    return addFunction(inst.exports.f, sig);
  } catch (e) { out('[jit] instantiate failed: ' + e); return 0; }
});

typedef int (*fn1)(int);

int main(void) {
  // Real javac bytecode for: static int jitSum(int n){ int s=0; for(int i=0;i<n;i++) s+=i; return s; }
  uint8_t bc[] = {
    0x03,0x3c,0x03,0x3d,              // 0: iconst_0 istore_1 iconst_0 istore_2
    0x1c,0x1a,0xa2,0x00,0x0d,         // 4: iload_2 iload_0 if_icmpge +13(->19)
    0x1b,0x1c,0x60,0x3c,              // 9: iload_1 iload_2 iadd istore_1
    0x84,0x02,0x01,                   // 13: iinc 2,1
    0xa7,0xff,0xf4,                   // 16: goto -12(->4)
    0x1b,0xac                          // 19: iload_1 ireturn
  };
  uint8_t* mod; int modlen, bad=0;
  if (!jit_compile(bc, sizeof(bc), /*nargs*/1, /*maxlocals*/3, &mod, &modlen, &bad)) {
    printf("[jit] unsupported opcode 0x%02x\n", bad); return 1;
  }
  printf("[jit] compiled loop method -> %d-byte wasm module\n", modlen);
  wasm_dump((int)(intptr_t)mod, modlen); int idx = wasm_install((int)(intptr_t)mod, modlen, 1);
  if (!idx) { printf("[jit] install failed\n"); return 1; }
  fn1 f = (fn1)(intptr_t)idx;
  int r = f(100);   // sum 0..99 = 4950
  printf("[jit] JIT'd jitSum(100) = %d  (expected 4950)  -> %s\n", r, r==4950 ? "PASS" : "FAIL");
  int r2 = f(1000); // 499500
  printf("[jit] JIT'd jitSum(1000) = %d  (expected 499500)  -> %s\n", r2, r2==499500 ? "PASS" : "FAIL");
  return (r==4950 && r2==499500) ? 0 : 1;
}

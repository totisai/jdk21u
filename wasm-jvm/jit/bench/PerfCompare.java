// Cross-runtime perf: the SAME allocation-free integer/long kernel timed on
//   native HotSpot (C2)  vs  our wasm interpreter (Zero)  vs  our wasm JIT.
// jitKernel is jit*-named so the wasm JIT eager-compiles it; kernel is identical but
// plain, so on wasm (no WASMJIT_ALL) it stays interpreted. On native both are C2, so
// one native run gives the native number; one wasm run gives BOTH wasm numbers.
// nanoTime brackets only the loop, so boot/emscripten overhead is excluded.
public class PerfCompare {
  static long jitKernel(long n){ long s = 1;
    for (long i = 1; i <= n; i++) s = (s * 1000003L + i - (i >> 2)) ^ (s >>> 17);
    return s; }
  static long kernel(long n){ long s = 1;
    for (long i = 1; i <= n; i++) s = (s * 1000003L + i - (i >> 2)) ^ (s >>> 17);
    return s; }

  // Call-heavy variant: one static call per iteration. Native C2 INLINES step into the
  // loop; our wasm JIT uses the fast direct wasm->wasm invokestatic path but does NOT
  // inline -> this exposes per-call overhead + the missing-inlining gap.
  static long jitStep(long s, long i){ return (s * 1000003L + i - (i >> 2)) ^ (s >>> 17); }
  static long step   (long s, long i){ return (s * 1000003L + i - (i >> 2)) ^ (s >>> 17); }
  static long jitCallLoop(long n){ long s = 1; for (long i = 1; i <= n; i++) s = jitStep(s, i); return s; }
  static long callLoop   (long n){ long s = 1; for (long i = 1; i <= n; i++) s = step(s, i); return s; }

  static long bestCallMs(boolean jit, long n, int reps){
    long best = Long.MAX_VALUE, sink = 0;
    for (int r = 0; r < reps; r++){
      long t = System.nanoTime();
      long c = jit ? jitCallLoop(n) : callLoop(n);
      long e = System.nanoTime() - t;
      sink ^= c; if (e < best) best = e;
    }
    if (sink == 42) System.out.print("");
    return best / 1000000;
  }

  static long bestMs(boolean jit, long n, int reps){
    long best = Long.MAX_VALUE, sink = 0;
    for (int r = 0; r < reps; r++){
      long t = System.nanoTime();
      long c = jit ? jitKernel(n) : kernel(n);
      long e = System.nanoTime() - t;
      sink ^= c; if (e < best) best = e;
    }
    if (sink == 42) System.out.print("");   // keep the JIT from eliding the calls
    return best / 1000000;                    // ns -> ms (best-of, integer ms)
  }

  public static void main(String[] a){
    long n = a.length > 0 ? Long.parseLong(a[0]) : 4_000_000L;
    int reps = a.length > 1 ? Integer.parseInt(a[1]) : 3;
    for (int w = 0; w < 300; w++){ jitKernel(2000); kernel(2000); jitCallLoop(2000); callLoop(2000); }  // warm up (compile)
    long jit  = bestMs(true,  n, reps);
    long itp  = bestMs(false, n, reps);
    long cjit = bestCallMs(true,  n, reps);
    long citp = bestCallMs(false, n, reps);
    System.out.println("PERF n=" + n + " reps=" + reps
      + " | COMPUTE jit_ms=" + jit + " interp_ms=" + itp
      + " | CALL jit_ms=" + cjit + " interp_ms=" + citp
      + " chk=" + Long.toHexString(kernel(1000)) + "/" + Long.toHexString(callLoop(1000)));
    System.out.println("ALL PASS");
  }
}

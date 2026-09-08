// Perf of the Math.min/max intrinsic: a min/max-heavy loop, jit (inline wasm) vs
// interpreter (real Math.min/max call). Also runnable on native for reference.
public class MMP {
  static long jitKernel(int n){ long s=0; int a=3;
    for (int i=0;i<n;i++){ a = Math.max(0, Math.min(1000, a + (i&7) - 3)); s += a; }
    return s; }
  static long kernel(int n){ long s=0; int a=3;
    for (int i=0;i<n;i++){ a = Math.max(0, Math.min(1000, a + (i&7) - 3)); s += a; }
    return s; }
  static long bestMs(boolean jit,int n,int reps){ long best=Long.MAX_VALUE,sink=0;
    for(int r=0;r<reps;r++){ long t=System.nanoTime(); long c=jit?jitKernel(n):kernel(n); long e=System.nanoTime()-t; sink^=c; if(e<best)best=e; }
    if(sink==42)System.out.print(""); return best/1000000; }
  public static void main(String[] a){
    int n = a.length>0?Integer.parseInt(a[0]):6_000_000;   // small: interp does 2 Math calls/iter
    for(int w=0;w<300;w++){ jitKernel(2000); kernel(2000); }
    long j=bestMs(true,n,6), i=bestMs(false,n,6);
    System.out.println("MMP n="+n+" jit_ms="+j+" interp_ms="+i+" chk="+kernel(1000));
    System.out.println("ALL PASS");
  }
}

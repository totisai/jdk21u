// OSR: sum() is called ONCE but loops millions of times. Under threshold compilation it
// never entry-compiles (call count stays 1), so the hot back-edge triggers on-stack
// replacement: the interpreter enters the JIT'd body at the loop head with the current
// locals. formula() is closed-form (no loop -> no OSR) -> an independent oracle.
public class OsrCheck {
  static long sum(int n){ long s=0; for(int i=0;i<n;i++) s += (long)i*2 - (i%3); return s; }
  static long formula(int n){ long a=(long)n*(n-1); long m=(long)(n/3)*3 + (n%3==2?1:0); return a-m; }
  public static void main(String[] x){
    int n = 3_000_000;
    long r = sum(n), e = formula(n);
    System.out.println("r="+r+" e="+e);
    System.out.println(r==e?"ALL PASS":"FAILURES=1");
  }
}

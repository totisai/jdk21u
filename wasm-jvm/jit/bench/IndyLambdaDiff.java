// invokedynamic for lambda capture: the LambdaMetafactory bootstrap runs on first
// (interpreted) resolution; the JIT then calls the resolved adapter that builds the
// lambda instance. jitMake creates a capturing lambda and invokes it.
public class IL {
  interface Op { int apply(int v); }
  static int jitMake(int cap, int x){ Op f = v -> v*cap + 1; return f.apply(x); } // indy(create) + invoke
  static int pMake  (int cap, int x){ Op f = v -> v*cap + 1; return f.apply(x); }
  static int fail=0;
  public static void main(String[] a){
    for (int k=0;k<80;k++) if (jitMake(3,k)!=pMake(3,k)) fail++;
    System.out.println("make="+jitMake(3,10)); // 10*3+1=31
    System.out.println(fail==0?"ALL PASS":"FAILURES="+fail);
  }
}

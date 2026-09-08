// invokestatic-object-arg GC-safety: a JIT'd method passes a heap oop to a static callee
// in a 2M loop under concurrent System.gc(). invoke_common Handle-izes the oop arg; a
// moving GC must not corrupt it. Sum must be exact.
public class SAG {
  static class Box { int v; Box(int v){ this.v=v; } }
  static int read(Box o){ return o.v; }                    // static, object arg
  static long jitLoop(Box b, int n){ long s=0; for(int i=0;i<n;i++) s += read(b); return s; }
  public static void main(String[] a) throws Exception {
    Box b = new Box(7);
    Thread gc=new Thread(()->{ for(int i=0;i<4000;i++){ System.gc();
      try{Thread.sleep(0,100000);}catch(InterruptedException e){} } }); gc.setDaemon(true); gc.start();
    long r = jitLoop(b, 2_000_000);
    System.out.println("s="+r+" expect="+(7L*2_000_000));
    System.out.println(r==7L*2_000_000?"ALL PASS":"FAILURES=1");
  }
}
